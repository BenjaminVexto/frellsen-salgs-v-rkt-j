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
      .select("id, filename, created_at, created_by, company_count, kind, item_count")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((batches ?? []).map((b: any) => b.created_by)));
    const nameMap = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      (profs ?? []).forEach((p: any) => nameMap.set(p.id, p.full_name || "(uden navn)"));
    }

    // For 'companies' batches: filtrér batches der ikke længere har tilknyttede virksomheder
    const companyBatchIds = (batches ?? [])
      .filter((b: any) => (b.kind ?? "companies") === "companies")
      .map((b: any) => b.id);
    const existingBatchIds = new Set<string>();
    if (companyBatchIds.length) {
      const CHUNK = 200;
      for (let i = 0; i < companyBatchIds.length; i += CHUNK) {
        const slice = companyBatchIds.slice(i, i + CHUNK);
        const { data: rows, error: cErr } = await supabaseAdmin
          .from("companies")
          .select("import_batch_id")
          .in("import_batch_id", slice)
          .not("import_batch_id", "is", null);
        if (cErr) throw new Error(cErr.message);
        (rows ?? []).forEach((r: any) => {
          if (r.import_batch_id) existingBatchIds.add(r.import_batch_id);
        });
      }
    }

    return (batches ?? [])
      .filter((b: any) => {
        const kind = b.kind ?? "companies";
        if (kind === "companies") return existingBatchIds.has(b.id);
        return true;
      })
      .map((b: any) => {
        const kind = (b.kind ?? "companies") as "companies" | "maskindata" | "agreement";
        const count = kind === "companies" ? b.company_count : (b.item_count ?? 0);
        return {
          id: b.id,
          filename: b.filename,
          created_at: b.created_at,
          created_by_name: nameMap.get(b.created_by) ?? "Ukendt",
          company_count: b.company_count,
          kind,
          item_count: count,
        };
      });
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

const CompanyRow = z.record(z.string(), z.any());

function formatDbError(error: any): string {
  return JSON.stringify({
    code: error?.code ?? null,
    message: error?.message ?? String(error),
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  });
}

function parseDbError(error: any): {
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
} {
  return {
    code: error?.code ?? null,
    message: error?.message ?? String(error),
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  };
}

function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

export const importUpsertCompaniesByCvr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      rows: z.array(CompanyRow).min(1).max(25000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    // Dedupliker rækker pr. CVR. Vi bruger IKKE upsert(onConflict="cvr"),
    // fordi companies.cvr bevidst ikke er unik i databasen. I stedet laver vi
    // eksplicit lookup → update/insert, så importen virker med dublet-CVR'er.
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

      const cvrs = slice.map((row) => String((row as any).cvr ?? "").trim()).filter(Boolean);
      const existingByCvr = new Map<string, { id: string; cvr: string | null }>();
      if (cvrs.length) {
        const { data: existingRows, error: existingErr } = await supabaseAdmin
          .from("companies")
          .select("id, cvr")
          .in("cvr", cvrs);
        if (existingErr) {
          const msg = formatDbError(existingErr);
          console.error("Import CVR lookup fejl:", msg);
          errors.push(msg);
          failed += slice.length;
          continue;
        }
        (existingRows ?? []).forEach((row: any) => {
          if (row.cvr && !existingByCvr.has(String(row.cvr))) existingByCvr.set(String(row.cvr), row);
        });
      }

      const inserts: any[] = [];
      const updates: Array<{ id: string; cvr: string | null; payload: any }> = [];
      for (const row of slice) {
        const cvr = String((row as any).cvr ?? "").trim();
        const explicitId = (row as any).id ? String((row as any).id) : null;
        const existing = explicitId ? { id: explicitId, cvr: cvr || null } : existingByCvr.get(cvr);
        const { id: _id, ...payload } = row as any;
        if (existing?.id) updates.push({ id: existing.id, cvr: existing.cvr ?? (cvr || null), payload });
        else inserts.push(payload);
      }

      if (inserts.length) {
        const { data: insertedRows, error: insertErr } = await supabaseAdmin
          .from("companies")
          .insert(inserts as any)
          .select("id, cvr");
        if (insertErr) {
          const msg = formatDbError(insertErr);
          console.error("Import CVR insert fejl:", msg);
          errors.push(msg);
          failed += inserts.length;
        } else {
          (insertedRows ?? []).forEach((row: any) => results.push({ id: row.id, cvr: row.cvr }));
        }
      }

      if (updates.length) {
        const updatePayloads = updates.map((row) => ({ id: row.id, ...row.payload }));
        const { data: updatedRows, error: updateErr } = await supabaseAdmin
          .from("companies")
          .upsert(updatePayloads as any, { onConflict: "id" })
          .select("id, cvr");
        if (updateErr) {
          const msg = formatDbError(updateErr);
          console.error("Import CVR update fejl:", msg);
          errors.push(msg);
          failed += updates.length;
        } else {
          (updatedRows ?? []).forEach((row: any) => results.push({ id: row.id, cvr: row.cvr }));
        }
      }
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

// Upsert pr. visma_id (Fakt. kunde). Race-safe og idempotent: hvis canonical
// allerede findes, UPDATE'es kun de medsendte felter; ellers INSERT.
// Bruges ved kunde-re-import hvor visma_id er den autoritative grupperings-nøgle.
export const importUpsertCompaniesByVismaId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      rows: z.array(CompanyRow).min(1).max(25000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    // Dedupliker pr. visma_id (sidste række vinder — samme mønster som CVR-varianten)
    // NB: vi kan ikke bruge upsert(onConflict="visma_id") her, fordi databasen
    // har et partial unique index på visma_id. Postgres/PostgREST kan ikke matche
    // det index via ON CONFLICT-specifikationen, så vi laver eksplicit lookup →
    // insert/update i batches i stedet.
    const byVismaId = new Map<string, any>();
    for (const r of data.rows) {
      const v = (r as any)?.visma_id;
      if (!v) continue;
      byVismaId.set(String(v), r);
    }
    const deduped = [...byVismaId.values()];
    const CHUNK = 500;
    const results: Array<{ id: string; visma_id: string | null }> = [];
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < deduped.length; i += CHUNK) {
      const slice = deduped.slice(i, i + CHUNK);

      const vismaIds = slice.map((row) => String((row as any).visma_id).trim()).filter(Boolean);
      const { data: existingRows, error: existingErr } = await supabaseAdmin
        .from("companies")
        .select("id, visma_id")
        .in("visma_id", vismaIds);
      if (existingErr) {
        const msg = formatDbError(existingErr);
        console.error("Import visma_id lookup fejl:", msg);
        errors.push(msg);
        failed += slice.length;
        continue;
      }

      const existingByVismaId = new Map<string, { id: string; visma_id: string | null }>();
      (existingRows ?? []).forEach((row: any) => {
        if (row.visma_id) existingByVismaId.set(String(row.visma_id), row);
      });

      const inserts: any[] = [];
      const updates: Array<{ id: string; visma_id: string; payload: any }> = [];
      for (const row of slice) {
        const vismaId = String((row as any).visma_id).trim();
        const existing = existingByVismaId.get(vismaId);
        if (existing) updates.push({ id: existing.id, visma_id: vismaId, payload: row });
        else inserts.push(row);
      }

      if (inserts.length) {
        const { data: insertedRows, error: insertErr } = await supabaseAdmin
          .from("companies")
          .insert(inserts as any)
          .select("id, visma_id");
        if (insertErr) {
          const msg = formatDbError(insertErr);
          console.error("Import insert (visma_id) fejl:", msg);
          errors.push(msg);
          for (const row of inserts) {
            const vismaId = String((row as any).visma_id).trim();
            const { data: existing, error: lookupErr } = await supabaseAdmin
              .from("companies")
              .select("id, visma_id")
              .eq("visma_id", vismaId)
              .maybeSingle();
            if (lookupErr) {
              console.error("Import insert fallback lookup fejl:", formatDbError(lookupErr));
              failed++;
              continue;
            }
            if (existing?.id) {
              const { error: oneUpdateErr } = await supabaseAdmin
                .from("companies")
                .update(row as any)
                .eq("id", existing.id);
              if (oneUpdateErr) {
                console.error("Import update fallback fejl:", formatDbError(oneUpdateErr));
                failed++;
                continue;
              }
              results.push({ id: existing.id, visma_id: existing.visma_id });
              continue;
            }
            const { data: oneInsert, error: oneInsertErr } = await supabaseAdmin
              .from("companies")
              .insert(row as any)
              .select("id, visma_id")
              .maybeSingle();
            if (oneInsertErr || !oneInsert) {
              console.error("[visma-import][row-error]", JSON.stringify({
                visma_id: vismaId,
                db_error: parseDbError(oneInsertErr),
                attempted_object: row,
              }));
              console.error("Import single insert fallback fejl:", formatDbError(oneInsertErr));
              failed++;
              continue;
            }
            results.push({ id: oneInsert.id, visma_id: oneInsert.visma_id });
          }
        } else {
          (insertedRows ?? []).forEach((row: any) => results.push({ id: row.id, visma_id: row.visma_id }));
        }
      }

      if (updates.length) {
        const grouped = new Map<string, { payload: any; rows: Array<{ id: string; visma_id: string }> }>();
        for (const row of updates) {
          const key = stableStringify(row.payload);
          const group = grouped.get(key);
          if (group) group.rows.push({ id: row.id, visma_id: row.visma_id });
          else grouped.set(key, { payload: row.payload, rows: [{ id: row.id, visma_id: row.visma_id }] });
        }

        for (const group of grouped.values()) {
          for (let j = 0; j < group.rows.length; j += CHUNK) {
            const rowSlice = group.rows.slice(j, j + CHUNK);
            const ids = rowSlice.map((row) => row.id);
            const { error: updateErr } = await supabaseAdmin
              .from("companies")
              .update(group.payload as any)
              .in("id", ids);
            if (updateErr) {
              const msg = formatDbError(updateErr);
              console.error("Import batch update (visma_id) fejl:", msg);
              errors.push(msg);
              for (const row of rowSlice) {
                const { error: oneErr } = await supabaseAdmin
                  .from("companies")
                  .update(group.payload as any)
                  .eq("id", row.id);
                if (oneErr) {
                  console.error("[visma-import][row-error]", JSON.stringify({
                    id: row.id,
                    visma_id: row.visma_id,
                    db_error: parseDbError(oneErr),
                    attempted_object: group.payload,
                  }));
                  console.error("Import single update (visma_id) fejl:", formatDbError(oneErr));
                  failed++;
                  continue;
                }
                results.push({ id: row.id, visma_id: row.visma_id });
              }
              continue;
            }
            rowSlice.forEach((row) => results.push({ id: row.id, visma_id: row.visma_id }));
          }
        }
      }
    }

    return { results, failed, errors };
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

    // Gruppér updates efter identisk payload-indhold, så vi kan køre
    // ét UPDATE ... WHERE id IN (...) pr. unik payload i stedet for
    // ét kald pr. række. Stabil JSON-stringify giver samme nøgle for
    // identiske payloads uanset key-rækkefølge.
    const stableStringify = (obj: any): string => {
      if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
      if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
      const keys = Object.keys(obj).sort();
      return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
    };

    const groups = new Map<string, { payload: any; ids: string[] }>();
    for (const u of data.updates) {
      const key = stableStringify(u.payload);
      const g = groups.get(key);
      if (g) g.ids.push(u.id);
      else groups.set(key, { payload: u.payload, ids: [u.id] });
    }

    const CHUNK = 500;
    for (const { payload, ids } of groups.values()) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { error } = await supabaseAdmin
          .from("companies")
          .update(payload as any)
          .in("id", slice);
        if (error) {
          console.error("Import update fejl (batch)", error.message);
          // Fallback pr. række så ét dårligt batch ikke vælter alt
          for (const id of slice) {
            const { error: oneErr } = await supabaseAdmin
              .from("companies")
              .update(payload as any)
              .eq("id", id);
            results.push({ id, ok: !oneErr });
            if (oneErr) console.error("Import update fejl", id, oneErr.message);
          }
          continue;
        }
        for (const id of slice) results.push({ id, ok: true });
      }
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
      rows: z.array(z.record(z.string(), z.any())).min(1).max(50000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const CHUNK = 500;
    let inserted = 0;
    let failed = 0;
    const errorSamples: Array<{ batchStart: number; sliceHasTarget: boolean; message: string; code: string | null; details: string | null; hint: string | null }> = [];
    const target = (data.rows as Array<Record<string, any>>).find((r) => r?.visma_delivery_no === "2273904");
    if (target) console.log("[DIAG] 2273904 sendt til upsert som:", JSON.stringify(target));

    // Gem den oprindelige liste af primær-markeringer FØR vi tvinger is_primary=false i selve upsert'et.
    const primaryTargets = (data.rows as Array<Record<string, any>>)
      .filter((r) => r?.is_primary === true && r?.company_id && r?.visma_delivery_no)
      .map((r) => ({ company_id: r.company_id as string, visma_delivery_no: r.visma_delivery_no as string }));

    for (let i = 0; i < data.rows.length; i += CHUNK) {
      const slice = data.rows.slice(i, i + CHUNK);
      // Sæt is_primary=false på alle rækker i bulk-upsert'et for at undgå kollision
      // med det partielle unikke indeks locations_one_primary_per_company. Primær-markeringen
      // sættes efterfølgende atomisk via set_primary_location-RPC'et.
      const payload = (slice as Array<Record<string, any>>).map((r) => ({ ...r, is_primary: false }));
      const { error, count } = await supabaseAdmin
        .from("locations")
        .upsert(payload as any, { onConflict: "company_id,visma_delivery_no", count: "exact" });
      if (error) {
        const sliceHasTarget = (slice as Array<Record<string, any>>).some((r) => r?.visma_delivery_no === "2273904");
        console.error("[DIAG] upsertLocations batch FEJL:", {
          batchStart: i,
          batchSize: slice.length,
          sliceHasTarget,
          message: error.message,
          code: (error as any).code,
          details: (error as any).details,
          hint: (error as any).hint,
        });
        console.error("[DIAG] Fejlende batch eksempel-rækker:", JSON.stringify(slice.slice(0, 3)));
        if (errorSamples.length < 5) {
          errorSamples.push({
            batchStart: i,
            sliceHasTarget,
            message: error.message,
            code: (error as any).code,
            details: (error as any).details,
            hint: (error as any).hint,
          });
        }
        failed += slice.length;
        continue;
      }
      inserted += count ?? slice.length;
    }

    // Efter selve bulk-upsert'et: sæt den korrekte primær-lokation pr. virksomhed atomisk.
    let primaryFixed = 0;
    let primaryFailed = 0;
    for (const t of primaryTargets) {
      const { error } = await supabaseAdmin.rpc("set_primary_location" as any, {
        p_company_id: t.company_id,
        p_visma_delivery_no: t.visma_delivery_no,
      } as any);
      if (error) {
        primaryFailed++;
        console.error("[set_primary_location] fejl:", t, error.message);
      } else {
        primaryFixed++;
      }
    }

    return { inserted, failed, errorSamples, primaryFixed, primaryFailed };
  });

export const importUpsertContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      rows: z.array(z.object({
        company_id: z.string().uuid(),
        location_id: z.string().uuid().nullable(),
        name: z.string().min(1),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        is_primary: z.boolean().optional(),
      })).min(1).max(50000),
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
        .from("contacts")
        .upsert(slice as any, {
          onConflict: "company_id,location_id,name",
          count: "exact",
        });
      if (error) {
        console.error("Import contacts fejl:", error.message);
        failed += slice.length;
        continue;
      }
      inserted += count ?? slice.length;
    }
    return { inserted, failed };
  });

// ======================= COMPANY DOCUMENTS =======================

async function ensureDocumentWriter(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "salgssupport"])
    .maybeSingle();
  if (!data) throw new Error("Forbidden: kun admin og salgssupport");
}

export const uploadCompanyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        filename: z.string().trim().min(1).max(255),
        document_type: z.enum(["aftale", "kontrakt", "tilbud", "maskine", "andet"]),
        expires_at: z.string().nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
        file_base64: z.string().min(1),
        file_size_bytes: z.number().int().nonnegative().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureDocumentWriter(context.userId);

    const safeName = data.filename.replace(/[^\w.\-]+/g, "_");
    const path = `${data.company_id}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(data.file_base64, "base64");
    if (buffer.byteLength > 10 * 1024 * 1024) {
      throw new Error("Filen er for stor (max 10 MB)");
    }

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("company-documents")
      .upload(path, buffer, { contentType: "application/pdf", upsert: false });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data: doc, error: dbErr } = await supabaseAdmin
      .from("company_documents")
      .insert({
        company_id: data.company_id,
        filename: data.filename,
        storage_path: path,
        document_type: data.document_type,
        expires_at: data.expires_at ?? null,
        notes: data.notes ?? null,
        uploaded_by: context.userId,
        file_size_bytes: data.file_size_bytes ?? buffer.byteLength,
      })
      .select("id")
      .single();
    if (dbErr) {
      await supabaseAdmin.storage.from("company-documents").remove([path]);
      throw new Error(dbErr.message);
    }
    return { id: doc.id };
  });

export const deleteCompanyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ document_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureDocumentWriter(context.userId);
    const { data: doc } = await supabaseAdmin
      .from("company_documents")
      .select("storage_path")
      .eq("id", data.document_id)
      .single();
    if (!doc) throw new Error("Dokument ikke fundet");
    await supabaseAdmin.storage.from("company-documents").remove([doc.storage_path]);
    const { error } = await supabaseAdmin
      .from("company_documents")
      .delete()
      .eq("id", data.document_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getDocumentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ document_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: doc } = await supabaseAdmin
      .from("company_documents")
      .select("storage_path, filename")
      .eq("id", data.document_id)
      .single();
    if (!doc) throw new Error("Ikke fundet");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("company-documents")
      .createSignedUrl(doc.storage_path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, filename: doc.filename };
  });

export const downloadCompanyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ document_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: doc } = await supabaseAdmin
      .from("company_documents")
      .select("storage_path, filename")
      .eq("id", data.document_id)
      .single();
    if (!doc) throw new Error("Ikke fundet");
    const { data: file, error } = await supabaseAdmin.storage
      .from("company-documents")
      .download(doc.storage_path);
    if (error || !file) throw new Error(error?.message ?? "Kunne ikke hente fil");
    const buf = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    // btoa is available in the worker runtime
    const base64 = btoa(binary);
    return { base64, filename: doc.filename, content_type: "application/pdf" };
  });

// ============================================================
// AI Briefing — genererer kort briefing med Claude + web search
// ============================================================
export const generateCompanyBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [
      companyRes,
      activitiesRes,
      locationsRes,
      contactsRes,
      docsRes,
      competitorRes,
      opportunitiesRes,
      previousRes,
    ] = await Promise.all([
      supabaseAdmin.from("companies").select("*").eq("id", data.company_id).single(),
      supabaseAdmin
        .from("activities")
        .select("activity_type, note, created_at")
        .eq("company_id", data.company_id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("locations")
        .select("address, city, zip, contact_person, phone, is_primary")
        .eq("company_id", data.company_id)
        .limit(10),
      supabaseAdmin
        .from("contacts")
        .select("name, title, phone, email")
        .eq("company_id", data.company_id),
      supabaseAdmin
        .from("company_documents")
        .select("filename, document_type, expires_at")
        .eq("company_id", data.company_id),
      supabaseAdmin
        .from("competitor_assignments")
        .select("contract_expires_at, notes, competitors(name, competitor_type)")
        .eq("company_id", data.company_id)
        .maybeSingle(),
      supabaseAdmin
        .from("sales_opportunities")
        .select("name, estimated_value, status")
        .eq("company_id", data.company_id)
        .not("status", "in", "(vundet,tabt)"),
      supabaseAdmin
        .from("company_briefings")
        .select("briefing_text, created_at")
        .eq("company_id", data.company_id)
        .maybeSingle(),
    ]);

    const company = companyRes.data as any;
    if (!company) throw new Error("Virksomhed ikke fundet");

    const previous = previousRes.data;
    const activities = activitiesRes.data ?? [];
    const locations = locationsRes.data ?? [];
    const contacts = contactsRes.data ?? [];
    const docs = docsRes.data ?? [];
    const competitor = competitorRes.data as any;
    const opportunities = opportunitiesRes.data ?? [];

    const internalData = `
VIRKSOMHED: ${company.name}
CVR: ${company.cvr ?? "Ikke registreret"}
STATUS: ${company.sources?.includes("visma") ? "Visma-kunde" : "Nyt emne"}
BRANCHE: ${company.industry ?? "Ukendt"}
BY: ${company.city ?? "Ukendt"}
KOMMUNE: ${company.municipality ?? ""}
ANSATTE: ${company.employees ?? "Ukendt"}

VISMA DATA:
Oprettet i Visma: ${company.created_in_visma ?? "Ingen data"}
Sidste varekøb: ${company.last_purchase_date ?? "Ingen data"}
Kundesegment 1: ${company.customer_segment_1 ?? ""}
Kundesegment 2: ${company.customer_segment_2 ?? ""}
Kundesegment 3: ${company.customer_segment_3 ?? ""}
Kontaktperson fra Visma: ${company.contact_person ?? "Ingen registreret"}

LOKATIONER (${locations.length}):
${
  locations
    .map(
      (l: any) =>
        `- ${l.address ?? ""} ${l.zip ?? ""} ${l.city ?? ""}${l.contact_person ? `\n   Kontakt: ${l.contact_person}` : ""}${l.phone ? `\n   ${l.phone}` : ""}${l.is_primary ? " (Primær)" : ""}`,
    )
    .join("\n") || "Ingen lokationer"
}

KONTAKTPERSONER:
${
  contacts
    .map(
      (c: any) =>
        `- ${c.name}${c.title ? ` · ${c.title}` : ""} ${c.phone ?? ""} ${c.email ?? ""}`,
    )
    .join("\n") || "Ingen registreret"
}

SENESTE AKTIVITETER:
${
  activities
    .map(
      (a: any) =>
        `- [${a.activity_type ?? "Note"}] ${new Date(a.created_at).toLocaleDateString("da")}: ${a.note?.substring(0, 100) ?? ""}`,
    )
    .join("\n") || "Ingen aktiviteter"
}

ÅBNE SALGSMULIGHEDER:
${
  opportunities
    .map(
      (o: any) =>
        `- ${o.name} · ${o.estimated_value ? Number(o.estimated_value).toLocaleString("da") + " kr." : "Ingen beløb"} · ${o.status}`,
    )
    .join("\n") || "Ingen"
}

DOKUMENTER:
${
  docs
    .map(
      (d: any) =>
        `- ${d.document_type}: ${d.filename}${d.expires_at ? ` (Udløber: ${new Date(d.expires_at).toLocaleDateString("da")})` : ""}`,
    )
    .join("\n") || "Ingen"
}

KONKURRENTAFTALE:
${
  competitor
    ? `${competitor.competitors?.name ?? "Ukendt"}
     Type: ${competitor.competitors?.competitor_type ?? ""}
     Udløber: ${competitor.contract_expires_at ? new Date(competitor.contract_expires_at).toLocaleDateString("da") : "Ingen dato"}
     Note: ${competitor.notes ?? ""}`
    : "Ingen registreret"
}
`.trim();

    const previousSection = previous
      ? `\nTIDLIGERE BRIEFING (${new Date(previous.created_at).toLocaleDateString("da")}):\n${previous.briefing_text}\n`
      : "";

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY mangler");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: `Du er en erfaren salgskollega hos Frellsen Kaffe. Du briefer en sælger lige før et opkald eller kundebesøg.

Sælgeren har kort tid. Skriv kun det, der er kommercielt relevant. Ingen rapport. Ingen lange forklaringer. Dansk. Direkte og praktisk tone.

MAKS LÆNGDE:
- Normal briefing: maks. 140 ord.
- Hvis eksisterende kunde, Frellsen-maskine, konkurrentaftale, gammel kunde, åbne muligheder eller vigtig advarsel: maks. 180 ord.

NULREGEL:
Hellere "ukendt" end forkert. En forkert kontaktperson, et forkert tal eller en usikker antagelse kan ødelægge sælgerens troværdighed.
Opfind aldrig navne, tal, kontaktpersoner, kantineforhold, lokationer, aftaler, problemer eller citater.

GRUNDPRINCIP:
Skeln altid mellem:
1. CRM-fakta
2. verificerede offentlige oplysninger
3. kommercielle antagelser
Hvis noget ikke er sikkert, skriv "ukendt", "antagelse" eller "bør verificeres".

=== REGLER I PRIORITET ===

1. INTERN CRM-DATA VINDER ALTID
CRM-data fra Visma, contacts, locations, activities, opportunities og customer_segment_2 er fakta.
Webdata eller AI-vurderinger må aldrig overskrive CRM-data.
Hvis CRM-data og webdata modsiger hinanden, brug CRM-data.

2. KUNDESTATUS BESTEMMER ÅBNING
Afgør først om virksomheden er:
- eksisterende aktiv kunde
- tidligere kunde / genaktivering
- kunde med Frellsen-maskine
- kunde med særlig prisaftale
- konkurrentkunde
- nyt emne uden historik
Åbningen skal altid passe til kundestatus.
Koldt nysalg må aldrig bruges mod eksisterende Frellsen-kunder.

3. CUSTOMER_SEGMENT_2
Læs altid customer_segment_2.
Hvis feltet indeholder "UDLÅN", "LEJE" eller "Maskine":
Medtag ⚠️ OBS: "Har udlånt/lejet maskine fra Frellsen. Ring ikke som koldt nysalg."
Åbningen skal handle om opfølgning, tilfredshed, service, genforhandling, fastholdelse eller mersalg.
Hvis feltet indeholder "Kodet Rabat":
Nævn kort, at der findes særlig prisaftale i Visma.

4. EKSISTERENDE KUNDE
Hvis virksomheden er Visma-kunde og har sidste varekøb inden for 12 måneder:
Åbn med opfølgning, tilfredshed, forbrug, service eller mersalg.
Hvis sidste varekøb er over 12 måneder:
Medtag ⚠️ OBS om gammel kunde.
Åbn med genaktivering — ikke som helt nyt emne.

5. KONTAKTPERSON
Find kontaktperson i denne rækkefølge:
1. contacts-tabellen
2. primary location contact_person
3. seneste aktivitetsnoter
4. companies.contact_person fra Visma
5. offentlig kilde
6. relevant funktion at spørge efter
Hvis kontaktperson kommer fra Visma: skriv "(fra Visma — verificér aktuelt)".
Hvis kontaktperson findes online: skriv "(fundet online — verificér)".
Hvis ingen sikker kontaktperson findes: skriv en relevant funktion i stedet for navn.
Foretrukne funktioner: facility, indkøb, kontorchef, HR, drift, reception, administration eller kantineansvarlig.
Direktør må kun nævnes, hvis virksomheden er lille, eller hvis ingen mere relevant funktion findes.

6. AKTIVITETER OG ÅBNE MULIGHEDER
Hvis der findes seneste aktiviteter: nævn ultrakort hvad der skete sidst, og lad åbningen følge op på det.
Hvis der findes åbne salgsmuligheder: nævn dem kort i Frellsen-vinklen, og lad åbningen følge op på dem.

7. KONKURRENTAFTALE
Hvis konkurrentaftale er registreret: nævn konkurrent og udløbsdato, hvis kendt.
Åbn ikke med "hvem leverer jeres kaffe i dag", hvis leverandøren allerede er kendt.
Brug et kort Frellsen-modargument:
- bedre service
- mere gennemsigtig pris
- samlet ansvar
- dansk/familieejet kvalitet
- nemmere hverdag for kunden

8. WEBOPLYSNINGER
Brug kun offentlige oplysninger, hvis de er direkte relevante for salget:
- branche
- ansatte/størrelse
- adresse/hovedkontor
- lokationer eller afdelinger
- kontor, produktion, lager, værksted, institution, butik, kantine, drift eller udekørende teams
- vækst, ny afdeling, jobopslag eller nyheder, hvis det påvirker kaffebehovet
Brug ikke irrelevante pressehistorier.
Brug ikke usikre oplysninger som fakta.
Hvis web viser flere lokationer eller afdelinger: prioritér det i Frellsen-vinklen, fordi det kan åbne for samlet aftale.
Antal ansatte fra web må gerne bruges som ca.-tal: "ca. X ansatte".
Hvis kilden er usikker, skriv "ansatte ukendt".

9. KAFFEBEHOV
Vurder sandsynligt kaffebehov: lavt / middel / højt / meget højt.
Vurder ud fra:
- ansatte
- arbejdspladstype
- gæster/kundebesøg
- kontor/kantine
- produktion/lager/drift
- flere lokationer
- eksisterende Frellsen-historik
Marker antagelser som antagelser.

10. FRELLSEN-VINKEL
Vælg den mest relevante vinkel:
- samlet løsning: kaffe + maskiner + service
- driftssikkerhed og hurtig service
- fair og gennemskuelig pris
- opgradering/mersalg
- genaktivering
- konkurrentudfordring
- løsning til flere lokationer
- enkel kontorløsning
- kantine/høj kapacitet
- dansk familieejet leverandør, hvis det passer naturligt
Undgå generiske formuleringer.
Skriv hvorfor netop denne virksomhed er interessant for Frellsen.

11. ADVARSLER
Medtag kun ⚠️ OBS hvis sælgeren kan lave en fejl uden advarslen.
Eksempler:
- eksisterende Frellsen-kunde
- udlånt/lejet maskine
- tidligere kunde
- sidste køb over 12 måneder
- kendt konkurrentaftale
- kontaktperson usikker
- særlig prisaftale
- vigtig usikkerhed i data

12. OUTPUTFORMAT
Brug præcis dette format.
Udelad sektioner, hvis der ikke er relevant indhold.
Ingen markdown-tabeller.
Ingen stjerner.

[Virksomhedsnavn] · [type/branche] · [antal ansatte hvis kendt, ellers "ansatte ukendt"]
[By/adresse hvis relevant]

📞 KONTAKT
[Navn + telefon hvis sikker]
eller
[Relevant funktion at spørge efter]
[kilde/status i parentes hvis nødvendigt]

☕ FRELLSEN-VINKEL
[Kort konkret vurdering. Inkludér kundestatus, kaffebehov og hvorfor virksomheden er relevant.]

💬 ÅBNINGSSÆTNING
"[Én konkret sætning sælgeren kan sige direkte.]"

⚠️ OBS
[Kun hvis vigtigt. Ellers udelad hele sektionen.]

🔎 VERIFICÉR
[1-2 konkrete ting sælgeren bør afklare.]`,
        messages: [
          {
            role: "user",
            content: `Forbered briefing til sælger.

${internalData}
${previousSection}

Søg nu efter følgende om virksomheden:
1. "${company.name}" nyheder 2025 OR 2026
2. "${company.name}" LinkedIn
3. "${company.name}" direktør OR CEO OR leder 2025 OR 2026
4. "${company.name}" ansatte OR vækst OR ny afdeling
5. site:virk.dk "${company.cvr ?? company.name}"

Generer en kortfattet briefing der hjælper sælgeren til at ringe eller besøge denne virksomhed.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API fejl: ${err}`);
    }

    const result = await response.json();
    const briefingText = (result.content as any[])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const { error: upsertError } = await supabaseAdmin
      .from("company_briefings")
      .upsert(
        {
          company_id: data.company_id,
          briefing_text: briefingText,
          generated_by: context.userId,
        },
        { onConflict: "company_id" },
      );
    if (upsertError) throw new Error(upsertError.message);

    return { briefing: briefingText, created_at: new Date().toISOString() };
  });





export const enrichCompaniesFromCvr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      company_ids: z.array(z.string().uuid()).min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { enrichCompaniesByIds } = await import("./cvr-enrichment.server");
    const res = await enrichCompaniesByIds(data.company_ids);
    if (res.error) throw new Error(res.error);
    return { enriched: res.enriched };
  });

// Læg et batch af virksomhedsIDs i kø til baggrundsberigelse.
// Chunkes i 500 ad gangen — én job-række pr. chunk.
// Hver enqueue starter en ny "kampagne" (campaign_id), så fremgangslinjen
// kan vise korrekt procent mod den oprindelige total.
export const enqueueCvrEnrichment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      company_ids: z.array(z.string().uuid()).min(1).max(50000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const CHUNK = 500;
    const campaignId = crypto.randomUUID();
    const rows: { company_ids: string[]; campaign_id: string }[] = [];
    for (let i = 0; i < data.company_ids.length; i += CHUNK) {
      rows.push({
        company_ids: data.company_ids.slice(i, i + CHUNK),
        campaign_id: campaignId,
      });
    }
    if (!rows.length) return { jobs: 0, campaign_id: campaignId };
    const { error } = await supabaseAdmin
      .from("cvr_enrichment_jobs")
      .insert(rows as any);
    if (error) throw new Error(error.message);
    return { jobs: rows.length, campaign_id: campaignId };
  });

// Status til UI-fremgangslinje: kigger kun på den seneste kampagne, så
// procenten regnes mod den oprindelige total (antal lagt i kø).
// "processed" = done + failed, så linjen når 100% når køen er tømt.
export const getCvrEnrichmentQueueStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data: latest, error: latestErr } = await supabaseAdmin
      .from("cvr_enrichment_jobs")
      .select("campaign_id, created_at")
      .not("campaign_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) throw new Error(latestErr.message);
    if (!latest?.campaign_id) {
      return {
        campaign_id: null as string | null,
        total: 0, done: 0, failed: 0, pending: 0, processing: 0,
        started_at: null as string | null,
        finished_at: null as string | null,
      };
    }
    const { data: jobs, error } = await supabaseAdmin
      .from("cvr_enrichment_jobs")
      .select("status, company_ids, created_at, finished_at")
      .eq("campaign_id", latest.campaign_id);
    if (error) throw new Error(error.message);
    let total = 0, done = 0, failed = 0, pending = 0, processing = 0;
    let startedAt: string | null = null;
    let finishedAt: string | null = null;
    let allDoneOrFailed = true;
    for (const r of jobs ?? []) {
      const n = Array.isArray((r as any).company_ids) ? (r as any).company_ids.length : 0;
      const s = (r as any).status as string;
      total += n;
      if (s === "done") done += n;
      else if (s === "failed") failed += n;
      else if (s === "pending") { pending += n; allDoneOrFailed = false; }
      else if (s === "processing") { processing += n; allDoneOrFailed = false; }
      const created = (r as any).created_at as string | null;
      const finished = (r as any).finished_at as string | null;
      if (created && (!startedAt || created < startedAt)) startedAt = created;
      if (finished && (!finishedAt || finished > finishedAt)) finishedAt = finished;
    }
    return {
      campaign_id: latest.campaign_id as string,
      total, done, failed, pending, processing,
      started_at: startedAt,
      finished_at: allDoneOrFailed ? finishedAt : null,
    };
  });

// Re-køer kun fejlede jobs (3 retries opbrugt) i seneste kampagne.
// Nulstiller attempts og last_error så worker-cron tager dem igen.
// Rører IKKE done eller processing jobs.
export const requeueFailedCvrEnrichment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data: latest, error: latestErr } = await supabaseAdmin
      .from("cvr_enrichment_jobs")
      .select("campaign_id")
      .not("campaign_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) throw new Error(latestErr.message);
    if (!latest?.campaign_id) return { requeued: 0 };
    const { data: updated, error } = await supabaseAdmin
      .from("cvr_enrichment_jobs")
      .update({
        status: "pending",
        attempts: 0,
        last_error: null,
        started_at: null,
        finished_at: null,
      })
      .eq("campaign_id", latest.campaign_id)
      .eq("status", "failed")
      .select("id");
    if (error) throw new Error(error.message);
    return { requeued: updated?.length ?? 0 };
  });


// ============================================================
// Generic import-batch detalje + sletning (maskindata, agreement)
// ============================================================

export const getImportBatchInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ batch_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { data: batch, error } = await supabaseAdmin
      .from("import_batches")
      .select("id, filename, created_at, created_by, company_count, kind, item_count, payload")
      .eq("id", data.batch_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!batch) throw new Error("Batch ikke fundet");

    const kind = ((batch as any).kind ?? "companies") as
      | "companies"
      | "maskindata"
      | "agreement";

    if (kind === "maskindata") {
      const payload = ((batch as any).payload ?? {}) as {
        snapshot?: { id: string; before: Record<string, any> }[];
        created_location_ids?: string[];
      };
      const locIds = [
        ...(payload.snapshot ?? []).map((s) => s.id),
        ...(payload.created_location_ids ?? []),
      ];
      const locInfo: { id: string; address: string | null; city: string | null; company_name: string | null }[] = [];
      if (locIds.length) {
        const CHUNK = 300;
        for (let i = 0; i < locIds.length; i += CHUNK) {
          const slice = locIds.slice(i, i + CHUNK);
          const { data: rows } = await supabaseAdmin
            .from("locations")
            .select("id, address, city, company_id")
            .in("id", slice);
          const cIds = Array.from(new Set((rows ?? []).map((r: any) => r.company_id).filter(Boolean)));
          const nameMap = new Map<string, string>();
          if (cIds.length) {
            const { data: comps } = await supabaseAdmin
              .from("companies")
              .select("id, name")
              .in("id", cIds);
            (comps ?? []).forEach((c: any) => nameMap.set(c.id, c.name));
          }
          (rows ?? []).forEach((r: any) =>
            locInfo.push({
              id: r.id,
              address: r.address,
              city: r.city,
              company_name: nameMap.get(r.company_id) ?? null,
            }),
          );
        }
      }
      return {
        batch,
        kind,
        maskindata: {
          updated_count: (payload.snapshot ?? []).length,
          created_count: (payload.created_location_ids ?? []).length,
          locations: locInfo.slice(0, 500),
          total_locations: locInfo.length,
        },
      };
    }

    if (kind === "agreement") {
      const payload = ((batch as any).payload ?? {}) as { agreement_id?: string };
      let agreement: any = null;
      if (payload.agreement_id) {
        const { data: row } = await supabaseAdmin
          .from("agreements")
          .select("id, name, kp1_code, kp2_code, valid_from, valid_to, document_filename, is_public_sector, governing_party_name")
          .eq("id", payload.agreement_id)
          .maybeSingle();
        agreement = row;
      }
      return { batch, kind, agreement };
    }

    return { batch, kind };
  });

export const deleteImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ batch_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const { data: batch, error } = await supabaseAdmin
      .from("import_batches")
      .select("id, kind, payload")
      .eq("id", data.batch_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!batch) throw new Error("Batch ikke fundet");

    const kind = ((batch as any).kind ?? "companies") as
      | "companies"
      | "maskindata"
      | "agreement";

    if (kind === "maskindata") {
      const payload = ((batch as any).payload ?? {}) as {
        snapshot?: { id: string; before: Record<string, any> }[];
        created_location_ids?: string[];
      };
      // Genskriv snapshot pr. lokation (forskellige payloads, så én ad gangen)
      for (const snap of payload.snapshot ?? []) {
        const { error: uErr } = await supabaseAdmin
          .from("locations")
          .update(snap.before as any)
          .eq("id", snap.id);
        if (uErr) console.error("Rollback fejl for lokation", snap.id, uErr.message);
      }
      // Slet lokationer der blev oprettet ved importen — kun hvis de stadig kun har equipment-data
      const created = payload.created_location_ids ?? [];
      if (created.length) {
        const CHUNK = 300;
        for (let i = 0; i < created.length; i += CHUNK) {
          const slice = created.slice(i, i + CHUNK);
          await supabaseAdmin.from("locations").delete().in("id", slice);
        }
      }
      await supabaseAdmin.from("import_batches").delete().eq("id", batch.id);
      return { ok: true, kind, rolled_back: (payload.snapshot ?? []).length, deleted_locations: created.length };
    }

    if (kind === "agreement") {
      const payload = ((batch as any).payload ?? {}) as { agreement_id?: string };
      if (payload.agreement_id) {
        const { data: agr } = await supabaseAdmin
          .from("agreements")
          .select("document_path")
          .eq("id", payload.agreement_id)
          .maybeSingle();
        if (agr?.document_path) {
          await supabaseAdmin.storage.from("agreement-documents").remove([agr.document_path]);
        }
        await supabaseAdmin.from("agreements").delete().eq("id", payload.agreement_id);
      }
      await supabaseAdmin.from("import_batches").delete().eq("id", batch.id);
      return { ok: true, kind };
    }

    // companies: slet både uberørte og delvist berørte
    const companies = (await fetchAllCompaniesForBatch(batch.id, "id")) as Array<{ id: string }>;
    const ids = companies.map((c) => c.id);
    if (!ids.length) {
      await supabaseAdmin.from("import_batches").delete().eq("id", batch.id);
      return { ok: true, kind, deleted: 0 };
    }
    const [actSet, oppSet, qSet] = await Promise.all([
      fetchRelatedCompanyIds("activities", ids),
      fetchRelatedCompanyIds("sales_opportunities", ids),
      fetchRelatedCompanyIds("quotes", ids),
    ]);
    const activeSet = new Set<string>([...actSet, ...oppSet, ...qSet]);
    const toDelete = ids.filter((id) => !activeSet.has(id));
    await cascadeDeleteCompanies(toDelete);
    return { ok: true, kind, deleted: toDelete.length, skipped_active: ids.length - toDelete.length };
  });
