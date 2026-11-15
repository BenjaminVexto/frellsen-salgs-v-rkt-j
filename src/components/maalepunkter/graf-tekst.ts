/**
 * Automatiske tekster over Målepunkter-graferne (tabel 1–5).
 * Ren præsentation: tallene kommer fra de samme RPC'er som tabellerne.
 * Sammenligning: seneste 3 hele måneder i perioden mod samme måneder sidste år
 * (fallback: de 3 foregående måneder). Under ±5 % = "uændret".
 */
export type Serier = Partial<Record<"privat" | "offentlig" | "privat_45" | "privat_ovrige", Map<string, number>>>;
export type GrafTekst = { overskrift: string; linjer: string[]; periode?: string };

const MDR = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
export const addMd = (s: string, n: number) => {
  const [y, m] = s.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const mNavn = (s: string) => `${MDR[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
const MINUS = "\u2212";
const nf = (v: number, d = 0) => new Intl.NumberFormat("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

export const fmtKr = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? MINUS : "";
  return a >= 1e6 ? `${s}${nf(a / 1e6, 1)} mio.` : `${s}${nf(Math.round(a / 1000))} t.kr.`;
};
export const fmtAntal = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? MINUS : "";
  return s + (a < 10 && Math.round(a) !== a ? nf(a, 1) : nf(Math.round(a)));
};
export const pct = (nu: number, foer: number) => (foer ? ((nu - foer) / Math.abs(foer)) * 100 : nu ? Infinity : 0);
const pctTekst = (p: number) => `${p >= 0 ? "+" : MINUS}${nf(Math.round(Math.abs(p)))} %`;
/** Tal i parentes: "(−3 %)", "(uændret)" under 1 %. */
const iParentes = (p: number) => (!isFinite(p) ? "(ny)" : Math.abs(p) < 1 ? "(uændret)" : `(${pctTekst(p)})`);
/** Beskrivende ændringsord til overskrifter. */
export function aendringOrd(p: number): string {
  if (!isFinite(p)) return "kommet til";
  if (Math.abs(p) < 5) return "stort set uændret";
  if (p <= -45 && p >= -55) return "halveret";
  if (p >= 90 && p <= 110) return "fordoblet";
  return `${p > 0 ? "steget" : "faldet"} ${nf(Math.round(Math.abs(p)))} %`;
}

type Gruppe = { navn: string; i: string; k: keyof Serier };
export const grupper = (visKpg: boolean): Gruppe[] =>
  visKpg
    ? [
        { navn: "KPG3 45", i: "KPG3 45", k: "privat_45" },
        { navn: "Private", i: "private", k: "privat_ovrige" },
        { navn: "Udbud", i: "udbud", k: "offentlig" },
      ]
    : [
        { navn: "Forhandlingskunder", i: "forhandlingskunder", k: "privat" },
        { navn: "Udbud", i: "udbud", k: "offentlig" },
      ];

export type Vindue = { nu: string[]; foer: string[]; sidsteAar: boolean; label: string };
/** Seneste k (≤3) måneder til og med `til` mod samme måneder sidste år, ellers de k foregående. */
export function vindue(serier: Serier, til: string, antal: number): Vindue {
  const k = Math.max(1, Math.min(3, antal));
  const nu = Array.from({ length: k }, (_, i) => addMd(til, i - k + 1));
  const ly = nu.map((m) => addMd(m, -12));
  const harLy = Object.values(serier).some((s) => s && ly.some((m) => s.has(m)));
  const foer = harLy ? ly : nu.map((m) => addMd(m, -k));
  const span = (ms: string[]) => (ms.length === 1 ? mNavn(ms[0]) : `${MDR[Number(ms[0].slice(5, 7)) - 1]}–${mNavn(ms[ms.length - 1])}`);
  return { nu, foer, sidsteAar: harLy, label: `${span(nu)} mod ${span(foer)}` };
}
const sum = (s: Map<string, number> | undefined, ms: string[]) => ms.reduce((a, m) => a + (s?.get(m) ?? 0), 0);
const plus = (...ss: (Map<string, number> | undefined)[]) => {
  const r = new Map<string, number>();
  ss.forEach((s) => s?.forEach((v, m) => r.set(m, (r.get(m) ?? 0) + v)));
  return r;
};
const total = (s: Serier) => plus(s.privat, s.offentlig);
const modTekst = (v: Vindue) => (v.sidsteAar ? "sidste år" : "de 3 foregående måneder");

/** Hvilken gruppe forklarer størstedelen af ændringen d? */
function driver(gs: Gruppe[], bidrag: number[], d: number, visKpg: boolean): string {
  if (!d) return "";
  const andel = bidrag.map((b) => b / d);
  const bedst = andel.reduce((bi, a, i) => (a > andel[bi] ? i : bi), 0);
  const ord = d < 0 ? "faldet" : "stigningen";
  if (andel[bedst] >= 0.8) return `næsten hele ${ord} er ${gs[bedst].i}`;
  if (visKpg) {
    const off = andel[0] + andel[2];
    if (andel[0] > 0 && andel[2] > 0 && off >= 0.8) return `næsten hele ${ord} er offentlige kunder (KPG3 45 og udbud)`;
  }
  if (andel[bedst] >= 0.5) return `størstedelen af ${ord} er ${gs[bedst].i}`;
  return `${ord === "faldet" ? "faldet" : "stigningen"} er fordelt på flere grupper`;
}

export function tekstOmsaetning(s: Serier, til: string, antal: number, visKpg: boolean): GrafTekst {
  const gs = grupper(visKpg), v = vindue(s, til, antal);
  const t = total(s), nu = sum(t, v.nu), foer = sum(t, v.foer), p = pct(nu, foer);
  const bidrag = gs.map((g) => sum(s[g.k], v.nu) - sum(s[g.k], v.foer));
  const mod = v.sidsteAar ? "" : " mod de 3 foregående måneder";
  let overskrift: string;
  if (Math.abs(p) < 5) {
    const st = gs.map((g, i) => ({ g, p: pct(sum(s[g.k], v.nu), sum(s[g.k], v.foer)), b: bidrag[i] }))
      .filter((x) => isFinite(x.p) && Math.abs(x.p) >= 10).sort((a, b) => Math.abs(b.b) - Math.abs(a.b))[0];
    overskrift = `Omsætningen er stort set uændret${mod}${st ? ` – ${st.g.i} er ${aendringOrd(st.p)}` : ""}.`;
  } else {
    overskrift = `Omsætningen er ${aendringOrd(p)}${mod} – ${driver(gs, bidrag, nu - foer, visKpg)}.`;
  }
  const dele = gs.map((g) => `${g.navn}: ${fmtKr(sum(s[g.k], v.nu))} ${iParentes(pct(sum(s[g.k], v.nu), sum(s[g.k], v.foer)))}.`);
  return { overskrift, linjer: [dele.join(" ")], periode: v.label };
}

export function tekstDb(db: Serier, oms: Serier, til: string, antal: number, visKpg: boolean): GrafTekst {
  const gs = grupper(visKpg), v = vindue(db, til, antal);
  const st = gs.map((g) => {
    const nu = sum(db[g.k], v.nu), foer = sum(db[g.k], v.foer);
    const on = sum(oms[g.k], v.nu), of = sum(oms[g.k], v.foer);
    return { g, nu, foer, d: nu - foer, p: pct(nu, foer), dgNu: on ? (nu / on) * 100 : null, dgFoer: of ? (foer / of) * 100 : null };
  });
  const mod = v.sidsteAar ? "" : " mod de 3 foregående måneder";
  const b = [...st].sort((a, c) => Math.abs(c.d) - Math.abs(a.d))[0];
  const t = total(db), tp = pct(sum(t, v.nu), sum(t, v.foer));
  let overskrift: string;
  if (!b || Math.abs(b.p) < 5) overskrift = `DB er ${aendringOrd(tp)}${mod}.`;
  else {
    const o = st.filter((x) => Math.sign(x.d) === -Math.sign(b.d) && Math.abs(x.p) >= 5 && Math.abs(x.d) >= 0.25 * Math.abs(b.d))
      .sort((a, c) => Math.abs(c.d) - Math.abs(a.d))[0];
    const [a1, a2] = o ? (b.d > 0 ? [b, o] : [o, b]) : [b, null];
    overskrift = `DB på ${a1.g.i} er ${aendringOrd(a1.p)}${mod}` +
      (a2 ? ` – DB på ${a2.g.i} er ${aendringOrd(a2.p)}.` : ` – DB i alt er ${aendringOrd(tp)}.`);
  }
  const dg = (x: number | null) => (x == null ? "–" : `${nf(Math.round(x))} %`);
  const dele = st.map((x) => `${x.g.navn}: ${fmtKr(x.nu)} mod ${fmtKr(x.foer)} (DB ${dg(x.dgNu)} mod ${dg(x.dgFoer)}).`);
  const linjer = dele.length > 2 ? [dele.slice(0, 2).join(" "), dele.slice(2).join(" ")] : [dele.join(" ")];
  return { overskrift, linjer, periode: v.label };
}

/** Aktive kunder er en beholdning: antal i periodens sidste måned. */
export function tekstAktive(s: Serier, til: string, visKpg: boolean): GrafTekst {
  const v = vindue(s, til, 1);
  const m = v.nu[0], f = v.sidsteAar ? addMd(m, -12) : addMd(m, -3);
  const ved = (x?: Map<string, number>) => x?.get(m) ?? 0, foer = (x?: Map<string, number>) => x?.get(f) ?? 0;
  const F = ved(s.privat), d = F - foer(s.privat), p = pct(F, foer(s.privat));
  const mod = v.sidsteAar ? "end sidste år" : "end for 3 måneder siden";
  let overskrift = `${nf(F)} aktive forhandlingskunder – ${Math.abs(p) < 5 ? `stort set uændret ${v.sidsteAar ? "mod sidste år" : "mod for 3 måneder siden"}` : `${nf(Math.abs(d))} ${d < 0 ? "færre" : "flere"} ${mod}`}`;
  if (visKpg && Math.abs(p) >= 5 && d) {
    const a = (ved(s.privat_45) - foer(s.privat_45)) / d;
    const hvor = a >= 0.95 ? "alle i KPG3 45" : a >= 0.8 ? "næsten alle i KPG3 45" : a >= 0.5 ? "flest i KPG3 45"
      : 1 - a >= 0.95 ? "alle blandt private" : 1 - a >= 0.8 ? "næsten alle blandt private" : "flest blandt private";
    overskrift += `, ${hvor}`;
  }
  overskrift += ".";
  const gs = visKpg ? grupper(true) : [...grupper(false)];
  const dele = gs.map((g) => `${g.navn}: ${nf(ved(s[g.k]))} ${iParentes(pct(ved(s[g.k]), foer(s[g.k])))}.`);
  if (!visKpg) dele.push(`Total: ${nf(ved(total(s)))} ${iParentes(pct(ved(total(s)), foer(total(s))))}.`);
  return { overskrift, linjer: [dele.join(" ")], periode: `${mNavn(m)} mod ${mNavn(f)}` };
}

/** Strømme (nye kunder / nye afdelinger): pr. måned de seneste 3 måneder. */
export function tekstStroem(s: Serier, til: string, antal: number, visKpg: boolean, hvad: "nye kunder" | "nye afdelinger", kr = false): GrafTekst {
  const v = vindue(s, til, antal), k = v.nu.length;
  const pm = (x?: Map<string, number>, ms = v.nu) => sum(x, ms) / k;
  const fmt = kr ? (x: number) => fmtKr(x * k) : fmtAntal;
  const mdrTekst = k === 3 ? "de seneste 3 måneder" : k === 1 ? "den seneste måned" : `de seneste ${k} måneder`;
  const mod = modTekst(v);
  const overskrift = kr
    ? `DB fra ${hvad === "nye kunder" ? "nye forhandlingskunder" : "nye afdelinger hos forhandlingskunder"} ${mdrTekst}: ${fmtKr(sum(s.privat, v.nu))} – mod ${fmtKr(sum(s.privat, v.foer))} ${mod}.`
    : `${fmtAntal(pm(s.privat))} ${hvad === "nye kunder" ? "nye forhandlingskunder" : "nye afdelinger hos forhandlingskunder"} pr. måned ${mdrTekst} – mod ${fmtAntal(pm(s.privat, v.foer))} ${mod}.`;
  const gs = visKpg ? grupper(true) : grupper(false).filter((g) => g.k !== "privat");
  const dele = gs.map((g) => `${g.navn}: ${fmt(pm(s[g.k]))} mod ${fmt(pm(s[g.k], v.foer))}.`);
  if (!visKpg) dele.push(`Total: ${fmt(pm(total(s)))} mod ${fmt(pm(total(s), v.foer))}.`);
  return { overskrift, linjer: [(kr ? "" : "Pr. måned – ") + dele.join(" ")], periode: v.label };
}

/** Kort gruppenavn ud fra tabellens rækkelabel. */
export function kortNavn(label: string): string {
  if (label.includes("KPG3 45")) return "KPG3 45";
  if (label.includes("heraf private")) return "Private";
  if (label === "Udbudskunder") return "Udbud";
  return label;
}

/** Grupper med udgangsværdi under denne grænse udelades af indeks-teksten. */
export const INDEKS_MIN_UDGANG = 10;

/** Udviklingsvisning: indeks med første måned = 100. */
export function tekstIndeks(serier: { navn: string; per: Map<string, number> }[], maaneder: string[]): GrafTekst | null {
  if (maaneder.length < 2) return null;
  const f = maaneder[0], l = maaneder[maaneder.length - 1];
  const navne = serier.map((s) => kortNavn(s.navn));
  const harKpg = navne.includes("KPG3 45");
  const idx = serier.map((s) => {
    const b = s.per.get(f) ?? 0;
    return { navn: kortNavn(s.navn), v: b >= INDEKS_MIN_UDGANG ? ((s.per.get(l) ?? 0) / b) * 100 : null };
  }).filter((x): x is { navn: string; v: number } => x.v != null && !(harKpg && x.navn === "Forhandlingskunder"));
  if (!idx.length) return { overskrift: "For få til at vise udviklingen som indeks – se tabellen.", linjer: [] };
  const grp = idx.filter((x) => x.navn !== "Total");
  const b = (grp.length ? grp : idx).reduce((a, x) => (Math.abs(x.v - 100) > Math.abs(a.v - 100) ? x : a));
  const d = b.v - 100;
  const ord = Math.abs(d) < 5 ? "stort set uændret" : b.v >= 45 && b.v <= 55 ? "næsten halveret" : b.v >= 190 && b.v <= 210 ? "næsten fordoblet"
    : `${d > 0 ? "steget" : "faldet"} ${nf(Math.round(Math.abs(d)))} %`;
  return {
    overskrift: `Indeks: ${mNavn(f)} = 100. ${b.navn} står på ${nf(Math.round(b.v))} – ${ord} siden ${mNavn(f).split(" ")[0]}.`,
    linjer: [idx.filter((x) => x !== b).map((x) => `${x.navn} ${nf(Math.round(x.v))}.`).join(" ")],
  };
}

/** Bygger serier fra RPC-rækker (kategori privat/offentlig) og evt. KPG3 45-rækker (privat_45/privat_ovrige). */
export function serierFra(
  rows: { maaned: string | null; kategori: string; [k: string]: unknown }[] | undefined,
  felt: string,
  kpg?: { maaned: string | null; kategori: string; [k: string]: unknown }[] | null,
  kpgFelt = "vaerdi",
): Serier {
  const s: Serier = {};
  const add = (k: string, m: string | null, v: unknown) => {
    if (!m) return;
    const key = k as keyof Serier;
    const map = (s[key] ??= new Map());
    const mm = String(m).slice(0, 7);
    map.set(mm, (map.get(mm) ?? 0) + Number(v || 0));
  };
  (rows ?? []).forEach((r) => add(r.kategori, r.maaned, r[felt]));
  (kpg ?? []).forEach((r) => add(r.kategori, r.maaned, r[kpgFelt]));
  return s;
}
