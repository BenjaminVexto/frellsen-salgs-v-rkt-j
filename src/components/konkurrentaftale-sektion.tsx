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

type Assignment = {
  id: string;
  competitor_id: string;
  contract_expires_at: string | null;
  notes: string | null;
  registered_by: string;
  competitors: { name: string; competitor_type: CompetitorTypeKey | null } | null;
};

export function KonkurrentaftaleSektion({ companyId }: { companyId: string }) {
  const auth = useAuth();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [registrantName, setRegistrantName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("competitor_assignments")
      .select("id, competitor_id, contract_expires_at, notes, registered_by, competitors(name, competitor_type)")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error && error.code !== "PGRST116") {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setAssignment((data ?? null) as Assignment | null);
    if (data?.registered_by) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.registered_by)
        .maybeSingle();
      setRegistrantName(prof?.full_name || "");
    } else {
      setRegistrantName("");
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const expiresSoon =
    assignment?.contract_expires_at &&
    differenceInDays(parseISO(assignment.contract_expires_at), new Date()) <= 90 &&
    differenceInDays(parseISO(assignment.contract_expires_at), new Date()) >= 0;
  const expired =
    assignment?.contract_expires_at &&
    differenceInDays(parseISO(assignment.contract_expires_at), new Date()) < 0;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Coffee className="h-4 w-4" /> Konkurrentaftale
        </h2>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {assignment ? (
            <>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Rediger
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1" /> Registrér
            </>
          )}
        </Button>
      </div>

      {loading ? (
        <div className="py-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !assignment ? (
        <p className="text-sm text-muted-foreground">
          Ingen konkurrentaftale registreret.
        </p>
      ) : (
        <div className="space-y-1 text-sm">
          <div className="font-medium flex items-center gap-2 flex-wrap">
            <span>{assignment.competitors?.name ?? "—"}</span>
            {assignment.competitors?.competitor_type &&
              COMPETITOR_TYPES[assignment.competitors.competitor_type] && (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${COMPETITOR_TYPE_BADGE[assignment.competitors.competitor_type]}`}
                >
                  {COMPETITOR_TYPES[assignment.competitors.competitor_type].label}
                </span>
              )}
          </div>
          {assignment.contract_expires_at && (
            <div
              className={
                expired || expiresSoon
                  ? "text-warning font-medium flex items-center gap-1"
                  : "text-muted-foreground"
              }
            >
              {(expired || expiresSoon) && <AlertTriangle className="h-3.5 w-3.5" />}
              Udløber{" "}
              {format(parseISO(assignment.contract_expires_at), "d. MMM yyyy", {
                locale: da,
              })}
            </div>
          )}
          {assignment.notes && (
            <p className="italic text-muted-foreground">"{assignment.notes}"</p>
          )}
          {registrantName && (
            <p className="text-xs text-muted-foreground">
              Registreret af {registrantName}
            </p>
          )}
        </div>
      )}

      {assignment?.competitors?.competitor_type &&
        COMPETITOR_TYPES[assignment.competitors.competitor_type] && (() => {
          const type = COMPETITOR_TYPES[assignment.competitors.competitor_type!];
          return (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">{type.tagline}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">
                    De spørger sandsynligvis:
                  </div>
                  <div className="italic">"{type.identifying_question}"</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">
                    Frellsens svar:
                  </div>
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
        existing={assignment}
        currentUserId={auth.user?.id ?? null}
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  existing: Assignment | null;
  currentUserId: string | null;
  onSaved: () => void;
}) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [competitorId, setCompetitorId] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [busy, setBusy] = useState(false);

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
  }, [open, existing]);

  const save = async () => {
    if (!competitorId) {
      toast.error("Vælg en konkurrent");
      return;
    }
    if (!currentUserId) {
      toast.error("Ikke logget ind");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        company_id: companyId,
        competitor_id: competitorId,
        contract_expires_at: expiresAt || null,
        notes: notes.trim() || null,
        registered_by: existing?.registered_by ?? currentUserId,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("competitor_assignments")
        .upsert(payload, { onConflict: "company_id,competitor_id" });
      if (error) throw error;
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
            {existing ? "Rediger konkurrentaftale" : "Registrér konkurrentaftale"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Konkurrent</Label>
            <Select value={competitorId} onValueChange={setCompetitorId}>
              <SelectTrigger>
                <SelectValue placeholder="Vælg konkurrent" />
              </SelectTrigger>
              <SelectContent>
                {competitors.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Ingen konkurrenter oprettet endnu
                  </div>
                ) : (
                  competitors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Aftale udløber (valgfri)</Label>
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
