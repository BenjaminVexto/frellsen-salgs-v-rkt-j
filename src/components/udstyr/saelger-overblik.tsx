import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  alderAar, erFilter, handlinger, harAftale, reparationer, TYPER, UDLAAN_LABEL, udlaanUdenDaekning, erUdlaan, varekoebAndetSted, prVirksomhed,
  type LokRegnskab, type GrundMaskine, type Satser,
} from "@/lib/udstyr";

const kr = (n: number) => `${Math.round(n).toLocaleString("da-DK")} kr.`;
const antal = (n: number) => n.toLocaleString("da-DK");
const alder = (m: GrundMaskine) => { const a = Math.floor(alderAar(m.o) ?? 0); return a >= 1 ? `${a} år` : null; };
/** Kort maskinnavn: de første ord uden varenumre/teknik. */
export const kortNavn = (m: GrundMaskine) => {
  const ord = (m.b ?? m.t).split(/[,(/]/)[0].split(/\s+/).filter(w => w && !/^\d{4,}$/.test(w) && !/^\d+v$/i.test(w));
  return ord.slice(0, 3).join(" ") || m.t;
};

type Raekke = { key: string; cid: string; kunde: string; maskine: string; tal?: string; negativ?: boolean; detaljer: string[] };
type Liste = { id: string; titel: string; forklaring: string; raekker: Raekke[] };

const maskinDetaljer = (l: LokRegnskab, m: GrundMaskine) => [
  l.adr, m.b ?? m.t, [UDLAAN_LABEL[m.u], m.sn && `Serienr. ${m.sn}`, alder(m)].filter(Boolean).join(" · "),
].filter(Boolean) as string[];

export function SaelgerOverblik({ lok, satser, maaneder }: { lok: LokRegnskab[]; satser: Satser; maaneder: number }) {
  const [liste, setListe] = useState<Liste | null>(null);
  const h = useMemo(() => handlinger(lok, satser, new Date(), maaneder), [lok, satser, maaneder]);
  const udl = useMemo(() => udlaanUdenDaekning(lok, maaneder), [lok, maaneder]);
  const virk = useMemo(() => new Map(prVirksomhed(lok).map(v => [v.cid, v])), [lok]);
  const maskiner = lok.flatMap(l => l.maskiner.filter(m => !erFilter(m)).map(m => ({ l, m })));
  const aftaler = lok.flatMap(l => [...l.maskiner, ...l.kundeejede].filter(m => harAftale(m) && !erFilter(m)).map(m => ({ l, m })));

  const lister: Liste[] = [
    { id: "udlaan", titel: "Udlån der ikke betaler sig", forklaring: "Udlånsmaskiner, hvor kunden ikke køber kaffe nok til at dække maskinen",
      raekker: udl.map(x => ({
        key: x.v.cid, cid: x.v.cid, kunde: x.v.kunde,
        maskine: kortNavn(x.maskiner[0].m) + (x.maskiner.length > 1 ? ` +${x.maskiner.length - 1}` : ""),
        tal: `${Math.round(x.diffMd).toLocaleString("da-DK")} kr./md.`, negativ: true,
        detaljer: [
          `Køber kaffe for ${kr(x.kaffeDbMd)}/md. (DB) · udlån koster ${kr(x.omkMd)}/md.`,
          ...x.maskiner.map(({ l, m }) => `${m.b ?? m.t} · ${UDLAAN_LABEL[m.u]} · ${l.adr}${varekoebAndetSted(l, virk.get(l.cid)!) ? " · varekøb på anden lokation" : ""}`),
        ],
      })) },
    { id: "udskift", titel: "Udskiftning", forklaring: "Maskiner med store reparationsomkostninger – mulighed for en ny maskine",
      raekker: [...Map.groupBy(h.udskift, x => x.l.lev).values()].map(xs => { const { l, m } = xs[0];
        return { key: l.lev, cid: l.cid, kunde: l.kunde, maskine: kortNavn(m) + (xs.length > 1 ? ` +${xs.length - 1}` : ""), tal: `${kr(reparationer(l))} reparationer`, detaljer: xs.flatMap(x => maskinDetaljer(x.l, x.m)).filter((d, i, a) => a.indexOf(d) === i) }; }) },
    { id: "service", titel: "Serviceaftale-muligheder", forklaring: "Kundeejede maskiner uden serviceaftale",
      raekker: h.kundeejet.map(({ l, m }) => ({ key: `${l.lev}-${m.id}`, cid: l.cid, kunde: l.kunde, maskine: kortNavn(m), tal: alder(m) ?? undefined, detaljer: maskinDetaljer(l, m) })) },
  ];
  const maskinRaekker = (ms: { l: LokRegnskab; m: GrundMaskine }[]): Raekke[] =>
    ms.map(({ l, m }) => ({ key: `${l.lev}-${m.id}`, cid: l.cid, kunde: l.kunde, maskine: kortNavn(m), detaljer: maskinDetaljer(l, m) }));
  const lokAftaler = new Set(aftaler.map(x => x.l.lev)).size;

  return <>
    <section className="grid grid-cols-3 gap-2" aria-label="Det skal du kigge på – antal">
      {lister.map(k => <Button key={k.id} variant="outline" className="h-auto min-h-20 flex-col items-start justify-between whitespace-normal p-3 text-left md:flex-row md:items-center md:p-4"
        onClick={() => document.getElementById(`liste-${k.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
        <span className="text-sm font-medium leading-tight">{k.titel}</span>
        <span className="text-2xl font-semibold tabular-nums md:text-3xl">{antal(k.raekker.length)}</span>
      </Button>)}
    </section>
    <section aria-label="Det skal du kigge på">
      <h2 className="mb-3 text-lg font-semibold">Det skal du kigge på</h2>
      <div className="grid gap-6 lg:grid-cols-3">
        {lister.map(x => <div key={x.id} id={`liste-${x.id}`} className="min-w-0 scroll-mt-20">
          <h3 className="text-base font-semibold">{x.titel} <span className="font-normal text-muted-foreground tabular-nums">({antal(x.raekker.length)})</span></h3>
          <p className="mb-2 text-[13px] text-muted-foreground">{x.forklaring}</p>
          <div className="divide-y rounded-md border bg-card">
            {x.raekker.slice(0, 5).map(r => <KundeRaekke key={r.key} r={r} />)}
            {!x.raekker.length && <p className="p-4 text-sm text-muted-foreground">Ingen kunder i denne liste.</p>}
          </div>
          {x.raekker.length > 5 && <Button variant="ghost" className="mt-1 w-full justify-between" onClick={() => setListe(x)}>Vis alle ({antal(x.raekker.length)})<ChevronRight className="h-4 w-4" /></Button>}
        </div>)}
      </div>
    </section>
    <section aria-label="Mine maskiner" className="max-w-[720px]">
      <h2 className="text-lg font-semibold">
        <button type="button" className="hover:underline" onClick={() => setListe({ id: "mine", titel: "Mine maskiner", forklaring: "", raekker: maskinRaekker(maskiner) })}>Mine maskiner: {antal(maskiner.length)}</button>
      </h2>
      <p className="mb-2 text-sm text-muted-foreground">
        <button type="button" className="hover:underline" onClick={() => setListe({ id: "aftaler", titel: "Serviceaftaler", forklaring: "", raekker: maskinRaekker(aftaler) })}>
          Serviceaftaler: {antal(aftaler.length)} maskiner · {antal(lokAftaler)} lokationer</button>
      </p>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-xs text-muted-foreground"><th className="py-2 text-left">Maskintype</th><th className="px-3 text-right">Antal</th><th className="px-3 text-right">Heraf udlån</th><th className="pl-3 text-right">{maaneder === 12 ? "Netto pr. år" : "Netto i perioden"}</th></tr></thead>
        <tbody>{TYPER.filter(t => maskiner.some(x => x.m.t === t)).map(t => {
          const ms = maskiner.filter(x => x.m.t === t);
          const netto = lok.reduce((a, l) => a + (l.lt[t] ?? 0), 0) - ms.reduce((a, x) => a + x.m.belastning, 0);
          return <tr key={t} className="cursor-pointer border-b hover:bg-muted/40" onClick={() => setListe({ id: t, titel: t, forklaring: "", raekker: maskinRaekker(ms) })}>
            <td className="py-2.5 font-medium text-primary">{t}</td>
            <td className="px-3 text-right tabular-nums">{antal(ms.length)}</td>
            <td className="px-3 text-right tabular-nums">{antal(ms.filter(x => erUdlaan(x.m)).length)}</td>
            <td className={`pl-3 text-right tabular-nums ${netto < 0 ? "text-destructive" : ""}`}>{kr(netto)}</td></tr>;
        })}</tbody>
      </table>
    </section>
    {liste && <KundeListe liste={liste} onClose={() => setListe(null)} />}
  </>;
}

function KundeRaekke({ r }: { r: Raekke }) {
  const [aaben, setAaben] = useState(false);
  return <div className="min-w-0">
    <button type="button" aria-expanded={aaben} onClick={() => setAaben(!aaben)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40">
      <span className="line-clamp-2 min-w-0 flex-1"><span className="text-sm font-semibold">{r.kunde}</span><span className="text-[13px] text-muted-foreground"> · {r.maskine}</span></span>
      {r.tal && <span className={`shrink-0 text-sm tabular-nums ${r.negativ ? "text-destructive" : ""}`}>{r.tal}</span>}
      {aaben ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
    {aaben && <div className="space-y-1 px-3 pb-3 text-[13px]">
      {r.detaljer.map((d, i) => <div key={i}>{d}</div>)}
      <Link to="/virksomheder/$id" params={{ id: r.cid }} className="inline-block font-medium text-primary hover:underline">Åbn kundekort ›</Link>
    </div>}
  </div>;
}

function KundeListe({ liste, onClose }: { liste: Liste; onClose: () => void }) {
  const [s, setS] = useState("");
  const [vis, setVis] = useState(50);
  const rows = liste.raekker.filter(r => `${r.kunde} ${r.maskine} ${r.detaljer.join(" ")}`.toLowerCase().includes(s.toLowerCase()));
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
    <DialogHeader><DialogTitle>{liste.titel}</DialogTitle><DialogDescription>{liste.forklaring || `${antal(rows.length)} resultater`}</DialogDescription></DialogHeader>
    <Input placeholder="Søg kunde, lokation eller maskine" value={s} onChange={e => { setS(e.target.value); setVis(50); }} />
    <div className="divide-y rounded-md border">{rows.slice(0, vis).map(r => <KundeRaekke key={r.key} r={r} />)}</div>
    {vis < rows.length && <Button variant="outline" onClick={() => setVis(vis + 50)}>Vis flere</Button>}
  </DialogContent></Dialog>;
}
