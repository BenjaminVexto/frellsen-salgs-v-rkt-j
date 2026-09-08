import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Kun administratorer kan importere salgsdata");
}

/**
 * Slå mange (afdeling, delivery_no)-par op én gang fra klienten. Nøglen i det
 * returnerede map er `${afdeling_nr}|${visma_delivery_no}` — afdeling SKAL med,
 * ellers kobles en Høyberg-faktura til en Frellsen-lokation.
 * Bruges kun til at vise hvor mange leveringsnumre der er kendt; koblingen
 * mellem salgsrækker og lokation sker i databasen ved aggregeringen.
 */
export const resolveDeliveryNos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pairs: Array<{ afdeling_nr: number; visma_delivery_no: string }> }) => {
    if (!Array.isArray(input?.pairs)) throw new Error("pairs skal være array");
    return input;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ map: Record<string, { location_id: string; company_id: string }> }> => {
      await assertAdmin(context.supabase, context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const byAfdeling = new Map<number, Set<string>>();
      for (const p of data.pairs) {
        if (!p?.visma_delivery_no || !Number.isFinite(p?.afdeling_nr)) continue;
        const set = byAfdeling.get(p.afdeling_nr) ?? new Set<string>();
        set.add(p.visma_delivery_no);
        byAfdeling.set(p.afdeling_nr, set);
      }
      const map: Record<string, { location_id: string; company_id: string }> = {};
      const SLICE = 500;
      for (const [afdeling, set] of byAfdeling.entries()) {
        const uniq = Array.from(set);
        for (let i = 0; i < uniq.length; i += SLICE) {
          const slice = uniq.slice(i, i + SLICE);
          const { data: rows, error } = await supabaseAdmin
            .from("locations")
            .select("id, company_id, visma_delivery_no, afdeling_nr")
            .eq("afdeling_nr", afdeling)
            .in("visma_delivery_no", slice);
          if (error) throw new Error(error.message);
          for (const r of rows ?? []) {
            const k = `${afdeling}|${r.visma_delivery_no as string}`;
            if (r.visma_delivery_no && !map[k]) {
              map[k] = { location_id: r.id, company_id: r.company_id };
            }
          }
        }
      }
      return { map };
    },
  );

/**
 * Browseren har parset filen og uploadet rålinje-chunks ({jobId}/lines-N.json)
 * til invoice-uploads. Denne fn registrerer jobbet i "lines"-fasen — workeren
 * skriver linjerne, rydder de gamle, genberegner aggregaterne i databasen og
 * kobler salgsrækker til lokationer.
 */
export const enqueueInvoiceImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      jobId: string;
      locationsMatched: number;
      unmatched: string[];
      rowsByAfdeling?: Record<string, number>;
      totalLines?: number;
      linesBatchId?: string | null;
      dateFrom?: string | null;
      dateTo?: string | null;
      afdelinger?: number[];
    }) => {
      if (!input?.jobId) throw new Error("jobId mangler");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ jobId: string }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const totalLines = data.totalLines ?? 0;
    // Rålinjer skrives FØRST. Først når alle linjer står i databasen ryddes de
    // gamle (fase "prune") — fejler uploaden undervejs, står de gamle urørt.
    const firstPhase = totalLines > 0 ? "lines" : "done";

    const { error } = await supabaseAdmin.from("invoice_import_jobs").insert({
      id: data.jobId,
      user_id: context.userId,
      status: firstPhase === "done" ? "completed" : "queued",
      phase: firstPhase,
      file_path: null,
      aggregated_path: data.jobId, // chunk-prefix i invoice-uploads bucket
      total_monthly: 0,
      total_top: 0,
      total_top_monthly: 0,
      saved_monthly: 0,
      saved_top: 0,
      saved_top_monthly: 0,
      total_lines: totalLines,
      saved_lines: 0,
      lines_deleted: 0,
      prune_month_idx: 0,
      aggregate_month_idx: 0,
      months_rebuilt: 0,
      lines_batch_id: data.linesBatchId ?? null,
      lines_date_from: data.dateFrom ?? null,
      lines_date_to: data.dateTo ?? null,
      lines_afdelinger: data.afdelinger ?? [],
      locations_matched: data.locationsMatched,
      unmatched_delivery_nos: data.unmatched.slice(0, 500),
      payload: { rows_by_afdeling: data.rowsByAfdeling ?? {} },
      attempts: 0,
    } as any);
    if (error) throw new Error(error.message);
    return { jobId: data.jobId };
  });
