/**
 * Faktura-import worker. Kaldes hvert minut af pg_cron (sender anon-key som
 * apikey-header) — accepteres også med service-role for manuelle test-kald.
 *
 * Klienten har allerede parset, location-resolvet og uploadet chunk-filer i
 * invoice-uploads bucket: {jobId}/monthly-{idx}.json og top-{idx}.json.
 * Workeren downloader én chunk pr. tick og upserter den.
 *
 * Faser pr. tick (én job ad gangen):
 *   monthly → upsert næste chunk; når saved_monthly >= total_monthly → phase=top
 *   top     → upsert næste chunk; når saved_top >= total_top → status=completed
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  upsertMonthlySlice,
  upsertTopSlice,
  upsertTopMonthlySlice,
  insertInvoiceLinesChunk,
  countInvoiceLines,
  monthsInRange,
} from "@/lib/invoice-import.server";

const MAX_ATTEMPTS = 5;
const CHUNK_SIZE = 20_000; // SKAL matche klientens chunk-størrelse
// Varelinjer pr. måned upsertes i mindre chunks — den tabel er tungest og
// ramte tidligere Postgres' statement timeout ved 20k rækker.
const TOP_MONTHLY_CHUNK_SIZE = 4_000;
// Rå fakturalinjer: 5.000 pr. chunk (SKAL matche klienten).
const LINES_CHUNK_SIZE = 5_000;
// Tidsbudget pr. tick: vi fortsætter med flere chunks/måneder i samme kald,
// indtil budgettet er brugt. 45 s holder os under platformens timeout på
// requestet, og fremdriften gemmes efter hver chunk, så et afbrudt tick
// genoptages præcis hvor det slap.
const TICK_BUDGET_MS = 45_000;
// Sletning af gamle rålinjer sker måned for måned — flere måneder pr. tick,
// men aldrig i én sætning, så vi ikke rammer statement timeout.
const BUCKET = "invoice-uploads";



function isAuthorized(provided: string | null): boolean {
  if (!provided) return false;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return provided === anon || provided === service;
}

export const Route = createFileRoute("/api/public/hooks/process-invoice-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Tidsstempel FØR alt arbejde — bruges som budget i alle faseløkker.
        const tickStart = Date.now();
        const hasBudget = () => Date.now() - tickStart < TICK_BUDGET_MS;

        const provided =
          request.headers.get("apikey") ??
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          null;
        if (!isAuthorized(provided)) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Pluk 1 job: queued eller running, ikke færdig
        const { data: candidates, error: selErr } = await supabaseAdmin
          .from("invoice_import_jobs")
          .select(
            "id, phase, attempts, aggregated_path, saved_monthly, saved_top, saved_top_monthly, total_monthly, total_top, total_top_monthly, total_lines, saved_lines, lines_deleted, prune_month_idx, lines_batch_id, lines_date_from, lines_date_to, lines_afdelinger",
          )
          .in("status", ["queued", "running"])
          .neq("phase", "done")
          .order("created_at", { ascending: true })
          .limit(1);
        if (selErr) return Response.json({ error: selErr.message }, { status: 500 });
        if (!candidates?.length) return Response.json({ processed: 0, message: "ingen jobs" });

        const job = candidates[0] as any;
        const jobId = job.id as string;
        const attempts = (job.attempts as number) ?? 0;
        const prefix = (job.aggregated_path as string) ?? jobId;

        // Claim som running
        const { error: claimErr } = await supabaseAdmin
          .from("invoice_import_jobs")
          .update({ status: "running", started_at: new Date().toISOString() })
          .eq("id", jobId);
        if (claimErr) return Response.json({ error: claimErr.message }, { status: 500 });

        try {
          // Find ud af hvilken chunk vi mangler
          let phase = job.phase as string;

          /** Første aggregatfase efter rålinjer + oprydning. */
          const firstAggregatePhase = (): string => {
            if ((job.total_monthly as number) > 0) return "monthly";
            if ((job.total_top as number) > 0) return "top";
            if ((job.total_top_monthly as number) > 0) return "top_monthly";
            return "done";
          };

          // ---- Fase 1: rå fakturalinjer ----
          if (phase === "lines") {
            const batchId = job.lines_batch_id as string | null;
            if (!batchId) throw new Error("lines_batch_id mangler på jobbet");
            const totalLines = (job.total_lines as number) ?? 0;
            // Vandmærke fra databasen selv → en fejlet chunk kan køres igen
            // uden dubletter og uden at starte forfra.
            let already = await countInvoiceLines(supabaseAdmin, batchId);
            let processed = 0;
            let chunks = 0;
            // Flere chunks pr. tick, indtil fasen er færdig eller budgettet er brugt.
            while (already < totalLines && hasBudget()) {
              const chunkIdx = Math.floor(already / LINES_CHUNK_SIZE);
              const offsetInChunk = already - chunkIdx * LINES_CHUNK_SIZE;
              const path = `${prefix}/lines-${chunkIdx}.json`;
              const { data: blob, error: dlErr } = await supabaseAdmin.storage
                .from(BUCKET)
                .download(path);
              if (dlErr || !blob) throw new Error(`kunne ikke hente ${path}: ${dlErr?.message}`);
              const rows = JSON.parse(await blob.text()) as any[];
              const inserted = await insertInvoiceLinesChunk(
                supabaseAdmin,
                batchId,
                rows,
                offsetInChunk,
              );
              already += inserted;
              processed += inserted;
              chunks++;
              // Fremdrift gemmes efter HVER chunk → afbrydelse midt i løkken
              // genoptages præcis hvor den slap.
              await supabaseAdmin
                .from("invoice_import_jobs")
                .update({
                  saved_lines: already,
                  phase: already >= totalLines ? "prune" : "lines",
                  status: "queued",
                  attempts: 0,
                  last_error: null,
                })
                .eq("id", jobId);
              // Ingen fremdrift på denne chunk → undgå uendelig løkke.
              if (inserted === 0) break;
            }
            if (already >= totalLines) {
              await supabaseAdmin
                .from("invoice_import_jobs")
                .update({ phase: "prune", saved_lines: already, status: "queued", attempts: 0 })
                .eq("id", jobId);
              return Response.json({ processed, chunks, jobId, phase: "lines", next: "prune" });
            }
            return Response.json({ processed, chunks, jobId, phase: "lines", savedNow: already });
          }


          // ---- Fase 2: ryd gamle rålinjer, måned for måned ----
          if (phase === "prune") {
            const batchId = job.lines_batch_id as string | null;
            const from = job.lines_date_from as string | null;
            const to = job.lines_date_to as string | null;
            const afdelinger = (job.lines_afdelinger as number[]) ?? [];
            if (!batchId || !from || !to || !afdelinger.length) {
              const np = firstAggregatePhase();
              await supabaseAdmin
                .from("invoice_import_jobs")
                .update({ phase: np, status: np === "done" ? "completed" : "queued", attempts: 0 })
                .eq("id", jobId);
              return Response.json({ processed: 0, jobId, phase: "prune", next: np });
            }
            const months = monthsInRange(from, to);
            let idx = (job.prune_month_idx as number) ?? 0;
            let deleted = (job.lines_deleted as number) ?? 0;
            // Flere måneder pr. tick, indtil intervallet er ryddet eller
            // tidsbudgettet er brugt. prune_month_idx gemmes efter hver måned.
            while (idx < months.length && hasBudget()) {
              const { data: n, error: pErr } = await supabaseAdmin.rpc("prune_invoice_lines_month", {
                _batch_id: batchId,
                _afdelinger: afdelinger,
                _month_start: months[idx],
                _from: from,
                _to: to,
              });
              if (pErr) throw new Error("prune_invoice_lines_month: " + pErr.message);
              deleted += (n as number) ?? 0;
            }
            const prunedAll = idx >= months.length;
            const np = prunedAll ? firstAggregatePhase() : "prune";
            await supabaseAdmin
              .from("invoice_import_jobs")
              .update({
                prune_month_idx: idx,
                lines_deleted: deleted,
                phase: np,
                status: np === "done" ? "completed" : "queued",
                attempts: 0,
                last_error: null,
              })
              .eq("id", jobId);
            return Response.json({ processed: deleted, jobId, phase: "prune", next: np });
          }

          if (phase !== "monthly" && phase !== "top" && phase !== "top_monthly") {
            throw new Error("Ukendt phase: " + phase + " (forventede monthly|top|top_monthly)");
          }


          const savedCol =
            phase === "monthly"
              ? "saved_monthly"
              : phase === "top"
                ? "saved_top"
                : "saved_top_monthly";
          const totalCol =
            phase === "monthly"
              ? "total_monthly"
              : phase === "top"
                ? "total_top"
                : "total_top_monthly";
          const chunkPrefix = phase === "top_monthly" ? "top_monthly" : phase;
          const saved = (job[savedCol] as number) ?? 0;
          const total = (job[totalCol] as number) ?? 0;

          function nextPhaseAfter(current: string): string {
            if (current === "monthly") {
              if ((job.total_top as number) > 0) return "top";
              if ((job.total_top_monthly as number) > 0) return "top_monthly";
              return "done";
            }
            if (current === "top") {
              if ((job.total_top_monthly as number) > 0) return "top_monthly";
              return "done";
            }
            return "done";
          }

          if (saved >= total) {
            // intet at gøre i denne fase — flyt videre
            const np = nextPhaseAfter(phase);
            const nextUpdate: any =
              np === "done"
                ? { phase: "done", status: "completed", finished_at: new Date().toISOString() }
                : { phase: np };
            await supabaseAdmin.from("invoice_import_jobs").update(nextUpdate).eq("id", jobId);
            return Response.json({ jobId, advancedTo: nextUpdate.phase });
          }

          const chunkSize = phase === "top_monthly" ? TOP_MONTHLY_CHUNK_SIZE : CHUNK_SIZE;
          const chunkIdx = Math.floor(saved / chunkSize);
          const chunkPath = `${prefix}/${chunkPrefix}-${chunkIdx}.json`;
          const { data: blob, error: dlErr } = await supabaseAdmin.storage
            .from(BUCKET)
            .download(chunkPath);
          if (dlErr || !blob) {
            throw new Error("Kunne ikke hente chunk " + chunkPath + ": " + (dlErr?.message ?? ""));
          }
          const rows = JSON.parse(await blob.text()) as any[];
          const upsertedRows =
            phase === "monthly"
              ? await upsertMonthlySlice(supabaseAdmin, rows)
              : phase === "top"
                ? await upsertTopSlice(supabaseAdmin, rows)
                : await upsertTopMonthlySlice(supabaseAdmin, rows);
          // VIGTIGT: tæl chunk-bredden (rows.length), ikke faktisk upsertede.
          const savedRows = rows.length;
          const newSaved = saved + savedRows;
          const phaseDone = newSaved >= total;

          let nextPhase = phase;
          let nextStatus = "running";
          let finishedAt: string | null = null;

          if (phaseDone) {
            nextPhase = nextPhaseAfter(phase);
            if (nextPhase === "done") {
              nextStatus = "completed";
              finishedAt = new Date().toISOString();
            }
          }

          const updatePayload: any = {
            [savedCol]: newSaved,
            phase: nextPhase,
            status: nextStatus,
            // Nulstil forsøg efter en gennemført chunk, så et langt job ikke
            // bliver markeret failed blot fordi det har kørt mange ticks.
            attempts: 0,
            last_error: null,
          };
          if (finishedAt) updatePayload.finished_at = finishedAt;

          await supabaseAdmin.from("invoice_import_jobs").update(updatePayload).eq("id", jobId);

          // Ryd op når jobbet er færdigt + genberegn kundestatus
          if (nextPhase === "done") {
            const allChunks: string[] = [];
            const monthlyCount = Math.ceil((job.total_monthly ?? 0) / CHUNK_SIZE);
            const topCount = Math.ceil((job.total_top ?? 0) / CHUNK_SIZE);
            const topMonthlyCount = Math.ceil(
              (job.total_top_monthly ?? 0) / TOP_MONTHLY_CHUNK_SIZE,
            );
            for (let i = 0; i < monthlyCount; i++) allChunks.push(`${prefix}/monthly-${i}.json`);
            for (let i = 0; i < topCount; i++) allChunks.push(`${prefix}/top-${i}.json`);
            for (let i = 0; i < topMonthlyCount; i++) allChunks.push(`${prefix}/top_monthly-${i}.json`);
            const linesCount = Math.ceil((job.total_lines ?? 0) / LINES_CHUNK_SIZE);
            for (let i = 0; i < linesCount; i++) allChunks.push(`${prefix}/lines-${i}.json`);
            if (allChunks.length) {
              await supabaseAdmin.storage.from(BUCKET).remove(allChunks);
            }
            // Genberegn last_sales_date / last_consumable_sales_date /
            // has_active_equipment / customer_type for alle firmaer ud fra
            // den friske sales_monthly. Funktionen er sat-baseret og kører på
            // ~8s for 14k firmaer × 233k rækker — ingen chunking nødvendig.
            const { error: recomputeErr } = await supabaseAdmin.rpc(
              "recompute_all_company_statuses",
            );
            if (recomputeErr) {
              console.error("[invoice-import] recompute_all_company_statuses fejlede:", recomputeErr);
              // Synliggør fejlen i UI'et — ikke kun i konsollen.
              await supabaseAdmin
                .from("invoice_import_jobs")
                .update({
                  last_error:
                    "Kundestatus blev ikke genberegnet: " +
                    String(recomputeErr.message ?? recomputeErr).slice(0, 1000),
                })
                .eq("id", jobId);
            }
            // Koble salgsrækker til lokation/virksomhed ud fra
            // (afdeling_nr, visma_delivery_no) — historikken skal med.
            const { error: relinkErr } = await supabaseAdmin.rpc("relink_sales_locations");
            if (relinkErr) {
              console.error("[invoice-import] relink_sales_locations fejlede:", relinkErr);
            }
          }


          return Response.json({
            jobId,
            phase: nextPhase,
            status: nextStatus,
            chunk: chunkIdx,
            chunkSize,
            chunkRows: savedRows,
            upsertedRows,
            [savedCol]: newSaved,
          });
        } catch (e: any) {
          const newAttempts = attempts + 1;
          const finalFailed = newAttempts >= MAX_ATTEMPTS;
          await supabaseAdmin
            .from("invoice_import_jobs")
            .update({
              status: finalFailed ? "failed" : "queued",
              attempts: newAttempts,
              last_error: String(e?.message ?? e).slice(0, 2000),
              finished_at: finalFailed ? new Date().toISOString() : null,
            })
            .eq("id", jobId);
          return Response.json(
            { jobId, error: String(e?.message ?? e), failed: finalFailed },
            { status: 500 },
          );
        }
      },
    },
  },
});
