/**
 * Server-only helpers til faktura-import workeren.
 * Genbruger parseAndAggregate fra invoice-parse (ren JS, kører i Worker).
 */
import { parseAndAggregate } from "./invoice-parse";
import type { MonthlyRow, TopProductRow } from "./invoice-import.functions";

export type AggregatedPayload = {
  monthly: Array<MonthlyRow & { location_id: string | null; company_id: string | null }>;
  topProducts: Array<TopProductRow & { location_id: string | null }>;
  unmatched: string[];
  matched: number;
};

const RESOLVE_SLICE = 500;

/** Slå alle delivery_nos op i locations-tabellen og returnér map. */
export async function resolveDeliveryMap(
  supabaseAdmin: any,
  deliveryNos: string[],
): Promise<{
  map: Record<string, { location_id: string; company_id: string }>;
  unmatched: string[];
}> {
  const uniq = Array.from(new Set(deliveryNos.filter(Boolean)));
  const map: Record<string, { location_id: string; company_id: string }> = {};
  for (let i = 0; i < uniq.length; i += RESOLVE_SLICE) {
    const slice = uniq.slice(i, i + RESOLVE_SLICE);
    const { data: rows, error } = await supabaseAdmin
      .from("locations")
      .select("id, company_id, visma_delivery_no")
      .in("visma_delivery_no", slice);
    if (error) throw new Error(error.message);
    for (const r of rows ?? []) {
      const k = r.visma_delivery_no as string;
      if (k && !map[k]) map[k] = { location_id: r.id, company_id: r.company_id };
    }
  }
  const unmatched = uniq.filter((d) => !map[d]);
  return { map, unmatched };
}

/** Download fil fra storage, parse og berig med location_id/company_id. */
export async function parseAndResolve(
  supabaseAdmin: any,
  bucket: string,
  filePath: string,
): Promise<AggregatedPayload> {
  const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(bucket).download(filePath);
  if (dlErr || !blob) throw new Error("Kunne ikke hente fil fra storage: " + (dlErr?.message ?? "tom blob"));

  // parseAndAggregate forventer File — Blob har samme overflade vi bruger.
  // Vi tilføjer et minimalistisk name så .xlsx vs .csv-detektion virker.
  const fileName = filePath.split("/").pop() ?? "invoice.xlsx";
  const fileLike = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
  const { monthly, topProducts } = await parseAndAggregate(fileLike);

  const allDeliveryNos = [
    ...monthly.map((r) => r.visma_delivery_no),
    ...topProducts.map((r) => r.visma_delivery_no),
  ];
  const { map, unmatched } = await resolveDeliveryMap(supabaseAdmin, allDeliveryNos);

  const enrichedMonthly = monthly.map((r) => {
    const hit = map[r.visma_delivery_no];
    return { ...r, location_id: hit?.location_id ?? null, company_id: hit?.company_id ?? null };
  });
  const enrichedTop = topProducts.map((r) => {
    const hit = map[r.visma_delivery_no];
    return { ...r, location_id: hit?.location_id ?? null };
  });

  return {
    monthly: enrichedMonthly,
    topProducts: enrichedTop,
    unmatched,
    matched: Object.keys(map).length,
  };
}

const UPSERT_BATCH = 500;

export async function upsertMonthlySlice(
  supabaseAdmin: any,
  rows: AggregatedPayload["monthly"],
): Promise<number> {
  let saved = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabaseAdmin
      .from("sales_monthly")
      .upsert(batch, { onConflict: "visma_delivery_no,period,product_group_1" });
    if (error) throw new Error("sales_monthly upsert: " + error.message);
    saved += batch.length;
  }
  return saved;
}

export async function upsertTopSlice(
  supabaseAdmin: any,
  rows: AggregatedPayload["topProducts"],
): Promise<number> {
  let saved = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabaseAdmin
      .from("sales_top_products")
      .upsert(batch, { onConflict: "visma_delivery_no,varenr" });
    if (error) throw new Error("sales_top_products upsert: " + error.message);
    saved += batch.length;
  }
  return saved;
}
