import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ArrowUpDown, AlertTriangle, Settings2, ChevronDown, ChevronUp, Info } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/view-as-context";
import { getSellerOptions } from "@/lib/portfolio.functions";
import { dekomprimerJson } from "@/lib/komprimer-json";
import {
  hentUdstyr, hentUdstyrSatser, gemUdstyrSatser, hentUdstyrLinjer, hentLejeUdenBonusklasse,
} from "@/lib/udstyr.functions";
import {
  beregnLokationer, handlinger, maanederIPeriode, periode, TYPER, UDLAAN_LABEL, BRITA, KAFFE_TYPER, BRYG,
  harAftale, alderAar, STANDARD_SATSER, maanedNavn, erFilter, erFrellsen, prVirksomhed, varekoebAndetSted, reparationer,
  type VirkRegnskab,
  type Grundlag, type LokRegnskab, type FordeltMaskine, type GrundMaskine, type Satser,
} from "@/lib/udstyr";

const kr = (n: number) => Math.round(n).toLocaleString("da-DK");
const ALLE = "__alle__";

export const FORDELT_TEKST =
  "Maskinbelastningen (varenr. 70000) faktureres som én linje pr. lokation og er her fordelt pr. maskine: faste satser pr. måned for Brita-filterhoveder, Bravilor/Bonamat og bryggere samt andet udlån; resten efter kaffemaskinernes og vandkølernes andel af lejen (uden leje: efter antal). Filterhovedernes andel hører til service-regnskabet.";

type MaskinRaekke = { l: LokRegnskab; m: FordeltMaskine | GrundMaskine };
type Drill =
  | { slags: "maskiner"; titel: string; raekker: MaskinRaekke[] }
  | { slags: "lokationer"; titel: string; raekker: LokRegnskab[]; visFornyelse?: boolean };

function Tal({ v, rød = true, onClick }: { v: number; rød?: boolean; onClick?: () => void }) {
  const cls = `tabular-nums ${rød && v < 0 ? "text-destructive" : ""}`;
  if (!onClick) return <span className={cls}>{kr(v)}</span>;
  return (
    <button type="button" onClick={onClick} className={`${cls} underline decoration-dotted underline-offset-2 hover:text-primary`}>
      {kr(v)}
    </button>
  );
}

export function MaskinerService() {
  const auth = useAuth();
  const viewAs = useViewAs();
  const adminReelt = auth.role === "admin";
  const erAdmin = adminReelt && !viewAs.isImpersonating;
  const [valgtSaelger, setValgtSaelger] = useState<string>(ALLE);
  const [periodeValg, setPeriodeValg] = useState("12m");
  const p = useMemo(() => periode(periodeValg), [periodeValg]);
  const maaneder = maanederIPeriode(p.fra, p.til);

  const sellerFn = useServerFn(getSellerOptions);
  const sellers = useQuery({ queryKey: ["udstyr-saelgere"], queryFn: () => sellerFn(), enabled: erAdmin });

  const sellerId = erAdmin ? (valgtSaelger === ALLE ? null : valgtSaelger) : viewAs.effectiveUserId;
  const alle = erAdmin && valgtSaelger === ALLE;

  const hentFn = useServerFn(hentUdstyr);
  const satserFn = useServerFn(hentUdstyrSatser);
  const satserQ = useQuery({ queryKey: ["udstyr-satser"], queryFn: () => satserFn() });
  const q = useQuery({
    queryKey: ["udstyr", sellerId, alle, p.fra, p.til],
    queryFn: async () => dekomprimerJson<Grundlag>(await hentFn({ data: { sellerId, alle, fra: p.fra, til: p.til } })),
    enabled: !!sellerId || alle,
  });
  const satser = satserQ.data ?? STANDARD_SATSER;
  const lok = useMemo(() => (q.data ? beregnLokationer(q.data, maaneder, satser) : []), [q.data, maaneder, satser]);
  const [drill, setDrill] = useState<Drill | null>(null);

  const aar = new Date().getFullYear();

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-[1600px] space-y-5 p-4 pb-28 md:p-6 md:pb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Maskiner & Service</h1>
            <p className="text-sm text-muted-foreground">
              Frellsen-udstyr på {alle ? "alle lokationer" : "lokationerne"} · {p.label} ({p.fra.slice(0, 7)} – {p.til.slice(0, 7)})
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {erAdmin && (
              <Select value={valgtSaelger} onValueChange={setValgtSaelger}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALLE}>Hele Frellsen</SelectItem>
                  {(sellers.data?.sellerOptions ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={periodeValg} onValueChange={setPeriodeValg}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="12m">Seneste 12 hele måneder</SelectItem>
                <SelectItem value="aatd">År til dato {aar}</SelectItem>
                {[aar - 1, aar - 2].map((y) => <SelectItem key={y} value={String(y)}>Kalenderår {y}</SelectItem>)}
              </SelectContent>
            </Select>
            {erAdmin && <SatserKnap satser={satser} />}
          </div>
        </div>

        {q.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Henter udstyr …</div>}
        {q.isError && (
          <Card className="p-4 text-sm text-destructive">Kunne ikke hente data. <Button size="sm" variant="outline" onClick={() => q.refetch()}>Prøv igen</Button></Card>
        )}
        {q.data && (
          <>
            <Handlingsliste lok={lok} satser={satser} erAdmin={erAdmin} setDrill={setDrill} />
            <Noegletal lok={lok} setDrill={setDrill} />
            <Maskinoversigt lok={lok} setDrill={setDrill} />
            <Serviceaftaler lok={lok} setDrill={setDrill} />
            <Lokationsregnskab lok={lok} maaneder={maaneder} setDrill={setDrill} />
            <p className="text-xs text-muted-foreground"><Badge variant="outline" className="mr-1">fordelt</Badge>{FORDELT_TEKST}</p>
            {erAdmin && <LejeUdenBonusklasse />}
          </>
        )}
        {drill && <DrillDialog drill={drill} onClose={() => setDrill(null)} erAdmin={erAdmin} fra={p.fra} til={p.til} />}
      </div>
    </TooltipProvider>
  );
}

function Handlingsliste({ lok, satser, erAdmin, setDrill }: { lok: LokRegnskab[]; satser: Satser; erAdmin: boolean; setDrill: (d: Drill) => void }) {
  const h = useMemo(() => handlinger(lok, satser), [lok, satser]);
  const punkter: { label: string; hjaelp: string; antal: number; aaben: () => void }[] = [
    { label: "Udlån uden dækning", hjaelp: "Varer-DB dækker ikke belastning + service. Hent hjem, omlæg til leje eller lav kaffeaftale.", antal: h.udlaan.length,
      aaben: () => setDrill({ slags: "lokationer", titel: "Udlån uden dækning", raekker: [...h.udlaan].sort((a, b) => a.dbInkl - b.dbInkl) }) },
    { label: "Udskiftningskandidater", hjaelp: `Reparationer (reservedele + montør, kostpris) over ${kr(satser.udskiftReparation)} kr. på lokationen i perioden, eller over ${satser.udskiftAlderAar} år og reparationer over ${kr(satser.udskiftReparationAeldre)} kr. Højeste reparationsomkostning først. Opgradering efter 24 mdr. kan give maskinbonus.`, antal: h.udskift.length,
      aaben: () => setDrill({ slags: "maskiner", titel: "Udskiftningskandidater", raekker: h.udskift }) },
    { label: "Kundeejede uden serviceaftale", hjaelp: "Mersalg: tilbyd serviceaftale.", antal: h.kundeejet.length,
      aaben: () => setDrill({ slags: "maskiner", titel: "Kundeejede maskiner uden serviceaftale", raekker: h.kundeejet }) },
    { label: "Serviceaftaler i underskud", hjaelp: "Service netto er negativ. Se fornyelsesmåned.", antal: h.underskud.length,
      aaben: () => setDrill({ slags: "lokationer", titel: "Serviceaftaler i underskud", raekker: [...h.underskud].sort((a, b) => a.serviceNetto - b.serviceNetto), visFornyelse: true }) },
    { label: "Leje uden lejefakturering", hjaelp: "Leje/leasing-udstyr, hvor lokationen ikke er faktureret leje i perioden.", antal: h.udenLeje.length,
      aaben: () => setDrill({ slags: "maskiner", titel: "Leje/leasing uden lejefakturering", raekker: h.udenLeje }) },
    ...(erAdmin ? [{ label: "Belastning uden udstyr", hjaelp: "Maskinbelastning på lokationer uden aktivt Frellsen-udstyr i maskinregistret (ufordelt).", antal: h.ufordelt.length,
      aaben: () => setDrill({ slags: "lokationer", titel: "Belastning uden registreret udstyr", raekker: [...h.ufordelt].sort((a, b) => b.ufordelt - a.ufordelt) }) }] : []),
  ];
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Hvor skal jeg handle?</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {punkter.map((x) => (
          <button key={x.label} type="button" onClick={x.aaben} disabled={!x.antal}
            className="min-h-[72px] rounded-lg border bg-card p-3 text-left transition hover:border-primary disabled:opacity-50">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {x.antal > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}{x.label}
              <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent className="max-w-xs">{x.hjaelp}</TooltipContent></Tooltip>
            </div>
            <div className="text-2xl font-semibold tabular-nums">{x.antal}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function Noegletal({ lok, setDrill }: { lok: LokRegnskab[]; setDrill: (d: Drill) => void }) {
  const fr = lok.flatMap((l) => l.maskiner.filter((m) => !erFilter(m)).map((m) => ({ l, m })));
  const lejeNetto = lok.reduce((a, l) => a + l.lejeNetto, 0);
  const aftaler = lok.reduce((a, l) => a + l.antalAftaler, 0);
  const lokMedAftale = lok.filter((l) => l.antalAftaler > 0);
  const serviceNetto = lok.reduce((a, l) => a + l.serviceNetto, 0);
  const medUdstyr = lok.filter((l) => l.maskiner.length > 0);
  const underskud = medUdstyr.filter((l) => l.dbInkl < 0);
  const kort: { label: string; v: ReactNode; aaben: () => void }[] = [
    { label: "Frellsen-maskiner", v: kr(fr.length), aaben: () => setDrill({ slags: "maskiner", titel: "Frellsen-maskiner", raekker: fr }) },
    { label: "Leje netto", v: <Tal v={lejeNetto} />, aaben: () => setDrill({ slags: "lokationer", titel: "Leje netto pr. lokation", raekker: [...medUdstyr].sort((a, b) => a.lejeNetto - b.lejeNetto) }) },
    { label: "Aktive serviceaftaler", v: <span>{kr(aftaler)} <span className="text-xs font-normal text-muted-foreground">maskiner · {kr(lokMedAftale.length)} lok.</span></span>, aaben: () => setDrill({ slags: "maskiner", titel: "Maskiner med aktiv serviceaftale", raekker: lok.flatMap((l) => [...l.maskiner, ...l.kundeejede].filter((m) => harAftale(m) && !erFilter(m)).map((m) => ({ l, m }))) }) },
    { label: "Service netto (inkl. filtre)", v: <Tal v={serviceNetto} />, aaben: () => setDrill({ slags: "lokationer", titel: "Service netto pr. lokation", raekker: lok.filter((l) => l.antalAftaler > 0 || l.si !== 0).sort((a, b) => a.serviceNetto - b.serviceNetto), visFornyelse: true }) },
    { label: "Lokationer i underskud", v: kr(underskud.length), aaben: () => setDrill({ slags: "lokationer", titel: "Lokationer i underskud", raekker: [...underskud].sort((a, b) => a.dbInkl - b.dbInkl) }) },
  ];
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {kort.map((k) => (
        <button key={k.label} type="button" onClick={k.aaben} className="rounded-lg border bg-card p-3 text-left hover:border-primary">
          <div className="text-xs text-muted-foreground">{k.label}</div>
          <div className="text-xl font-semibold tabular-nums">{k.v}</div>
        </button>
      ))}
    </section>
  );
}

function Maskinoversigt({ lok, setDrill }: { lok: LokRegnskab[]; setDrill: (d: Drill) => void }) {
  const raekker = TYPER.filter((t) => t !== BRITA).map((t) => {
    const ms = lok.flatMap((l) => l.maskiner.filter((m) => m.t === t && !erFilter(m)).map((m) => ({ l, m })));
    const ind = lok.reduce((a, l) => a + (l.lt[t] ?? 0), 0);
    const ud = ms.reduce((a, x) => a + x.m.belastning, 0);
    const grp = (f: (u: number) => boolean) => ms.filter((x) => f(x.m.u));
    return { t, ms, ind, ud, leje: grp((u) => u === 3), ub: grp((u) => u === 5), udl: grp((u) => u === 4), oev: grp((u) => u >= 6) };
  }).filter((r) => r.ms.length || r.ind);
  const ufordelt = lok.reduce((a, l) => a + l.ufordelt, 0);
  const tot = raekker.reduce((a, r) => ({
    n: a.n + r.ms.length, l: a.l + r.leje.length, ub: a.ub + r.ub.length, u: a.u + r.udl.length, o: a.o + r.oev.length, ind: a.ind + r.ind, ud: a.ud + r.ud,
  }), { n: 0, l: 0, ub: 0, u: 0, o: 0, ind: 0, ud: 0 });
  const åbn = (titel: string, ms: MaskinRaekke[]) => () => setDrill({ slags: "maskiner", titel, raekker: ms });
  const N = ({ ms, titel }: { ms: MaskinRaekke[]; titel: string }) =>
    ms.length ? <button type="button" className="tabular-nums underline decoration-dotted underline-offset-2 hover:text-primary" onClick={åbn(titel, ms)}>{kr(ms.length)}</button> : <span className="text-muted-foreground">–</span>;
  const kundeejede = lok.flatMap((l) => l.kundeejede.filter((m) => !erFilter(m)).map((m) => ({ l, m })));

  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">Maskinoversigt</h2>
      {/* Desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b text-right">
              <th className="py-2 text-left">Maskintype</th><th>Antal i alt</th><th>Leje/leasing</th><th>Leje u/b</th><th>Udlån</th><th>Øvrige</th>
              <th>Indtægt (leje)</th><th>Udgift (belastning, <span className="italic">fordelt</span>)</th><th>Netto</th>
            </tr>
          </thead>
          <tbody>
            {raekker.map((r) => (
              <tr key={r.t} className="border-b text-right">
                <td className="py-2 text-left">{r.t}</td>
                <td><N ms={r.ms} titel={`${r.t} – alle`} /></td><td><N ms={r.leje} titel={`${r.t} – leje/leasing`} /></td>
                <td><N ms={r.ub} titel={`${r.t} – leje u/b`} /></td><td><N ms={r.udl} titel={`${r.t} – udlån`} /></td><td><N ms={r.oev} titel={`${r.t} – øvrige`} /></td>
                <td><Tal v={r.ind} onClick={åbn(`${r.t} – leje`, r.ms)} /></td>
                <td><Tal v={-r.ud} onClick={åbn(`${r.t} – belastning`, r.ms)} /></td>
                <td className="font-medium"><Tal v={r.ind - r.ud} onClick={åbn(`${r.t} – netto`, r.ms)} /></td>
              </tr>
            ))}
            <tr className="text-right font-semibold">
              <td className="py-2 text-left">Total</td><td className="tabular-nums">{kr(tot.n)}</td><td className="tabular-nums">{kr(tot.l)}</td><td className="tabular-nums">{kr(tot.ub)}</td>
              <td className="tabular-nums">{kr(tot.u)}</td><td className="tabular-nums">{kr(tot.o)}</td><td><Tal v={tot.ind} /></td><td><Tal v={-tot.ud} /></td><td><Tal v={tot.ind - tot.ud} /></td>
            </tr>
            {ufordelt > 0 && (
              <tr className="border-t text-right text-muted-foreground">
                <td className="py-2 text-left">Ufordelt (intet registreret udstyr)</td><td colSpan={6} /><td><Tal v={-ufordelt} /></td><td><Tal v={-ufordelt} /></td>
              </tr>
            )}

          </tbody>
        </table>
      </div>
      {/* Mobil */}
      <div className="space-y-2 md:hidden">
        {raekker.map((r) => (
          <button key={r.t} type="button" onClick={åbn(r.t, r.ms)} className="w-full rounded-md border p-3 text-left">
            <div className="flex justify-between font-medium"><span>{r.t}</span><span className="tabular-nums">{kr(r.ms.length)} stk.</span></div>
            <div className="mt-1 grid grid-cols-3 gap-1 text-xs text-muted-foreground">
              <span>Leje {kr(r.leje.length)}</span><span>u/b {kr(r.ub.length)}</span><span>Udlån {kr(r.udl.length)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm"><span>Indtægt {kr(r.ind)}</span><span>Netto <Tal v={r.ind - r.ud} /></span></div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Total = nøgletallet "Leje netto". Brita-filtre og andre filterhoveder indgår ikke her – de hører til service-regnskabet.</p>
      {kundeejede.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Kundeejede maskiner (vises separat):{" "}
          <button type="button" className="underline decoration-dotted" onClick={åbn("Kundeejede maskiner", kundeejede)}>{kr(kundeejede.length)} stk.</button>
        </p>
      )}
    </Card>
  );
}

function Serviceaftaler({ lok, setDrill }: { lok: LokRegnskab[]; setDrill: (d: Drill) => void }) {
  const medAft = lok.flatMap((l) => [...l.maskiner, ...l.kundeejede].filter(harAftale).map((m) => ({ l, m })));
  const alle = medAft.filter((x) => !erFilter(x.m));
  const filtre = medAft.filter((x) => erFilter(x.m));
  const kol: [string, (u: number) => boolean][] = [["Frellsen-ejet med aftale", erFrellsen], ["Kundeejet med aftale", (u) => !erFrellsen(u)]];
  const mtyper = TYPER.filter((t) => alle.some((x) => x.m.t === t));
  const fl = lok.reduce((a, l) => a + l.filterLeje, 0);
  const s = lok.reduce((a, l) => ({ si: a.si + l.si, mo: a.mo + l.mo, rd: a.rd + l.rd, pa: a.pa + l.pa, fh: a.fh + l.filterBel, ak: a.ak + l.ak, n: a.n + l.serviceNetto }),
    { si: 0, mo: 0, rd: 0, pa: 0, fh: 0, ak: 0, n: 0 });
  const medAftale = lok.filter((l) => l.antalAftaler > 0);
  const udenKoeb = medAftale.filter((l) => l.vmd === 0);
  const lokListe = (titel: string, r: LokRegnskab[]) => () =>
    setDrill({ slags: "lokationer", titel, raekker: [...r].sort((a, b) => a.serviceNetto - b.serviceNetto), visFornyelse: true });
  const linjer: [string, number][] = [
    ["Indtægt (aftaler, 16/82)", s.si], ["Montør/kørsel netto", s.mo], ["Reservedele netto", s.rd], ["Brita-patroner netto", s.pa], ["Filterhoveder (leje)", fl],
    ["Filterhoveder (fordelt)", -s.fh], ["Kostpris aftalelinjer", -s.ak],
  ];
  return (
    <Card className="p-4">
      <h2 className="font-semibold">Serviceaftaler</h2>
      <p className="mb-3 text-xs text-muted-foreground">Fra Vismas serviceregister: {kr(alle.length)} maskiner med aktiv aftale (Frellsen-ejede og kundeejede) på {kr(medAftale.length)} lokationer, plus {kr(filtre.length)} filteraftaler. Fornyelsesmåned = måneden med den årlige aftalefakturering.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="border-b text-right"><th className="py-2 text-left">Maskintype</th>{kol.map(([t]) => <th key={t}>{t}</th>)}<th>I alt</th></tr></thead>
            <tbody>
              {mtyper.map((mt) => {
                const r = alle.filter((x) => x.m.t === mt);
                return (
                  <tr key={mt} className="border-b text-right">
                    <td className="py-1.5 text-left">{mt}</td>
                    {kol.map(([t, f]) => {
                      const c = r.filter((x) => f(x.m.u));
                      return <td key={t}>{c.length ? <button type="button" className="tabular-nums underline decoration-dotted" onClick={() => setDrill({ slags: "maskiner", titel: `${mt} – ${t}`, raekker: c })}>{c.length}</button> : "–"}</td>;
                    })}
                    <td className="tabular-nums font-medium">{r.length}</td>
                  </tr>
                );
              })}
              <tr className="border-b text-right font-semibold">
                <td className="py-1.5 text-left">I alt</td>
                {kol.map(([t, f]) => <td key={t} className="tabular-nums">{kr(alle.filter((x) => f(x.m.u)).length)}</td>)}
                <td className="tabular-nums">{kr(alle.length)}</td>
              </tr>
              <tr className="text-right text-muted-foreground">
                <td className="py-1.5 text-left">Filteraftaler</td><td colSpan={2} />
                <td>{filtre.length ? <button type="button" className="tabular-nums underline decoration-dotted" onClick={() => setDrill({ slags: "maskiner", titel: "Filteraftaler", raekker: filtre })}>{kr(filtre.length)}</button> : "–"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <table className="w-full text-sm">
            <tbody>
              {linjer.map(([l, v]) => (
                <tr key={l} className="border-b"><td className="py-1.5">{l}</td><td className="text-right"><Tal v={v} onClick={lokListe(l, medAftale)} /></td></tr>
              ))}
              <tr className="font-semibold"><td className="py-1.5">Service netto</td><td className="text-right"><Tal v={s.n} onClick={lokListe("Service netto", medAftale)} /></td></tr>
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Button size="sm" variant="outline" onClick={lokListe("Aftaler pr. lokation – største underskud øverst", medAftale)}>Aftaler pr. lokation ({medAftale.length})</Button>
            <Button size="sm" variant="outline" disabled={!udenKoeb.length} onClick={lokListe("Serviceaftale uden varekøb i perioden", udenKoeb)}>Uden varekøb ({udenKoeb.length})</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Lokationsregnskab({ lok, maaneder, setDrill }: { lok: LokRegnskab[]; maaneder: number; setDrill: (d: Drill) => void }) {
  const [vis, setVis] = useState(25);
  const [aabne, setAabne] = useState<Set<string>>(new Set());
  const virk = useMemo(() => prVirksomhed(lok).filter((v) => v.lok.some((l) => l.maskiner.length > 0)).sort((a, b) => a.dbInkl - b.dbInkl), [lok]);
  const alleLok = useMemo(() => lok.filter((l) => l.maskiner.length > 0).sort((a, b) => a.dbInkl - b.dbInkl), [lok]);
  const skift = (cid: string) => setAabne((s) => { const n = new Set(s); if (n.has(cid)) n.delete(cid); else n.add(cid); return n; });
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">Giver det mening? – regnskab pr. virksomhed</h2>
        <Button size="sm" variant="ghost" onClick={() => setDrill({ slags: "lokationer", titel: "Lokationsregnskab", raekker: alleLok })}>Alle lokationer ({alleLok.length})</Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Sum af virksomhedens lokationer: Varer-DB + Leje + Service − Belastning − Serviceudgifter = DB inkl. udstyr. Dårligst først. Klik for lokationerne.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-xs text-muted-foreground"><tr className="border-b text-right">
            <th className="py-2 text-left">Virksomhed / lokation</th><th>Maskiner</th><th>Varer-DB</th><th>Leje</th><th>Service netto</th><th>Belastning</th><th>DB inkl. udstyr</th>
          </tr></thead>
          <tbody>
            {virk.slice(0, vis).map((v) => {
              const aaben = aabne.has(v.cid);
              return (
                <VirkRaekker key={v.cid} v={v} aaben={aaben} onSkift={() => skift(v.cid)} maaneder={maaneder} />
              );
            })}
          </tbody>
        </table>
      </div>
      {vis < virk.length && <Button className="mt-2" size="sm" variant="outline" onClick={() => setVis(vis + 50)}>Vis flere ({virk.length - vis})</Button>}
    </Card>
  );
}

function VirkRaekker({ v, aaben, onSkift }: { v: VirkRegnskab; aaben: boolean; onSkift: () => void; maaneder: number }) {
  const T = ({ x }: { x: number }) => <td className="text-right"><Tal v={x} /></td>;
  return (
    <>
      <tr className={`border-b ${v.dbInkl < 0 ? "bg-destructive/5" : ""}`}>
        <td className="py-1.5">
          <button type="button" onClick={onSkift} className="inline-flex items-center gap-1 text-left" aria-expanded={aaben}>
            {aaben ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span className="font-medium">{v.kunde}</span>
            <span className="text-xs text-muted-foreground">· {v.lok.length} lok.</span>
          </button>
          <Link to="/virksomheder/$id" params={{ id: v.cid }} className="ml-2 text-xs text-muted-foreground hover:underline">Åbn</Link>
        </td>
        <td className="text-right tabular-nums">{v.antalMaskiner}</td>
        <T x={v.vdb} /><T x={v.leje} /><T x={v.serviceNetto} /><T x={-v.belastningIalt} />
        <td className="text-right font-medium"><Tal v={v.dbInkl} /></td>
      </tr>
      {aaben && v.lok.map((l) => (
        <tr key={l.lev} className="border-b bg-muted/30 text-xs">
          <td className="py-1 pl-6">{l.adr} · {l.lev}
            {varekoebAndetSted(l, v) && <Badge variant="outline" className="ml-2 text-[10px]">varekøb på anden lokation</Badge>}</td>
          <td className="text-right tabular-nums">{l.maskiner.filter((m) => !erFilter(m)).length}</td>
          <T x={l.vdb} /><T x={l.leje} /><T x={l.serviceNetto} /><T x={-l.belastningIalt} /><T x={l.dbInkl} />
        </tr>
      ))}
    </>
  );
}

function udlaanDaekning(l: LokRegnskab, maaneder: number) {
  const udl = l.maskiner.filter((m) => [4, 5, 6, 7].includes(m.u) && !erFilter(m));
  if (!udl.length) return null;
  const kaffeDb = l.vdb / udl.length / maaneder;
  const omk = udl.reduce((a, m) => a + m.belastning, 0) / udl.length / maaneder;
  return { kaffeDb, omk, pct: omk > 0 ? kaffeDb / omk : null };
}

function LokTabel({ raekker, maaneder, visFornyelse, onLinjer }: { raekker: LokRegnskab[]; maaneder: number; visFornyelse?: boolean; onLinjer?: (l: LokRegnskab) => void }) {
  type K = "kunde" | "vdb" | "leje" | "serviceNetto" | "belastningIalt" | "dbInkl";
  const [sort, setSort] = useState<{ k: K; asc: boolean } | null>(null);
  const rows = useMemo(() => {
    if (!sort) return raekker;
    return [...raekker].sort((a, b) => {
      const x = a[sort.k], y = b[sort.k];
      const c = typeof x === "string" ? x.localeCompare(y as string, "da") : (x as number) - (y as number);
      return sort.asc ? c : -c;
    });
  }, [raekker, sort]);
  const H = ({ k, children, left }: { k: K; children: ReactNode; left?: boolean }) => (
    <th className={left ? "py-2 text-left" : "text-right"}>
      <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort({ k, asc: sort?.k === k ? !sort.asc : true })}>{children}<ArrowUpDown className="h-3 w-3" /></button>
    </th>
  );
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr className="border-b">
            <H k="kunde" left>Kunde / lokation</H><th className="text-right">Udstyr</th><H k="vdb">Varer-DB</H><H k="leje">Leje</H><H k="serviceNetto">Service netto</H>
            <H k="belastningIalt">Belastning</H><H k="dbInkl">DB inkl. udstyr</H><th className="text-right">Dækning udlån</th>
            {visFornyelse && <th className="text-right">Fornyelse</th>}{onLinjer && <th />}
          </tr></thead>
          <tbody>
            {rows.map((l) => {
              const d = udlaanDaekning(l, maaneder);
              return (
                <tr key={l.lev} className={`border-b ${l.dbInkl < 0 ? "bg-destructive/5" : ""}`}>
                  <td className="py-1.5"><Link to="/virksomheder/$id" params={{ id: l.cid }} className="font-medium hover:underline">{l.kunde}</Link>
                    <div className="text-xs text-muted-foreground">{l.adr} · {l.lev}</div></td>
                  <td className="text-right tabular-nums">{l.maskiner.length}</td>
                  <td className="text-right"><Tal v={l.vdb} /></td><td className="text-right"><Tal v={l.leje} /></td>
                  <td className="text-right"><Tal v={l.serviceNetto} /></td><td className="text-right"><Tal v={-l.belastningIalt} /></td>
                  <td className="text-right font-medium"><Tal v={l.dbInkl} /></td>
                  <td className="text-right text-xs tabular-nums">{d ? <span title={`Kaffe-DB ${kr(d.kaffeDb)} kr./md. pr. maskine mod omkostning ${kr(d.omk)} kr./md.`} className={d.pct != null && d.pct < 1 ? "text-destructive" : ""}>{d.pct != null ? `${Math.round(d.pct * 100)} %` : "–"}</span> : "–"}</td>
                  {visFornyelse && <td className="text-right text-xs">{maanedNavn(l.fornyelse)}</td>}
                  {onLinjer && <td className="text-right"><Button size="sm" variant="ghost" onClick={() => onLinjer(l)}>Linjer</Button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {rows.map((l) => (
          <div key={l.lev} className={`rounded-md border p-3 ${l.dbInkl < 0 ? "border-destructive/40" : ""}`}>
            <Link to="/virksomheder/$id" params={{ id: l.cid }} className="font-medium">{l.kunde}</Link>
            <div className="text-xs text-muted-foreground">{l.adr}</div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 text-sm">
              <span>Varer-DB</span><span className="text-right"><Tal v={l.vdb} /></span>
              <span>Leje</span><span className="text-right"><Tal v={l.leje} /></span>
              <span>Service netto</span><span className="text-right"><Tal v={l.serviceNetto} /></span>
              <span>Belastning</span><span className="text-right"><Tal v={-l.belastningIalt} /></span>
              <span className="font-medium">DB inkl. udstyr</span><span className="text-right font-medium"><Tal v={l.dbInkl} /></span>
              {visFornyelse && <><span>Fornyelse</span><span className="text-right">{maanedNavn(l.fornyelse)}</span></>}
            </div>
            {onLinjer && <Button className="mt-2" size="sm" variant="outline" onClick={() => onLinjer(l)}>Linjer</Button>}
          </div>
        ))}
      </div>
    </>
  );
}

function MaskinTabel({ raekker, sorterRep }: { raekker: MaskinRaekke[]; sorterRep?: boolean }) {
  type K = "kunde" | "sn" | "model" | "udl" | "opsat" | "taeller" | "leje" | "bel" | "vdb" | "rep";
  const [sort, setSort] = useState<{ k: K; asc: boolean }>(sorterRep ? { k: "rep", asc: false } : { k: "kunde", asc: true });
  const [søg, setSøg] = useState("");
  const val = (x: MaskinRaekke, k: K): string | number => {
    const m = x.m as FordeltMaskine;
    switch (k) {
      case "kunde": return x.l.kunde; case "sn": return m.sn ?? ""; case "model": return m.b ?? ""; case "udl": return m.u;
      case "opsat": return m.o ?? ""; case "taeller": return m.tl ?? 0; case "leje": return m.leje ?? 0; case "bel": return m.belastning ?? 0; case "vdb": return x.l.vdb; case "rep": return reparationer(x.l);
    }
  };
  const rows = useMemo(() => {
    const s = søg.trim().toLowerCase();
    const f = s ? raekker.filter((x) => `${x.l.kunde} ${x.l.adr} ${x.m.sn} ${x.m.b}`.toLowerCase().includes(s)) : raekker;
    return [...f].sort((a, b) => {
      const x = val(a, sort.k), y = val(b, sort.k);
      const c = typeof x === "string" ? x.localeCompare(y as string, "da") : (x as number) - (y as number);
      return sort.asc ? c : -c;
    }).slice(0, 1000);
  }, [raekker, sort, søg]);
  const H = ({ k, children }: { k: K; children: ReactNode }) => (
    <th className="px-1 text-left"><button type="button" className="inline-flex items-center gap-1" onClick={() => setSort({ k, asc: sort.k === k ? !sort.asc : true })}>{children}<ArrowUpDown className="h-3 w-3" /></button></th>
  );
  return (
    <div className="space-y-2">
      <Input placeholder="Søg kunde, adresse, serienr., model" value={søg} onChange={(e) => setSøg(e.target.value)} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="text-xs text-muted-foreground"><tr className="border-b">
            <H k="kunde">Kunde / lokation</H><H k="sn">Serienr.</H><H k="model">Model</H><H k="udl">Udlånstype</H><H k="opsat">Opsat</H>
            <H k="taeller">Tæller</H><H k="leje">Leje</H><H k="bel">Belastning (fordelt)</H><H k="vdb">Kaffe-DB (lokation)</H><H k="rep">Reparationer (lok.)</H><th className="px-1 text-left">Dækning</th>
          </tr></thead>
          <tbody>
            {rows.map((x) => {
              const m = x.m as FordeltMaskine;
              const omk = x.l.belastningIalt + x.l.serviceUdgift - x.l.si - x.l.leje;
              return (
                <tr key={m.id} className="border-b align-top">
                  <td className="px-1 py-1.5"><Link to="/virksomheder/$id" params={{ id: x.l.cid }} className="font-medium hover:underline">{x.l.kunde}</Link><div className="text-xs text-muted-foreground">{x.l.adr}</div></td>
                  <td className="px-1 font-mono text-xs">{m.sn}</td><td className="px-1">{m.b}</td><td className="px-1 text-xs">{UDLAAN_LABEL[m.u] ?? m.u}</td>
                  <td className="px-1 text-xs">{m.o ?? "–"}{m.o && <span className="text-muted-foreground"> ({(alderAar(m.o) ?? 0).toFixed(1)} år)</span>}</td>
                  <td className="px-1 tabular-nums">{m.tl != null ? kr(m.tl) : "–"}</td>
                  <td className="px-1 tabular-nums">{m.leje != null ? kr(m.leje) : "–"}</td>
                  <td className="px-1 tabular-nums">{m.belastning != null ? <>{kr(-m.belastning)} <span className="text-[10px] text-muted-foreground">fordelt</span></> : "–"}</td>
                  <td className="px-1 tabular-nums">{kr(x.l.vdb)}</td>
                  <td className="px-1 text-xs tabular-nums">{omk > 0 ? `${Math.round((x.l.vdb / omk) * 100)} %` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {raekker.length > 1000 && <p className="text-xs text-muted-foreground">Viser de første 1.000 af {kr(raekker.length)}. Brug søgning for at indsnævre.</p>}
    </div>
  );
}

function DrillDialog({ drill, onClose, erAdmin, fra, til }: { drill: Drill; onClose: () => void; erAdmin: boolean; fra: string; til: string }) {
  const [linjeLok, setLinjeLok] = useState<LokRegnskab | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{drill.titel}</DialogTitle>
          <DialogDescription>{drill.raekker.length} {drill.slags === "maskiner" ? "maskiner" : "lokationer"} · {fra.slice(0, 7)} – {til.slice(0, 7)}</DialogDescription>
        </DialogHeader>
        {drill.slags === "maskiner"
          ? <MaskinTabel raekker={drill.raekker} />
          : <LokTabel raekker={drill.raekker} maaneder={maanederIPeriode(fra, til)} visFornyelse={drill.visFornyelse} onLinjer={erAdmin ? setLinjeLok : undefined} />}
        {linjeLok && <LinjeDialog lok={linjeLok} fra={fra} til={til} onClose={() => setLinjeLok(null)} />}
      </DialogContent>
    </Dialog>
  );
}

function LinjeDialog({ lok, fra, til, onClose }: { lok: LokRegnskab; fra: string; til: string; onClose: () => void }) {
  const fn = useServerFn(hentUdstyrLinjer);
  const q = useQuery({ queryKey: ["udstyr-linjer", lok.lev, fra, til], queryFn: () => fn({ data: { lev: lok.lev, fra, til } }) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>Fakturalinjer – {lok.kunde}</DialogTitle><DialogDescription>Kun admin · udstyr, service og belastning</DialogDescription></DialogHeader>
        {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr className="border-b text-right"><th className="text-left">Måned</th><th className="text-left">Vare</th><th className="text-left">Vg</th><th>Antal</th><th>Beløb</th><th>Kostpris</th><th>DB</th></tr></thead>
            <tbody>{(q.data ?? []).map((r, i) => (
              <tr key={i} className="border-b text-right"><td className="text-left">{r.period.slice(0, 7)}</td><td className="text-left">{r.varenr} {r.varetekst}</td><td className="text-left">{r.varegruppe}</td>
                <td>{r.antal}</td><td>{kr(r.beloeb)}</td><td>{kr(r.kostpris)}</td><td><Tal v={r.db} /></td></tr>
            ))}</tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SatserKnap({ satser }: { satser: Satser }) {
  const [aaben, setAaben] = useState(false);
  const [v, setV] = useState<Satser>(satser);
  const fn = useServerFn(gemUdstyrSatser);
  const felter: [keyof Satser, string][] = [
    ["brita", "Brita-filterhoved, kr./md."], ["bryg", "Bravilor/Bonamat og bryggere, kr./md."], ["andetUdlaan", "Andet udlån, kr./md."],
    ["udskiftReparation", "Udskiftning: reparationer over (kr.)"], ["udskiftAlderAar", "… eller alder over (år)"],
    ["udskiftReparationAeldre", "… og reparationer over (kr.)"],
  ];
  const taellerTyper = ["Wittenborg", "Rex-Royal", "Animo", "Espresso", "Vandkøler", "Bravilor/Bonamat og bryggere"];
  return (
    <>
      <Button variant="outline" onClick={() => { setV(satser); setAaben(true); }}><Settings2 className="mr-1 h-4 w-4" />Satser</Button>
      <Dialog open={aaben} onOpenChange={setAaben}>
        <DialogContent>
          <DialogHeader><DialogTitle>Satser for fordeling</DialogTitle><DialogDescription>Bruges til at fordele maskinbelastningen og finde udskiftningskandidater.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            {felter.map(([k, l]) => (
              <label key={k} className="flex items-center justify-between gap-3 text-sm">{l}
                <Input className="w-32 text-right" type="number" value={v[k] as number} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} /></label>
            ))}
            <p className="pt-2 text-xs font-medium">Tællergrænse pr. maskintype (tom = bruges ikke)</p>
            {taellerTyper.map((t) => (
              <label key={t} className="flex items-center justify-between gap-3 text-sm">{t}
                <Input className="w-32 text-right" type="number" placeholder="–" value={v.taellerPrType[t] ?? ""}
                  onChange={(e) => setV({ ...v, taellerPrType: { ...v.taellerPrType, [t]: Number(e.target.value) || 0 } })} /></label>
            ))}
          </div>
          <Button onClick={async () => {
            try { await fn({ data: v }); toast.success("Satser gemt"); setAaben(false); location.reload(); } catch (e) { toast.error(e instanceof Error ? e.message : "Fejl"); }
          }}>Gem</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LejeUdenBonusklasse() {
  const [aaben, setAaben] = useState(false);
  const fn = useServerFn(hentLejeUdenBonusklasse);
  const q = useQuery({ queryKey: ["leje-uden-bonusklasse"], queryFn: () => fn(), enabled: aaben });
  return (
    <Card className="p-4">
      <button type="button" className="flex w-full items-center justify-between font-semibold" onClick={() => setAaben(!aaben)}>
        Leje-varenumre uden bonusklasse (kun admin){aaben ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {aaben && (
        <div className="mt-3 overflow-x-auto">
          <p className="mb-2 text-xs text-muted-foreground">Klassificeres efter varenavn, indtil de får en bonusklasse i tilbudskataloget.</p>
          {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="text-left">Varenr.</th><th className="text-left">Varetekst</th><th className="text-left">Klassificeret som</th><th className="text-right">Leje 12 mdr.</th></tr></thead>
              <tbody>{(q.data ?? []).map((r) => (
                <tr key={r.varenr} className="border-b"><td className="font-mono text-xs">{r.varenr}</td><td>{r.varetekst}</td><td>{r.maskintype}</td><td className="text-right tabular-nums">{kr(r.beloeb_12m)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}

/** Lille boks på kundekortet: 12 mdr. pr. lokation. */
export function UdstyrBoks({ companyId }: { companyId: string }) {
  const auth = useAuth();
  const viewAs = useViewAs();
  const erAdmin = auth.role === "admin" && !viewAs.isImpersonating;
  const p = periode("12m");
  const hentFn = useServerFn(hentUdstyr);
  const satserFn = useServerFn(hentUdstyrSatser);
  const satserQ = useQuery({ queryKey: ["udstyr-satser"], queryFn: () => satserFn() });
  const q = useQuery({
    queryKey: ["udstyr-firma", companyId, erAdmin, viewAs.effectiveUserId],
    queryFn: async () => dekomprimerJson<Grundlag>(await hentFn({ data: { companyId, alle: erAdmin, sellerId: viewAs.effectiveUserId, fra: p.fra, til: p.til } })),
  });
  const lok = useMemo(() => (q.data ? beregnLokationer(q.data, 12, satserQ.data ?? STANDARD_SATSER) : []).filter((l) => l.maskiner.length || l.leje || l.bel || l.si), [q.data, satserQ.data]);
  if (!lok.length) return null;
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">Udstyr & service <span className="text-xs font-normal text-muted-foreground">· seneste 12 hele måneder</span></h3>
        <Link to="/maskiner-service" className="text-sm text-primary hover:underline">Maskiner & Service →</Link>
      </div>
      <div className="space-y-2">
        {lok.map((l) => (
          <div key={l.lev} className="rounded-md border p-2 text-sm">
            <div className="text-xs text-muted-foreground">{l.adr} · {l.maskiner.length} Frellsen-maskiner{l.kundeejede.length ? ` · ${l.kundeejede.length} kundeejede` : ""}</div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 sm:grid-cols-4">
              <span>Leje <Tal v={l.leje} /></span><span>Belastning <Tal v={-l.belastningIalt} /></span>
              <span>Service netto <Tal v={l.serviceNetto} /></span><span className="font-medium">DB inkl. udstyr <Tal v={l.dbInkl} /></span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Eksporteret til brug i tests/andre visninger
export { KAFFE_TYPER, BRYG };
