import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAfdeling } from "@/contexts/afdeling-context";
import { beskrivOrdning, type BonusOrdning } from "@/lib/bonus-ordning";

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
const fmtTal = (n: number, dec = 0) =>
  n.toLocaleString("da-DK", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtDato = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

type Rk = {
  maaned: string;
  ordning_id: string | null;
  db_grundlag: number;
  db_provision_pct: number;
  db_bonus: number;
  antal_wittenborg: number;
  antal_animo: number;
  antal_rex: number;
  maskinbonus: number;
  samlet_bonus: number;
};

/**
 * Bonus pr. måned. Satserne hentes fra den ordning der gælder netop den måned,
 * så en satsændring aldrig flytter en allerede opgjort måned.
 */
export function BonusFane({ saelgerId }: { saelgerId: string }) {
  const auth = useAuth();
  const afd = useAfdeling();

  const now = new Date();
  const curM = mKey(now.getUTCFullYear(), now.getUTCMonth());
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

  const [fra, setFra] = useState(mKey(now.getUTCFullYear(), 0));
  const [tilRaw, setTilRaw] = useState(sidsteHele);
  const til = tilRaw > sidsteHele ? sidsteHele : tilRaw;
  const [drillMaaned, setDrillMaaned] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["bonus-pr-maaned", saelgerId, fra, til],
    enabled: !!saelgerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("bonus_pr_maaned", {
        _saelger: saelgerId,
        _fra: firstDay(fra),
        _til: firstDay(til),
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        maaned: String(r.maaned).slice(0, 7),
        db_grundlag: Number(r.db_grundlag) || 0,
        db_provision_pct: Number(r.db_provision_pct) || 0,
        db_bonus: Number(r.db_bonus) || 0,
        antal_wittenborg: Number(r.antal_wittenborg) || 0,
        antal_animo: Number(r.antal_animo) || 0,
        antal_rex: Number(r.antal_rex) || 0,
        maskinbonus: Number(r.maskinbonus) || 0,
        samlet_bonus: Number(r.samlet_bonus) || 0,
      })) as Rk[];
    },
  });

  const ordningerQ = useQuery({
    queryKey: ["bonus-ordninger", saelgerId],
    enabled: !!saelgerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("bonus_ordning")
        .select("*")
        .eq("user_id", saelgerId)
        .order("gyldig_fra");
      if (error) throw new Error(error.message);
      return (data ?? []) as BonusOrdning[];
    },
  });

  const rows = q.data ?? [];
  const brugteOrdninger = useMemo(() => {
    const ids = new Set(rows.map((r) => r.ordning_id).filter(Boolean) as string[]);
    return (ordningerQ.data ?? []).filter((o) => ids.has(o.id));
  }, [rows, ordningerQ.data]);
  const manglerOrdning = rows.filter((r) => !r.ordning_id).map((r) => r.maaned);

  const total = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({
          db_grundlag: t.db_grundlag + r.db_grundlag,
          db_bonus: t.db_bonus + r.db_bonus,
          antal_wittenborg: t.antal_wittenborg + r.antal_wittenborg,
          antal_animo: t.antal_animo + r.antal_animo,
          antal_rex: t.antal_rex + r.antal_rex,
          maskinbonus: t.maskinbonus + r.maskinbonus,
          samlet_bonus: t.samlet_bonus + r.samlet_bonus,
        }),
        {
          db_grundlag: 0,
          db_bonus: 0,
          antal_wittenborg: 0,
          antal_animo: 0,
          antal_rex: 0,
          maskinbonus: 0,
          samlet_bonus: 0,
        },
      ),
    [rows],
  );

  const csv = () => {
    const head = [
      "Måned",
      "DB-grundlag",
      "Provisionssats %",
      "DB-bonus",
      "Wittenborg",
      "Animo",
      "Rex-Royal",
      "Maskinbonus",
      "Bonus i alt",
    ];
    const num = (n: number, dec = 2) => n.toFixed(dec).replace(".", ",");
    const lines = [head.join(";")];
    rows.forEach((r) =>
      lines.push(
        [
          maanedNavn(r.maaned) + (r.ordning_id ? "" : " (ingen ordning)"),
          num(r.db_grundlag),
          num(r.db_provision_pct, 1),
          num(r.db_bonus),
          num(r.antal_wittenborg, 0),
          num(r.antal_animo, 0),
          num(r.antal_rex, 0),
          num(r.maskinbonus),
          num(r.samlet_bonus),
        ].join(";"),
      ),
    );
    lines.push(
      [
        "Total",
        num(total.db_grundlag),
        "",
        num(total.db_bonus),
        num(total.antal_wittenborg, 0),
        num(total.antal_animo, 0),
        num(total.antal_rex, 0),
        num(total.maskinbonus),
        num(total.samlet_bonus),
      ].join(";"),
    );
    brugteOrdninger.forEach((o) => lines.push("", beskrivOrdning(o)));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bonus-${fra}-${til}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const kunAfd11 = afd.afdelingFilter === 11 || afd.afdelingFilter === null;
  if (!auth.afdelinger.includes(11) || !kunAfd11) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Bonus opgøres kun for afdeling 11. Vælg afdeling 11 i topbaren.
      </Card>
    );
  }
  if (!saelgerId) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Vælg en sælger i vælgeren øverst for at se bonus.
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-full">
      <p className="text-sm text-muted-foreground">
        Optjent bonus pr. hel måned — afdeling 11. Satserne følger den bonusordning, der gjaldt i
        netop den måned. Klik på en måned for at se grundlaget.
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

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Bonus pr. måned</h2>
        {q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 font-medium">Måned</th>
                  <th className="text-right py-2 px-2 font-medium">DB-grundlag</th>
                  <th className="text-right py-2 px-2 font-medium">Sats</th>
                  <th className="text-right py-2 px-2 font-medium">DB-bonus</th>
                  <th className="text-right py-2 px-2 font-medium">Wittenborg</th>
                  <th className="text-right py-2 px-2 font-medium">Animo</th>
                  <th className="text-right py-2 px-2 font-medium">Rex</th>
                  <th className="text-right py-2 px-2 font-medium">Maskinbonus</th>
                  <th className="text-right py-2 pl-3 font-semibold">Bonus i alt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.maaned} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => setDrillMaaned(r.maaned)}
                      >
                        {maanedNavn(r.maaned)}
                      </button>
                      {!r.ordning_id && (
                        <span className="ml-2 text-xs text-muted-foreground">ingen ordning</span>
                      )}
                    </td>
                    <td className="text-right py-1.5 px-2">{fmtTal(r.db_grundlag)}</td>
                    <td className="text-right py-1.5 px-2">
                      {r.ordning_id ? `${fmtTal(r.db_provision_pct, 1)} %` : "—"}
                    </td>
                    <td className="text-right py-1.5 px-2">{fmtTal(r.db_bonus)}</td>
                    <td className="text-right py-1.5 px-2">{fmtTal(r.antal_wittenborg)}</td>
                    <td className="text-right py-1.5 px-2">{fmtTal(r.antal_animo)}</td>
                    <td className="text-right py-1.5 px-2">{fmtTal(r.antal_rex)}</td>
                    <td className="text-right py-1.5 px-2">{fmtTal(r.maskinbonus)}</td>
                    <td className="text-right py-1.5 pl-3 font-semibold">
                      {fmtTal(r.samlet_bonus)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="py-1.5 pr-3">Total</td>
                  <td className="text-right py-1.5 px-2">{fmtTal(total.db_grundlag)}</td>
                  <td className="text-right py-1.5 px-2">—</td>
                  <td className="text-right py-1.5 px-2">{fmtTal(total.db_bonus)}</td>
                  <td className="text-right py-1.5 px-2">{fmtTal(total.antal_wittenborg)}</td>
                  <td className="text-right py-1.5 px-2">{fmtTal(total.antal_animo)}</td>
                  <td className="text-right py-1.5 px-2">{fmtTal(total.antal_rex)}</td>
                  <td className="text-right py-1.5 px-2">{fmtTal(total.maskinbonus)}</td>
                  <td className="text-right py-1.5 pl-3">{fmtTal(total.samlet_bonus)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="space-y-1 pt-1">
          {brugteOrdninger.map((o) => (
            <p key={o.id} className="text-xs text-muted-foreground">
              {beskrivOrdning(o)}
            </p>
          ))}
          {manglerOrdning.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Ingen bonusordning for {manglerOrdning.map(maanedNavn).join(", ")}.
            </p>
          )}
        </div>
      </Card>

      <BonusPanel
        saelgerId={saelgerId}
        maaned={drillMaaned}
        onClose={() => setDrillMaaned(null)}
      />
    </div>
  );
}

type Kol = { key: string; label: string; num?: boolean; val: (r: any) => any; cell: (r: any) => React.ReactNode };

/** Grundlaget bag én måned: virksomheder med DB og de maskiner der er talt med. */
function BonusPanel({
  saelgerId,
  maaned,
  onClose,
}: {
  saelgerId: string;
  maaned: string | null;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["bonus-detaljer", saelgerId, maaned],
    enabled: !!maaned,
    queryFn: async () => {
      const args = { _saelger: saelgerId, _fra: firstDay(maaned!), _til: firstDay(maaned!) };
      const [db, mask] = await Promise.all([
        (supabase as any).rpc("bonus_db_detaljer", args),
        (supabase as any).rpc("bonus_maskin_detaljer", args),
      ]);
      if (db.error) throw new Error(db.error.message);
      if (mask.error) throw new Error(mask.error.message);
      return { db: (db.data ?? []) as any[], maskiner: (mask.data ?? []) as any[] };
    },
  });

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [maskSortKey, setMaskSortKey] = useState<string | null>(null);
  const [maskSortDir, setMaskSortDir] = useState<"asc" | "desc">("asc");
  useEffect(() => {
    setSortKey(null);
    setMaskSortKey(null);
    setSortDir("asc");
    setMaskSortDir("asc");
  }, [maaned]);

  const navn = (r: any) => (
    <Link to="/virksomheder/$id" params={{ id: r.company_id }} className="text-primary hover:underline">
      {r.navn}
    </Link>
  );

  const dbKol: Kol[] = [
    { key: "navn", label: "Virksomhed", val: (r) => r.navn ?? "", cell: (r) => navn(r) },
    { key: "by", label: "By", val: (r) => r.by ?? "", cell: (r) => r.by ?? "—" },
    {
      key: "kategori",
      label: "Kundetype",
      val: (r) => r.kategori ?? "",
      cell: (r) => (r.kategori === "offentlig" ? "Offentlig" : "Privat"),
    },
    { key: "db", label: "DB", num: true, val: (r) => Number(r.db) || 0, cell: (r) => fmtTal(Number(r.db) || 0) },
    {
      key: "omsaetning",
      label: "Omsætning",
      num: true,
      val: (r) => Number(r.omsaetning) || 0,
      cell: (r) => fmtTal(Number(r.omsaetning) || 0),
    },
  ];

  const maskKol: Kol[] = [
    { key: "navn", label: "Virksomhed", val: (r) => r.navn ?? "", cell: (r) => navn(r) },
    { key: "by", label: "By", val: (r) => r.by ?? "", cell: (r) => r.by ?? "—" },
    { key: "maerke", label: "Mærke", val: (r) => r.maerke ?? "", cell: (r) => r.maerke ?? "—" },
    { key: "model", label: "Model", val: (r) => r.model ?? "", cell: (r) => r.model ?? "—" },
    {
      key: "kilde",
      label: "Type",
      val: (r) => r.kilde ?? "",
      cell: (r) => (r.kilde === "leje" ? "Leje/udlån" : "Salg"),
    },
    { key: "brugt", label: "Stand", val: (r) => (r.brugt ? 1 : 0), cell: (r) => (r.brugt ? "Brugt" : "Ny") },
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
  ];

  const sorter = (liste: any[], kolonner: Kol[], key: string | null, dir: "asc" | "desc") => {
    if (!key) return liste;
    const kol = kolonner.find((k) => k.key === key);
    if (!kol) return liste;
    const f = dir === "asc" ? 1 : -1;
    return [...liste].sort((a, b) => {
      const av = kol.val(a);
      const bv = kol.val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * f;
      return String(av).localeCompare(String(bv), "da-DK") * f;
    });
  };

  const Tabel = ({
    titel,
    rows,
    kolonner,
    sk,
    sd,
    onSort,
  }: {
    titel: string;
    rows: any[];
    kolonner: Kol[];
    sk: string | null;
    sd: "asc" | "desc";
    onSort: (k: string) => void;
  }) => (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titel}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen linjer.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b text-left">
              {kolonner.map((k) => (
                <th key={k.key} className={`py-2 pr-3 font-medium ${k.num ? "text-right" : ""}`}>
                  <button type="button" className="hover:underline" onClick={() => onSort(k.key)}>
                    {k.label}
                    {sk === k.key ? (sd === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorter(rows, kolonner, sk, sd).map((r, i) => (
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
    </div>
  );

  return (
    <Dialog open={!!maaned} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bonusgrundlag — {maaned ? maanedNavn(maaned) : ""}</DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter…
          </div>
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : (
          <div className="space-y-6">
            <Tabel
              titel="Dækningsbidrag"
              rows={q.data?.db ?? []}
              kolonner={dbKol}
              sk={sortKey}
              sd={sortDir}
              onSort={(k) => {
                if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                else {
                  setSortKey(k);
                  setSortDir("asc");
                }
              }}
            />
            <Tabel
              titel="Maskiner talt med"
              rows={q.data?.maskiner ?? []}
              kolonner={maskKol}
              sk={maskSortKey}
              sd={maskSortDir}
              onSort={(k) => {
                if (maskSortKey === k) setMaskSortDir((d) => (d === "asc" ? "desc" : "asc"));
                else {
                  setMaskSortKey(k);
                  setMaskSortDir("asc");
                }
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
