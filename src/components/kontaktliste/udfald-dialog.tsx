import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { AARSAGER, UDFALD_LABEL, VALGBARE_UDFALD, ringIgenHurtigvalg, type Udfald } from "@/lib/telemarketing";
import { formatTelefon, telHref } from "@/lib/telefon";

export type UdfaldKontakt = { id: string; navn: string; titel: string | null; telefon?: string | null; email?: string | null };
export type UdfaldVirksomhed = { company_id: string; navn: string; telefon: string | null; kontakter: UdfaldKontakt[] };

/** Gemmer et udfald via den fælles databasefunktion (samme for bureau, sælger og admin). */
export async function registrerUdfald(listId: string, companyId: string, udfald: Udfald, extra: Record<string, unknown> = {}) {
  const { data, error } = await (supabase as any).rpc("registrer_udfald", { _list: listId, _company: companyId, _udfald: udfald, ...extra });
  if (error) { toast.error(error.message); return null; }
  toast.success(udfald === "note" ? "Note gemt" : udfald === "moede_booket" ? `Møde booket – sendt til ${data?.saelger ?? "sælger"}` : `Registreret: ${UDFALD_LABEL[udfald]}`);
  return data as { id: string; status: string; saelger: string | null };
}

/** "Registrér udfald" – samme dialog i ringevisningen og i listevisningen. */
export function UdfaldDialog({ listId, virksomhed, initial, opretKontakt, onClose, onDone }: {
  listId: string;
  virksomhed: UdfaldVirksomhed;
  initial?: Udfald;
  opretKontakt: (navn: string, titel: string | null) => Promise<string | null>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [udfald, setUdfald] = useState<Udfald | null>(initial ?? null);
  const [tid, setTid] = useState("");
  const [aarsag, setAarsag] = useState("");
  const [note, setNote] = useState("");
  const [kontakt, setKontakt] = useState("");
  const [nyKontakt, setNyKontakt] = useState("");
  const [busy, setBusy] = useState(false);
  const spoerg = virksomhed.kontakter[0];

  const send = async () => {
    if (!udfald) return toast.error("Vælg et udfald");
    if (udfald === "note" && !note.trim()) return toast.error("Skriv en note");
    if (udfald === "oensker_ikke_kontakt" && !confirm("Virksomheden udelukkes fra alle fremtidige lister. Fortsæt?")) return;
    const extra: Record<string, unknown> = { _note: note.trim() || null };
    if (udfald === "ring_igen") {
      if (!tid) return toast.error("Vælg dato og tid");
      extra._ring_igen_at = new Date(tid).toISOString();
    }
    if (udfald === "ikke_interesseret") {
      if (!aarsag) return toast.error("Vælg en årsag");
      if (aarsag === "andet" && !note.trim()) return toast.error("Skriv en note ved \"Andet\"");
      extra._aarsag = aarsag;
    }
    setBusy(true);
    if (udfald === "moede_booket") {
      let kid = kontakt;
      if (kid === "ny") {
        if (!nyKontakt.trim()) { setBusy(false); return toast.error("Skriv kontaktpersonens navn"); }
        kid = (await opretKontakt(nyKontakt.trim(), null)) ?? "";
      }
      if (!tid || !kid || !note.trim()) { setBusy(false); return toast.error("Udfyld dato, tid, kontaktperson og note"); }
      extra._moede_at = new Date(tid).toISOString();
      extra._contact_id = kid;
    }
    const r = await registrerUdfald(listId, virksomhed.company_id, udfald, extra);
    setBusy(false);
    if (r) onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Registrér udfald · {virksomhed.navn}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/40 p-3">
          {virksomhed.telefon ? (
            <a href={telHref(virksomhed.telefon)}>
              <Button size="lg" className="font-semibold"><Phone className="h-4 w-4 mr-2" />{formatTelefon(virksomhed.telefon)}</Button>
            </a>
          ) : <span className="text-sm text-destructive">Intet telefonnummer</span>}
          {spoerg && (
            <div className="text-sm">
              <div className="text-xs uppercase text-muted-foreground">Spørg efter</div>
              <div className="font-medium">{spoerg.navn}</div>
              {spoerg.titel && <div className="text-xs text-muted-foreground">{spoerg.titel}</div>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {VALGBARE_UDFALD.map((u) => (
            <Button key={u} type="button" variant={udfald === u ? "default" : "outline"} size="sm" className="justify-start" onClick={() => setUdfald(u)}>
              {UDFALD_LABEL[u]}
            </Button>
          ))}
        </div>

        {udfald && (
          <div className="space-y-3">
            {(udfald === "ring_igen" || udfald === "moede_booket") && (
              <div><Label>{udfald === "moede_booket" ? "Mødetidspunkt" : "Ring igen"}</Label>
                {udfald === "ring_igen" && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {ringIgenHurtigvalg().map((h) => {
                      const v = tilLokal(h.d);
                      return <Button key={h.l} type="button" size="sm" variant={tid === v ? "default" : "outline"} className="h-7 text-xs" onClick={() => setTid(v)}>{h.l}</Button>;
                    })}
                    <span className="text-xs text-muted-foreground self-center">eller vælg selv:</span>
                  </div>
                )}
                <Input type="datetime-local" value={tid} onChange={(e) => setTid(e.target.value)} /></div>
            )}
            {udfald === "ikke_interesseret" && (
              <div><Label>Årsag (påkrævet)</Label>
                <Select value={aarsag} onValueChange={setAarsag}>
                  <SelectTrigger aria-label="Årsag"><SelectValue placeholder="Vælg årsag" /></SelectTrigger>
                  <SelectContent>{AARSAGER.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}</SelectContent>
                </Select></div>
            )}
            {udfald === "moede_booket" && (
              <div><Label>Kontaktperson</Label>
                <Select value={kontakt} onValueChange={setKontakt}>
                  <SelectTrigger aria-label="Kontaktperson"><SelectValue placeholder="Vælg kontaktperson" /></SelectTrigger>
                  <SelectContent>
                    {virksomhed.kontakter.map((k) => <SelectItem key={k.id} value={k.id}>{k.navn}{k.titel ? ` – ${k.titel}` : ""}</SelectItem>)}
                    <SelectItem value="ny">+ Ny kontaktperson</SelectItem>
                  </SelectContent>
                </Select>
                {kontakt === "ny" && <Input className="mt-2" placeholder="Navn" value={nyKontakt} onChange={(e) => setNyKontakt(e.target.value)} />}
              </div>
            )}
            <div><Label htmlFor="udfald-note">Note{udfald === "note" || udfald === "moede_booket" || (udfald === "ikke_interesseret" && aarsag === "andet") ? " (påkrævet)" : " (valgfri)"}</Label>
              <Textarea id="udfald-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annullér</Button>
          <Button disabled={busy || !udfald} onClick={send}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Gem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function tilLokal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
