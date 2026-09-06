import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const norm = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

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

export type DubletPost = {
  id: string;
  name: string;
  visma_id: string | null;
  afdeling_nr: number | null;
  created_in_visma: string | null;
  zip: string | null;
  address: string | null;
  visma_enhed: string | null;
  sidste_varekoeb: string | null;
  omsaetning_12m: number | null;
};

export type DubletPar = {
  cvr: string;
  lighed: number;
  samme_postnr: boolean;
  samme_adresse: boolean;
  identisk_navn: boolean;
  /** 1 = forskellig adresse, 2 = samme adresse men forskellig enhed, 3 = sandsynlig dublet */
  kategori: "leveringssted" | "separat_enhed" | "dublet";
  afvist_at: string | null;
  afloest_af_company_id: string | null;
  er_offentlig: boolean;
  doed: DubletPost;
  aktiv: DubletPost;
};

/**
 * Kandidater til "afløst af" er PAR: en død debitorpost (intet salg, intet
 * aktivt udstyr) sammen med den aktive søskende under samme CVR, hvor de
 * normaliserede navne er mindst 60% ens. Samme CVR alene er ikke nok — en
 * kommune har ét CVR og mange selvstændige institutioner.
 */
export const getDubletKandidater = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);

    const { data, error } = await (supabaseAdmin as any).rpc("dublet_kandidater");
    if (error) throw new Error(error.message);

    const par: DubletPar[] = ((data ?? []) as any[]).map((r) => ({
      cvr: r.cvr ?? "",
      lighed: Number(r.lighed ?? 0),
      samme_postnr: !!r.samme_postnr,
      samme_adresse: !!r.samme_adresse,
      identisk_navn: Number(r.lighed ?? 0) >= 0.999,
      afvist_at: r.dead_afvist_at ?? null,
      afloest_af_company_id: r.dead_afloest_af_company_id ?? null,
      er_offentlig: r.dead_binding_status === "offentlig_aftale",
      kategori: !r.samme_adresse
        ? ("leveringssted" as const)
        : norm(r.dead_visma_enhed) && norm(r.alive_visma_enhed) &&
            norm(r.dead_visma_enhed) !== norm(r.alive_visma_enhed)
          ? ("separat_enhed" as const)
          : ("dublet" as const),
      doed: {
        id: r.dead_id,
        name: r.dead_name,
        visma_id: r.dead_visma_id ?? null,
        afdeling_nr: r.dead_afdeling_nr ?? null,
        created_in_visma: r.dead_created_in_visma ?? null,
        zip: r.dead_zip ?? null,
        address: r.dead_address ?? null,
        visma_enhed: r.dead_visma_enhed ?? null,
        sidste_varekoeb: null,
        omsaetning_12m: null,
      },
      aktiv: {
        id: r.alive_id,
        name: r.alive_name,
        visma_id: r.alive_visma_id ?? null,
        afdeling_nr: r.alive_afdeling_nr ?? null,
        created_in_visma: r.alive_created_in_visma ?? null,
        zip: r.alive_zip ?? null,
        address: r.alive_address ?? null,
        visma_enhed: r.alive_visma_enhed ?? null,
        sidste_varekoeb: r.alive_last_varekoeb ?? null,
        omsaetning_12m:
          r.alive_turnover_12m != null ? Number(r.alive_turnover_12m) : null,
      },
    }));

    return { par };
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

/** Markér forslaget som "ikke en dublet" — eller fortryd afvisningen. */
export const setDubletAfvist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        afvist: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { error } = await (supabaseAdmin as any)
      .from("companies")
      .update({ dublet_afvist_at: data.afvist ? new Date().toISOString() : null })
      .eq("id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
