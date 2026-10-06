import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPinCheck, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/view-as-context";
import { useAfdeling } from "@/contexts/afdeling-context";
import { cn } from "@/lib/utils";
import { adresseValg, type LokLite } from "@/lib/adresse-grupper";

function startAfDag() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Ét tryk = aktivitet "besøg" nu på lokationen (eller virksomhedens primære lokation).
 * Ingen formular. Samme bruger + samme lokation + i dag → "Allerede registreret i dag".
 */
export function BesoegtKnap({
  companyId,
  locationId,
  size = "lg",
  className,
  onSaved,
  locations,
}: {
  /** Virksomhedens lokationer: ved flere adresser vælges adressen ved tryk (egne øverst). */
  locations?: LokLite[];
  companyId: string;
  locationId?: string | null;
  size?: "lg" | "sm";
  className?: string;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const { isImpersonating } = useViewAs();
  const { stampAfdelingNr } = useAfdeling();
  const [locId, setLocId] = useState<string | null>(locationId ?? null);
  const [alleredeId, setAlleredeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [vaelgOpen, setVaelgOpen] = useState(false);
  const valg = !locationId && locations ? adresseValg(locations, user?.id) : [];
  const flereAdresser = valg.length > 1;

  // Find lokation (primær hvis ikke angivet) og om der allerede er registreret besøg i dag.
  useEffect(() => {
    if (!user?.id) return;
    let aktiv = true;
    (async () => {
      let lid = locationId ?? null;
      if (!lid) {
        const { data } = await supabase
          .from("locations")
          .select("id")
          .eq("company_id", companyId)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        lid = (data as any)?.id ?? null;
      }
      let q = supabase
        .from("activities")
        .select("id")
        .eq("created_by", user.id)
        .eq("company_id", companyId)
        .eq("activity_type", "besøg" as any)
        .gte("udfoert_at" as any, startAfDag())
        .limit(1);
      q = lid ? q.eq("location_id", lid) : q.is("location_id", null);
      const { data: eks } = await q;
      if (!aktiv) return;
      setLocId(lid);
      setAlleredeId((eks as any[])?.[0]?.id ?? null);
    })();
    return () => {
      aktiv = false;
    };
  }, [companyId, locationId, user?.id]);

  const fortryd = async (id: string) => {
    const { error } = await supabase.from("activities").delete().eq("id", id);
    if (error) return toast.error("Kunne ikke fortryde: " + error.message);
    setAlleredeId((cur) => (cur === id ? null : cur));
    toast("Besøg fortrudt");
    onSaved?.();
  };

  const registrer = async (valgtLok?: string, valgtIds?: string[]) => {
    if (!user?.id || busy) return;
    if (isImpersonating) return toast.error("Read-only — du ser som en anden sælger");
    if (flereAdresser && !valgtLok) return setVaelgOpen(true);
    if (!valgtLok && alleredeId) return;
    setVaelgOpen(false);
    setBusy(true);
    if (valgtLok) {
      const { data: eks } = await supabase
        .from("activities")
        .select("id")
        .eq("created_by", user.id)
        .eq("activity_type", "besøg" as any)
        .in("location_id", valgtIds ?? [valgtLok])
        .gte("udfoert_at" as any, startAfDag())
        .limit(1);
      if ((eks ?? []).length) {
        setBusy(false);
        return toast("Allerede registreret i dag på den adresse");
      }
    }
    const lokTilGem = valgtLok ?? locId;
    const { data, error } = await supabase
      .from("activities")
      .insert({
        company_id: companyId,
        created_by: user.id,
        activity_type: "besøg" as any,
        location_id: lokTilGem,
        note: null,
        ...(stampAfdelingNr != null ? { afdeling_nr: stampAfdelingNr } : {}),
      } as any)
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) return toast.error("Kunne ikke registrere besøg: " + (error?.message ?? ""));
    const id = (data as any).id as string;
    if (!valgtLok) setAlleredeId(id);
    onSaved?.();
    toast.success("Besøg registreret", {
      duration: 10000,
      action: { label: "Tilføj note", onClick: () => { setNote(""); setNoteFor(id); } },
      cancel: { label: "Fortryd", onClick: () => void fortryd(id) },
    });
  };

  const gemNote = async () => {
    if (!noteFor) return;
    const { error } = await supabase.from("activities").update({ note: note.trim() || null }).eq("id", noteFor);
    if (error) return toast.error(error.message);
    toast.success("Note gemt");
    setNoteFor(null);
    onSaved?.();
  };

  const stor = size === "lg";
  return (
    <>
      <Button
        type="button"
        onClick={() => void registrer()}
        disabled={busy || (!flereAdresser && !!alleredeId) || !user}
        variant={alleredeId && !flereAdresser ? "outline" : "default"}
        className={cn(stor ? "h-12 w-full text-base font-semibold" : "h-9", className)}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : alleredeId && !flereAdresser ? (
          <Check className="h-4 w-4 mr-2" />
        ) : (
          <MapPinCheck className={cn(stor ? "h-5 w-5" : "h-4 w-4", "mr-2")} />
        )}
        {alleredeId && !flereAdresser ? "Allerede registreret i dag" : "Besøgt"}
      </Button>
      <Dialog open={vaelgOpen} onOpenChange={setVaelgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hvilken adresse besøgte du?</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-1.5">
            {valg.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => void registrer(v.kontoId, v.locIds)}
                className="w-full text-left rounded-md border border-border px-3 py-3 text-sm hover:bg-accent active:scale-[0.99]"
              >
                {v.label}
                {v.egen && <span className="ml-2 text-xs text-primary">Din</span>}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!noteFor} onOpenChange={(o) => !o && setNoteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Note til besøget</DialogTitle>
          </DialogHeader>
          <Textarea autoFocus rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hvad blev aftalt?" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteFor(null)}>Annullér</Button>
            <Button onClick={gemNote}>Gem note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
