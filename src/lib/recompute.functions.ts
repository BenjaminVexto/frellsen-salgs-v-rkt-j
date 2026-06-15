import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Genberegn last_sales_date / last_consumable_sales_date /
 * has_active_equipment / customer_type for alle firmaer.
 * Kaldes efter aktør- og maskine-importer så customer_type ikke
 * forbliver forældet indtil næste faktura-import.
 *
 * Sat-baseret RPC — kører på ~8s for hele kartoteket. Ikke-blokerende:
 * fejl returneres som { ok: false, error } så kalderen kan logge uden
 * at vælte selve importen.
 */
export const recomputeAllCompanyStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Authoriser: kun admin må kalde RPC'en
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) {
      return { ok: false as const, error: "Forbidden: kun administratorer" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("recompute_all_company_statuses");
    if (error) {
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const, rows: (data as number | null) ?? null };
  });
