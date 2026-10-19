export type MaskinFilter = "alle" | "wittenborg" | "animo" | "rex";

export const MASKIN_LABEL: Record<MaskinFilter, string> = {
  alle: "Alle maskiner", wittenborg: "Wittenborg", animo: "Animo", rex: "Rex-Royal",
};

export function filtrerBonusMaskiner<T extends { bonusklasse?: string; udeladt?: boolean }>(
  rows: T[], filter: MaskinFilter,
): T[] {
  return filter === "alle" ? rows : rows.filter((r) => !r.udeladt && r.bonusklasse === filter);
}