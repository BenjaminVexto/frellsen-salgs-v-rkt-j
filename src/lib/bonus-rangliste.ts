export type BonusPlacering = { saelger: string; navn: string; db: number; rang: number; beloeb: number };
export function afstandTilTop(rows: BonusPlacering[], saelger: string) {
  const egen = rows.find((r) => r.saelger === saelger);
  return [1, 2].flatMap((rang) => {
    const target = rows.find((r) => r.rang === rang);
    if (!egen || !target || egen.rang <= rang) return [];
    return [{ rang, afstand: Math.max(0, target.db - egen.db) }];
  });
}