/**
 * Server-only helpers til faktura-import workeren.
 * Aggregaterne beregnes i databasen (rebuild_sales_aggregates) ud fra
 * invoice_lines — her ligger kun det, workeren har brug for til rålinjerne.
 */

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
