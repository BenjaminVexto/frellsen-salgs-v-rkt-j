import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAfdeling } from "@/contexts/afdeling-context";

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

  const maaneder = useMemo(() => maanedListe(fra, til), [fra, til]);
  const args = { _saelger: saelgerId, _fra: firstDay(fra), _til: firstDay(til) };

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
    queryKey: ["maalepunkt-maskiner", saelgerId, fra, til],
    enabled: !!saelgerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("maalepunkt_maskiner", args);
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
      return (data ?? []) as { maaned: string; kategori: string; antal: number }[];
    },
  });

  const mNøgle = (d: string) => String(d).slice(0, 7);

  // --- Tabel 1: dækningsbidrag ---
  const dbTabel = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    (dbQ.data ?? []).forEach((r) => {
      const k = r.kategori;
      if (!map.has(k)) map.set(k, new Map());
      const m = map.get(k)!;
      const key = mNøgle(r.maaned);
      m.set(key, (m.get(key) ?? 0) + Number(r.vaerdi || 0));
    });
    const rows: { label: string; per: Map<string, number> }[] = [
      { label: "Private kunder", per: map.get("privat") ?? new Map() },
      { label: "Offentlige kunder", per: map.get("offentlig") ?? new Map() },
    ];
    const andet = map.get("andet");
    if (andet && Array.from(andet.values()).some((v) => Math.abs(v) > 0.005)) {
      rows.push({ label: "Andet", per: andet });
    }
    return rows;
  }, [dbQ.data]);

  // --- Tabel 2: maskiner ---
  const MAERKER = ["Wittenborg", "Animo", "Rex-Royal", "Andet"];
  const maskinTabel = useMemo(() => {
    const rows: { label: string; per: Map<string, number> }[] = [];
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
        rows.push({ label: `${maerke} — ny`, per: pick(maerke, false) });
        rows.push({ label: `${maerke} — brugt`, per: pick(maerke, true) });
      } else {
        rows.push({ label: maerke, per: pick(maerke, null) });
      }
    }
    return rows;
  }, [maskinerQ.data, visBrugte]);

  // --- Tabel 3: nye kunder ---
  const nyeTabel = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    (nyeQ.data ?? []).forEach((r) => {
      const k = r.kategori;
      if (!map.has(k)) map.set(k, new Map());
      const m = map.get(k)!;
      const key = mNøgle(r.maaned);
      m.set(key, (m.get(key) ?? 0) + Number(r.antal || 0));
    });
    const rows: { label: string; per: Map<string, number> }[] = [
      { label: "Private", per: map.get("privat") ?? new Map() },
      { label: "Offentlige", per: map.get("offentlig") ?? new Map() },
    ];
    const andet = map.get("andet");
    if (andet && Array.from(andet.values()).some((v) => v > 0)) {
      rows.push({ label: "Andet", per: andet });
    }
    return rows;
  }, [nyeQ.data]);

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
    block("Dækningsbidrag pr. måned (kr.)", dbTabel, 2);
    block("Solgte maskiner pr. måned (stk.)", maskinTabel, 0);
    block("Nye kunder pr. måned (antal)", nyeTabel, 0);
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
    titel,
    rows,
    dec,
    loading,
    error,
  }: {
    titel: string;
    rows: { label: string; per: Map<string, number> }[];
    dec: number;
    loading: boolean;
    error?: string | null;
  }) => {
    const tot = new Map<string, number>();
    rows.forEach((r) => maaneder.forEach((m) => tot.set(m, (tot.get(m) ?? 0) + (r.per.get(m) ?? 0))));
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide">{titel}</h2>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter…
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
                {rows.map((r) => (
                  <tr key={r.label} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{r.label}</td>
                    {maaneder.map((m) => (
                      <td key={m} className="text-right py-1.5 px-2">
                        {fmtTal(r.per.get(m) ?? 0, dec)}
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
      </Card>
    );
  };

  return (
    <div className="space-y-4 max-w-full">
      <p className="text-sm text-muted-foreground">
        Dækningsbidrag, solgte maskiner og nye kunder pr. hel måned — afdeling 11.
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

        <div className="flex items-center gap-2 ml-1">
          <Switch id="brugte" checked={visBrugte} onCheckedChange={setVisBrugte} />
          <Label htmlFor="brugte" className="text-sm">
            Vis brugte separat
          </Label>
        </div>

        <Button variant="outline" size="sm" className="ml-auto" onClick={csv}>
          <Download className="h-4 w-4 mr-2" /> CSV
        </Button>
      </div>

      <Tabel
        titel="Dækningsbidrag pr. måned (kr.)"
        rows={dbTabel}
        dec={0}
        loading={dbQ.isLoading}
        error={dbQ.error ? (dbQ.error as Error).message : null}
      />
      <Tabel
        titel="Solgte maskiner pr. måned (stk.)"
        rows={maskinTabel}
        dec={0}
        loading={maskinerQ.isLoading}
        error={maskinerQ.error ? (maskinerQ.error as Error).message : null}
      />
      <Tabel
        titel="Nye kunder pr. måned"
        rows={nyeTabel}
        dec={0}
        loading={nyeQ.isLoading}
        error={nyeQ.error ? (nyeQ.error as Error).message : null}
      />
    </div>
  );
}
