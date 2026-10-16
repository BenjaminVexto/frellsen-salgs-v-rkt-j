import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cvrNorm, cvrGrupperQuery, type CvrGruppeInfo, type ListeItem } from "@/components/cvr-gruppe";
import { VirksomhedListe, paenBy, statusRang, type Sort } from "@/components/virksomhed-liste";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CustomerStatusBadge } from "@/components/customer-status-info";
import { SegmentBadge } from "@/components/binding-status-badge";

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
  lokationMatcher,
} from "@/components/company-filter";
import {
  FilterLinje,
  Hurtigvalg,
  FlereFiltre,
  FilterChips,
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
  } = useCompanyFilter({ isAdmin, restrictToIds: recentIds, userId: auth.user?.id ?? null });

  // Standard sælgervalg: "Mine kunder" for sælgere, "Alle" for admin/salgssupport.
  const defaultSaelger = isAdmin ? "alle" : "mine";
  const baseFilters = useMemo(() => ({ ...DEFAULT_FILTERS, saelger: defaultSaelger }), [defaultSaelger]);
  const storeKey = auth.user?.id ? `virksomheder-filtre:${auth.user.id}` : null;
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restored || auth.loading || !storeKey) return;
    try {
      const raw = sessionStorage.getItem(storeKey);
      if (raw) {
        const saved = JSON.parse(raw);
        setFilters(normalizeFilterConfig(saved.filters));
        if (typeof saved.q === "string") setQ(saved.q);
      } else {
        setFilters(baseFilters);
      }
    } catch {
      setFilters(baseFilters);
    }
    setRestored(true);
  }, [restored, auth.loading, storeKey, baseFilters, setFilters, setQ]);
  useEffect(() => {
    if (!restored || !storeKey) return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ filters, q }));
    } catch {}
  }, [restored, storeKey, filters, q]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<Sort>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [templates, setTemplates] = useState<FilterTemplate[]>([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  const isMobile = useIsMobile();
  const userId = auth.user?.id ?? null;
  // På mobil: vis kun "mine" virksomheder ved start, så sælgerne ikke møder 16k+ rækker.
  // Aktiveres KUN når søgefeltet er tomt og ingen filtre er sat — så søgning rammer hele basen.
  // Salgssupport har ingen egen portefølje → filteret giver ikke mening og deaktiveres.
  const mobileMineActive = false;
  const displayed = filtered;

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
  }, [filters, q, recentIds, mobileMineActive, sort]);

  // CVR-grupper: konti med samme (normaliserede) CVR vises som én række.
  const grupperQ = useQuery(cvrGrupperQuery);
  const [aabneGrupper, setAabneGrupper] = useState<Set<string>>(new Set());
  const grundItems = useMemo(() => {
    const alleIGruppe = new Map<string, typeof rows>();
    for (const r of rows) {
      if ((r as any).afloest_af_company_id) continue;
      const n = cvrNorm(r.cvr);
      if (!n) continue;
      const a = alleIGruppe.get(n);
      a ? a.push(r) : alleIGruppe.set(n, [r]);
    }
    const soeg = q.trim().length > 0;
    const ud: ListeItem[] = [];
    const set = new Map<string, Extract<ListeItem, { kind: "gruppe" }>>();
    for (const r of displayed) {
      const n = cvrNorm(r.cvr);
      const alle = n ? alleIGruppe.get(n) : undefined;
      if (!n || !alle || alle.length < 2 || (r as any).afloest_af_company_id) {
        ud.push({ kind: "en", row: r });
        continue;
      }
      let g = set.get(n);
      if (!g) {
        g = { kind: "gruppe", cvr: n, konti: [], hits: new Set(), tvungen: soeg };
        set.set(n, g);
        ud.push(g);
      }
      g.konti.push(r);
      if (soeg) g.hits.add(r.id);
    }
    // Ved søgning vises hele gruppen med de ramte konti markeret.
    if (soeg) for (const g of set.values()) g.konti = [...alleIGruppe.get(g.cvr)!].sort((a, b) => Number(g.hits.has(b.id)) - Number(g.hits.has(a.id)));
    return ud;
  }, [rows, displayed, q]);

  // Omsætning 12 mdr. pr. konto (kun hvor brugeren må se kontosalg).
  const omsQ = useQuery({
    queryKey: ["konto-oms-12m", rows.length],
    enabled: rows.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const ids = rows.map((r) => r.id);
      const m = new Map<string, number>();
      const bidder = [];
      for (let i = 0; i < ids.length; i += 1000) bidder.push(ids.slice(i, i + 1000));
      const svar = await Promise.all(bidder.map((b) => (supabase as any).rpc("konto_oms_12m", { _ids: b })));
      for (const { data, error } of svar) {
        if (error) throw error;
        for (const x of data ?? []) m.set(x.company_id, Number(x.oms_12m));
      }
      return m;
    },
  });

  const items = useMemo(() => {
    if (!sort) return grundItems;
    const navn = (it: ListeItem) => (it.kind === "en" ? it.row.name : grupperQ.data?.get(it.cvr)?.cvr_navn || it.konti[0]?.name || "");
    const oms = (it: ListeItem) =>
      it.kind === "en"
        ? omsQ.data?.get(it.row.id) ?? -1
        : grupperQ.data?.get(it.cvr)?.oms_12m ?? it.konti.reduce((s, k) => s + (omsQ.data?.get(k.id) ?? 0), 0);
    const status = (it: ListeItem) =>
      it.kind === "en" ? statusRang(it.row.customer_type) : Math.min(...it.konti.map((k) => statusRang(k.customer_type)));
    return [...grundItems].sort((a, b) => {
      const v =
        sort.key === "navn" ? navn(a).localeCompare(navn(b), "da") : sort.key === "oms" ? oms(a) - oms(b) : status(a) - status(b);
      return v * sort.dir;
    });
  }, [grundItems, sort, omsQ.data, grupperQ.data]);
  const antalKonti = useMemo(() => items.reduce((s, it) => s + (it.kind === "en" ? 1 : it.konti.length), 0), [items]);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageRows = pageItems.flatMap((it) => (it.kind === "en" ? [it.row] : it.konti));

  const clearRecent = () => {
    sessionStorage.removeItem(RECENT_KEY);
    setRecentIds(null);
  };

  const selectAllOnPage = (check: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      pageRows.forEach((r) => (check ? next.add(r.id) : next.delete(r.id)));
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(items.flatMap((it) => (it.kind === "en" ? [it.row.id] : it.konti.map((k) => k.id)))));
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

  const saelgerMap = useMemo(() => new Map(sellers.map((s) => [s.id, s.full_name])), [sellers]);
  const saelgerNavn = (r: (typeof displayed)[number]) => {
    const id = (r as any).assigned_to ?? (locationMap.get(r.id) ?? []).find((l) => l.saelger_user_id)?.saelger_user_id;
    return id ? saelgerMap.get(id) ?? null : null;
  };

  const lokHitLinje = (r: (typeof displayed)[number]) => {
    const rawQuery = q.trim();
    if (!rawQuery) return null;
    const qq = rawQuery.toLowerCase();
    if (
      r.name.toLowerCase().includes(qq) ||
      (r.cvr ?? "").includes(rawQuery) ||
      (r.address ?? "").toLowerCase().includes(qq) ||
      (r.city ?? "").toLowerCase().includes(qq) ||
      (r.zip ?? "").includes(rawQuery)
    )
      return null;
    const match = (locationMap.get(r.id) ?? []).find((l) => lokationMatcher(l, rawQuery));
    if (!match) return null;
    const parts = [firstFilled(match.address), [firstFilled(match.zip), paenBy(match.city)].filter(Boolean).join(" ")]
      .filter((x) => x && x.trim())
      .join(", ");
    const penhed = (match.penhed_navne ?? []).find((n) => n.toLowerCase().includes(qq));
    return (
      <div className="text-xs text-primary truncate">
        Lokation: {penhed ? `${penhed}, ` : ""}
        {parts || "uden adresse"}
      </div>
    );
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



      <div className="sticky top-12 md:static z-10 -mx-3 md:mx-0 px-3 md:px-0 py-2 md:py-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:bg-transparent md:backdrop-blur-none border-b md:border-0 mb-3">
        <CompanyFilterBar
          q={q}
          onQChange={setQ}
          filtersOpen={filtersOpen}
          setFiltersOpen={setFiltersOpen}
          isFilterActive={false}
          onReset={() => setFilters(baseFilters)}
          showFilterButton={false}
        />
        <div className="mt-2 space-y-2">
          <FilterLinje filters={filters} setFilters={setFilters} sellers={sellers} defaultSaelger={defaultSaelger} />
          <Hurtigvalg setFilters={setFilters} base={baseFilters} />
          {templates.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground mr-1">Skabeloner:</span>
              {templates.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1">
                  <button type="button" className="hover:underline" onClick={() => applyTemplate(t.id)}>{t.name}</button>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => deleteTemplate(t.id)} aria-label="Slet skabelon">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <FlereFiltre filters={filters} setFilters={setFilters} isAdmin={isAdmin} />
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <FilterChips filters={filters} setFilters={setFilters} sellers={sellers} defaultSaelger={defaultSaelger} onReset={() => setFilters(baseFilters)} />
        {isFilterActive && (
          <Button size="sm" variant="outline" className="h-7 text-xs hidden sm:inline-flex" onClick={() => setSaveTemplateOpen(true)}>
            Gem som skabelon
          </Button>
        )}
      </div>

      <div className="text-sm text-muted-foreground mb-2">
        <strong className="text-foreground">{items.length.toLocaleString("da-DK")}</strong> virksomheder ({antalKonti.toLocaleString("da-DK")} konti)
        {items.length > 0 && <> · Side {page + 1} af {totalPages}</>}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Indlæser…</p>
        ) : displayed.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Ingen virksomheder fundet.
          </p>
        ) : (
          <>
            {isAdmin && (
              <div className="flex items-center justify-between gap-3 px-3 md:px-4 py-2 border-b text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={(v) => selectAllOnPage(!!v)}
                  />
                  Vælg alle på siden ({pageRows.length.toLocaleString("da-DK")} konti)
                </label>
                {selected.size < antalKonti && (
                  <button
                    className="text-primary hover:underline text-xs"
                    onClick={selectAllFiltered}
                  >
                    Vælg alle {antalKonti.toLocaleString("da-DK")} konti, der matcher
                  </button>
                )}
              </div>
            )}
            <VirksomhedListe
              items={pageItems}
              isAdmin={isAdmin}
              selected={selected}
              setSelected={setSelected}
              omsMap={omsQ.data}
              saelgerNavn={saelgerNavn}
              ikkeTildelt={(r) => isAdmin && (assignmentMap.get(r.id) ?? []).length === 0}
              ekstraLinje={lokHitLinje}
              grupper={grupperQ.data}
              aabne={aabneGrupper}
              toggleGruppe={(cvr) =>
                setAabneGrupper((prev) => {
                  const n = new Set(prev);
                  n.has(cvr) ? n.delete(cvr) : n.add(cvr);
                  return n;
                })
              }
              sort={sort}
              setSort={setSort}
            />
          </>
        )}
      </Card>

      {items.length > PAGE_SIZE && (
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
    const CHUNK = 150;
    for (let i = 0; i < companyIds.length; i += CHUNK) {
      const slice = companyIds.slice(i, i + CHUNK);
      const { error } = await supabase
        .from("contact_list_assignments")
        .update({ assigned_to: sellerId })
        .in("company_id", slice);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    }
    setSaving(false);
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
