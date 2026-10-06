/** "Falder": forbrugsvarer 12 hele mdr. mod de 12 før er faldet med mindst
 * minPct procent OG mindst minKr kroner. Grænserne er admin-indstillinger. */
export function erFalder(
  growthPct: number | null,
  f12: number,
  f12p: number,
  minPct: number,
  minKr: number,
): boolean {
  if (growthPct === null || f12 <= 0 || f12p <= 0) return false;
  const faldKr = f12p - f12;
  const faldPct = (faldKr / f12p) * 100;
  return faldPct >= minPct && faldKr >= minKr;
}
