import { formatTelefon, telHref, webHref } from "@/lib/telefon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Phone, Plus, Pencil, CalendarCheck, Mail, Globe } from "lucide-react";
import { toast } from "sonner";
import { AARSAGER, UDFALD_LABEL, byggKoe, ingenSvarIRaekke, type Udfald } from "@/lib/telemarketing";
import { UdfaldDialog, registrerUdfald } from "@/components/kontaktliste/udfald-dialog";

type Kontakt = { id: string; navn: string; titel: string | null; telefon: string | null; email: string | null };
type Opkald = { id: string; at: string; udfald: Udfald; aarsag: string | null; note: string | null; ring_igen_at: string | null; moede_at: string | null; bruger: string | null };
type V = {
  assignment_id: string; status: string; company_id: string; navn: string; cvr: string | null;
  adresse: string | null; postnr: string | null; by: string | null; telefon: string | null; email: string | null;
  hjemmeside: string | null; branche: string | null; ansatte: number | null; moede_saelger: string | null;
  kontakter: Kontakt[]; opkald: Opkald[];
};

const rpc = (fn: string, args: Record<string, unknown>) => (supabase as any).rpc(fn, args);
const fmt = (s: string) => new Date(s).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" });

export function Ringevisning({ listId }: { listId: string }) {
  const [data, setData] = useState<{ liste: { navn: string; manus: string | null }; virksomheder: V[] } | null>(null);
  const [valgt, setValgt] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | Udfald>(null);
  const [kontaktForm, setKontaktForm] = useState<Partial<Kontakt> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: d, error } = await rpc("tm_virksomheder", { _list: listId });
    if (error) { toast.error("Listen kunne ikke hentes"); return; }
    setData(d);
  }, [listId]);
  useEffect(() => { void load(); }, [load]);

  const koe = useMemo(() => (data ? byggKoe(data.virksomheder) : []), [data]);
  const aktuel = useMemo(() => {
    if (!data) return null;
    return data.virksomheder.find((v) => v.company_id === valgt) ?? koe[0] ?? null;
  }, [data, valgt, koe]);

  const registrer = async (udfald: Udfald, extra: Record<string, unknown> = {}) => {
    if (!aktuel) return;
    setBusy(true);
    const r = await registrerUdfald(listId, aktuel.company_id, udfald, extra);
    setBusy(false);
    if (!r) return false;
    setDialog(null);
    setValgt(null);
    await load();
    return true;
  };

  if (!data) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;

  const ingenSvar = aktuel ? ingenSvarIRaekke(aktuel.opkald) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{data.liste.navn}</h1>
        {data.liste.manus && (
          <Card className="mt-2 p-3 text-sm whitespace-pre-wrap bg-muted/40">{data.liste.manus}</Card>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Card className="p-2 max-h-[70vh] overflow-auto">
          <div className="px-2 py-1 text-xs text-muted-foreground">Kø · {koe.length} af {data.virksomheder.length}</div>
          {koe.map((v, i) => (
            <button key={v.company_id} onClick={() => setValgt(v.company_id)}
              className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted ${aktuel?.company_id === v.company_id ? "bg-muted font-medium" : ""}`}>
              <span className="text-muted-foreground tabular-nums mr-2">{i + 1}.</span>{v.navn}
              {v.opkald[0]?.udfald === "ring_igen" && <Badge variant="outline" className="ml-1 text-[10px]">Ring igen</Badge>}
            </button>
          ))}
          {koe.length === 0 && <div className="p-3 text-sm text-muted-foreground">Køen er tom 🎉</div>}
        </Card>

        {aktuel ? (
          <Card className="p-4 space-y-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold">{aktuel.navn}</h2>
                <div className="text-sm text-muted-foreground">
                  {[aktuel.adresse, [aktuel.postnr, aktuel.by].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                </div>
                <div className="text-sm text-muted-foreground">
                  {aktuel.branche ?? "Ukendt branche"} · {aktuel.ansatte != null ? `${aktuel.ansatte} ansatte` : "ansatte ukendt"}
                  {aktuel.cvr && ` · CVR ${aktuel.cvr}`}
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 flex flex-wrap items-center gap-x-6 gap-y-2" data-testid="kontaktinfo">
              {aktuel.telefon ? (
                <a href={telHref(aktuel.telefon)}>
                  <Button size="lg" className="h-12 px-6 text-lg font-semibold">
                    <Phone className="h-5 w-5 mr-2" />{formatTelefon(aktuel.telefon)}
                  </Button>
                </a>
              ) : (
                <Badge variant="destructive">Intet telefonnummer</Badge>
              )}
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {aktuel.email
                    ? <a className="text-primary hover:underline" href={`mailto:${aktuel.email}`}>{aktuel.email}</a>
                    : <span className="text-muted-foreground">Ingen e-mail</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  {aktuel.hjemmeside
                    ? <a className="text-primary hover:underline" href={webHref(aktuel.hjemmeside)} target="_blank" rel="noreferrer">{aktuel.hjemmeside}</a>
                    : <span className="text-muted-foreground">Ingen hjemmeside</span>}
                </div>
              </div>
              {aktuel.kontakter[0] && (
                <div className="text-sm">
                  <div className="text-xs uppercase text-muted-foreground">Spørg efter</div>
                  <div className="font-medium">{aktuel.kontakter[0].navn}</div>
                  {aktuel.kontakter[0].titel && <div className="text-xs text-muted-foreground">{aktuel.kontakter[0].titel}</div>}
                </div>
              )}
            </div>

            {ingenSvar >= 3 && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm flex items-center gap-3">
                <span className="flex-1">{ingenSvar} × ingen svar. Foreslået status: Ikke opnået.</span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => registrer("ikke_opnaaet")}>Sæt Ikke opnået</Button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => registrer("ingen_svar")}>Ingen svar</Button>
              <Button variant="outline" disabled={busy} onClick={() => setDialog("ring_igen")}>Optaget / ring igen</Button>
              <Button variant="outline" disabled={busy} onClick={() => registrer("forkert_nummer")}>Forkert nummer</Button>
              <Button variant="outline" disabled={busy} onClick={() => setDialog("ikke_interesseret")}>Ikke interesseret</Button>
              <Button variant="outline" disabled={busy} onClick={() => { if (confirm("Virksomheden udelukkes fra alle fremtidige lister. Fortsæt?")) void registrer("oensker_ikke_kontakt"); }}>Ønsker ikke kontakt</Button>
              <Button variant="outline" disabled={busy} onClick={() => setDialog("tilbud_oensket")}>Ønsker tilbud/materiale</Button>
              <Button disabled={busy} onClick={() => setDialog("moede_booket")}><CalendarCheck className="h-4 w-4 mr-2" />Møde booket</Button>
            </div>
            {aktuel.moede_saelger && <div className="text-xs text-muted-foreground">Møder går til: {aktuel.moede_saelger}</div>}

            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-medium text-sm">Kontaktpersoner</h3>
                <Button size="sm" variant="ghost" onClick={() => setKontaktForm({})}><Plus className="h-4 w-4 mr-1" />Ny</Button>
              </div>
              {aktuel.kontakter.length === 0 && <div className="text-sm text-muted-foreground">Ingen kontaktpersoner.</div>}
              {aktuel.kontakter.map((k) => (
                <div key={k.id} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
                  <span className="font-medium">{k.navn}</span>
                  {k.titel && <span className="text-muted-foreground">{k.titel}</span>}
                  {k.telefon && <a className="underline" href={`tel:${k.telefon.replace(/\s/g, "")}`}>{k.telefon}</a>}
                  {k.email && <span className="text-muted-foreground">{k.email}</span>}
                  <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={() => setKontaktForm(k)}><Pencil className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>

            <div>
              <h3 className="font-medium text-sm mb-1">Tidligere opkald på denne liste</h3>
              {aktuel.opkald.length === 0 && <div className="text-sm text-muted-foreground">Ingen endnu.</div>}
              {aktuel.opkald.map((o) => (
                <div key={o.id} className="text-sm py-1 border-b last:border-0">
                  <span className="tabular-nums text-muted-foreground mr-2">{fmt(o.at)}</span>
                  <span className="font-medium">{UDFALD_LABEL[o.udfald]}</span>
                  {o.aarsag && <span> · {AARSAGER.find((a) => a.v === o.aarsag)?.l ?? o.aarsag}</span>}
                  {o.ring_igen_at && <span> · ring {fmt(o.ring_igen_at)}</span>}
                  {o.moede_at && <span> · møde {fmt(o.moede_at)}</span>}
                  {o.bruger && <span className="text-muted-foreground"> · {o.bruger}</span>}
                  {o.note && <div className="text-muted-foreground">{o.note}</div>}
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="p-6 text-sm text-muted-foreground">Vælg en virksomhed i køen.</Card>
        )}
      </div>

      {aktuel && dialog && (
        <UdfaldDialog listId={listId} initial={dialog}
          virksomhed={{ company_id: aktuel.company_id, navn: aktuel.navn, telefon: aktuel.telefon, kontakter: aktuel.kontakter }}
          opretKontakt={async (navn, titel) => {
            const { data: id, error } = await rpc("tm_gem_kontakt", { _list: listId, _company: aktuel.company_id, _id: null, _navn: navn, _titel: titel, _telefon: null, _email: null });
            if (error) { toast.error(error.message); return null; }
            return id as string;
          }}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); setValgt(null); void load(); }} />
      )}
      {aktuel && kontaktForm && (
        <KontaktDialog initial={kontaktForm} onClose={() => setKontaktForm(null)}
          onSave={async (k) => {
            const { error } = await rpc("tm_gem_kontakt", { _list: listId, _company: aktuel.company_id, _id: k.id ?? null, _navn: k.navn ?? "", _titel: k.titel || null, _telefon: k.telefon || null, _email: k.email || null });
            if (error) { toast.error(error.message); return; }
            setKontaktForm(null);
            setValgt(aktuel.company_id);
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
