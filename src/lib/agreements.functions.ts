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

const BUCKET = "agreement-documents";

export const AGREEMENT_TYPES = ["offentlig", "erhverv", "ski", "ukendt"] as const;
export type AgreementType = (typeof AGREEMENT_TYPES)[number];

const baseInput = {
  name: z.string().trim().min(1).max(255),
  kp1_code: z.string().trim().max(50).nullable().optional(),
  kp2_code: z.string().trim().max(50).nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
  is_public_sector: z.boolean(),
  governing_party_name: z.string().trim().max(255).nullable().optional(),
  governing_party_company_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  aftale_type: z.enum(AGREEMENT_TYPES).optional(),
  aftale_type_manuel: z.boolean().optional(),
};

// Henter alle agreements + tæller virksomheder via customer_segment_1 KP-kode prefix
export const listAgreements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: agreements, error } = await supabaseAdmin
      .from("agreements")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const rows = agreements ?? [];
    const counts: Record<string, number> = {};

    await Promise.all(
      rows.map(async (a: any) => {
        if (!a.kp1_code) {
          counts[a.id] = 0;
          return;
        }
        const code = String(a.kp1_code).trim();
        // Matcher fx "112 [Techno]" eller "112 ..." eller præcis "112"
        // Matcher "112", "112 ...", "112\t..." — dvs. koden efterfulgt af whitespace eller exakt match
        const { count, error: cErr } = await supabaseAdmin
          .from("companies")
          .select("id", { count: "exact", head: true })
          .or(
            `customer_segment_1.eq.${code},customer_segment_1.ilike.${code} %,customer_segment_1.ilike.${code}\t%`,
          );
        if (cErr) {
          counts[a.id] = 0;
          return;
        }
        counts[a.id] = count ?? 0;
      }),
    );

    return rows.map((a: any) => ({ ...a, company_count: counts[a.id] ?? 0 }));
  });

export const createAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object(baseInput).parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("agreements")
      .insert({
        name: data.name,
        kp1_code: data.kp1_code ?? null,
        kp2_code: data.kp2_code ?? null,
        valid_from: data.valid_from ?? null,
        valid_to: data.valid_to ?? null,
        is_public_sector: data.is_public_sector,
        governing_party_name: data.governing_party_name ?? null,
        governing_party_company_id: data.governing_party_company_id ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Registrér i importhistorik så aftalen kan slettes derfra
    await supabaseAdmin.from("import_batches").insert({
      kind: "agreement",
      filename: `Aftale: ${data.name}`,
      created_by: context.userId,
      company_count: 0,
      item_count: 1,
      payload: { agreement_id: row.id } as any,
    });

    return { id: row.id };
  });

export const updateAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), ...baseInput }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { id, ...rest } = data;
    const { error } = await supabaseAdmin
      .from("agreements")
      .update({
        name: rest.name,
        kp1_code: rest.kp1_code ?? null,
        kp2_code: rest.kp2_code ?? null,
        valid_from: rest.valid_from ?? null,
        valid_to: rest.valid_to ?? null,
        is_public_sector: rest.is_public_sector,
        governing_party_name: rest.governing_party_name ?? null,
        governing_party_company_id: rest.governing_party_company_id ?? null,
        notes: rest.notes ?? null,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { data: row } = await supabaseAdmin
      .from("agreements")
      .select("document_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.document_path) {
      await supabaseAdmin.storage.from(BUCKET).remove([row.document_path]);
    }
    const { error } = await supabaseAdmin
      .from("agreements")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const uploadAgreementDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        agreement_id: z.string().uuid(),
        filename: z.string().trim().min(1).max(255),
        file_base64: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const buffer = Buffer.from(data.file_base64, "base64");
    if (buffer.byteLength > 10 * 1024 * 1024) {
      throw new Error("Filen er for stor (max 10 MB)");
    }

    const { data: existing } = await supabaseAdmin
      .from("agreements")
      .select("document_path")
      .eq("id", data.agreement_id)
      .maybeSingle();
    if (existing?.document_path) {
      await supabaseAdmin.storage.from(BUCKET).remove([existing.document_path]);
    }

    const safeName = data.filename.replace(/[^\w.\-]+/g, "_");
    const path = `${data.agreement_id}/${Date.now()}_${safeName}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { error: dbErr } = await supabaseAdmin
      .from("agreements")
      .update({ document_path: path, document_filename: data.filename })
      .eq("id", data.agreement_id);
    if (dbErr) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw new Error(dbErr.message);
    }
    return { path };
  });

export const getAgreementDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ agreement_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("agreements")
      .select("document_path, document_filename")
      .eq("id", data.agreement_id)
      .maybeSingle();
    if (!row?.document_path) throw new Error("Intet dokument");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(row.document_path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, filename: row.document_filename };
  });

export const downloadAgreementDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ agreement_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("agreements")
      .select("document_path, document_filename")
      .eq("id", data.agreement_id)
      .maybeSingle();
    if (!row?.document_path) throw new Error("Intet dokument");
    const { data: file, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(row.document_path);
    if (error || !file) throw new Error(error?.message ?? "Kunne ikke hente fil");
    const buf = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    return {
      base64,
      filename: row.document_filename ?? "aftale.pdf",
      content_type: "application/pdf",
    };
  });

// ============================================================
// Agreement detail + companies + lookup by KP1
// ============================================================

export const getAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("agreements")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Aftale ikke fundet");
    return row;
  });

export const listAgreementCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: agr, error: aErr } = await supabaseAdmin
      .from("agreements")
      .select("kp1_code")
      .eq("id", data.id)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!agr?.kp1_code) return [];
    const code = String(agr.kp1_code).trim();
    const PAGE = 1000;
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await supabaseAdmin
        .from("companies")
        .select(
          "id, name, city, zip, assigned_to, customer_segment_1, customer_segment_2, last_purchase_date",
        )
        .or(
          `customer_segment_1.eq.${code},customer_segment_1.ilike.${code} %,customer_segment_1.ilike.${code}[%,customer_segment_1.ilike.${code}\t%`,
        )
        .order("name", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!page?.length) break;
      rows.push(...page);
      if (page.length < PAGE) break;
    }

    const sellerIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.assigned_to).filter(Boolean)),
    );
    const sellerMap: Record<string, string> = {};
    if (sellerIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", sellerIds);
      (profs ?? []).forEach((p: any) => {
        sellerMap[p.id] = p.full_name;
      });
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      seller_name: r.assigned_to ? sellerMap[r.assigned_to] ?? null : null,
    }));
  });

export const getAgreementByKp1 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ kp1: z.string().trim().min(1).max(50) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("agreements")
      .select("id, name, is_public_sector")
      .eq("kp1_code", data.kp1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

// ============================================================
// Import af aftale-emner: CVR-liste → opretter/matcher virksomheder,
// opretter kontaktliste og tildeler alle til listen
// ============================================================

function normCvr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const digits = String(v).replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : null;
}

export const previewAgreementProspects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      cvrs: z.array(z.string()).min(1).max(20000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const normalized = Array.from(
      new Set(data.cvrs.map((c) => normCvr(c)).filter((v): v is string => !!v)),
    );
    if (!normalized.length) return { existing: [], missing: [], total: 0 };
    const existing = new Set<string>();
    for (let i = 0; i < normalized.length; i += 500) {
      const slice = normalized.slice(i, i + 500);
      const { data: rows, error } = await supabaseAdmin
        .from("companies")
        .select("cvr")
        .in("cvr", slice);
      if (error) throw new Error(error.message);
      (rows ?? []).forEach((r: any) => r.cvr && existing.add(r.cvr));
    }
    const missing = normalized.filter((c) => !existing.has(c));
    return {
      existing: Array.from(existing),
      missing,
      total: normalized.length,
    };
  });

export const importAgreementProspects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      agreement_id: z.string().uuid(),
      list_name: z.string().trim().min(1).max(255),
      rows: z.array(z.object({
        cvr: z.string(),
        name: z.string().trim().max(255).optional(),
      })).min(1).max(20000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const { data: agr, error: aErr } = await supabaseAdmin
      .from("agreements")
      .select("kp1_code, is_public_sector")
      .eq("id", data.agreement_id)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);

    const seen = new Set<string>();
    const incoming: { cvr: string; name: string | null }[] = [];
    for (const r of data.rows) {
      const cvr = normCvr(r.cvr);
      if (!cvr || seen.has(cvr)) continue;
      seen.add(cvr);
      incoming.push({ cvr, name: r.name?.trim() || null });
    }
    if (!incoming.length) {
      throw new Error("Ingen gyldige CVR-numre i filen");
    }

    const allCvrs = incoming.map((r) => r.cvr);
    // Multi-match: én CVR kan tilhøre flere companies (multi-CVR/koncern).
    // Vi binder aftale-emnet til ALLE matchende companies i stedet for
    // arbitrært at vælge én via en Map<cvr,id> som overskriver dubletter.
    const existingMap = new Map<string, string[]>();
    for (let i = 0; i < allCvrs.length; i += 500) {
      const slice = allCvrs.slice(i, i + 500);
      const { data: rows, error } = await supabaseAdmin
        .from("companies")
        .select("id, cvr")
        .in("cvr", slice);
      if (error) throw new Error(error.message);
      (rows ?? []).forEach((r: any) => {
        const list = existingMap.get(r.cvr) ?? [];
        list.push(r.id);
        existingMap.set(r.cvr, list);
      });
    }

    const toInsert = incoming
      .filter((r) => !existingMap.has(r.cvr))
      .map((r) => ({
        cvr: r.cvr,
        name: r.name || `CVR ${r.cvr}`,
        customer_segment_1: agr?.kp1_code ?? null,
        is_public: agr?.is_public_sector ?? false,
        sources: ["aftale-import"],
        source: "aftale-import",
        source_created_by: context.userId,
      }));

    let createdCount = 0;
    if (toInsert.length) {
      for (let i = 0; i < toInsert.length; i += 500) {
        const slice = toInsert.slice(i, i + 500);
        const { data: inserted, error } = await supabaseAdmin
          .from("companies")
          .insert(slice as any)
          .select("id, cvr");
        if (error) throw new Error(error.message);
        (inserted ?? []).forEach((r: any) => {
          const list = existingMap.get(r.cvr) ?? [];
          list.push(r.id);
          existingMap.set(r.cvr, list);
          createdCount++;
        });
      }
    }


    const { data: list, error: listErr } = await supabaseAdmin
      .from("contact_lists")
      .insert({
        name: data.list_name,
        description: "Auto-oprettet fra aftale-emne import",
        purpose: "aftale-emner",
        created_by: context.userId,
        is_active: true,
      })
      .select("id")
      .single();
    if (listErr) throw new Error(listErr.message);

    // Flad ud: én aftale-emne-binding per (cvr × matchende company).
    // Dedupé på company_id i fald samme firma optræder via flere CVR-rækker.
    const companyIdsForAssignment = new Set<string>();
    for (const r of incoming) {
      const ids = existingMap.get(r.cvr) ?? [];
      for (const id of ids) companyIdsForAssignment.add(id);
    }
    const assignments = Array.from(companyIdsForAssignment).map((company_id) => ({
      contact_list_id: list.id,
      company_id,
      status: "ny" as const,
      priority: "middel" as const,
    }));


    let assigned = 0;
    for (let i = 0; i < assignments.length; i += 500) {
      const slice = assignments.slice(i, i + 500);
      const { error, count } = await supabaseAdmin
        .from("contact_list_assignments")
        .insert(slice as any, { count: "exact" });
      if (error) throw new Error(error.message);
      assigned += count ?? slice.length;
    }

    return {
      list_id: list.id as string,
      total: incoming.length,
      created: createdCount,
      matched: incoming.length - createdCount,
      assigned,
      company_ids: Array.from(companyIdsForAssignment),
    };
  });

// Klient-side helper med samme regler som public.derive_agreement_type i SQL
export function deriveAgreementTypeFromName(name: string | null | undefined): AgreementType {
  const n = (name ?? "").trim();
  if (!n) return "ukendt";
  if (/\b(SKI|T-SKI)\b|rammeaftale|f[æa]llesindk[øo]b|samk[øo]b|kommuneindk[øo]b/i.test(n)) return "ski";
  if (/kommune|region(shospital)?|\bSKAT\b|politi|\bADST\b|ministeri|styrelse|universitet|gymnasium|folkeskole|hospital|sygehus|forsvar|departement/i.test(n)) return "offentlig";
  return "erhverv";
}

export const setAgreementType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      aftale_type: z.enum(AGREEMENT_TYPES),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("agreements")
      .update({
        aftale_type: data.aftale_type,
        aftale_type_manuel: true,
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
