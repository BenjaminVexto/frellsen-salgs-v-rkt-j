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
  ArrowRight,
  Loader2,
  MapPin,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  COMPETITOR_TYPES,
  COMPETITOR_TYPE_BADGE,
  COMPETITOR_TYPE_BORDER,
  COMPETITOR_TYPE_TEXT,
  COMPETITOR_TYPE_PANEL,
  COMPETITOR_TYPE_ICON,
  COMPETITOR_TYPE_ICON_BG,
  COMPETITOR_TYPE_IMAGE,
  COMPETITOR_TYPE_ORDER,
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
  notes_updated_at: string | null;
  notes_updated_by: string | null;
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
        "id, name, notes, created_at, competitor_type, city, employee_count, equipment_brands, notes_updated_at, notes_updated_by",
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
        if (!a.contract_expires_at && !b.contract_expires_at) {
          return (a.companies?.name ?? "").localeCompare(b.companies?.name ?? "");
        }
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

  // Gruppér konkurrenter efter arketype (alfabetisk inden for hver gruppe)
  const groupedCompetitors = useMemo(() => {
    const groups: Record<string, Competitor[]> = {};
    for (const c of competitors) {
      const key = c.competitor_type ?? "__none__";
      (groups[key] ??= []).push(c);
    }
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => a.name.localeCompare(b.name, "da"));
    }
    return groups;
  }, [competitors]);

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

      {/* Arketype-kort — visuelt markante */}
      <section className="mb-8 md:mb-10">
        <h2 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          De fire arketyper
        </h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {COMPETITOR_TYPE_ORDER.map((key) => {
            const type = COMPETITOR_TYPES[key];
            const img = COMPETITOR_TYPE_IMAGE[key];
            return (
              <Card
                key={key}
                className="relative overflow-hidden p-3 pt-4 sm:p-5 sm:pt-6 flex flex-col"
              >
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${COMPETITOR_TYPE_BORDER[key]}`}
                />
                <div className="mb-2 sm:mb-3 flex justify-center">
                  <img
                    src={img}
                    alt={type.label}
                    className="h-16 w-16 sm:h-24 sm:w-24 lg:h-28 lg:w-28 object-contain"
                    loading="lazy"
                  />
                </div>
                <h3 className={`text-sm sm:text-lg font-semibold ${COMPETITOR_TYPE_TEXT[key]}`}>
                  {type.label}
                </h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{type.tagline}</p>
                <div className="border-t border-dashed border-border my-3 sm:my-4" />
                <div className="text-[10px] sm:text-xs text-muted-foreground italic mb-1">
                  De spørger:
                </div>
                <p className="text-xs sm:text-sm italic mb-3">"{type.identifying_question}"</p>
                <div className="text-[10px] sm:text-xs text-muted-foreground mb-1">
                  Frellsens svar:
                </div>
                <p className={`text-xs sm:text-sm font-semibold ${COMPETITOR_TYPE_TEXT[key]}`}>
                  "{type.frellsen_pitch}"
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Venstre: grupperede konkurrent-kort */}
        <div className="space-y-8">
          {loading ? (
            <Card className="p-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </Card>
          ) : competitors.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">
              Ingen konkurrenter oprettet endnu.
            </Card>
          ) : (
            <>
              {COMPETITOR_TYPE_ORDER.map((key) => {
                const list = groupedCompetitors[key] ?? [];
                if (list.length === 0) return null;
                const type = COMPETITOR_TYPES[key];
                return (
                  <section key={key}>
                    <div className="mb-3">
                      <div className="flex items-baseline gap-2">
                        <h2
                          className={`text-sm font-bold uppercase tracking-wider ${COMPETITOR_TYPE_TEXT[key]}`}
                        >
                          {type.plural}
                        </h2>
                        <span className="text-xs text-muted-foreground">
                          ({list.length})
                        </span>
                      </div>
                      <div
                        className={`mt-1.5 h-0.5 w-12 ${COMPETITOR_TYPE_BORDER[key]} rounded-full`}
                      />
                    </div>
                    <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                      {list.map((c) => (
                        <CompetitorCard
                          key={c.id}
                          competitor={c}
                          count={counts[c.id] ?? 0}
                          active={selectedId === c.id}
                          canWrite={canWrite}
                          onSelect={() => setSelectedId(c.id)}
                          onEdit={() => setEditTarget(c)}
                          onDelete={() => setDeleteTarget(c)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
              {(groupedCompetitors["__none__"] ?? []).length > 0 && (
                <section>
                  <div className="mb-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      Uden arketype
                    </h2>
                    <div className="mt-1.5 h-0.5 w-12 bg-muted-foreground/30 rounded-full" />
                  </div>
                  <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                    {groupedCompetitors["__none__"].map((c) => (
                      <CompetitorCard
                        key={c.id}
                        competitor={c}
                        count={counts[c.id] ?? 0}
                        active={selectedId === c.id}
                        canWrite={canWrite}
                        onSelect={() => setSelectedId(c.id)}
                        onEdit={() => setEditTarget(c)}
                        onDelete={() => setDeleteTarget(c)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Højre: detail-panel */}
        <div className="lg:sticky lg:top-6 h-fit">
          <Card className="p-0 overflow-hidden">
            {!selectedCompetitor ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Vælg en konkurrent til venstre for at se detaljer og virksomheder med aftale.
              </div>
            ) : (
              <CompetitorDetail
                competitor={selectedCompetitor}
                details={details}
                detailsLoading={detailsLoading}
                canWrite={canWrite}
                onEditNote={() => setEditTarget(selectedCompetitor)}
              />
            )}
          </Card>
        </div>
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

function CompetitorCard({
  competitor,
  count,
  active,
  canWrite,
  onSelect,
  onEdit,
  onDelete,
}: {
  competitor: Competitor;
  count: number;
  active: boolean;
  canWrite: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const type = competitor.competitor_type
    ? COMPETITOR_TYPES[competitor.competitor_type]
    : null;
  const badge = competitor.competitor_type
    ? COMPETITOR_TYPE_BADGE[competitor.competitor_type]
    : "bg-muted text-muted-foreground border-border";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group relative bg-card border border-border rounded-lg p-4 shadow-sm transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${
        active ? "ring-2 ring-primary/40 shadow-md" : ""
      }`}
    >
      {canWrite && (
        <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Rediger konkurrent"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Slet konkurrent"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pr-14">
        <h3 className="font-semibold text-base">{competitor.name}</h3>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge}`}
        >
          {type?.label ?? "Ukendt"}
        </span>
      </div>

      {(competitor.city || competitor.employee_count != null) && (
        <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-3 flex-wrap">
          {competitor.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {competitor.city}
            </span>
          )}
          {competitor.employee_count != null && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {competitor.employee_count} ansatte
            </span>
          )}
        </div>
      )}

      {competitor.equipment_brands && competitor.equipment_brands.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {competitor.equipment_brands.map((b) => (
            <span
              key={b}
              className="inline-flex items-center rounded-full bg-muted text-muted-foreground text-[10px] px-2 py-0.5"
            >
              {b}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {count} virksomhed{count === 1 ? "" : "er"}
        </span>
        <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  );
}

function CompetitorDetail({
  competitor,
  details,
  detailsLoading,
  canWrite,
  onEditNote,
}: {
  competitor: Competitor;
  details: AssignmentRow[];
  detailsLoading: boolean;
  canWrite: boolean;
  onEditNote: () => void;
}) {
  const typeKey = competitor.competitor_type;
  const type = typeKey ? COMPETITOR_TYPES[typeKey] : null;
  const Icon = typeKey ? COMPETITOR_ICON_FALLBACK(typeKey) : null;
  const [authorName, setAuthorName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    if (!competitor.notes_updated_by) {
      setAuthorName("");
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", competitor.notes_updated_by!)
        .maybeSingle();
      if (!cancelled) setAuthorName(data?.full_name ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [competitor.notes_updated_by]);

  return (
    <div>
      <div className="p-5 border-b border-border">
        <h2 className="text-xl font-semibold">{competitor.name}</h2>
        {typeKey && type && (
          <div className="mt-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${COMPETITOR_TYPE_BADGE[typeKey]}`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {type.label}
            </span>
          </div>
        )}
        {(competitor.city || competitor.employee_count != null) && (
          <div className="text-sm text-muted-foreground mt-3 flex items-center gap-3 flex-wrap">
            {competitor.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {competitor.city}
              </span>
            )}
            {competitor.employee_count != null && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {competitor.employee_count} ansatte
              </span>
            )}
          </div>
        )}
        {competitor.equipment_brands && competitor.equipment_brands.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {competitor.equipment_brands.map((b) => (
              <span
                key={b}
                className="inline-flex items-center rounded-full bg-muted text-muted-foreground text-xs px-2 py-0.5"
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </div>

      {typeKey && type && Icon && (
        <div className="p-5 border-b border-border">
          <div
            className={`rounded-lg border p-4 ${COMPETITOR_TYPE_PANEL[typeKey]}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`h-4 w-4 ${COMPETITOR_TYPE_TEXT[typeKey]}`} />
              <h3 className={`font-semibold ${COMPETITOR_TYPE_TEXT[typeKey]}`}>
                {type.label}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{type.tagline}</p>

            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">
                  Hvad driver dem:
                </div>
                <div>{type.what_drives}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">
                  De spørger:
                </div>
                <div className="italic">"{type.identifying_question}"</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">
                  Frellsens svar:
                </div>
                <div className={`font-semibold ${COMPETITOR_TYPE_TEXT[typeKey]}`}>
                  "{type.frellsen_pitch}"
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            Virksomheder med aftale
            <span className="text-muted-foreground font-normal ml-1.5">
              ({details.length})
            </span>
          </h3>
        </div>
        {detailsLoading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : details.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Ingen kunder registreret med aftale hos {competitor.name} endnu.
            <div className="mt-2 text-xs">
              Tilføj via virksomhedskortet →
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border max-h-[480px] overflow-y-auto">
            {details.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm">
                    {d.companies?.name ?? "—"}
                  </div>
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
                </div>
                {d.companies?.id && (
                  <Button asChild size="sm" variant="ghost" className="shrink-0">
                    <Link to="/virksomheder/$id" params={{ id: d.companies.id }}>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
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
                {COMPETITOR_TYPE_ORDER.map((key) => (
                  <SelectItem key={key} value={key}>
                    {COMPETITOR_TYPES[key].label} — {COMPETITOR_TYPES[key].tagline}
                  </SelectItem>
                ))}
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
