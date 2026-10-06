import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Coffee, Pencil, Plus, AlertTriangle, Loader2, Lightbulb, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  COMPETITOR_TYPES,
  COMPETITOR_TYPE_BADGE,
  type CompetitorTypeKey,
} from "@/lib/competitor-types";

type Competitor = { id: string; name: string };

type Lok = { id: string; address: string | null; city: string | null; visma_delivery_no: string | null; is_primary: boolean };

type Assignment = {
  id: string;
  competitor_id: string;
  location_id: string | null;
  contract_expires_at: string | null;
  notes: string | null;
  registered_by: string;
  start_dato: string | null;
  afsluttet_dato: string | null;
  competitors: { name: string; competitor_type: CompetitorTypeKey | null } | null;
};

function lokNavn(l: Lok | undefined): string {
  if (!l) return "Ukendt lokation";
  const adr = [l.address, l.city].filter(Boolean).join(", ");
  return `${adr || "Uden adresse"}${l.visma_delivery_no ? ` · ${l.visma_delivery_no}` : ""}`;
}

function dato(d: string | null) {
  return d ? format(parseISO(d), "d. MMM yyyy", { locale: da }) : "—";
}

function Udloeb({ a, companyId }: { a: Assignment; companyId: string }) {
  if (!a.contract_expires_at) return <span className="text-muted-foreground">Udløb ikke oplyst</span>;
  const dage = differenceInDays(parseISO(a.contract_expires_at), new Date());
  const adv = dage <= 90;
  return (
    <span className={adv ? "text-warning font-medium inline-flex items-center gap-1" : "text-muted-foreground inline-flex items-center gap-1"}>
      {adv && <AlertTriangle className="h-3.5 w-3.5" />}
      {dage < 0 ? "Udløb" : "Udløber"} {dato(a.contract_expires_at)}
      <button
        type="button"
        title="Tilføj til kalender"
        aria-label="Tilføj til kalender"
        onClick={() =>
          import("@/lib/add-to-calendar").then(({ addToCalendar }) =>
            addToCalendar({
              title: `Konkurrentaftale udløber: ${a.competitors?.name ?? ""}`,
              date: a.contract_expires_at!,
              description: a.notes ?? undefined,
              url: `${window.location.origin}/virksomheder/${companyId}`,
              uid: `competitor-${a.id}`,
            }),
          )
        }
        className="ml-1 p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function KonkurrentaftaleSektion({ companyId }: { companyId: string }) {
  const auth = useAuth();
  const [rows, setRows] = useState<Assignment[]>([]);
  const [loks, setLoks] = useState<Lok[]>([]);
  const [navne, setNavne] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [redigér, setRedigér] = useState<Assignment | null>(null);
  const [startLok, setStartLok] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [aRes, lRes] = await Promise.all([
      supabase
        .from("competitor_assignments")
        .select("id, competitor_id, location_id, contract_expires_at, notes, registered_by, start_dato, afsluttet_dato, competitors(name, competitor_type)")
        .eq("company_id", companyId)
        .order("start_dato", { ascending: false }),
      supabase
        .from("locations")
        .select("id, address, city, visma_delivery_no, is_primary")
        .eq("company_id", companyId)
        .order("is_primary", { ascending: false }),
    ]);
    if (aRes.error) toast.error(aRes.error.message);
    const a = (aRes.data ?? []) as unknown as Assignment[];
    setRows(a);
    setLoks((lRes.data ?? []) as Lok[]);
    const ids = Array.from(new Set(a.map((r) => r.registered_by).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      setNavne(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name ?? ""])));
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const aktuelle = rows.filter((r) => !r.afsluttet_dato);
  const historik = rows.filter((r) => r.afsluttet_dato);
  const lokById = new Map(loks.map((l) => [l.id, l]));
  const flereLok = loks.length > 1;
  const typeForste = aktuelle.find((r) => r.competitors?.competitor_type && COMPETITOR_TYPES[r.competitors.competitor_type]);

  const åbnNy = (lokId: string | null) => {
    setRedigér(null);
    setStartLok(lokId);
    setOpen(true);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Coffee className="h-4 w-4" /> Konkurrentaftale{flereLok ? "r pr. lokation" : ""}
        </h2>
        <Button size="sm" variant="outline" onClick={() => åbnNy(null)}>
          <Plus className="h-4 w-4 mr-1" /> Registrér konkurrent
        </Button>
      </div>

      {loading ? (
        <div className="py-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : aktuelle.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen aktuel konkurrentaftale registreret.</p>
      ) : (
        <ul className="divide-y text-sm">
          {aktuelle.map((a) => (
            <li key={a.id} className="py-2 flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                {flereLok && (
                  <div className="text-xs text-muted-foreground">{lokNavn(a.location_id ? lokById.get(a.location_id) : undefined)}</div>
                )}
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  <span>{a.competitors?.name ?? "—"}</span>
                  {a.competitors?.competitor_type && COMPETITOR_TYPES[a.competitors.competitor_type] && (
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${COMPETITOR_TYPE_BADGE[a.competitors.competitor_type]}`}>
                      {COMPETITOR_TYPES[a.competitors.competitor_type].label}
                    </span>
                  )}
                </div>
                <div><Udloeb a={a} companyId={companyId} /></div>
                {a.notes && <p className="italic text-muted-foreground">"{a.notes}"</p>}
                <p className="text-xs text-muted-foreground">
                  Siden {dato(a.start_dato)}{navne[a.registered_by] ? ` · registreret af ${navne[a.registered_by]}` : ""}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setRedigér(a); setStartLok(a.location_id); setOpen(true); }}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Ret / skift
              </Button>
            </li>
          ))}
        </ul>
      )}

      {historik.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Historik ({historik.length})</summary>
          <ul className="mt-2 space-y-1">
            {historik.map((h) => (
              <li key={h.id} className="text-muted-foreground">
                {h.competitors?.name ?? "—"} · {dato(h.start_dato)} – {dato(h.afsluttet_dato)}
                {h.contract_expires_at ? ` · udløb ${dato(h.contract_expires_at)}` : ""}
                {flereLok ? ` · ${lokNavn(h.location_id ? lokById.get(h.location_id) : undefined)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      {typeForste?.competitors?.competitor_type && (() => {
        const type = COMPETITOR_TYPES[typeForste.competitors!.competitor_type!];
        return (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">{type.tagline}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">De spørger sandsynligvis:</div>
                <div className="italic">"{type.identifying_question}"</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Frellsens svar:</div>
                <div className="font-medium">"{type.frellsen_pitch}"</div>
              </div>
            </div>
          </div>
        );
      })()}

      <AssignmentDialog
        open={open}
        onOpenChange={setOpen}
        companyId={companyId}
        existing={redigér}
        currentUserId={auth.user?.id ?? null}
        lokationer={loks}
        startLokation={startLok}
        onSaved={() => {
          void load();
        }}
      />
    </Card>
  );
}

function AssignmentDialog({
  open,
  onOpenChange,
  companyId,
  existing,
  currentUserId,
  onSaved,
  lokationer,
  startLokation,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  existing: Assignment | null;
  lokationer: Lok[];
  startLokation: string | null;
  currentUserId: string | null;
  onSaved: () => void;
}) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [competitorId, setCompetitorId] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [nyNavn, setNyNavn] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [lokId, setLokId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("competitors")
        .select("id, name")
        .order("name");
      const list = (data ?? []) as Competitor[];
      // Pin "Ej oplyst" øverst
      const ejOplyst = list.find((c) => c.name.toLowerCase() === "ej oplyst");
      const rest = list.filter((c) => c.name.toLowerCase() !== "ej oplyst");
      setCompetitors(ejOplyst ? [ejOplyst, ...rest] : rest);
    })();
    setCompetitorId(existing?.competitor_id ?? "");
    setExpiresAt(existing?.contract_expires_at ?? "");
    setNotes(existing?.notes ?? "");
    setNyNavn("");
    setLokId(existing?.location_id ?? startLokation ?? lokationer[0]?.id ?? "");
  }, [open, existing, startLokation, lokationer]);

  const save = async () => {
    if (!competitorId || (competitorId === "__ny" && !nyNavn.trim())) {
      toast.error(competitorId === "__ny" ? "Skriv navnet på konkurrenten" : "Vælg en konkurrent");
      return;
    }
    if (!currentUserId) {
      toast.error("Ikke logget ind");
      return;
    }
    setBusy(true);
    try {
      let konkId = competitorId;
      if (konkId === "__ny") {
        const navn = nyNavn.trim();
        const fundet = competitors.find((c) => c.name.toLowerCase() === navn.toLowerCase());
        if (fundet) konkId = fundet.id;
        else {
          const { data: ny, error: nyErr } = await supabase
            .from("competitors")
            .insert({ name: navn, created_by: currentUserId })
            .select("id")
            .single();
          if (nyErr) throw nyErr;
          konkId = ny.id;
        }
      }
      // Samme konkurrent på samme lokation: ret udløb/bemærkning.
      // Ny konkurrent: ny aftale — den gamle afsluttes automatisk og bevares som historik.
      if (existing && existing.competitor_id === konkId && existing.location_id === lokId) {
        const { error: upErr } = await supabase
          .from("competitor_assignments")
          .update({
            contract_expires_at: expiresAt || null,
            notes: notes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (upErr) throw upErr;
      } else {
        const { error } = await supabase.from("competitor_assignments").insert({
          company_id: companyId,
          location_id: lokId || null,
          competitor_id: konkId,
          contract_expires_at: expiresAt || null,
          notes: notes.trim() || null,
          registered_by: currentUserId,
        });
        if (error) throw error;
      }
      toast.success("Konkurrentaftale gemt");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke gemme");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? "Konkurrentaftale" : "Registrér konkurrentaftale"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {lokationer.length > 1 && (
            <div>
              <Label>Lokation</Label>
              <Select value={lokId} onValueChange={setLokId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vælg lokation" />
                </SelectTrigger>
                <SelectContent>
                  {lokationer.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {lokNavn(l)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Konkurrent</Label>
            <Select value={competitorId} onValueChange={setCompetitorId}>
              <SelectTrigger>
                <SelectValue placeholder="Vælg konkurrent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ny">+ Ny konkurrent…</SelectItem>
                {competitors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {competitorId === "__ny" && (
              <input
                autoFocus
                placeholder="Navn på konkurrent"
                className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={nyNavn}
                maxLength={120}
                onChange={(e) => setNyNavn(e.target.value)}
              />
            )}
          </div>
          <div>
            <Label>Kundens aftale udløber (valgfri)</Label>
            <input
              type="date"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div>
            <Label>Bemærkning (valgfri)</Label>
            <Textarea
              value={notes}
              maxLength={500}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Gem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
