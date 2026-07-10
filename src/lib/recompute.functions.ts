import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Genberegn last_sales_date / last_consumable_sales_date /
 * has_active_equipment / customer_type for alle firmaer.
 * Kaldes efter aktør- og maskine-importer så customer_type ikke
 * forbliver forældet indtil næste faktura-import.
 *
 * Batchet variant: tidligere kørte hele kartoteket i ét sat-baseret
 * RPC-kald (~8s), men datamængden er vokset markant og rammer nu
 * Postgres' statement-timeout. Vi henter derfor alle virksomheds-ID'er
 * og kalder recompute_company_statuses_batch i bidder af 1.000.
 * Fejl returneres som { ok: false, error } så kalderen kan logge uden
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

    const { data: companies, error: idsErr } = await supabaseAdmin
      .from("companies")
      .select("id");
    if (idsErr) {
      return { ok: false as const, error: idsErr.message };
    }
    const ids = (companies ?? []).map((c: { id: string }) => c.id);

    const CHUNK = 1000;
    let totalRows = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error } = await supabaseAdmin.rpc(
        "recompute_company_statuses_batch",
        { _company_ids: slice },
      );
      if (error) {
        return {
          ok: false as const,
          error: `Batch ${i}-${i + slice.length} fejlede: ${error.message}`,
        };
      }
      totalRows += (data as number | null) ?? 0;
    }
    return { ok: true as const, rows: totalRows };
  });
