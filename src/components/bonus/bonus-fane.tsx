import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, Download, Info, Loader2, Lock } from "lucide-react";
import { BonusRegler, ReglerInfo, type ReglerAfsnit } from "./bonus-regler";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAfdeling } from "@/contexts/afdeling-context";
import { beskrivOrdning, type BonusOrdning } from "@/lib/bonus-ordning";
import { MASKIN_LABEL, type MaskinFilter } from "@/lib/bonus-maskin-visning";
import { BonusDetaljer, type BonusDrill } from "./bonus-detaljer";

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
  laast_at?: string | null;
  maskiner?: any[] | null;
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
  const [drill, setDrill] = useState<BonusDrill | null>(null);
  const aabn = (r: Rk, visning: BonusDrill["visning"], filter: MaskinFilter = "alle") =>
    setDrill({ maaned: r.maaned, visning, filter, bonus: visning === "db" ? r.db_bonus : r.maskinbonus, snapshot: r.maskiner ?? null });
  const klik = "h-auto min-h-8 p-0 font-normal text-foreground tabular-nums no-underline hover:underline focus-visible:underline underline-offset-4";

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

  // Låste (udbetalte) måneder vises med de gemte tal — ikke en ny beregning.
  const laasQ = useQuery({
    queryKey: ["bonus-laas", saelgerId, fra, til],
    enabled: !!saelgerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("bonus_laas").select("*").eq("user_id", saelgerId)
        .gte("maaned", firstDay(fra)).lte("maaned", firstDay(til));
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const rows = useMemo(() => (q.data ?? []).map((r): Rk => {
    const l = (laasQ.data ?? []).find((x) => String(x.maaned).slice(0, 7) === r.maaned);
    if (!l) return r;
    return {
      ...r, ordning_id: l.ordning_id, db_grundlag: Number(l.db_grundlag), db_provision_pct: Number(l.db_provision_pct),
      db_bonus: Number(l.db_bonus), antal_wittenborg: Number(l.antal_wittenborg), antal_animo: Number(l.antal_animo),
      antal_rex: Number(l.antal_rex), maskinbonus: Number(l.maskinbonus),
      ny_kunde_db: l.ny_kunde_db == null ? null : Number(l.ny_kunde_db), ny_kunde_rang: l.ny_kunde_rang,
      ny_kunde_bonus: Number(l.ny_kunde_bonus), samlet_bonus: Number(l.samlet_bonus),
      laast_at: l.laast_at, maskiner: Array.isArray(l.maskiner) ? (l.maskiner as any[]) : [],
    };
  }), [q.data, laasQ.data]);
  const brugteOrdninger = useMemo(() => {
    const ids = new Set(rows.map((r) => r.ordning_id).filter(Boolean) as string[]);
    return (ordningerQ.data ?? []).filter((o) => ids.has(o.id));
  }, [rows, ordningerQ.data]);
  const [regler, setRegler] = useState<ReglerAfsnit | null>(null);
  const aabnRegler = (a: ReglerAfsnit) => setRegler(a);
  const aktuelOrdning = useMemo(() => {
    const alle = ordningerQ.data ?? [];
    const idag = new Date().toISOString().slice(0, 10);
    return alle.filter((o) => o.gyldig_fra <= idag && (!o.gyldig_til || o.gyldig_til >= idag)).at(-1) ?? alle.at(-1) ?? null;
  }, [ordningerQ.data]);
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
        netop den måned.
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
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => aabnRegler("top")}>
          <Info className="h-4 w-4 mr-2" /> Sådan beregnes din bonus
        </Button>
        <Button variant="outline" size="sm" onClick={csv}>
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
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <colgroup><col className="w-24" /><col /><col className="w-20" /><col /><col className="w-24" /><col className="w-16" /><col className="w-16" /><col /><col className="w-40" /><col /></colgroup>
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 font-medium">Måned</th>
                  <th className="text-right py-2 px-2 font-medium">DB-grundlag</th>
                  <th className="text-right py-2 px-2 font-medium">Sats</th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">DB-bonus<ReglerInfo afsnit="db" onAabn={aabnRegler} /></th>
                  <th className="text-right py-2 px-2 font-medium">Wittenborg</th>
                  <th className="text-right py-2 px-2 font-medium">Animo</th>
                  <th className="text-right py-2 px-2 font-medium">Rex</th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">Maskinbonus<ReglerInfo afsnit="maskiner" onAabn={aabnRegler} /></th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">Ny kunde<ReglerInfo afsnit="nykunde" onAabn={aabnRegler} /></th>
                  <th className="text-right py-2 pl-3 font-semibold">Bonus i alt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.maaned} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <Button
                        variant="link"
                        className={klik}
                        onClick={() => aabn(r, "db")}
                      >
                        {maanedNavn(r.maaned)}
                      </Button>
                      {r.laast_at && <LaasIkon dato={r.laast_at} />}
                      {!r.ordning_id && (
                        <span className="ml-2 text-xs text-muted-foreground">ingen ordning</span>
                      )}
                    </td>
                    <td className="text-right py-1.5 px-2"><Button variant="link" className={klik} aria-label={`DB-grundlag — ${maanedNavn(r.maaned)}`} onClick={() => aabn(r, "db")}>{fmtTal(r.db_grundlag)}</Button></td>
                    <td className="text-right py-1.5 px-2">
                      {r.ordning_id ? `${fmtTal(r.db_provision_pct, 2)} %` : "—"}
                    </td>
                    <td className="text-right py-1.5 px-2"><Button variant="link" className={klik} aria-label={`DB-bonus — ${maanedNavn(r.maaned)}`} onClick={() => aabn(r, "db")}>{fmtTal(r.db_bonus)}</Button></td>
                    {([
                      ["wittenborg", r.antal_wittenborg],
                      ["animo", r.antal_animo],
                      ["rex", r.antal_rex],
                    ] as const).map(([klasse, antal]) => (
                      <td key={klasse} className="text-right py-1.5 px-2">
                        <Button variant="link" className={klik}
                          aria-label={`${MASKIN_LABEL[klasse]} — ${maanedNavn(r.maaned)}: ${fmtTal(antal)} maskiner`}
                          onClick={() => aabn(r, "maskiner", klasse)}>
                          {fmtTal(antal)}
                        </Button>
                      </td>
                    ))}
                    <td className="text-right py-1.5 px-2">
                      <Button variant="link" className={klik}
                        aria-label={`Maskinbonus — ${maanedNavn(r.maaned)}`}
                        onClick={() => aabn(r, "maskiner")}>{fmtTal(r.maskinbonus)}</Button>
                    </td>
                    <td className="text-right py-1.5 px-2">
                      {fmtTal(r.ny_kunde_bonus)}
                      {r.ny_kunde_db != null && r.ny_kunde_rang != null && (
                        <Button variant="link" className="block h-auto w-full p-0 text-xs text-muted-foreground whitespace-normal text-right no-underline hover:underline focus-visible:underline" onClick={() => aabn(r, "rangliste")}>
                          DB nye kunder: {fmtTal(r.ny_kunde_db)} kr. · plads {r.ny_kunde_rang}
                        </Button>
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

        {!q.isLoading && !q.error && <div className="md:hidden divide-y">
          {rows.map((r) => <article key={r.maaned} className="py-4 space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><h3 className="font-medium">{maanedNavn(r.maaned)}{r.laast_at && <LaasIkon dato={r.laast_at} />}</h3><span className="font-semibold tabular-nums">{fmtTal(r.samlet_bonus)} kr.</span></div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><dt className="text-xs text-muted-foreground">DB-grundlag</dt><dd><Button variant="link" className={klik} onClick={() => aabn(r, "db")}>{fmtTal(r.db_grundlag)} kr.</Button></dd></div>
              <div><dt className="text-xs text-muted-foreground">DB-bonus · {fmtTal(r.db_provision_pct, 2)} %</dt><dd><Button variant="link" className={klik} aria-label={`DB-bonus — ${maanedNavn(r.maaned)}`} onClick={() => aabn(r, "db")}>{fmtTal(r.db_bonus)} kr.</Button></dd></div>
              <div><dt className="text-xs text-muted-foreground">Maskinbonus</dt><dd><Button variant="link" className={klik} aria-label={`Maskinbonus — ${maanedNavn(r.maaned)}`} onClick={() => aabn(r, "maskiner")}>{fmtTal(r.maskinbonus)} kr.</Button></dd></div>
              <div><dt className="text-xs text-muted-foreground">Ny kunde-bonus</dt><dd>{fmtTal(r.ny_kunde_bonus)} kr.</dd></div>
            </dl>
            <div className="grid grid-cols-3 gap-2 text-sm">{([["wittenborg", r.antal_wittenborg], ["animo", r.antal_animo], ["rex", r.antal_rex]] as const).map(([k,n]) => <Button key={k} variant="ghost" className="h-11 p-1 font-normal justify-start" aria-label={`${MASKIN_LABEL[k]} — ${maanedNavn(r.maaned)}: ${fmtTal(n)} maskiner`} onClick={() => aabn(r, "maskiner", k)}><span className="text-muted-foreground text-xs">{MASKIN_LABEL[k]}</span><span className="tabular-nums">{fmtTal(n)}</span></Button>)}</div>
            {r.ny_kunde_db != null && r.ny_kunde_rang != null && <Button variant="link" className="h-auto min-h-11 w-full p-0 justify-start whitespace-normal text-left text-xs text-muted-foreground no-underline hover:underline" onClick={() => aabn(r, "rangliste")}>DB nye kunder: {fmtTal(r.ny_kunde_db)} kr. · plads {r.ny_kunde_rang}</Button>}
            {!r.ordning_id && <p className="text-xs text-muted-foreground">Ingen bonusordning</p>}
          </article>)}
          <div className="py-4 space-y-2"><div className="flex justify-between font-semibold"><span>Total</span><span>{fmtTal(total.samlet_bonus)} kr.</span></div><dl className="grid grid-cols-2 gap-3 text-xs">{[["DB-grundlag",total.db_grundlag],["DB-bonus",total.db_bonus],["Maskinbonus",total.maskinbonus],["Ny kunde",total.ny_kunde_bonus],["Wittenborg",total.antal_wittenborg],["Animo",total.antal_animo],["Rex-Royal",total.antal_rex]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{fmtTal(Number(value))}</dd></div>)}</dl></div>
        </div>}

        {manglerOrdning.length > 0 && (
          <p className="text-xs text-muted-foreground pt-1">
            Ingen bonusordning for {manglerOrdning.map(maanedNavn).join(", ")}.
          </p>
        )}
      </Card>

      <BonusDetaljer key={`${saelgerId}-${drill?.maaned}-${drill?.visning}-${drill?.filter}`} saelgerId={saelgerId} drill={drill} onClose={() => setDrill(null)} onRegler={() => aabnRegler("maskiner")} />
      <BonusRegler open={regler !== null} afsnit={regler ?? "top"} ordning={aktuelOrdning} onOpenChange={(o) => { if (!o) setRegler(null); }} />
    </div>
  );
}

function LaasIkon({ dato }: { dato: string }) {
  const t = `Låst og udbetalt ${fmtDato(dato)}`;
  return (
    <span title={t} aria-label={t} role="img" className="ml-1.5 inline-flex align-middle text-muted-foreground">
      <Lock className="h-3.5 w-3.5" />
    </span>
  );
}
