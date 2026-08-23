import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CVR_PER_JOB = 25;

async function ensureAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: kun administratorer");
}

// Læg alle relevante kunde-CVR-numre i kø til P-enhedssynkronisering.
export const queuePenhedSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cands, error: candErr } = await supabaseAdmin.rpc(
      "penhed_sync_candidates" as any,
    );
    if (candErr) throw new Error(candErr.message);

    const cvrs = Array.from(
      new Set(
        ((cands as any[]) ?? [])
          .map((r: any) => String(typeof r === "string" ? r : r?.cvr ?? "").trim())
          .filter((c) => /^\d{8}$/.test(c)),
      ),
    );
    if (!cvrs.length) return { jobs: 0, cvrs: 0 };

    const rows: { cvrs: string[] }[] = [];
    for (let i = 0; i < cvrs.length; i += CVR_PER_JOB) {
      rows.push({ cvrs: cvrs.slice(i, i + CVR_PER_JOB) });
    }
    const { error } = await supabaseAdmin
      .from("cvr_penhed_sync_jobs")
      .insert(rows as any);
    if (error) throw new Error(error.message);
    return { jobs: rows.length, cvrs: cvrs.length };
  });

// Status for de seneste jobs (til admin-overblik).
export const getPenhedSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("cvr_penhed_sync_jobs")
      .select("id, status, synced_count, last_error, created_at, finished_at, cvrs")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    let pending = 0,
      processing = 0,
      done = 0,
      failed = 0,
      synced = 0;
    for (const r of (data as any[]) ?? []) {
      if (r.status === "pending") pending++;
      else if (r.status === "processing") processing++;
      else if (r.status === "done") done++;
      else if (r.status === "failed") failed++;
      synced += (r.synced_count as number) ?? 0;
    }
    const latest = ((data as any[]) ?? []).slice(0, 10).map((r) => ({
      id: r.id as string,
      status: r.status as string,
      synced_count: (r.synced_count as number) ?? 0,
      cvr_count: ((r.cvrs as string[]) ?? []).length,
      last_error: (r.last_error as string) ?? null,
      created_at: r.created_at as string,
      finished_at: (r.finished_at as string) ?? null,
    }));
    return { pending, processing, done, failed, synced, latest };
  });
