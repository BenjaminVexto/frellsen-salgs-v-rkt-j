import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CustomerStatusBadge } from "@/components/customer-status-info";

import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ArrowUpDown,
  Loader2,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { LISTE_STATUSSER, STATUS_LABEL, statusTekst, type ListeStatus } from "@/lib/telemarketing";
import { UdfaldDialog } from "@/components/kontaktliste/udfald-dialog";
import { Download, Globe } from "lucide-react";
import { hentAlle } from "@/lib/hent-alle";
import { formatTelefon, telHref, webHref, telefonNumre } from "@/lib/telefon";
import { Ringevisning } from "@/components/telemarketing/ringevisning";
import { BureauPanel } from "@/components/telemarketing/bureau-panel";

export const Route = createFileRoute("/_authenticated/kontaktlister_/$id")({
  component: KontaktlisteSide,
});

function KontaktlisteSide() {
  const auth = useAuth();
  const { id } = Route.useParams();
  if (auth.loading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
  if (auth.role === "telemarketing") return <Ringevisning listId={id} />;
  return <KontaktlisteDetalje />;
}

const STATUS_OPTIONS: { value: AssignmentStatus; label: string }[] = LISTE_STATUSSER.map((v) => ({ value: v, label: STATUS_LABEL[v] }));

const PRIORITY_OPTIONS: { value: PriorityLevel; label: string }[] = [
  { value: "høj", label: "Høj" },
  { value: "middel", label: "Middel" },
  { value: "lav", label: "Lav" },
];

const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  nyt_emne: "Nyt emne",
  aktiv_kunde: "Aktiv kunde",
  sovende_kunde: "Sovende kunde",
  servicekunde: "Servicekunde",
  tidligere_kunde: "Tidligere kunde",
};

type AssignmentStatus = ListeStatus;

type PriorityLevel = "høj" | "middel" | "lav";


type Row = {
  id: string;
  company_id: string;
  status: AssignmentStatus;
  status_aarsag: string | null;
  antal_forsoeg: number;
  kontakter: { id: string; navn: string; titel: string | null }[];
  priority: PriorityLevel;
  next_followup_date: string | null;
  next_action_note: string | null;
  assigned_to: string | null;
  location_id: string | null;
  location_city: string | null;
  location_phone: string | null;
  location_address: string | null;
  location_zip: string | null;
  kontakt: { name: string; title: string | null; phone: string | null; email: string | null } | null;
  company: {
    name: string;
    city: string | null;
    employees: number | null;
    customer_type: string;
    phone: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    zip: string | null;
  };
  seller_name: string;
  last_activity_at: string | null;
  last_activity_type: string | null;
  seneste_note: { note: string; at: string; bruger: string } | null;
};

function KontaktlisteDetalje() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const isAdmin = auth.role === "admin";

  const [list, setList] = useState<{
    name: string;
    description: string | null;
    purpose: string | null;
  } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [fStatus, setFStatus] = useState<string>("alle");
  const [fPriority, setFPriority] = useState<string>("alle");
  const [fSeller, setFSeller] = useState<string>("alle");
  const [fOnlyMine, setFOnlyMine] = useState(false);
  const [fOverdue, setFOverdue] = useState(false);
  const [fKunTlf, setFKunTlf] = useState(false);

  // sort
  const [sortKey, setSortKey] = useState<string>("company");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [udfaldRow, setUdfaldRow] = useState<Row | null>(null);
  const [statRefresh, setStatRefresh] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: listData }, assigns] = await Promise.all([
      supabase
        .from("contact_lists")
        .select("name, description, purpose")
        .eq("id", id)
        .maybeSingle(),
      hentAlle<any>((f, t) =>
        supabase
          .from("contact_list_assignments")
          .select(
            "id, company_id, status, status_aarsag, antal_forsoeg, priority, next_followup_date, next_action_note, assigned_to, location_id, companies(name, city, employees, customer_type, phone, email, website, address, zip)",
          )
          .eq("contact_list_id", id)
          .order("id")
          .range(f, t) as any,
      ).catch((e) => { toast.error("Kunne ikke hente listen: " + (e?.message ?? e)); return [] as any[]; }),
    ]);
    setList(listData as any);
    const noter = await hentAlle<any>((f, t) =>
      (supabase as any).from("kontaktliste_opkald").select("company_id, note, created_at, user_id")
        .eq("contact_list_id", id).not("note", "is", null).order("created_at", { ascending: false }).order("id").range(f, t),
    ).catch(() => [] as any[]);
    const noteMap = new Map<string, any>();
    for (const n of noter) if (!noteMap.has(n.company_id)) noteMap.set(n.company_id, n);

    const userIds = Array.from(
      new Set(
        [...(assigns ?? []).map((a) => a.assigned_to), ...[...noteMap.values()].map((n) => n.user_id)].filter(Boolean) as string[],
      ),
    );
    const companyIds = (assigns ?? []).map((a) => a.company_id);
    const locationIds = Array.from(
      new Set(
        (assigns ?? []).map((a: any) => a.location_id).filter(Boolean) as string[],
      ),
    );

    const [{ data: profs }, { data: acts }, { data: locs }, { data: kontakter }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      companyIds.length
        ? (async () => {
            const CHUNK = 150;
            const out: any[] = [];
            for (let i = 0; i < companyIds.length; i += CHUNK) {
              const slice = companyIds.slice(i, i + CHUNK);
              const { data } = await supabase
                .from("activities")
                .select("company_id, created_at:udfoert_at, activity_type")
                .in("company_id", slice)
                .order("udfoert_at" as any, { ascending: false });
              if (data) out.push(...data);
            }
            return { data: out };
          })()
        : Promise.resolve({ data: [] as any[] }),
      (async () => {
        const out: any[] = [];
        for (let i = 0; i < locationIds.length; i += 200) {
          const { data } = await (supabase as any).from("locations").select("id, city, phone, address, zip").in("id", locationIds.slice(i, i + 200));
          if (data) out.push(...data);
        }
        return { data: out };
      })(),
      (async () => {
        const out: any[] = [];
        for (let i = 0; i < companyIds.length; i += 200) {
          const slice = companyIds.slice(i, i + 200);
          const data = await hentAlle<any>((f, t) =>
            supabase.from("contacts").select("id, company_id, name, title, phone, email, is_primary").in("company_id", slice).order("id").range(f, t) as any,
          ).catch(() => []);
          out.push(...data);
        }
        return { data: out };
      })(),
    ]);
    const kontaktMap = new Map<string, any>();
    const alleKontakter = new Map<string, { id: string; navn: string; titel: string | null }[]>();
    for (const k of [...(kontakter ?? [])].sort((a: any, b: any) => Number(!!b.is_primary) - Number(!!a.is_primary))) {
      const arr = alleKontakter.get(k.company_id) ?? [];
      arr.push({ id: k.id, navn: k.name, titel: k.title });
      alleKontakter.set(k.company_id, arr);
      const cur = kontaktMap.get(k.company_id);
      if (!cur || (k.is_primary && !cur.is_primary)) kontaktMap.set(k.company_id, k);
    }
    const pMap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
    const locMap = new Map<string, any>((locs ?? []).map((l: any) => [l.id as string, l]));
    const lastActMap = new Map<string, { at: string; type: string }>();
    for (const a of acts ?? []) {
      if (!lastActMap.has(a.company_id)) {
        lastActMap.set(a.company_id, {
          at: a.created_at,
          type: a.activity_type,
        });
      }
    }

    const result: Row[] = (assigns ?? []).map((a: any) => ({
      id: a.id,
      company_id: a.company_id,
      status: a.status,
      status_aarsag: a.status_aarsag ?? null,
      antal_forsoeg: a.antal_forsoeg ?? 0,
      kontakter: alleKontakter.get(a.company_id) ?? [],
      priority: a.priority,
      next_followup_date: a.next_followup_date,
      next_action_note: a.next_action_note,
      assigned_to: a.assigned_to,
      location_id: a.location_id ?? null,
      location_city: a.location_id ? (locMap.get(a.location_id)?.city ?? null) : null,
      location_phone: a.location_id ? (locMap.get(a.location_id)?.phone ?? null) : null,
      location_address: a.location_id ? (locMap.get(a.location_id)?.address ?? null) : null,
      location_zip: a.location_id ? (locMap.get(a.location_id)?.zip ?? null) : null,
      kontakt: (() => {
        const k = kontaktMap.get(a.company_id);
        return k ? { name: k.name, title: k.title, phone: k.phone, email: k.email } : null;
      })(),
      company: a.companies ?? {
        name: "?",
        city: null,
        employees: null,
        customer_type: "nyt_emne",
        phone: null,
        email: null,
        website: null,
        address: null,
        zip: null,
      },
      seller_name: a.assigned_to ? pMap.get(a.assigned_to) ?? "Ukendt" : "—",
      last_activity_at: lastActMap.get(a.company_id)?.at ?? null,
      last_activity_type: lastActMap.get(a.company_id)?.type ?? null,
      seneste_note: (() => {
        const n = noteMap.get(a.company_id);
        return n ? { note: n.note, at: n.created_at, bruger: pMap.get(n.user_id) ?? "" } : null;
      })(),
    }));
    setRows(result);
    setLoading(false);
  };

  useEffect(() => {
    if (!auth.loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, auth.loading]);

  const sellers = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(
      (r) => r.assigned_to && m.set(r.assigned_to, r.seller_name),
    );
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [rows]);

  // Hvis alle rækker har samme sælger (eller ingen), skjules Sælger-kolonnen.
  const ensSaelgerId = useMemo<string | null | undefined>(() => {
    if (!rows.length) return undefined;
    const first = rows[0].assigned_to ?? null;
    return rows.every((r) => (r.assigned_to ?? null) === first) ? first : undefined;
  }, [rows]);
  const skjulSaelgerKolonne = ensSaelgerId !== undefined;
  const ensSaelgerNavn = skjulSaelgerKolonne && ensSaelgerId ? rows[0].seller_name : null;

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    let arr = rows;
    if (fStatus !== "alle") arr = arr.filter((r) => r.status === fStatus);
    if (fPriority !== "alle") arr = arr.filter((r) => r.priority === fPriority);
    if (fKunTlf) arr = arr.filter((r) => telefonNumre(r.location_phone, r.company.phone).length > 0);
    if (isAdmin && fSeller !== "alle")
      arr = arr.filter((r) => r.assigned_to === fSeller);
    if (isAdmin && fOnlyMine)
      arr = arr.filter((r) => r.assigned_to === auth.user?.id);
    if (fOverdue)
      arr = arr.filter(
        (r) => r.next_followup_date && r.next_followup_date < today,
      );

    const dir = sortDir === "asc" ? 1 : -1;
    arr = [...arr].sort((a, b) => {
      const getKey = (r: Row): string | number => {
        switch (sortKey) {
          case "company":
            return r.company.name.toLowerCase();
          case "city":
            return (r.company.city ?? "").toLowerCase();
          case "employees":
            return r.company.employees ?? 0;
          case "customer_type":
            return r.company.customer_type;
          case "seller":
            return r.seller_name.toLowerCase();
          case "status":
            return r.status;
          case "priority":
            return r.priority;
          case "followup":
            return r.next_followup_date ?? "9999";
          case "last_activity":
            return r.last_activity_at ?? "";
          default:
            return "";
        }
      };
      const av = getKey(a),
        bv = getKey(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [rows, fStatus, fPriority, fSeller, fOnlyMine, fOverdue, fKunTlf, sortKey, sortDir, isAdmin, auth.user?.id, today]);

  const eksporterCsv = () => {

    const hoved = ["Virksomhed", "Telefon", "E-mail", "Hjemmeside", "Adresse", "Postnr.", "By", "Kontaktperson", "Kontaktperson titel", "Ansatte", "Sælger", "Status", "Prioritet", "Næste opfølgning"];
    const linjer = filtered.map((r) => [
      r.company.name,
      telefonNumre(r.location_phone, r.company.phone).map(formatTelefon).join(" / "),
      r.company.email ?? r.kontakt?.email ?? "",
      r.company.website ?? "",
      r.location_address ?? r.company.address ?? "",
      r.location_zip ?? r.company.zip ?? "",
      r.location_city ?? r.company.city ?? "",
      r.kontakt?.name ?? "",
      r.kontakt?.title ?? "",
      r.company.employees ?? "",
      r.seller_name,
      statusTekst(r.status, r.status_aarsag, r.antal_forsoeg),
      r.priority,
      r.next_followup_date ?? "",
    ]);
    const esc = (v: unknown) => {
      const t = String(v ?? "");
      return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const csv = "\ufeff" + [hoved, ...linjer].map((l) => l.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(list?.name ?? "kontaktliste").replace(/[^\wæøåÆØÅ ,.-]/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const total = rows.length;
  const kontaktet = rows.filter(
    (r) => r.status !== "ny",
  ).length;
  const pct = total > 0 ? Math.round((kontaktet / total) * 100) : 0;

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const onPriorityChange = async (row: Row, p: PriorityLevel) => {
    const { error } = await supabase
      .from("contact_list_assignments")
      .update({ priority: p })
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else {
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, priority: p } : r)),
      );
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    const { error: aErr } = await supabase
      .from("contact_list_assignments")
      .delete()
      .eq("contact_list_id", id);
    if (aErr) {
      toast.error("Kunne ikke slette tildelinger: " + aErr.message);
      setDeleting(false);
      return;
    }
    const { error } = await supabase
      .from("contact_lists")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      setDeleting(false);
      return;
    }
    setDeleting(false);
    toast.success("Kontaktliste slettet");
    navigate({ to: "/kontaktlister" });
  };

  return (
    <div className="px-4 md:px-8 py-8 max-w-[1600px] mx-auto pb-24 md:pb-8">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => navigate({ to: "/kontaktlister" })}
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Tilbage til kontaktlister
      </Button>

      {isAdmin && list && <BureauPanel listId={id} refreshKey={statRefresh} />}

      {loading ? (
        <div className="p-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !list ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Kontaktliste ikke fundet eller du har ikke adgang.
        </Card>
      ) : (
        <>
          <Card className="p-6 mb-4">
            <h1 className="text-2xl font-semibold">{list.name}</h1>
            {list.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {list.description}
              </p>
            )}
            {list.purpose && (
              <div className="mt-3 p-3 rounded-md bg-primary/5 border border-primary/30 text-sm">
                <div className="text-xs font-semibold uppercase text-primary mb-1">
                  Formål / instruktion fra admin
                </div>
                <p className="whitespace-pre-wrap">{list.purpose}</p>
              </div>
            )}
            <div className="mt-4 flex items-center gap-3">
              <Progress value={pct} className="h-2 flex-1 max-w-md" />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {kontaktet} af {total} kontaktet ({pct}%)
              </span>
              {ensSaelgerNavn && (
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  Sælger: {ensSaelgerNavn}
                </span>
              )}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Slet liste
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={fStatus} onValueChange={setFStatus}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Prioritet</Label>
                <Select value={fPriority} onValueChange={setFPriority}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle</SelectItem>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && (
                <div>
                  <Label className="text-xs">Sælger</Label>
                  <Select value={fSeller} onValueChange={setFSeller}>
                    <SelectTrigger className="w-[170px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alle">Alle</SelectItem>
                      {sellers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isAdmin && (
                <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                  <Switch checked={fOnlyMine} onCheckedChange={setFOnlyMine} />
                  Kun mine
                </label>
              )}
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <Switch checked={fOverdue} onCheckedChange={setFOverdue} />
                Kun overskredet
              </label>
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <Switch checked={fKunTlf} onCheckedChange={setFKunTlf} />
                Kun med telefon
              </label>
              <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
                {filtered.length} af {rows.length}
                <Button size="sm" variant="outline" onClick={eksporterCsv}>
                  <Download className="h-4 w-4 mr-1" /> CSV
                </Button>
              </div>
            </div>
          </Card>

          <Card className="overflow-auto max-h-[calc(100vh-260px)]">
              <Table
                className="table-fixed"
                style={{ minWidth: skjulSaelgerKolonne ? 980 : 1090 }}
              >
                <colgroup>
                  <col className="w-[240px]" />
                  <col className="w-[170px]" />
                  <col className="w-[170px]" />
                  <col className="w-[80px]" />
                  {!skjulSaelgerKolonne && <col className="w-[110px]" />}
                  <col className="w-[220px]" />
                  <col className="w-[100px]" />
                  <col />
                </colgroup>
                <TableHeader className="sticky top-0 z-10 bg-card [&_th]:bg-card">
                  <TableRow>
                    <SortableHead
                      label="Virksomhed"
                      k="company"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                    <TableHead>Telefon / e-mail</TableHead>
                    <TableHead>Kontaktperson</TableHead>
                    <SortableHead
                      label="Ansatte"
                      k="employees"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                    {!skjulSaelgerKolonne && (
                      <SortableHead
                        label="Sælger"
                        k="seller"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                    )}
                    <TableHead>Status</TableHead>
                    <TableHead>Prioritet</TableHead>
                    <SortableHead
                      label="Opfølgning / note"
                      k="followup"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={skjulSaelgerKolonne ? 8 : 9}
                        className="text-center text-sm text-muted-foreground py-12"
                      >
                        Ingen virksomheder matcher filtrene.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => {
                      const overdue =
                        r.next_followup_date && r.next_followup_date < today;
                      const statusTekstFull = statusTekst(r.status, r.status_aarsag, r.antal_forsoeg);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium align-top">
                            <div className="line-clamp-2" title={r.company.name}>
                              <Link
                                to="/virksomheder/$id"
                                params={{ id: r.company_id }}
                                className="hover:underline text-primary"
                              >
                                {r.company.name}
                              </Link>
                              {r.company.website && (
                                <a
                                  href={webHref(r.company.website)}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={r.company.website}
                                  className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-primary"
                                >
                                  <Globe className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground font-normal min-w-0">
                              <span className="truncate">
                                {r.location_city && r.location_city !== r.company.city ? `📍 ${r.location_city}` : (r.company.city ?? "")}
                              </span>
                              <CustomerStatusBadge
                                type={r.company.customer_type}
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 whitespace-nowrap shrink-0"
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-sm align-top">
                            {(() => {
                              const n = telefonNumre(r.location_phone, r.company.phone);
                              if (!n.length) return <div className="text-xs text-muted-foreground">—</div>;
                              return n.map((t, i) => (
                                <div key={t} className={`whitespace-nowrap ${i ? "text-xs text-muted-foreground" : ""}`}>
                                  <a href={telHref(t)} className="hover:underline">{formatTelefon(t)}</a>
                                </div>
                              ));
                            })()}
                            {r.company.email && (
                              <a href={`mailto:${r.company.email}`} className="block truncate text-xs text-muted-foreground hover:underline" title={r.company.email}>{r.company.email}</a>
                            )}
                          </TableCell>
                          <TableCell className="text-sm align-top">
                            {r.kontakt ? (
                              <div title={`${r.kontakt.name}${r.kontakt.title ? ` · ${r.kontakt.title}` : ""}`}>
                                <div className="truncate">{r.kontakt.name}</div>
                                {r.kontakt.title && <div className="text-xs text-muted-foreground truncate">{r.kontakt.title}</div>}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm align-top">{r.company.employees ?? "—"}</TableCell>
                          {!skjulSaelgerKolonne && (
                            <TableCell className="text-sm align-top">
                              <span className="block truncate" title={r.seller_name}>{r.seller_name}</span>
                            </TableCell>
                          )}
                          <TableCell className="align-top">
                            <div className="flex flex-col items-start gap-1">
                              <Badge
                                variant={r.status === "møde_booket" || r.status === "tilbud_oensket" ? "default" : "outline"}
                                className="text-xs max-w-full truncate"
                                title={statusTekstFull}
                              >
                                {statusTekstFull}
                              </Badge>
                              <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => setUdfaldRow(r)}>
                                Registrér udfald
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Select
                              value={r.priority}
                              onValueChange={(v) =>
                                onPriorityChange(r, v as PriorityLevel)
                              }
                            >
                              <SelectTrigger className="h-8 w-[96px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PRIORITY_OPTIONS.map((p) => (
                                  <SelectItem key={p.value} value={p.value}>
                                    {p.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-xs align-top">
                            {r.next_followup_date ? (
                              <div className={`inline-flex items-center gap-1 whitespace-nowrap ${overdue ? "text-destructive font-medium" : ""}`}>
                                {overdue && <AlertTriangle className="h-3 w-3" />}
                                Næste: {new Date(r.next_followup_date).toLocaleDateString("da-DK")}
                              </div>
                            ) : null}
                            {r.last_activity_at ? (
                              <div className="text-muted-foreground whitespace-nowrap">
                                {new Date(r.last_activity_at).toLocaleDateString("da-DK")}
                                {r.last_activity_type ? ` · ${r.last_activity_type.replace(/_/g, " ")}` : ""}
                              </div>
                            ) : null}
                            {r.seneste_note && (
                              <div title={`${r.seneste_note.note}\n— ${new Date(r.seneste_note.at).toLocaleString("da-DK")}${r.seneste_note.bruger ? ` · ${r.seneste_note.bruger}` : ""}`}>
                                <div className="line-clamp-2 italic">“{r.seneste_note.note}”</div>
                                <div className="text-muted-foreground">
                                  {new Date(r.seneste_note.at).toLocaleDateString("da-DK")}{r.seneste_note.bruger ? ` · ${r.seneste_note.bruger}` : ""}
                                </div>
                              </div>
                            )}
                            {!r.next_followup_date && !r.last_activity_at && !r.seneste_note && (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

          </Card>
        </>
      )}

      {udfaldRow && (
        <UdfaldDialog
          listId={id}
          virksomhed={{
            company_id: udfaldRow.company_id,
            navn: udfaldRow.company.name,
            telefon: telefonNumre(udfaldRow.location_phone, udfaldRow.company.phone)[0] ?? null,
            kontakter: udfaldRow.kontakter,
          }}
          opretKontakt={async (navn, titel) => {
            const { data, error } = await supabase.from("contacts").insert({ company_id: udfaldRow.company_id, name: navn, title: titel }).select("id").single();
            if (error) { toast.error(error.message); return null; }
            return data.id;
          }}
          onClose={() => setUdfaldRow(null)}
          onDone={() => { setUdfaldRow(null); setStatRefresh((n) => n + 1); void load(); }}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Slet kontaktliste</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Er du sikker på, at du vil slette listen <strong>{list?.name}</strong>?<br />
            Alle {total} tildelinger fjernes permanent.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Annullér
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Slet liste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableHead({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (k: string) => void;
}) {
  const active = sortKey === k;
  return (
    <TableHead>
      <button
        onClick={() => onSort(k)}
        className="flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${active ? "text-primary" : "text-muted-foreground/50"}`}
        />
        {active && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </TableHead>
  );
}
