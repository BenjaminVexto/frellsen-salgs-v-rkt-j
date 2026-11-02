import { labelFor } from "@/lib/activity-types";
import { formatTelefon, telHref, webHref } from "@/lib/telefon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Phone, Plus, Pencil, CalendarCheck, Mail, Globe, X, ArrowRight, ArrowUpDown, Search, AlarmClock } from "lucide-react";
import { toast } from "sonner";
import {
  AARSAGER, STATUS_GRUPPER, UDFALD_LABEL, iStatusGruppe, ringIgenIDag, ringIgenTid, standardRang, statusTekst,
  type StatusGruppe, type Udfald,
} from "@/lib/telemarketing";
import { UdfaldDialog, registrerUdfald } from "@/components/kontaktliste/udfald-dialog";
import { saelgerAktiv, matcherSaelgerFilter, type CallerOverblik, type VirksomhedsHistorik, type SaelgerFilter } from "@/lib/caller-saelger";

type Kontakt = { id: string; navn: string; titel: string | null; telefon: string | null; email: string | null };
type Opkald = { id: string; at: string; udfald: Udfald; aarsag: string | null; note: string | null; ring_igen_at: string | null; moede_at: string | null; bruger: string | null };
type V = {
  assignment_id: string; status: string; status_aarsag: string | null; antal_forsoeg: number | null; company_id: string; navn: string; cvr: string | null;
  adresse: string | null; postnr: string | null; by: string | null; telefon: string | null; email: string | null;
  hjemmeside: string | null; branche: string | null; ansatte: number | null; moede_saelger: string | null;
  kontakter: Kontakt[]; opkald: Opkald[];
};
type Liste = { navn: string; manus: string | null; moede_saelger: string | null; moede_modtager: string | null };

const rpc = (fn: string, args: Record<string, unknown>) => (supabase as any).rpc(fn, args);
const fmt = (s: string) => new Date(s).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" });
const kl = (s: string) => new Date(s).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
const dato = (s: string) => new Date(s).toLocaleDateString("da-DK");
const aktivitetLabel = (s: string) => s === "konkurrentaftale" ? "Konkurrentaftale" : labelFor(s);
function ringTekst(t: string, nu: Date) {
  const d = new Date(t);
  const samme = d.toDateString() === nu.toDateString();
  const imorgen = new Date(nu); imorgen.setDate(imorgen.getDate() + 1);
  if (samme) return `i dag ${kl(t)}`;
  if (d.toDateString() === imorgen.toDateString()) return `i morgen ${kl(t)}`;
  return fmt(t);
}

type SortKey = "standard" | "navn" | "telefon" | "kontakt" | "ansatte" | "status" | "note" | "ring";

/** Bureauets overblik: alle virksomheder på listen i en tabel + detaljepanel. Data kun via tm_*-funktioner. */
export function Ringevisning({ listId }: { listId: string }) {
  const [data, setData] = useState<{ liste: Liste; virksomheder: V[] } | null>(null);
  const [valgt, setValgt] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | { cid: string; u?: Udfald }>(null);
  const [kontaktForm, setKontaktForm] = useState<Partial<Kontakt> | null>(null);
  const [busy, setBusy] = useState(false);
  const [gruppe, setGruppe] = useState<StatusGruppe>("alle");
  const [hurtig, setHurtig] = useState<null | "idag" | "ikke_ringet">(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "standard", dir: 1 });
  const [nu, setNu] = useState(() => new Date());
  const [friNote, setFriNote] = useState("");
  const [seneste, setSeneste] = useState<Record<string, { at: string; bruger: string | null; note: string | null; type?: string | null }>>({});
  const [overblik, setOverblik] = useState<Record<string, CallerOverblik>>({});
  const [saelgerFilter, setSaelgerFilter] = useState<SaelgerFilter>("alle");
  const [historik, setHistorik] = useState<VirksomhedsHistorik[]>([]);
  const [historikBusy, setHistorikBusy] = useState(false);
  const [historikFejl, setHistorikFejl] = useState(false);
  const [flereHistorik, setFlereHistorik] = useState(false);
  const [historikOffset, setHistorikOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => { const t = setInterval(() => setNu(new Date()), 60000); return () => clearInterval(t); }, []);

  const load = useCallback(async () => {
    const { data: d, error } = await rpc("tm_virksomheder", { _list: listId });
    if (error) { toast.error("Listen kunne ikke hentes"); return; }
    setData(d);
    setNu(new Date());
    const [{ data: sa }, { data: so, error: soError }] = await Promise.all([
      rpc("tm_seneste_aktivitet", { _list: listId }),
      rpc("tm_saelger_overblik", { _list: listId }),
    ]);
    setSeneste((sa ?? {}) as any);
    if (soError) toast.error("Sælgerindsats kunne ikke hentes: " + soError.message);
    setOverblik(so ?? {});
    setHistorikOffset(0);
    setRefresh(r => r + 1);
  }, [listId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let cancelled = false;
    if (!valgt) { setHistorik([]); return; }
    setHistorikBusy(true);
    setHistorikFejl(false);
    if (historikOffset === 0) setHistorik([]);
    void rpc("tm_virksomhed_historik", { _list: listId, _company: valgt, _offset: historikOffset }).then(({ data: h, error }: { data: unknown; error: { message: string } | null }) => {
      if (cancelled) return;
      setHistorikBusy(false);
      if (error) { setHistorikFejl(true); toast.error("Historikken kunne ikke hentes: " + error.message); return; }
      const rows = (h ?? []) as VirksomhedsHistorik[];
      setHistorik(prev => historikOffset === 0 ? rows : [...prev, ...rows]);
      setFlereHistorik(rows.length === 50);
    });
    return () => { cancelled = true; };
  }, [valgt, listId, historikOffset, refresh]);
  const vaelg = (id: string | null) => { setHistorikOffset(0); setValgt(id); };

  const alle = data?.virksomheder ?? [];
  const tal = useMemo(() => {
    const ringIdag = alle.filter((v) => ringIgenIDag(ringIgenTid(v), nu));
    return {
      i_alt: alle.length,
      ringet: alle.filter((v) => v.opkald.some((o) => o.udfald !== "note")).length,
      idag: ringIdag.length,
      overskredet: ringIdag.filter((v) => { const tid = ringIgenTid(v); return tid ? new Date(tid) <= nu : false; }).length,
      moeder: alle.filter((v) => v.status === "møde_booket").length,
      tilbud: alle.filter((v) => v.status === "tilbud_oensket").length,
      ikkeRinget: alle.filter((v) => !v.opkald.some((o) => o.udfald !== "note")).length,
      saelgerAktive: alle.filter(v => saelgerAktiv(overblik[v.company_id]?.seneste_saelger, nu)).length,
    };
  }, [alle, nu, overblik]);

  const vist = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sd = s.replace(/\D/g, "");
    let arr = alle.filter((v) => iStatusGruppe(v.status, gruppe));
    arr = arr.filter(v => matcherSaelgerFilter(saelgerAktiv(overblik[v.company_id]?.seneste_saelger, nu), saelgerFilter));
    if (hurtig === "idag") arr = arr.filter((v) => ringIgenIDag(ringIgenTid(v), nu));
    if (hurtig === "ikke_ringet") arr = arr.filter((v) => !v.opkald.some((o) => o.udfald !== "note"));
    if (s) arr = arr.filter((v) => v.navn.toLowerCase().includes(s) || (v.by ?? "").toLowerCase().includes(s)
      || (sd.length >= 3 && (v.telefon ?? "").replace(/\D/g, "").includes(sd)));
    const key = (v: V): string | number => {
      switch (sort.k) {
        case "navn": return v.navn.toLowerCase();
        case "telefon": return v.telefon ?? "";
        case "kontakt": return (v.kontakter[0]?.navn ?? "").toLowerCase();
        case "ansatte": return v.ansatte ?? -1;
        case "status": return v.status;
        case "note": return seneste[v.company_id]?.at ?? "";
        case "ring": return ringIgenTid(v) ?? "9999";
        default: { const [r, t] = standardRang(v, nu); return `${r}|${t}`; }
      }
    };
    return [...arr].sort((a, b) => {
      const x = key(a), y = key(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [alle, gruppe, hurtig, q, sort, nu, seneste, overblik, saelgerFilter]);

  const aktuel = alle.find((v) => v.company_id === valgt) ?? null;
  const aktuelOverblik = aktuel ? overblik[aktuel.company_id] : undefined;
  const naeste = () => {
    const i = vist.findIndex((v) => v.company_id === valgt);
    const n = vist[i + 1] ?? vist[0];
    if (n) vaelg(n.company_id);
  };

  const registrer = async (udfald: Udfald, extra: Record<string, unknown> = {}) => {
    if (!aktuel) return;
    setBusy(true);
    const r = await registrerUdfald(listId, aktuel.company_id, udfald, extra);
    setBusy(false);
    if (r) await load();
  };
  const gemNote = async () => {
    if (!friNote.trim()) return;
    await registrer("note", { _note: friNote.trim() });
    setFriNote("");
  };

  if (!data) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;

  const SH = ({ k, l, className }: { k: SortKey; l: string; className?: string }) => (
    <TableHead className={className}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {l}<ArrowUpDown className={`h-3 w-3 ${sort.k === k ? "text-foreground" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
  const dialogV = dialog ? alle.find((v) => v.company_id === dialog.cid) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold">{data.liste.navn}</h1>
          <div className="text-sm text-muted-foreground tabular-nums" data-testid="taelling">
            {tal.i_alt} i alt · {tal.ringet} ringet · {tal.idag} ring igen i dag{tal.overskredet ? ` (${tal.overskredet} overskredet)` : ""} · {tal.moeder} {tal.moeder === 1 ? "møde" : "møder"} · {tal.tilbud} tilbud
          </div>
        </div>
        {data.liste.moede_saelger || data.liste.moede_modtager === "distrikt" ? (
          <div className="text-sm text-muted-foreground">Møder går til: <span className="text-foreground font-medium">{data.liste.moede_modtager === "fast" ? data.liste.moede_saelger : "distriktssælgeren"}</span></div>
        ) : null}
      </div>
      {data.liste.manus && <Card className="p-3 text-sm whitespace-pre-wrap bg-muted/40">{data.liste.manus}</Card>}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_GRUPPER.map((g) => (
          <Button key={g.v} size="sm" variant={gruppe === g.v ? "default" : "outline"} className="h-8" onClick={() => setGruppe(g.v)}>{g.l}</Button>
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        <Button size="sm" variant={hurtig === "idag" ? "default" : "outline"} className="h-8" onClick={() => { setHurtig(hurtig === "idag" ? null : "idag"); if (hurtig !== "idag") setSort({ k: "ring", dir: 1 }); }}>
          <AlarmClock className="h-4 w-4 mr-1" />Ring igen i dag ({tal.idag}){tal.overskredet ? <span className="ml-1 text-destructive">· {tal.overskredet} overskredet</span> : null}
        </Button>
        <Button size="sm" variant={hurtig === "ikke_ringet" ? "default" : "outline"} className="h-8" onClick={() => setHurtig(hurtig === "ikke_ringet" ? null : "ikke_ringet")}>Ikke ringet endnu ({tal.ikkeRinget})</Button>
        <Button size="sm" variant={saelgerFilter === "kun" ? "default" : "outline"} className="h-8" aria-pressed={saelgerFilter === "kun"} onClick={() => setSaelgerFilter(saelgerFilter === "kun" ? "alle" : "kun")}>Sælger aktiv ({tal.saelgerAktive})</Button>
        <Button size="sm" variant={saelgerFilter === "uden" ? "secondary" : "outline"} className="h-8" aria-pressed={saelgerFilter === "uden"} onClick={() => setSaelgerFilter(saelgerFilter === "uden" ? "alle" : "uden")}>Udelad sælgeraktive</Button>
        <div className="relative ml-auto w-64">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="Søg navn, by, telefon" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className={`grid gap-3 ${aktuel ? "lg:grid-cols-[minmax(0,1fr)_440px]" : ""}`}>
        <Card className="overflow-auto max-h-[calc(100vh-260px)]">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <SH k="navn" l="Virksomhed" />
                <SH k="telefon" l="Telefon / e-mail" />
                <SH k="kontakt" l="Spørg efter" />
                <SH k="ansatte" l="Ansatte" />
                <SH k="status" l="Status" />
                <SH k="note" l="Seneste aktivitet" />
                <TableHead>Konkurrentaftale</TableHead>
                <SH k="ring" l="Ring igen" className="whitespace-nowrap" />
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vist.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">Ingen virksomheder matcher.</TableCell></TableRow>
              )}
              {vist.map((v) => {
                const t = ringIgenTid(v);
                const over = t ? new Date(t) <= nu : false;
                const n = seneste[v.company_id];
                const k = v.kontakter[0];
                return (
                  <TableRow key={v.company_id} onClick={() => vaelg(v.company_id)}
                    className={`cursor-pointer ${valgt === v.company_id ? "bg-muted" : ""}`} data-testid="tm-raekke">
                    <TableCell className="max-w-[220px]">
                      <div className="font-medium truncate" title={v.navn}>
                        {v.navn}
                        {v.hjemmeside && (
                          <a href={webHref(v.hjemmeside)} target="_blank" rel="noreferrer" title={v.hjemmeside} onClick={(e) => e.stopPropagation()}
                            className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-primary"><Globe className="h-3.5 w-3.5" /></a>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{v.by ?? ""}</div>
                      {saelgerAktiv(overblik[v.company_id]?.seneste_saelger, nu) && <Badge variant="secondary" className="mt-1 text-xs whitespace-nowrap">Sælger aktiv</Badge>}
                    </TableCell>
                    <TableCell className="text-sm max-w-[190px]" onClick={(e) => e.stopPropagation()}>
                      {v.telefon ? <a href={telHref(v.telefon)} className="whitespace-nowrap hover:underline">{formatTelefon(v.telefon)}</a> : <span className="text-xs text-muted-foreground">—</span>}
                      {v.email && <a href={`mailto:${v.email}`} className="block truncate text-xs text-muted-foreground hover:underline" title={v.email}>{v.email}</a>}
                    </TableCell>
                    <TableCell className="text-sm max-w-[170px]">
                      {k ? <div title={`${k.navn}${k.titel ? ` · ${k.titel}` : ""}`}><div className="truncate">{k.navn}</div>{k.titel && <div className="text-xs text-muted-foreground truncate">{k.titel}</div>}</div> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{v.ansatte ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={v.status === "møde_booket" || v.status === "tilbud_oensket" ? "default" : "outline"} className="text-xs whitespace-nowrap">
                        {v.status === "forsoegt" ? `Forsøgt ×${v.antal_forsoeg ?? 1}` : v.status === "ring_igen" && t ? `Ring igen · ${ringTekst(t, nu)}` : statusTekst(v.status, v.status_aarsag, v.antal_forsoeg)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[220px]">
                      {n ? (
                        <div className="line-clamp-2" title={n.note ? `${fmt(n.at)}${n.bruger ? ` · ${n.bruger}` : ""} · ${n.note}` : `${labelFor(n.type)} · ${fmt(n.at)}${n.bruger ? ` · ${n.bruger}` : ""}`}>
                          {n.note ? `${fmt(n.at)}${n.bruger ? ` · ${n.bruger}` : ""} · ${n.note}` : `${labelFor(n.type)} · ${fmt(n.at)}${n.bruger ? ` · ${n.bruger}` : ""}`}
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs min-w-[190px]">
                      {overblik[v.company_id]?.aftaler.length ? overblik[v.company_id].aftaler.map(a => <div key={a.id}>{a.konkurrent} · {a.udloeb ? `udløber ${dato(a.udloeb)}` : "udløb ikke oplyst"}</div>) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={`text-xs whitespace-nowrap ${over ? "text-destructive font-medium" : ""}`}>
                      {t ? <>{over && <AlarmClock className="inline h-3 w-3 mr-1" />}{ringTekst(t, nu)}</> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs whitespace-nowrap" onClick={() => setDialog({ cid: v.company_id })}>Registrér udfald</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        {aktuel && (
          <Card className="p-4 space-y-4 overflow-auto max-h-[calc(100vh-260px)]" data-testid="tm-panel">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold">{aktuel.navn}</h2>
                <div className="text-sm text-muted-foreground">{[aktuel.adresse, [aktuel.postnr, aktuel.by].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
                <div className="text-sm text-muted-foreground">
                  {aktuel.branche ?? "Ukendt branche"} · {aktuel.ansatte != null ? `${aktuel.ansatte} ansatte` : "ansatte ukendt"}{aktuel.cvr && ` · CVR ${aktuel.cvr}`}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={naeste}>Næste<ArrowRight className="h-4 w-4 ml-1" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => vaelg(null)} aria-label="Luk"><X className="h-4 w-4" /></Button>
            </div>

            {aktuelOverblik && (aktuelOverblik.seneste_saelger || aktuelOverblik.aftaler.length > 0) && (
              <section className="border-b pb-3 space-y-3" data-testid="saelger-overblik">
                {aktuelOverblik.seneste_saelger && <div className="text-sm"><h3 className="font-medium mb-1">Seneste sælgeraktivitet</h3><div>{aktivitetLabel(aktuelOverblik.seneste_saelger.type)} · {fmt(aktuelOverblik.seneste_saelger.at)}{aktuelOverblik.seneste_saelger.bruger && ` · ${aktuelOverblik.seneste_saelger.bruger}`}</div></div>}
                {aktuelOverblik.aftaler.length > 0 && <div className="text-sm"><h3 className="font-medium mb-1">Konkurrentaftale</h3>{aktuelOverblik.aftaler.map(a => <div key={a.id} className="mb-2 last:mb-0"><div>{a.konkurrent} · {a.udloeb ? `udløber ${dato(a.udloeb)}` : "udløb ikke oplyst"}</div>{a.note && <div className="text-muted-foreground whitespace-pre-wrap break-words">{a.note}</div>}</div>)}</div>}
              </section>
            )}
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2" data-testid="kontaktinfo">
              {aktuel.telefon ? (
                <a href={telHref(aktuel.telefon)}><Button size="lg" className="h-12 px-6 text-lg font-semibold w-full"><Phone className="h-5 w-5 mr-2" />{formatTelefon(aktuel.telefon)}</Button></a>
              ) : <Badge variant="destructive">Intet telefonnummer</Badge>}
              <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" />
                {aktuel.email ? <a className="text-primary hover:underline truncate" href={`mailto:${aktuel.email}`}>{aktuel.email}</a> : <span className="text-muted-foreground">Ingen e-mail</span>}</div>
              <div className="flex items-center gap-2 text-sm"><Globe className="h-4 w-4 text-muted-foreground" />
                {aktuel.hjemmeside ? <a className="text-primary hover:underline truncate" href={webHref(aktuel.hjemmeside)} target="_blank" rel="noreferrer">{aktuel.hjemmeside}</a> : <span className="text-muted-foreground">Ingen hjemmeside</span>}</div>
              {aktuel.kontakter[0] && (
                <div className="text-sm"><span className="text-xs uppercase text-muted-foreground mr-2">Spørg efter</span>
                  <span className="font-medium">{aktuel.kontakter[0].navn}</span>{aktuel.kontakter[0].titel && <span className="text-muted-foreground"> · {aktuel.kontakter[0].titel}</span>}</div>
              )}
              <div className="text-sm">Status: <Badge variant="outline" className="text-xs">{statusTekst(aktuel.status, aktuel.status_aarsag, aktuel.antal_forsoeg)}</Badge></div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => registrer("ingen_svar")}>Ingen svar</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog({ cid: aktuel.company_id, u: "ring_igen" })}>Optaget / ring igen</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog({ cid: aktuel.company_id, u: "forkert_nummer" })}>Forkert nummer</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog({ cid: aktuel.company_id, u: "ikke_interesseret" })}>Ikke interesseret</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog({ cid: aktuel.company_id, u: "oensker_ikke_kontakt" })}>Ønsker ikke kontakt</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog({ cid: aktuel.company_id, u: "tilbud_oensket" })}>Ønsker tilbud/materiale</Button>
              <Button size="sm" className="col-span-2" disabled={busy} onClick={() => setDialog({ cid: aktuel.company_id, u: "moede_booket" })}><CalendarCheck className="h-4 w-4 mr-2" />Møde booket</Button>
            </div>
            {aktuel.moede_saelger && <div className="text-xs text-muted-foreground">Møder går til: {aktuel.moede_saelger}</div>}

            <div className="space-y-2">
              <Label>Fri note (ændrer ikke status)</Label>
              <Textarea rows={2} placeholder="Fx: Receptionen siger, at indkøb er Mette" value={friNote} onChange={(e) => setFriNote(e.target.value)} />
              <Button size="sm" variant="secondary" disabled={busy || !friNote.trim()} onClick={gemNote}>Gem note</Button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-medium text-sm">Kontaktpersoner</h3>
                <Button size="sm" variant="ghost" onClick={() => setKontaktForm({})}><Plus className="h-4 w-4 mr-1" />Ny</Button>
              </div>
              {aktuel.kontakter.length === 0 && <div className="text-sm text-muted-foreground">Ingen kontaktpersoner.</div>}
              {aktuel.kontakter.map((k) => (
                <div key={k.id} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{k.navn}</span>{k.titel && <span className="text-muted-foreground"> · {k.titel}</span>}
                    <div className="text-xs">{k.telefon && <a className="underline mr-2" href={telHref(k.telefon)}>{formatTelefon(k.telefon)}</a>}{k.email && <span className="text-muted-foreground">{k.email}</span>}</div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setKontaktForm(k)}><Pencil className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>

            <div>
              <h3 className="font-medium text-sm mb-1">Historik på virksomheden</h3>
              {!historikBusy && !historikFejl && historik.length === 0 && <div className="text-sm text-muted-foreground">Ingen endnu.</div>}
              {historikFejl && <div className="text-sm text-destructive">Historikken kunne ikke hentes.</div>}
              {historik.map((o) => (
                <div key={o.id} className="text-sm py-1.5 border-b last:border-0">
                  <div><span className="tabular-nums text-muted-foreground mr-2">{fmt(o.at)}</span>
                    <span className="font-medium">{o.udfald ? UDFALD_LABEL[o.udfald as Udfald] ?? o.udfald : aktivitetLabel(o.type)}</span>
                    {o.aarsag && <span> · {AARSAGER.find((a) => a.v === o.aarsag)?.l ?? o.aarsag}</span>}
                    {o.ring_igen_at && <span> · ring {fmt(o.ring_igen_at)}</span>}
                    {o.moede_at && <span> · møde {fmt(o.moede_at)}</span>}
                    {o.bruger && <span className="text-muted-foreground"> · {o.bruger}</span>}</div>
                  {o.denne_liste && <Badge variant="outline" className="text-xs my-1">Denne liste</Badge>}
                  {o.note && <div className="text-muted-foreground whitespace-pre-wrap break-words">{o.note}</div>}
                </div>
              ))}
              {historikBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground my-2" />}
              {flereHistorik && !historikFejl && <Button size="sm" variant="outline" className="mt-2" disabled={historikBusy} onClick={() => setHistorikOffset(o => o + 50)}>Vis flere</Button>}
            </div>
          </Card>
        )}
      </div>

      {dialogV && dialog && (
        <UdfaldDialog listId={listId} initial={dialog.u}
          virksomhed={{ company_id: dialogV.company_id, navn: dialogV.navn, telefon: dialogV.telefon, kontakter: dialogV.kontakter }}
          opretKontakt={async (navn, titel, telefon, email) => {
            const { data: id, error } = await rpc("tm_gem_kontakt", { _list: listId, _company: dialogV.company_id, _id: null, _navn: navn, _titel: titel, _telefon: telefon, _email: email });
            if (error) { toast.error(error.message); return null; }
            return id as string;
          }}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); void load(); }} />
      )}
      {aktuel && kontaktForm && (
        <KontaktDialog initial={kontaktForm} onClose={() => setKontaktForm(null)}
          onSave={async (k) => {
            const { error } = await rpc("tm_gem_kontakt", { _list: listId, _company: aktuel.company_id, _id: k.id ?? null, _navn: k.navn ?? "", _titel: k.titel || null, _telefon: k.telefon || null, _email: k.email || null });
            if (error) { toast.error(error.message); return; }
            setKontaktForm(null);
            await load();
          }} />
      )}
    </div>
  );
}

function KontaktDialog({ initial, onClose, onSave }: { initial: Partial<Kontakt>; onClose: () => void; onSave: (k: Partial<Kontakt>) => void }) {
  const [k, setK] = useState<Partial<Kontakt>>(initial);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial.id ? "Ret kontaktperson" : "Ny kontaktperson"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {(["navn", "titel", "telefon", "email"] as const).map((f) => (
            <div key={f}><Label className="capitalize">{f === "email" ? "E-mail" : f}</Label>
              <Input value={(k[f] as string) ?? ""} onChange={(e) => setK({ ...k, [f]: e.target.value })} /></div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annullér</Button>
          <Button onClick={() => onSave(k)}>Gem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
