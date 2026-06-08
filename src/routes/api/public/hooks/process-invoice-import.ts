/**
 * Background worker for Visma invoice import.
 *
 * Triggered (fire-and-forget) from startInvoiceImportJob, and may also re-trigger
 * itself between batches to avoid hitting the worker request timeout on huge files.
 *
 * Auth: server-only shared secret (SUPABASE_SERVICE_ROLE_KEY) via x-cron-secret header.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHUNK_SIZE = 500;
// Number of chunks to process per worker invocation before re-triggering self.
// Keeps each invocation well under the worker request timeout.
const CHUNKS_PER_INVOCATION = 30;

type MonthlyRow = {
  visma_delivery_no: string;
  period: string;
  product_group_1: string;
  revenue: number;
  quantity: number;
  contribution: number;
  order_count: number;
};
type TopProductRow = {
  visma_delivery_no: string;
  varenr: string;
  description: string;
  revenue: number;
  quantity: number;
};

async function reTrigger(jobId: string, host: string, secret: string) {
  const proto = host.includes("localhost") ? "http" : "https";
  const url = `${proto}://${host}/api/public/hooks/process-invoice-import`;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": secret },
    body: JSON.stringify({ jobId }),
  }).catch((e) => console.error("[invoice-import] re-trigger failed", e));
}

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

        const { jobId } = (await request.json()) as { jobId?: string };
        if (!jobId) return new Response("jobId mangler", { status: 400 });

        const host = request.headers.get("host") ?? "";

        // Load job
        const { data: job, error: jobErr } = await supabaseAdmin
          .from("invoice_import_jobs")
          .select("*")
          .eq("id", jobId)
          .maybeSingle();
        if (jobErr || !job) {
          return Response.json({ error: jobErr?.message ?? "ikke fundet" }, { status: 404 });
        }
        if (job.status === "completed" || job.status === "failed") {
          return Response.json({ status: job.status });
        }

        const payloadPath = (job as any).payload_path as string | null;
        if (!payloadPath) {
          await supabaseAdmin
            .from("invoice_import_jobs")
            .update({ status: "failed", error_message: "payload_path mangler" })
            .eq("id", jobId);
          return Response.json({ error: "payload_path mangler" }, { status: 500 });
        }

        async function loadPayload() {
          const { data: blob, error } = await supabaseAdmin.storage
            .from("invoice-imports")
            .download(payloadPath!);
          if (error || !blob) throw new Error("Kunne ikke hente payload: " + (error?.message ?? ""));
          const text = await blob.text();
          return JSON.parse(text) as {
            monthly: Array<MonthlyRow & { location_id?: string; company_id?: string | null }>;
            topProducts: Array<TopProductRow & { location_id?: string }>;
          };
        }

        async function savePayload(obj: unknown) {
          const { error } = await supabaseAdmin.storage
            .from("invoice-imports")
            .upload(payloadPath!, JSON.stringify(obj), {
              contentType: "application/json",
              upsert: true,
            });
          if (error) throw new Error("Kunne ikke gemme payload: " + error.message);
        }

        try {
          // First-run setup: build delivery_no -> location map and bake into payload.
          if (job.status === "queued") {
            await supabaseAdmin
              .from("invoice_import_jobs")
              .update({ status: "running" })
              .eq("id", jobId);

            const raw = await loadPayload();
            const monthly = raw.monthly ?? [];
            const topProducts = raw.topProducts ?? [];

            const deliveryNos = Array.from(
              new Set(
                [
                  ...monthly.map((m) => m.visma_delivery_no),
                  ...topProducts.map((t) => t.visma_delivery_no),
                ].filter(Boolean),
              ),
            );

            const lookup = new Map<string, { location_id: string; company_id: string | null }>();
            for (let i = 0; i < deliveryNos.length; i += 500) {
              const slice = deliveryNos.slice(i, i + 500);
              const { data: locs, error } = await supabaseAdmin
                .from("locations")
                .select("id, company_id, visma_delivery_no")
                .in("visma_delivery_no", slice);
              if (error) throw error;
              (locs ?? []).forEach((l: any) => {
                if (l.visma_delivery_no && !lookup.has(l.visma_delivery_no)) {
                  lookup.set(l.visma_delivery_no, {
                    location_id: l.id,
                    company_id: l.company_id ?? null,
                  });
                }
              });
            }

            const unmatched: string[] = [];
            deliveryNos.forEach((d) => {
              if (!lookup.has(d)) unmatched.push(d);
            });

            const monthlyResolved = monthly
              .map((m) => {
                const hit = lookup.get(m.visma_delivery_no);
                if (!hit) return null;
                return { ...m, location_id: hit.location_id, company_id: hit.company_id };
              })
              .filter(Boolean);

            const topResolved = topProducts
              .map((t) => {
                const hit = lookup.get(t.visma_delivery_no);
                if (!hit) return null;
                return { ...t, location_id: hit.location_id };
              })
              .filter(Boolean);

            await savePayload({ monthly: monthlyResolved, topProducts: topResolved });

            await supabaseAdmin
              .from("invoice_import_jobs")
              .update({
                total_monthly: monthlyResolved.length,
                total_top: topResolved.length,
                locations_matched: deliveryNos.length - unmatched.length,
                unmatched_delivery_nos: unmatched.slice(0, 200) as any,
              })
              .eq("id", jobId);

            await reTrigger(jobId, host, expected);
            return Response.json({ status: "running", phase: "resolved" });
          }

          // Subsequent invocations: load resolved payload from storage
          const resolved = await loadPayload();
          const resolvedMonthly = (resolved.monthly ?? []) as Array<MonthlyRow & {
            location_id: string;
            company_id: string | null;
          }>;
          const resolvedTop = (resolved.topProducts ?? []) as Array<TopProductRow & {
            location_id: string;
          }>;

          let savedMonthly = job.saved_monthly as number;
          let savedTop = job.saved_top as number;
          let topDeleted = job.top_deleted as boolean;

          // One-time delete of existing top products for affected delivery_nos.
          if (!topDeleted) {
            const affected = Array.from(
              new Set(resolvedTop.map((t) => t.visma_delivery_no)),
            );
            for (let i = 0; i < affected.length; i += 500) {
              const slice = affected.slice(i, i + 500);
              const { error } = await supabaseAdmin
                .from("sales_top_products")
                .delete()
                .in("visma_delivery_no", slice);
              if (error) throw error;
            }
            topDeleted = true;
            await supabaseAdmin
              .from("invoice_import_jobs")
              .update({ top_deleted: true })
              .eq("id", jobId);
          }

          let chunksDone = 0;
          const now = () => new Date().toISOString();

          // Process monthly chunks
          while (savedMonthly < resolvedMonthly.length && chunksDone < CHUNKS_PER_INVOCATION) {
            const chunk = resolvedMonthly
              .slice(savedMonthly, savedMonthly + CHUNK_SIZE)
              .map((m) => ({
                visma_delivery_no: m.visma_delivery_no,
                period: m.period,
                product_group_1: m.product_group_1,
                revenue: m.revenue,
                quantity: m.quantity,
                contribution: m.contribution,
                order_count: m.order_count,
                location_id: m.location_id,
                company_id: m.company_id,
                updated_at: now(),
              }));

            let attempt = 0;
            // retry up to 3x
            while (true) {
              const { error } = await supabaseAdmin
                .from("sales_monthly")
                .upsert(chunk, { onConflict: "visma_delivery_no,period,product_group_1" });
              if (!error) break;
              attempt++;
              if (attempt >= 3) throw error;
              await new Promise((r) => setTimeout(r, 500 * attempt));
            }
            savedMonthly += chunk.length;
            chunksDone++;
            await supabaseAdmin
              .from("invoice_import_jobs")
              .update({ saved_monthly: savedMonthly })
              .eq("id", jobId);
          }

          // Process top product chunks once monthly is done
          if (savedMonthly >= resolvedMonthly.length) {
            while (savedTop < resolvedTop.length && chunksDone < CHUNKS_PER_INVOCATION) {
              const chunk = resolvedTop
                .slice(savedTop, savedTop + CHUNK_SIZE)
                .map((t) => ({
                  visma_delivery_no: t.visma_delivery_no,
                  varenr: t.varenr,
                  description: t.description,
                  revenue: t.revenue,
                  quantity: t.quantity,
                  location_id: t.location_id,
                  updated_at: now(),
                }));

              let attempt = 0;
              while (true) {
                const { error } = await supabaseAdmin
                  .from("sales_top_products")
                  .upsert(chunk, { onConflict: "visma_delivery_no,varenr" });
                if (!error) break;
                attempt++;
                if (attempt >= 3) throw error;
                await new Promise((r) => setTimeout(r, 500 * attempt));
              }
              savedTop += chunk.length;
              chunksDone++;
              await supabaseAdmin
                .from("invoice_import_jobs")
                .update({ saved_top: savedTop })
                .eq("id", jobId);
            }
          }

          const done =
            savedMonthly >= resolvedMonthly.length && savedTop >= resolvedTop.length;

          if (done) {
            await supabaseAdmin
              .from("invoice_import_jobs")
              .update({ status: "completed" })
              .eq("id", jobId);
            return Response.json({ status: "completed", savedMonthly, savedTop });
          }

          // More work to do — re-trigger self
          await reTrigger(jobId, host, expected);
          return Response.json({
            status: "running",
            savedMonthly,
            savedTop,
            chunksProcessed: chunksDone,
          });
        } catch (e: any) {
          const msg = String(e?.message ?? e).slice(0, 2000);
          await supabaseAdmin
            .from("invoice_import_jobs")
            .update({ status: "failed", error_message: msg })
            .eq("id", jobId);
          return Response.json({ status: "failed", error: msg }, { status: 500 });
        }
      },
    },
  },
});
