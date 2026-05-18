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
import { Loader2, Plus, Search, Users, Trash2 } from "lucide-react";
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
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Opret ny kontaktliste
          </Button>
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

function OpretListeDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selectedSellers, setSelectedSellers] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);

  // step 2
  const [searchTerm, setSearchTerm] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterMunicipality, setFilterMunicipality] = useState("");
  const [filterCustomerType, setFilterCustomerType] = useState("");
  const [minEmployees, setMinEmployees] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<
    Record<string, string>
  >({}); // company_id -> assigned_to seller id
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

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

  const runSearch = async () => {
    setSearching(true);
    let q = supabase
      .from("companies")
      .select("id, name, cvr, city, industry, employees, municipality, customer_type")
      .order("name")
      .limit(500);
    if (searchTerm)
      q = q.or(`name.ilike.%${searchTerm}%,cvr.ilike.%${searchTerm}%`);
    if (filterIndustry) q = q.ilike("industry", `%${filterIndustry}%`);
    if (filterCity) q = q.ilike("city", `%${filterCity}%`);
    if (filterMunicipality) q = q.ilike("municipality", `%${filterMunicipality}%`);
    if (filterCustomerType) q = q.eq("customer_type", filterCustomerType as any);
    if (minEmployees) q = q.gte("employees", parseInt(minEmployees));
    const { data, error } = await q;
    if (error) {
      toast.error("Søgefejl: " + error.message);
      setCompanies([]);
    } else {
      setCompanies(data ?? []);
    }
    setHasSearched(true);
    setSearching(false);
  };

  const toggleCompany = (id: string) => {
    setSelectedCompanies((prev) => {
      const copy = { ...prev };
      if (id in copy) delete copy[id];
      else copy[id] = selectedSellers[0] ?? "";
      return copy;
    });
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Listenavn er påkrævet");
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { data: list, error } = await supabase
      .from("contact_lists")
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        created_by: userRes.user?.id,
      })
      .select("id")
      .single();
    if (error || !list) {
      toast.error(error?.message ?? "Fejl ved oprettelse");
      setSaving(false);
      return;
    }
    const entries = Object.entries(selectedCompanies);
    if (entries.length) {
      const rows = entries.map(([company_id, assigned_to]) => ({
        contact_list_id: list.id,
        company_id,
        assigned_to:
          assigned_to ||
          selectedSellers[0] ||
          null,
        status: "ny" as const,
      }));
      const { error: aErr } = await supabase
        .from("contact_list_assignments")
        .insert(rows);
      if (aErr) {
        toast.error("Liste oprettet, men kunne ikke tildele: " + aErr.message);
        setSaving(false);
        onCreated();
        return;
      }
    }
    toast.success("Kontaktliste oprettet");
    setSaving(false);
    onCreated();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
              <Label>Beskrivelse</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <Label>Tildel sælgere</Label>
              <div className="grid grid-cols-2 gap-2 mt-2 max-h-60 overflow-y-auto border rounded-md p-3">
                {sellers.length === 0 && (
                  <div className="text-sm text-muted-foreground col-span-2">
                    Ingen sælgere fundet
                  </div>
                )}
                {sellers.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedSellers.includes(s.id)}
                      onCheckedChange={(v) =>
                        setSelectedSellers((prev) =>
                          v ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                        )
                      }
                    />
                    {s.full_name || "Uden navn"}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
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
                value={filterCustomerType}
                onChange={(e) => setFilterCustomerType(e.target.value)}
              >
                <option value="">Alle kundetyper</option>
                <option value="nyt_emne">Nyt emne</option>
                <option value="aktiv_kunde">Aktiv kunde</option>
                <option value="sovende_kunde">Sovende kunde</option>
                <option value="tidligere_kunde">Tidligere kunde</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runSearch} variant="secondary" size="sm" disabled={searching}>
                <Search className="h-4 w-4 mr-2" />
                {searching ? "Søger…" : "Søg virksomheder"}
              </Button>
              {minEmployees && (
                <span className="text-xs text-muted-foreground">
                  Bemærk: filter på "Min. ansatte" skjuler virksomheder uden registreret medarbejderantal.
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {hasSearched
                  ? `${companies.length} virksomheder fundet${companies.length === 500 ? " (vis kun de første 500 — indsnævr søgningen)" : ""}`
                  : "Klik 'Søg virksomheder' for at hente liste"}
              </span>
              <span className="inline-flex items-center gap-2 font-medium">
                <Users className="h-4 w-4" />
                {Object.keys(selectedCompanies).length} valgt
              </span>
            </div>

            {hasSearched && companies.length === 0 && !searching && (
              <div className="border rounded-md p-8 text-center text-sm text-muted-foreground">
                Ingen virksomheder matchede dine filtre. Prøv at fjerne et eller flere filtre.
              </div>
            )}

            {companies.length > 0 && (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={companies.every((c) => c.id in selectedCompanies)}
                    onCheckedChange={(v) => {
                      if (v) {
                        const next: Record<string, string> = { ...selectedCompanies };
                        companies.forEach((c) => {
                          if (!(c.id in next)) next[c.id] = selectedSellers[0] ?? "";
                        });
                        setSelectedCompanies(next);
                      } else {
                        const next = { ...selectedCompanies };
                        companies.forEach((c) => delete next[c.id]);
                        setSelectedCompanies(next);
                      }
                    }}
                  />
                  <span>Vælg alle viste</span>
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
                        <TableHead>Tildel sælger</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companies.map((c) => {
                        const checked = c.id in selectedCompanies;
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
                            <TableCell>
                              <select
                                className="border rounded px-2 py-1 text-xs bg-background"
                                value={selectedCompanies[c.id] ?? ""}
                                onChange={(e) =>
                                  setSelectedCompanies((prev) => ({
                                    ...prev,
                                    [c.id]: e.target.value,
                                  }))
                                }
                                disabled={!checked}
                              >
                                <option value="">— Vælg —</option>
                                {selectedSellers.map((sid) => {
                                  const s = sellers.find((x) => x.id === sid);
                                  return (
                                    <option key={sid} value={sid}>
                                      {s?.full_name ?? "Sælger"}
                                    </option>
                                  );
                                })}
                              </select>
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
                  setStep(2);
                  // Auto-load companies on entering step 2
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
                Opret liste
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
