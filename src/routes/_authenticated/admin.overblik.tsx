import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/overblik")({
  component: AdminOverblikPage,
  head: () => ({ meta: [{ title: "Admin-overblik — Frellsen" }] }),
});

type RangeKey = "uge" | "måned" | "30d" | "custom";

function rangeFor(key: RangeKey, customFrom: string, customTo: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from = new Date(today);
  let to = new Date(today);
  to.setDate(to.getDate() + 1);

  if (key === "uge") {
    const day = (today.getDay() + 6) % 7; // mandag = 0
    from.setDate(today.getDate() - day);
  } else if (key === "måned") {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (key === "30d") {
    from.setDate(today.getDate() - 30);
  } else if (key === "custom") {
    if (customFrom) from = new Date(customFrom);
    if (customTo) {
      to = new Date(customTo);
      to.setDate(to.getDate() + 1);
    }
  }
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

const dkk = (n: number) =>
  new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(n);

const STATUS_LABEL: Record<string, string> = {
  ny: "Ny",
  behovsafdækning: "Behovsafdækning",
  møde_demo: "Møde/Demo",
  tilbud_sendt: "Tilbud sendt",
  opfølgning: "Opfølgning",
  vundet: "Vundet",
  tabt: "Tabt",
  sat_på_pause: "Sat på pause",
};

interface SellerRow {
  id: string;
  name: string;
  tildelt: number;
  kontaktet: number;
  samtaler: number;
  moeder: number;
  tilbudSendt: number;
  vundne: number;
  overskredne: number;
  aabneCount: number;
}

function AdminOverblikPage() {
  const { role, loading: authLoading } = useAuth();
  const [range, setRange] = useState<RangeKey>("måned");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [assignments, setAssignments] = useState<
    { assigned_to: string | null; status: string }[]
  >([]);
  const [activities, setActivities] = useState<
    { created_by: string; activity_type: string }[]
  >([]);
  const [opportunities, setOpportunities] = useState<
    {
      assigned_to: string | null;
      status: string;
      estimated_value: number | null;
      next_followup_date: string | null;
    }[]
  >([]);

  const { fromIso, toIso } = useMemo(
    () => rangeFor(range, customFrom, customTo),
    [range, customFrom, customTo],
  );

  useEffect(() => {
    if (authLoading || role !== "admin") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [profilesRes, rolesRes, asgRes, actRes, oppRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name"),
        supabase.from("user_roles").select("user_id, role").eq("role", "saelger"),
        supabase
          .from("contact_list_assignments")
          .select("assigned_to, status"),
        supabase
          .from("activities")
          .select("created_by, activity_type")
          .gte("created_at", fromIso)
          .lt("created_at", toIso),
        supabase
          .from("sales_opportunities")
          .select("assigned_to, status, estimated_value, next_followup_date"),
      ]);
      if (cancelled) return;
      const sellerIds = new Set(
        (rolesRes.data ?? []).map((r: any) => r.user_id),
      );
      const profs = (profilesRes.data ?? []).filter((p: any) =>
        sellerIds.has(p.id),
      );
      setSellers(
        profs.map((p: any) => ({ id: p.id, name: p.full_name || "Uden navn" })),
      );
      setAssignments((asgRes.data as any) ?? []);
      setActivities((actRes.data as any) ?? []);
      setOpportunities((oppRes.data as any) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, role, fromIso, toIso]);

  const today = new Date().toISOString().slice(0, 10);

  const rows: SellerRow[] = useMemo(() => {
    return sellers.map((s) => {
      const myAsg = assignments.filter((a) => a.assigned_to === s.id);
      const myActs = activities.filter((a) => a.created_by === s.id);
      const myOpps = opportunities.filter((o) => o.assigned_to === s.id);
      return {
        id: s.id,
        name: s.name,
        tildelt: myAsg.length,
        kontaktet: myActs.filter((a) =>
          ["opkald", "email", "talt_med", "møde_booket", "tilbud_sendt"].includes(
            a.activity_type,
          ),
        ).length,
        samtaler: myActs.filter((a) => a.activity_type === "talt_med").length,
        moeder: myActs.filter((a) => a.activity_type === "møde_booket").length,
        tilbudSendt: myActs.filter((a) => a.activity_type === "tilbud_sendt")
          .length,
        vundne: myOpps.filter((o) => o.status === "vundet").length,
        overskredne: myOpps.filter(
          (o) =>
            o.next_followup_date &&
            o.next_followup_date < today &&
            o.status !== "vundet" &&
            o.status !== "tabt",
        ).length,
        aabneCount: myOpps.filter(
          (o) => o.status !== "vundet" && o.status !== "tabt",
        ).length,
      };
    });
  }, [sellers, assignments, activities, opportunities, today]);

  const pipelinePerStatus = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    Object.keys(STATUS_LABEL).forEach((k) => (map[k] = { count: 0, value: 0 }));
    opportunities.forEach((o) => {
      if (!map[o.status]) map[o.status] = { count: 0, value: 0 };
      map[o.status].count += 1;
      map[o.status].value += Number(o.estimated_value ?? 0);
    });
    return map;
  }, [opportunities]);

  if (!authLoading && role !== "admin") {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="px-4 md:px-8 py-6 pb-24 md:pb-8 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold">Admin-overblik</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aktivitet og pipeline på tværs af alle sælgere
        </p>
      </div>

      {/* Datofilter */}
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap gap-2 items-end">
          {([
            ["uge", "Denne uge"],
            ["måned", "Denne måned"],
            ["30d", "Sidste 30 dage"],
            ["custom", "Brugerdefineret"],
          ] as [RangeKey, string][]).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={range === k ? "default" : "outline"}
              onClick={() => setRange(k)}
            >
              {label}
            </Button>
          ))}
          {range === "custom" && (
            <div className="flex gap-2 items-end ml-2">
              <div>
                <Label className="text-xs">Fra</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Til</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Sektion 1: Aktivitet pr. sælger */}
          <section>
            <h2 className="text-lg font-medium mb-3">Aktivitet pr. sælger</h2>
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sælger</TableHead>
                    <TableHead className="text-right">Tildelt</TableHead>
                    <TableHead className="text-right">Kontaktet</TableHead>
                    <TableHead className="text-right">Samtaler</TableHead>
                    <TableHead className="text-right">Møder</TableHead>
                    <TableHead className="text-right">Tilbud sendt</TableHead>
                    <TableHead className="text-right">Vundne</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{r.tildelt}</TableCell>
                      <TableCell className="text-right">{r.kontaktet}</TableCell>
                      <TableCell className="text-right">{r.samtaler}</TableCell>
                      <TableCell className="text-right">{r.moeder}</TableCell>
                      <TableCell className="text-right">
                        {r.tilbudSendt}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{r.vundne}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-muted-foreground py-6"
                      >
                        Ingen sælgere fundet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </section>

          {/* Sektion 2: Pipeline-overblik */}
          <section>
            <h2 className="text-lg font-medium mb-3">Pipeline-overblik</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {Object.entries(pipelinePerStatus).map(([k, v]) => (
                <Card key={k} className="p-4">
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABEL[k] ?? k}
                  </p>
                  <p className="text-lg font-semibold mt-1">{dkk(v.value)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {v.count} muligheder
                  </p>
                </Card>
              ))}
            </div>

            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sælger</TableHead>
                    <TableHead className="text-right">Åbne muligheder</TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        Overskredne opfølgninger
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">
                        {r.aabneCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.overskredne > 0 ? (
                          <Badge variant="destructive">{r.overskredne}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
