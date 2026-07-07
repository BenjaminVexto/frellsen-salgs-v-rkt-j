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
} from "@/lib/invoice-import.server";

const MAX_ATTEMPTS = 5;
const CHUNK_SIZE = 20_000; // SKAL matche klientens chunk-størrelse
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
            "id, phase, attempts, aggregated_path, saved_monthly, saved_top, saved_top_monthly, total_monthly, total_top, total_top_monthly",
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
          if (phase !== "monthly" && phase !== "top") {
            throw new Error("Ukendt phase: " + phase + " (forventede monthly|top)");
          }

          const savedCol = phase === "monthly" ? "saved_monthly" : "saved_top";
          const totalCol = phase === "monthly" ? "total_monthly" : "total_top";
          const saved = (job[savedCol] as number) ?? 0;
          const total = (job[totalCol] as number) ?? 0;

          if (saved >= total) {
            // intet at gøre i denne fase — flyt videre
            const nextUpdate: any =
              phase === "monthly"
                ? { phase: "top" }
                : {
                    phase: "done",
                    status: "completed",
                    finished_at: new Date().toISOString(),
                  };
            await supabaseAdmin.from("invoice_import_jobs").update(nextUpdate).eq("id", jobId);
            return Response.json({ jobId, advancedTo: nextUpdate.phase });
          }

          const chunkIdx = Math.floor(saved / CHUNK_SIZE);
          const chunkPath = `${prefix}/${phase}-${chunkIdx}.json`;
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
              : await upsertTopSlice(supabaseAdmin, rows);
          // VIGTIGT: tæl chunk-bredden (rows.length), ikke faktisk upsertede.
          // onConflict kan reducere upsertedRows < CHUNK_SIZE ved dubletter,
          // hvilket ville få chunkIdx = floor(saved/CHUNK_SIZE) ud af sync
          // (samme chunk hentes igen → uendelig løkke, eller chunk springes over).
          const savedRows = rows.length;
          const newSaved = saved + savedRows;
          const phaseDone = newSaved >= total;

          let nextPhase = phase;
          let nextStatus = "running";
          let finishedAt: string | null = null;

          if (phaseDone && phase === "monthly") {
            nextPhase = job.total_top > 0 ? "top" : "done";
            if (nextPhase === "done") {
              nextStatus = "completed";
              finishedAt = new Date().toISOString();
            }
          } else if (phaseDone && phase === "top") {
            nextPhase = "done";
            nextStatus = "completed";
            finishedAt = new Date().toISOString();
          }

          const updatePayload: any = {
            [savedCol]: newSaved,
            phase: nextPhase,
            status: nextStatus,
            attempts: attempts + 1,
            last_error: null,
          };
          if (finishedAt) updatePayload.finished_at = finishedAt;

          await supabaseAdmin.from("invoice_import_jobs").update(updatePayload).eq("id", jobId);

          // Ryd op når jobbet er færdigt + genberegn kundestatus
          if (nextPhase === "done") {
            const allChunks: string[] = [];
            const monthlyCount = Math.ceil((job.total_monthly ?? 0) / CHUNK_SIZE);
            const topCount = Math.ceil((job.total_top ?? 0) / CHUNK_SIZE);
            for (let i = 0; i < monthlyCount; i++) allChunks.push(`${prefix}/monthly-${i}.json`);
            for (let i = 0; i < topCount; i++) allChunks.push(`${prefix}/top-${i}.json`);
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
            }
          }


          return Response.json({
            jobId,
            phase: nextPhase,
            status: nextStatus,
            chunk: chunkIdx,
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
