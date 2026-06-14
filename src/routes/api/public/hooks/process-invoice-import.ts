/**
 * Faktura-import worker. Kaldes hvert minut af pg_cron.
 * Faser pr. tick (én job ad gangen — heavy parse):
 *   uploaded  → download xlsx, parse, resolve delivery_nos, gem aggregeret JSON,
 *               sæt total_monthly/total_top, phase=monthly
 *   monthly   → læs aggregeret JSON, upsert næste 20.000 monthly-rækker
 *   top       → upsert næste 20.000 top-vare-rækker, derefter status=completed
 *
 * Auth: apikey-header skal matche SUPABASE_SERVICE_ROLE_KEY (samme mønster som CVR).
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  parseAndResolve,
  upsertMonthlySlice,
  upsertTopSlice,
  type AggregatedPayload,
} from "@/lib/invoice-import.server";

const MAX_ATTEMPTS = 3;
const ROWS_PER_TICK = 20_000;
const BUCKET = "invoice-uploads";

export const Route = createFileRoute("/api/public/hooks/process-invoice-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("x-cron-secret") ?? request.headers.get("apikey");
        const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Plukker 1 job: pending eller running (kommet i gang men har endnu en fase)
        const { data: candidates, error: selErr } = await supabaseAdmin
          .from("invoice_import_jobs")
          .select("id, phase, attempts, file_path, aggregated_path, saved_monthly, saved_top, total_monthly, total_top")
          .in("status", ["pending", "running"])
          .neq("phase", "done")
          .order("created_at", { ascending: true })
          .limit(1);
        if (selErr) return Response.json({ error: selErr.message }, { status: 500 });
        if (!candidates?.length) return Response.json({ processed: 0, message: "ingen jobs" });

        const job = candidates[0] as any;
        const jobId = job.id as string;
        const attempts = (job.attempts as number) ?? 0;

        // Markér running (claim)
        const { error: claimErr } = await supabaseAdmin
          .from("invoice_import_jobs")
          .update({ status: "running", started_at: new Date().toISOString() })
          .eq("id", jobId);
        if (claimErr) return Response.json({ error: claimErr.message }, { status: 500 });

        try {
          if (job.phase === "uploaded") {
            if (!job.file_path) throw new Error("file_path mangler på job");
            const payload = await parseAndResolve(supabaseAdmin, BUCKET, job.file_path);

            // Gem aggregeret payload som JSON i samme bucket
            const aggPath = `${jobId}/aggregated.json`;
            const json = JSON.stringify(payload);
            const { error: upErr } = await supabaseAdmin.storage
              .from(BUCKET)
              .upload(aggPath, new Blob([json], { type: "application/json" }), {
                upsert: true,
                contentType: "application/json",
              });
            if (upErr) throw new Error("Kunne ikke gemme aggregeret JSON: " + upErr.message);

            await supabaseAdmin
              .from("invoice_import_jobs")
              .update({
                aggregated_path: aggPath,
                total_monthly: payload.monthly.length,
                total_top: payload.topProducts.length,
                locations_matched: payload.matched,
                unmatched_delivery_nos: payload.unmatched.slice(0, 200),
                phase: "monthly",
                attempts: attempts + 1,
                last_error: null,
              })
              .eq("id", jobId);

            return Response.json({
              jobId,
              phase: "monthly",
              total_monthly: payload.monthly.length,
              total_top: payload.topProducts.length,
            });
          }

          if (job.phase === "monthly" || job.phase === "top") {
            if (!job.aggregated_path) throw new Error("aggregated_path mangler");
            const { data: blob, error: dlErr } = await supabaseAdmin.storage
              .from(BUCKET)
              .download(job.aggregated_path);
            if (dlErr || !blob) throw new Error("Kunne ikke hente aggregeret JSON: " + (dlErr?.message ?? ""));
            const payload = JSON.parse(await blob.text()) as AggregatedPayload;

            if (job.phase === "monthly") {
              const start = (job.saved_monthly as number) ?? 0;
              const slice = payload.monthly.slice(start, start + ROWS_PER_TICK);
              const saved = await upsertMonthlySlice(supabaseAdmin, slice);
              const newSaved = start + saved;
              const done = newSaved >= payload.monthly.length;
              await supabaseAdmin
                .from("invoice_import_jobs")
                .update({
                  saved_monthly: newSaved,
                  phase: done ? "top" : "monthly",
                  attempts: attempts + 1,
                  last_error: null,
                })
                .eq("id", jobId);
              return Response.json({ jobId, phase: done ? "top" : "monthly", saved_monthly: newSaved });
            }

            // phase === 'top'
            const start = (job.saved_top as number) ?? 0;
            const slice = payload.topProducts.slice(start, start + ROWS_PER_TICK);
            const saved = await upsertTopSlice(supabaseAdmin, slice);
            const newSaved = start + saved;
            const done = newSaved >= payload.topProducts.length;
            await supabaseAdmin
              .from("invoice_import_jobs")
              .update({
                saved_top: newSaved,
                phase: done ? "done" : "top",
                status: done ? "completed" : "running",
                attempts: attempts + 1,
                last_error: null,
                finished_at: done ? new Date().toISOString() : null,
              })
              .eq("id", jobId);

            // Ryd op: slet uploadede filer når jobbet er færdigt
            if (done) {
              await supabaseAdmin.storage
                .from(BUCKET)
                .remove([job.file_path, job.aggregated_path].filter(Boolean));
            }
            return Response.json({ jobId, phase: done ? "done" : "top", saved_top: newSaved });
          }

          throw new Error("Ukendt phase: " + job.phase);
        } catch (e: any) {
          const newAttempts = attempts + 1;
          const finalFailed = newAttempts >= MAX_ATTEMPTS;
          await supabaseAdmin
            .from("invoice_import_jobs")
            .update({
              status: finalFailed ? "failed" : "pending",
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
