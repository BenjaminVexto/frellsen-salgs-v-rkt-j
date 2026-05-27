import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TrendingUp, Download, ListPlus, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/vaekstpotentiale")({
  component: VaekstpotentialePage,
});

type Row = {
  id: string;
  name: string;
  city: string | null;
  cvr: string | null;
  phone: string | null;
  email: string | null;
  customer_segment_1: string | null;
  assigned_to: string | null;
  location_count: number;
};

type Profile = { id: string; full_name: string };

function VaekstpotentialePage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellerFilter, setSellerFilter] = useState<string>("__all");
  const [minLoc, setMinLoc] = useState<number>(2);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: companies }, { data: profs }] = await Promise.all([
        supabase
          .from("companies")
          .select("id, name, city, cvr, phone, email, customer_segment_1, assigned_to, locations(count)")
          .not("cvr", "is", null)
          .order("name"),
        supabase.from("profiles").select("id, full_name").eq("is_active", true),
      ]);
      const mapped: Row[] = ((companies ?? []) as any[])
        .map((c) => ({
          id: c.id,
          name: c.name,
          city: c.city,
          cvr: c.cvr,
          phone: c.phone,
          email: c.email,
          customer_segment_1: c.customer_segment_1,
          assigned_to: c.assigned_to,
          location_count: Array.isArray(c.locations) ? (c.locations[0]?.count ?? 0) : 0,
        }))
        .filter((r) => r.location_count >= 2)
        .sort((a, b) => b.location_count - a.location_count);
      setRows(mapped);
      setProfiles((profs ?? []) as Profile[]);
      setLoading(false);
    })();
  }, []);

  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) m.set(p.id, p.full_name);
    return m;
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.location_count < minLoc) return false;
      if (sellerFilter !== "__all") {
        if (sellerFilter === "__none" && r.assigned_to) return false;
        if (sellerFilter !== "__none" && r.assigned_to !== sellerFilter) return false;
      }
      if (q && !`${r.name} ${r.city ?? ""} ${r.cvr ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, sellerFilter, minLoc, search]);

  function exportCsv() {
    const header = ["Virksomhedsnavn", "CVR", "By", "Sælger", "Antal lokationer", "Telefon", "Email"];
    const lines = [header.join(";")];
    for (const r of filtered) {
      const seller = r.assigned_to ? profileMap.get(r.assigned_to) ?? "" : "";
      const fields = [r.name, r.cvr ?? "", r.city ?? "", seller, String(r.location_count), r.phone ?? "", r.email ?? ""];
      lines.push(fields.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vaekstpotentiale.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-4 md:px-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" /> Vækstpotentiale
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Kunder med flere lokationer end vi aktivt bearbejder.
        </p>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <Label className="text-xs mb-1.5 block">Sælger</Label>
            <Select value={sellerFilter} onValueChange={setSellerFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Alle sælgere</SelectItem>
                <SelectItem value="__none">Ikke tildelt</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[140px]">
            <Label className="text-xs mb-1.5 block">Min. lokationer</Label>
            <Select value={String(minLoc)} onValueChange={(v) => setMinLoc(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2, 3, 5, 10, 20].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}+</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs mb-1.5 block">Søg</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Virksomhed, by, CVR..."
            />
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          {loading ? "Indlæser…" : `${filtered.length} virksomheder med vækstpotentiale`}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-1.5" /> Eksportér CSV
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!filtered.length}>
              <ListPlus className="h-4 w-4 mr-1.5" /> Opret kontaktliste
            </Button>
          )}
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground text-center">
            Ingen virksomheder matcher filteret.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5">Virksomhed</th>
                  <th className="text-left px-4 py-2.5">By</th>
                  <th className="text-right px-4 py-2.5">Lokationer</th>
                  <th className="text-left px-4 py-2.5">Sælger</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <Link
                        to="/virksomheder/$id"
                        params={{ id: r.id }}
                        hash="lokationer"
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.cvr && (
                        <div className="text-xs text-muted-foreground">CVR {r.cvr}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.city ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1 font-medium">
                        {r.location_count}
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.assigned_to ? profileMap.get(r.assigned_to) ?? "Ukendt" : (
                        <span className="italic">Ikke tildelt</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <OpretKontaktlisteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        profiles={profiles}
        companyIds={filtered.map((r) => r.id)}
      />
    </div>
  );
}

function OpretKontaktlisteDialog({
  open,
  onOpenChange,
  profiles,
  companyIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profiles: Profile[];
  companyIds: string[];
}) {
  const { user } = useAuth();
  const defaultName = `Vækstpotentiale ${new Date().toLocaleDateString("da-DK", { month: "short", year: "2-digit" })}`;
  const [name, setName] = useState(defaultName);
  const [seller, setSeller] = useState<string>("__none");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setSeller("__none");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function create() {
    if (!name.trim()) {
      toast.error("Angiv et navn");
      return;
    }
    setSaving(true);
    const { data: list, error: e1 } = await supabase
      .from("contact_lists")
      .insert({ name: name.trim(), created_by: user?.id ?? null, purpose: "Vækstpotentiale" })
      .select("id")
      .single();
    if (e1 || !list) {
      toast.error("Kunne ikke oprette liste: " + (e1?.message ?? "ukendt fejl"));
      setSaving(false);
      return;
    }
    const assignedTo = seller === "__none" ? null : seller;
    const rows = companyIds.map((cid) => ({
      contact_list_id: list.id,
      company_id: cid,
      assigned_to: assignedTo,
    }));
    const { error: e2 } = await supabase.from("contact_list_assignments").insert(rows);
    setSaving(false);
    if (e2) {
      toast.error("Liste oprettet, men virksomheder kunne ikke tilknyttes: " + e2.message);
      return;
    }
    toast.success(`Kontaktliste oprettet med ${companyIds.length} virksomheder`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opret kontaktliste</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">Navn</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Sælger</Label>
            <Select value={seller} onValueChange={setSeller}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Ikke tildelt</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            {companyIds.length} virksomheder tilføjes.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annullér</Button>
          <Button onClick={create} disabled={saving}>{saving ? "Opretter…" : "Opret"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
