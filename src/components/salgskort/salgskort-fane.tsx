import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import "maplibre-gl/dist/maplibre-gl.css";
import { toast } from "sonner";
import { AfvigelsesListe, DistriktPanel, distriktSaelger, hentDistriktData, initialer, type AfvigRow, type DistriktData, type DistriktStat } from "@/components/salgskort/distrikt";
import { SimuleringPanel, scSaelgerKey, tomAgg, useScenarie, type KamRow, type KonsekvensRow, type SimRow } from "@/components/salgskort/simulering";
import { bestemSaelger, kamMatcher, kamPortefoelje, regelMatcher, tildelMatches, type KamAftale, type Regel, type RegelLok } from "@/lib/simulering-regler";

type Flade = { flade: number; navn: string | null; landsdel: string | null; postnumre: number[] | null; geom: any };
type Lok = {
  location_id: string; company_id: string; virksomhedsnavn: string | null; zip_norm: string | null;
  saelger_user_id: string | null; saelger_navn: string | null; salesperson_no: string | null; afdeling_nr: number | null;
  customer_segment_1: string | null; customer_segment_2: string | null; customer_segment_3: string | null;
  customer_type: string | null; agreement_types: string | null; omsaetning_12m: number; db_12m: number;
  ansatte?: number | null; ansatte_kilde?: string | null;
};
type Row = Lok & { geografisk: boolean; kamIds: string[]; flade: number | null; sKey: string; sNavn: string; udstyr: string[]; gLok: RegelLok; kpg1: string; kpg2: string; kpg3: string; status: string; afd: string };

const PALETTE = ["#1f77b4","#d62728","#2ca02c","#ff7f0e","#9467bd","#8c564b","#e377c2","#17becf","#bcbd22","#3b5b92","#b5651d","#006d5b","#c71585","#4b8b3b","#a0522d","#5f4b8b","#d4a017","#00838f","#7b1fa2","#558b2f"];
const GRAA_FRELLSEN = "#8a8a8a";
const GRAA_INGEN = "#bdbdbd";
const TOM = "#eeeeee";
const BG = "#f7f6f3";

let cache: Promise<{ flader: Flade[]; map: Map<string, number>; rows: Lok[] }> | null = null;

async function hentAlt() {
  const sb = supabase as any;
  async function pages(q: (f: number, t: number) => any) {
    const out: any[] = [];
    for (let f = 0; ; f += 1000) {
      const { data, error } = await q(f, f + 999);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  const [flader, mapRows, rows] = await Promise.all([
    pages((f, t) => sb.from("postnummer_flader").select("flade,navn,landsdel,postnumre,geom").order("flade").range(f, t)),
    pages((f, t) => sb.from("postnummer_flade_map").select("postnr,flade").order("postnr").range(f, t)),
    pages((f, t) => sb.rpc("admin_salgskort_lokationer").order("location_id").range(f, t)),
  ]);
  const map = new Map<string, number>();
  mapRows.forEach((r: any) => map.set(String(r.postnr), r.flade));
  return { flader, map, rows };
}

const kr = (n: number) => Math.round(n).toLocaleString("da-DK") + " kr.";

function udstyrAf(a: string | null): string[] {
  const parts = (a ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const out = new Set<string>();
  for (const p of parts) {
    if (/gratis udlån|leje u\/b/i.test(p)) out.add("Gratis udlån");
    else if (/udlån/i.test(p)) out.add("Udlån");
    else if (/leje|leasing/i.test(p)) out.add("Leje");
  }
  return out.size ? [...out] : ["Intet"];
}

type Dim = "afd" | "kpg1" | "kpg2" | "kpg3" | "kam" | "status" | "udstyr" | "sKey";
const DIMS: { key: Dim; label: string }[] = [
  { key: "afd", label: "Afdeling" },
  { key: "kpg1", label: "Aftale (KPG1)" },
  { key: "kpg3", label: "Segment (KPG3)" },
  { key: "kam", label: "KAM-aftale" },
  { key: "status", label: "Status" },
  { key: "udstyr", label: "Udstyr" },
  { key: "sKey", label: "Sælger" },
];
type Filters = Record<Dim, Set<string>>;
const tomFiltre = (): Filters => ({ afd: new Set(), kpg1: new Set(), kpg2: new Set(), kpg3: new Set(), kam: new Set(), status: new Set(), udstyr: new Set(), sKey: new Set() });

function matcher(r: Row, f: Filters, skip?: Dim) {
  for (const d of Object.keys(f) as Dim[]) {
    if (d === skip || (skip === "kpg1" && d === "kpg2")) continue;
    const s = f[d];
    if (!s.size) continue;
    if (d === "udstyr") { if (!r.udstyr.some((u) => s.has(u))) return false; }
    else if (d === "kam") { if (!(r.kamIds.length ? r.kamIds.some((k) => s.has(k)) : s.has("__ingen"))) return false; }
    else if (d === "kpg2") { if (!s.has(r.kpg1 + "||" + r.kpg2)) return false; }
    else if (!s.has(r[d] as string)) return false;
  }
  return true;
}

function erBornholm(f: Flade) {
  const p = f.postnumre ?? [];
  return p.length > 0 && p.every((n) => n >= 3700 && n <= 3790);
}

export function SalgskortFane() {
  const auth = useAuth();
  const [data, setData] = useState<{ flader: Flade[]; map: Map<string, number>; rows: Lok[] } | null>(null);
  const [fejl, setFejl] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(tomFiltre);
  const [valgtFlade, setValgtFlade] = useState<number | null>(null);
  const [fremhaev, setFremhaev] = useState<string | null>(null);
  const [visIkkePlaceret, setVisIkkePlaceret] = useState(false);
  const [udfoldKpg1, setUdfoldKpg1] = useState<Set<string>>(new Set());
  const [visning, setVisningRaw] = useState<"virk" | "distr" | "over" | "sim">("virk");
  const setVisning = (v: "virk" | "distr" | "over" | "sim") => { setVisningRaw(v); setRedigerer(false); setValgtDistrikt(null); };
  const [dd, setDd] = useState<DistriktData | null>(null);
  const [redigerer, setRedigerer] = useState(false);
  const [valgtDistrikt, setValgtDistrikt] = useState<string | null>(null);
  const [hoverDistr, setHoverDistr] = useState<string | null>(null);
  const st = useScenarie(visning === "sim");
  const [zoom, setZoom] = useState<{ flade: number; n: number } | null>(null);
  const [fane, setFane] = useState<"saelgere" | "afvig">("saelgere");
  const [hoverSaelger, setHoverSaelger] = useState<string | null>(null);
  const [kpg1Soeg, setKpg1Soeg] = useState("");
  const [kpg1Alle, setKpg1Alle] = useState(false);
  const [sSort, setSSort] = useState<{ k: "n" | "oms" | "db"; asc: boolean }>({ k: "oms", asc: false });
  const fremhaevAktiv = hoverSaelger ?? fremhaev;
  const genhentDistrikt = () => hentDistriktData().then(setDd).catch((e) => toast.error("Distrikter: " + (e.message ?? e)));
  useEffect(() => { if (auth.role === "admin") genhentDistrikt(); }, [auth.role]);

  useEffect(() => {
    if (auth.role !== "admin") return;
    if (!cache) cache = hentAlt();
    cache.then((d) => {
      setData(d);
      if (d.rows.some((r) => r.afdeling_nr === 11)) setFilters((f) => ({ ...f, afd: new Set(["11"]) }));
    }).catch((e) => { cache = null; setFejl(e.message ?? String(e)); });
  }, [auth.role]);

  const [regionIv, setRegionIv] = useState<{ fra: number; til: number; region: string }[]>([]);
  const regionAf = (z: string | null) => { const n = Number(z); if (!z || !Number.isFinite(n)) return null; return regionIv.find((i) => n >= i.fra && n <= i.til)?.region ?? null; };
  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const fl = new Map(data.flader.map((f) => [f.flade, f.landsdel]));
    return data.rows.map((r) => {
      const frellsen = r.salesperson_no === "199";
      const sKey = frellsen ? "__frellsen" : r.saelger_user_id ?? "__ingen";
      const sNavn = frellsen ? "Frellsen (199)" : r.saelger_user_id ? r.saelger_navn || "Ukendt sælger" : "Uden sælger";
      const fla = r.zip_norm ? data.map.get(r.zip_norm) ?? null : null;
      const kpgLok: RegelLok = { kpg1: r.customer_segment_1 || "(ingen)", kpg2: r.customer_segment_2 || "(ingen)", kpg3: r.customer_segment_3 || "(ingen)", ansatte: null,
        landsdel: fla != null ? fl.get(fla) ?? null : null, distrikt: fla != null ? dd?.fladeDistrikt.get(fla) ?? null : null, region: regionAf(r.zip_norm) };
      const kamIds = (dd?.kamAftaler ?? []).filter((a) => kamMatcher(a, kpgLok)).map((a) => a.id);
      return {
        ...r, kamIds, gLok: kpgLok, geografisk: !frellsen, omsaetning_12m: Number(r.omsaetning_12m) || 0, db_12m: Number(r.db_12m) || 0,
        flade: r.zip_norm ? data.map.get(r.zip_norm) ?? null : null,
        sKey, sNavn, udstyr: udstyrAf(r.agreement_types),
        kpg1: r.customer_segment_1 || "(ingen)", kpg2: r.customer_segment_2 || "(ingen)",
        kpg3: r.customer_segment_3 || "(ingen)", status: r.customer_type || "(ingen)",
        afd: r.afdeling_nr != null ? String(r.afdeling_nr) : "(ingen)",
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dd, regionIv]);

  const farver = useMemo(() => {
    const m = new Map<string, string>([["__frellsen", GRAA_FRELLSEN], ["__ingen", GRAA_INGEN]]);
    const navne = new Map<string, string>();
    rows.forEach((r) => { if (!r.sKey.startsWith("__")) navne.set(r.sKey, r.sNavn); });
    [...navne.entries()].sort((a, b) => a[1].localeCompare(b[1], "da")).forEach(([k], i) => m.set(k, PALETTE[i % PALETTE.length]));
    return m;
  }, [rows]);

  const filtrerede = useMemo(() => rows.filter((r) => matcher(r, filters)), [rows, filters]);

  const options = useMemo(() => {
    const res: Record<string, Map<string, number>> = {};
    for (const { key } of DIMS) {
      const m = new Map<string, number>();
      rows.forEach((r) => {
        if (!matcher(r, filters, key)) return;
        const vals = key === "udstyr" ? r.udstyr : key === "kam" ? (r.kamIds.length ? r.kamIds : ["__ingen"]) : [r[key] as string];
        vals.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
      });
      res[key] = m;
    }
    const k2 = new Map<string, number>();
    rows.forEach((r) => { if (matcher(r, filters, "kpg1")) k2.set(r.kpg1 + "||" + r.kpg2, (k2.get(r.kpg1 + "||" + r.kpg2) ?? 0) + 1); });
    res.kpg2 = k2;
    return res;
  }, [rows, filters]);

  const saelgerNavn = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.sKey, r.sNavn));
    return m;
  }, [rows]);

  const profilNavn = useMemo(() => {
    const m = new Map<string, string>();
    dd?.profiler.forEach((p) => m.set(p.id, p.full_name ?? "?"));
    return m;
  }, [dd]);
  const pNavn = (id: string | null) => (id ? profilNavn.get(id) ?? "Ukendt" : "—");
  const distriktMap = useMemo(() => new Map((dd?.distrikter ?? []).map((d) => [d.id, d])), [dd]);

  // Overensstemmelse pr. flade (alle lokationer undtagen Frellsen 199, under filtrene)
  const overens = useMemo(() => {
    const m = new Map<number, { n: number; match: number; db: number; oms: number }>();
    if (!dd) return m;
    filtrerede.forEach((r) => {
      if (r.flade == null || !r.geografisk) return;
      const d = distriktMap.get(dd.fladeDistrikt.get(r.flade) ?? "");
      const e = m.get(r.flade) ?? { n: 0, match: 0, db: 0, oms: 0 };
      e.n++; e.db += r.db_12m; e.oms += r.omsaetning_12m;
      if (d && distriktSaelger(d) === r.saelger_user_id) e.match++;
      m.set(r.flade, e);
    });
    return m;
  }, [filtrerede, dd, distriktMap]);

  const distriktStats = useMemo(() => {
    const m = new Map<string, DistriktStat>();
    if (!dd) return m;
    dd.fladeDistrikt.forEach((did, fl) => {
      const s = m.get(did) ?? { flader: 0, n: 0, match: 0, db: 0, oms: 0 };
      const o = overens.get(fl);
      s.flader++; if (o) { s.n += o.n; s.match += o.match; s.db += o.db; s.oms += o.oms; }
      m.set(did, s);
    });
    return m;
  }, [dd, overens]);

  const afvigelser: AfvigRow[] = useMemo(() => {
    if (!dd || !data) return [];
    const fn = new Map(data.flader.map((f) => [f.flade, f.navn ?? ""]));
    const out: AfvigRow[] = [];
    filtrerede.forEach((r) => {
      if (r.flade == null || !r.geografisk) return;
      const d = distriktMap.get(dd.fladeDistrikt.get(r.flade) ?? "");
      if (!d) return;
      const ds = distriktSaelger(d);
      if (ds === r.saelger_user_id) return;
      out.push({ location_id: r.location_id, company_id: r.company_id, virksomhed: r.virksomhedsnavn ?? "", postnr: r.zip_norm ?? "",
        by: fn.get(r.flade) ?? "", flade: r.flade, distrikt: d.navn, distriktSaelger: d.saelger_user_id ? pNavn(ds) : `NY (${ds ? pNavn(ds) : "ingen"})`,
        nuvaerende: r.sNavn, kpg1: r.kpg1, db: r.db_12m });
    });
    return out.sort((a, b) => b.db - a.db);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrerede, dd, distriktMap, data, profilNavn]);

  const kamNavn = useMemo(() => new Map((dd?.kamAftaler ?? []).map((a) => [a.id, a])), [dd]);
  const kamStat = useMemo(() => {
    const m = new Map<string, { n: number; oms: number }>();
    filtrerede.forEach((r) => r.kamIds.forEach((k) => { const e = m.get(k) ?? { n: 0, oms: 0 }; e.n++; e.oms += r.omsaetning_12m; m.set(k, e); }));
    return m;
  }, [filtrerede]);
  const kamTip = (ids: string[]) => ids.map((id) => { const a = kamNavn.get(id); if (!a) return ""; return `${a.navn}${a.ansvarlige.length ? " – " + a.ansvarlige.map((x) => pNavn(x)).join(", ") : ""}`; }).filter(Boolean).join("\n");
  const filterVaerdi = (d: Dim, v: string) => d === "sKey" ? saelgerNavn.get(v) ?? v : d === "kpg2" ? v.split("||")[1] : d === "afd" ? "Afd. " + v
    : d === "kam" ? (v === "__ingen" ? "Ingen KAM-aftale" : kamNavn.get(v)?.navn ?? "?") : v;

  const tildel = (fl: number) => { if (visning === "sim" && valgtDistrikt) st.tildel(fl, valgtDistrikt); };

  // Simulering: sælger efter scenariet pr. lokation
  const scMap = useMemo(() => new Map((st.sc?.distrikter ?? []).map((d) => [d.id, d])), [st.sc]);
  const fiktivMap = useMemo(() => new Map((st.sc?.saelgere ?? []).map((x) => [x.id, x])), [st.sc]);
  const simNavn = (k: string) => k.startsWith("f:") ? (fiktivMap.get(k.slice(2))?.navn ?? "?") + " (fiktiv)" : saelgerNavn.get(k) ?? (k === "__ingen" ? "Uden sælger" : pNavn(k));
  const simFarve = (k: string) => farver.get(k) ?? (k.startsWith("f:") ? fiktivMap.get(k.slice(2))?.farve : undefined) ?? GRAA_INGEN;
  const regler: Regel[] = useMemo(() => (st.sc?.regler ?? []).map((r) => ({
    id: r.id, type: r.type, aktiv: r.aktiv, b: r.betingelse ?? {},
    saelger: r.saelger_user_id ?? (r.saelger_fiktiv_id ? "f:" + r.saelger_fiktiv_id : "__ingen"),
  })), [st.sc]);
  // Regionsopslag (postnummer-intervaller) til reglers område
  useEffect(() => {
    if (auth.role !== "admin" || regionIv.length) return;
    (supabase as any).from("postnummer_region").select("postnr_fra,postnr_til,region").then(({ data }: any) =>
      setRegionIv((data ?? []).map((r: any) => ({ fra: r.postnr_fra, til: r.postnr_til, region: r.region }))));
  }, [auth.role, regionIv.length]);
  const fladeLandsdel = useMemo(() => new Map((data?.flader ?? []).map((f) => [f.flade, f.landsdel])), [data]);
  const simLoks = useMemo(() => {
    if (visning !== "sim" || !st.sc) return [] as { r: Row; lok: RegelLok }[];
    return filtrerede.map((r) => ({ r, lok: { ...r.gLok, ansatte: r.ansatte ?? null,
      distrikt: r.flade != null ? st.sc!.fladeDistrikt.get(r.flade) ?? null : null } }));
  }, [visning, st.sc, filtrerede, fladeLandsdel, regionIv]);
  const regioner = useMemo(() => [...new Set(regionIv.map((i) => i.region))].sort((a, b) => a.localeCompare(b, "da")), [regionIv]);
  /** Live-tal i regeldialogen: lokationer der matcher (uden hensyn til andre regler), Frellsen undtaget. */
  const taelRegel = (r: Regel) => {
    let n = 0, oms = 0;
    for (const x of simLoks) if (x.r.salesperson_no !== "199" && regelMatcher(x.lok, r.b, r.type)) { n++; oms += x.r.omsaetning_12m; }
    return { n, oms };
  };
  const scKam: KamAftale[] = useMemo(() => (st.sc?.kam ?? []).map((k) => ({ id: k.id, navn: k.navn, kpg1: k.kpg1 ?? [], kpg2: k.kpg2 ?? [], kpg3: k.kpg3 ?? [],
    omraade: k.omraade ?? null, aktiv: k.aktiv, ansvarlige: [...(k.kam_ansvarlige ?? []), ...(k.kam_fiktive ?? []).map((f) => "f:" + f)] })), [st.sc]);
  /** Live-tal for en KAM-aftale under de aktive filtre (Frellsen undtaget); sc = scenariets distrikter. */
  const taelKam = (a: KamAftale, sc = false) => {
    let n = 0, oms = 0;
    if (sc) { for (const x of simLoks) if (x.r.salesperson_no !== "199" && kamMatcher(a, x.lok)) { n++; oms += x.r.omsaetning_12m; } }
    else for (const r of filtrerede) if (r.salesperson_no !== "199" && kamMatcher(a, r.gLok)) { n++; oms += r.omsaetning_12m; }
    return { n, oms };
  };
  const sim = useMemo(() => {
    const kons = new Map<string, KonsekvensRow>();
    const flyt: SimRow[] = [];
    const afviger: SimRow[] = [];
    const regelStat = new Map<string, { n: number; oms: number }>();
    const overlap = new Map<string, Map<string, number>>();
    if (visning !== "sim" || !st.sc || !data || !dd) return { kons: [] as KonsekvensRow[], flyt, afviger, regelStat, overlap, ukendte: 0, penhed: 0, kam: [] as KamRow[], scKamStat: new Map<string, { n: number; oms: number }>() };
    const fn = new Map(data.flader.map((f) => [f.flade, f.navn ?? ""]));
    const gDistr = new Map(dd.distrikter.map((d) => [d.id, d]));
    const get = (k: string) => { let e = kons.get(k); if (!e) kons.set(k, (e = { key: k, foer: tomAgg(), efter: tomAgg() })); return e; };
    let ukendte = 0, penhed = 0;
    simLoks.forEach(({ r, lok }) => {
      if (r.ansatte == null) ukendte++; else if (r.ansatte_kilde === "penhed") penhed++;
      const frellsen = r.salesperson_no === "199";
      if (!frellsen) {
        const m = tildelMatches(lok, regler);
        for (const tabt of m.slice(1)) { let o = overlap.get(tabt); if (!o) overlap.set(tabt, (o = new Map())); o.set(m[0]!, (o.get(m[0]!) ?? 0) + 1); }
      }
      const scD = r.flade != null ? scMap.get(st.sc!.fladeDistrikt.get(r.flade) ?? "") : undefined;
      const gD = r.flade != null ? gDistr.get(dd.fladeDistrikt.get(r.flade) ?? "") : undefined;
      const fælles = { nu: r.sKey, frellsen, lok };
      const b = bestemSaelger({ ...fælles, geo: scD ? scSaelgerKey(scD) : null, regler });
      const g = bestemSaelger({ ...fælles, geo: gD ? distriktSaelger(gD) ?? "__ingen" : null, regler: [] });
      const til = b.til;
      const aktiv = r.customer_type === "aktiv_kunde";
      for (const [k, side] of [[r.sKey, "foer"], [til, "efter"]] as const) {
        const a = get(k)[side]; a.n++; a.aktive += aktiv ? 1 : 0; a.oms += r.omsaetning_12m; a.db += r.db_12m;
      }
      if (b.aarsag && b.aarsag !== "geo") { const s = regelStat.get(b.aarsag) ?? { n: 0, oms: 0 }; s.n++; s.oms += r.omsaetning_12m; regelStat.set(b.aarsag, s); }
      const basis = { location_id: r.location_id, company_id: r.company_id, virksomhed: r.virksomhedsnavn ?? "", postnr: r.zip_norm ?? "",
        by: r.flade != null ? fn.get(r.flade) ?? "" : "", aktiv, oms: r.omsaetning_12m, db: r.db_12m, nu: r.sKey };
      if (til !== g.til) flyt.push({ ...basis, fra: g.til, til, aarsag: b.aarsag && b.aarsag !== "geo" ? b.aarsag : "geo" });
      if (g.til !== r.sKey) afviger.push({ ...basis, fra: r.sKey, til: g.til, aarsag: null });
    });
    const ikkeF = simLoks.filter((x) => x.r.salesperson_no !== "199");
    const kamRowsF = ikkeF.map(({ r }) => ({ id: r.location_id, lok: r.gLok, oms: r.omsaetning_12m, db: r.db_12m }));
    const kamRowsE = ikkeF.map(({ r, lok }) => ({ id: r.location_id, lok, oms: r.omsaetning_12m, db: r.db_12m }));
    const kf = kamPortefoelje(kamRowsF, dd.kamAftaler), ke = kamPortefoelje(kamRowsE, scKam);
    const scKamStat = new Map<string, { n: number; oms: number }>();
    for (const a of scKam) scKamStat.set(a.id, taelKam(a, true));
    const tom = { aftaler: 0, n: 0, oms: 0, db: 0 };
    const kam: KamRow[] = [...new Set([...kf.keys(), ...ke.keys()])].map((k) => ({ key: k, foer: kf.get(k) ?? tom, efter: ke.get(k) ?? tom })).sort((a, b) => b.efter.oms - a.efter.oms);
    return { kons: [...kons.values()].sort((a, b) => b.efter.oms - a.efter.oms), flyt, afviger, regelStat, overlap, ukendte, penhed, kam, scKamStat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visning, st.sc, data, dd, filtrerede, simLoks, scMap, regler, scKam]);
  const regelValg = useMemo(() => ({
    kpg1: [...(options.kpg1 ?? new Map()).entries()].sort((a, b) => b[1] - a[1]),
    kpg2: [...(options.kpg2 ?? new Map()).entries()].filter(([k]) => !k.endsWith("||(ingen)")).sort((a, b) => b[1] - a[1]),
    kpg3: [...(options.kpg3 ?? new Map()).entries()].sort((a, b) => b[1] - a[1]),
  }), [options]);

  // Pr. flade: fordeling pr. sælger
  const pFlade = useMemo(() => {
    const m = new Map<number, Map<string, { n: number; oms: number; db: number }>>();
    filtrerede.forEach((r) => {
      if (r.flade == null) return;
      let s = m.get(r.flade); if (!s) m.set(r.flade, (s = new Map()));
      const e = s.get(r.sKey) ?? { n: 0, oms: 0, db: 0 };
      e.n++; e.oms += r.omsaetning_12m; e.db += r.db_12m; s.set(r.sKey, e);
    });
    return m;
  }, [filtrerede]);

  const ikkePlaceret = useMemo(() => filtrerede.filter((r) => r.flade == null), [filtrerede]);

  const saelgerBjaelke = useMemo(() => {
    const m = new Map<string, { n: number; oms: number; db: number }>();
    filtrerede.forEach((r) => {
      const e = m.get(r.sKey) ?? { n: 0, oms: 0, db: 0 };
      e.n++; e.oms += r.omsaetning_12m; e.db += r.db_12m; m.set(r.sKey, e);
    });
    return [...m.entries()].sort((a, b) => b[1].oms - a[1].oms);
  }, [filtrerede]);

  // Feature-egenskaber
  const geo = useMemo(() => {
    if (!data) return null;
    const mk = (bh: boolean) => ({
      type: "FeatureCollection" as const,
      features: data.flader.filter((f) => f.geom && erBornholm(f) === bh).map((f) => {
        const s = pFlade.get(f.flade);
        let color = TOM, opacity = 1, lc = "#ffffff", lw = 0.5, ubesat = false, tip = (f.postnumre ?? []).join(", ");
        if (visning === "sim") {
          const d = scMap.get(st.sc?.fladeDistrikt.get(f.flade) ?? "");
          if (!d) { lc = "#d62728"; lw = 1.5; tip = "Intet distrikt"; }
          else {
            color = d.farve; const fiktiv = !!d.saelger_fiktiv_id; const besat = !!(d.saelger_user_id || d.saelger_fiktiv_id);
            opacity = besat ? 0.8 : 0.35; ubesat = !d.saelger_user_id; lc = ubesat ? "#333333" : "#ffffff"; lw = ubesat ? 1 : 0.5;
            if (hoverDistr) opacity = hoverDistr === d.id ? 0.95 : 0.12;
            tip = `${d.navn} · ${d.saelger_user_id ? pNavn(d.saelger_user_id) : fiktiv ? (fiktivMap.get(d.saelger_fiktiv_id!)?.navn ?? "?") + " (fiktiv)" : "NY – dækkes af " + (d.daekkes_af_user_id ? pNavn(d.daekkes_af_user_id) : "ingen")}`;
          }
        } else if (visning !== "virk") {
          const d = distriktMap.get(dd?.fladeDistrikt.get(f.flade) ?? "");
          const o = overens.get(f.flade);
          if (!d) { lc = "#d62728"; lw = 1.5; }
          if (visning === "distr") {
            if (d) { color = d.farve; opacity = d.saelger_user_id ? 0.8 : 0.35; ubesat = !d.saelger_user_id; lc = ubesat ? "#333333" : "#ffffff"; lw = ubesat ? 1 : 0.5; }
            tip = d ? `${d.navn} · ${d.saelger_user_id ? pNavn(d.saelger_user_id) : "NY – dækkes af " + (d.daekkes_af_user_id ? pNavn(d.daekkes_af_user_id) : "ingen")}` : "Intet distrikt";
          } else {
            if (!o || !o.n) { color = "#cccccc"; tip = (d ? d.navn + " · " : "") + "Ingen lokationer"; }
            else {
              const pct = o.match / o.n;
              color = pct >= 0.995 ? "#2e9e48" : pct >= 0.7 ? "#e8c330" : "#d62728"; opacity = 0.8;
              tip = `${o.match} af ${o.n} lokationer (${Math.round(pct * 100)} %) hos ${d ? initialer(pNavn(distriktSaelger(d))) : "—"}${d ? "" : " · intet distrikt"}`;
            }
          }
        } else if (s && s.size) {
          const total = [...s.values()].reduce((a, b) => a + b.n, 0);
          if (fremhaevAktiv) {
            const e = s.get(fremhaevAktiv);
            if (e) { color = farver.get(fremhaevAktiv) ?? TOM; opacity = 0.25 + 0.75 * (e.n / total); }
          } else {
            const [k, e] = [...s.entries()].sort((a, b) => b[1].n - a[1].n)[0];
            color = farver.get(k) ?? TOM; opacity = 0.25 + 0.75 * (e.n / total);
          }
        }
        return {
          type: "Feature" as const, id: f.flade, geometry: f.geom,
          properties: { flade: f.flade, navn: f.navn ?? "", postnumre: tip, color, opacity, lc, lw, ubesat },
        };
      }),
    });
    return { main: mk(false), bh: mk(true) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pFlade, farver, fremhaevAktiv, visning, overens, dd, distriktMap, profilNavn, st.sc, scMap, fiktivMap]);

  if (auth.loading) return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Indlæser…</div>;
  if (auth.role !== "admin") return null;

  const toggle = (d: Dim, v: string) => setFilters((f) => {
    const s = new Set(f[d]); s.has(v) ? s.delete(v) : s.add(v);
    return { ...f, [d]: s };
  });
  const total = saelgerBjaelke.reduce((a, [, e]) => ({ n: a.n + e.n, oms: a.oms + e.oms, db: a.db + e.db }), { n: 0, oms: 0, db: 0 });
  const flade = valgtFlade != null ? data?.flader.find((f) => f.flade === valgtFlade) : null;
  const nulstil = () => { setFilters(tomFiltre()); setFremhaev(null); };
  const chips: { key: string; label: string; fjern: () => void }[] = [];
  (Object.keys(filters) as Dim[]).forEach((d) => filters[d].forEach((v) => {
    const dl = DIMS.find((x) => x.key === d)?.label ?? "Underaftale";
    const vl = filterVaerdi(d, v);
    chips.push({ key: d + v, label: `${dl.replace(/ \(.*\)/, "")}: ${vl}`, fjern: () => toggle(d, v) });
  }));
  const sorteretSaelgere = [...saelgerBjaelke].sort((a, b) => (sSort.asc ? 1 : -1) * (a[1][sSort.k] - b[1][sSort.k]));

  return (
    <div className="space-y-4">
      {fejl && <Card className="p-4 text-destructive">Kunne ikke hente data: {fejl}</Card>}
      {!data && !fejl && <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Henter kort og salgsdata…</div>}
      {data && data.flader.length === 0 && (
        <Card className="p-10 text-center">
          <div className="text-lg font-medium">Kortdata er ikke indlæst endnu</div>
          <p className="text-sm text-muted-foreground mt-1">Postnummerfladerne skal indlæses, før kortet kan vises. {rows.length.toLocaleString("da-DK")} lokationer med salg er klar.</p>
        </Card>
      )}

      {data && data.flader.length > 0 && geo && (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_minmax(420px,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_minmax(520px,1.4fr)] lg:h-[calc(100vh-14rem)]">
          <Card className="p-3 space-y-4 lg:h-full max-h-[80vh] lg:max-h-none overflow-y-auto text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Filtre</span>
              <Button size="sm" variant="outline" onClick={nulstil}>Nulstil filtre</Button>
            </div>
            {DIMS.map(({ key, label }) => {
              let opts = [...options[key].entries()].sort((a, b) => b[1] - a[1]);
              let skjulte = 0;
              if (key === "kpg1") {
                const q = kpg1Soeg.trim().toLowerCase();
                if (q) opts = opts.filter(([v]) => v.toLowerCase().includes(q));
                const valgte = opts.filter(([v]) => filters.kpg1.has(v));
                const ovrige = opts.filter(([v]) => !filters.kpg1.has(v));
                const vis = kpg1Alle || q ? ovrige : ovrige.slice(0, 8);
                skjulte = ovrige.length - vis.length;
                opts = [...valgte, ...vis];
              }
              return (
                <div key={key}>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
                  {key === "kpg1" && (
                    <div className="relative mb-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input value={kpg1Soeg} onChange={(e) => setKpg1Soeg(e.target.value)} placeholder="Søg aftale…" className="h-7 pl-7 text-xs" />
                    </div>
                  )}
                  {opts.map(([v, n]) => (
                    <div key={v}>
                      <label className="flex items-center gap-2 py-0.5 cursor-pointer">
                        <Checkbox checked={filters[key].has(v)} onCheckedChange={() => toggle(key, v)} />
                        {key === "sKey" && <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: farver.get(v) }} />}
                        <span className="flex-1 truncate">{filterVaerdi(key, v)}</span>
                        <span className="text-muted-foreground tabular-nums">{n}</span>
                        {key === "kpg1" && (
                          <button type="button" className="text-xs text-muted-foreground px-1" onClick={(e) => { e.preventDefault(); setUdfoldKpg1((s) => { const t = new Set(s); t.has(v) ? t.delete(v) : t.add(v); return t; }); }}>
                            {udfoldKpg1.has(v) ? "−" : "+"}
                          </button>
                        )}
                      </label>
                      {key === "kpg1" && udfoldKpg1.has(v) && (
                        <div className="pl-6">
                          {[...options.kpg2.entries()].filter(([k]) => k.startsWith(v + "||")).sort((a, b) => b[1] - a[1]).map(([k, n2]) => (
                            <label key={k} className="flex items-center gap-2 py-0.5 cursor-pointer">
                              <Checkbox checked={filters.kpg2.has(k)} onCheckedChange={() => toggle("kpg2", k)} />
                              <span className="flex-1 truncate">{k.split("||")[1]}</span>
                              <span className="text-muted-foreground tabular-nums">{n2}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {key === "kpg1" && !kpg1Soeg && (skjulte > 0 || kpg1Alle) && (
                    <button type="button" className="mt-1 text-xs text-muted-foreground hover:underline" onClick={() => setKpg1Alle(!kpg1Alle)}>
                      {kpg1Alle ? "Vis færre" : `Vis alle (${options.kpg1.size})`}
                    </button>
                  )}
                </div>
              );
            })}
          </Card>

          <Card className={"flex flex-col lg:h-full h-[70vh] overflow-hidden " + (redigerer ? "ring-2 ring-primary" : "")}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <div className="flex rounded-md border border-border text-xs overflow-hidden">
                {([["virk", "Virkelighed"], ["distr", "Distrikter"], ["over", "Overensstemmelse"], ["sim", "Simulering"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setVisning(k)} className={"px-1.5 py-1 whitespace-nowrap " + (visning === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{l}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {redigerer && <span className="rounded bg-primary text-primary-foreground px-2 py-0.5 text-xs whitespace-nowrap">Redigerer</span>}
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setVisIkkePlaceret(true)}>Ikke placeret ({ikkePlaceret.length})</Button>
              </div>
            </div>
            {visning === "virk" && saelgerBjaelke.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 border-b border-border px-3 py-1.5 text-xs" onMouseLeave={() => setHoverSaelger(null)}>
                {saelgerBjaelke.map(([k]) => (
                  <button key={k} type="button" onMouseEnter={() => setHoverSaelger(k)} onClick={() => setFremhaev(fremhaev === k ? null : k)}
                    className={"inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted " + (fremhaev === k ? "bg-muted font-medium" : "")}>
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: farver.get(k) }} />
                    <span className="whitespace-nowrap">{saelgerNavn.get(k)}</span>
                  </button>
                ))}
                {fremhaev && <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:underline" onClick={() => setFremhaev(null)}><X className="h-3 w-3" /> Fjern fremhævning</button>}
              </div>
            )}
            {visning === "sim" && st.sc && st.sc.distrikter.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 border-b border-border px-3 py-1.5 text-xs" onMouseLeave={() => setHoverDistr(null)}>
                {st.sc.distrikter.map((d) => (
                  <button key={d.id} type="button" onMouseEnter={() => setHoverDistr(d.id)}
                    onClick={() => { setValgtDistrikt(d.id); if (st.scenarier.find((s) => s.id === st.valgtId)?.status === "kladde") setRedigerer(true); }}
                    className={"inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted " + (valgtDistrikt === d.id && redigerer ? "bg-muted font-medium" : "")}>
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.farve, outline: d.saelger_user_id ? undefined : "1px dashed currentColor" }} />
                    <span className="whitespace-nowrap">{d.navn} – {simNavn(scSaelgerKey(d))}</span>
                  </button>
                ))}
              </div>
            )}
            {chips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
                {chips.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs max-w-[240px]">
                    <span className="truncate">{c.label}</span>
                    <button type="button" aria-label="Fjern filter" onClick={c.fjern}><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <button type="button" className="text-xs text-muted-foreground hover:underline ml-1" onClick={nulstil}>Nulstil filtre</button>
              </div>
            )}
            <div className="relative flex-1 min-h-0">
              <Kort geo={geo} onKlik={(f) => (redigerer ? tildel(f) : setValgtFlade(f))} redigerer={redigerer && !!valgtDistrikt} onMal={tildel} zoom={zoom}
                fitKey={`${visning}|${!!flade}|${st.valgtId ?? ""}|${chips.length > 0}|${saelgerBjaelke.length > 0}`} />
              {(visning === "distr" || visning === "over") && dd && dd.distrikter.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70 pointer-events-none">
                  <div className="rounded-lg border border-border bg-card p-6 text-center shadow">
                    <div className="text-lg font-medium">Distriktskortet er ikke oprettet endnu</div>
                    <p className="text-sm text-muted-foreground mt-1">Opret distrikter i et scenarie under Simulering og gør det gældende.</p>
                  </div>
                </div>
              )}
              {visning === "virk" && !flade && (
                <div className="absolute bottom-6 right-2 rounded-md bg-background/90 border border-border px-2 py-1 text-xs text-muted-foreground pointer-events-none">Klik på en flade for detaljer</div>
              )}
              <div className="absolute bottom-1 left-2 text-[10px] text-muted-foreground">Kilde: DAGI, Klimadatastyrelsen · Kystlinje © OpenStreetMap-bidragydere</div>
            </div>
          </Card>

          <Card className="lg:h-full min-h-[60vh] text-sm flex flex-col overflow-hidden">
            {visning === "virk" && flade ? (
              <FladePanel flade={flade} fordeling={pFlade.get(flade.flade)} lok={filtrerede.filter((r) => r.flade === flade.flade)} navne={saelgerNavn} farver={farver} kamTip={kamTip} onLuk={() => setValgtFlade(null)} />
            ) : visning === "sim" ? (
              dd ? <SimuleringPanel st={st} dd={dd} navn={simNavn} farve={simFarve} konsekvens={sim.kons} flytninger={sim.flyt}
                afviger={sim.afviger} regler={regler} regelStat={sim.regelStat} overlap={sim.overlap} taelRegel={taelRegel} regioner={regioner} ukendteAnsatte={sim.ukendte} penhedAnsatte={sim.penhed}
                antalLok={filtrerede.length} regelValg={regelValg} kamPort={sim.kam} kamTael={(a) => taelKam(a, true)} kamStat={sim.scKamStat}
                redigerer={redigerer} setRedigerer={setRedigerer}
                valgt={valgtDistrikt} setValgt={setValgtDistrikt} fladeNavn={new Map(data.flader.map((f) => [f.flade, f.navn ?? ""]))} /> : null
            ) : (
              <>
                {visning !== "virk" && dd && (
                  <div className="p-3 overflow-y-auto max-h-[50%] shrink-0">
                    <DistriktPanel data={dd} stats={distriktStats} navn={pNavn} redigerer={redigerer} setRedigerer={setRedigerer}
                      valgt={null} setValgt={() => {}} kanFortryde={false} onFortryd={() => {}}
                      onGemt={genhentDistrikt} kamValg={regelValg} kamStat={kamStat} kunVisning kamTael={(a) => taelKam(a)} regioner={regioner} />
                  </div>
                )}
              <div className={"flex flex-col min-h-0 " + (visning !== "virk" ? "flex-1 border-t border-border" : "flex-1")}>
                <div className="flex gap-2 p-3 pb-2">
                  <Button size="sm" variant={fane === "saelgere" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setFane("saelgere")}>Sælgere</Button>
                  <Button size="sm" variant={fane === "afvig" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setFane("afvig")}>Afvigelser fra distrikt ({afvigelser.length})</Button>
                </div>
                <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
                {fane === "afvig" ? (
                  (dd?.distrikter.length ?? 0) === 0 ? <div className="text-sm text-muted-foreground p-4">Distriktskortet er ikke oprettet endnu.</div> :
                  <AfvigelsesListe rows={afvigelser} onZoom={(fl) => setZoom({ flade: fl, n: Date.now() })} />
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card text-muted-foreground">
                      <tr><th className="text-left px-2 py-1 font-medium">Sælger</th>
                        <SortTh label="Lok." aktiv={sSort.k === "n"} asc={sSort.asc} onClick={() => setSSort({ k: "n", asc: sSort.k === "n" ? !sSort.asc : false })} />
                        <SortTh label="Oms. 12 mdr." aktiv={sSort.k === "oms"} asc={sSort.asc} onClick={() => setSSort({ k: "oms", asc: sSort.k === "oms" ? !sSort.asc : false })} />
                        <SortTh label="DB" aktiv={sSort.k === "db"} asc={sSort.asc} onClick={() => setSSort({ k: "db", asc: sSort.k === "db" ? !sSort.asc : false })} /></tr>
                    </thead>
                    <tbody>
                      {sorteretSaelgere.map(([k, e]) => (
                        <tr key={k} onClick={() => setFremhaev(fremhaev === k ? null : k)} className={"border-t border-border cursor-pointer hover:bg-muted/40 " + (fremhaev === k ? "bg-muted/60" : "")}>
                          <td className="px-2 py-1 max-w-[150px]"><div className="flex items-center gap-1.5 min-w-0"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: farver.get(k) }} /><span className="truncate" title={saelgerNavn.get(k)}>{saelgerNavn.get(k)}</span></div></td>
                          <td className="text-right px-2 tabular-nums">{e.n}</td>
                          <td className="text-right px-2 tabular-nums whitespace-nowrap">{kr(e.oms)}</td>
                          <td className="text-right px-2 tabular-nums whitespace-nowrap text-muted-foreground">{kr(e.db)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border font-medium">
                        <td className="px-2 py-1">I alt</td><td className="text-right px-2 tabular-nums">{total.n}</td>
                        <td className="text-right px-2 tabular-nums whitespace-nowrap">{kr(total.oms)}</td><td className="text-right px-2 tabular-nums whitespace-nowrap text-muted-foreground">{kr(total.db)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
                </div>
              </div>
              </>
            )}
          </Card>
        </div>
      )}


      <Dialog open={visIkkePlaceret} onOpenChange={setVisIkkePlaceret}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ikke placeret ({ikkePlaceret.length})</DialogTitle></DialogHeader>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Virksomhed</th><th className="text-left">Postnr.</th><th className="text-left">Sælger</th><th className="text-right">Omsætning</th></tr></thead>
            <tbody>
              {ikkePlaceret.map((r) => (
                <tr key={r.location_id} className="border-t border-border">
                  <td className="py-1"><Link to="/virksomheder/$id" params={{ id: r.company_id }} className="hover:underline">{r.virksomhedsnavn}</Link></td>
                  <td>{r.zip_norm || "—"}</td><td>{r.sNavn}</td><td className="text-right tabular-nums">{kr(r.omsaetning_12m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortTh({ label, aktiv, asc, onClick, left, w }: { label: string; aktiv: boolean; asc: boolean; onClick: () => void; left?: boolean; w?: string }) {
  const Ic = !aktiv ? ArrowUpDown : asc ? ArrowUp : ArrowDown;
  return (
    <th className={"px-2 py-1 font-medium whitespace-nowrap " + (w ?? "") + " " + (left ? "text-left" : "text-right")}>
      <button type="button" onClick={onClick} className={"inline-flex items-center gap-1 hover:text-foreground " + (aktiv ? "text-foreground" : "")}>
        {label}<Ic className="h-3 w-3" />
      </button>
    </th>
  );
}

type LokInfo = { address: string | null; city: string | null; visma_delivery_no: string | null };

function FladePanel({ flade, fordeling, lok, navne, farver, kamTip, onLuk }: {
  flade: Flade; fordeling?: Map<string, { n: number; oms: number; db: number }>; lok: Row[];
  navne: Map<string, string>; farver: Map<string, string>; kamTip: (ids: string[]) => string; onLuk: () => void;
}) {
  const ford = [...(fordeling?.entries() ?? [])].sort((a, b) => b[1].oms - a[1].oms);
  const [q, setQ] = useState("");
  const [saelgerF, setSaelgerF] = useState<string | null>(null);
  const [sort, setSort] = useState<{ k: "navn" | "saelger" | "oms" | "db"; asc: boolean }>({ k: "oms", asc: false });
  const [info, setInfo] = useState<Map<string, LokInfo>>(new Map());
  useEffect(() => { setQ(""); setSaelgerF(null); }, [flade.flade]);
  const ids = lok.map((r) => r.location_id).join(",");
  useEffect(() => {
    const list = ids ? ids.split(",") : [];
    if (!list.length) return;
    let dead = false;
    (async () => {
      const m = new Map<string, LokInfo>();
      for (let i = 0; i < list.length; i += 200) {
        const { data } = await (supabase as any).from("locations").select("id,address,city,visma_delivery_no").in("id", list.slice(i, i + 200));
        (data ?? []).forEach((r: any) => m.set(r.id, r));
      }
      if (!dead) setInfo(m);
    })();
    return () => { dead = true; };
  }, [ids]);

  const ql = q.trim().toLowerCase();
  const vis = lok.filter((r) => {
    if (saelgerF && r.sKey !== saelgerF) return false;
    if (!ql) return true;
    const i = info.get(r.location_id);
    return [r.virksomhedsnavn, r.sNavn, r.zip_norm, i?.address, i?.city, i?.visma_delivery_no].some((v) => (v ?? "").toLowerCase().includes(ql));
  }).sort((a, b) => {
    const d = sort.k === "oms" ? a.omsaetning_12m - b.omsaetning_12m : sort.k === "db" ? a.db_12m - b.db_12m
      : sort.k === "navn" ? (a.virksomhedsnavn ?? "").localeCompare(b.virksomhedsnavn ?? "", "da") : a.sNavn.localeCompare(b.sNavn, "da");
    return sort.asc ? d : -d;
  });
  const s = (k: typeof sort.k) => setSort({ k, asc: sort.k === k ? !sort.asc : k === "navn" || k === "saelger" });

  return (
    <>
      <div className="p-3 space-y-3 border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{flade.navn}</div>
            <div className="text-xs text-muted-foreground truncate">{(flade.postnumre ?? []).join(", ")}</div>
          </div>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onLuk} aria-label="Luk"><X className="h-4 w-4" /></Button>
        </div>
        {ford.length > 0 && (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr><th className="text-left font-medium">Sælger</th><th className="text-right font-medium">Lok.</th><th className="text-right font-medium">Oms.</th><th className="text-right font-medium">DB</th></tr></thead>
            <tbody>
              {ford.map(([k, e]) => (
                <tr key={k} onClick={() => setSaelgerF(saelgerF === k ? null : k)} className={"border-t border-border cursor-pointer hover:bg-muted/40 " + (saelgerF === k ? "bg-muted/60" : "")}>
                  <td className="py-1 max-w-[120px]"><div className="flex items-center gap-1.5 min-w-0"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: farver.get(k) }} /><span className="truncate" title={navne.get(k)}>{navne.get(k)}</span></div></td>
                  <td className="text-right tabular-nums">{e.n}</td><td className="text-right tabular-nums">{kr(e.oms)}</td><td className="text-right tabular-nums text-muted-foreground">{kr(e.db)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {ford.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Lokationer</span>
              <span className="text-xs text-muted-foreground tabular-nums">{vis.length} af {lok.length} lokationer</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg navn, sælger, kundenr., adresse…" className="h-8 pl-7 text-xs" />
            </div>
            {(saelgerF || ql) && (
              <div className="flex flex-wrap gap-1">
                {saelgerF && <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs">Sælger: {navne.get(saelgerF)}<button type="button" aria-label="Fjern" onClick={() => setSaelgerF(null)}><X className="h-3 w-3" /></button></span>}
                {ql && <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs">Søgning: {q}<button type="button" aria-label="Fjern" onClick={() => setQ("")}><X className="h-3 w-3" /></button></span>}
              </div>
            )}
          </div>
        )}
      </div>
      {!ford.length ? <div className="p-3 text-muted-foreground">Ingen lokationer under de valgte filtre.</div> : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-xs table-fixed">
            <thead className="sticky top-0 bg-card text-muted-foreground shadow-[0_1px_0_var(--border)]">
              <tr>
                <SortTh left label="Lokation" aktiv={sort.k === "navn"} asc={sort.asc} onClick={() => s("navn")} />
                <SortTh left w="w-[32%]" label="Sælger" aktiv={sort.k === "saelger"} asc={sort.asc} onClick={() => s("saelger")} />
                <SortTh w="w-[110px]" label="Oms. 12 mdr." aktiv={sort.k === "oms"} asc={sort.asc} onClick={() => s("oms")} />
              </tr>
            </thead>
            <tbody>
              {vis.map((r) => {
                return (
                  <tr key={r.location_id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <Link to="/virksomheder/$id" params={{ id: r.company_id }} target="_blank" className="truncate hover:underline" title={r.virksomhedsnavn ?? ""}>{r.virksomhedsnavn}</Link>
                        {r.kamIds.length > 0 && <span className="shrink-0 rounded border border-border px-1 text-[10px] leading-4 text-muted-foreground cursor-help" title={"KAM: " + kamTip(r.kamIds)}>KAM</span>}
                      </div>
                    </td>
                    <td className="px-2 w-[32%]"><div className="flex items-center gap-1.5 min-w-0"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: farver.get(r.sKey) }} /><span className="truncate" title={r.sNavn}>{r.sNavn}</span></div></td>
                    <td className="px-2 text-right tabular-nums whitespace-nowrap">{kr(r.omsaetning_12m)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function bbox(fc: any): [number, number, number, number] | null {
  let a = [180, 90, -180, -90];
  const walk = (c: any) => { if (typeof c[0] === "number") { a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; } else c.forEach(walk); };
  fc.features.forEach((f: any) => f.geometry?.coordinates && walk(f.geometry.coordinates));
  return a[0] > a[2] ? null : (a as any);
}

function Kort({ geo, onKlik, redigerer, onMal, zoom, fitKey }: { geo: { main: any; bh: any }; onKlik: (f: number) => void; redigerer?: boolean; onMal?: (f: number) => void; zoom?: { flade: number; n: number } | null; fitKey?: string }) {
  const redRef = useRef(!!redigerer); redRef.current = !!redigerer;
  const malRef = useRef(onMal); malRef.current = onMal;
  const maler = useRef<{ on: boolean; sidst: number | null }>({ on: false, sidst: null });
  const mainRef = useRef<HTMLDivElement>(null);
  const bhRef = useRef<HTMLDivElement>(null);
  const maps = useRef<any[]>([]);
  const [tip, setTip] = useState<{ x: number; y: number; t: string; p: string } | null>(null);
  const klikRef = useRef(onKlik); klikRef.current = onKlik;
  const geoRef = useRef(geo); geoRef.current = geo;
  const fitted = useRef([false, false]);
  const flyttet = useRef([false, false]);
  const fitAlle = () => maps.current.forEach((m, i) => {
    m.resize();
    if (!m.getSource?.("f") || flyttet.current[i]) return;
    const b = bbox(i ? geoRef.current.bh : geoRef.current.main);
    if (b) m.fitBounds(b, { padding: i ? 6 : 16, duration: 0 });
  });

  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const [mod, workerMod] = await Promise.all([
        import("maplibre-gl/dist/maplibre-gl-csp.js" as any),
        import("maplibre-gl/dist/maplibre-gl-csp-worker.js?url" as any),
      ]);
      const maplibregl: typeof import("maplibre-gl") = (mod as any).default ?? mod;
      (maplibregl as any).setWorkerUrl(workerMod.default);
      if (dead) return;
      const style: any = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": BG } }] };
      const make = (el: HTMLDivElement, idx: number, inset: boolean) => {
        const m = new maplibregl.Map({ container: el, style, attributionControl: false, dragRotate: false, ...(inset ? { interactive: false } : {}) });
        m.on("load", () => {
          m.resize();
          const data = idx === 0 ? geoRef.current.main : geoRef.current.bh;
          m.addSource("f", { type: "geojson", data });
          m.addLayer({ id: "fill", type: "fill", source: "f", paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"] } });
          m.addLayer({ id: "line", type: "line", source: "f", filter: ["!=", ["get", "ubesat"], true], paint: { "line-color": ["get", "lc"], "line-width": ["get", "lw"] } });
          m.addLayer({ id: "line-ubesat", type: "line", source: "f", filter: ["==", ["get", "ubesat"], true], paint: { "line-color": ["get", "lc"], "line-width": ["get", "lw"], "line-dasharray": [2, 2] } });
          m.on("mousedown", "fill", (e: any) => {
            if (!redRef.current) return;
            const f = Number(e.features?.[0]?.properties?.flade);
            maler.current = { on: true, sidst: f }; m.dragPan.disable(); malRef.current?.(f);
          });
          const stop = () => { if (maler.current.on) { maler.current.on = false; maler.current.sidst = null; m.dragPan.enable(); } };
          m.on("mouseup", stop); window.addEventListener("mouseup", stop);
          const b = bbox(data); if (b) { m.fitBounds(b, { padding: inset ? 6 : 12, duration: 0 }); fitted.current[idx] = true; }
          m.on("movestart", (e: any) => { if (e.originalEvent) flyttet.current[idx] = true; });
          m.on("mousemove", "fill", (e: any) => {
            const p = e.features?.[0]?.properties; m.getCanvas().style.cursor = "pointer";
            const r = (inset ? bhRef : mainRef).current!.getBoundingClientRect();
            const pr = mainRef.current!.parentElement!.getBoundingClientRect();
            if (p && maler.current.on && redRef.current) { const f = Number(p.flade); if (f !== maler.current.sidst) { maler.current.sidst = f; malRef.current?.(f); } }
            if (p) setTip({ x: e.point.x + r.left - pr.left, y: e.point.y + r.top - pr.top, t: p.navn, p: p.postnumre });
          });
          m.on("mouseleave", "fill", () => { m.getCanvas().style.cursor = ""; setTip(null); });
          m.on("click", "fill", (e: any) => { if (redRef.current) return; const f = e.features?.[0]?.properties?.flade; if (f != null) klikRef.current(Number(f)); });
        });
        return m;
      };
      if (!mainRef.current || !bhRef.current) return;
      maps.current = [make(mainRef.current, 0, false), make(bhRef.current, 1, true)];
      let raf = 0;
      ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fitAlle()); });
      ro.observe(mainRef.current); ro.observe(bhRef.current);
      if (bhRef.current) {
        // tillad hover/klik i indsat boks
        maps.current[1].on("load", () => { maps.current[1].getCanvas().style.pointerEvents = "auto"; });
      }
    })();
    return () => { dead = true; ro?.disconnect(); maps.current.forEach((m) => m.remove()); maps.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    [geo.main, geo.bh].forEach((d, i) => {
      const m = maps.current[i];
      const s = m?.getSource?.("f");
      if (s) {
        s.setData(d);
        if (!fitted.current[i]) { const b = bbox(d); if (b) { m.resize(); m.fitBounds(b, { padding: i ? 6 : 12, duration: 0 }); fitted.current[i] = true; } }
      }
    });
  }, [geo]);

  // Refit ved visningsskift / layoutændring (respekterer brugerens egen zoom/panorering)
  useEffect(() => { const t = setTimeout(fitAlle, 50); return () => clearTimeout(t); }, [fitKey]);

  useEffect(() => {
    if (!zoom) return;
    [geo.main, geo.bh].forEach((d, i) => {
      const feat = d.features.find((f: any) => f.properties.flade === zoom.flade);
      const m = maps.current[i];
      if (feat && m && i === 0) { const b = bbox({ features: [feat] }); if (b) m.fitBounds(b, { padding: 80, maxZoom: 11, duration: 600 }); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  return (
    <>
      <div className="absolute inset-0"><div ref={mainRef} style={{ width: "100%", height: "100%" }} /></div>
      <button type="button" onClick={() => { flyttet.current = [false, false]; fitAlle(); }}
        className="absolute top-2 left-2 z-10 rounded-md border border-border bg-background/90 px-2 py-0.5 text-xs hover:bg-muted">Tilpas</button>
      <div className="absolute top-2 right-2 h-[90px] w-[110px] border border-border rounded bg-background overflow-hidden">
        <div className="absolute inset-0"><div ref={bhRef} style={{ width: "100%", height: "100%" }} /></div>
        <div className="absolute top-0.5 left-1 text-[10px] text-muted-foreground pointer-events-none">Bornholm</div>
      </div>
      {tip && (
        <div className="absolute pointer-events-none z-10 rounded border border-border bg-popover px-2 py-1 text-xs shadow" style={{ left: tip.x + 12, top: tip.y + 12 }}>
          <div className="font-medium">{tip.t}</div><div className="text-muted-foreground">{tip.p}</div>
        </div>
      )}
    </>
  );
}
