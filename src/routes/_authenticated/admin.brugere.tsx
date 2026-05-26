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

  const load = async () => {
    setLoading(true);
    try {
      const data = await listFn();
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

  const onCreate = async () => {
    if (!createForm.full_name.trim() || !createForm.email.trim() || createForm.password.length < 8) {
      toast.error("Udfyld navn, email og adgangskode (min. 8 tegn)");
      return;
    }
    setCreating(true);
    try {
      await createFn({
        data: {
          ...createForm,
          region: createForm.region || null,
          salesperson_no:
            createForm.role === "saelger" && createForm.salesperson_no.trim()
              ? createForm.salesperson_no.trim()
              : null,
        },
      });
      toast.success("Bruger oprettet");
      setCreateOpen(false);
      setCreateForm({ full_name: "", email: "", password: "", role: "saelger", region: "", salesperson_no: "" });
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
            editForm.role === "saelger" && editForm.salesperson_no.trim()
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
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Ingen brugere fundet
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.full_name || "—"}</TableCell>
                  <TableCell>{r.email}</TableCell>
                  <TableCell>
                    {r.role === "admin" ? (
                      <Badge variant="default">Admin</Badge>
                    ) : r.role === "salgssupport" ? (
                      <Badge className="bg-amber-500 hover:bg-amber-500/90 text-white">Salgssupport</Badge>
                    ) : (
                      <Badge variant="secondary">Sælger</Badge>
                    )}
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
            {createForm.role === "saelger" && (
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
              {editForm.role === "saelger" && (
                <div>
                  <Label>Sælgernummer</Label>
                  <Input
                    value={editForm.salesperson_no}
                    onChange={(e) => setEditForm({ ...editForm, salesperson_no: e.target.value })}
                    placeholder="fx 106"
                  />
                </div>
              )}
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
