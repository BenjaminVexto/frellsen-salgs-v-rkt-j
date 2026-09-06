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

export type DubletSoeskende = {
  id: string;
  name: string;
  visma_id: string | null;
  afdeling_nr: number | null;
  sidste_varekoeb: string | null;
  omsaetning_12m: number | null;
};

export type DubletKandidat = {
  id: string;
  name: string;
  cvr: string;
  visma_id: string | null;
  afdeling_nr: number | null;
  created_in_visma: string | null;
  afloest_af_company_id: string | null;
  afloest_af_navn: string | null;
  soeskende: DubletSoeskende[];
};

const KAND_COLS =
  "id,name,cvr,visma_id,afdeling_nr,created_in_visma,afloest_af_company_id";
const SIB_COLS =
  "id,name,cvr,visma_id,afdeling_nr,last_sales_date,last_purchase_date,turnover_12m";

/**
 * Kandidater til "afløst af": virksomheder der deler CVR med mindst én anden
 * virksomhed, og som selv er tomme (intet salg, intet aktivt udstyr).
 */
export const getDubletKandidater = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);

    const PAGE = 1000;
    const kandidater: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseAdmin
        .from("companies")
        .select(KAND_COLS)
        .not("cvr", "is", null)
        .is("last_purchase_date", null)
        .is("last_sales_date", null)
        .eq("has_active_equipment", false)
        .order("name")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const batch = data ?? [];
      kandidater.push(...batch);
      if (batch.length < PAGE) break;
    }

    const cvrs = Array.from(
      new Set(
        kandidater
          .map((c) => (c.cvr ?? "").trim())
          .filter((v) => v.length > 0),
      ),
    );
    if (!cvrs.length) return { kandidater: [] as DubletKandidat[] };

    const byCvr = new Map<string, any[]>();
    for (let i = 0; i < cvrs.length; i += 200) {
      const slice = cvrs.slice(i, i + 200);
      const { data, error } = await supabaseAdmin
        .from("companies")
        .select(SIB_COLS)
        .in("cvr", slice);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as any[]) {
        const key = (row.cvr ?? "").trim();
        const arr = byCvr.get(key) ?? [];
        arr.push(row);
        byCvr.set(key, arr);
      }
    }

    const navnById = new Map<string, string>();
    for (const arr of byCvr.values())
      for (const r of arr) navnById.set(r.id, r.name);

    const result: DubletKandidat[] = [];
    for (const k of kandidater) {
      const cvr = (k.cvr ?? "").trim();
      const group = byCvr.get(cvr) ?? [];
      if (group.length < 2) continue;
      const soeskende: DubletSoeskende[] = group
        .filter((r) => r.id !== k.id)
        .map((r) => ({
          id: r.id,
          name: r.name,
          visma_id: r.visma_id ?? null,
          afdeling_nr: r.afdeling_nr ?? null,
          sidste_varekoeb: r.last_sales_date ?? r.last_purchase_date ?? null,
          omsaetning_12m: r.turnover_12m != null ? Number(r.turnover_12m) : null,
        }))
        .sort((a, b) => (b.omsaetning_12m ?? 0) - (a.omsaetning_12m ?? 0));
      result.push({
        id: k.id,
        name: k.name,
        cvr,
        visma_id: k.visma_id ?? null,
        afdeling_nr: k.afdeling_nr ?? null,
        created_in_visma: k.created_in_visma ?? null,
        afloest_af_company_id: k.afloest_af_company_id ?? null,
        afloest_af_navn: k.afloest_af_company_id
          ? (navnById.get(k.afloest_af_company_id) ?? null)
          : null,
        soeskende,
      });
    }

    return { kandidater: result };
  });

/** Sæt eller fjern markeringen "afløst af". */
export const setAfloestAf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        afloest_af_company_id: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    if (data.afloest_af_company_id === data.company_id)
      throw new Error("En virksomhed kan ikke afløse sig selv");
    const { error } = await supabaseAdmin
      .from("companies")
      .update({ afloest_af_company_id: data.afloest_af_company_id })
      .eq("id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
