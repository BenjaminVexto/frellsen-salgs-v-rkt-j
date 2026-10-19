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
import { filtrerBonusMaskiner, MASKIN_LABEL, type MaskinFilter } from "@/lib/bonus-maskin-visning";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  ny_kunde_db: number | null;
  ny_kunde_rang: number | null;
  ny_kunde_bonus: number;
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
  const [maskinFilter, setMaskinFilter] = useState<MaskinFilter>("alle");
  const aabnMaskiner = (maaned: string, filter: MaskinFilter) => {
    setMaskinFilter(filter);
    setDrillMaaned(maaned);
  };

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
        ny_kunde_db: r.ny_kunde_db == null ? null : Number(r.ny_kunde_db),
        ny_kunde_rang: r.ny_kunde_rang == null ? null : Number(r.ny_kunde_rang),
        ny_kunde_bonus: Number(r.ny_kunde_bonus) || 0,
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
          ny_kunde_bonus: t.ny_kunde_bonus + r.ny_kunde_bonus,
          samlet_bonus: t.samlet_bonus + r.samlet_bonus,
        }),
        {
          db_grundlag: 0,
          db_bonus: 0,
          antal_wittenborg: 0,
          antal_animo: 0,
          antal_rex: 0,
          maskinbonus: 0,
          ny_kunde_bonus: 0,
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
      "Ny kunde",
      "Bonus i alt",
    ];
    const num = (n: number, dec = 2) => n.toFixed(dec).replace(".", ",");
    const lines = [head.join(";")];
    rows.forEach((r) =>
      lines.push(
        [
          maanedNavn(r.maaned) + (r.ordning_id ? "" : " (ingen ordning)"),
          num(r.db_grundlag),
          num(r.db_provision_pct, 2),
          num(r.db_bonus),
          num(r.antal_wittenborg, 0),
          num(r.antal_animo, 0),
          num(r.antal_rex, 0),
          num(r.maskinbonus),
          num(r.ny_kunde_bonus),
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
        num(total.ny_kunde_bonus),
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
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">Ny kunde</th>
                  <th className="text-right py-2 pl-3 font-semibold">Bonus i alt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.maaned} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <Button
                        variant="link"
                        className="h-auto p-0 font-normal text-foreground"
                        onClick={() => aabnMaskiner(r.maaned, "alle")}
                      >
                        {maanedNavn(r.maaned)}
                      </Button>
                      {!r.ordning_id && (
                        <span className="ml-2 text-xs text-muted-foreground">ingen ordning</span>
                      )}
                    </td>
                    <td className="text-right py-1.5 px-2">{fmtTal(r.db_grundlag)}</td>
                    <td className="text-right py-1.5 px-2">
                      {r.ordning_id ? `${fmtTal(r.db_provision_pct, 2)} %` : "—"}
                    </td>
                    <td className="text-right py-1.5 px-2">{fmtTal(r.db_bonus)}</td>
                    {([
                      ["wittenborg", r.antal_wittenborg],
                      ["animo", r.antal_animo],
                      ["rex", r.antal_rex],
                    ] as const).map(([klasse, antal]) => (
                      <td key={klasse} className="text-right py-1.5 px-2">
                        <Button variant="link" className="h-8 min-w-8 p-0 tabular-nums underline underline-offset-4"
                          aria-label={`${MASKIN_LABEL[klasse]} — ${maanedNavn(r.maaned)}: ${fmtTal(antal)} maskiner`}
                          onClick={() => aabnMaskiner(r.maaned, klasse)}>
                          {fmtTal(antal)}
                        </Button>
                      </td>
                    ))}
                    <td className="text-right py-1.5 px-2">
                      <Button variant="link" className="h-8 min-w-8 p-0 tabular-nums underline underline-offset-4"
                        aria-label={`Maskinbonus — ${maanedNavn(r.maaned)}`}
                        onClick={() => aabnMaskiner(r.maaned, "alle")}>{fmtTal(r.maskinbonus)}</Button>
                    </td>
                    <td className="text-right py-1.5 px-2">
                      {fmtTal(r.ny_kunde_bonus)}
                      {r.ny_kunde_db != null && r.ny_kunde_rang != null && (
                        <span className="block text-xs text-muted-foreground whitespace-nowrap">
                          DB nye kunder: {fmtTal(r.ny_kunde_db)} kr. · plads {r.ny_kunde_rang}
                        </span>
                      )}
                    </td>
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
                  <td className="text-right py-1.5 px-2">{fmtTal(total.ny_kunde_bonus)}</td>
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
          <p className="text-xs text-muted-foreground">
            Ny kunde-provision fra sep. 2026: største DB på nye kunder (ingen omsætning de seneste 24 mdr., ekskl. offentlige udbudskunder KPG3 40) får 1.000 kr., næststørste 600 kr. · Animo OptiVend giver Animo-bonus fra sep. 2026.
          </p>
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
        maskinFilter={maskinFilter}
        onFilterChange={setMaskinFilter}
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
  maskinFilter,
  onFilterChange,
  onClose,
}: {
  saelgerId: string;
  maaned: string | null;
  maskinFilter: MaskinFilter;
  onFilterChange: (filter: MaskinFilter) => void;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["bonus-detaljer", saelgerId, maaned],
    enabled: !!maaned,
    queryFn: async () => {
      if (!maaned) return { db: [], maskiner: [] };
      const args = { _saelger: saelgerId, _fra: firstDay(maaned), _til: firstDay(maaned) };
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
  const maskiner = filtrerBonusMaskiner(q.data?.maskiner ?? [], maskinFilter);
  const antalMaskiner = maskiner.filter((r) => !r.udeladt).reduce((sum, r) => sum + (Number(r.antal) || 0), 0);
  const antalKunder = new Set(maskiner.filter((r) => !r.udeladt).map((r) => r.company_id)).size;
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
      cell: (r) => (r.kategori === "offentlig" ? "Udbudskunder" : "Forhandlingskunder"),
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

  const KLASSE_LABEL: Record<string, string> = {
    wittenborg: "Wittenborg",
    animo: "Animo",
    rex: "Rex-Royal",
    ingen: "Ingen bonus",
    uklassificeret: "Uklassificeret",
  };

  const maskKol: Kol[] = [
    { key: "navn", label: "Virksomhed", val: (r) => r.navn ?? "", cell: (r) => navn(r) },
    { key: "by", label: "By", val: (r) => r.by ?? "", cell: (r) => r.by ?? "—" },
    {
      key: "serienr",
      label: "Serienr.",
      val: (r) => r.serienr ?? "",
      cell: (r) => <span className="font-mono text-xs">{r.serienr ?? "—"}</span>,
    },
    { key: "maerke", label: "Mærke", val: (r) => r.maerke ?? "", cell: (r) => r.maerke ?? "—" },
    { key: "model", label: "Model", val: (r) => r.model ?? "", cell: (r) => r.model ?? "—" },
    {
      key: "bonusklasse",
      label: "Bonusklasse",
      val: (r) => r.bonusklasse ?? "",
      cell: (r) => KLASSE_LABEL[r.bonusklasse ?? ""] ?? "—",
    },
    {
      key: "udeladt",
      label: "Tæller med",
      val: (r) => (r.udeladt ? 1 : 0),
      cell: (r) =>
        r.udeladt ? (
          <span className="text-muted-foreground">Nej — {r.aarsag ?? "udeladt"}</span>
        ) : (
          "Ja"
        ),
    },

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
    <div className="space-y-2 min-w-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titel}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen linjer.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b text-left">
              {kolonner.map((k) => (
                <th key={k.key} className={`py-2 pr-3 font-medium ${k.num ? "text-right" : ""}`}>
                  <Button variant="ghost" className="h-auto p-0 font-medium hover:underline" onClick={() => onSort(k.key)}>
                    {k.label}
                    {sk === k.key ? (sd === "asc" ? " ▲" : " ▼") : ""}
                  </Button>
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
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={!!maaned} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{maskinFilter === "alle" ? "Bonusgrundlag" : MASKIN_LABEL[maskinFilter]} — {maaned ? maanedNavn(maaned) : ""}</DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter…
          </div>
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={maskinFilter} onValueChange={(value) => {
                if (value === "alle" || value === "wittenborg" || value === "animo" || value === "rex") onFilterChange(value);
              }}>
                <SelectTrigger className="w-48" aria-label="Maskintype"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(MASKIN_LABEL) as MaskinFilter[]).map((key) => <SelectItem key={key} value={key}>{MASKIN_LABEL[key]}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">{fmtTal(antalMaskiner)} maskiner · {antalKunder} kunder</p>
            </div>
            {maskinFilter === "alle" && (
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
            )}
            <Tabel
              titel={maskinFilter === "alle" ? "Maskiner i måneden (udeladte vises med årsag)" : `${MASKIN_LABEL[maskinFilter]} — medregnede maskiner`}
              rows={maskiner}
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
