/**
 * Tildelingsregler i Salgskort → Simulering. Ren logik (ingen React/DB), så den kan testes.
 *
 * Rækkefølge pr. lokation (første match vinder):
 * 1. Frellsen (199) beholder sin sælger.
 * 2. "Tildel til sælger"-regler i rækkefølge.
 * 3. Geografi (scenariedistriktets sælger for fladen).
 * 4. "Må ikke have"-regler tjekkes på resultatet fra 2–3.
 * KAM går på tværs af distrikterne og flytter aldrig lokationer (se kamPortefoelje).
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
 */
export function bestemSaelger(o: {
  nu: string; frellsen: boolean; geo: string | null; lok: RegelLok; regler: Regel[];
}): Beslutning {
  if (o.frellsen) return { til: o.nu, aarsag: null };
  let res: Beslutning | null = null;
  for (const r of o.regler) {
    if (r.aktiv && r.type === "tildel" && regelMatcher(o.lok, r.b, "tildel")) { res = { til: r.saelger, aarsag: r.id }; break; }
  }
  if (!res) res = o.geo ? { til: o.geo, aarsag: "geo" } : { til: o.nu, aarsag: null };
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

/** KAM-aftale: lokationen er på aftalen, hvis dens KPG1/KPG2/KPG3 (efter kodetype) er blandt koderne. */
export type KamAftale = { id: string; navn: string; kodetype: "kpg1" | "kpg2" | "kpg3"; koder: string[]; ansvarlige: string[]; aktiv: boolean };

export function kamMatcher(a: KamAftale, l: RegelLok): boolean {
  if (!a.aktiv) return false;
  const v = a.kodetype === "kpg1" ? l.kpg1 : a.kodetype === "kpg2" ? l.kpg1 + "||" + l.kpg2 : l.kpg3;
  return a.koder.includes(v);
}

export type KamPort = { aftaler: number; n: number; oms: number; db: number };
/** KAM-portefølje pr. ansvarlig. En lokation tæller kun én gang pr. ansvarlig, også ved flere af personens aftaler. */
export function kamPortefoelje(rows: { id: string; lok: RegelLok; oms: number; db: number }[], aftaler: KamAftale[]): Map<string, KamPort> {
  const res = new Map<string, KamPort>();
  const set = new Map<string, Set<string>>();
  for (const a of aftaler) if (a.aktiv) for (const k of new Set(a.ansvarlige)) {
    const e = res.get(k) ?? { aftaler: 0, n: 0, oms: 0, db: 0 }; e.aftaler++; res.set(k, e);
  }
  for (const r of rows) for (const a of aftaler) {
    if (!kamMatcher(a, r.lok)) continue;
    for (const k of a.ansvarlige) {
      let s = set.get(k); if (!s) set.set(k, (s = new Set()));
      if (s.has(r.id)) continue;
      s.add(r.id);
      const e = res.get(k)!; e.n++; e.oms += r.oms; e.db += r.db;
    }
  }
  return res;
}
