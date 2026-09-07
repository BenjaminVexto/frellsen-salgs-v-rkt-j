import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Loader2, Download, ArrowUpDown, ChevronDown, Calendar, SlidersHorizontal, X } from "lucide-react";
import { fmtKr, fmtKg } from "@/lib/sales-utils";
import { supabase } from "@/integrations/supabase/client";
import {
  getAnalysePivot,
  getAnalyseFiltre,
  type AnalyseOpdeling,
  type AnalysePivotRow,
} from "@/lib/analyse.functions";

/** Tidligste reelle periode i salgshistorikken. */
const DATA_START = "2025-01";

type Sammenlign = "ingen" | "foregaaende" | "aaret-foer";
type SortKey = "navn" | "omsaetning" | "kg" | "stk" | "antal_kunder" | "db" | "dg";

const OPDEL_LABEL: Record<AnalyseOpdeling, string> = {
  kunde: "Kunde",
  varegruppe: "Varegruppe",
  kundeprisgruppe: "Kundeprisgruppe",
  saelger: "Sælger",
  region: "Region",
  postnummer: "Postnummer",
};

// --- måneds-hjælpere ("YYYY-MM") ---
const mKey = (y: number, m0: number) => `${y}-${String(m0 + 1).padStart(2, "0")}`;
const parseM = (s: string) => ({ y: Number(s.slice(0, 4)), m0: Number(s.slice(5, 7)) - 1 });
const addM = (s: string, n: number) => {
  const { y, m0 } = parseM(s);
  const d = new Date(Date.UTC(y, m0 + n, 1));
  return mKey(d.getUTCFullYear(), d.getUTCMonth());
};
const monthsBetween = (fra: string, til: string) => {
  const a = parseM(fra);
  const b = parseM(til);
  return (b.y - a.y) * 12 + (b.m0 - a.m0) + 1;
};
const firstDay = (s: string) => `${s}-01`;
const lastDay = (s: string) => {
  const { y, m0 } = parseM(s);
  const d = new Date(Date.UTC(y, m0 + 1, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const MDR = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const maanedNavn = (s: string) => {
  const { y, m0 } = parseM(s);
  return `${MDR[m0]} ${y}`;
};

function genveje(): { label: string; fra: string; til: string }[] {
  const now = new Date();
  const cur = mKey(now.getUTCFullYear(), now.getUTCMonth());
  const sidsteHele = addM(cur, -1);
  const regnskabStart = now.getUTCMonth() + 1 >= 10
    ? mKey(now.getUTCFullYear(), 9)
    : mKey(now.getUTCFullYear() - 1, 9);
  return [
    { label: "Indeværende måned", fra: cur, til: cur },
    { label: "Seneste 12 måneder", fra: addM(cur, -11), til: cur },
    { label: "Indeværende kalenderår", fra: mKey(now.getUTCFullYear(), 0), til: cur },
    { label: "Kalenderåret 2025", fra: "2025-01", til: "2025-12" },
    { label: "Indeværende regnskabsår", fra: regnskabStart, til: addM(regnskabStart, 11) },
    { label: "Seneste 3 hele måneder", fra: addM(sidsteHele, -2), til: sidsteHele },
  ];
}

export function AnalyseFane({
  afdelingNr,
  afdelingNavn,
  maaSeDb,
}: {
  afdelingNr: number;
  afdelingNavn: string;
  maaSeDb: boolean;
}) {
  const now = new Date();
  const curM = mKey(now.getUTCFullYear(), now.getUTCMonth());
  const [fra, setFra] = useState(addM(curM, -11));
  const [til, setTil] = useState(curM);
  const [sammenlign, setSammenlign] = useState<Sammenlign>("ingen");
  const [opdel, setOpdel] = useState<AnalyseOpdeling>("kunde");
  const [saelgerIds, setSaelgerIds] = useState<string[]>([]);
  const [prisgrupper, setPrisgrupper] = useState<string[]>([]);
  const [varegrupper, setVaregrupper] = useState<string[]>([]);
  const [regioner, setRegioner] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("omsaetning");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const pivotFn = useServerFn(getAnalysePivot);
  const filtreFn = useServerFn(getAnalyseFiltre);

  const antalMdr = Math.max(1, monthsBetween(fra, til));

  const sammenPeriode = useMemo(() => {
    if (sammenlign === "ingen") return null;
    if (sammenlign === "foregaaende") {
      return { fra: addM(fra, -antalMdr), til: addM(til, -antalMdr) };
    }
    return { fra: addM(fra, -12), til: addM(til, -12) };
  }, [sammenlign, fra, til, antalMdr]);

  const daekket = (p: { fra: string } | null) => !p || p.fra >= DATA_START;
  const foregaaendeOk = addM(fra, -antalMdr) >= DATA_START;
  const aaretFoerOk = addM(fra, -12) >= DATA_START;

  const regionerQ = useQuery({
    queryKey: ["analyse-regioner"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("postnummer_region")
        .select("region")
        .order("region");
      if (error) throw new Error(error.message);
      const set = new Set<string>((data ?? []).map((r: any) => String(r.region)));
      set.add("Ukendt");
      return Array.from(set).sort((a, b) => a.localeCompare(b, "da-DK"));
    },
  });

  const filtreQ = useQuery({
    queryKey: ["analyse-filtre", afdelingNr, fra, til],
    queryFn: () => filtreFn({ data: { afdelingNr, fra: firstDay(fra), til: lastDay(til) } }),
  });

  /** Kg-kolonnen viser kun én varegruppe: den valgte, ellers kaffe (gruppe 2). */
  const kgGruppe = varegrupper.length === 1 ? varegrupper[0] : "2";
  const kgGruppeNavn =
    (filtreQ.data?.varegrupper ?? []).find((v) => v.kode === kgGruppe)?.navn ??
    (kgGruppe === "2" ? "kaffe" : `gruppe ${kgGruppe}`);
  const kgLabel = `Kg ${kgGruppeNavn.toLowerCase()}`;

  const argsBase = {
    opdel,
    afdelingNr,
    saelgerIds: saelgerIds.length ? saelgerIds : null,
    kundeprisgrupper: prisgrupper.length ? prisgrupper : null,
    varegrupper: varegrupper.length ? varegrupper : null,
    regioner: regioner.length ? regioner : null,
    kgGruppe,
  };

  const q = useQuery({
    queryKey: ["analyse-pivot", fra, til, argsBase],
    queryFn: () => pivotFn({ data: { ...argsBase, fra: firstDay(fra), til: lastDay(til) } }),
  });

  const qSammen = useQuery({
    queryKey: ["analyse-pivot-sammen", sammenPeriode, argsBase],
    enabled: !!sammenPeriode && daekket(sammenPeriode),
    queryFn: () =>
      pivotFn({
        data: { ...argsBase, fra: firstDay(sammenPeriode!.fra), til: lastDay(sammenPeriode!.til) },
      }),
  });

  const sammenMap = useMemo(() => {
    const m = new Map<string, AnalysePivotRow>();
    (qSammen.data ?? []).forEach((r) => m.set(r.noegle, r));
    return m;
  }, [qSammen.data]);

  const rows = q.data ?? [];

  const [visAntal, setVisAntal] = useState(25);
  useEffect(() => {
    setVisAntal(25);
  }, [fra, til, opdel, sortKey, sortDir, saelgerIds, prisgrupper, varegrupper, regioner]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: AnalysePivotRow): number =>
      sortKey === "dg"
        ? r.omsaetning > 0
          ? (r.db ?? 0) / r.omsaetning
          : -1
        : sortKey === "db"
          ? (r.db ?? 0)
          : sortKey === "kg"
            ? r.kg
            : sortKey === "stk"
              ? r.stk
              : sortKey === "antal_kunder"
                ? r.antal_kunder
                : r.omsaetning;
    return [...rows].sort((a, b) => {
      if (sortKey === "navn") {
        return (a.navn ?? a.noegle).localeCompare(b.navn ?? b.noegle, "da-DK") * dir;
      }
      const d = val(a) - val(b);
      if (d !== 0) return d * dir;
      return (a.navn ?? "").localeCompare(b.navn ?? "", "da-DK");
    });
  }, [rows, sortKey, sortDir]);

  const total = useMemo(() => {
    let omsaetning = 0, kg = 0, stk = 0, db = 0;
    let harDb = false;
    const kunder = new Set<string>();
    for (const r of rows) {
      omsaetning += r.omsaetning;
      kg += r.kg;
      stk += r.stk;
      if (r.db != null) { db += r.db; harDb = true; }
      if (opdel === "kunde") kunder.add(r.noegle);
    }
    return {
      omsaetning,
      kg,
      stk,
      db: harDb ? db : null,
      antal_kunder: opdel === "kunde" ? kunder.size : Math.max(...rows.map((r) => r.antal_kunder), 0),
    };
  }, [rows, opdel]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "navn" ? "asc" : "desc");
    }
  };

  /** Antal kunder er altid 1 pr. række ved kunde-/postnummeropdeling. */
  const visAntalKunder = opdel !== "kunde" && opdel !== "postnummer";
  const andel = (v: number) => (total.omsaetning > 0 ? (v / total.omsaetning) * 100 : 0);

  const aktiveFiltre = useMemo(() => {
    const out: { key: string; label: string; remove: () => void }[] = [];
    for (const id of saelgerIds) {
      const navn = (filtreQ.data?.saelgere ?? []).find((s) => s.id === id)?.navn ?? id;
      out.push({ key: `s-${id}`, label: `Sælger: ${navn}`, remove: () => setSaelgerIds(saelgerIds.filter((x) => x !== id)) });
    }
    for (const p of prisgrupper) {
      out.push({ key: `p-${p}`, label: `Kundeprisgruppe: ${p}`, remove: () => setPrisgrupper(prisgrupper.filter((x) => x !== p)) });
    }
    for (const v of varegrupper) {
      const navn = (filtreQ.data?.varegrupper ?? []).find((x) => x.kode === v)?.navn ?? v;
      out.push({ key: `v-${v}`, label: `Varegruppe: ${navn}`, remove: () => setVaregrupper(varegrupper.filter((x) => x !== v)) });
    }
    for (const r of regioner) {
      out.push({ key: `r-${r}`, label: `Region: ${r}`, remove: () => setRegioner(regioner.filter((x) => x !== r)) });
    }
    return out;
  }, [saelgerIds, prisgrupper, varegrupper, regioner, filtreQ.data]);

  const periodeTekst = `${maanedNavn(fra)}–${maanedNavn(til)}`;

  const exportCsv = () => {
    const head = [
      OPDEL_LABEL[opdel],
      "Omsætning",
      "Andel %",
      kgLabel,
      "Stk",
      ...(visAntalKunder ? ["Antal kunder"] : []),
      ...(maaSeDb ? ["DB", "DG %"] : []),
    ];
    const lines = [head.join(";")];
    for (const r of sorted) {
      const dg = r.omsaetning > 0 && r.db != null ? ((r.db / r.omsaetning) * 100).toFixed(1) : "";
      lines.push(
        [
          `"${(r.navn ?? r.noegle).replace(/"/g, '""')}"`,
          r.omsaetning.toFixed(2).replace(".", ","),
          andel(r.omsaetning).toFixed(1).replace(".", ","),
          r.kg.toFixed(2).replace(".", ","),
          r.stk.toFixed(2).replace(".", ","),
          ...(visAntalKunder ? [String(r.antal_kunder)] : []),
          ...(maaSeDb ? [(r.db ?? 0).toFixed(2).replace(".", ","), dg] : []),
        ].join(";"),
      );
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `analyse-${opdel}-${fra}-${til}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const visSammen = !!sammenPeriode && daekket(sammenPeriode);

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Fra måned</Label>
            <Input
              type="month"
              value={fra}
              max={til}
              onChange={(e) => e.target.value && setFra(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Til måned (inkl.)</Label>
            <Input
              type="month"
              value={til}
              min={fra}
              onChange={(e) => e.target.value && setTil(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {genveje().map((g) => (
              <Button
                key={g.label}
                size="sm"
                variant={fra === g.fra && til === g.til ? "default" : "outline"}
                onClick={() => {
                  setFra(g.fra);
                  setTil(g.til);
                }}
              >
                {g.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Sammenligning</Label>
            <Select value={sammenlign} onValueChange={(v) => setSammenlign(v as Sammenlign)}>
              <SelectTrigger className="h-9 w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ingen">Ingen sammenligning</SelectItem>
                <SelectItem value="foregaaende" disabled={!foregaaendeOk}>
                  Foregående periode
                  {!foregaaendeOk && " — ikke dækket"}
                </SelectItem>
                <SelectItem value="aaret-foer" disabled={!aaretFoerOk}>
                  Samme periode året før
                  {!aaretFoerOk && " — ikke dækket"}
                </SelectItem>
              </SelectContent>
            </Select>
            {((sammenlign === "foregaaende" && !foregaaendeOk) ||
              (sammenlign === "aaret-foer" && !aaretFoerOk)) && (
              <p className="text-xs text-muted-foreground mt-1">
                Sammenligningsperioden er ikke dækket af data
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Opdeling</Label>
            <Select value={opdel} onValueChange={(v) => setOpdel(v as AnalyseOpdeling)}>
              <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(OPDEL_LABEL) as AnalyseOpdeling[]).map((k) => (
                  <SelectItem key={k} value={k}>{OPDEL_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <MultiVaelger
            label="Sælger"
            options={(filtreQ.data?.saelgere ?? []).map((s) => ({ value: s.id, label: s.navn }))}
            selected={saelgerIds}
            onChange={setSaelgerIds}
          />
          <MultiVaelger
            label="Kundeprisgruppe"
            options={(filtreQ.data?.prisgrupper ?? []).map((p) => ({ value: p, label: p }))}
            selected={prisgrupper}
            onChange={setPrisgrupper}
          />
          <MultiVaelger
            label="Varegruppe"
            options={(filtreQ.data?.varegrupper ?? []).map((v) => ({ value: v.kode, label: v.navn }))}
            selected={varegrupper}
            onChange={setVaregrupper}
          />
          <MultiVaelger
            label="Region"
            options={(regionerQ.data ?? []).map((r) => ({ value: r, label: r }))}
            selected={regioner}
            onChange={setRegioner}
          />

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Afdeling {afdelingNr} — {afdelingNavn} · {antalMdr} mdr.
            </span>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground p-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Beregner…
          </div>
        ) : q.error ? (
          <div className="p-6 text-sm text-destructive">
            {q.error instanceof Error ? q.error.message : "Kunne ikke hente tal"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <Th onClick={() => toggleSort("navn")} active={sortKey === "navn"} dir={sortDir}>
                    {OPDEL_LABEL[opdel]}
                  </Th>
                  <Th onClick={() => toggleSort("omsaetning")} active={sortKey === "omsaetning"} dir={sortDir} align="right">
                    Omsætning
                  </Th>
                  {visSammen && <th className="px-3 py-2 text-right">Ændring</th>}
                  <Th onClick={() => toggleSort("kg")} active={sortKey === "kg"} dir={sortDir} align="right">Kg</Th>
                  <Th onClick={() => toggleSort("stk")} active={sortKey === "stk"} dir={sortDir} align="right">Stk.</Th>
                  <Th onClick={() => toggleSort("antal_kunder")} active={sortKey === "antal_kunder"} dir={sortDir} align="right">
                    Antal kunder
                  </Th>
                  {maaSeDb && (
                    <>
                      <Th onClick={() => toggleSort("db")} active={sortKey === "db"} dir={sortDir} align="right">DB</Th>
                      <Th onClick={() => toggleSort("dg")} active={sortKey === "dg"} dir={sortDir} align="right">DG</Th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border bg-muted/20 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtKr(total.omsaetning)}</td>
                  {visSammen && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Delta
                        now={total.omsaetning}
                        before={(qSammen.data ?? []).reduce((s, r) => s + r.omsaetning, 0)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">{fmtKg(total.kg)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {total.stk.toLocaleString("da-DK", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{total.antal_kunder.toLocaleString("da-DK")}</td>
                  {maaSeDb && (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {total.db != null ? fmtKr(total.db) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {total.db != null && total.omsaetning > 0
                          ? `${Math.round((total.db / total.omsaetning) * 100)} %`
                          : "—"}
                      </td>
                    </>
                  )}
                </tr>
                {sorted.slice(0, visAntal).map((r) => {
                  const before = sammenMap.get(r.noegle)?.omsaetning ?? 0;
                  return (
                    <tr key={r.noegle} className="border-t border-border hover:bg-accent/30">
                      <td className="px-3 py-2">{r.navn ?? r.noegle}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtKr(r.omsaetning)}</td>
                      {visSammen && (
                        <td className="px-3 py-2 text-right tabular-nums">
                          <Delta now={r.omsaetning} before={before} />
                        </td>
                      )}
                      <td className="px-3 py-2 text-right tabular-nums">{r.kg > 0 ? fmtKg(r.kg) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.stk.toLocaleString("da-DK", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.antal_kunder.toLocaleString("da-DK")}</td>
                      {maaSeDb && (
                        <>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {r.db != null ? fmtKr(r.db) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {r.db != null && r.omsaetning > 0
                              ? `${Math.round((r.db / r.omsaetning) * 100)} %`
                              : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {sorted.length > visAntal && (
                  <tr>
                    <td colSpan={99} className="px-3 py-3 text-center">
                      <Button variant="outline" size="sm" onClick={() => setVisAntal((n) => n + 25)}>
                        Vis flere ({(sorted.length - visAntal).toLocaleString("da-DK")} tilbage)
                      </Button>
                    </td>
                  </tr>
                )}
                {!sorted.length && (
                  <tr>
                    <td colSpan={99} className="px-3 py-10 text-center text-muted-foreground">
                      Ingen omsætning i perioden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Opgjort efter bogføringsafdeling. Kunder der er flyttet mellem afdelinger, har deres
        historik i den afdeling, hvor fakturaen blev bogført.
      </p>
    </div>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  if (before <= 0) return <span className="text-muted-foreground">—</span>;
  const pct = ((now - before) / before) * 100;
  const cls = pct >= 0 ? "text-emerald-600" : "text-destructive";
  return (
    <span className={cls}>
      {pct >= 0 ? "+" : ""}
      {pct.toFixed(1).replace(".", ",")} %
    </span>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  align?: "left" | "right";
}) {
  return (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {children}
        {active ? (
          <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function MultiVaelger({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 w-[200px] justify-between font-normal">
            <span className="truncate">
              {selected.length === 0 ? "Alle" : `${selected.length} valgt`}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] max-h-72 overflow-y-auto p-2 space-y-1">
          {selected.length > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline px-1"
              onClick={() => onChange([])}
            >
              Nulstil
            </button>
          )}
          {options.length === 0 && (
            <div className="text-xs text-muted-foreground px-1 py-2">Ingen valgmuligheder</div>
          )}
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm px-1 py-0.5 cursor-pointer">
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={(v) =>
                  onChange(v === true ? [...selected, o.value] : selected.filter((x) => x !== o.value))
                }
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
