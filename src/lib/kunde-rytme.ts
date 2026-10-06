// Tekst til kundekortet for kunder med en etableret købsrytme (>= 3 købsmåneder).
// Selve statusreglen ligger i databasen (kunde_rytme_genberegn): aktiv indtil
// tid siden sidste forbrugskøb > max(3 mdr, 1,5 x eget interval).

export function rytmeGraenseMdr(koebsmaaneder: number | null, intervalMdr: number | null): number {
  if (koebsmaaneder == null || koebsmaaneder < 3 || intervalMdr == null) return 3;
  return Math.max(3, 1.5 * intervalMdr);
}

const MDR = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

export function rytmeTekst(input: {
  koebsmaaneder: number | null;
  intervalMdr: number | null;
  naesteForventet: string | null;
  overRytme: boolean;
  aktiv: boolean;
}): string | null {
  const { koebsmaaneder, intervalMdr, naesteForventet, overRytme, aktiv } = input;
  if (koebsmaaneder == null || koebsmaaneder < 3 || intervalMdr == null) return null;
  const x = Math.max(1, Math.round(intervalMdr));
  const hver = x === 1 ? "Køber typisk hver måned" : `Køber typisk hver ~${x}. måned`;
  if (overRytme && aktiv) return `${hver} · Forventet køb er overskredet`;
  if (!naesteForventet) return hver;
  const d = new Date(naesteForventet.slice(0, 10) + "T00:00:00Z");
  return `${hver} · næste køb forventet ca. ${MDR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
