export type MaskinFilter = "alle" | "wittenborg" | "animo" | "rex" | "kalerm" | "espresso";

export const MASKIN_LABEL: Record<MaskinFilter, string> = {
  alle: "Alle maskiner", wittenborg: "Wittenborg", animo: "Animo", rex: "Rex-Royal", kalerm: "Kalerm", espresso: "Espresso",
};

export const erMaskinFilter = (v: string): v is MaskinFilter => v in MASKIN_LABEL;

export function filtrerBonusMaskiner<T extends { bonusklasse?: string; udeladt?: boolean }>(
  rows: T[], filter: MaskinFilter,
): T[] {
  return filter === "alle" ? rows : rows.filter((r) => !r.udeladt && r.bonusklasse === filter);
}

/** Status for sælgeren i klart sprog — ingen tekniske koder. */
export function maskinStatusTekst(r: { status?: string | null; aarsag?: string | null }): { label: string; aarsag: string | null } {
  if (r.status === "bonus") return { label: "Bonus", aarsag: null };
  if (r.status === "vurdering") return { label: "Afventer vurdering", aarsag: r.aarsag ?? null };
  return { label: "Ingen bonus", aarsag: r.aarsag ?? null };
}
