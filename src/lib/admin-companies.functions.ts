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
  // Chunk for at undgå for lange URL'er og rammen af query-limits
  const CHUNK = 500;
  for (let i = 0; i < companyIds.length; i += CHUNK) {
    const slice = companyIds.slice(i, i + CHUNK);
    // Børn først for at undgå FK-konflikter
    await supabaseAdmin.from("activities").delete().in("company_id", slice);
    await supabaseAdmin.from("quotes").delete().in("company_id", slice);
    await supabaseAdmin.from("contact_list_assignments").delete().in("company_id", slice);
    await supabaseAdmin.from("sales_opportunities").delete().in("company_id", slice);
    await supabaseAdmin.from("contacts").delete().in("company_id", slice);
    const { error } = await supabaseAdmin.from("companies").delete().in("id", slice);
    if (error) throw new Error(error.message);
  }
}

// Hent ALLE virksomheder for en batch – paginer forbi 1000-rækkers grænsen
async function fetchAllCompaniesForBatch(
  batchId: string,
  select: string,
): Promise<any[]> {
  const PAGE = 1000;
  const all: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("companies")
      .select(select)
      .eq("import_batch_id", batchId)
      .order("name")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

// Henter kun company_ids relateret til en liste af ids (chunked .in)
async function fetchRelatedCompanyIds(
  table: "activities" | "sales_opportunities" | "quotes" | "contact_list_assignments",
  ids: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  // Hold URL'er korte — 500 UUIDs i .in() kan give "fetch failed" på worker-runtime
  const CHUNK = 150;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select("company_id")
          .in("company_id", slice);
        if (error) throw new Error(error.message);
        (data ?? []).forEach((r: any) => out.add(r.company_id));
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        // Eksponentiel backoff: 200ms, 600ms
        await new Promise((r) => setTimeout(r, 200 * Math.pow(3, attempt)));
      }
    }
    if (lastErr) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
  return out;
}

async function stampCompaniesToBatch(
  batchId: string,
  createdAt: string,
  companyIds: string[],
) {
  if (!companyIds.length) return;
  const uniqueCompanyIds = Array.from(new Set(companyIds));
  const CHUNK = 500;
  for (let i = 0; i < uniqueCompanyIds.length; i += CHUNK) {
    const slice = uniqueCompanyIds.slice(i, i + CHUNK);
    const { error } = await supabaseAdmin
      .from("companies")
      .update({ import_batch_id: batchId, import_batch_date: createdAt })
      .in("id", slice);
    if (error) throw new Error(error.message);
  }
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
    const uniqueCompanyIds = Array.from(new Set(data.company_ids));
    const { data: batch, error } = await supabaseAdmin
      .from("import_batches")
      .insert({
        filename: data.filename ?? null,
        created_by: context.userId,
        company_count: uniqueCompanyIds.length,
      })
      .select("id, created_at")
      .single();
    if (error || !batch) throw new Error(error?.message ?? "Kunne ikke oprette batch");

    await stampCompaniesToBatch(batch.id, batch.created_at, uniqueCompanyIds);

    return { batch_id: batch.id, company_count: uniqueCompanyIds.length };
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

    type CRow = { id: string; name: string; cvr: string | null; city: string | null };
    const companies = (await fetchAllCompaniesForBatch(
      data.batch_id,
      "id, name, cvr, city",
    )) as CRow[];

    const ids = companies.map((c) => c.id);
    if (!ids.length) {
      return { batch, untouched: [], partial: [], active: [] };
    }

    // Aktiviteter, salgsmuligheder, tilbud → "aktive". Kør sekventielt for at
    // undgå at workeren overbelastes med parallelle fetch-pools (giver "fetch failed").
    const actSet = await fetchRelatedCompanyIds("activities", ids);
    const oppSet = await fetchRelatedCompanyIds("sales_opportunities", ids);
    const qSet = await fetchRelatedCompanyIds("quotes", ids);
    const asgSet = await fetchRelatedCompanyIds("contact_list_assignments", ids);
    const activeSet = new Set<string>([...actSet, ...oppSet, ...qSet]);
    const assignedSet = asgSet;


    const untouched: CRow[] = [];
    const partial: CRow[] = [];
    const active: CRow[] = [];
    for (const c of companies) {
      if (activeSet.has(c.id)) active.push(c);
      else if (assignedSet.has(c.id)) partial.push(c);
      else untouched.push(c);
    }

    // Brug det faktiske antal virksomheder fra DB, så tællingen altid stemmer
    const batchWithActualCount = { ...batch, company_count: companies.length };
    if (batch.company_count !== companies.length) {
      await supabaseAdmin
        .from("import_batches")
        .update({ company_count: companies.length })
        .eq("id", batch.id);
    }

    return { batch: batchWithActualCount, untouched, partial, active };
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

    const companies = (await fetchAllCompaniesForBatch(data.batch_id, "id")) as Array<{ id: string }>;
    const ids = companies.map((c) => c.id);
    if (!ids.length) return { deleted: 0 };

    // Genberegn grupper for at sikre at vi ikke sletter aktive virksomheder (chunked)
    const [actSet, oppSet, qSet, asgSet] = await Promise.all([
      fetchRelatedCompanyIds("activities", ids),
      fetchRelatedCompanyIds("sales_opportunities", ids),
      fetchRelatedCompanyIds("quotes", ids),
      fetchRelatedCompanyIds("contact_list_assignments", ids),
    ]);
    const activeSet = new Set<string>([...actSet, ...oppSet, ...qSet]);
    const assignedSet = asgSet;

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

// ============================================================
// Import: bulk write companies via service role (bypasser RLS)
// ============================================================

const CompanyRow = z.record(z.any());

export const importUpsertCompaniesByCvr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      rows: z.array(CompanyRow).min(1).max(25000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    // Dedupliker rækker pr. CVR — Postgres' ON CONFLICT kan ikke ramme samme
    // række to gange i samme statement. Den sidste forekomst vinder (sidste
    // leveringsadresse for samme CVR overskriver tidligere).
    const byCvr = new Map<string, any>();
    const noCvr: any[] = [];
    for (const r of data.rows) {
      const cvr = (r as any)?.cvr;
      if (cvr) byCvr.set(String(cvr), r);
      else noCvr.push(r);
    }
    const deduped = [...byCvr.values(), ...noCvr];
    const CHUNK = 500;
    const results: Array<{ id: string; cvr: string | null }> = [];
    let failed = 0;
    const errors: string[] = [];
    for (let i = 0; i < deduped.length; i += CHUNK) {
      const slice = deduped.slice(i, i + CHUNK);
      const { data: res, error } = await supabaseAdmin
        .from("companies")
        .upsert(slice as any, { onConflict: "cvr" })
        .select("id, cvr");
      if (error) {
        console.error("Import upsert fejl:", error.message);
        errors.push(error.message);
        // Fallback pr. række så ét dårligt rækkesæt ikke vælter hele batchen
        for (const row of slice) {
          const { data: one, error: oneErr } = await supabaseAdmin
            .from("companies")
            .upsert(row as any, { onConflict: "cvr" })
            .select("id, cvr")
            .maybeSingle();
          if (oneErr || !one) {
            failed++;
            continue;
          }
          results.push({ id: one.id, cvr: one.cvr });
        }
        continue;
      }
      (res ?? []).forEach((r: any) => results.push({ id: r.id, cvr: r.cvr }));
    }
    return { results, failed, errors };
  });


export const importInsertCompaniesNoCvr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      rows: z.array(CompanyRow).min(1).max(25000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const CHUNK = 500;
    const results: Array<{ id: string }> = [];
    let failed = 0;
    for (let i = 0; i < data.rows.length; i += CHUNK) {
      const slice = data.rows.slice(i, i + CHUNK);
      const { data: res, error } = await supabaseAdmin
        .from("companies")
        .insert(slice as any)
        .select("id");
      if (error) {
        console.error("Import insert fejl:", error.message);
        failed += slice.length;
        continue;
      }
      (res ?? []).forEach((r: any) => results.push({ id: r.id }));
    }
    return { results, failed };
  });

export const importUpdateCompaniesById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      updates: z.array(z.object({
        id: z.string().uuid(),
        payload: CompanyRow,
      })).min(1).max(25000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const results: Array<{ id: string; ok: boolean }> = [];
    for (const u of data.updates) {
      const { error } = await supabaseAdmin
        .from("companies")
        .update(u.payload as any)
        .eq("id", u.id);
      results.push({ id: u.id, ok: !error });
      if (error) console.error("Import update fejl", u.id, error.message);
    }
    return { results };
  });

export const importAssignSellersToCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      assignments: z.array(z.object({
        company_id: z.string().uuid(),
        seller_id: z.string().uuid(),
      })).min(1).max(50000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    // Grupper pr. sælger og kør ét UPDATE pr. sælger
    const bySeller = new Map<string, string[]>();
    for (const a of data.assignments) {
      const arr = bySeller.get(a.seller_id) ?? [];
      arr.push(a.company_id);
      bySeller.set(a.seller_id, arr);
    }
    let updated = 0;
    let failed = 0;
    for (const [seller, ids] of bySeller.entries()) {
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { error, count } = await supabaseAdmin
          .from("companies")
          .update({ assigned_to: seller }, { count: "exact" })
          .in("id", slice);
        if (error) {
          console.error("Import assign sellers fejl:", error.message);
          failed += slice.length;
          continue;
        }
        updated += count ?? slice.length;
      }
    }
    return { updated, failed };
  });

export const importInsertLocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      rows: z.array(z.record(z.any())).min(1).max(50000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const CHUNK = 500;
    let inserted = 0;
    let failed = 0;
    for (let i = 0; i < data.rows.length; i += CHUNK) {
      const slice = data.rows.slice(i, i + CHUNK);
      const { error, count } = await supabaseAdmin
        .from("locations")
        .upsert(slice as any, { onConflict: "company_id,visma_delivery_no", count: "exact" });
      if (error) {
        console.error("Import locations fejl:", error.message);
        failed += slice.length;
        continue;
      }
      inserted += count ?? slice.length;
    }
    return { inserted, failed };
  });

