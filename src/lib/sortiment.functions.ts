import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SortimentVare = {
  varenr: string;
  beskrivelse: string | null;
  kunder: number;
};

export type SortimentGruppe = {
  gruppe: string;
  navn: string;
  pct: number | null;
  varer: SortimentVare[];
};

export type SortimentDaekning = {
  vises: boolean;
  segment?: string;
  kunder_i_alt?: number;
  paalidelig?: boolean;
  relevante_i_alt?: number;
  foerer_relevante?: number;
  mangler_i_alt?: number;
  foerer?: { gruppe: string; navn: string }[];
  mangler?: SortimentGruppe[];
};

/** Hele sortimentsdækningen for én virksomhed i ét serverkald. */
export const getSortimentDaekning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => {
    if (!input?.companyId) throw new Error("companyId krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<SortimentDaekning> => {
    const { data: res, error } = await (context.supabase as any).rpc("sortiment_daekning", {
      _company_id: data.companyId,
    });
    if (error) throw new Error(error.message);
    return (res as SortimentDaekning) ?? { vises: false };
  });
