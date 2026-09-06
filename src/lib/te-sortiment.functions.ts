import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TE_TYPE_LABEL: Record<string, string> = {
  sort: "Sort te",
  groen: "Grøn te",
  hvid: "Hvid te",
  oolong: "Oolong",
  rooibos: "Rooibos",
  urte: "Urtete",
  frugt: "Frugtte",
  matcha: "Matcha",
  chai: "Chai",
  ukendt: "Ukendt",
};

export function teTypeLabel(t: string): string {
  return TE_TYPE_LABEL[t] ?? t;
}

export type TeVare = {
  varenr: string;
  beskrivelse: string | null;
  kunder: number;
};

export type TeLinje = {
  te_type: string;
  pct: number | null;
  foerer: boolean;
  varenumre: number;
  kg: number | null;
  sidste_koeb: string | null;
  varer: TeVare[];
};

export type TeSortimentKunde = {
  vises: boolean;
  segment?: string;
  kunder_i_alt?: number;
  ukendt_linjer?: number;
  linjer?: TeLinje[];
};

/** Te-sortimentet for én virksomhed i ét serverkald. */
export const getTeSortimentKunde = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => {
    if (!input?.companyId) throw new Error("companyId krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<TeSortimentKunde> => {
    const { data: res, error } = await (context.supabase as any).rpc("te_sortiment_kunde", {
      _company_id: data.companyId,
    });
    if (error) throw new Error(error.message);
    return (res as TeSortimentKunde) ?? { vises: false };
  });

export type TeOversigtRaekke = {
  company_id: string;
  name: string;
  customer_segment_1: string | null;
  saelger: string | null;
  kg_total: number | null;
  kg_pr_type: Record<string, number> | null;
};

/** Hele te-oversigten for afdeling 21 i ét serverkald. */
export const getTeSortimentOversigt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeOversigtRaekke[]> => {
    const { data, error } = await (context.supabase as any).rpc("te_sortiment_oversigt");
    if (error) throw new Error(error.message);
    return (data as TeOversigtRaekke[]) ?? [];
  });
