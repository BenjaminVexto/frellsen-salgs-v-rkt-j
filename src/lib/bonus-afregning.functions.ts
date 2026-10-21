import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { kraevIntern } from "@/lib/kraev-intern";

/**
 * Låser bonus for én sælger i én måned. Beregningen tager op til ~15 s pr.
 * sælger, så den køres med serverens rettigheder (længere tidsgrænse) efter
 * at kalderen er bekræftet som admin.
 */
export const laasBonusSaelger = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((d: unknown) =>
    z.object({ maaned: z.string().regex(/^\d{4}-\d{2}-01$/), saelger: z.string().uuid(), note: z.string().max(500).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (error || !isAdmin) throw new Error("Kun admin kan låse bonus");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: e } = await supabaseAdmin.rpc("_bonus_laas_saelger", {
      _admin: context.userId, _saelger: data.saelger, _maaned: data.maaned, _note: data.note ?? undefined,
    });
    if (e) throw new Error(e.message);
    return { ok: true };
  });

export const LOENFIL_SPAERRET = "Allerede udbetalt – jf. lønseddel";

/**
 * Grundlag for lønfilen (xlsx/CSV). Kun låste rækker med kilde = 'beregnet' —
 * historiske lønseddelrækker er allerede udbetalt og afvises her på serveren.
 */
export const hentLoenfilGrundlag = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((d: unknown) => z.object({ maaned: z.string().regex(/^\d{4}-\d{2}-01$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (error || !isAdmin) throw new Error("Kun admin kan hente lønfil");
    const [{ data: laas, error: e1 }, { data: saelgere, error: e2 }] = await Promise.all([
      context.supabase.from("bonus_laas").select("user_id, kilde, loen_1561, loen_1563").eq("maaned", data.maaned),
      context.supabase.rpc("bonus_afregning_saelgere", { _maaned: data.maaned }),
    ]);
    if (e1 || e2) throw new Error((e1 ?? e2)!.message);
    const beregnet = (laas ?? []).filter((l) => l.kilde === "beregnet");
    if (beregnet.length === 0) {
      throw new Error((laas ?? []).length > 0 ? LOENFIL_SPAERRET : "Måneden er ikke låst");
    }
    return (saelgere ?? []).flatMap((s: any) => {
      const l = beregnet.find((x) => x.user_id === s.user_id);
      return l ? [{ navn: (s.navn ?? "—") as string, loennr: (s.loennr ?? null) as string | null, loen_1561: Number(l.loen_1561) || 0, loen_1563: Number(l.loen_1563) || 0 }] : [];
    });
  });
