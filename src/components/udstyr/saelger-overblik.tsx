import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { alderAar, erFilter, handlinger, harAftale, prVirksomhed, reparationer, TYPER, type LokRegnskab, type GrundMaskine, type Satser } from "@/lib/udstyr";

const kr = (n: number) => Math.round(n).toLocaleString("da-DK");
type Raekke = { l: LokRegnskab; m?: GrundMaskine; tekst?: string };
type Liste = { titel: string; raekker: Raekke[] };
const alder = (m: GrundMaskine) => m.o ? `${Math.max(0, alderAar(m.o) ?? 0).toFixed(1).replace(".", ",")} år` : "Alder ikke registreret";

export function SaelgerOverblik({ lok, satser, maaneder }: { lok: LokRegnskab[]; satser: Satser; maaneder: number }) {
  const [liste, setListe] = useState<Liste | null>(null);
  const h = useMemo(() => handlinger(lok, satser), [lok, satser]);
  const maskiner = lok.flatMap(l => l.maskiner.filter(m => !erFilter(m)).map(m => ({ l, m })));
  const aftaler = lok.flatMap(l => [...l.maskiner, ...l.kundeejede].filter(m => harAftale(m) && !erFilter(m)).map(m => ({ l, m })));
  const virksomheder = prVirksomhed(lok).filter(v => v.lok.some(l => l.maskiner.some(m => !erFilter(m)) || l.kundeejede.some(m => !erFilter(m))) && v.dbInkl < 0).sort((a, b) => a.dbInkl - b.dbInkl);
  const udlaan: Raekke[] = [...h.udlaan].sort((a, b) => a.dbInkl - b.dbInkl).flatMap(l => {
    const ms = l.maskiner.filter(m => [4, 6, 7].includes(m.u) && !erFilter(m));
    return ms.map(m => ({ l, m, tekst: `Kaffe-DB ${kr(l.vdb / ms.length / maaneder)} kr./md. pr. maskine · maskinen koster ${kr(m.belastning / maaneder)} kr./md.` }));
  });
  const lister: Liste[] = [
    { titel: "Udlån der ikke betaler sig", raekker: udlaan },
    { titel: "Salgsmulighed – udskiftning", raekker: h.udskift.map(x => ({ ...x, tekst: `${alder(x.m)} · Reparationer på lokationen: ${kr(reparationer(x.l))} kr. på ${maaneder} mdr.` })) },
    { titel: "Salgsmulighed – serviceaftale", raekker: h.kundeejet.map(x => ({ ...x, tekst: `${alder(x.m)} · Kundeejet uden serviceaftale` })) },
  ];
  const kort = [
    { titel: "Mine maskiner", antal: maskiner.length, under: "Frellsen-maskiner · ekskl. filtre", raekker: maskiner },
    { titel: "Serviceaftaler", antal: aftaler.length, under: `${new Set(aftaler.map(x => x.l.lev)).size.toLocaleString("da-DK")} lokationer`, raekker: aftaler },
    { titel: "Udstyr der ikke betaler sig", antal: virksomheder.length, under: "virksomheder med negativ DB inkl. udstyr", raekker: virksomheder.map(v => ({ l: { ...v.lok[0], kunde: v.kunde }, tekst: `DB inkl. udstyr: ${kr(v.dbInkl)} kr. · ${v.lok.length} lokationer` })) },
  ];
  return <>
    <section className="grid gap-2 md:grid-cols-3" aria-label="Dine nøgletal">
      {kort.map(k => <Button key={k.titel} variant="outline" className="h-auto min-h-24 justify-between whitespace-normal p-4 text-left" onClick={() => setListe({ titel: k.titel, raekker: k.raekker })}>
        <span className="min-w-0"><span className="block text-sm font-medium">{k.titel}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{k.under}</span></span>
        <span className="ml-3 text-3xl font-semibold tabular-nums">{kr(k.antal)}</span>
      </Button>)}
    </section>
    <section aria-label="Det skal du kigge på">
      <h2 className="mb-3 text-lg font-semibold">Det skal du kigge på</h2>
      <div className="grid gap-5 lg:grid-cols-3">
        {lister.map(x => <div key={x.titel} className="min-w-0">
          <div className="mb-2 flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{x.titel}</h3><span className="text-xs tabular-nums text-muted-foreground">{kr(x.raekker.length)}</span></div>
          <div className="divide-y rounded-md border bg-card">
            {x.raekker.filter((r, i, a) => a.findIndex(v => v.l.cid === r.l.cid) === i).slice(0, 10).map((r, i) => <Kunde key={`${r.l.lev}-${r.m?.id}-${i}`} r={r} />)}
            {!x.raekker.length && <p className="p-4 text-sm text-muted-foreground">Ingen kunder i denne liste.</p>}
          </div>
          {!!x.raekker.length && <Button variant="ghost" className="mt-1 w-full justify-between" onClick={() => setListe(x)}>Vis alle ({kr(x.raekker.length)})<ChevronRight className="h-4 w-4" /></Button>}
        </div>)}
      </div>
    </section>
    <section aria-label="Mine maskiner">
      <h2 className="mb-3 text-lg font-semibold">Mine maskiner</h2>
      <table className="w-full table-fixed text-sm">
        <colgroup><col className="w-[36%]" /><col className="w-[14%]" /><col className="w-[20%]" /><col className="w-[30%]" /></colgroup>
        <thead><tr className="border-b text-xs text-muted-foreground"><th className="py-3 text-left">Maskintype</th><th className="px-1 text-right">Antal</th><th className="px-1 text-right">Heraf<br className="md:hidden" /> udlån</th><th className="pl-2 text-right">{maaneder === 12 ? "Netto pr. år" : "Netto i perioden"}</th></tr></thead>
        <tbody>{TYPER.filter(t => maskiner.some(x => x.m.t === t)).map(t => {
          const ms = maskiner.filter(x => x.m.t === t);
          const netto = lok.reduce((a, l) => a + (l.lt[t] ?? 0), 0) - ms.reduce((a, x) => a + x.m.belastning, 0);
          return <tr key={t} className="cursor-pointer border-b hover:bg-muted/40" onClick={() => setListe({ titel: t, raekker: ms })}><td className="py-3 pr-2"><Button variant="link" className="h-auto whitespace-normal p-0 text-left" onClick={e => { e.stopPropagation(); setListe({ titel: t, raekker: ms }); }}>{t}</Button></td><td className="px-1 text-right tabular-nums">{kr(ms.length)}</td><td className="px-1 text-right tabular-nums">{kr(ms.filter(x => x.m.u === 4).length)}</td><td className={`pl-2 text-right tabular-nums ${netto < 0 ? "text-destructive" : ""}`}>{kr(netto)} kr.</td></tr>;
        })}</tbody>
      </table>
    </section>
    {liste && <KundeListe liste={liste} onClose={() => setListe(null)} />}
  </>;
}

function Kunde({ r }: { r: Raekke }) {
  return <div className="min-w-0 p-3 text-sm">
    <Link to="/virksomheder/$id" params={{ id: r.l.cid }} className="block font-medium hover:underline">{r.l.kunde}</Link>
    <div className="mt-0.5 break-words text-xs text-muted-foreground">{r.l.adr}{r.m && ` · ${r.m.b ?? r.m.t}`}</div>
    {r.tekst && <div className="mt-1 text-xs">{r.tekst}</div>}
  </div>;
}

function KundeListe({ liste, onClose }: { liste: Liste; onClose: () => void }) {
  const [s, setS] = useState("");
  const [antal, setAntal] = useState(50);
  const rows = liste.raekker.filter(r => `${r.l.kunde} ${r.l.adr} ${r.m?.b ?? ""} ${r.m?.sn ?? ""}`.toLowerCase().includes(s.toLowerCase()));
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
    <DialogHeader><DialogTitle>{liste.titel}</DialogTitle><DialogDescription>{kr(rows.length)} resultater</DialogDescription></DialogHeader>
    <Input placeholder="Søg kunde, lokation eller maskine" value={s} onChange={e => { setS(e.target.value); setAntal(50); }} />
    <div className="divide-y">{rows.slice(0, antal).map((r, i) => <Kunde key={`${r.l.lev}-${r.m?.id}-${i}`} r={r} />)}</div>
    {antal < rows.length && <Button variant="outline" onClick={() => setAntal(antal + 50)}>Vis flere</Button>}
  </DialogContent></Dialog>;
}