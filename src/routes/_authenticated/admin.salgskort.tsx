import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, X } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";

export const Route = createFileRoute("/_authenticated/admin/salgskort")({
  component: SalgskortPage,
  head: () => ({
    meta: [
      { title: "Salgskort — Frellsen" },
      { name: "description", content: "Kort over sælgernes lokationer, omsætning og DB pr. postnummerflade." },
      { property: "og:title", content: "Salgskort — Frellsen" },
      { property: "og:description", content: "Sælgerfordeling pr. postnummerflade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Flade = { flade: number; navn: string | null; landsdel: string | null; postnumre: number[] | null; geom: any };
type Lok = {
  location_id: string; company_id: string; virksomhedsnavn: string | null; zip_norm: string | null;
  saelger_user_id: string | null; saelger_navn: string | null; salesperson_no: string | null; afdeling_nr: number | null;
  customer_segment_1: string | null; customer_segment_2: string | null; customer_segment_3: string | null;
  customer_type: string | null; agreement_types: string | null; omsaetning_12m: number; db_12m: number;
};
type Row = Lok & { flade: number | null; sKey: string; sNavn: string; udstyr: string[]; kpg1: string; kpg2: string; kpg3: string; status: string; afd: string };

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

type Dim = "afd" | "kpg1" | "kpg2" | "kpg3" | "status" | "udstyr" | "sKey";
const DIMS: { key: Dim; label: string }[] = [
  { key: "afd", label: "Afdeling" },
  { key: "kpg1", label: "Aftale (KPG1)" },
  { key: "kpg3", label: "Segment (KPG3)" },
  { key: "status", label: "Status" },
  { key: "udstyr", label: "Udstyr" },
  { key: "sKey", label: "Sælger" },
];
type Filters = Record<Dim, Set<string>>;
const tomFiltre = (): Filters => ({ afd: new Set(), kpg1: new Set(), kpg2: new Set(), kpg3: new Set(), status: new Set(), udstyr: new Set(), sKey: new Set() });

function matcher(r: Row, f: Filters, skip?: Dim) {
  for (const d of Object.keys(f) as Dim[]) {
    if (d === skip || (skip === "kpg1" && d === "kpg2")) continue;
    const s = f[d];
    if (!s.size) continue;
    if (d === "udstyr") { if (!r.udstyr.some((u) => s.has(u))) return false; }
    else if (d === "kpg2") { if (!s.has(r.kpg1 + "||" + r.kpg2)) return false; }
    else if (!s.has(r[d] as string)) return false;
  }
  return true;
}

function erBornholm(f: Flade) {
  const p = f.postnumre ?? [];
  return p.length > 0 && p.every((n) => n >= 3700 && n <= 3790);
}

function SalgskortPage() {
  const auth = useAuth();
  const [data, setData] = useState<{ flader: Flade[]; map: Map<string, number>; rows: Lok[] } | null>(null);
  const [fejl, setFejl] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(tomFiltre);
  const [valgtFlade, setValgtFlade] = useState<number | null>(null);
  const [fremhaev, setFremhaev] = useState<string | null>(null);
  const [visIkkePlaceret, setVisIkkePlaceret] = useState(false);
  const [udfoldKpg1, setUdfoldKpg1] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (auth.role !== "admin") return;
    if (!cache) cache = hentAlt();
    cache.then((d) => {
      setData(d);
      if (d.rows.some((r) => r.afdeling_nr === 11)) setFilters((f) => ({ ...f, afd: new Set(["11"]) }));
    }).catch((e) => { cache = null; setFejl(e.message ?? String(e)); });
  }, [auth.role]);

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    return data.rows.map((r) => {
      const frellsen = r.salesperson_no === "199";
      const sKey = frellsen ? "__frellsen" : r.saelger_user_id ?? "__ingen";
      const sNavn = frellsen ? "Frellsen (199)" : r.saelger_user_id ? r.saelger_navn || "Ukendt sælger" : "Uden sælger";
      return {
        ...r, omsaetning_12m: Number(r.omsaetning_12m) || 0, db_12m: Number(r.db_12m) || 0,
        flade: r.zip_norm ? data.map.get(r.zip_norm) ?? null : null,
        sKey, sNavn, udstyr: udstyrAf(r.agreement_types),
        kpg1: r.customer_segment_1 || "(ingen)", kpg2: r.customer_segment_2 || "(ingen)",
        kpg3: r.customer_segment_3 || "(ingen)", status: r.customer_type || "(ingen)",
        afd: r.afdeling_nr != null ? String(r.afdeling_nr) : "(ingen)",
      };
    });
  }, [data]);

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
        const vals = key === "udstyr" ? r.udstyr : [r[key] as string];
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
        let color = TOM, opacity = 1;
        if (s && s.size) {
          const total = [...s.values()].reduce((a, b) => a + b.n, 0);
          if (fremhaev) {
            const e = s.get(fremhaev);
            if (e) { color = farver.get(fremhaev) ?? TOM; opacity = 0.25 + 0.75 * (e.n / total); }
          } else {
            const [k, e] = [...s.entries()].sort((a, b) => b[1].n - a[1].n)[0];
            color = farver.get(k) ?? TOM; opacity = 0.25 + 0.75 * (e.n / total);
          }
        }
        return {
          type: "Feature" as const, id: f.flade, geometry: f.geom,
          properties: { flade: f.flade, navn: f.navn ?? "", postnumre: (f.postnumre ?? []).join(", "), color, opacity },
        };
      }),
    });
    return { main: mk(false), bh: mk(true) };
  }, [data, pFlade, farver, fremhaev]);

  if (auth.loading) return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Indlæser…</div>;
  if (auth.role !== "admin") return <Navigate to="/dashboard" />;

  const toggle = (d: Dim, v: string) => setFilters((f) => {
    const s = new Set(f[d]); s.has(v) ? s.delete(v) : s.add(v);
    return { ...f, [d]: s };
  });
  const total = saelgerBjaelke.reduce((a, [, e]) => ({ n: a.n + e.n, oms: a.oms + e.oms, db: a.db + e.db }), { n: 0, oms: 0, db: 0 });
  const flade = valgtFlade != null ? data?.flader.find((f) => f.flade === valgtFlade) : null;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Salgskort</h1>
        <p className="text-sm text-muted-foreground">Lokationer med salg de seneste 12 hele måneder, farvet efter sælgeren med flest lokationer pr. postnummerflade.</p>
      </div>

      {fejl && <Card className="p-4 text-destructive">Kunne ikke hente data: {fejl}</Card>}
      {!data && !fejl && <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Henter kort og salgsdata…</div>}
      {data && data.flader.length === 0 && (
        <Card className="p-10 text-center">
          <div className="text-lg font-medium">Kortdata er ikke indlæst endnu</div>
          <p className="text-sm text-muted-foreground mt-1">Postnummerfladerne skal indlæses, før kortet kan vises. {rows.length.toLocaleString("da-DK")} lokationer med salg er klar.</p>
        </Card>
      )}

      {data && data.flader.length > 0 && geo && (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr_320px]">
          <Card className="p-3 space-y-4 max-h-[80vh] overflow-y-auto text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Filtre</span>
              <Button size="sm" variant="outline" onClick={() => { setFilters(tomFiltre()); setFremhaev(null); }}>Nulstil filtre</Button>
            </div>
            {DIMS.map(({ key, label }) => {
              const opts = [...options[key].entries()].sort((a, b) => b[1] - a[1]);
              return (
                <div key={key}>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
                  {opts.map(([v, n]) => (
                    <div key={v}>
                      <label className="flex items-center gap-2 py-0.5 cursor-pointer">
                        <Checkbox checked={filters[key].has(v)} onCheckedChange={() => toggle(key, v)} />
                        {key === "sKey" && <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: farver.get(v) }} />}
                        <span className="flex-1 truncate">{key === "sKey" ? saelgerNavn.get(v) : v}</span>
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
                </div>
              );
            })}
          </Card>

          <Card className="relative overflow-hidden min-h-[70vh]">
            <Kort geo={geo} onKlik={setValgtFlade} />
            <button type="button" onClick={() => setVisIkkePlaceret(true)} className="absolute top-2 left-2 rounded bg-background/90 border border-border px-2 py-1 text-xs">
              Ikke placeret ({ikkePlaceret.length})
            </button>
            {fremhaev && (
              <button type="button" onClick={() => setFremhaev(null)} className="absolute top-2 right-2 rounded bg-background/90 border border-border px-2 py-1 text-xs flex items-center gap-1">
                Fremhæver {saelgerNavn.get(fremhaev)} <X className="h-3 w-3" />
              </button>
            )}
            <div className="absolute bottom-1 left-2 text-[10px] text-muted-foreground">Kilde: DAGI, Klimadatastyrelsen · Kystlinje © OpenStreetMap-bidragydere</div>
          </Card>

          <Card className="p-3 max-h-[80vh] overflow-y-auto text-sm">
            {flade ? (
              <FladePanel flade={flade} fordeling={pFlade.get(flade.flade)} lok={filtrerede.filter((r) => r.flade === flade.flade)} navne={saelgerNavn} farver={farver} onLuk={() => setValgtFlade(null)} />
            ) : (
              <div className="text-muted-foreground">Klik på en flade for at se fordeling pr. sælger og fladens lokationer.</div>
            )}
          </Card>
        </div>
      )}

      {data && data.flader.length > 0 && (
        <Card className="p-3">
          <div className="text-sm font-medium mb-2">Sælgere</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left px-2 py-1">Sælger</th><th className="text-right px-2">Lokationer</th><th className="text-right px-2">Omsætning 12 mdr.</th><th className="text-right px-2">DB 12 mdr.</th></tr>
              </thead>
              <tbody>
                {saelgerBjaelke.map(([k, e]) => (
                  <tr key={k} onClick={() => setFremhaev(fremhaev === k ? null : k)} className={"border-t border-border cursor-pointer hover:bg-muted/40 " + (fremhaev === k ? "bg-muted/60" : "")}>
                    <td className="px-2 py-1"><span className="inline-block h-3 w-3 rounded-sm mr-2 align-middle" style={{ background: farver.get(k) }} />{saelgerNavn.get(k)}</td>
                    <td className="text-right px-2 tabular-nums">{e.n}</td>
                    <td className="text-right px-2 tabular-nums">{kr(e.oms)}</td>
                    <td className="text-right px-2 tabular-nums">{kr(e.db)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-medium">
                  <td className="px-2 py-1">I alt</td><td className="text-right px-2 tabular-nums">{total.n}</td>
                  <td className="text-right px-2 tabular-nums">{kr(total.oms)}</td><td className="text-right px-2 tabular-nums">{kr(total.db)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
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

function FladePanel({ flade, fordeling, lok, navne, farver, onLuk }: {
  flade: Flade; fordeling?: Map<string, { n: number; oms: number; db: number }>; lok: Row[];
  navne: Map<string, string>; farver: Map<string, string>; onLuk: () => void;
}) {
  const ford = [...(fordeling?.entries() ?? [])].sort((a, b) => b[1].n - a[1].n);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{flade.navn}</div>
          <div className="text-xs text-muted-foreground">{(flade.postnumre ?? []).join(", ")}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={onLuk}><X className="h-4 w-4" /></Button>
      </div>
      {!ford.length ? <div className="text-muted-foreground">Ingen lokationer under de valgte filtre.</div> : (
        <>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr><th className="text-left">Sælger</th><th className="text-right">Lok.</th><th className="text-right">Oms.</th><th className="text-right">DB</th></tr></thead>
            <tbody>
              {ford.map(([k, e]) => (
                <tr key={k} className="border-t border-border">
                  <td className="py-1"><span className="inline-block h-2.5 w-2.5 rounded-sm mr-1" style={{ background: farver.get(k) }} />{navne.get(k)}</td>
                  <td className="text-right tabular-nums">{e.n}</td><td className="text-right tabular-nums">{kr(e.oms)}</td><td className="text-right tabular-nums">{kr(e.db)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Lokationer efter DB</div>
          <ul className="space-y-1">
            {[...lok].sort((a, b) => b.db_12m - a.db_12m).map((r) => (
              <li key={r.location_id} className="flex justify-between gap-2 text-xs">
                <Link to="/virksomheder/$id" params={{ id: r.company_id }} className="hover:underline truncate">{r.virksomhedsnavn} <span className="text-muted-foreground">· {r.sNavn}</span></Link>
                <span className="tabular-nums shrink-0">{kr(r.db_12m)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function bbox(fc: any): [number, number, number, number] | null {
  let a = [180, 90, -180, -90];
  const walk = (c: any) => { if (typeof c[0] === "number") { a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; } else c.forEach(walk); };
  fc.features.forEach((f: any) => f.geometry?.coordinates && walk(f.geometry.coordinates));
  return a[0] > a[2] ? null : (a as any);
}

function Kort({ geo, onKlik }: { geo: { main: any; bh: any }; onKlik: (f: number) => void }) {
  const mainRef = useRef<HTMLDivElement>(null);
  const bhRef = useRef<HTMLDivElement>(null);
  const maps = useRef<any[]>([]);
  const [tip, setTip] = useState<{ x: number; y: number; t: string; p: string } | null>(null);
  const klikRef = useRef(onKlik); klikRef.current = onKlik;

  useEffect(() => {
    let dead = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (dead) return;
      const style: any = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": BG } }] };
      const make = (el: HTMLDivElement, data: any, inset: boolean) => {
        const m = new maplibregl.Map({ container: el, style, attributionControl: false, dragRotate: false, ...(inset ? { interactive: false } : {}) });
        m.on("load", () => {
          m.addSource("f", { type: "geojson", data });
          m.addLayer({ id: "fill", type: "fill", source: "f", paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"] } });
          m.addLayer({ id: "line", type: "line", source: "f", paint: { "line-color": "#ffffff", "line-width": 0.5 } });
          const b = bbox(data); if (b) m.fitBounds(b, { padding: inset ? 6 : 20, duration: 0 });
          m.on("mousemove", "fill", (e: any) => {
            const p = e.features?.[0]?.properties; m.getCanvas().style.cursor = "pointer";
            const r = (inset ? bhRef : mainRef).current!.getBoundingClientRect();
            const pr = mainRef.current!.parentElement!.getBoundingClientRect();
            if (p) setTip({ x: e.point.x + r.left - pr.left, y: e.point.y + r.top - pr.top, t: p.navn, p: p.postnumre });
          });
          m.on("mouseleave", "fill", () => { m.getCanvas().style.cursor = ""; setTip(null); });
          m.on("click", "fill", (e: any) => { const f = e.features?.[0]?.properties?.flade; if (f != null) klikRef.current(Number(f)); });
        });
        return m;
      };
      maps.current = [make(mainRef.current!, geo.main, false), make(bhRef.current!, geo.bh, true)];
      if (bhRef.current) {
        // tillad hover/klik i indsat boks
        maps.current[1].on("load", () => { maps.current[1].getCanvas().style.pointerEvents = "auto"; });
      }
    })();
    return () => { dead = true; maps.current.forEach((m) => m.remove()); maps.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    [geo.main, geo.bh].forEach((d, i) => {
      const m = maps.current[i];
      const s = m?.getSource?.("f");
      if (s) s.setData(d);
    });
  }, [geo]);

  return (
    <>
      <div ref={mainRef} className="absolute inset-0" />
      <div className="absolute bottom-6 right-2 h-32 w-40 border border-border rounded bg-background overflow-hidden">
        <div ref={bhRef} className="absolute inset-0" />
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
