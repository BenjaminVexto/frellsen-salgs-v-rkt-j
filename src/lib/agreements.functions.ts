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
