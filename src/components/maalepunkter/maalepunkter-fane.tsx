import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calendar, Download, Loader2 } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAfdeling } from "@/contexts/afdeling-context";

/** Samme farver for private/offentlige/total i alle fem grafer. */
const FARVE_PRIVAT = "hsl(217 91% 50%)";
const FARVE_OFFENTLIG = "hsl(28 90% 52%)";
const FARVE_TOTAL = "hsl(var(--muted-foreground))";
const FARVER_MAERKE = [
  "hsl(217 91% 50%)",
  "hsl(28 90% 52%)",
  "hsl(142 65% 40%)",
  "hsl(280 60% 55%)",
  "hsl(0 70% 55%)",
  "hsl(190 70% 42%)",
  "hsl(45 85% 45%)",
  "hsl(330 65% 55%)",
];

/** Farve pr. rækkelabel — private og offentlige altid ens på tværs af grafer. */
function raekkeFarve(label: string, i: number): string {
  const l = label.toLowerCase();
  if (l.startsWith("privat")) return FARVE_PRIVAT;
  if (l.startsWith("offentlig")) return FARVE_OFFENTLIG;
  return FARVER_MAERKE[i % FARVER_MAERKE.length];
}

type Visning = "tabel" | "graf" | "udvikling";

/**
 * Y-akse der skalerer til dataområdet med ca. 10 % luft.
 * Nul tvinges kun med, hvis en serie er nul eller negativ.
 */
function yDomaene(vaerdier: number[]): [number, number] {
  const tal = vaerdier.filter((v) => Number.isFinite(v));
  if (!tal.length) return [0, 1];
  let min = Math.min(...tal);
  let max = Math.max(...tal);
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  } else {
    const luft = (max - min) * 0.1;
    min -= luft;
    max += luft;
  }
  if (Math.min(...tal) <= 0) min = Math.min(0, min);
  return [min, max];
}



// --- måneds-hjælpere ("YYYY-MM") ---
const mKey = (y: number, m0: number) => `${y}-${String(m0 + 1).padStart(2, "0")}`;
const parseM = (s: string) => ({ y: Number(s.slice(0, 4)), m0: Number(s.slice(5, 7)) - 1 });
const addM = (s: string, n: number) => {
  const { y, m0 } = parseM(s);
  const d = new Date(Date.UTC(y, m0 + n, 1));
  return mKey(d.getUTCFullYear(), d.getUTCMonth());
};
const firstDay = (s: string) => `${s}-01`;
const MDR = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const maanedNavn = (s: string) => {
  const { y, m0 } = parseM(s);
  return `${MDR[m0]} ${y}`;
};
const maanedListe = (fra: string, til: string) => {
  const out: string[] = [];
  let cur = fra;
  while (cur <= til && out.length < 60) {
    out.push(cur);
    cur = addM(cur, 1);
  }
  return out;
};

const fmtTal = (n: number, dec = 0) =>
  n.toLocaleString("da-DK", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtDato = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

type Kundetype = "alle" | "offentlig" | "privat";

/** Hvad panelet skal vise. Månedsnøgle null = hele perioden. */
type Drill =
  | { slags: "db"; kategori: string; label: string; maaned: string | null }
  | {
      slags: "maskiner";
      maerke: string;
      brugt: boolean | null;
      label: string;
      maaned: string | null;
    }
  | { slags: "nye"; kategori: string; label: string; maaned: string | null };

/**
 * Sælger-id kommer fra siden, så adgangsreglen kun findes ét sted:
 * kun admin og brugere med maa_se_analyse kan vælge en anden sælger,
 * og aldrig under "Se som sælger".
 */
export function MaalepunkterFane({ saelgerId }: { saelgerId: string }) {
  const auth = useAuth();
  const afd = useAfdeling();

  const now = new Date();
  const curM = mKey(now.getUTCFullYear(), now.getUTCMonth());
  /** Den igangværende måned indgår aldrig — sidste hele måned er øverste grænse. */
  const sidsteHele = addM(curM, -1);

  const genveje = useMemo(() => {
    const regnskabStart =
      now.getUTCMonth() + 1 >= 10 ? mKey(now.getUTCFullYear(), 9) : mKey(now.getUTCFullYear() - 1, 9);
    return [
      { label: "Seneste 12 hele måneder", fra: addM(sidsteHele, -11), til: sidsteHele },
      { label: "Indeværende kalenderår", fra: mKey(now.getUTCFullYear(), 0), til: sidsteHele },
      { label: "Kalenderåret 2025", fra: "2025-01", til: "2025-12" },
      { label: "Indeværende regnskabsår (1/10–30/9)", fra: regnskabStart, til: sidsteHele },
    ];
  }, [sidsteHele]);

  const [fra, setFra] = useState(addM(sidsteHele, -11));
  const [tilRaw, setTilRaw] = useState(sidsteHele);
  const til = tilRaw > sidsteHele ? sidsteHele : tilRaw;
  const [visBrugte, setVisBrugte] = useState(false);
  const [kundetype, setKundetype] = useState<Kundetype>("alle");
  const [nyeMaal, setNyeMaal] = useState<"antal" | "db">("antal");
  const [drill, setDrill] = useState<Drill | null>(null);

  // Tabel/graf huskes pr. tabel pr. bruger.
  const visningNoegle = `maalepunkt-visning:${auth.user?.id ?? "anon"}`;
  const [visninger, setVisninger] = useState<Record<string, Visning>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(visningNoegle);
      setVisninger(raw ? (JSON.parse(raw) as Record<string, Visning>) : {});
    } catch {
      setVisninger({});
    }
  }, [visningNoegle]);
  const saetVisning = (key: string, v: Visning) => {
    setVisninger((p) => {
      const next = { ...p, [key]: v };
      try {
        localStorage.setItem(visningNoegle, JSON.stringify(next));
      } catch {
        /* ignoreres */
      }
      return next;
    });
  };

  // Skjulte serier pr. graf (klik på signaturen) — fx totalen der presser delserierne ned.
  const [skjulte, setSkjulte] = useState<Record<string, string[]>>({});
  const skiftSerie = (visKey: string, serie: string) => {
    setSkjulte((p) => {
      const cur = p[visKey] ?? [];
      return {
        ...p,
        [visKey]: cur.includes(serie) ? cur.filter((s) => s !== serie) : [...cur, serie],
      };
    });
  };


  const maaneder = useMemo(() => maanedListe(fra, til), [fra, til]);
  const args = { _saelger: saelgerId, _fra: firstDay(fra), _til: firstDay(til) };

  const omsQ = useQuery({
    queryKey: ["maalepunkt-omsaetning", saelgerId, fra, til],
    enabled: !!saelgerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("maalepunkt_omsaetning", args);
      if (error) throw new Error(error.message);
      return (data ?? []) as { maaned: string; kategori: string; vaerdi: number }[];
    },
  });

  const kunderQ = useQuery({
    queryKey: ["maalepunkt-aktive-kunder", saelgerId, fra, til],
    enabled: !!saelgerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("maalepunkt_aktive_kunder", args);
      if (error) throw new Error(error.message);
      return (data ?? []) as { maaned: string; kategori: string; antal: number }[];
    },
  });

  const dbQ = useQuery({
    queryKey: ["maalepunkt-db", saelgerId, fra, til],
    enabled: !!saelgerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("maalepunkt_db", args);
      if (error) throw new Error(error.message);
      return (data ?? []) as { maaned: string; kategori: string; vaerdi: number }[];
    },
  });


  const maskinerQ = useQuery({
    queryKey: ["maalepunkt-maskiner", saelgerId, fra, til, kundetype],
    enabled: !!saelgerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("maalepunkt_maskiner", {
        ...args,
        _kundetype: kundetype,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as { maaned: string; maerke: string; brugt: boolean; antal: number }[];
    },
  });

  const nyeQ = useQuery({
    queryKey: ["maalepunkt-nye", saelgerId, fra, til],
    enabled: !!saelgerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("maalepunkt_nye_kunder", args);
      if (error) throw new Error(error.message);
      return (data ?? []) as { maaned: string; kategori: string; antal: number; db: number }[];
    },
  });

  const mNøgle = (d: string) => String(d).slice(0, 7);

  // --- Tabel 1: omsætning ---
  const omsTabel = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    (omsQ.data ?? []).forEach((r) => {
      const k = r.kategori;
      if (!map.has(k)) map.set(k, new Map());
      const m = map.get(k)!;
      const key = mNøgle(r.maaned);
      m.set(key, (m.get(key) ?? 0) + Number(r.vaerdi || 0));
    });
    return [
      { label: "Private kunder", per: map.get("privat") ?? new Map(), kategori: "privat" },
      { label: "Offentlige kunder", per: map.get("offentlig") ?? new Map(), kategori: "offentlig" },
    ];
  }, [omsQ.data]);

  // --- Tabel 3: antal aktive kunder ---
  const kunderTabel = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    (kunderQ.data ?? []).forEach((r) => {
      const k = r.kategori;
      if (!map.has(k)) map.set(k, new Map());
      const m = map.get(k)!;
      const key = mNøgle(r.maaned);
      m.set(key, (m.get(key) ?? 0) + Number(r.antal || 0));
    });
    return [
      { label: "Private kunder", per: map.get("privat") ?? new Map(), kategori: "privat" },
      { label: "Offentlige kunder", per: map.get("offentlig") ?? new Map(), kategori: "offentlig" },
    ];
  }, [kunderQ.data]);

  // --- Tabel 2: dækningsbidrag ---

  const dbTabel = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    (dbQ.data ?? []).forEach((r) => {
      const k = r.kategori;
      if (!map.has(k)) map.set(k, new Map());
      const m = map.get(k)!;
      const key = mNøgle(r.maaned);
      m.set(key, (m.get(key) ?? 0) + Number(r.vaerdi || 0));
    });
    return [
      { label: "Private kunder", per: map.get("privat") ?? new Map(), kategori: "privat" },
      { label: "Offentlige kunder", per: map.get("offentlig") ?? new Map(), kategori: "offentlig" },
    ];
  }, [dbQ.data]);

  // --- Tabel 2: maskiner ---
  const MAERKER = ["Wittenborg", "Animo", "Rex-Royal", "Andet"];
  const maskinTabel = useMemo(() => {
    const rows: { label: string; per: Map<string, number>; maerke: string; brugt: boolean | null }[] =
      [];
    const pick = (maerke: string, brugt: boolean | null) => {
      const m = new Map<string, number>();
      (maskinerQ.data ?? []).forEach((r) => {
        if (r.maerke !== maerke) return;
        if (brugt !== null && r.brugt !== brugt) return;
        const key = mNøgle(r.maaned);
        m.set(key, (m.get(key) ?? 0) + Number(r.antal || 0));
      });
      return m;
    };
    for (const maerke of MAERKER) {
      if (visBrugte) {
        rows.push({ label: `${maerke} — ny`, per: pick(maerke, false), maerke, brugt: false });
        rows.push({ label: `${maerke} — brugt`, per: pick(maerke, true), maerke, brugt: true });
      } else {
        rows.push({ label: maerke, per: pick(maerke, null), maerke, brugt: null });
      }
    }
    return rows;
  }, [maskinerQ.data, visBrugte]);

  // --- Tabel 3: nye kunder (antal eller DB) ---
  const nyeTabel = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    (nyeQ.data ?? []).forEach((r) => {
      const k = r.kategori;
      if (!map.has(k)) map.set(k, new Map());
      const m = map.get(k)!;
      const key = mNøgle(r.maaned);
      const v = nyeMaal === "db" ? Number(r.db || 0) : Number(r.antal || 0);
      m.set(key, (m.get(key) ?? 0) + v);
    });
    return [
      { label: "Private", per: map.get("privat") ?? new Map(), kategori: "privat" },
      { label: "Offentlige", per: map.get("offentlig") ?? new Map(), kategori: "offentlig" },
    ];
  }, [nyeQ.data, nyeMaal]);


  const rowTotal = (per: Map<string, number>) =>
    maaneder.reduce((s, m) => s + (per.get(m) ?? 0), 0);

  const csv = () => {
    const lines: string[] = [];
    const head = ["Kategori", ...maaneder.map(maanedNavn), "Total"];
    const block = (
      titel: string,
      rows: { label: string; per: Map<string, number> }[],
      dec: number,
    ) => {
      lines.push(titel);
      lines.push(head.join(";"));
      let tot = new Map<string, number>();
      rows.forEach((r) => {
        lines.push(
          [
            r.label,
            ...maaneder.map((m) => (r.per.get(m) ?? 0).toFixed(dec).replace(".", ",")),
            rowTotal(r.per).toFixed(dec).replace(".", ","),
          ].join(";"),
        );
        maaneder.forEach((m) => tot.set(m, (tot.get(m) ?? 0) + (r.per.get(m) ?? 0)));
      });
      lines.push(
        [
          "Total",
          ...maaneder.map((m) => (tot.get(m) ?? 0).toFixed(dec).replace(".", ",")),
          rowTotal(tot).toFixed(dec).replace(".", ","),
        ].join(";"),
      );
      lines.push("");
    };
    block("1 · Omsætning pr. måned (kr.)", omsTabel, 2);
    block("2 · Dækningsbidrag pr. måned (kr.)", dbTabel, 2);
    block("3 · Antal kunder pr. måned (aktive kunder)", kunderTabel, 0);
    block(
      nyeMaal === "db"
        ? "4 · Nye kunder pr. måned (DB i perioden, måned for første ordre)"
        : "4 · Nye kunder pr. måned (antal, måned for første ordre)",
      nyeTabel,
      nyeMaal === "db" ? 2 : 0,
    );
    block("5 · Solgte maskiner pr. måned (stk.)", maskinTabel, 0);

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `maalepunkter-${fra}-${til}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const kunAfd11 = afd.afdelingFilter === 11 || afd.afdelingFilter === null;
  if (!auth.afdelinger.includes(11) || !kunAfd11) {
    return (
      <div>
        <Card className="p-6 text-sm text-muted-foreground">
          Målepunkter findes kun for afdeling 11. Vælg afdeling 11 i topbaren.
        </Card>
      </div>
    );
  }

  if (!saelgerId) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Vælg en sælger i vælgeren øverst for at se målepunkter.
      </Card>
    );
  }

  const Tabel = ({
    nummer,
    titel,
    visKey,
    rows,
    dec,
    loading,
    error,
    onRow,
    onCell,
    hoved,
    fodnote,
  }: {
    nummer: number;
    titel: string;
    /** Nøgle til at huske TABEL/GRAF pr. tabel pr. bruger. */
    visKey: string;
    rows: { label: string; per: Map<string, number> }[];
    dec: number;
    loading: boolean;
    error?: string | null;
    onRow?: (i: number) => void;
    onCell?: (i: number, maaned: string) => void;
    hoved?: React.ReactNode;
    fodnote?: React.ReactNode;
  }) => {
    const tot = new Map<string, number>();
    rows.forEach((r) => maaneder.forEach((m) => tot.set(m, (tot.get(m) ?? 0) + (r.per.get(m) ?? 0))));
    const visning = visninger[visKey] ?? "tabel";
    const skjultListe = skjulte[visKey] ?? [];
    const serier = [
      ...rows.map((r, i) => ({ navn: r.label, farve: raekkeFarve(r.label, i), per: r.per })),
      { navn: "Total", farve: FARVE_TOTAL, per: tot },
    ];
    const synlige = serier.filter((s) => !skjultListe.includes(s.navn));
    const indeks = visning === "udvikling";
    const grafData = maaneder.map((m) => {
      const punkt: Record<string, any> = { maaned: maanedNavn(m) };
      synlige.forEach((s) => {
        const v = s.per.get(m) ?? 0;
        if (!indeks) {
          punkt[s.navn] = v;
          return;
        }
        const basis = s.per.get(maaneder[0]) ?? 0;
        punkt[s.navn] = basis ? (v / basis) * 100 : null;
      });
      return punkt;
    });
    const alleTal = grafData.flatMap((p) =>
      synlige.map((s) => p[s.navn]).filter((v) => typeof v === "number"),
    ) as number[];
    const domaene = indeks ? yDomaene([...alleTal, 100]) : yDomaene(alleTal);

    // Ændring fra første til sidste måned i perioden, én pr. serie.
    const aendringer = synlige.map((s) => {
      const foerste = s.per.get(maaneder[0]) ?? 0;
      const sidste = s.per.get(maaneder[maaneder.length - 1]) ?? 0;
      const diff = sidste - foerste;
      const pct = foerste ? (diff / Math.abs(foerste)) * 100 : null;
      const fortegn = diff > 0 ? "+" : diff < 0 ? "−" : "";
      return {
        navn: s.navn,
        farve: s.farve,
        tekst: `${s.navn}: ${fmtTal(foerste, dec)} → ${fmtTal(sidste, dec)} (${fortegn}${fmtTal(Math.abs(diff), dec)}${
          pct == null ? "" : ` · ${fortegn}${fmtTal(Math.abs(pct), 1)} %`
        })`,
      };
    });
    return (
      <Card className="p-4 space-y-3 border-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
              {nummer}
            </span>
            {titel}
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            {hoved}
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={visning}
              onValueChange={(v) => v && saetVisning(visKey, v as Visning)}
            >
              <ToggleGroupItem value="tabel">Tabel</ToggleGroupItem>
              <ToggleGroupItem value="graf">Graf</ToggleGroupItem>
              <ToggleGroupItem value="udvikling">Udvikling</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter…
          </div>
        ) : visning !== "tabel" ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
              {aendringer.map((a) => (
                <span key={a.navn} style={{ color: a.farve }}>
                  {a.tekst}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {serier.map((s) => {
                const skjult = skjultListe.includes(s.navn);
                return (
                  <button
                    key={s.navn}
                    type="button"
                    onClick={() => skiftSerie(visKey, s.navn)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${
                      skjult ? "opacity-40" : ""
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: s.farve }}
                      aria-hidden
                    />
                    {s.navn}
                  </button>
                );
              })}
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={grafData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="maaned" tick={{ fontSize: 11 }} />
                  <YAxis
                    domain={domaene}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => fmtTal(Number(v), indeks ? 0 : 0)}
                  />
                  <Tooltip
                    formatter={(v) =>
                      indeks ? `${fmtTal(Number(v), 1)} (indeks)` : fmtTal(Number(v), dec)
                    }
                  />
                  {indeks && (
                    <ReferenceLine
                      y={100}
                      stroke="hsl(var(--foreground))"
                      strokeWidth={1.5}
                      label={{ value: "100", position: "right", fontSize: 11 }}
                    />
                  )}
                  {synlige.map((s) => (
                    <Line
                      key={s.navn}
                      type="linear"
                      dataKey={s.navn}
                      stroke={s.farve}
                      strokeWidth={2}
                      strokeDasharray={s.navn === "Total" ? "5 4" : undefined}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 font-medium">Kategori</th>
                  {maaneder.map((m) => (
                    <th key={m} className="text-right py-2 px-2 font-medium whitespace-nowrap">
                      {maanedNavn(m)}
                    </th>
                  ))}
                  <th className="text-right py-2 pl-3 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.label} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <button
                        type="button"
                        className="hover:underline text-left"
                        onClick={() => onRow?.(i)}
                      >
                        {r.label}
                      </button>
                    </td>
                    {maaneder.map((m) => (
                      <td key={m} className="text-right py-1.5 px-2">
                        <button
                          type="button"
                          className="hover:underline disabled:no-underline disabled:cursor-default"
                          disabled={!(r.per.get(m) ?? 0)}
                          onClick={() => onCell?.(i, m)}
                        >
                          {fmtTal(r.per.get(m) ?? 0, dec)}
                        </button>
                      </td>
                    ))}
                    <td className="text-right py-1.5 pl-3 font-semibold">
                      {fmtTal(rowTotal(r.per), dec)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="py-1.5 pr-3">Total</td>
                  {maaneder.map((m) => (
                    <td key={m} className="text-right py-1.5 px-2">
                      {fmtTal(tot.get(m) ?? 0, dec)}
                    </td>
                  ))}
                  <td className="text-right py-1.5 pl-3">{fmtTal(rowTotal(tot), dec)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {fodnote && <p className="text-xs text-muted-foreground">{fodnote}</p>}
      </Card>
    );
  };


  return (
    <div className="space-y-4 max-w-full">
      <p className="text-sm text-muted-foreground">
        Omsætning, dækningsbidrag, kunder, nye kunder og solgte maskiner pr. hel måned — afdeling
        11. Klik på et tal eller en kategori for at se hvilke virksomheder det består af.
      </p>


      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Calendar className="h-4 w-4 mr-2" />
              {maanedNavn(fra)}–{maanedNavn(til)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-3" align="start">
            <div className="space-y-1">
              {genveje.map((g) => (
                <Button
                  key={g.label}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setFra(g.fra);
                    setTilRaw(g.til);
                  }}
                >
                  {g.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Fra måned</Label>
                <Input type="month" value={fra} max={sidsteHele} onChange={(e) => setFra(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Til måned</Label>
                <Input
                  type="month"
                  value={til}
                  max={sidsteHele}
                  onChange={(e) => setTilRaw(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Kun hele måneder — den igangværende måned indgår aldrig.
            </p>
          </PopoverContent>
        </Popover>

        <Button variant="outline" size="sm" className="ml-auto" onClick={csv}>
          <Download className="h-4 w-4 mr-2" /> CSV
        </Button>
      </div>

      <Tabel
        nummer={1}
        titel="Omsætning pr. måned (kr.)"
        visKey="omsaetning"
        rows={omsTabel}
        dec={0}
        loading={omsQ.isLoading}
        error={omsQ.error ? (omsQ.error as Error).message : null}
      />

      <Tabel
        nummer={2}
        titel="Dækningsbidrag pr. måned (kr.)"
        visKey="db"
        rows={dbTabel}
        dec={0}
        loading={dbQ.isLoading}
        error={dbQ.error ? (dbQ.error as Error).message : null}
        onRow={(i) =>
          setDrill({
            slags: "db",
            kategori: dbTabel[i].kategori,
            label: `${dbTabel[i].label} — ${maanedNavn(fra)}–${maanedNavn(til)}`,
            maaned: null,
          })
        }
        onCell={(i, m) =>
          setDrill({
            slags: "db",
            kategori: dbTabel[i].kategori,
            label: `${dbTabel[i].label} — ${maanedNavn(m)}`,
            maaned: m,
          })
        }
      />

      <Tabel
        nummer={3}
        titel="Antal kunder pr. måned (aktive kunder)"
        visKey="kunder"
        rows={kunderTabel}
        dec={0}
        loading={kunderQ.isLoading}
        error={kunderQ.error ? (kunderQ.error as Error).message : null}
        fodnote="Aktiv = kunden har udstyr stående (leje, udlån, serviceaftale eller kundeejet) eller har købt varer, maskiner eller service inden for de seneste 12 måneder til og med måneden. Udstyrsdelen bygger på den nuværende registrering, da der ikke findes historik for, hvornår udstyr er sat op eller taget hjem."
      />

      <Tabel
        nummer={4}
        titel={
          nyeMaal === "db"
            ? "Nye kunder pr. måned — DB i perioden (kr., tælles i måneden for første ordre)"
            : "Nye kunder pr. måned (antal, tælles i måneden for første ordre)"
        }
        visKey="nye"
        rows={nyeTabel}
        dec={0}
        loading={nyeQ.isLoading}
        error={nyeQ.error ? (nyeQ.error as Error).message : null}
        hoved={
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={nyeMaal}
            onValueChange={(v) => v && setNyeMaal(v as "antal" | "db")}
          >
            <ToggleGroupItem value="antal">Antal</ToggleGroupItem>
            <ToggleGroupItem value="db">DB</ToggleGroupItem>
          </ToggleGroup>
        }
        onRow={(i) =>
          setDrill({
            slags: "nye",
            kategori: nyeTabel[i].kategori,
            label: `${nyeTabel[i].label} — ${maanedNavn(fra)}–${maanedNavn(til)}`,
            maaned: null,
          })
        }
        onCell={(i, m) =>
          setDrill({
            slags: "nye",
            kategori: nyeTabel[i].kategori,
            label: `${nyeTabel[i].label} — ${maanedNavn(m)}`,
            maaned: m,
          })
        }
      />

      <Tabel
        nummer={5}
        titel="Solgte maskiner pr. måned (stk.)"
        visKey="maskiner"
        rows={maskinTabel}
        dec={0}
        loading={maskinerQ.isLoading}
        error={maskinerQ.error ? (maskinerQ.error as Error).message : null}
        hoved={
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="brugte" checked={visBrugte} onCheckedChange={setVisBrugte} />
              <Label htmlFor="brugte" className="text-sm font-normal">
                Vis brugte separat
              </Label>
            </div>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={kundetype}
              onValueChange={(v) => v && setKundetype(v as Kundetype)}
            >
              <ToggleGroupItem value="offentlig">Offentlige</ToggleGroupItem>
              <ToggleGroupItem value="privat">Private</ToggleGroupItem>
              <ToggleGroupItem value="alle">Alle</ToggleGroupItem>
            </ToggleGroup>
          </div>
        }
        onRow={(i) =>
          setDrill({
            slags: "maskiner",
            maerke: maskinTabel[i].maerke,
            brugt: maskinTabel[i].brugt,
            label: `${maskinTabel[i].label} — ${maanedNavn(fra)}–${maanedNavn(til)}`,
            maaned: null,
          })
        }
        onCell={(i, m) =>
          setDrill({
            slags: "maskiner",
            maerke: maskinTabel[i].maerke,
            brugt: maskinTabel[i].brugt,
            label: `${maskinTabel[i].label} — ${maanedNavn(m)}`,
            maaned: m,
          })
        }
      />


      <DetaljePanel
        drill={drill}
        saelgerId={saelgerId}
        fra={fra}
        til={til}
        kundetype={kundetype}
        onClose={() => setDrill(null)}
      />
    </div>
  );
}

/** Ét panel ad gangen — viser hvilke virksomheder tallet består af. */
function DetaljePanel({
  drill,
  saelgerId,
  fra,
  til,
  kundetype,
  onClose,
}: {
  drill: Drill | null;
  saelgerId: string;
  fra: string;
  til: string;
  kundetype: Kundetype;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["maalepunkt-detaljer", saelgerId, fra, til, kundetype, drill],
    enabled: !!drill,
    queryFn: async () => {
      const d = drill!;
      const base = {
        _saelger: saelgerId,
        _fra: d.maaned ? firstDay(d.maaned) : firstDay(fra),
        _til: d.maaned ? firstDay(d.maaned) : firstDay(til),
      };
      if (d.slags === "db") {
        const { data, error } = await (supabase as any).rpc("maalepunkt_db_detaljer", {
          ...base,
          _kategori: d.kategori,
        });
        if (error) throw new Error(error.message);
        return (data ?? []) as any[];
      }
      if (d.slags === "maskiner") {
        const { data, error } = await (supabase as any).rpc("maalepunkt_maskiner_detaljer", {
          ...base,
          _maerke: d.maerke,
          _brugt: d.brugt,
          _kundetype: kundetype,
        });
        if (error) throw new Error(error.message);
        return (data ?? []) as any[];
      }
      const { data, error } = await (supabase as any).rpc("maalepunkt_nye_kunder_detaljer", {
        ...base,
        _kategori: d.kategori,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });

  const rows = q.data ?? [];
  const [udfoldede, setUdfoldede] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Ny visning starter altid på standardsorteringen fra databasen.
  useEffect(() => {
    setSortKey(null);
    setSortDir("asc");
    setUdfoldede({});
  }, [drill]);

  const klikSorter = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const navn = (r: any) => (
    <Link
      to="/virksomheder/$id"
      params={{ id: r.company_id }}
      className="text-primary hover:underline"
    >
      {r.navn}
    </Link>
  );

  /** Nye kunder kommer som én række pr. konto, grupperet pr. kunde (samme adresse). */
  const nyeGrupper = useMemo(() => {
    if (drill?.slags !== "nye") return [];
    const map = new Map<
      string,
      {
        key: string;
        navn: string;
        by: string | null;
        oprettet: string;
        foersteOrdre: string | null;
        antal: number;
        konti: any[];
      }
    >();
    rows.forEach((r: any) => {
      const k = String(r.gruppe_key ?? r.company_id);
      if (!map.has(k)) {
        map.set(k, {
          key: k,
          navn: r.gruppe_navn ?? r.navn,
          by: r.gruppe_by ?? r.by,
          oprettet: r.gruppe_oprettet ?? r.oprettet,
          foersteOrdre: r.gruppe_foerste_ordre ?? r.foerste_ordre ?? null,
          antal: Number(r.antal_konti ?? 1),
          konti: [],
        });
      }
      map.get(k)!.konti.push(r);
    });
    return Array.from(map.values()).map((g) => ({
      ...g,
      omsaetning: g.konti.reduce((s, k) => s + (Number(k.omsaetning) || 0), 0),
      sidsteKoeb:
        g.konti
          .map((k) => k.sidste_koeb)
          .filter(Boolean)
          .sort()
          .pop() ?? null,
      kundeprisgruppe_2: g.konti[0]?.kundeprisgruppe_2 ?? null,
      company_id: g.konti[0]?.company_id,
    }));
  }, [rows, drill?.slags]);

  /** Kolonner pr. paneltype — bruges både til sorterbare overskrifter og celler. */
  type Kol = {
    key: string;
    label: string;
    num?: boolean;
    val: (r: any) => any;
    cell: (r: any) => React.ReactNode;
  };

  const kolonner: Kol[] = useMemo(() => {
    if (drill?.slags === "db")
      return [
        { key: "navn", label: "Virksomhed", val: (r) => r.navn ?? "", cell: (r) => navn(r) },
        { key: "by", label: "By", val: (r) => r.by ?? "", cell: (r) => r.by ?? "—" },
        {
          key: "db",
          label: "DB",
          num: true,
          val: (r) => Number(r.db) || 0,
          cell: (r) => fmtTal(Number(r.db) || 0),
        },
        {
          key: "omsaetning",
          label: "Omsætning",
          num: true,
          val: (r) => Number(r.omsaetning) || 0,
          cell: (r) => fmtTal(Number(r.omsaetning) || 0),
        },
      ];
    if (drill?.slags === "maskiner")
      return [
        { key: "navn", label: "Virksomhed", val: (r) => r.navn ?? "", cell: (r) => navn(r) },
        { key: "by", label: "By", val: (r) => r.by ?? "", cell: (r) => r.by ?? "—" },
        { key: "model", label: "Model", val: (r) => r.model ?? "", cell: (r) => r.model ?? "—" },
        {
          key: "antal",
          label: "Antal",
          num: true,
          val: (r) => Number(r.antal) || 0,
          cell: (r) => fmtTal(Number(r.antal) || 0),
        },
        {
          key: "faktura_dato",
          label: "Fakturadato",
          val: (r) => r.faktura_dato ?? "",
          cell: (r) => fmtDato(r.faktura_dato),
        },
        {
          key: "beloeb",
          label: "Beløb",
          num: true,
          val: (r) => Number(r.beloeb) || 0,
          cell: (r) => fmtTal(Number(r.beloeb) || 0),
        },
        {
          key: "brugt",
          label: "Stand",
          val: (r) => (r.brugt ? 1 : 0),
          cell: (r) => (r.brugt ? "Brugt" : "Ny"),
        },
      ];
    return [
      { key: "navn", label: "Virksomhed", val: (r) => r.navn ?? "", cell: (r) => navn(r) },
      { key: "by", label: "By", val: (r) => r.by ?? "", cell: (r) => r.by ?? "—" },
      {
        key: "oprettet",
        label: "Oprettet i Visma",
        val: (r) => r.oprettet ?? "",
        cell: (r) => fmtDato(r.oprettet),
      },
      {
        key: "foersteOrdre",
        label: "Første ordre",
        val: (r) => r.foersteOrdre ?? "",
        cell: (r) => (r.foersteOrdre ? fmtDato(r.foersteOrdre) : "—"),
      },
      {
        key: "kundeprisgruppe_2",
        label: "Kundeprisgruppe 2",
        val: (r) => r.kundeprisgruppe_2 ?? "",
        cell: (r) => r.kundeprisgruppe_2 ?? "—",
      },
      {
        key: "omsaetning",
        label: "Omsætning siden",
        num: true,
        val: (r) => Number(r.omsaetning) || 0,
        cell: (r) => fmtTal(Number(r.omsaetning) || 0),
      },
      {
        key: "sidsteKoeb",
        label: "Sidste køb",
        val: (r) => r.sidsteKoeb ?? "",
        cell: (r) => (r.sidsteKoeb ? fmtDato(r.sidsteKoeb) : "Har aldrig købt"),
      },
    ];
  }, [drill?.slags]);

  const sorter = <T,>(liste: T[]): T[] => {
    if (!sortKey) return liste;
    const kol = kolonner.find((k) => k.key === sortKey);
    if (!kol) return liste;
    const f = sortDir === "asc" ? 1 : -1;
    return [...liste].sort((a, b) => {
      const av = kol.val(a);
      const bv = kol.val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * f;
      return String(av).localeCompare(String(bv), "da-DK") * f;
    });
  };

  const grupperSorteret = useMemo(() => sorter(nyeGrupper), [nyeGrupper, sortKey, sortDir, kolonner]);
  const rowsSorteret = useMemo(() => sorter(rows), [rows, sortKey, sortDir, kolonner]);

  return (
    <Dialog open={!!drill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{drill?.label ?? ""}</DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter…
          </div>
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Ingen virksomheder i dette tal.</p>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b text-left">
                {kolonner.map((k) => (
                  <th
                    key={k.key}
                    className={`py-2 pr-3 font-medium ${k.num ? "text-right" : ""}`}
                  >
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => klikSorter(k.key)}
                    >
                      {k.label}
                      {sortKey === k.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drill?.slags === "nye"
                ? grupperSorteret.map((g: any) => {
                    const aaben = !!udfoldede[g.key];
                    return (
                      <Fragment key={g.key}>
                        <tr className="border-b last:border-0">
                          <td className="py-1.5 pr-3">
                            {navn({ company_id: g.company_id, navn: g.navn })}
                            {g.antal > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setUdfoldede((p) => ({ ...p, [g.key]: !p[g.key] }))
                                }
                                className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                              >
                                {g.antal} konti {aaben ? "▲" : "▼"}
                              </button>
                            )}
                          </td>
                          {kolonner.slice(1).map((k) => (
                            <td
                              key={k.key}
                              className={`py-1.5 pr-3 ${k.num ? "text-right" : ""}`}
                            >
                              {k.cell(g)}
                            </td>
                          ))}
                        </tr>
                        {aaben &&
                          g.konti.map((k: any) => (
                            <tr key={`${g.key}-${k.company_id}`} className="border-b bg-muted/30">
                              <td className="py-1 pr-3 pl-6 text-xs">{navn(k)}</td>
                              <td className="py-1 pr-3 text-xs">{k.by ?? "—"}</td>
                              <td className="py-1 pr-3 text-xs">{fmtDato(k.oprettet)}</td>
                              <td className="py-1 pr-3 text-xs">
                                {k.foerste_ordre ? fmtDato(k.foerste_ordre) : "—"}
                              </td>
                              <td className="py-1 pr-3 text-xs">{k.kundeprisgruppe_2 ?? "—"}</td>
                              <td className="py-1 pr-3 text-right text-xs">
                                {fmtTal(Number(k.omsaetning) || 0)}
                              </td>
                              <td className="py-1 pr-3 text-xs">
                                {k.sidste_koeb ? fmtDato(k.sidste_koeb) : "Har aldrig købt"}
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })
                : rowsSorteret.map((r: any, i: number) => (
                    <tr key={`${r.company_id}-${i}`} className="border-b last:border-0">
                      {kolonner.map((k) => (
                        <td key={k.key} className={`py-1.5 pr-3 ${k.num ? "text-right" : ""}`}>
                          {k.cell(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}

