/** Årsværdi for et uploadet tilbud: (forbrug + faste) pr. måned × 12. Engangsbeløb indgår ikke. */
export function beregnAarsvaerdi(forbrugPrMaaned: number, fastePrMaaned: number): number {
  const f = Number.isFinite(forbrugPrMaaned) ? forbrugPrMaaned : 0;
  const s = Number.isFinite(fastePrMaaned) ? fastePrMaaned : 0;
  return Math.round((f + s) * 12 * 100) / 100;
}
