import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo, type KeyboardEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ShieldAlert,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ArrowRight,
  Loader2,
  MapPin,
  Users,
  Wrench,
  X,
  Lightbulb,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  COMPETITOR_TYPES,
  COMPETITOR_TYPE_BADGE,
  type CompetitorTypeKey,
} from "@/lib/competitor-types";

export const Route = createFileRoute("/_authenticated/konkurrenter")({
  component: KonkurrenterPage,
  head: () => ({ meta: [{ title: "Konkurrenter — Frellsen Salgsoversigt" }] }),
});

type Competitor = {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  competitor_type: CompetitorTypeKey | null;
  city: string | null;
  employee_count: number | null;
  equipment_brands: string[] | null;
};

type AssignmentRow = {
  id: string;
  competitor_id: string;
  contract_expires_at: string | null;
  notes: string | null;
  company_id: string;
  companies: { id: string; name: string; city: string | null } | null;
};

function KonkurrenterPage() {
  const auth = useAuth();
  const canWrite = auth.role === "admin" || auth.role === "salgssupport";

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Competitor | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Competitor | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<AssignmentRow[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: comps, error } = await supabase
      .from("competitors")
      .select(
        "id, name, notes, created_at, competitor_type, city, employee_count, equipment_brands",
      )
      .order("name");
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setCompetitors((comps ?? []) as Competitor[]);

    const { data: assigns } = await supabase
      .from("competitor_assignments")
      .select("competitor_id");
    const c: Record<string, number> = {};
    (assigns ?? []).forEach((a: any) => {
      c[a.competitor_id] = (c[a.competitor_id] ?? 0) + 1;
    });
    setCounts(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetails = useCallback(async (competitorId: string) => {
    setDetailsLoading(true);
    const { data, error } = await supabase
      .from("competitor_assignments")
      .select(
        "id, competitor_id, contract_expires_at, notes, company_id, companies(id, name, city)",
      )
      .eq("competitor_id", competitorId);
    if (error) {
      toast.error(error.message);
      setDetails([]);
    } else {
      const rows = (data ?? []) as AssignmentRow[];
      rows.sort((a, b) => {
        if (!a.contract_expires_at && !b.contract_expires_at) return 0;
        if (!a.contract_expires_at) return 1;
        if (!b.contract_expires_at) return -1;
        return a.contract_expires_at.localeCompare(b.contract_expires_at);
      });
      setDetails(rows);
    }
    setDetailsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetails(selectedId);
    else setDetails([]);
  }, [selectedId, loadDetails]);

  const selectedCompetitor = useMemo(
    () => competitors.find((c) => c.id === selectedId) ?? null,
    [competitors, selectedId],
  );

  const selectedType = selectedCompetitor?.competitor_type
    ? COMPETITOR_TYPES[selectedCompetitor.competitor_type]
    : null;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if ((counts[deleteTarget.id] ?? 0) > 0) {
      toast.error(
        `Kan ikke slette: ${counts[deleteTarget.id]} virksomhed(er) har stadig aftale med ${deleteTarget.name}`,
      );
      setDeleteTarget(null);
      return;
    }
    const { error } = await supabase
      .from("competitors")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Konkurrent slettet");
      if (selectedId === deleteTarget.id) setSelectedId(null);
      void load();
    }
    setDeleteTarget(null);
  };

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <header className="mb-6 md:mb-8 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" /> Konkurrenter
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Oversigt over konkurrenter, deres arketyper og aftaler med vores virksomheder.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Tilføj konkurrent
          </Button>
        )}
      </header>

      {/* Arketype-kort */}
      <section className="mb-6 md:mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          De fire arketyper
        </h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.entries(COMPETITOR_TYPES) as [CompetitorTypeKey, typeof COMPETITOR_TYPES[CompetitorTypeKey]][]).map(
            ([key, type]) => (
              <Card key={key} className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${COMPETITOR_TYPE_BADGE[key]}`}
                  >
                    {type.label}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  {type.tagline}
                </div>
                <div className="text-xs space-y-2">
                  <div>
                    <span className="text-muted-foreground">Spørger: </span>
                    <span className="italic">"{type.identifying_question}"</span>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <span className="text-muted-foreground">✊ </span>
                    <span className="font-medium">"{type.frellsen_pitch}"</span>
                  </div>
                </div>
              </Card>
            ),
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="p-0 overflow-hidden h-fit">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-sm">Konkurrenter</h2>
          </div>
          {loading ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : competitors.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Ingen konkurrenter oprettet endnu.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {competitors.map((c) => {
                const count = counts[c.id] ?? 0;
                const active = selectedId === c.id;
                return (
                  <li
                    key={c.id}
                    className={`flex items-start gap-2 px-4 py-3 hover:bg-muted/40 transition-colors ${
                      active ? "bg-primary/5" : ""
                    }`}
                  >
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{c.name}</span>
                        {c.competitor_type && (
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${COMPETITOR_TYPE_BADGE[c.competitor_type]}`}
                          >
                            {COMPETITOR_TYPES[c.competitor_type].label}
                          </span>
                        )}
                      </div>
                      {(c.city || c.employee_count != null) && (
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          {c.city && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {c.city}
                            </span>
                          )}
                          {c.employee_count != null && (
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {c.employee_count} ansatte
                            </span>
                          )}
                        </div>
                      )}
                      {c.equipment_brands && c.equipment_brands.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {c.equipment_brands.map((b) => (
                            <span
                              key={b}
                              className="inline-flex items-center rounded bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1.5">
                        {count} virksomhed{count === 1 ? "" : "er"} med aftale
                      </div>
                    </button>
                    {canWrite && (
                      <div className="flex flex-col gap-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditTarget(c);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(c);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-2" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-0 overflow-hidden h-fit">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-sm">
              {selectedCompetitor
                ? `${selectedCompetitor.name} (${details.length} virksomhed${details.length === 1 ? "" : "er"})`
                : "Vælg en konkurrent for at se aftaler"}
            </h2>
          </div>
          {!selectedId ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Klik på en konkurrent til venstre for at se virksomheder med aftale.
            </p>
          ) : (
            <>
              {selectedType && selectedCompetitor?.competitor_type && (
                <div className="p-4 border-b border-border bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-4 w-4 text-primary" />
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${COMPETITOR_TYPE_BADGE[selectedCompetitor.competitor_type]}`}
                    >
                      {selectedType.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {selectedType.tagline}
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Hvad driver dem:
                      </div>
                      <div>{selectedType.what_drives}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Sådan svarer Frellsen:
                      </div>
                      <div className="italic">"{selectedType.frellsen_counter}"</div>
                    </div>
                  </div>
                </div>
              )}
              {detailsLoading ? (
                <div className="py-6 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : details.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">
                  Ingen virksomheder har aftale med {selectedCompetitor?.name}.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {details.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{d.companies?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          {d.companies?.city && (
                            <>
                              <MapPin className="h-3 w-3" />
                              {d.companies.city}
                            </>
                          )}
                          {d.contract_expires_at && (
                            <>
                              {d.companies?.city && <span>·</span>}
                              <span>
                                Udløber{" "}
                                {format(parseISO(d.contract_expires_at), "d. MMM yyyy", {
                                  locale: da,
                                })}
                              </span>
                            </>
                          )}
                        </div>
                        {d.notes && (
                          <div className="text-xs text-muted-foreground italic mt-1">
                            "{d.notes}"
                          </div>
                        )}
                      </div>
                      {d.companies?.id && (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/virksomheder/$id" params={{ id: d.companies.id }}>
                            Gå til <ArrowRight className="h-3.5 w-3.5 ml-1" />
                          </Link>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>

      {canWrite && (
        <CompetitorDialog
          open={createOpen || !!editTarget}
          onOpenChange={(o) => {
            if (!o) {
              setCreateOpen(false);
              setEditTarget(null);
            }
          }}
          existing={editTarget}
          currentUserId={auth.user?.id ?? null}
          onSaved={() => void load()}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet konkurrent?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (counts[deleteTarget.id] ?? 0) > 0
                ? `${deleteTarget.name} kan ikke slettes — ${counts[deleteTarget.id]} virksomhed(er) har stadig aftale.`
                : `${deleteTarget?.name ?? "Konkurrenten"} fjernes permanent.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annullér</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Slet</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CompetitorDialog({
  open,
  onOpenChange,
  existing,
  currentUserId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: Competitor | null;
  currentUserId: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [competitorType, setCompetitorType] = useState<string>("");
  const [city, setCity] = useState("");
  const [employeeCount, setEmployeeCount] = useState<string>("");
  const [brands, setBrands] = useState<string[]>([]);
  const [brandInput, setBrandInput] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setCompetitorType(existing?.competitor_type ?? "");
      setCity(existing?.city ?? "");
      setEmployeeCount(
        existing?.employee_count != null ? String(existing.employee_count) : "",
      );
      setBrands(existing?.equipment_brands ?? []);
      setBrandInput("");
      setNotes(existing?.notes ?? "");
    }
  }, [open, existing]);

  const addBrand = () => {
    const v = brandInput.trim();
    if (!v) return;
    if (brands.includes(v)) {
      setBrandInput("");
      return;
    }
    setBrands([...brands, v]);
    setBrandInput("");
  };

  const handleBrandKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addBrand();
    } else if (e.key === "Backspace" && brandInput === "" && brands.length > 0) {
      setBrands(brands.slice(0, -1));
    }
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Navn er påkrævet");
      return;
    }
    const empCount = employeeCount.trim() ? Number(employeeCount.trim()) : null;
    if (empCount != null && (!Number.isFinite(empCount) || empCount < 0)) {
      toast.error("Antal ansatte skal være et positivt tal");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        competitor_type: competitorType || null,
        city: city.trim() || null,
        employee_count: empCount,
        equipment_brands: brands.length > 0 ? brands : null,
        notes: notes.trim() || null,
      };
      if (existing) {
        const { error } = await supabase
          .from("competitors")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("competitors").insert({
          ...payload,
          created_by: currentUserId,
        });
        if (error) throw error;
      }
      toast.success("Konkurrent gemt");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Kunne ikke gemme";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.error("En konkurrent med dette navn findes allerede");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Rediger konkurrent" : "Tilføj konkurrent"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <Label>Navn *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="fx Merrild"
              maxLength={200}
            />
          </div>
          <div>
            <Label>Arketype</Label>
            <Select
              value={competitorType || "__none__"}
              onValueChange={(v) => setCompetitorType(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Vælg arketype" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Ingen —</SelectItem>
                {(Object.entries(COMPETITOR_TYPES) as [CompetitorTypeKey, typeof COMPETITOR_TYPES[CompetitorTypeKey]][]).map(
                  ([key, type]) => (
                    <SelectItem key={key} value={key}>
                      {type.label} — {type.tagline}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>By</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="fx Aarhus"
                maxLength={100}
              />
            </div>
            <div>
              <Label>Antal ansatte</Label>
              <Input
                type="number"
                min={0}
                value={employeeCount}
                onChange={(e) => setEmployeeCount(e.target.value)}
                placeholder="fx 50"
              />
            </div>
          </div>
          <div>
            <Label className="flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Maskinmærker
            </Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5 mb-2">
              {brands.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1 rounded-full bg-muted text-xs px-2 py-1"
                >
                  {b}
                  <button
                    type="button"
                    onClick={() => setBrands(brands.filter((x) => x !== b))}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <Input
              value={brandInput}
              onChange={(e) => setBrandInput(e.target.value)}
              onKeyDown={handleBrandKey}
              onBlur={addBrand}
              placeholder="Skriv et mærke og tryk Enter"
              maxLength={80}
            />
          </div>
          <div>
            <Label>Noter (valgfri)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
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
