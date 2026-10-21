// Maskiner & Service: ren beregning oven på forudberegnet grundlag (udstyr_grundlag).
// Visma-tal bruges uændret; kun maskinbelastningen (varenr 70000) FORDELES pr. maskine.

export type GrundLok = {
  lev: string; id: string; cid: string; kunde: string; adr: string;
  leje: number; bel: number; si: number; ak: number; mo: number; rd: number; pa: number; vdb: number; vmd: number;
  /** Måned (1-12) med største aftalefakturering (16/82) i perioden = fornyelsesmåned. */
  fm: number | null;
  lt: Record<string, number>;
};
export type GrundMaskine = {
  id: string; sn: string | null; lev: string; b: string | null; t: string; u: number;
  o: string | null; tl: number | null; at: string | null; st: string | null;
};
export type Grundlag = { erAdmin: boolean; lok: GrundLok[]; mk: GrundMaskine[] };

export type Satser = {
  brita: number; bryg: number; andetUdlaan: number;
  udskiftReparation: number; udskiftAlderAar: number;
  /** Tællergrænse pr. maskintype – tom = bruges ikke. */
  taellerPrType: Record<string, number>;
};
export const STANDARD_SATSER: Satser = {
  brita: 44, bryg: 85, andetUdlaan: 117, udskiftReparation: 3000, udskiftAlderAar: 5, taellerPrType: {},
};
export const TAELLER_PREFIX = "taeller_";
export const SATS_NOEGLER: Record<Exclude<keyof Satser, "taellerPrType">, string> = {
  brita: "sats_brita", bryg: "sats_bryg", andetUdlaan: "sats_andet_udlaan",
  udskiftReparation: "udskift_reparation", udskiftAlderAar: "udskift_alder_aar",
};

export const TYPER = [
  "Wittenborg", "Rex-Royal", "Animo", "Espresso", "Vandkøler",
  "Bravilor/Bonamat og bryggere", "Brita-filtre", "Andet",
] as const;
export const KAFFE_TYPER = new Set(["Wittenborg", "Rex-Royal", "Animo", "Espresso", "Vandkøler"]);
export const BRYG = "Bravilor/Bonamat og bryggere";
export const BRITA = "Brita-filtre";

export const UDLAAN_LABEL: Record<number, string> = {
  0: "Kundeejet", 3: "Leje/leasing", 4: "Udlån", 5: "Leje u/b", 6: "Midlertidigt udlån", 7: "Bytteservice", 8: "Prøveopsætning",
};
export const erFrellsen = (u: number) => u >= 3 && u <= 8;
/** "Andet udlån" = maskiner af typen Andet, der er udlånt (ikke leje). */
const erAndetUdlaan = (m: GrundMaskine) => m.t === "Andet" && (m.u === 4 || m.u === 6 || m.u === 7 || m.u === 8);
/** Aftaletype fra serviceregistret (ikke 0). */
export const harAftaletype = (at: string | null) => !!at && !/^0\b/.test(at.trim());
/** Aktiv serviceaftale = aftaletype ≠ 0 og status "1 [Aktiv - Har aftale]" på en aktiv maskine. */
export const harAftale = (m: { at: string | null; st: string | null }) => harAftaletype(m.at) && /^1\b/.test((m.st ?? "").trim());
export const aftaleLabel = (at: string | null) =>
  at ? at.replace(/^\d+\s*\[?/, "").replace(/\]$/, "").trim() || "Ingen" : "Ingen";

export type FordeltMaskine = GrundMaskine & {
  belastning: number; // positiv omkostning, fordelt
  leje: number;       // lokationens leje for typen delt ligeligt på typens maskiner
  fast: boolean;      // fast sats (filter/bryg/andet) eller rest-andel
};

/**
 * Fordeler lokationens belastning (positiv omkostning) på dens Frellsen-maskiner.
 * 1) Faste satser pr. måned (Brita, Bravilor/Bonamat og bryggere, Andet udlån).
 *    Overstiger de belastningen, skaleres de ned.
 * 2) Resten fordeles på kaffemaskiner/vandkølere efter typens andel af lejen; uden leje efter antal.
 *    Uden kaffemaskiner går resten forholdsvis på de faste maskiner – ellers ligeligt på alt udstyret.
 * 3) Uden Frellsen-udstyr er hele beløbet ufordelt.
 */
export function fordelBelastning(
  belastning: number, maskiner: GrundMaskine[], lejeTyper: Record<string, number>, maaneder: number, s: Satser,
): { maskiner: FordeltMaskine[]; ufordelt: number } {
  const fr = maskiner.filter((m) => erFrellsen(m.u));
  const antalType = new Map<string, number>();
  for (const m of fr) antalType.set(m.t, (antalType.get(m.t) ?? 0) + 1);
  const lejePr = (m: GrundMaskine) => (lejeTyper[m.t] ?? 0) / (antalType.get(m.t) ?? 1);
  if (fr.length === 0 || belastning <= 0) {
    return {
      maskiner: fr.map((m) => ({ ...m, belastning: 0, leje: lejePr(m), fast: false })),
      ufordelt: fr.length === 0 ? Math.max(belastning, 0) : 0,
    };
  }
  const fastSats = (m: GrundMaskine) =>
    m.t === BRITA ? s.brita : m.t === BRYG ? s.bryg : erAndetUdlaan(m) ? s.andetUdlaan : 0;
  const fastSum = fr.reduce((a, m) => a + fastSats(m) * maaneder, 0);
  const skala = fastSum > belastning ? belastning / fastSum : 1;
  const rest = Math.max(belastning - fastSum * skala, 0);
  const kaffe = fr.filter((m) => KAFFE_TYPER.has(m.t));
  const vaegt = new Map<string, number>();
  if (kaffe.length) {
    const lejeSum = kaffe.reduce((a, m) => a + Math.max(lejePr(m), 0), 0);
    for (const m of kaffe) vaegt.set(m.id, lejeSum > 0 ? Math.max(lejePr(m), 0) / lejeSum : 1 / kaffe.length);
  } else if (fastSum > 0) {
    for (const m of fr) if (fastSats(m) > 0) vaegt.set(m.id, (fastSats(m) * maaneder) / fastSum);
  } else {
    for (const m of fr) vaegt.set(m.id, 1 / fr.length);
  }
  return {
    ufordelt: 0,
    maskiner: fr.map((m) => ({
      ...m,
      belastning: fastSats(m) * maaneder * skala + rest * (vaegt.get(m.id) ?? 0),
      leje: lejePr(m),
      fast: fastSats(m) > 0,
    })),
  };
}

export type LokRegnskab = GrundLok & {
  maskiner: FordeltMaskine[];
  kundeejede: GrundMaskine[];
  belastningIalt: number; filterBel: number; belExFilter: number; ufordelt: number;
  lejeNetto: number; serviceUdgift: number; serviceNetto: number; dbInkl: number;
  daekning: number | null; antalAftaler: number; fornyelse: number | null;
};

export function beregnLokationer(g: Grundlag, maaneder: number, s: Satser): LokRegnskab[] {
  const pr = new Map<string, GrundMaskine[]>();
  for (const m of g.mk) {
    const a = pr.get(m.lev); if (a) a.push(m); else pr.set(m.lev, [m]);
  }
  return g.lok.map((l) => {
    const alle = pr.get(l.lev) ?? [];
    const belastningIalt = Math.max(-l.bel, 0);
    const f = fordelBelastning(belastningIalt, alle, l.lt, maaneder, s);
    const filterBel = f.maskiner.filter((m) => m.t === BRITA).reduce((a, m) => a + m.belastning, 0);
    const belExFilter = belastningIalt - filterBel - f.ufordelt;
    const serviceUdgift = l.ak - l.mo - l.rd - l.pa + filterBel;
    const serviceNetto = l.si - serviceUdgift;
    const lejeNetto = l.leje - belExFilter;
    const dbInkl = l.vdb + lejeNetto + serviceNetto - f.ufordelt;
    const omk = belastningIalt + serviceUdgift - l.si - l.leje;
    const aftaler = alle.filter(harAftale);
    const fornyelse = aftaler.length ? l.fm : null;
    return {
      ...l, maskiner: f.maskiner, kundeejede: alle.filter((m) => !erFrellsen(m.u)),
      belastningIalt, filterBel, belExFilter, ufordelt: f.ufordelt,
      lejeNetto, serviceUdgift, serviceNetto, dbInkl,
      daekning: omk > 0 ? l.vdb / omk : null,
      antalAftaler: aftaler.length, fornyelse,
    };
  });
}

export function maanederIPeriode(fra: string, til: string): number {
  const [fy, fm] = fra.split("-").map(Number);
  const [ty, tm] = til.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Periode: seneste 12 hele måneder (standard), kalenderår eller år til dato. */
export function periode(valg: string, idag = new Date()): { fra: string; til: string; label: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = idag.getFullYear(); const m = idag.getMonth() + 1;
  if (valg === "aatd") {
    const tm = m - 1 || 1;
    return { fra: `${y}-01-01`, til: `${y}-${pad(tm)}-01`, label: `År til dato ${y}` };
  }
  if (/^\d{4}$/.test(valg)) return { fra: `${valg}-01-01`, til: `${valg}-12-01`, label: `Kalenderår ${valg}` };
  const tilY = m === 1 ? y - 1 : y; const tilM = m === 1 ? 12 : m - 1;
  const fraD = new Date(tilY, tilM - 1 - 11, 1);
  return {
    fra: `${fraD.getFullYear()}-${pad(fraD.getMonth() + 1)}-01`,
    til: `${tilY}-${pad(tilM)}-01`,
    label: "Seneste 12 hele måneder",
  };
}

export type Handling = "udlaan" | "udskift" | "kundeejet" | "underskud" | "uden_leje" | "ufordelt";

export function alderAar(opsat: string | null, idag = new Date()): number | null {
  if (!opsat) return null;
  return (idag.getTime() - new Date(opsat).getTime()) / (365.25 * 864e5);
}

export function handlinger(lok: LokRegnskab[], s: Satser, idag = new Date()) {
  const udlaan = lok.filter((l) =>
    l.maskiner.some((m) => [4, 6, 7].includes(m.u) && m.t !== BRITA) &&
    l.vdb < l.belastningIalt + l.serviceUdgift - l.si - l.leje);
  const udskift = lok.flatMap((l) => {
    const reparation = -(l.rd + l.mo) > s.udskiftReparation; // reservedele + montør, netto
    return l.maskiner
      .filter((m) => KAFFE_TYPER.has(m.t) || m.t === BRYG)
      .filter((m) => {
        const tg = s.taellerPrType[m.t];
        return reparation || (alderAar(m.o, idag) ?? 0) > s.udskiftAlderAar || (tg != null && tg > 0 && (m.tl ?? 0) > tg);
      })
      .map((m) => ({ l, m }));
  });
  const kundeejet = lok.flatMap((l) =>
    l.kundeejede.filter((m) => (KAFFE_TYPER.has(m.t) || m.t === BRYG) && !harAftale(m)).map((m) => ({ l, m })));
  const underskud = lok.filter((l) => l.antalAftaler > 0 && l.serviceNetto < 0);
  const udenLeje = lok.flatMap((l) => l.maskiner.filter((m) => m.u === 3 && l.leje <= 0).map((m) => ({ l, m })));
  const ufordelt = lok.filter((l) => l.ufordelt > 0);
  return { udlaan, udskift, kundeejet, underskud, udenLeje, ufordelt };
}

export const MAANED_NAVN = ["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"];
export const maanedNavn = (m: number | null) => (m ? MAANED_NAVN[m - 1] : "–");
