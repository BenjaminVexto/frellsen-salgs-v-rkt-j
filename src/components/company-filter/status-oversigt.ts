export const SOEGE_STATUSSER = [
  { value: "aktiv_kunde", label: "Aktive kunder" },
  { value: "sovende_kunde", label: "Sovende kunder" },
  { value: "tidligere_kunde", label: "Tidligere kunder" },
  { value: "servicekunde", label: "Servicekunder" },
  { value: "nyt_emne", label: "Nye emner" },
] as const;

export function statusAntal(rows: Array<{ customer_type: string; koeber_paa_konto?: unknown }>) {
  const counts: Record<string, number> = { alle: rows.length };
  for (const row of rows) {
    if (row.koeber_paa_konto && row.customer_type !== "tidligere_kunde") continue;
    counts[row.customer_type] = (counts[row.customer_type] ?? 0) + 1;
  }
  return counts;
}

export function matcherKundestatus(row: { customer_type: string; koeber_paa_konto?: unknown }, types: string[]) {
  if (!types.length) return true;
  return types.includes(row.customer_type) && (!row.koeber_paa_konto || types.includes("tidligere_kunde"));
}