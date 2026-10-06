import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MutationGate } from "@/components/mutation-gate";

export const STOP_AARSAG_LABEL: Record<string, string> = {
  tabt_til_konkurrent: "Tabt til konkurrent",
  lukket: "Lukket / ophørt",
  oensker_ikke_kontakt: "Ønsker ikke kontakt",
};

type Stop = {
  id: string;
  location_id: string | null;
  aarsag: string;
  note: string | null;
  oprettet_af: string | null;
  oprettet_at: string;
};
type Lok = { id: string; address: string | null; city: string | null; visma_delivery_no: string | null };

const lokTekst = (l?: Lok) =>
  l ? [l.address, l.city].filter(Boolean).join(", ") + (l.visma_delivery_no ? ` · kundenr. ${l.visma_delivery_no}` : "") : "";

/** Viser aktive "Stoppet"-markeringer og lader alle brugere oprette/fjerne dem. Salgstal ændres ikke. */
export function KundeStop({ companyId, onChanged }: { companyId: string; onChanged?: () => void }) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [lok, setLok] = useState<Lok[]>([]);
  const [navne, setNavne] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const [{ data: s }, { data: l }] = await Promise.all([
      (supabase as any)
        .from("kunde_stop")
        .select("id, location_id, aarsag, note, oprettet_af, oprettet_at")
        .eq("company_id", companyId)
        .is("fjernet_at", null)
        .order("oprettet_at", { ascending: false }),
      supabase.from("locations").select("id, address, city, visma_delivery_no").eq("company_id", companyId),
    ]);
    const rows = (s ?? []) as Stop[];
    setStops(rows);
    setLok((l ?? []) as Lok[]);
    const ids = Array.from(new Set(rows.map((r) => r.oprettet_af).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      setNavne(Object.fromEntries(((p ?? []) as any[]).map((x) => [x.id, x.full_name])));
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fjern = async (s: Stop) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any)
      .from("kunde_stop")
      .update({ fjernet_at: new Date().toISOString(), fjernet_af: u.user?.id ?? null })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Markering fjernet");
    await load();
    onChanged?.();
  };

  return (
    <div className="space-y-1.5">
      {stops.map((s) => (
        <div key={s.id} className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-foreground">
              Stoppet · {STOP_AARSAG_LABEL[s.aarsag] ?? s.aarsag}
              {s.location_id ? ` · ${lokTekst(lok.find((l) => l.id === s.location_id))}` : " · hele virksomheden"}
            </div>
            <div className="text-muted-foreground">
              {navne[s.oprettet_af ?? ""] ?? "Ukendt"} · {new Date(s.oprettet_at).toLocaleDateString("da-DK")}
              {s.note ? ` · ${s.note}` : ""}
            </div>
          </div>
          <MutationGate>
            <button type="button" className="text-primary hover:underline shrink-0" onClick={() => void fjern(s)}>
              Fjern
            </button>
          </MutationGate>
        </div>
      ))}
      <MutationGate>
        <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <Ban className="h-4 w-4 mr-1.5" /> Markér som stoppet
        </Button>
      </MutationGate>
      {open && (
        <StopDialog
          companyId={companyId}
          lokationer={lok}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await load();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function StopDialog({
  companyId,
  lokationer,
  onClose,
  onSaved,
}: {
  companyId: string;
  lokationer: Lok[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<string>("__alle");
  const [aarsag, setAarsag] = useState("tabt_til_konkurrent");
  const [konkurrenter, setKonkurrenter] = useState<{ id: string; name: string }[]>([]);
  const [konkId, setKonkId] = useState("");
  const [nyNavn, setNyNavn] = useState("");
  const [udloeb, setUdloeb] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase
      .from("competitors")
      .select("id, name")
      .order("name")
      .then(({ data }) => setKonkurrenter((data ?? []) as any));
  }, []);

  const gem = async () => {
    if (aarsag === "tabt_til_konkurrent" && !konkId) return toast.error("Vælg konkurrenten");
    if (konkId === "__ny" && !nyNavn.trim()) return toast.error("Skriv konkurrentens navn");
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      const locationId = scope === "__alle" ? null : scope;
      let assignmentId: string | null = null;
      if (aarsag === "tabt_til_konkurrent") {
        let id = konkId;
        if (id === "__ny") {
          const navn = nyNavn.trim();
          const fundet = konkurrenter.find((c) => c.name.toLowerCase() === navn.toLowerCase());
          if (fundet) id = fundet.id;
          else {
            const { data: ny, error } = await supabase
              .from("competitors")
              .insert({ name: navn, created_by: uid })
              .select("id")
              .single();
            if (error) throw error;
            id = ny.id;
          }
        }
        const { data: a, error: aErr } = await supabase
          .from("competitor_assignments")
          .insert({
            company_id: companyId,
            location_id: locationId,
            competitor_id: id,
            contract_expires_at: udloeb || null,
            notes: note.trim() || null,
            registered_by: uid as string,
          })
          .select("id")
          .single();
        if (aErr) throw aErr;
        assignmentId = a.id;
      }
      const { error } = await (supabase as any).from("kunde_stop").insert({
        company_id: companyId,
        location_id: locationId,
        aarsag,
        competitor_assignment_id: assignmentId,
        note: note.trim() || null,
      });
      if (error) throw error;
      toast.success("Markeret som stoppet");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke gemme");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Markér som stoppet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {lokationer.length > 1 && (
            <div>
              <Label>Gælder</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__alle">Hele virksomheden</SelectItem>
                  {lokationer.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{lokTekst(l) || "Lokation"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Årsag</Label>
            <Select value={aarsag} onValueChange={setAarsag}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STOP_AARSAG_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {aarsag === "tabt_til_konkurrent" && (
            <>
              <div>
                <Label>Konkurrent</Label>
                <Select value={konkId} onValueChange={setKonkId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Vælg konkurrent" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ny">+ Ny konkurrent</SelectItem>
                    {konkurrenter.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {konkId === "__ny" && (
                  <Input className="mt-2" placeholder="Konkurrentens navn" value={nyNavn} onChange={(e) => setNyNavn(e.target.value)} />
                )}
              </div>
              <div>
                <Label>Konkurrentaftalen udløber (hvis kendt)</Label>
                <Input type="date" className="mt-1" value={udloeb} onChange={(e) => setUdloeb(e.target.value)} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Kunden kommer på "Vind tilbage" 6 måneder før udløb — eller efter 12 måneder uden dato.
                </p>
              </div>
            </>
          )}
          {aarsag === "lukket" && (
            <p className="text-xs text-muted-foreground">Markeres kun manuelt — CVR-data lukker aldrig en kunde automatisk.</p>
          )}
          <div>
            <Label>Note (valgfri)</Label>
            <Textarea className="mt-1" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="text-[11px] text-muted-foreground">Salgstal og historik ændres ikke — kunden skjules kun fra opfølgningslister.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annullér</Button>
          <Button onClick={() => void gem()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Gem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
