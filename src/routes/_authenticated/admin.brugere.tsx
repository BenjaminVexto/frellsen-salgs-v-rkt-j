import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminSetUserActive,
  adminResetUserPassword,
  adminUpdateUserEmail,
} from "@/lib/admin-users.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Pencil, KeyRound, Mail } from "lucide-react";
import { CvrApiStatusKort } from "@/components/cvr-api-status-kort";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/brugere")({
  component: BrugerStyringSide,
});

type AppRoleX = "admin" | "saelger" | "salgssupport";
type Row = {
  id: string;
  full_name: string;
  email: string;
  role: AppRoleX;
  region: string | null;
  salesperson_no: string | null;
  is_active: boolean;
  created_at: string;
};
type Afdeling = { afdeling_nr: number; navn: string };

/** Kolonner der kan sorteres — alfabetisk for tekst, numerisk for tal/dato. */
type SortKey =
  | "full_name"
  | "email"
  | "role"
  | "afdeling"
  | "region"
  | "salesperson_no"
  | "created_at"
  | "is_active";
const SORT_LABELS: Record<SortKey, string> = {
  full_name: "Navn",
  email: "Email",
  role: "Rolle",
  afdeling: "Afdelinger",
  region: "Region",
  salesperson_no: "Sælgernr.",
  created_at: "Oprettet",
  is_active: "Aktiv",
};


function BrugerStyringSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(adminListUsers);
  const createFn = useServerFn(adminCreateUser);
  const updateFn = useServerFn(adminUpdateUser);
  const setActiveFn = useServerFn(adminSetUserActive);
  const resetPwFn = useServerFn(adminResetUserPassword);
  const updateEmailFn = useServerFn(adminUpdateUserEmail);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("full_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Afdelingsadgang er en akse for sig — uafhængig af rollen i user_roles.
  const [afdelinger, setAfdelinger] = useState<Afdeling[]>([]);
  const [accessByUser, setAccessByUser] = useState<Record<string, number[]>>({});
  const [primaryByUser, setPrimaryByUser] = useState<Record<string, number | null>>({});
  const [afdSaving, setAfdSaving] = useState(false);
  const [editAfd, setEditAfd] = useState<number[]>([]);
  const [editPrimary, setEditPrimary] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "saelger" as AppRoleX,
    region: "",
    salesperson_no: "",
  });
  const [creating, setCreating] = useState(false);
  const [createAfd, setCreateAfd] = useState<number[]>([]);
  const [createPrimary, setCreatePrimary] = useState<number | null>(null);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "created_at" || key === "is_active" ? "desc" : "asc");
    }
  };

  const sortedRows = useMemo(() => {
    const roleRank: Record<string, number> = { admin: 0, salgssupport: 1, saelger: 2 };
    const num = (r: Row): number | null => {
      switch (sortKey) {
        case "created_at":
          return new Date(r.created_at).getTime();
        case "is_active":
          return r.is_active ? 1 : 0;
        case "role":
          return roleRank[r.role] ?? 99;
        case "afdeling":
          return (accessByUser[r.id] ?? [])[0] ?? Number.POSITIVE_INFINITY;
        default:
          return null;
      }
    };
    const txt = (r: Row): string => {
      switch (sortKey) {
        case "email":
          return r.email ?? "";
        case "region":
          return r.region ?? "";
        case "salesperson_no":
          return r.salesperson_no ?? "";
        default:
          return r.full_name ?? "";
      }
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const na = num(a);
      if (na !== null) {
        const nb = num(b) ?? 0;
        if (na !== nb) return (na - nb) * dir;
        return (a.full_name ?? "").localeCompare(b.full_name ?? "", "da-DK");
      }
      const cmp = txt(a).localeCompare(txt(b), "da-DK", { numeric: true, sensitivity: "base" });
      if (cmp !== 0) return cmp * dir;
      return (a.full_name ?? "").localeCompare(b.full_name ?? "", "da-DK");
    });
  }, [rows, sortKey, sortDir, accessByUser]);


  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    role: "saelger" as AppRoleX,
    region: "",
    salesperson_no: "",
  });
  const [saving, setSaving] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwValue, setPwValue] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailValue, setEmailValue] = useState("");


  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  const loadAfdelingData = async () => {
    const [{ data: afd }, { data: access }, { data: profs }] = await Promise.all([
      supabase.from("afdeling").select("afdeling_nr, navn").order("afdeling_nr"),
      supabase.from("user_afdeling_access").select("user_id, afdeling_nr"),
      supabase.from("profiles").select("id, primary_afdeling_nr"),
    ]);
    setAfdelinger((afd ?? []) as Afdeling[]);
    const byUser: Record<string, number[]> = {};
    ((access ?? []) as any[]).forEach((r) => {
      (byUser[r.user_id] ??= []).push(r.afdeling_nr);
    });
    Object.values(byUser).forEach((list) => list.sort((a, b) => a - b));
    setAccessByUser(byUser);
    const prim: Record<string, number | null> = {};
    ((profs ?? []) as any[]).forEach((p) => {
      prim[p.id] = p.primary_afdeling_nr ?? null;
    });
    setPrimaryByUser(prim);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [data] = await Promise.all([listFn(), loadAfdelingData()]);
      setRows(data as Row[]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke hente brugere");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (auth.role === "admin") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.role]);

  /**
   * Gemmer afdelingsadgang + primær afdeling for en bruger.
   * Bruges både ved oprettelse og redigering.
   */
  const saveAfdelingAccess = async (
    userId: string,
    afdeling: number[],
    primaryWanted: number | null,
  ): Promise<number | null> => {
    const current = accessByUser[userId] ?? [];
    const toAdd = afdeling.filter((n) => !current.includes(n));
    const toRemove = current.filter((n) => !afdeling.includes(n));
    if (toRemove.length) {
      const { error } = await supabase
        .from("user_afdeling_access")
        .delete()
        .eq("user_id", userId)
        .in("afdeling_nr", toRemove);
      if (error) throw error;
    }
    if (toAdd.length) {
      const { error } = await supabase
        .from("user_afdeling_access")
        .insert(toAdd.map((nr) => ({ user_id: userId, afdeling_nr: nr })));
      if (error) throw error;
    }
    const primary =
      primaryWanted != null && afdeling.includes(primaryWanted) ? primaryWanted : (afdeling[0] ?? null);
    const { error: pErr } = await supabase
      .from("profiles")
      .update({ primary_afdeling_nr: primary })
      .eq("id", userId);
    if (pErr) throw pErr;
    setAccessByUser((prev) => ({ ...prev, [userId]: [...afdeling] }));
    setPrimaryByUser((prev) => ({ ...prev, [userId]: primary }));
    return primary;
  };

  /** Primær afdeling skal altid være én af de valgte afdelinger. */
  const toggleCreateAfd = (nr: number, on: boolean) => {
    const next = on ? [...createAfd, nr].sort((a, b) => a - b) : createAfd.filter((x) => x !== nr);
    setCreateAfd(next);
    if (createPrimary != null && !next.includes(createPrimary)) {
      setCreatePrimary(next[0] ?? null);
    } else if (createPrimary == null && next.length) {
      setCreatePrimary(next[0]);
    }
  };

  const onCreate = async () => {
    if (!createForm.full_name.trim() || !createForm.email.trim() || createForm.password.length < 8) {
      toast.error("Udfyld navn, email og adgangskode (min. 8 tegn)");
      return;
    }
    if (
      (createForm.role === "saelger" || createForm.role === "salgssupport") &&
      createAfd.length === 0
    ) {
      toast.error("Vælg mindst én afdeling");
      return;
    }
    setCreating(true);
    try {
      const created = await createFn({
        data: {
          ...createForm,
          region: createForm.region || null,
          salesperson_no:
            (createForm.role === "saelger" || createForm.role === "admin") && createForm.salesperson_no.trim()
              ? createForm.salesperson_no.trim()
              : null,
        },
      });
      await saveAfdelingAccess((created as { id: string }).id, createAfd, createPrimary);
      toast.success("Bruger oprettet");
      setCreateOpen(false);
      setCreateForm({ full_name: "", email: "", password: "", role: "saelger", region: "", salesperson_no: "" });
      setCreateAfd([]);
      setCreatePrimary(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Fejl ved oprettelse");
    } finally {
      setCreating(false);
    }
  };


  const openEdit = (r: Row) => {
    setEditRow(r);
    setEditForm({
      full_name: r.full_name,
      role: r.role,
      region: r.region ?? "",
      salesperson_no: r.salesperson_no ?? "",
    });
    setEditAfd(accessByUser[r.id] ?? []);
    setEditPrimary(primaryByUser[r.id] ?? null);
  };

  /** Primær afdeling skal altid være én af brugerens tildelte afdelinger. */
  const toggleEditAfd = (nr: number, on: boolean) => {
    const next = on ? [...editAfd, nr].sort((a, b) => a - b) : editAfd.filter((x) => x !== nr);
    setEditAfd(next);
    if (editPrimary != null && !next.includes(editPrimary)) {
      setEditPrimary(next[0] ?? null);
    } else if (editPrimary == null && next.length) {
      setEditPrimary(next[0]);
    }
  };

  const onSaveAfdeling = async () => {
    if (!editRow) return;
    setAfdSaving(true);
    try {
      const primary = await saveAfdelingAccess(editRow.id, editAfd, editPrimary);
      setEditPrimary(primary);
      toast.success("Afdelingsadgang opdateret");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke gemme afdelingsadgang");
    } finally {
      setAfdSaving(false);
    }
  };


  const onSaveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      await updateFn({
        data: {
          user_id: editRow.id,
          full_name: editForm.full_name,
          role: editForm.role,
          region: editForm.region || null,
          salesperson_no:
            (editForm.role === "saelger" || editForm.role === "admin") && editForm.salesperson_no.trim()
              ? editForm.salesperson_no.trim()
              : null,
        },
      });
      toast.success("Bruger opdateret");
      setEditRow(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke gemme");
    } finally {
      setSaving(false);
    }
  };

  const onToggleActive = async (r: Row, next: boolean) => {
    try {
      await setActiveFn({ data: { user_id: r.id, is_active: next } });
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: next } : x)));
      toast.success(next ? "Bruger aktiveret" : "Bruger deaktiveret");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke ændre status");
    }
  };

  const onResetPassword = async () => {
    if (!editRow || pwValue.length < 8) {
      toast.error("Adgangskode skal være min. 8 tegn");
      return;
    }
    try {
      await resetPwFn({ data: { user_id: editRow.id, new_password: pwValue } });
      toast.success("Adgangskode nulstillet");
      setPwOpen(false);
      setPwValue("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke nulstille");
    }
  };

  const onUpdateEmail = async () => {
    if (!editRow || !emailValue.trim()) return;
    try {
      await updateEmailFn({ data: { user_id: editRow.id, email: emailValue.trim() } });
      toast.success("Email opdateret");
      setEmailOpen(false);
      setEmailValue("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke ændre email");
    }
  };

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Brugerstyring</h1>
          <p className="text-sm text-muted-foreground">Administrér adgang, roller og områder for brugere.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Opret bruger
        </Button>
      </div>

      <CvrApiStatusKort />


      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Afdelinger</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Sælgernr.</TableHead>
                <TableHead>Oprettet</TableHead>
                <TableHead>Aktiv</TableHead>
                <TableHead className="text-right">Handlinger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Ingen brugere fundet
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.full_name || "—"}</TableCell>
                  <TableCell>
                    {r.email ? (
                      <a href={`mailto:${r.email}`} className="hover:underline">
                        {r.email}
                      </a>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {r.role === "admin" ? (
                      <Badge variant="default">Admin</Badge>
                    ) : r.role === "salgssupport" ? (
                      <Badge className="bg-amber-500 hover:bg-amber-500/90 text-white">Salgssupport</Badge>
                    ) : (
                      <Badge variant="secondary">Sælger</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    <AfdelingCell
                      role={r.role}
                      afdelinger={afdelinger}
                      access={accessByUser[r.id] ?? []}
                      primary={primaryByUser[r.id] ?? null}
                    />
                  </TableCell>
                  <TableCell>{r.region || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.salesperson_no || "—"}</TableCell>

                  <TableCell>{new Date(r.created_at).toLocaleDateString("da-DK")}</TableCell>
                  <TableCell>
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={(v) => onToggleActive(r, v)}
                      disabled={r.id === auth.user?.id}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4 mr-1" /> Redigér
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Opret ny bruger</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Fuldt navn</Label>
              <Input
                value={createForm.full_name}
                onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Midlertidig adgangskode</Label>
              <Input
                type="text"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">Brugeren bør skifte adgangskode ved første login.</p>
            </div>
            <div>
              <Label>Rolle</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) => setCreateForm({ ...createForm, role: v as AppRoleX })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="saelger">Sælger</SelectItem>
                  <SelectItem value="salgssupport">Salgssupport</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Region/område</Label>
              <Input
                value={createForm.region}
                onChange={(e) => setCreateForm({ ...createForm, region: e.target.value })}
                placeholder="fx Nordsjælland"
              />
            </div>
            {(createForm.role === "saelger" || createForm.role === "admin") && (
              <div>
                <Label>Sælgernummer</Label>
                <Input
                  value={createForm.salesperson_no}
                  onChange={(e) => setCreateForm({ ...createForm, salesperson_no: e.target.value })}
                  placeholder="fx 106"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Bruges til auto-tildeling ved CSV-import (kolonnen "Sælgernummer").
                </p>
              </div>
            )}
            <div className="border-t pt-4 space-y-3">
              <div>
                <Label>Afdelingsadgang</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Rolle og afdelingsadgang er uafhængige. En bruger kan have flere afdelinger.
                </p>
                {createForm.role === "admin" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Administratorer har adgang til <strong>alle</strong> afdelinger uanset afkrydsning herunder.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {afdelinger.map((a) => (
                  <label key={a.afdeling_nr} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={createAfd.includes(a.afdeling_nr)}
                      onCheckedChange={(v) => toggleCreateAfd(a.afdeling_nr, v === true)}
                    />
                    {a.afdeling_nr} — {a.navn}
                  </label>
                ))}
              </div>
              <div>
                <Label>Primær afdeling</Label>
                <Select
                  value={createPrimary != null ? String(createPrimary) : ""}
                  onValueChange={(v) => setCreatePrimary(v ? Number(v) : null)}
                  disabled={createAfd.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Vælg primær afdeling" />
                  </SelectTrigger>
                  <SelectContent>
                    {afdelinger
                      .filter((a) => createAfd.includes(a.afdeling_nr))
                      .map((a) => (
                        <SelectItem key={a.afdeling_nr} value={String(a.afdeling_nr)}>
                          {a.afdeling_nr} — {a.navn}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annullér</Button>
            <Button onClick={onCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Opret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redigér bruger</DialogTitle>
          </DialogHeader>
          {editRow && (
            <div className="space-y-3">
              <div>
                <Label>Fuldt navn</Label>
                <Input
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Rolle</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(v) => setEditForm({ ...editForm, role: v as AppRoleX })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saelger">Sælger</SelectItem>
                    <SelectItem value="salgssupport">Salgssupport</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Region/område</Label>
                <Input
                  value={editForm.region}
                  onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                />
              </div>
              {(editForm.role === "saelger" || editForm.role === "admin") && (
                <div>
                  <Label>Sælgernummer</Label>
                  <Input
                    value={editForm.salesperson_no}
                    onChange={(e) => setEditForm({ ...editForm, salesperson_no: e.target.value })}
                    placeholder="fx 106"
                  />
                </div>
              )}

              <div className="rounded-md border p-3 space-y-3">
                <div>
                  <Label>Afdelingsadgang</Label>
                  <p className="text-xs text-muted-foreground">
                    Rolle og afdelingsadgang er uafhængige. En bruger kan have flere afdelinger.
                  </p>
                </div>
                {editForm.role === "admin" && (
                  <p className="text-xs text-muted-foreground">
                    Administratorer har adgang til <strong>alle</strong> afdelinger uanset afkrydsning herunder.
                  </p>
                )}
                <div className="space-y-2">
                  {afdelinger.map((a) => (
                    <label key={a.afdeling_nr} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={editAfd.includes(a.afdeling_nr)}
                        onCheckedChange={(v) => toggleEditAfd(a.afdeling_nr, v === true)}
                      />
                      {a.afdeling_nr} — {a.navn}
                    </label>
                  ))}
                </div>
                <div>
                  <Label>Primær afdeling</Label>
                  <Select
                    value={editPrimary != null ? String(editPrimary) : "none"}
                    onValueChange={(v) => setEditPrimary(v === "none" ? null : Number(v))}
                    disabled={editAfd.length === 0}
                  >
                    <SelectTrigger><SelectValue placeholder="Ingen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ingen</SelectItem>
                      {afdelinger
                        .filter((a) => editAfd.includes(a.afdeling_nr))
                        .map((a) => (
                          <SelectItem key={a.afdeling_nr} value={String(a.afdeling_nr)}>
                            {a.afdeling_nr} — {a.navn}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={onSaveAfdeling} disabled={afdSaving}>
                  {afdSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Gem afdelingsadgang
                </Button>
              </div>

              <div className="flex gap-2 pt-2">

                <Button variant="outline" size="sm" onClick={() => { setEmailValue(editRow.email); setEmailOpen(true); }}>
                  <Mail className="h-4 w-4 mr-1" /> Skift email
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>
                  <KeyRound className="h-4 w-4 mr-1" /> Nulstil adgangskode
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>Annullér</Button>
            <Button onClick={onSaveEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Gem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nulstil adgangskode</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Ny adgangskode</Label>
            <Input type="text" value={pwValue} onChange={(e) => setPwValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)}>Annullér</Button>
            <Button onClick={onResetPassword}>Nulstil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change email dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skift email</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Ny email</Label>
            <Input type="email" value={emailValue} onChange={(e) => setEmailValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>Annullér</Button>
            <Button onClick={onUpdateEmail}>Gem</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Viser brugerens afdelinger — og markerer tydeligt hvis der ingen er. */
function AfdelingCell({
  role,
  afdelinger,
  access,
  primary,
}: {
  role: AppRoleX;
  afdelinger: Afdeling[];
  access: number[];
  primary: number | null;
}) {
  if (role === "admin") {
    return <Badge variant="outline">Alle afdelinger (admin)</Badge>;
  }
  if (access.length === 0) {
    return (
      <Badge variant="destructive" className="whitespace-nowrap">
        Mangler afdelingsadgang
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {access.map((nr) => {
        const navn = afdelinger.find((a) => a.afdeling_nr === nr)?.navn ?? String(nr);
        return (
          <Badge key={nr} variant={nr === primary ? "secondary" : "outline"} className="font-normal">
            {nr} — {navn}
            {nr === primary ? " ★" : ""}
          </Badge>
        );
      })}
    </div>
  );
}
