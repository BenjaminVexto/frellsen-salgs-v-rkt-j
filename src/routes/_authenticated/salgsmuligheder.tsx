import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Loader2, TrendingUp, Briefcase, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/salgsmuligheder")({
  component: PipelinePage,
});

type Status =
  | "ny"
  | "behovsafdækning"
  | "møde_demo"
  | "tilbud_sendt"
  | "opfølgning"
  | "vundet"
  | "tabt"
  | "sat_på_pause";

const COLUMNS: { key: Status; label: string }[] = [
  { key: "ny", label: "Ny" },
  { key: "behovsafdækning", label: "Behovsafdækning" },
  { key: "møde_demo", label: "Møde/Demo" },
  { key: "tilbud_sendt", label: "Tilbud sendt" },
  { key: "opfølgning", label: "Opfølgning" },
  { key: "vundet", label: "Vundet" },
  { key: "tabt", label: "Tabt" },
];

const STATUS_LABEL: Record<Status, string> = {
  ny: "Ny",
  behovsafdækning: "Behovsafdækning",
  møde_demo: "Møde/Demo",
  tilbud_sendt: "Tilbud sendt",
  opfølgning: "Opfølgning",
  vundet: "Vundet",
  tabt: "Tabt",
  sat_på_pause: "Sat på pause",
};

interface Opportunity {
  id: string;
  name: string;
  company_id: string;
  opportunity_type: string | null;
  estimated_value: number | null;
  expected_close_date: string | null;
  status: Status;
  probability: number | null;
  next_action: string | null;
  next_followup_date: string | null;
  assigned_to: string | null;
  companies?: { name: string } | null;
  profiles?: { full_name: string } | null;
}

const dkk = (n: number | null | undefined) =>
  new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

const daysUntil = (date: string | null) => {
  if (!date) return null;
  const diff = Math.ceil(
    (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  return diff;
};

function PipelinePage() {
  const { user, role, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Opportunity | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_opportunities")
      .select(
        "id,name,company_id,opportunity_type,estimated_value,expected_close_date,status,probability,next_action,next_followup_date,assigned_to,companies(name),profiles:assigned_to(full_name)",
      )
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error("Kunne ikke hente salgsmuligheder");
    } else {
      setItems((data as unknown as Opportunity[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && user) load();
  }, [authLoading, user]);

  const stats = useMemo(() => {
    const open = items.filter(
      (o) => o.status !== "vundet" && o.status !== "tabt",
    );
    const totalOpen = open.reduce(
      (s, o) => s + Number(o.estimated_value ?? 0),
      0,
    );
    const won = items.filter((o) => o.status === "vundet").length;
    const lost = items.filter((o) => o.status === "tabt").length;
    const winRate = won + lost === 0 ? 0 : (won / (won + lost)) * 100;
    return { totalOpen, openCount: open.length, winRate };
  }, [items]);

  const byCol = useMemo(() => {
    const map: Record<Status, Opportunity[]> = {
      ny: [],
      behovsafdækning: [],
      møde_demo: [],
      tilbud_sendt: [],
      opfølgning: [],
      vundet: [],
      tabt: [],
      sat_på_pause: [],
    };
    items.forEach((o) => {
      if (map[o.status]) map[o.status].push(o);
    });
    return map;
  }, [items]);

  return (
    <div className="px-4 md:px-8 py-6 pb-24 md:pb-8 max-w-[1800px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Salgsmuligheder</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {role === "admin" ? "Alle sælgeres pipeline" : "Min pipeline"}
          </p>
        </div>
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Total åben pipeline"
          value={dkk(stats.totalOpen)}
        />
        <StatCard
          icon={<Briefcase className="h-5 w-5" />}
          label="Åbne muligheder"
          value={String(stats.openCount)}
        />
        <StatCard
          icon={<Target className="h-5 w-5" />}
          label="Win rate"
          value={`${stats.winRate.toFixed(0)} %`}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-4 min-w-max pb-4">
            {COLUMNS.map((col) => {
              const colItems = byCol[col.key] ?? [];
              const colTotal = colItems.reduce(
                (s, o) => s + Number(o.estimated_value ?? 0),
                0,
              );
              return (
                <div key={col.key} className="w-72 flex-shrink-0">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium text-sm">{col.label}</h2>
                      <Badge variant="secondary" className="text-xs">
                        {colItems.length}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {dkk(colTotal)}
                    </span>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2 space-y-2 min-h-[200px]">
                    {colItems.map((o) => (
                      <OpportunityCard
                        key={o.id}
                        opp={o}
                        onClick={() => setSelected(o)}
                      />
                    ))}
                    {colItems.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Ingen
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <OpportunityDrawer
        opp={selected}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null);
          load();
        }}
        isAdmin={role === "admin"}
        currentUserId={user?.id ?? null}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
    </Card>
  );
}

function OpportunityCard({
  opp,
  onClick,
}: {
  opp: Opportunity;
  onClick: () => void;
}) {
  const days = daysUntil(opp.expected_close_date);
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border rounded-md p-3 hover:border-primary/50 hover:shadow-sm transition-all"
    >
      <p className="font-medium text-sm truncate">
        {opp.companies?.name ?? "Ukendt virksomhed"}
      </p>
      <p className="text-xs text-muted-foreground truncate mt-0.5">
        {opp.opportunity_type || opp.name}
      </p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-sm font-semibold">{dkk(opp.estimated_value)}</span>
        {days !== null && (
          <span
            className={`text-xs ${
              days < 0
                ? "text-destructive"
                : days <= 7
                  ? "text-warning-foreground"
                  : "text-muted-foreground"
            }`}
          >
            {days < 0 ? `${Math.abs(days)} d. forsinket` : `${days} d.`}
          </span>
        )}
      </div>
      {opp.profiles?.full_name && (
        <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
          {opp.profiles.full_name}
        </p>
      )}
    </button>
  );
}

function OpportunityDrawer({
  opp,
  onClose,
  onSaved,
  isAdmin,
  currentUserId,
}: {
  opp: Opportunity | null;
  onClose: () => void;
  onSaved: () => void;
  isAdmin: boolean;
  currentUserId: string | null;
}) {
  const [form, setForm] = useState<Partial<Opportunity>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (opp) setForm(opp);
  }, [opp]);

  const canEdit =
    !!opp && (isAdmin || opp.assigned_to === currentUserId);

  const save = async () => {
    if (!opp) return;
    setSaving(true);
    const { error } = await supabase
      .from("sales_opportunities")
      .update({
        name: form.name,
        opportunity_type: form.opportunity_type,
        estimated_value: form.estimated_value
          ? Number(form.estimated_value)
          : null,
        expected_close_date: form.expected_close_date || null,
        status: form.status as Status,
        probability: form.probability ? Number(form.probability) : null,
        next_action: form.next_action,
        next_followup_date: form.next_followup_date || null,
      })
      .eq("id", opp.id);
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke gemme");
    } else {
      toast.success("Salgsmulighed opdateret");
      onSaved();
    }
  };

  return (
    <Sheet open={!!opp} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {opp && (
          <>
            <SheetHeader>
              <SheetTitle>{opp.companies?.name ?? "Salgsmulighed"}</SheetTitle>
              <SheetDescription>
                {opp.profiles?.full_name
                  ? `Tildelt: ${opp.profiles.full_name}`
                  : "Ikke tildelt"}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 py-6">
              <div>
                <Label>Navn</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Input
                  value={form.opportunity_type ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, opportunity_type: e.target.value })
                  }
                  placeholder="Fx kaffemaskine, abonnement"
                  disabled={!canEdit}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Estimeret værdi (DKK)</Label>
                  <Input
                    type="number"
                    value={form.estimated_value ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        estimated_value: e.target.value as unknown as number,
                      })
                    }
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>Sandsynlighed %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.probability ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        probability: e.target.value as unknown as number,
                      })
                    }
                    disabled={!canEdit}
                  />
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm({ ...form, status: v as Status })
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Forventet lukning</Label>
                <Input
                  type="date"
                  value={form.expected_close_date ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, expected_close_date: e.target.value })
                  }
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>Næste handling</Label>
                <Textarea
                  rows={2}
                  value={form.next_action ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, next_action: e.target.value })
                  }
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>Næste opfølgningsdato</Label>
                <Input
                  type="date"
                  value={form.next_followup_date ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, next_followup_date: e.target.value })
                  }
                  disabled={!canEdit}
                />
              </div>
            </div>

            <SheetFooter>
              <Button variant="outline" onClick={onClose}>
                Luk
              </Button>
              {canEdit && (
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Gem ændringer
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
