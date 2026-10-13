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
  /** Hvor: valgfri geografisk afgrænsning (OG med Hvad). Mangler = hele landet. */
  omraade?: Omraade | null;
};
export type Omraade = { type: "land" | "landsdel" | "distrikt" | "region"; vaerdier: string[] };
export type Regel = { id: string; type: RegelType; saelger: string; b: Betingelse; aktiv: boolean };

export type RegelLok = {
  kpg1: string; kpg2: string; kpg3: string; ansatte: number | null;
  /** Fladens landsdel, scenariedistrikt-id og region (til regelens område) */
  landsdel?: string | null; distrikt?: string | null; region?: string | null;
};

export function iOmraade(l: RegelLok, o: Omraade | null | undefined): boolean {
  if (!o || o.type === "land" || !o.vaerdier?.length) return true;
  const v = o.type === "landsdel" ? l.landsdel : o.type === "distrikt" ? l.distrikt : l.region;
  return v != null && o.vaerdier.includes(v);
}

/** Matcher lokationen betingelsen? Flere valgte værdier/kriterier i samme regel = ELLER. */
export function regelMatcher(l: RegelLok, b: Betingelse, type: RegelType): boolean {
  return iOmraade(l, b.omraade) && hvadMatcher(l, b, type);
}
function hvadMatcher(l: RegelLok, b: Betingelse, type: RegelType): boolean {
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

/** Tekst for området, fx " · i landsdel Vest" (tom ved hele landet). */
export function omraadeTekst(o: Omraade | null | undefined, distriktNavn: (id: string) => string = (x) => x): string {
  if (!o || o.type === "land" || !o.vaerdier?.length) return "";
  if (o.type === "landsdel") return ` · i landsdel ${o.vaerdier.join(", ")}`;
  if (o.type === "region") return ` · i ${o.vaerdier.join(", ")}`;
  return ` · i ${o.vaerdier.map(distriktNavn).join(", ")}`;
}

/** Alle aktive tildel-regler der matcher lokationen, i rækkefølge (første vinder). */
export function tildelMatches(l: RegelLok, regler: Regel[]): string[] {
  return regler.filter((r) => r.aktiv && r.type === "tildel" && regelMatcher(l, r.b, "tildel")).map((r) => r.id);
}

/** Kort sætning til visning, fx "Jes Højgaard får: 69 Regions aftale". */
export function regelTekst(r: Regel, navn: (k: string) => string, distriktNavn?: (id: string) => string): string {
  const dele: string[] = [];
  if (r.b.kpg1?.length) dele.push((r.type === "udeluk" ? "KPG1 " : "") + r.b.kpg1.map(kode).join(", "));
  if (r.type === "tildel" && r.b.kpg2?.length) dele.push(r.b.kpg2.map((k) => kode(k.split("||")[1] ?? k)).join(", "));
  if (r.b.kpg3?.length) dele.push("KPG3 " + r.b.kpg3.map(kode).join(", "));
  if (r.type === "udeluk" && r.b.ansatteOver != null) dele.push(`over ${r.b.ansatteOver.toLocaleString("da-DK")} ansatte`);
  const bet = (dele.join(" · ") || "(ingen betingelse)") + omraadeTekst(r.b.omraade, distriktNavn);
  if (r.type === "tildel") return `${navn(r.saelger)} får: ${bet}`;
  const alt = r.b.alternativ === "saelger" && r.b.alternativSaelger ? `går til ${navn(r.b.alternativSaelger)}` : "beholder nuværende sælger";
  return `${navn(r.saelger)} må ikke have: ${bet} → ${alt}`;
}

/** KAM-aftale: lokationen er på aftalen, hvis den ligger i området OG matcher én af koderne (ELLER mellem KPG1/KPG2/KPG3). */
export type KamAftale = { id: string; navn: string; kpg1: string[]; kpg2: string[]; kpg3: string[]; omraade?: Omraade | null; ansvarlige: string[]; aktiv: boolean };

export function kamMatcher(a: KamAftale, l: RegelLok): boolean {
  if (!a.aktiv || !iOmraade(l, a.omraade)) return false;
  return a.kpg1.includes(l.kpg1) || a.kpg2.includes(l.kpg1 + "||" + l.kpg2) || a.kpg3.includes(l.kpg3);
}

const nr = (s: string) => s.match(/^\s*(\d+)/)?.[1] ?? null;
/** Kort kodeoversigt, fx "KPG1 22, 33 · KPG3 15, 30". */
export function kodeOversigt(b: { kpg1?: string[]; kpg2?: string[]; kpg3?: string[] }): string {
  const f = (l: string[]) => l.map((k) => nr(k) ?? k).join(", ");
  return [b.kpg1?.length ? "KPG1 " + f(b.kpg1) : "", b.kpg2?.length ? "KPG2 " + f(b.kpg2.map((k) => k.split("||")[1] ?? k)) : "", b.kpg3?.length ? "KPG3 " + f(b.kpg3) : ""]
    .filter(Boolean).join(" · ") || "ingen koder";
}

/**
 * Indsæt koder kopieret fra Excel: adskilt af linjeskift, komma, semikolon eller tab; som "60" eller "60 [FKS kunder]".
 * Matches mod kendte koder (for KPG2 nøgler "KPG1||KPG2", matchet på KPG2-delen).
 */
export function parseKoder(tekst: string, kendte: string[], type: "kpg1" | "kpg2" | "kpg3"): { fundet: string[]; ikke: string[] } {
  const del = (k: string) => (type === "kpg2" ? k.split("||")[1] ?? k : k);
  const fundet = new Set<string>(); const ikke: string[] = [];
  for (const t of tekst.split(/[\n\r,;\t]+/).map((s) => s.trim()).filter(Boolean)) {
    const tn = nr(t);
    const hit = kendte.filter((k) => del(k).trim().toLowerCase() === t.toLowerCase() || (tn != null && nr(del(k)) === tn && (/^\d+$/.test(t) || del(k).toLowerCase().startsWith(t.toLowerCase().split("[")[0].trim()))));
    if (hit.length) hit.forEach((h) => fundet.add(h)); else ikke.push(t);
  }
  return { fundet: [...fundet], ikke };
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
