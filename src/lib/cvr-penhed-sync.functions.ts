import { kraevIntern } from "@/lib/kraev-intern";
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

// Læg ét nyt job (25 CVR'er) i køen — samme logik som cron-jobbet.
// Returnerer jobs=0 hvis der allerede venter/kører et job.
export const queuePenhedSync = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc(
      "queue_penhed_sync_naeste" as any,
    );
    if (error) throw new Error(error.message);
    return { jobs: (data as number) ?? 0, cvrs: (data as number) ? CVR_PER_JOB : 0 };
  });

// Status for de seneste jobs (til admin-overblik).
export const getPenhedSyncStatus = createServerFn({ method: "GET" })
  .middleware([kraevIntern])
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

    // Overblik over den løbende kø (statustabellen)
    const { data: ov, error: ovErr } = await supabaseAdmin.rpc(
      "penhed_sync_overblik" as any,
    );
    if (ovErr) throw new Error(ovErr.message);

    return { pending, processing, done, failed, synced, latest, overblik: ov ?? null };
  });
