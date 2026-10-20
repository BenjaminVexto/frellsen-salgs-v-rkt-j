import { useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Download, Loader2, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { laasBonusSaelger } from "@/lib/bonus-afregning.functions";
import { LaasMaskinAdvarsel, MaskinVurderingKort } from "./maskin-vurdering";
import { loenartGrundlag, loenfilRaekker, tidligLaasning } from "@/lib/bonus-afregning";

const MDR = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const navnM = (s: string) => `${MDR[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
const addM = (s: string, n: number) => {
  const d = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const kr = (n: number, dec = 2) => n.toLocaleString("da-DK", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const N = (v: unknown) => Number(v) || 0;

type Raekke = {
  user_id: string; navn: string; loennr: string | null; laast: boolean; beregnes?: boolean;
  db_grundlag: number; db_bonus: number; w: number; a: number; r: number; maskinbonus: number;
  ny_kunde_bonus: number; regulering: number; i_alt: number; loen_1561: number; loen_1563: number;
};

let aktive = 0;
const venter: (() => void)[] = [];
async function begraens<T>(fn: () => Promise<T>): Promise<T> {
  if (aktive >= 2) await new Promise<void>((r) => venter.push(r));
  aktive++;
  try { return await fn(); } finally { aktive--; venter.shift()?.(); }
}

export function AfregningFane({ onVisSaelger }: { onVisSaelger: (id: string) => void }) {
  const qc = useQueryClient();
  const now = new Date();
  const curM = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const sidsteHele = addM(curM, -1);
  const [maaned, setMaaned] = useState(sidsteHele);
  const m1 = `${maaned}-01`;

  const saelgereQ = useQuery({
    queryKey: ["afregning-saelgere", maaned],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bonus_afregning_saelgere", { _maaned: m1 });
      if (error) throw error;
      return data ?? [];
    },
  });
  const laasQ = useQuery({
    queryKey: ["afregning-laas", maaned],
    queryFn: async () => {
      const { data, error } = await supabase.from("bonus_laas").select("*").eq("maaned", m1);
      if (error) throw error;
      return data ?? [];
    },
  });
  const logQ = useQuery({
    queryKey: ["afregning-log", maaned],
    queryFn: async () => {
      const { data, error } = await supabase.from("bonus_laas_log").select("*").eq("maaned", m1).order("tidspunkt", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const regQ = useQuery({
    queryKey: ["afregning-reg", maaned],
    queryFn: async () => {
      const { data, error } = await supabase.from("bonus_regulering").select("*").eq("udbetalingsmaaned", m1).order("oprettet_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const laasRows = laasQ.data ?? [];
  const faerdigLaast = laasRows.length > 0 && logQ.data?.[0]?.handling === "laas";
  const laastDato = logQ.data?.[0]?.handling === "laas" ? logQ.data[0].tidspunkt : null;
  const saelgere = saelgereQ.data ?? [];
  const laastIds = new Set(laasRows.map((l) => l.user_id));

  // Månedssummer læser det vedligeholdte maskingrundlag; detaljer hentes kun ved maskintjek.
  const aabne = saelgere.filter((s) => !laastIds.has(s.user_id)).map((s) => s.user_id);
  const liveQs = useQueries({
    queries: aabne.map((id) => ({
      queryKey: ["bonus-pr-maaned", id, maaned, maaned],
      enabled: !laasQ.isLoading,
      staleTime: 5 * 60_000,
      queryFn: () => begraens(async () => {
        const { data, error } = await (supabase as any).rpc("bonus_pr_maaned", { _saelger: id, _fra: m1, _til: m1 });
        if (error) throw new Error(error.message);
        return ((data ?? [])[0] ?? null) as any;
      }),
    })),
  });
  const liveMap = new Map<string, any>(aabne.flatMap((id, i) => (liveQs[i]?.data !== undefined ? [[id, liveQs[i].data]] : [])));
  const liveLoading = liveQs.some((q) => q.isFetching);
  const liveFejl = liveQs.find((q) => q.error)?.error;

  const rows: Raekke[] = useMemo(() => saelgere.map((s) => {
    const l = laasRows.find((x) => x.user_id === s.user_id);
    if (l) return {
      user_id: s.user_id, navn: s.navn ?? "—", loennr: s.loennr, laast: true,
      db_grundlag: N(l.db_grundlag), db_bonus: N(l.db_bonus), w: N(l.antal_wittenborg), a: N(l.antal_animo), r: N(l.antal_rex),
      maskinbonus: N(l.maskinbonus), ny_kunde_bonus: N(l.ny_kunde_bonus), regulering: N(l.regulering),
      i_alt: N(l.samlet_bonus) + N(l.regulering), loen_1561: N(l.loen_1561), loen_1563: N(l.loen_1563),
    };
    const b = liveMap.get(s.user_id);
    const beregnes = !liveMap.has(s.user_id);
    const regs = (regQ.data ?? []).filter((r) => r.user_id === s.user_id);
    const r1 = regs.filter((r) => r.loenart === 1561).reduce((t, r) => t + N(r.beloeb), 0);
    const r3 = regs.filter((r) => r.loenart === 1563).reduce((t, r) => t + N(r.beloeb), 0);
    const samlet = N(b?.samlet_bonus);
    const g = loenartGrundlag({ db_bonus: N(b?.db_bonus), samlet_bonus: samlet }, s.flatrate == null ? null : N(s.flatrate));
    return {
      user_id: s.user_id, navn: s.navn ?? "—", loennr: s.loennr, laast: false, beregnes,
      db_grundlag: N(b?.db_grundlag), db_bonus: N(b?.db_bonus), w: N(b?.antal_wittenborg), a: N(b?.antal_animo), r: N(b?.antal_rex),
      maskinbonus: N(b?.maskinbonus), ny_kunde_bonus: N(b?.ny_kunde_bonus), regulering: r1 + r3,
      i_alt: samlet + r1 + r3, loen_1561: g.l1561 + r1, loen_1563: g.l1563 + r3,
    };
  }), [saelgere, laasRows, liveMap, regQ.data]);

  const total = rows.reduce((t, r) => ({
    db_grundlag: t.db_grundlag + r.db_grundlag, db_bonus: t.db_bonus + r.db_bonus, maskinbonus: t.maskinbonus + r.maskinbonus,
    ny_kunde_bonus: t.ny_kunde_bonus + r.ny_kunde_bonus, regulering: t.regulering + r.regulering, i_alt: t.i_alt + r.i_alt,
    loen_1561: t.loen_1561 + r.loen_1561, loen_1563: t.loen_1563 + r.loen_1563,
  }), { db_grundlag: 0, db_bonus: 0, maskinbonus: 0, ny_kunde_bonus: 0, regulering: 0, i_alt: 0, loen_1561: 0, loen_1563: 0 });

  const opdater = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("afregning") || q.queryKey[0] === "bonus-pr-maaned" || q.queryKey[0] === "bonus-laas" });

  // Låsning
  const [laasOpen, setLaasOpen] = useState(false);
  const [note, setNote] = useState("");
  const [fremdrift, setFremdrift] = useState<{ i: number; n: number } | null>(null);
  const laas = async () => {
    try {
      const { data: ids, error } = await supabase.rpc("bonus_laas_start", { _maaned: m1 });
      if (error) throw error;
      const liste = (ids ?? []) as unknown as string[];
      for (let i = 0; i < liste.length; i++) {
        setFremdrift({ i, n: liste.length });
        await laasBonusSaelger({ data: { maaned: m1, saelger: liste[i], note: note || null } });
      }
      const { error: e2 } = await supabase.rpc("bonus_laas_afslut", { _maaned: m1, _note: note || undefined });
      if (e2) throw e2;
      toast.success(`${navnM(maaned)} er låst`);
      setLaasOpen(false); setNote("");
    } catch (e) {
      toast.error((e as Error).message + " — prøv igen; allerede låste sælgere springes over.");
    } finally {
      setFremdrift(null); opdater();
    }
  };
  const [opOpen, setOpOpen] = useState(false);
  const [begrundelse, setBegrundelse] = useState("");
  const laasOp = async () => {
    const { error } = await supabase.rpc("bonus_laas_op", { _maaned: m1, _begrundelse: begrundelse });
    if (error) return toast.error(error.message);
    toast.success(`${navnM(maaned)} er låst op`);
    setOpOpen(false); setBegrundelse(""); opdater();
  };

  // Manuel regulering
  const [regOpen, setRegOpen] = useState(false);
  const [ny, setNy] = useState({ user_id: "", loenart: "1563", beloeb: "", tekst: "" });
  const gemReg = async () => {
    const beloeb = Number(ny.beloeb.replace(/\./g, "").replace(",", "."));
    if (!ny.user_id || !Number.isFinite(beloeb) || beloeb === 0 || !ny.tekst.trim()) return toast.error("Udfyld sælger, beløb og tekst");
    const { error } = await supabase.from("bonus_regulering").insert({
      user_id: ny.user_id, udbetalingsmaaned: m1, type: "manuel", loenart: Number(ny.loenart), beloeb, tekst: ny.tekst.trim(),
    });
    if (error) return toast.error(error.message);
    setRegOpen(false); setNy({ user_id: "", loenart: "1563", beloeb: "", tekst: "" }); opdater();
  };
  const sletReg = async (id: string) => {
    const { error } = await supabase.from("bonus_regulering").delete().eq("id", id);
    if (error) return toast.error(error.message);
    opdater();
  };

  const gemLoennr = async (id: string, v: string) => {
    const { error } = await supabase.from("profiles").update({ loennr: v.trim() || null }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Lønnr. gemt"); qc.invalidateQueries({ queryKey: ["afregning-saelgere"] });
  };

  const hentLoenfil = (type: "xlsx" | "csv") => {
    const data = loenfilRaekker(maaned, rows.map((r) => ({ navn: r.navn, loennr: r.loennr, loen_1561: r.loen_1561, loen_1563: r.loen_1563 })));
    const filnavn = `loenfil-bonus-${maaned}`;
    if (type === "xlsx") {
      // Date som rigtig dato-celle (dd-mm-åååå), ikke tekst.
      const ws = XLSX.utils.json_to_sheet(data.map((d) => {
        const [dd, mm, yyyy] = d.Date.split("-").map(Number);
        return { ...d, Date: new Date(Date.UTC(yyyy, mm - 1, dd, 12)) };
      }), { cellDates: true, dateNF: "dd-mm-yyyy" });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Lønfil");
      XLSX.writeFile(wb, `${filnavn}.xlsx`);
      return;
    }
    const head = ["CVR", "Name", "Employee Number", "Date", "Project ID", "Type ID", "Number", "Amount"] as const;
    const lines = [head.join(";"), ...data.map((d) => head.map((h) => h === "Amount" ? d.Amount.toFixed(2).replace(".", ",") : String(d[h])).join(";"))];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${filnavn}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const indlaeser = saelgereQ.isLoading || laasQ.isLoading || logQ.isLoading;
  const fejl = saelgereQ.error || laasQ.error || regQ.error || liveFejl;
  const delvis = laasRows.length > 0 && !faerdigLaast;
  const naeste = addM(maaned, 1);

  return (
    <div className="space-y-4 max-w-full">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">Bonusmåned</Label>
          <Input type="month" value={maaned} max={sidsteHele} onChange={(e) => e.target.value && setMaaned(e.target.value)} className="w-44" />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {faerdigLaast ? (
            <Button variant="outline" size="sm" onClick={() => setOpOpen(true)}><LockOpen className="h-4 w-4 mr-2" />Lås op</Button>
          ) : (
            <Button size="sm" onClick={() => setLaasOpen(true)} disabled={maaned > sidsteHele}><Lock className="h-4 w-4 mr-2" />{delvis ? `Fortsæt låsning af ${navnM(maaned)}` : `Lås ${navnM(maaned)}`}</Button>
          )}
          <Button variant="outline" size="sm" disabled={!faerdigLaast} title={faerdigLaast ? undefined : "Lønfilen kan kun hentes for låste måneder"} onClick={() => hentLoenfil("xlsx")}><Download className="h-4 w-4 mr-2" />Hent lønfil (xlsx)</Button>
          <Button variant="outline" size="sm" disabled={!faerdigLaast} onClick={() => hentLoenfil("csv")}><Download className="h-4 w-4 mr-2" />CSV</Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Afregning — {navnM(maaned)}</h2>
          {faerdigLaast && laastDato && <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />Låst {new Date(laastDato).toLocaleDateString("da-DK")}</span>}
          {(liveLoading && !faerdigLaast) && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Beregner…</span>}
        </div>
        {fejl ? <p className="text-sm text-destructive">{(fejl as Error).message}</p> : indlaeser ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Henter…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3 font-medium">Sælger</th>
                  <th className="py-2 px-2 font-medium">Lønnr.</th>
                  <th className="py-2 px-2 font-medium text-right">DB-grundlag</th>
                  <th className="py-2 px-2 font-medium text-right">DB-provision</th>
                  <th className="py-2 px-2 font-medium text-right">Maskinbonus</th>
                  <th className="py-2 px-2 font-medium text-right">Ny kunde</th>
                  <th className="py-2 px-2 font-medium text-right">Reguleringer</th>
                  <th className="py-2 px-2 font-semibold text-right">I alt</th>
                  <th className="py-2 px-2 font-medium text-right">Lønart 1561</th>
                  <th className="py-2 px-2 font-medium text-right">Lønart 1563</th>
                  <th className="py-2 pl-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap"><Button variant="link" className="h-auto p-0 font-normal text-foreground no-underline hover:underline" onClick={() => onVisSaelger(r.user_id)}>{r.navn}</Button></td>
                    <td className="py-1.5 px-2"><Input defaultValue={r.loennr ?? ""} aria-label={`Lønnr. for ${r.navn}`} className="h-8 w-20" onBlur={(e) => { if (e.target.value !== (r.loennr ?? "")) gemLoennr(r.user_id, e.target.value); }} /></td>
                    <td className="py-1.5 px-2 text-right">{kr(r.db_grundlag, 0)}</td>
                    <td className="py-1.5 px-2 text-right">{kr(r.db_bonus)}</td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">{kr(r.maskinbonus)}<span className="block text-xs text-muted-foreground">W {r.w} · A {r.a} · R {r.r}</span></td>
                    <td className="py-1.5 px-2 text-right">{kr(r.ny_kunde_bonus)}</td>
                    <td className="py-1.5 px-2 text-right">{kr(r.regulering)}</td>
                    <td className="py-1.5 px-2 text-right font-semibold">{kr(r.i_alt)}</td>
                    <td className="py-1.5 px-2 text-right">{kr(r.loen_1561)}</td>
                    <td className="py-1.5 px-2 text-right">{kr(r.loen_1563)}</td>
                    <td className="py-1.5 pl-2">{r.laast ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />Låst</span> : r.beregnes ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Beregner</span> : "Åben"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="py-1.5 pr-3">Total</td><td />
                  <td className="py-1.5 px-2 text-right">{kr(total.db_grundlag, 0)}</td>
                  <td className="py-1.5 px-2 text-right">{kr(total.db_bonus)}</td>
                  <td className="py-1.5 px-2 text-right">{kr(total.maskinbonus)}</td>
                  <td className="py-1.5 px-2 text-right">{kr(total.ny_kunde_bonus)}</td>
                  <td className="py-1.5 px-2 text-right">{kr(total.regulering)}</td>
                  <td className="py-1.5 px-2 text-right">{kr(total.i_alt)}</td>
                  <td className="py-1.5 px-2 text-right">{kr(total.loen_1561)}</td>
                  <td className="py-1.5 px-2 text-right">{kr(total.loen_1563)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Reguleringer udbetalt i {navnM(maaned)}</h2>
          <Button size="sm" variant="outline" className="ml-auto" disabled={laasRows.length > 0} onClick={() => setRegOpen(true)}><Plus className="h-4 w-4 mr-2" />Tilføj regulering</Button>
        </div>
        {(regQ.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Ingen reguleringer.</p> : (
          <div className="divide-y text-sm">
            {(regQ.data ?? []).map((r) => (
              <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{saelgere.find((s) => s.user_id === r.user_id)?.navn ?? "—"}</p>
                  <p className="text-xs text-muted-foreground break-words">{r.type === "efterregulering" ? "Automatisk" : "Manuel"} · {r.tekst}</p>
                </div>
                <span className="text-xs text-muted-foreground">Lønart {r.loenart}</span>
                <span className="tabular-nums text-right">{kr(N(r.beloeb))} kr.</span>
                {r.type === "manuel" && laasRows.length === 0 ? (
                  <Button size="icon" variant="ghost" aria-label="Slet regulering" onClick={() => sletReg(r.id)}><Trash2 className="h-4 w-4" /></Button>
                ) : <span className="w-9" />}
              </div>
            ))}
          </div>
        )}
      </Card>

      <MaskinVurderingKort maaned={maaned} saelgere={saelgere} laaste={new Set(laasRows.map((l: any) => l.user_id))} onVisSaelger={onVisSaelger} />

      <Dialog open={laasOpen} onOpenChange={(o) => { if (!fremdrift) setLaasOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lås {navnM(maaned)}</DialogTitle>
            <DialogDescription>Tallene gemmes for alle sælgere med en aktiv bonusordning. Sene fakturaer for tidligere låste måneder bliver efterreguleret i denne måned.</DialogDescription>
          </DialogHeader>
          {tidligLaasning(maaned) && (
            <div className="flex gap-2 rounded-md bg-muted p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>Fakturaer bagudateret til {navnM(maaned)} kan stadig komme. Anbefalet låsedato er den 10. {navnM(naeste)}. De vil i så fald blive efterreguleret automatisk.</p>
            </div>
          )}
          <LaasMaskinAdvarsel maaned={maaned} saelgere={saelgere} aaben={laasOpen} />
          <div className="space-y-1"><Label>Note (valgfri)</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
          {fremdrift && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Låser sælger {fremdrift.i + 1} af {fremdrift.n}… (ca. 15 sek. pr. sælger)</p>}
          <DialogFooter>
            <Button variant="outline" disabled={!!fremdrift} onClick={() => setLaasOpen(false)}>Annuller</Button>
            <Button disabled={!!fremdrift} onClick={laas}><Lock className="h-4 w-4 mr-2" />Lås og udbetal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={opOpen} onOpenChange={setOpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lås {navnM(maaned)} op</DialogTitle>
            <DialogDescription>De låste tal og månedens automatiske efterreguleringer slettes. Manuelle reguleringer bevares.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1"><Label>Begrundelse</Label><Textarea value={begrundelse} onChange={(e) => setBegrundelse(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpOpen(false)}>Annuller</Button>
            <Button disabled={!begrundelse.trim()} onClick={laasOp}>Lås op</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={regOpen} onOpenChange={setRegOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tilføj regulering — {navnM(maaned)}</DialogTitle>
            <DialogDescription>Udbetales sammen med {navnM(maaned)}. Brug minus for fradrag.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1"><Label>Sælger</Label>
              <Select value={ny.user_id} onValueChange={(v) => setNy({ ...ny, user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Vælg sælger" /></SelectTrigger>
                <SelectContent>{saelgere.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.navn}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Lønart</Label>
                <Select value={ny.loenart} onValueChange={(v) => setNy({ ...ny, loenart: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1561">1561 · Provision 1</SelectItem><SelectItem value="1563">1563 · Provision 2</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Beløb (kr.)</Label><Input inputMode="decimal" value={ny.beloeb} onChange={(e) => setNy({ ...ny, beloeb: e.target.value })} placeholder="fx -500" /></div>
            </div>
            <div className="space-y-1"><Label>Tekst</Label><Input value={ny.tekst} onChange={(e) => setNy({ ...ny, tekst: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegOpen(false)}>Annuller</Button>
            <Button onClick={gemReg}>Gem</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
