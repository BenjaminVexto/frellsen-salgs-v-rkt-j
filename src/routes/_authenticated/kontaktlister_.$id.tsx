import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/kontaktlister_/$id")({
  component: KontaktlisteDetalje,
});

const STATUS_OPTIONS: { value: AssignmentStatus; label: string }[] = [
  { value: "ny", label: "Ny" },
  { value: "skal_kontaktes", label: "Skal kontaktes" },
  { value: "kontaktet", label: "Kontaktet" },
  { value: "talt_med", label: "Talt med" },
  { value: "møde_booket", label: "Møde booket" },
  { value: "tilbud_sendt", label: "Tilbud sendt" },
  { value: "ikke_relevant", label: "Ikke relevant" },
  { value: "senere_emne", label: "Senere emne" },
  { value: "vundet", label: "Vundet" },
  { value: "tabt", label: "Tabt" },
];

const PRIORITY_OPTIONS: { value: PriorityLevel; label: string }[] = [
  { value: "høj", label: "Høj" },
  { value: "middel", label: "Middel" },
  { value: "lav", label: "Lav" },
];

const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  nyt_emne: "Nyt emne",
  aktiv_kunde: "Aktiv kunde",
  sovende_kunde: "Sovende kunde",
  tidligere_kunde: "Tidligere kunde",
};

type AssignmentStatus =
  | "ny"
  | "skal_kontaktes"
  | "kontaktet"
  | "talt_med"
  | "møde_booket"
  | "tilbud_sendt"
  | "ikke_relevant"
  | "senere_emne"
  | "vundet"
  | "tabt";

type PriorityLevel = "høj" | "middel" | "lav";

const REQUIRES_FOLLOWUP: AssignmentStatus[] = [
  "talt_med",
  "møde_booket",
  "tilbud_sendt",
];

type Row = {
  id: string;
  company_id: string;
  status: AssignmentStatus;
  priority: PriorityLevel;
  next_followup_date: string | null;
  next_action_note: string | null;
  assigned_to: string | null;
  company: {
    name: string;
    city: string | null;
    employees: number | null;
    customer_type: string;
  };
  seller_name: string;
  last_activity_at: string | null;
  last_activity_type: string | null;
};

function KontaktlisteDetalje() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const isAdmin = auth.role === "admin";

  const [list, setList] = useState<{
    name: string;
    description: string | null;
  } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [fStatus, setFStatus] = useState<string>("alle");
  const [fPriority, setFPriority] = useState<string>("alle");
  const [fSeller, setFSeller] = useState<string>("alle");
  const [fOnlyMine, setFOnlyMine] = useState(false);
  const [fOverdue, setFOverdue] = useState(false);

  // sort
  const [sortKey, setSortKey] = useState<string>("company");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // status change requiring followup
  const [pending, setPending] = useState<{
    row: Row;
    newStatus: AssignmentStatus;
  } | null>(null);
  const [pDate, setPDate] = useState("");
  const [pAction, setPAction] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: listData }, { data: assigns }] = await Promise.all([
      supabase
        .from("contact_lists")
        .select("name, description")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("contact_list_assignments")
        .select(
          "id, company_id, status, priority, next_followup_date, next_action_note, assigned_to, companies(name, city, employees, customer_type)",
        )
        .eq("contact_list_id", id),
    ]);
    setList(listData);

    const userIds = Array.from(
      new Set(
        (assigns ?? []).map((a) => a.assigned_to).filter(Boolean) as string[],
      ),
    );
    const companyIds = (assigns ?? []).map((a) => a.company_id);

    const [{ data: profs }, { data: acts }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      companyIds.length
        ? supabase
            .from("activities")
            .select("company_id, created_at, activity_type")
            .in("company_id", companyIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const pMap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
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
      priority: a.priority,
      next_followup_date: a.next_followup_date,
      next_action_note: a.next_action_note,
      assigned_to: a.assigned_to,
      company: a.companies ?? {
        name: "?",
        city: null,
        employees: null,
        customer_type: "nyt_emne",
      },
      seller_name: a.assigned_to ? pMap.get(a.assigned_to) ?? "Ukendt" : "—",
      last_activity_at: lastActMap.get(a.company_id)?.at ?? null,
      last_activity_type: lastActMap.get(a.company_id)?.type ?? null,
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

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    let arr = rows;
    if (fStatus !== "alle") arr = arr.filter((r) => r.status === fStatus);
    if (fPriority !== "alle") arr = arr.filter((r) => r.priority === fPriority);
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
  }, [rows, fStatus, fPriority, fSeller, fOnlyMine, fOverdue, sortKey, sortDir, isAdmin, auth.user?.id, today]);

  const total = rows.length;
  const kontaktet = rows.filter(
    (r) => r.status !== "ny" && r.status !== "skal_kontaktes",
  ).length;
  const pct = total > 0 ? Math.round((kontaktet / total) * 100) : 0;

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const applyStatus = async (
    row: Row,
    newStatus: AssignmentStatus,
    followupDate?: string,
    followupAction?: string,
  ) => {
    const payload: any = { status: newStatus };
    if (followupDate !== undefined) payload.next_followup_date = followupDate;
    if (followupAction !== undefined) payload.next_action_note = followupAction;
    const { error } = await supabase
      .from("contact_list_assignments")
      .update(payload)
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    // log activity
    if (auth.user?.id) {
      await supabase.from("activities").insert({
        company_id: row.company_id,
        contact_list_assignment_id: row.id,
        created_by: auth.user.id,
        activity_type: "intern_note",
        note: `Status ændret til ${STATUS_OPTIONS.find((s) => s.value === newStatus)?.label}`,
        next_followup_date: followupDate ?? null,
        next_action: followupAction ?? null,
      });
    }
    toast.success("Status opdateret");
    load();
    return true;
  };

  const onStatusChange = (row: Row, newStatus: AssignmentStatus) => {
    if (REQUIRES_FOLLOWUP.includes(newStatus)) {
      setPending({ row, newStatus });
      setPDate(row.next_followup_date ?? "");
      setPAction(row.next_action_note ?? "");
    } else {
      applyStatus(row, newStatus);
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

  return (
    <div className="px-4 md:px-8 py-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => navigate({ to: "/kontaktlister" })}
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Tilbage til kontaktlister
      </Button>

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
            <div className="mt-4 flex items-center gap-3">
              <Progress value={pct} className="h-2 flex-1 max-w-md" />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {kontaktet} af {total} kontaktet ({pct}%)
              </span>
            </div>
          </Card>

          <Card className="p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={fStatus} onValueChange={setFStatus}>
                  <SelectTrigger>
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
                  <SelectTrigger>
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
                    <SelectTrigger>
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
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={fOnlyMine} onCheckedChange={setFOnlyMine} />
                  Kun mine
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={fOverdue} onCheckedChange={setFOverdue} />
                Kun overskredet
              </label>
            </div>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Virksomhed"
                    k="company"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="By"
                    k="city"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Ansatte"
                    k="employees"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Kundetype"
                    k="customer_type"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Sælger"
                    k="seller"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <TableHead>Status</TableHead>
                  <TableHead>Prioritet</TableHead>
                  <SortableHead
                    label="Næste opfølgning"
                    k="followup"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Seneste aktivitet"
                    k="last_activity"
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
                      colSpan={9}
                      className="text-center text-sm text-muted-foreground py-12"
                    >
                      Ingen virksomheder matcher filtrene.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => {
                    const overdue =
                      r.next_followup_date && r.next_followup_date < today;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <Link
                            to="/virksomheder/$id"
                            params={{ id: r.company_id }}
                            className="hover:underline text-primary"
                          >
                            {r.company.name}
                          </Link>
                        </TableCell>
                        <TableCell>{r.company.city ?? "—"}</TableCell>
                        <TableCell>{r.company.employees ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {CUSTOMER_TYPE_LABEL[r.company.customer_type] ??
                              r.company.customer_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{r.seller_name}</TableCell>
                        <TableCell>
                          <Select
                            value={r.status}
                            onValueChange={(v) =>
                              onStatusChange(r, v as AssignmentStatus)
                            }
                          >
                            <SelectTrigger className="h-8 w-[150px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s.value} value={s.value}>
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r.priority}
                            onValueChange={(v) =>
                              onPriorityChange(r, v as PriorityLevel)
                            }
                          >
                            <SelectTrigger className="h-8 w-[110px]">
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
                        <TableCell>
                          {r.next_followup_date ? (
                            <span
                              className={`text-sm inline-flex items-center gap-1 ${overdue ? "text-destructive font-medium" : ""}`}
                            >
                              {overdue && <AlertTriangle className="h-3 w-3" />}
                              {new Date(r.next_followup_date).toLocaleDateString(
                                "da-DK",
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.last_activity_at ? (
                            <div className="text-xs">
                              <div>
                                {new Date(r.last_activity_at).toLocaleDateString(
                                  "da-DK",
                                )}
                              </div>
                              <div className="text-muted-foreground">
                                {r.last_activity_type}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
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

      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tvungen opfølgning påkrævet</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Status "
            {STATUS_OPTIONS.find((s) => s.value === pending?.newStatus)?.label}"
            kræver næste opfølgningsdato og næste handling.
          </p>
          <div className="space-y-3">
            <div>
              <Label>Næste opfølgningsdato *</Label>
              <Input
                type="date"
                value={pDate}
                onChange={(e) => setPDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Næste handling *</Label>
              <Textarea
                value={pAction}
                onChange={(e) => setPAction(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Annullér
            </Button>
            <Button
              onClick={async () => {
                if (!pDate || !pAction.trim()) {
                  toast.error("Begge felter er påkrævet");
                  return;
                }
                if (!pending) return;
                const ok = await applyStatus(
                  pending.row,
                  pending.newStatus,
                  pDate,
                  pAction.trim(),
                );
                if (ok) setPending(null);
              }}
            >
              Gem
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
