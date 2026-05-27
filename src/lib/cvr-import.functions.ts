import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

const CompanySchema = z.object({
  cvr: z.string().regex(/^\d{8}$/),
  name: z.string().min(1).max(500),
  address: z.string().max(500).nullable().optional(),
  zip: z.string().max(20).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  municipality: z.string().max(120).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().max(255).nullable().optional(),
  website: z.string().max(500).nullable().optional(),
  industry: z.string().max(500).nullable().optional(),
  employees_interval: z.string().max(40).nullable().optional(),
  company_form: z.string().max(80).nullable().optional(),
});

function intervalToNumber(interval: string | null | undefined): number | null {
  if (!interval) return null;
  const parts = interval.split("_").map((p) => parseInt(p, 10));
  if (isNaN(parts[0])) return null;
  // tag midten af intervallet
  if (parts.length > 1 && !isNaN(parts[1])) return Math.round((parts[0] + parts[1]) / 2);
  return parts[0];
}

export const importCompaniesFromCvr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ companies: z.array(CompanySchema).min(1).max(25000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");

    const cvrs = data.companies.map((c) => c.cvr);
    const { data: existing } = await supabaseAdmin
      .from("companies")
      .select("id, cvr")
      .in("cvr", cvrs);
    const existingMap = new Map((existing ?? []).map((r) => [r.cvr as string, r.id as string]));

    const toInsert = data.companies.filter((c) => !existingMap.has(c.cvr));
    const insertedIds: string[] = [];
    if (toInsert.length) {
      const rows = toInsert.map((c) => ({
        cvr: c.cvr,
        name: c.name,
        address: c.address ?? null,
        zip: c.zip ?? null,
        city: c.city ?? null,
        municipality: c.municipality ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        website: c.website ?? null,
        industry: c.industry ?? null,
        employees: intervalToNumber(c.employees_interval ?? null),
        sources: ["cvr"],
        source_created_by: context.userId,
        source_updated_at: new Date().toISOString(),
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { data: ins, error } = await supabaseAdmin
          .from("companies")
          .insert(slice)
          .select("id, cvr");
        if (error) throw new Error(error.message);
        (ins ?? []).forEach((r) => {
          existingMap.set(r.cvr as string, r.id as string);
          insertedIds.push(r.id as string);
        });
      }
    }

    const allIds = data.companies.map((c) => existingMap.get(c.cvr)!).filter(Boolean);
    return {
      inserted: insertedIds.length,
      already_existed: data.companies.length - insertedIds.length,
      company_ids: allIds,
      inserted_ids: insertedIds,
    };
  });

export const checkCvrConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const user = process.env.CVR_USERNAME;
    const pass = process.env.CVR_PASSWORD;
    if (!user || !pass) return { configured: false, ok: false, error: "Mangler CVR_USERNAME/CVR_PASSWORD" };
    try {
      const auth = Buffer.from(`${user}:${pass}`).toString("base64");
      const res = await fetch(
        "http://distribution.virk.dk/cvr-permanent/virksomhed/_search",
        {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify({ size: 1, query: { match_all: {} } }),
        },
      );
      if (!res.ok) return { configured: true, ok: false, error: `HTTP ${res.status}` };
      return { configured: true, ok: true };
    } catch (e: any) {
      return { configured: true, ok: false, error: e?.message ?? "NETWORK_ERROR" };
    }
  });
