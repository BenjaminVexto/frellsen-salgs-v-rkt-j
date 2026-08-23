/**
 * CVR P-enhed-synkroniseringskø — worker endpoint.
 * Kaldes hvert minut af pg_cron. Plukker 1 pending job (kaldene er tunge),
 * markerer det 'processing', synkroniserer P-enheder og markerer
 * 'done' eller 'failed'. Max 3 forsøg pr. job.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncPenhederByCvrs } from "@/lib/cvr-penhed-sync.server";

const MAX_ATTEMPTS = 3;
const BATCH_PER_TICK = 2;

export const Route = createFileRoute("/api/public/hooks/process-penhed-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          null;
        const anon =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const ok = !!provided && (provided === anon || provided === service);
        if (!ok) return new Response("Unauthorized", { status: 401 });

        // Genopret hængende jobs før nye plukkes.
        // Jobs under 3 forsøg og >10 min 'processing' → 'pending' (reclaim).
        // Jobs med ≥3 forsøg og stadig hængende → 'failed' (opgivet).
        await supabaseAdmin.rpc("reclaim_hanging_penhed_jobs").rpc;
        // Fald tilbage på direkte updates hvis funktionen ikke findes.
        await supabaseAdmin
          .from("cvr_penhed_sync_jobs")
          .update({ status: "pending", started_at: null })
          .eq("status", "processing")
          .lt("started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
          .lt("attempts", MAX_ATTEMPTS);
        await supabaseAdmin
          .from("cvr_penhed_sync_jobs")
          .update({ status: "failed", last_error: "timeout/hængende job" })
          .eq("status", "processing")
          .lt("started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
          .gte("attempts", MAX_ATTEMPTS);

        const { data: candidates, error: selErr } = await supabaseAdmin
          .from("cvr_penhed_sync_jobs")
          .select("id")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(BATCH_PER_TICK);
        if (selErr) return Response.json({ error: selErr.message }, { status: 500 });
        if (!candidates?.length) {
          return Response.json({ processed: 0, message: "ingen pending jobs" });
        }
        const ids = candidates.map((c: any) => c.id as string);

        const { data: claimed, error: claimErr } = await supabaseAdmin
          .from("cvr_penhed_sync_jobs")
          .update({ status: "processing", started_at: new Date().toISOString() })
          .in("id", ids)
          .eq("status", "pending")
          .select("id, cvrs, attempts");
        if (claimErr) return Response.json({ error: claimErr.message }, { status: 500 });
        if (!claimed?.length) {
          return Response.json({ processed: 0, message: "ingen jobs claimet" });
        }

        const results: Array<{
          id: string;
          status: string;
          synced?: number;
          error?: string;
        }> = [];
        for (const job of claimed as any[]) {
          const jobId = job.id as string;
          const cvrs = (job.cvrs as string[]) ?? [];
          const attempts = (job.attempts as number) ?? 0;
          try {
            const res = await syncPenhederByCvrs(cvrs);
            if (res.error) throw new Error(res.error);
            await supabaseAdmin
              .from("cvr_penhed_sync_jobs")
              .update({
                status: "done",
                synced_count: res.synced,
                finished_at: new Date().toISOString(),
                attempts: attempts + 1,
              })
              .eq("id", jobId);
            results.push({ id: jobId, status: "done", synced: res.synced });
          } catch (e: any) {
            const newAttempts = attempts + 1;
            const finalStatus = newAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
            await supabaseAdmin
              .from("cvr_penhed_sync_jobs")
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

        return Response.json({ processed: results.length, results });
      },
    },
  },
});
