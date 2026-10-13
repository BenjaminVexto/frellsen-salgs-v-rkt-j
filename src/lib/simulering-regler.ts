/**
 * Tildelingsregler i Salgskort → Simulering. Ren logik (ingen React/DB), så den kan testes.
 *
 * Rækkefølge pr. lokation (første match vinder):
 * 1. Frellsen (199) beholder sin sælger.
 * 2. KAM-lokationer beholder sælgeren, når "Lås KAM-kunder" er slået til.
 * 3. "Tildel til sælger"-regler i rækkefølge.
 * 4. Geografi (scenariedistriktets sælger for fladen).
 * 5. "Må ikke have"-regler tjekkes på resultatet fra 3–4.
 */

export type RegelType = "tildel" | "udeluk";
export type Betingelse = {
  kpg1?: string[];
  /** Nøgler "KPG1||KPG2" som i filterkolonnen */
  kpg2?: string[];
  kpg3?: string[];
  ansatteOver?: number | null;
  /** Ukendt antal ansatte tæller som over grænsen (standard: under) */
  ukendtSomOver?: boolean;
  alternativ?: "behold" | "saelger";
  /** Sælgernøgle (bruger-id eller "f:<fiktiv id>") ved alternativ "saelger" */
  alternativSaelger?: string | null;
};
export type Regel = { id: string; type: RegelType; saelger: string; b: Betingelse; aktiv: boolean };

export type RegelLok = { kpg1: string; kpg2: string; kpg3: string; ansatte: number | null };

/** Matcher lokationen betingelsen? Flere valgte værdier/kriterier i samme regel = ELLER. */
export function regelMatcher(l: RegelLok, b: Betingelse, type: RegelType): boolean {
  if (b.kpg1?.includes(l.kpg1)) return true;
  if (type === "tildel" && b.kpg2?.includes(l.kpg1 + "||" + l.kpg2)) return true;
  if (b.kpg3?.includes(l.kpg3)) return true;
  if (type === "udeluk" && b.ansatteOver != null) {
    if (l.ansatte == null) return !!b.ukendtSomOver;
    return l.ansatte > b.ansatteOver;
  }
  return false;
}

export type Beslutning = { til: string; aarsag: "geo" | string | null };

/**
 * @param nu sælgeren i Virkelighed
 * @param geo sælgeren fra fladens distrikt (null = fladen har intet distrikt)
 * @param fri lokationen må flyttes geografisk (geografisk, eller KAM når KAM ikke er låst)
 */
export function bestemSaelger(o: {
  nu: string; frellsen: boolean; kamLaast: boolean; geo: string | null; fri: boolean; lok: RegelLok; regler: Regel[];
}): Beslutning {
  if (o.frellsen || o.kamLaast) return { til: o.nu, aarsag: null };
  let res: Beslutning | null = null;
  for (const r of o.regler) {
    if (r.aktiv && r.type === "tildel" && regelMatcher(o.lok, r.b, "tildel")) { res = { til: r.saelger, aarsag: r.id }; break; }
  }
  if (!res) res = o.fri && o.geo ? { til: o.geo, aarsag: "geo" } : { til: o.nu, aarsag: null };
  for (const r of o.regler) {
    if (!r.aktiv || r.type !== "udeluk" || r.saelger !== res.til || !regelMatcher(o.lok, r.b, "udeluk")) continue;
    const til = r.b.alternativ === "saelger" && r.b.alternativSaelger ? r.b.alternativSaelger : o.nu;
    res = { til, aarsag: r.id };
  }
  return res;
}

const kode = (s: string) => s.replace(/[[\]]/g, "").trim();

/** Kort sætning til visning, fx "Jes Højgaard får: 69 Regions aftale". */
export function regelTekst(r: Regel, navn: (k: string) => string): string {
  const dele: string[] = [];
  if (r.b.kpg1?.length) dele.push((r.type === "udeluk" ? "KPG1 " : "") + r.b.kpg1.map(kode).join(", "));
  if (r.type === "tildel" && r.b.kpg2?.length) dele.push(r.b.kpg2.map((k) => kode(k.split("||")[1] ?? k)).join(", "));
  if (r.b.kpg3?.length) dele.push("KPG3 " + r.b.kpg3.map(kode).join(", "));
  if (r.type === "udeluk" && r.b.ansatteOver != null) dele.push(`over ${r.b.ansatteOver.toLocaleString("da-DK")} ansatte`);
  const bet = dele.join(" · ") || "(ingen betingelse)";
  if (r.type === "tildel") return `${navn(r.saelger)} får: ${bet}`;
  const alt = r.b.alternativ === "saelger" && r.b.alternativSaelger ? `går til ${navn(r.b.alternativSaelger)}` : "beholder nuværende sælger";
  return `${navn(r.saelger)} må ikke have: ${bet} → ${alt}`;
}
