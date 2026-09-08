/**
 * Faktura-import worker. Kaldes hvert minut af pg_cron (sender anon-key som
 * apikey-header) — accepteres også med service-role for manuelle test-kald.
 *
 * Klienten har parset filen og uploadet rålinje-chunks i invoice-uploads
 * bucket: {jobId}/lines-{idx}.json.
 *
 * Faser pr. tick (én job ad gangen):
 *   lines     → indsæt rålinjer i invoice_lines
 *   prune     → slet gamle rålinjer i filens datointerval, måned for måned
 *   aggregate → genberegn sales_monthly / sales_monthly_products /
 *               sales_top_products i databasen, én måned pr. iteration
 *   relink    → kobl salgsrækker til lokation/virksomhed
 *   done
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  insertInvoiceLinesChunk,
  countInvoiceLines,
  monthsInRange,
} from "@/lib/invoice-import.server";

const MAX_ATTEMPTS = 5;
// Rå fakturalinjer: 5.000 pr. chunk (SKAL matche klienten).
const LINES_CHUNK_SIZE = 5_000;
// Tidsbudget pr. tick: vi fortsætter med flere chunks/måneder i samme kald,
// indtil budgettet er brugt. 45 s holder os under platformens timeout på
// requestet, og fremdriften gemmes efter hver chunk, så et afbrudt tick
// genoptages præcis hvor det slap.
const TICK_BUDGET_MS = 45_000;
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
            "id, phase, attempts, aggregated_path, total_lines, saved_lines, lines_deleted, prune_month_idx, aggregate_month_idx, months_rebuilt, lines_batch_id, lines_date_from, lines_date_to, lines_afdelinger",
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
          const phase = job.phase as string;

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
              await supabaseAdmin
                .from("invoice_import_jobs")
                .update({ phase: "aggregate", status: "queued", attempts: 0 })
                .eq("id", jobId);
              return Response.json({ processed: 0, jobId, phase: "prune", next: "aggregate" });
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
              idx++;
              await supabaseAdmin
                .from("invoice_import_jobs")
                .update({ prune_month_idx: idx, lines_deleted: deleted })
                .eq("id", jobId);
            }
            const np = idx >= months.length ? "aggregate" : "prune";
            await supabaseAdmin
              .from("invoice_import_jobs")
              .update({
                prune_month_idx: idx,
                lines_deleted: deleted,
                phase: np,
                status: "queued",
                attempts: 0,
                last_error: null,
              })
              .eq("id", jobId);
            return Response.json({ processed: deleted, jobId, phase: "prune", next: np });
          }

          // ---- Fase 3: genberegn aggregater fra rålinjerne, én måned pr. iteration ----
          if (phase === "aggregate") {
            const from = job.lines_date_from as string | null;
            const to = job.lines_date_to as string | null;
            const afdelinger = (job.lines_afdelinger as number[]) ?? [];
            if (!from || !to) {
              await supabaseAdmin
                .from("invoice_import_jobs")
                .update({ phase: "relink", status: "queued", attempts: 0 })
                .eq("id", jobId);
              return Response.json({ jobId, phase: "aggregate", next: "relink" });
            }
            const months = monthsInRange(from, to);
            let idx = (job.aggregate_month_idx as number) ?? 0;
            let rebuilt = (job.months_rebuilt as number) ?? 0;
            while (idx < months.length && hasBudget()) {
              const month = months[idx];
              const isLast = idx === months.length - 1;
              const { error: aggErr } = await supabaseAdmin.rpc("rebuild_sales_aggregates", {
                _from: month,
                _to: month,
                _kun_afdelinger: afdelinger.length ? afdelinger : undefined,
                // Top-varelisten er rullende 12 mdr. — beregnes én gang til sidst.
                _med_top: isLast,
              });
              if (aggErr) throw new Error("rebuild_sales_aggregates: " + aggErr.message);
              idx++;
              rebuilt++;
              await supabaseAdmin
                .from("invoice_import_jobs")
                .update({ aggregate_month_idx: idx, months_rebuilt: rebuilt })
                .eq("id", jobId);
            }
            const np = idx >= months.length ? "relink" : "aggregate";
            await supabaseAdmin
              .from("invoice_import_jobs")
              .update({
                aggregate_month_idx: idx,
                months_rebuilt: rebuilt,
                phase: np,
                status: "queued",
                attempts: 0,
                last_error: null,
              })
              .eq("id", jobId);
            return Response.json({ jobId, phase: "aggregate", monthsRebuilt: rebuilt, next: np });
          }

          // ---- Fase 4: kobl salgsrækker til lokation/virksomhed + afslut ----
          if (phase === "relink") {
            // Koble salgsrækker til lokation/virksomhed ud fra
            // (afdeling_nr, visma_delivery_no) — historikken skal med.
            const { error: relinkErr } = await supabaseAdmin.rpc("relink_sales_locations");
            if (relinkErr) {
              console.error("[invoice-import] relink_sales_locations fejlede:", relinkErr);
            }
            // Genberegn kundestatus ud fra den friske sales_monthly.
            const { error: recomputeErr } = await supabaseAdmin.rpc(
              "recompute_all_company_statuses",
            );
            if (recomputeErr) {
              console.error(
                "[invoice-import] recompute_all_company_statuses fejlede:",
                recomputeErr,
              );
            }
            // Ryd chunk-filerne op.
            const linesCount = Math.ceil((job.total_lines ?? 0) / LINES_CHUNK_SIZE);
            const allChunks: string[] = [];
            for (let i = 0; i < linesCount; i++) allChunks.push(`${prefix}/lines-${i}.json`);
            if (allChunks.length) {
              await supabaseAdmin.storage.from(BUCKET).remove(allChunks);
            }
            await supabaseAdmin
              .from("invoice_import_jobs")
              .update({
                phase: "done",
                status: "completed",
                finished_at: new Date().toISOString(),
                attempts: 0,
                last_error: recomputeErr
                  ? "Kundestatus blev ikke genberegnet: " +
                    String(recomputeErr.message ?? recomputeErr).slice(0, 1000)
                  : relinkErr
                    ? "Kobling af salgsrækker fejlede: " +
                      String(relinkErr.message ?? relinkErr).slice(0, 1000)
                    : null,
              })
              .eq("id", jobId);
            return Response.json({ jobId, phase: "done", status: "completed" });
          }

          throw new Error(
            "Ukendt phase: " + phase + " (forventede lines|prune|aggregate|relink|done)",
          );
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
