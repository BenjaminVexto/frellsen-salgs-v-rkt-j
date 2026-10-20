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
