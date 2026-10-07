export type MaskinRaekke = {
  maskintype: string;
  serienr: string;
  placering: string;
  aftale: string;
  udloeber: string | null;
  kopper: number | null;
  aflaest: string | null;
  service: boolean;
  reservedele?: string | null;
  /** Antal enheder på linjen (udstyr uden serienr. samles pr. type). */
  antal?: number;
  /** Tilbehør/filtre (termobeholdere, fødder, vandfiltre m.m.) — ikke maskine. */
  tilbehoer?: boolean;
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

/**
 * Samlet aftale ud fra Visma: udlånstype (maskinregistret, fx "5 [Leje u/b]")
 * + aftaletype i serviceregistret (fx "1 [Serviceaftale]") + gratis-udlån-flag.
 * Resultat fx "Leje + serviceaftale", "Udlån", "Serviceaftale" eller "—".
 */
export function samletAftale(udlaanstype: string | null | undefined, serviceAftale: string | null | undefined, gratisUdlaan: boolean): string {
  const ren = (v: string | null | undefined) => (v ?? "").replace(/^\s*\d+\s*\[(.*)\]\s*$/, "$1").trim();
  const u = ren(udlaanstype).toLowerCase();
  let grund = "";
  if (gratisUdlaan || /udl[åa]n|gratis/.test(u)) grund = "Udlån";
  else if (/lease|leasing/.test(u)) grund = "Lease";
  else if (/leje/.test(u)) grund = "Leje";
  else if (/pr[øo]ve/.test(u)) grund = "Prøveopsætning";
  else if (/k[øo]b|solgt|salg/.test(u)) grund = "Køb";
  else if (u) grund = ren(udlaanstype);
  const s = ren(serviceAftale).toLowerCase();
  const harService = /service/.test(s);
  if (grund && harService) return `${grund} + serviceaftale`;
  if (harService) return "Serviceaftale";
  return grund || "—";
}

/** Fuldt maskinnavn med mærke, når mærket mangler i data (Wittenborg 9100/9200). */
export function maskinNavn(type: string | null | undefined): string {
  const t = (type ?? "").trim();
  if (!t) return "—";
  if (/^(9100|9200|ES ?\d|FB ?\d)/i.test(t)) return `Wittenborg ${t}`;
  return t;
}

/** Tælleraflæsning ældre end 12 måneder. */
export function aeldreAflaesning(dato: string | null, idag: Date = new Date()): boolean {
  if (!dato) return false;
  const d = new Date(dato.slice(0, 10) + "T00:00:00");
  const g = new Date(idag);
  g.setMonth(g.getMonth() - 12);
  return d < g;
}

/** Udløbsstatus: "udloebet" hvis datoen er passeret, "snart" inden for 6 mdr., ellers null. */
export function udloebStatus(dato: string | null, idag: Date = new Date()): "udloebet" | "snart" | null {
  if (!dato) return null;
  const d = new Date(dato.slice(0, 10) + "T00:00:00");
  const i = new Date(idag.getFullYear(), idag.getMonth(), idag.getDate());
  if (d < i) return "udloebet";
  return udloeberSnart(dato, idag) ? "snart" : null;
}

/**
 * Udstyr der ikke er maskiner (skilte, rollups, skabe/møbler, kander, kurve,
 * drypbakker, udslagsskuffer, termobeholdere, piedestaler). Køleskabe tæller som maskiner.
 */
export const IKKE_MASKINE_REGEL =
  /(rollup|skilt|udslagsskuffe|termobeholder|pumpekande|kolbekande|steamkande|\bkurv\b|drypbakke|piedestal|(^|[^ø]le|\s)skab\b)/i;
/** Udelades helt fra maskinlisten (reklame, ikke udstyr hos kunden). */
export function erUdeladt(type: string | null | undefined): boolean {
  return /(rollup|skilt)/i.test(type ?? "");
}

/** Tilbehør (vises på listen, men tælles ikke som maskine). */
export function erIkkeMaskine(type: string | null | undefined): boolean {
  const t = (type ?? "").trim();
  if (!t) return false;
  if (/køleskab/i.test(t)) return false;
  return IKKE_MASKINE_REGEL.test(t);
}

/** Tællerstand til visning: 0 og 1 regnes som ingen aflæsning. */
export function visKopper(n: number | null): number | null {
  return n != null && n > 1 ? n : null;
}

/**
 * Fælles aftaleregel for maskiner (kundekort + maskinliste).
 * Grundregler for Visma-maskindata:
 * - Serviceregistrets "Aftale Type (G4)" er facit. "1 [Serviceaftale]" = kun serviceaftale, kundeejet.
 * - "u/b" = uden betaling: "5 [Leje u/b]" i maskinregistret er IKKE leje, men udlån.
 * - "Leje" kun når maskinregistret/G4 siger "3 [Leje / Leasing]", eller der er
 *   lejelinjer (varegruppe 16/80) på lokationen de seneste 12 mdr.
 * - Mangler alle kilder, vises "Ukendt" (aldrig "Kundeejet" som standard).
 */
export function maskinAftale(p: {
  g4: string | null | undefined;
  udlaanstype: string | null | undefined;
  lejelinjer: boolean;
  gratisUdlaan?: boolean;
}): string {
  const g4 = (p.g4 ?? "").trim().toLowerCase();
  const u = (p.udlaanstype ?? "").trim().toLowerCase();
  const registerLeje = /^3\s*\[|leje\s*\/\s*leasing/.test(u) || /^3\s*\[|leje\s*\/\s*leasing/.test(g4);
  const erLeje = registerLeje || p.lejelinjer;
  const service = /^1\s*\[|serviceaftale/.test(g4);
  // G4 er facit: "Serviceaftale" = kundeejet. Lejelinjer på lokationen gør ikke en
  // kundeejet maskine til leje — kun registrenes egen lejeaftale gør.
  if (service) return registerLeje ? "Leje + serviceaftale" : "Kundeejet · serviceaftale";
  if (erLeje) return "Leje";
  if (/^8\s*\[|pr[øo]ve/.test(u)) return "Prøveopsætning";
  if (/^7\s*\[|bytte/.test(u)) return "Bytteservice";
  if (p.gratisUdlaan || /^[456]\s*\[|udl[åa]n|u\/b/.test(u)) return "Udlån";
  return "Ukendt";
}

export type ReservedeleStatus = { kort: string; lang: string; dato: string | null } | null;

/** Reservedele ud fra "Reservedele (G3)" og "Reserved. efter regn." (dato hvor kunden begynder at betale). */
export function reservedeleStatus(g3: string | null | undefined, efterRegn: string | null | undefined, idag: Date = new Date()): ReservedeleStatus {
  const g = (g3 ?? "").toLowerCase();
  if (/uden\s*reservedele/.test(g)) return { kort: "Ikke inkl.", lang: "Reservedele ikke inkluderet", dato: null };
  if (/alt p[åa] regning/.test(g)) return { kort: "Faktureres", lang: "Reservedele faktureres", dato: null };
  const d = (efterRegn ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const dt = new Date(d + "T00:00:00");
    const i = new Date(idag.getFullYear(), idag.getMonth(), idag.getDate());
    if (dt <= i) return { kort: "Faktureres", lang: "Reservedele faktureres", dato: d };
    const m = dt.toLocaleDateString("da-DK", { month: "short", year: "numeric" });
    return { kort: `Inkl. til ${m}`, lang: `Reservedele inkluderet til ${m}`, dato: d };
  }
  if (/u\/b|\(83,\s*17,\s*18\)/.test(g)) return { kort: "Inkl.", lang: "Reservedele inkluderet", dato: null };
  return null;
}
