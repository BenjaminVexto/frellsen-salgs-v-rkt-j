/**
 * CVR-berigelseskø — worker endpoint.
 * Kaldes hvert minut af pg_cron. Plukker op til 3 pending jobs,
 * markerer dem 'processing', kalder CVR-API'et, og markerer dem
 * 'done' eller 'failed'. Max 3 forsøg pr. job.
 *
 * Auth: kun et lille shared signal via apikey-header der matcher
 * Supabase publishable key (samme mønster som andre /api/public/*).
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enrichCompaniesByIds } from "@/lib/cvr-enrichment.server";

const MAX_ATTEMPTS = 3;
const BATCH_PER_TICK = 3;

export const Route = createFileRoute("/api/public/hooks/process-cvr-enrichment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        // 1) Find op til N pending jobs.
        const { data: candidates, error: selErr } = await supabaseAdmin
          .from("cvr_enrichment_jobs")
          .select("id")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(BATCH_PER_TICK);
        if (selErr) {
          return Response.json(
            { error: selErr.message },
            { status: 500 },
          );
        }
        if (!candidates?.length) {
          return Response.json({ processed: 0, message: "ingen pending jobs" });
        }
        const ids = candidates.map((c: any) => c.id as string);

        // 2) Markér som processing — kun de rækker der stadig er pending.
        const { data: claimed, error: claimErr } = await supabaseAdmin
          .from("cvr_enrichment_jobs")
          .update({
            status: "processing",
            started_at: new Date().toISOString(),
          })
          .in("id", ids)
          .eq("status", "pending")
          .select("id, company_ids, attempts");
        if (claimErr) {
          return Response.json(
            { error: claimErr.message },
            { status: 500 },
          );
        }
        if (!claimed?.length) {
          return Response.json({ processed: 0, message: "ingen jobs claimet" });
        }

        // 3) Kør berigelse pr. job.
        const results: Array<{ id: string; status: string; enriched?: number; error?: string }> = [];
        for (const job of claimed as any[]) {
          const jobId = job.id as string;
          const companyIds = (job.company_ids as string[]) ?? [];
          const attempts = (job.attempts as number) ?? 0;
          try {
            const res = await enrichCompaniesByIds(companyIds);
            if (res.error) throw new Error(res.error);
            await supabaseAdmin
              .from("cvr_enrichment_jobs")
              .update({
                status: "done",
                enriched_count: res.enriched,
                finished_at: new Date().toISOString(),
                attempts: attempts + 1,
              })
              .eq("id", jobId);
            results.push({ id: jobId, status: "done", enriched: res.enriched });
          } catch (e: any) {
            const newAttempts = attempts + 1;
            const finalStatus = newAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
            await supabaseAdmin
              .from("cvr_enrichment_jobs")
              .update({
                status: finalStatus,
                attempts: newAttempts,
                last_error: String(e?.message ?? e).slice(0, 2000),
                finished_at:
                  finalStatus === "failed" ? new Date().toISOString() : null,
                started_at: null,
              })
              .eq("id", jobId);
            results.push({
              id: jobId,
              status: finalStatus,
              error: String(e?.message ?? e),
            });
          }
        }

        return Response.json({
          processed: results.length,
          results,
        });
      },
    },
  },
});
