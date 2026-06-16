import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProductRow = {
  varenr: string;
  beskrivelse: string | null;
  produktprisgruppe_1: string | null;
  produktprisgruppe_2: string | null;
  produktprisgruppe_3: string | null;
  kategori: string | null;
  kategori_manuel: boolean;
  listepris: number | null;
  udlejningspris: number | null;
  kan_lejes: boolean;
  kilde: string;
  record_status: string;
  is_tilbudsegnet: boolean;
  salgsbeskrivelse: string | null;
  billede_url: string | null;
  sort_order: number | null;
  updated_at: string;
};

export const KATEGORI_VALUES = [
  "kaffe",
  "te",
  "chokolade",
  "maelk",
  "maskine",
  "tilbehoer",
  "ovrigt",
] as const;

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: kun administratorer");
}

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProductRow[]> => {
    await assertAdmin(context);
    const PAGE = 1000;
    const out: ProductRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await context.supabase
        .from("products" as any)
        .select("*")
        .order("varenr", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as ProductRow[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  });

const UpdateSchema = z
  .object({
    varenr: z.string().min(1),
    is_tilbudsegnet: z.boolean().optional(),
    kategori: z.enum(KATEGORI_VALUES).optional(),
    kategori_reset: z.boolean().optional(),
    salgsbeskrivelse: z.string().max(2000).nullable().optional(),
    sort_order: z.number().int().nullable().optional(),
    billede_url: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const updateProductSalesFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    // Hent eksisterende række (for record_status-check + auto_kategori ved reset)
    const { data: existing, error: getErr } = await context.supabase
      .from("products" as any)
      .select("varenr, record_status, kategori")
      .eq("varenr", data.varenr)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!existing) throw new Error("Produkt findes ikke");

    const patch: Record<string, unknown> = {};

    if (data.is_tilbudsegnet !== undefined) {
      if (
        data.is_tilbudsegnet === true &&
        (existing as any).record_status === "udgaaet"
      ) {
        throw new Error("Udgåede varer kan ikke sættes som tilbudsegnede");
      }
      patch.is_tilbudsegnet = data.is_tilbudsegnet;
    }

    if (data.kategori_reset) {
      // Genopbygning får lov at sætte kategori automatisk igen
      patch.kategori_manuel = false;
    } else if (data.kategori !== undefined) {
      patch.kategori = data.kategori;
      patch.kategori_manuel = true;
    }

    if (data.salgsbeskrivelse !== undefined)
      patch.salgsbeskrivelse = data.salgsbeskrivelse;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    if (data.billede_url !== undefined) patch.billede_url = data.billede_url;

    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await context.supabase
      .from("products" as any)
      .update(patch)
      .eq("varenr", data.varenr);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
