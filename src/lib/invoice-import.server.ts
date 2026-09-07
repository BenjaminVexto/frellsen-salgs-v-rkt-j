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

/**
 * Slå (afdeling_nr, visma_delivery_no)-par op i locations. Nøglen i map er
 * `${afdeling_nr}|${visma_delivery_no}` — afdeling SKAL med i opslaget, ellers
 * kobles fakturaer på tværs af selskaber.
 */
export async function resolveDeliveryMap(
  supabaseAdmin: any,
  pairs: Array<{ afdeling_nr: number; visma_delivery_no: string }>,
): Promise<{
  map: Record<string, { location_id: string; company_id: string }>;
  unmatched: string[];
}> {
  const byAfdeling = new Map<number, Set<string>>();
  for (const p of pairs) {
    if (!p?.visma_delivery_no || !Number.isFinite(p?.afdeling_nr)) continue;
    const set = byAfdeling.get(p.afdeling_nr) ?? new Set<string>();
    set.add(p.visma_delivery_no);
    byAfdeling.set(p.afdeling_nr, set);
  }
  const map: Record<string, { location_id: string; company_id: string }> = {};
  const allKeys: string[] = [];
  for (const [afdeling, set] of byAfdeling.entries()) {
    const uniq = Array.from(set);
    uniq.forEach((d) => allKeys.push(`${afdeling}|${d}`));
    for (let i = 0; i < uniq.length; i += RESOLVE_SLICE) {
      const slice = uniq.slice(i, i + RESOLVE_SLICE);
      const { data: rows, error } = await supabaseAdmin
        .from("locations")
        .select("id, company_id, visma_delivery_no, afdeling_nr")
        .eq("afdeling_nr", afdeling)
        .in("visma_delivery_no", slice);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        const k = `${afdeling}|${r.visma_delivery_no as string}`;
        if (r.visma_delivery_no && !map[k]) map[k] = { location_id: r.id, company_id: r.company_id };
      }
    }
  }
  const unmatched = allKeys.filter((k) => !map[k]);
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

  const allPairs = [
    ...monthly.map((r) => ({ afdeling_nr: r.afdeling_nr, visma_delivery_no: r.visma_delivery_no })),
    ...topProducts.map((r) => ({ afdeling_nr: r.afdeling_nr, visma_delivery_no: r.visma_delivery_no })),
  ];
  const { map, unmatched } = await resolveDeliveryMap(supabaseAdmin, allPairs);

  const enrichedMonthly = monthly.map((r) => {
    const hit = map[`${r.afdeling_nr}|${r.visma_delivery_no}`];
    return { ...r, location_id: hit?.location_id ?? null, company_id: hit?.company_id ?? null };
  });
  const enrichedTop = topProducts.map((r) => {
    const hit = map[`${r.afdeling_nr}|${r.visma_delivery_no}`];
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
// sales_monthly_products er den tungeste tabel — små batches holder hver
// upsert under Postgres' statement timeout.
const TOP_MONTHLY_UPSERT_BATCH = 250;
/** Rålinjer indsættes i mindre batches for at holde os under statement timeout. */
const LINES_INSERT_BATCH = 1_000;

/**
 * Indsæt rå fakturalinjer for én chunk. Genoptagelig: antallet af allerede
 * indsatte rækker for batchet er vandmærket, så en fejlet chunk kan køres igen
 * uden dubletter og uden at starte forfra.
 */
export async function insertInvoiceLinesChunk(
  supabaseAdmin: any,
  batchId: string,
  rows: any[],
  alreadySavedInChunk: number,
): Promise<number> {
  let inserted = 0;
  const pending = rows.slice(alreadySavedInChunk);
  for (let i = 0; i < pending.length; i += LINES_INSERT_BATCH) {
    const batch = pending
      .slice(i, i + LINES_INSERT_BATCH)
      .map((r) => ({ ...r, import_batch_id: batchId }));
    const { error } = await supabaseAdmin.from("invoice_lines").insert(batch);
    if (error) throw new Error("invoice_lines insert: " + error.message);
    inserted += batch.length;
  }
  return inserted;
}

/** Antal rækker der allerede er skrevet for dette batch (vandmærke). */
export async function countInvoiceLines(supabaseAdmin: any, batchId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("id", { count: "exact", head: true })
    .eq("import_batch_id", batchId);
  if (error) throw new Error("invoice_lines count: " + error.message);
  return count ?? 0;
}

/** Alle månedsstarter (YYYY-MM-01) i intervallet, inklusive begge ender. */
export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  while (y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth())) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}-01`);
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}


export async function upsertMonthlySlice(
  supabaseAdmin: any,
  rows: AggregatedPayload["monthly"],
): Promise<number> {
  let saved = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabaseAdmin
      .from("sales_monthly")
      .upsert(batch, { onConflict: "afdeling_nr,visma_delivery_no,period,product_group_1" });
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
      .upsert(batch, { onConflict: "afdeling_nr,visma_delivery_no,varenr" });
    if (error) throw new Error("sales_top_products upsert: " + error.message);
    saved += batch.length;
  }
  return saved;
}

export async function upsertTopMonthlySlice(
  supabaseAdmin: any,
  rows: Array<{
    visma_delivery_no: string;
    afdeling_nr: number;
    period: string;
    varenr: string;
    description: string;
    revenue: number;
    quantity: number;
    contribution: number;
    product_group_1: string;
    location_id: string | null;
    weight_kg?: number;
  }>,
): Promise<number> {
  let saved = 0;
  for (let i = 0; i < rows.length; i += TOP_MONTHLY_UPSERT_BATCH) {
    const batch = rows.slice(i, i + TOP_MONTHLY_UPSERT_BATCH);
    const { error } = await supabaseAdmin
      .from("sales_monthly_products")
      .upsert(batch, { onConflict: "afdeling_nr,visma_delivery_no,period,varenr" });
    if (error) throw new Error("sales_monthly_products upsert: " + error.message);
    saved += batch.length;
  }
  return saved;
}
