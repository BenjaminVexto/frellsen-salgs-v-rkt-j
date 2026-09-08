import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppRole = "admin" | "saelger" | "salgssupport";

export type EffektiveRettigheder = {
  userId: string;
  fullName: string;
  role: AppRole;
  maaSeDb: boolean;
  maaSeAnalyse: boolean;
};

/**
 * Rettigheder for en VALGT bruger — bruges af "Se som sælger", så visningen
 * følger den viste brugers rettigheder og ikke administratorens.
 * Kun admin må spørge om en anden bruger end sig selv.
 */
export const getEffektiveRettigheder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<EffektiveRettigheder> => {
    const { data: egenAdmin } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    const erAdmin = !!egenAdmin;
    const målId = data.userId === context.userId || erAdmin ? data.userId : context.userId;

    const [{ data: roleRows }, { data: profile }] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", målId),
      context.supabase
        .from("profiles")
        .select("full_name, maa_se_db, maa_se_analyse")
        .eq("id", målId)
        .maybeSingle(),
    ]);
    const roles = new Set((roleRows ?? []).map((r: any) => r.role as AppRole));
    const role: AppRole = roles.has("admin")
      ? "admin"
      : roles.has("salgssupport")
        ? "salgssupport"
        : "saelger";
    return {
      userId: målId,
      fullName: (profile as any)?.full_name ?? "",
      role,
      maaSeDb: role === "admin" || (profile as any)?.maa_se_db === true,
      maaSeAnalyse: role === "admin" || (profile as any)?.maa_se_analyse === true,
    };
  });
