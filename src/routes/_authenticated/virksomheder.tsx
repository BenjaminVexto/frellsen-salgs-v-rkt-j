import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CustomerStatusBadge } from "@/components/customer-status-info";
import { BindingStatusBadge } from "@/components/binding-status-badge";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, X, Loader2 } from "lucide-react";
import { OpretVirksomhedDialog } from "@/components/opret-virksomhed-dialog";
import { AssignToListDialog } from "@/components/assign-to-list-dialog";
import {
  CompanyFilterBar,
  CompanyFilterPanel,
  DEFAULT_FILTERS,
  FilterState,
  FilterTemplate,
  normalizeFilterConfig,
  useCompanyFilter,
} from "@/components/company-filter";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/virksomheder")({
  component: VirksomhederListe,
});

const RECENT_KEY = "recently_imported_ids";
const PAGE_SIZE = 50;

const firstFilled = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

function VirksomhederListe() {
  const auth = useAuth();
  const navigate = useNavigate();
  // Salgssupport arbejder på tværs af sælgere → samme filter-/visningsadgang som admin.
  const isAdmin = auth.role === "admin" || auth.role === "salgssupport";
  const isSupport = auth.role === "salgssupport";

  const [recentIds, setRecentIds] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RECENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { ids: string[]; at: number };
        if (
          parsed.at &&
          Date.now() - parsed.at < 30 * 60 * 1000 &&
          Array.isArray(parsed.ids)
        ) {
          setRecentIds(parsed.ids);
        } else {
          sessionStorage.removeItem(RECENT_KEY);
        }
      }
    } catch {}
  }, []);

  const {
    rows,
    filtered,
    loading,
    q,
    setQ,
    filters,
    setFilters,
    assignmentMap,
    locationMap,
    sellers,
    municipalities,
    isFilterActive,
  } = useCompanyFilter({ isAdmin, restrictToIds: recentIds });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [assignOpen, setAssignOpen] = useState(false);
  const [templates, setTemplates] = useState<FilterTemplate[]>([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  const isMobile = useIsMobile();
  const userId = auth.user?.id ?? null;
  // På mobil: vis kun "mine" virksomheder ved start, så sælgerne ikke møder 16k+ rækker.
  // Aktiveres KUN når søgefeltet er tomt og ingen filtre er sat — så søgning rammer hele basen.
  // Salgssupport har ingen egen portefølje → filteret giver ikke mening og deaktiveres.
  const mobileMineActive =
    isMobile &&
    !isSupport &&
    !q.trim() &&
    !isFilterActive &&
    !recentIds &&
    !!userId;
  const displayed = useMemo(() => {
    if (!mobileMineActive) return filtered;
    return filtered.filter((r) => (r as any).assigned_to === userId);
  }, [filtered, mobileMineActive, userId]);

  const loadTemplates = async () => {
    const { data } = await (supabase as any)
      .from("filter_templates")
      .select("id, name, filter_config")
      .order("created_at", { ascending: false });
    setTemplates(data ?? []);
  };
  useEffect(() => {
    loadTemplates();
  }, [isAdmin]);

  useEffect(() => {
    setPage(0);
  }, [filters, q, recentIds, mobileMineActive]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const pageRows = displayed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const clearRecent = () => {
    sessionStorage.removeItem(RECENT_KEY);
    setRecentIds(null);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllOnPage = (check: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      pageRows.forEach((r) => (check ? next.add(r.id) : next.delete(r.id)));
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(displayed.map((r) => r.id)));
  };

  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  const selectedCompanies = useMemo(
    () =>
      rows
        .filter((r) => selected.has(r.id))
        .map((r) => ({ id: r.id, municipality: r.municipality })),
    [rows, selected],
  );

  const applyTemplate = (tplId: string) => {
    const t = templates.find((x) => x.id === tplId);
    if (!t) return;
    setFilters(normalizeFilterConfig(t.filter_config));
    setFiltersOpen(true);
    toast.success(`Skabelon "${t.name}" indlæst`);
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await (supabase as any)
      .from("filter_templates")
      .delete()
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Skabelon slettet");
      loadTemplates();
    }
  };

  return (
    <div className="px-3 md:px-8 py-4 md:py-8 max-w-7xl mx-auto pb-32 md:pb-32">
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-2">
        <h1 className="text-xl md:text-3xl font-semibold">Virksomheder</h1>
        <OpretVirksomhedDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4 md:mr-1" />
              <span className="hidden md:inline">Opret virksomhed</span>
            </Button>
          }
        />
      </div>

      {recentIds && recentIds.length > 0 && (
        <Card className="p-3 mb-3 flex items-center justify-between bg-primary/5 border-primary/30">
          <div className="text-sm">
            Viser <strong>{recentIds.length}</strong> nyligt importerede
            virksomheder.
          </div>
          <Button size="sm" variant="ghost" onClick={clearRecent}>
            <X className="h-4 w-4 mr-1" /> Ryd filter
          </Button>
        </Card>
      )}

      {mobileMineActive && (
        <Card className="md:hidden p-3 mb-3 text-xs bg-primary/5 border-primary/30">
          Viser <strong>dine</strong> virksomheder. Søg for at finde alle i basen.
        </Card>
      )}


      <div className="sticky top-12 md:static z-10 -mx-3 md:mx-0 px-3 md:px-0 py-2 md:py-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:bg-transparent md:backdrop-blur-none border-b md:border-0 mb-3">
        <CompanyFilterBar
          q={q}
          onQChange={setQ}
          filtersOpen={filtersOpen}
          setFiltersOpen={setFiltersOpen}
          isFilterActive={isFilterActive}
          onReset={() => setFilters(DEFAULT_FILTERS)}
          onSaveTemplate={() => setSaveTemplateOpen(true)}
          showFilterButton={true}
        />
      </div>

      <CompanyFilterPanel
        open={filtersOpen}
        filters={filters}
        setFilters={setFilters}
        sellers={sellers}
        municipalities={municipalities}
        isAdmin={isAdmin}
        templates={templates}
        onApplyTemplate={applyTemplate}
        onDeleteTemplate={deleteTemplate}
      />

      <div className="text-sm text-muted-foreground mb-2">
        <strong className="text-foreground">{displayed.length}</strong>{" "}
        virksomheder matcher
        {displayed.length > 0 && (
          <>
            {" "}
            · Side {page + 1} af {totalPages}
          </>
        )}
      </div>

      <Card className="divide-y">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Indlæser…</p>
        ) : displayed.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Ingen virksomheder fundet.
          </p>
        ) : (
          <>
            {isAdmin && (
              <div className="flex items-center justify-between gap-3 px-4 py-2 bg-muted/30 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={(v) => selectAllOnPage(!!v)}
                  />
                  Vælg alle på denne side ({pageRows.length})
                </label>
                {selected.size < displayed.length && (
                  <button
                    className="text-primary hover:underline text-xs"
                    onClick={selectAllFiltered}
                  >
                    Vælg alle {displayed.length} resultater der matcher filteret
                  </button>
                )}
              </div>
            )}
            {pageRows.map((r) => {
              const assigns = assignmentMap.get(r.id) ?? [];
              const unassigned = isAdmin && assigns.length === 0;
              const checked = selected.has(r.id);
              return (
                <div
                  key={r.id}
                  className={`flex items-start gap-3 px-3 md:px-4 py-3 hover:bg-muted/50 transition-colors ${checked ? "bg-primary/5" : ""}`}
                >
                  {isAdmin && (
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleSelect(r.id)}
                      className="mt-1 shrink-0"
                    />
                  )}
                  <Link
                    to="/virksomheder/$id"
                    params={{ id: r.id }}
                    className="flex flex-col md:flex-row md:items-center md:justify-between flex-1 min-w-0 gap-1.5 md:gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm md:text-base">
                          {r.name}
                        </span>
                      </div>

                      <div className="text-xs text-muted-foreground mt-0.5">
                        CVR {r.cvr ?? "—"}
                        {r.city ? ` · ${r.city}` : ""}
                        {r.municipality ? ` · ${r.municipality}` : ""}
                      </div>
                      {(() => {
                        if (!q) return null;
                        const rawQuery = q.trim();
                        if (!rawQuery) return null;
                        const qq = rawQuery.toLowerCase();
                        const nameHit = r.name.toLowerCase().includes(qq);
                        const cvrHit = (r.cvr ?? "").includes(rawQuery);
                        const addrHit = (r.address ?? "")
                          .toLowerCase()
                          .includes(qq);
                        const cityHit = (r.city ?? "")
                          .toLowerCase()
                          .includes(qq);
                        const zipHit = (r.zip ?? "").includes(rawQuery);
                        if (nameHit || cvrHit || addrHit || cityHit || zipHit)
                          return null;
                        const locs = locationMap.get(r.id) ?? [];
                        const match = locs.find(
                          (l) =>
                            (l.city ?? "").toLowerCase().includes(qq) ||
                            (l.address ?? "").toLowerCase().includes(qq) ||
                            (l.zip ?? "").includes(rawQuery),
                        );
                        if (!match) return null;
                        const parts = [
                          firstFilled(match.address),
                          [firstFilled(match.zip), firstFilled(match.city)]
                            .filter(Boolean)
                            .join(" "),
                        ]
                          .filter((p) => p && p.trim())
                          .join(", ");
                        return (
                          <div className="text-xs text-primary mt-0.5">
                            📍 Match: {parts || "lokation"}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap md:shrink-0">
                      {unassigned && (
                        <Badge
                          variant="outline"
                          className="border-warning/40 text-warning text-[10px] md:text-xs"
                        >
                          Ikke tildelt
                        </Badge>
                      )}
                      <BindingStatusBadge
                        status={r.binding_status}
                        size="sm"
                      />
                      <CustomerStatusBadge type={r.customer_type} />
                    </div>
                  </Link>
                </div>
              );
            })}
          </>
        )}
      </Card>

      {displayed.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Forrige
          </Button>
          <span className="text-muted-foreground">
            Side {page + 1} af {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Næste
          </Button>
        </div>
      )}

      {isAdmin && selected.size > 0 && (
        <div
          className="fixed left-2 right-2 md:left-1/2 md:right-auto md:-translate-x-1/2 bottom-16 md:bottom-4 z-50 bg-background border shadow-lg rounded-2xl md:rounded-full px-3 md:px-4 py-2 flex flex-wrap items-center justify-center gap-2 md:gap-3"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <span className="text-sm font-medium">{selected.size} valgt</span>
          <div className="hidden md:block h-5 w-px bg-border" />
          <Button size="sm" onClick={() => setAssignOpen(true)}>
            <span className="md:hidden">Tildel liste</span>
            <span className="hidden md:inline">Tildel til kontaktliste</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReassignOpen(true)}
          >
            <span className="md:hidden">Skift sælger</span>
            <span className="hidden md:inline">Skift ansvarlig sælger</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            <X className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Fjern markering</span>
          </Button>
        </div>
      )}

      <AssignToListDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        companies={selectedCompanies}
        onAssigned={() => {
          setSelected(new Set());
          navigate({ to: "/kontaktlister" });
        }}
      />

      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        filters={filters}
        onSaved={() => loadTemplates()}
      />

      <ReassignSellerDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        companyIds={Array.from(selected)}
        sellers={sellers}
        onDone={async () => {
          setSelected(new Set());
          setReassignOpen(false);
          toast.success("Ansvarlig sælger opdateret");
        }}
      />
    </div>
  );
}

function SaveTemplateDialog({
  open,
  onOpenChange,
  filters,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: FilterState;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Navn er påkrævet");
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("filter_templates").insert({
      name: name.trim(),
      created_by: userRes.user?.id,
      filter_config: filters,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Skabelon "${name}" gemt`);
    setName("");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gem filter som skabelon</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Navn</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fx: Sovende kunder Jylland uden maskine"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Gem skabelon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignSellerDialog({
  open,
  onOpenChange,
  companyIds,
  sellers,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyIds: string[];
  sellers: { id: string; full_name: string }[];
  onDone: () => void;
}) {
  const [sellerId, setSellerId] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!sellerId) {
      toast.error("Vælg en sælger");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("contact_list_assignments")
      .update({ assigned_to: sellerId })
      .in("company_id", companyIds);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSellerId("");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Skift ansvarlig sælger for {companyIds.length} virksomheder
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Opdaterer alle eksisterende tildelinger på de valgte virksomheder.
          Virksomheder uden tildeling påvirkes ikke — brug "Tildel til
          kontaktliste" til dem.
        </p>
        <div className="space-y-2">
          <Label>Ny ansvarlig sælger</Label>
          <Select value={sellerId} onValueChange={setSellerId}>
            <SelectTrigger>
              <SelectValue placeholder="Vælg sælger…" />
            </SelectTrigger>
            <SelectContent>
              {sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name || "Uden navn"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Opdater
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
