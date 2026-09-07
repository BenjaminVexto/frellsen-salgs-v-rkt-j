import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AnalyseOpdeling =
  | "kunde"
  | "varegruppe"
  | "kundeprisgruppe"
  | "saelger"
  | "region"
  | "postnummer";

export type AnalysePivotRow = {
  noegle: string;
  navn: string | null;
  omsaetning: number;
  kg: number;
  stk: number;
  db: number | null;
  antal_kunder: number;
};

export type AnalyseFiltre = {
  saelgere: { id: string; navn: string }[];
  prisgrupper: string[];
  varegrupper: { kode: string; navn: string }[];
};

const pivotInput = z.object({
  fra: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  til: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  opdel: z.enum(["kunde", "varegruppe", "kundeprisgruppe", "saelger", "region", "postnummer"]),
  afdelingNr: z.number().int(),
  saelgerIds: z.array(z.string().uuid()).nullable().optional(),
  kundeprisgrupper: z.array(z.string()).nullable().optional(),
  varegrupper: z.array(z.string()).nullable().optional(),
  regioner: z.array(z.string()).nullable().optional(),
});

/**
 * Pivottabel til analysefanen. Afgrænsning sker på sales_monthly.afdeling_nr
 * (bogføringsafdeling) — filtre på sælger/kundeprisgruppe læses fra companies.
 * RLS gælder uændret: funktionen i databasen er SECURITY INVOKER.
 */
export const getAnalysePivot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pivotInput.parse(input))
  .handler(async ({ data, context }): Promise<AnalysePivotRow[]> => {
    // PostgREST returnerer højst 1.000 rækker pr. kald — hent alle sider,
    // ellers bliver totalrækken forkert ved opdeling pr. kunde.
    const PAGE = 1000;
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await (context.supabase as any)
        .rpc("analyse_pivot", {
          _fra: data.fra,
          _til: data.til,
          _opdel: data.opdel,
          _afdeling_nr: data.afdelingNr,
          _saelger_ids: data.saelgerIds?.length ? data.saelgerIds : null,
          _kundeprisgrupper: data.kundeprisgrupper?.length ? data.kundeprisgrupper : null,
          _varegrupper: data.varegrupper?.length ? data.varegrupper : null,
          _regioner: data.regioner?.length ? data.regioner : null,
        })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const arr = (page ?? []) as any[];
      rows.push(...arr);
      if (arr.length < PAGE) break;
    }
    return (rows as any[]).map((r) => ({
      noegle: String(r.noegle),
      navn: r.navn ?? null,
      omsaetning: Number(r.omsaetning) || 0,
      kg: Number(r.kg) || 0,
      stk: Number(r.stk) || 0,
      db: r.db == null ? null : Number(r.db) || 0,
      antal_kunder: Number(r.antal_kunder) || 0,
    }));
  });

export const getAnalyseFiltre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        afdelingNr: z.number().int(),
        fra: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        til: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AnalyseFiltre> => {
    const { data: json, error } = await (context.supabase as any).rpc("analyse_filtre", {
      _afdeling_nr: data.afdelingNr,
      _fra: data.fra,
      _til: data.til,
    });
    if (error) throw new Error(error.message);
    const j = (json ?? {}) as any;
    return {
      saelgere: (j.saelgere ?? []).map((s: any) => ({ id: String(s.id), navn: String(s.navn ?? "—") })),
      prisgrupper: (j.prisgrupper ?? []).map((p: any) => String(p)),
      varegrupper: (j.varegrupper ?? []).map((v: any) => ({
        kode: String(v.kode),
        navn: String(v.navn ?? v.kode),
      })),
    };
  });
