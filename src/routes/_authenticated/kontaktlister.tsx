import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Search, Users, Trash2, Sparkles } from "lucide-react";
import { CvrBulkSoegningDialog } from "@/components/cvr-bulk-soegning-dialog";
import {
  CustomerStatusBadge,
  CustomerStatusLegend,
} from "@/components/customer-status-info";

import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/kontaktlister")({
  component: KontaktlisterOversigt,
});

type ListRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  total: number;
  kontaktet: number;
  sellers: { id: string; name: string }[];
};

function KontaktlisterOversigt() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [cvrSearchOpen, setCvrSearchOpen] = useState(false);
  const [preselectedIds, setPreselectedIds] = useState<string[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = auth.role === "admin";

  const load = async () => {
    setLoading(true);
    const { data: lists } = await supabase
      .from("contact_lists")
      .select("id, name, description, is_active, created_at")
      .order("created_at", { ascending: false });

    if (!lists) {
      setRows([]);
      setLoading(false);
      return;
    }
    const ids = lists.map((l) => l.id);
    const { data: assigns } = await supabase
      .from("contact_list_assignments")
      .select("contact_list_id, status, assigned_to")
      .in("contact_list_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

    const userIds = Array.from(
      new Set((assigns ?? []).map((a) => a.assigned_to).filter(Boolean) as string[]),
    );
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as { id: string; full_name: string }[] };
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    const out: ListRow[] = lists.map((l) => {
      const items = (assigns ?? []).filter((a) => a.contact_list_id === l.id);
      const total = items.length;
      const kontaktet = items.filter(
        (a) => a.status !== "ny" && a.status !== "skal_kontaktes",
      ).length;
      const sellerIds = Array.from(
        new Set(items.map((a) => a.assigned_to).filter(Boolean) as string[]),
      );
      return {
        ...l,
        total,
        kontaktet,
        sellers: sellerIds.map((id) => ({ id, name: pMap.get(id) ?? "Ukendt" })),
      };
    });
    setRows(out);
    setLoading(false);
  };

  useEffect(() => {
    if (!auth.loading) load();
  }, [auth.loading]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q.toLowerCase()) ||
          (r.description ?? "").toLowerCase().includes(q.toLowerCase()),
      ),
    [rows, q],
  );

  const toggleActive = async (id: string, next: boolean) => {
    const { error } = await supabase
      .from("contact_lists")
      .update({ is_active: next })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: next } : r)));
      toast.success(next ? "Liste aktiveret" : "Liste deaktiveret");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error: aErr } = await supabase
      .from("contact_list_assignments")
      .delete()
      .eq("contact_list_id", deleteTarget.id);
    if (aErr) {
      toast.error("Kunne ikke slette tildelinger: " + aErr.message);
      setDeleting(false);
      return;
    }
    const { error } = await supabase
      .from("contact_lists")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message);
      setDeleting(false);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
    toast.success("Kontaktliste slettet");
  };

  return (
    <div className="px-4 md:px-8 py-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Kontaktlister</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Alle kontaktlister" : "Lister tildelt dig"}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setCvrSearchOpen(true)}>
              <Sparkles className="h-4 w-4 mr-2" /> Søg nye emner i CVR
            </Button>
            <Button onClick={() => { setPreselectedIds(null); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Opret ny kontaktliste
            </Button>
          </div>
        )}
      </div>

      <Card className="p-4 mb-4">
        <div className="relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Søg lister…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Ingen kontaktlister fundet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Listenavn</TableHead>
                <TableHead>Beskrivelse</TableHead>
                <TableHead className="text-right">Virksomheder</TableHead>
                <TableHead>Fremdrift</TableHead>
                <TableHead>Sælgere</TableHead>
                <TableHead>Oprettet</TableHead>
                <TableHead>Aktiv</TableHead>
                {isAdmin && <TableHead className="w-10"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const pct = r.total > 0 ? Math.round((r.kontaktet / r.total) * 100) : 0;
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/kontaktlister/$id",
                        params: { id: r.id },
                      })
                    }
                  >
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">
                      {r.description || "—"}
                    </TableCell>
                    <TableCell className="text-right">{r.total}</TableCell>
                    <TableCell className="min-w-[160px]">
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="h-2" />
                        <span className="text-xs text-muted-foreground w-10 text-right">
                          {pct}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.sellers.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Ingen</span>
                        ) : (
                          r.sellers.slice(0, 3).map((s) => (
                            <Badge key={s.id} variant="secondary" className="text-xs">
                              {s.name}
                            </Badge>
                          ))
                        )}
                        {r.sellers.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{r.sellers.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("da-DK")}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {isAdmin ? (
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={(v) => toggleActive(r.id, v)}
                        />
                      ) : (
                        <Badge variant={r.is_active ? "default" : "secondary"}>
                          {r.is_active ? "Aktiv" : "Inaktiv"}
                        </Badge>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(r)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {createOpen && (
        <OpretListeDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Slet kontaktliste</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Er du sikker på, at du vil slette listen <strong>{deleteTarget?.name}</strong>?<br />
            Alle {deleteTarget?.total ?? 0} tildelinger fjernes permanent.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Annullér
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Slet liste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Create dialog ----------
type Seller = { id: string; full_name: string };
type Company = {
  id: string;
  name: string;
  cvr: string | null;
  city: string | null;
  industry: string | null;
  employees: number | null;
  municipality: string | null;
  customer_type: string;
};

const CUSTOMER_TYPES: { value: string; label: string }[] = [
  { value: "aktiv_kunde", label: "Aktiv kunde" },
  { value: "sovende_kunde", label: "Sovende kunde" },
  { value: "tidligere_kunde", label: "Tidligere kunde" },
  { value: "nyt_emne", label: "Nyt emne" },
];

const TABLE_PREVIEW_LIMIT = 500;

function OpretListeDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [responsibleSeller, setResponsibleSeller] = useState<string>("");
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);

  // step 2 filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterMunicipality, setFilterMunicipality] = useState("");
  const [filterCustomerTypes, setFilterCustomerTypes] = useState<string[]>([]);
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [filterMachine, setFilterMachine] = useState<string>("");
  const [filterSector, setFilterSector] = useState<string>(""); // "" | private | public | unknown
  const [minEmployees, setMinEmployees] = useState("");

  const [companies, setCompanies] = useState<Company[]>([]); // preview rows (max 500)
  const [totalMatched, setTotalMatched] = useState(0);
  const [allMatchedIds, setAllMatchedIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // First-time tip (vises max 3 gange)
  const [showTip, setShowTip] = useState(false);
  useEffect(() => {
    if (step !== 2) return;
    const seen = parseInt(localStorage.getItem("kontaktliste:filter-tip-seen") ?? "0", 10);
    if (seen < 3) {
      setShowTip(true);
      localStorage.setItem("kontaktliste:filter-tip-seen", String(seen + 1));
    }
  }, [step]);


  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "saelger");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      setSellers(profs ?? []);
    })();
  }, []);

  const applyFilters = <T,>(q: T): T => {
    let qq: any = q;
    if (searchTerm)
      qq = qq.or(`name.ilike.%${searchTerm}%,cvr.ilike.%${searchTerm}%`);
    if (filterIndustry) qq = qq.ilike("industry", `%${filterIndustry}%`);
    if (filterCity) qq = qq.ilike("city", `%${filterCity}%`);
    if (filterMunicipality) qq = qq.ilike("municipality", `%${filterMunicipality}%`);
    if (filterCustomerTypes.length)
      qq = qq.in("customer_type", filterCustomerTypes);
    if (minEmployees) qq = qq.gte("employees", parseInt(minEmployees));
    if (filterMachine === "no")
      qq = qq.ilike("customer_segment_2", "%har ikke maskine%");
    else if (filterMachine === "yes")
      qq = qq.ilike("customer_segment_2", "%udlån/leje%");
    else if (filterMachine === "unknown") qq = qq.is("customer_segment_2", null);
    if (filterSector === "public") qq = qq.eq("is_public", true);
    else if (filterSector === "private") qq = qq.eq("is_public", false).not("cvr", "is", null);
    else if (filterSector === "unknown") qq = qq.eq("is_public", false).is("cvr", null);
    return qq;
  };

  const runSearch = async () => {
    setSearching(true);

    // 1) Fetch preview rows (limited for table render)
    const preview = applyFilters(
      supabase
        .from("companies")
        .select("id, name, cvr, city, industry, employees, municipality, customer_type")
        .order("name")
        .limit(TABLE_PREVIEW_LIMIT),
    );
    const { data: previewData, error: pErr } = await preview;
    if (pErr) {
      toast.error("Søgefejl: " + pErr.message);
      setCompanies([]);
      setAllMatchedIds([]);
      setTotalMatched(0);
      setHasSearched(true);
      setSearching(false);
      return;
    }

    // 2) Fetch ALL matching ids (no row limit) for select-all
    let allIds: string[] = [];
    const PAGE = 1000;
    let from = 0;
    // safety cap at 100k
    for (let i = 0; i < 100; i++) {
      const pageQ = applyFilters(
        supabase.from("companies").select("id").order("name").range(from, from + PAGE - 1),
      );
      const { data, error } = await pageQ;
      if (error) break;
      const chunk = (data ?? []).map((r: any) => r.id as string);
      allIds = allIds.concat(chunk);
      if (chunk.length < PAGE) break;
      from += PAGE;
    }

    // 3) Optionally filter to "ikke tildelt"
    let matchedIds = allIds;
    if (filterUnassigned && allIds.length) {
      const assignedSet = new Set<string>();
      // chunk through .in() to avoid URL limits
      for (let i = 0; i < allIds.length; i += 1000) {
        const slice = allIds.slice(i, i + 1000);
        const { data: aRows } = await supabase
          .from("contact_list_assignments")
          .select("company_id")
          .in("company_id", slice);
        (aRows ?? []).forEach((r: any) => assignedSet.add(r.company_id));
      }
      matchedIds = allIds.filter((id) => !assignedSet.has(id));
    }

    const matchedSet = new Set(matchedIds);
    const previewFiltered = (previewData ?? []).filter((c: any) =>
      matchedSet.has(c.id),
    );

    setCompanies(previewFiltered);
    setAllMatchedIds(matchedIds);
    setTotalMatched(matchedIds.length);
    // Auto-select all matches so brugeren ikke skal huske at klikke "Vælg alle"
    setSelectedIds(new Set(matchedIds));
    setHasSearched(true);
    setSearching(false);
  };

  const toggleCompany = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allMatchedSelected =
    allMatchedIds.length > 0 && allMatchedIds.every((id) => selectedIds.has(id));

  const toggleSelectAllMatched = (v: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (v) allMatchedIds.forEach((id) => next.add(id));
      else allMatchedIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Listenavn er påkrævet");
      return;
    }
    if (!responsibleSeller) {
      toast.error("Vælg en ansvarlig sælger");
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { data: list, error } = await supabase
      .from("contact_lists")
      .insert({
        name: name.trim(),
        description: purpose.trim() || null,
        purpose: purpose.trim() || null,
        created_by: userRes.user?.id,
      })
      .select("id")
      .single();
    if (error || !list) {
      toast.error(error?.message ?? "Fejl ved oprettelse");
      setSaving(false);
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length) {
      const rows = ids.map((company_id) => ({
        contact_list_id: list.id,
        company_id,
        assigned_to: responsibleSeller,
        status: "ny" as const,
      }));
      // chunk insert
      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { error: aErr } = await supabase
          .from("contact_list_assignments")
          .insert(slice);
        if (aErr) {
          toast.error("Liste oprettet, men kunne ikke tildele alle: " + aErr.message);
          setSaving(false);
          onCreated();
          return;
        }
      }
    }
    toast.success(`Kontaktliste oprettet med ${ids.length} virksomheder`);
    setSaving(false);
    onCreated();
  };

  const toggleCustomerType = (value: string, checked: boolean) => {
    setFilterCustomerTypes((prev) =>
      checked ? [...prev, value] : prev.filter((v) => v !== value),
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Opret kontaktliste" : "Tilføj virksomheder"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <Label>Listenavn *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
              <Label>Ansvarlig sælger for denne liste *</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={responsibleSeller}
                onChange={(e) => setResponsibleSeller(e.target.value)}
              >
                <option value="">— Vælg sælger —</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || "Uden navn"}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Alle valgte virksomheder tildeles denne sælger.
              </p>
            </div>

            <div>
              <Label>Formål / instruktion til sælger</Label>
              <Textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={3}
                placeholder="Fx: Sovende kunder Jylland — fokus på reaktivering af kaffeaftale"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Vises øverst på listen når sælgeren åbner den.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {showTip && (
              <div className="flex items-start justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <span>
                  💡 <strong>Tip:</strong> Brug filtrene til at finde de rigtige virksomheder.
                  Kundestatus beregnes automatisk ud fra sidste varekøb i Visma.
                </span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowTip(false)}
                >
                  ✕
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Input
                placeholder="Søg navn eller CVR"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Input
                placeholder="Branche"
                value={filterIndustry}
                onChange={(e) => setFilterIndustry(e.target.value)}
              />
              <Input
                placeholder="By"
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
              />
              <Input
                placeholder="Kommune"
                value={filterMunicipality}
                onChange={(e) => setFilterMunicipality(e.target.value)}
              />
              <Input
                placeholder="Min. ansatte"
                type="number"
                value={minEmployees}
                onChange={(e) => setMinEmployees(e.target.value)}
              />
              <select
                className="border rounded-md px-3 text-sm bg-background"
                value={filterMachine}
                onChange={(e) => setFilterMachine(e.target.value)}
              >
                <option value="">Maskinstatus: Alle</option>
                <option value="no">Har IKKE maskine</option>
                <option value="yes">Har udlån/leje maskine</option>
                <option value="unknown">Ukendt</option>
              </select>
              <select
                className="border rounded-md px-3 text-sm bg-background"
                value={filterSector}
                onChange={(e) => setFilterSector(e.target.value)}
              >
                <option value="">Sektor: Alle</option>
                <option value="private">Private virksomheder</option>
                <option value="public">Offentlige institutioner</option>
                <option value="unknown">Ukendt</option>
              </select>
            </div>

            <div>
              <Label className="text-xs">Kundestatus</Label>
              <div className="flex flex-wrap gap-3 mt-1">
                {CUSTOMER_TYPES.map((t) => (
                  <label
                    key={t.value}
                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={filterCustomerTypes.includes(t.value)}
                      onCheckedChange={(v) => toggleCustomerType(t.value, !!v)}
                    />
                    {t.label}
                  </label>
                ))}
                <label className="flex items-center gap-1.5 text-sm cursor-pointer ml-4 border-l pl-4">
                  <Checkbox
                    checked={filterUnassigned}
                    onCheckedChange={(v) => setFilterUnassigned(!!v)}
                  />
                  Kun ikke tildelte
                </label>
              </div>
              <CustomerStatusLegend className="mt-2" />
            </div>


            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runSearch} variant="secondary" size="sm" disabled={searching}>
                <Search className="h-4 w-4 mr-2" />
                {searching ? "Søger…" : "Søg virksomheder"}
              </Button>
              {minEmployees && (
                <span className="text-xs text-muted-foreground">
                  Bemærk: "Min. ansatte" skjuler virksomheder uden registreret medarbejderantal.
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {hasSearched
                  ? `${totalMatched} virksomheder matcher dit filter${
                      totalMatched > TABLE_PREVIEW_LIMIT
                        ? ` (viser kun de første ${TABLE_PREVIEW_LIMIT} i tabellen)`
                        : ""
                    }`
                  : "Klik 'Søg virksomheder' for at hente liste"}
              </span>
              <span className="inline-flex items-center gap-2 font-medium">
                <Users className="h-4 w-4" />
                {selectedIds.size} valgt
              </span>
            </div>

            {hasSearched && totalMatched === 0 && !searching && (
              <div className="border rounded-md p-8 text-center text-sm text-muted-foreground">
                Ingen virksomheder matchede dine filtre. Prøv at fjerne et eller flere filtre.
              </div>
            )}

            {totalMatched > 0 && (
              <>
                <div className="flex items-center gap-2 text-sm bg-muted/40 rounded-md p-2 border">
                  <Checkbox
                    checked={allMatchedSelected}
                    onCheckedChange={(v) => toggleSelectAllMatched(!!v)}
                  />
                  <span>
                    Vælg alle <strong>{totalMatched}</strong> virksomheder der matcher dit filter
                    {totalMatched > TABLE_PREVIEW_LIMIT && " (ikke kun de viste)"}
                  </span>
                </div>
                <div className="border rounded-md max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Virksomhed</TableHead>
                        <TableHead>CVR</TableHead>
                        <TableHead>By</TableHead>
                        <TableHead>Ansatte</TableHead>
                        <TableHead>Kundetype</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companies.map((c) => {
                        const checked = selectedIds.has(c.id);
                        return (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleCompany(c.id)}
                              />
                            </TableCell>
                            <TableCell>{c.name}</TableCell>
                            <TableCell className="text-xs">{c.cvr ?? "—"}</TableCell>
                            <TableCell>{c.city ?? "—"}</TableCell>
                            <TableCell>{c.employees ?? "—"}</TableCell>
                            <TableCell className="text-xs">
                              <CustomerStatusBadge
                                type={c.customer_type}
                                variant="outline"
                                className="text-xs"
                              />
                            </TableCell>

                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                Annullér
              </Button>
              <Button
                onClick={() => {
                  if (!name.trim()) {
                    toast.error("Listenavn er påkrævet");
                    return;
                  }
                  if (!responsibleSeller) {
                    toast.error("Vælg en ansvarlig sælger");
                    return;
                  }
                  setStep(2);
                  if (!hasSearched) runSearch();
                }}
              >
                Næste: Tilføj virksomheder
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}>
                Tilbage
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Opret liste ({selectedIds.size})
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
