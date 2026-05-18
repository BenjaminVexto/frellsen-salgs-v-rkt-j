import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: kun administratorer");
}

async function cascadeDeleteCompanies(companyIds: string[]) {
  if (!companyIds.length) return;
  // Slet i børn-først rækkefølge for at undgå FK-konflikter.
  // activities og quotes har FK til sales_opportunities, så slet dem først.
  await supabaseAdmin.from("activities").delete().in("company_id", companyIds);
  await supabaseAdmin.from("quotes").delete().in("company_id", companyIds);
  await supabaseAdmin.from("contact_list_assignments").delete().in("company_id", companyIds);
  await supabaseAdmin.from("sales_opportunities").delete().in("company_id", companyIds);
  await supabaseAdmin.from("contacts").delete().in("company_id", companyIds);
  const { error } = await supabaseAdmin.from("companies").delete().in("id", companyIds);
  if (error) throw new Error(error.message);
}

export const getCompanyDeletionStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const [a, o, q, asg] = await Promise.all([
      supabaseAdmin.from("activities").select("id", { count: "exact", head: true }).eq("company_id", data.company_id),
      supabaseAdmin.from("sales_opportunities").select("id", { count: "exact", head: true }).eq("company_id", data.company_id),
      supabaseAdmin.from("quotes").select("id", { count: "exact", head: true }).eq("company_id", data.company_id),
      supabaseAdmin.from("contact_list_assignments").select("id", { count: "exact", head: true }).eq("company_id", data.company_id),
    ]);
    return {
      activities: a.count ?? 0,
      opportunities: o.count ?? 0,
      quotes: q.count ?? 0,
      assignments: asg.count ?? 0,
    };
  });

export const adminDeleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    await cascadeDeleteCompanies([data.company_id]);
    return { ok: true };
  });

export const createImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        filename: z.string().trim().max(255).optional().nullable(),
        company_count: z.number().int().min(0),
        company_ids: z.array(z.string().uuid()).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { data: batch, error } = await supabaseAdmin
      .from("import_batches")
      .insert({
        filename: data.filename ?? null,
        created_by: context.userId,
        company_count: data.company_count,
      })
      .select("id, created_at")
      .single();
    if (error || !batch) throw new Error(error?.message ?? "Kunne ikke oprette batch");

    // Stempel virksomheder
    const { error: stampErr } = await supabaseAdmin
      .from("companies")
      .update({ import_batch_id: batch.id, import_batch_date: batch.created_at })
      .in("id", data.company_ids);
    if (stampErr) throw new Error(stampErr.message);

    return { batch_id: batch.id };
  });

export const listImportBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data: batches, error } = await supabaseAdmin
      .from("import_batches")
      .select("id, filename, created_at, created_by, company_count")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((batches ?? []).map((b) => b.created_by)));
    const nameMap = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      (profs ?? []).forEach((p: any) => nameMap.set(p.id, p.full_name || "(uden navn)"));
    }

    return (batches ?? []).map((b) => ({
      id: b.id,
      filename: b.filename,
      created_at: b.created_at,
      created_by_name: nameMap.get(b.created_by) ?? "Ukendt",
      company_count: b.company_count,
    }));
  });

export const getImportBatchBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ batch_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const { data: batch, error: bErr } = await supabaseAdmin
      .from("import_batches")
      .select("id, filename, created_at, created_by, company_count")
      .eq("id", data.batch_id)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!batch) throw new Error("Batch ikke fundet");

    const { data: companies, error: cErr } = await supabaseAdmin
      .from("companies")
      .select("id, name, cvr, city")
      .eq("import_batch_id", data.batch_id)
      .order("name");
    if (cErr) throw new Error(cErr.message);

    const ids = (companies ?? []).map((c) => c.id);
    if (!ids.length) {
      return { batch, untouched: [], partial: [], active: [] };
    }

    // Aktiviteter, salgsmuligheder, tilbud → "aktive"
    const [actRes, oppRes, qRes, asgRes] = await Promise.all([
      supabaseAdmin.from("activities").select("company_id").in("company_id", ids),
      supabaseAdmin.from("sales_opportunities").select("company_id").in("company_id", ids),
      supabaseAdmin.from("quotes").select("company_id").in("company_id", ids),
      supabaseAdmin.from("contact_list_assignments").select("company_id").in("company_id", ids),
    ]);
    const activeSet = new Set<string>();
    (actRes.data ?? []).forEach((r: any) => activeSet.add(r.company_id));
    (oppRes.data ?? []).forEach((r: any) => activeSet.add(r.company_id));
    (qRes.data ?? []).forEach((r: any) => activeSet.add(r.company_id));
    const assignedSet = new Set<string>();
    (asgRes.data ?? []).forEach((r: any) => assignedSet.add(r.company_id));

    const untouched: typeof companies = [];
    const partial: typeof companies = [];
    const active: typeof companies = [];
    for (const c of companies ?? []) {
      if (activeSet.has(c.id)) active.push(c);
      else if (assignedSet.has(c.id)) partial.push(c);
      else untouched.push(c);
    }

    return { batch, untouched, partial, active };
  });

export const deleteBatchGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        batch_id: z.string().uuid(),
        group: z.enum(["untouched", "partial"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const { data: companies, error } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("import_batch_id", data.batch_id);
    if (error) throw new Error(error.message);
    const ids = (companies ?? []).map((c) => c.id);
    if (!ids.length) return { deleted: 0 };

    // Genberegn grupper for at sikre at vi ikke sletter aktive virksomheder
    const [actRes, oppRes, qRes, asgRes] = await Promise.all([
      supabaseAdmin.from("activities").select("company_id").in("company_id", ids),
      supabaseAdmin.from("sales_opportunities").select("company_id").in("company_id", ids),
      supabaseAdmin.from("quotes").select("company_id").in("company_id", ids),
      supabaseAdmin.from("contact_list_assignments").select("company_id").in("company_id", ids),
    ]);
    const activeSet = new Set<string>();
    (actRes.data ?? []).forEach((r: any) => activeSet.add(r.company_id));
    (oppRes.data ?? []).forEach((r: any) => activeSet.add(r.company_id));
    (qRes.data ?? []).forEach((r: any) => activeSet.add(r.company_id));
    const assignedSet = new Set<string>();
    (asgRes.data ?? []).forEach((r: any) => assignedSet.add(r.company_id));

    let toDelete: string[];
    if (data.group === "untouched") {
      toDelete = ids.filter((id) => !activeSet.has(id) && !assignedSet.has(id));
    } else {
      // partial: tildelt men ingen aktivitet
      toDelete = ids.filter((id) => !activeSet.has(id) && assignedSet.has(id));
    }

    await cascadeDeleteCompanies(toDelete);
    return { deleted: toDelete.length };
  });
