export type MaskinRaekke = {
  maskintype: string;
  serienr: string;
  placering: string;
  aftale: string;
  udloeber: string | null;
  kopper: number | null;
  aflaest: string | null;
  service: boolean;
};

/** Aftaletype til visning: Gratis udlån / Leje / Lease / Køb / rå værdi. */
export function aftaleLabel(raw: string | null | undefined, gratisUdlaan: boolean): string {
  if (gratisUdlaan) return "Gratis udlån";
  // Visma-koder som "1 [Serviceaftale]" vises som teksten i parentesen.
  const ren = (raw ?? "").replace(/^\s*\d+\s*\[(.*)\]\s*$/, "$1").trim();
  const t = ren.toLowerCase();
  if (!t.trim()) return "—";
  if (/udl[åa]n|gratis/.test(t)) return "Gratis udlån";
  if (/lease|leasing/.test(t)) return "Lease";
  if (/leje/.test(t)) return "Leje";
  if (/k[øo]b|solgt|salg/.test(t)) return "Køb";
  return ren;
}

/** Udløber inden for 6 måneder fra i dag (og ikke allerede udløbet for mere end i dag). */
export function udloeberSnart(dato: string | null, idag: Date = new Date()): boolean {
  if (!dato) return false;
  const d = new Date(dato.slice(0, 10) + "T00:00:00");
  const graense = new Date(idag);
  graense.setMonth(graense.getMonth() + 6);
  return d <= graense;
}

/** Først udløbende øverst; maskiner uden udløbsdato sidst. */
export function sorterMaskiner(rows: MaskinRaekke[]): MaskinRaekke[] {
  return [...rows].sort((a, b) => {
    if (a.udloeber && b.udloeber) return a.udloeber.localeCompare(b.udloeber);
    if (a.udloeber) return -1;
    if (b.udloeber) return 1;
    return a.maskintype.localeCompare(b.maskintype, "da");
  });
}
