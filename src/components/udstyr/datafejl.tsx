import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { handlinger, type LokRegnskab, type Satser } from "@/lib/udstyr";

const kr = (n: number) => `${Math.round(n).toLocaleString("da-DK")} kr.`;
type Tjek = { type: string; noegle: string; kommentar: string | null; tjekket_af_navn: string | null; tjekket_at: string };
type Fejl = { noegle: string; cid: string; kunde: string; lokation: string; beloeb: number; ekstra?: string };

export function Datafejl({ lok, satser }: { lok: LokRegnskab[]; satser: Satser }) {
  const h = useMemo(() => handlinger(lok, satser), [lok, satser]);
  const [visTjekkede, setVisTjekkede] = useState(false);
  const tjekQ = useQuery({
    queryKey: ["udstyr-datafejl-tjek"],
    queryFn: async () => {
      const { data, error } = await supabase.from("udstyr_datafejl_tjek").select("type,noegle,kommentar,tjekket_af_navn,tjekket_at");
      if (error) throw error;
      return data as Tjek[];
    },
  });
  const tjek = useMemo(() => new Map((tjekQ.data ?? []).map(t => [`${t.type}|${t.noegle}`, t])), [tjekQ.data]);
  const typer: { type: string; titel: string; beloebNavn: string; rows: Fejl[] }[] = [
    { type: "underskud", titel: "Serviceaftaler i underskud", beloebNavn: "Service netto",
      rows: [...h.underskud].sort((a, b) => a.serviceNetto - b.serviceNetto).map(l => ({ noegle: l.lev, cid: l.cid, kunde: l.kunde, lokation: `${l.adr} · ${l.lev}`, beloeb: l.serviceNetto })) },
    { type: "uden_leje", titel: "Leje uden lejefakturering", beloebNavn: "Leje i perioden",
      rows: h.udenLeje.map(({ l, m }) => ({ noegle: `${l.lev}|${m.id}`, cid: l.cid, kunde: l.kunde, lokation: `${l.adr} · ${l.lev}`, beloeb: l.leje, ekstra: `${m.b ?? m.t}${m.sn ? ` · ${m.sn}` : ""}` })) },
    { type: "ufordelt", titel: "Belastning uden udstyr", beloebNavn: "Belastning",
      rows: [...h.ufordelt].sort((a, b) => b.ufordelt - a.ufordelt).map(l => ({ noegle: l.lev, cid: l.cid, kunde: l.kunde, lokation: `${l.adr} · ${l.lev}`, beloeb: -l.ufordelt })) },
  ];
  return <div className="space-y-6">
    <div className="flex items-center gap-2 text-sm"><Switch id="vis-tjekkede" checked={visTjekkede} onCheckedChange={setVisTjekkede} /><label htmlFor="vis-tjekkede">Vis tjekkede</label></div>
    {typer.map(t => {
      const aabne = t.rows.filter(r => !tjek.has(`${t.type}|${r.noegle}`));
      const vist = visTjekkede ? t.rows : aabne;
      return <section key={t.type}>
        <h3 className="mb-2 font-semibold">{t.titel} <span className="font-normal text-muted-foreground">({aabne.length} åbne · {t.rows.length - aabne.length} tjekket)</span></h3>
        {vist.length ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="py-2 text-left">Kunde</th><th className="text-left">Lokation</th><th className="px-3 text-right">{t.beloebNavn}</th><th className="text-left">Tjek</th></tr></thead>
          <tbody>{vist.slice(0, 100).map(r => <FejlRaekke key={r.noegle} type={t.type} r={r} tjek={tjek.get(`${t.type}|${r.noegle}`)} />)}</tbody>
        </table>{vist.length > 100 && <p className="mt-1 text-xs text-muted-foreground">Viser 100 af {vist.length}.</p>}</div>
          : <p className="text-sm text-muted-foreground">Ingen åbne rækker.</p>}
      </section>;
    })}
  </div>;
}

function FejlRaekke({ type, r, tjek }: { type: string; r: Fejl; tjek?: Tjek }) {
  const qc = useQueryClient();
  const auth = useAuth();
  const [kommentar, setKommentar] = useState("");
  const [gemmer, setGemmer] = useState(false);
  const gem = async () => {
    setGemmer(true);
    const navn = auth.fullName || null;
    const { error } = await supabase.from("udstyr_datafejl_tjek").upsert({ type, noegle: r.noegle, kommentar: kommentar.trim() || null, tjekket_af_navn: navn });
    setGemmer(false);
    if (error) return toast.error("Kunne ikke gemme: " + error.message);
    qc.invalidateQueries({ queryKey: ["udstyr-datafejl-tjek"] });
  };
  const fortryd = async () => {
    const { error } = await supabase.from("udstyr_datafejl_tjek").delete().eq("type", type).eq("noegle", r.noegle);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["udstyr-datafejl-tjek"] });
  };
  return <tr className={`border-b align-middle ${tjek ? "text-muted-foreground" : ""}`}>
    <td className="py-2 pr-3"><Link to="/virksomheder/$id" params={{ id: r.cid }} className="font-medium hover:underline">{r.kunde}</Link>{r.ekstra && <div className="text-xs text-muted-foreground">{r.ekstra}</div>}</td>
    <td className="pr-3">{r.lokation}</td>
    <td className={`px-3 text-right tabular-nums ${r.beloeb < 0 ? "text-destructive" : ""}`}>{kr(r.beloeb)}</td>
    <td className="py-1">{tjek
      ? <div className="flex items-center gap-2 text-xs"><Check className="h-4 w-4 text-primary" /><span>{tjek.tjekket_af_navn ?? "Admin"} · {new Date(tjek.tjekket_at).toLocaleDateString("da-DK")}{tjek.kommentar && ` · ${tjek.kommentar}`}</span>
        <Button size="sm" variant="ghost" onClick={fortryd} aria-label="Fortryd tjek"><Undo2 className="h-3.5 w-3.5" /></Button></div>
      : <div className="flex items-center gap-1"><Input className="h-8 w-44" placeholder="Kommentar" value={kommentar} onChange={e => setKommentar(e.target.value)} />
        <Button size="sm" variant="outline" disabled={gemmer} onClick={gem}>Tjekket</Button></div>}</td>
  </tr>;
}
