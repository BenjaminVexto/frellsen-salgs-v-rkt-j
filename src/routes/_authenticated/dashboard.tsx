import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/view-as-context";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  CalendarCheck,
  Flame,
  ListChecks,
  Building2,
  ArrowRight,
  FileText,
  ChevronDown,
  ChevronUp,
  CalendarPlus,
} from "lucide-react";
import { format, isToday, parseISO, addDays } from "date-fns";
import { da } from "date-fns/locale";
import { PersonalGreeting } from "@/components/sales/personal-greeting";
import { MyMonthZone } from "@/components/sales/my-month-zone";
import { ChurningCustomersCard } from "@/components/sales/churning-customers-card";
import { fetchExpiringMachines } from "@/lib/expiring-machines";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Mit overblik — Frellsen Salgsoversigt" }] }),
});

function DashboardPage() {
  const auth = useAuth();
  const { effectiveUserId, isImpersonating, viewAsName } = useViewAs();
  const userId = effectiveUserId ?? auth.user?.id;

  const today = new Date().toISOString().slice(0, 10);

  // Mens admin "ser som" sælger, opfører dashboardet sig som om brugeren ikke er admin
  // (så de samme seller-scoping-filtre gælder).
  // Salgssupport behandles som admin: team-bredt overblik på tværs af sælgere.
  const isSupport = auth.role === "salgssupport";
  const isAdmin = (auth.role === "admin" || isSupport) && !isImpersonating;

  const followupsQuery = useQuery({
    enabled: !!userId,
    queryKey: ["dashboard-followups", userId, isAdmin],
    queryFn: async () => {
      let q = supabase
        .from("contact_list_assignments")
        .select(
          "id, status, priority, next_followup_date, next_action_note, assigned_to, company:companies(id, name, city)"
        )
        .not("next_followup_date", "is", null)
        .order("next_followup_date", { ascending: true });
      if (!isAdmin) q = q.eq("assigned_to", userId!);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const hotOppsQuery = useQuery({
    enabled: !!userId,
    queryKey: ["dashboard-hot-opps", userId, isAdmin],
    queryFn: async () => {
      let q = supabase
        .from("sales_opportunities")
        .select(
          "id, name, status, estimated_value, next_followup_date, company:companies(id, name)"
        )
        .in("status", ["tilbud_sendt", "møde_demo"])
        .order("next_followup_date", { ascending: true, nullsFirst: false });
      if (!isAdmin) q = q.eq("assigned_to", userId!);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const listsQuery = useQuery({
    enabled: !!userId,
    queryKey: ["dashboard-lists", userId, isAdmin],
    queryFn: async () => {
      // hent unikke kontaktlister via assignments (team-bredt for admin/support)
      let q = supabase
        .from("contact_list_assignments")
        .select("contact_list_id, status, contact_list:contact_lists(id, name, is_active)");
      if (!isAdmin) q = q.eq("assigned_to", userId!);
      const { data: assignments, error } = await q;
      if (error) throw error;

      const byList = new Map<
        string,
        { id: string; name: string; total: number; progressed: number }
      >();
      (assignments ?? []).forEach((a: any) => {
        const list = a.contact_list;
        if (!list || !list.is_active) return;
        const entry = byList.get(list.id) ?? {
          id: list.id,
          name: list.name,
          total: 0,
          progressed: 0,
        };
        entry.total += 1;
        if (a.status && !["ny", "skal_kontaktes"].includes(a.status)) {
          entry.progressed += 1;
        }
        byList.set(list.id, entry);
      });
      return Array.from(byList.values());
    },
  });


  const expiringDocsQuery = useQuery({
    enabled: !!userId,
    queryKey: ["dashboard-expiring-agreements", userId, isAdmin],
    queryFn: async () => {
      const in90 = new Date();
      in90.setDate(in90.getDate() + 90);
      const to = in90.toISOString().slice(0, 10);

      // Ikke-admin: begræns til brugerens egne tildelte virksomheder
      let allowedCompanyIds: string[] | null = null;
      if (!isAdmin) {
        const PAGE = 1000;
        const ids: string[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from("companies")
            .select("id")
            .eq("assigned_to", userId!)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          const page = data ?? [];
          for (const c of page as any[]) ids.push(c.id);
          if (page.length < PAGE) break;
        }
        allowedCompanyIds = ids;
        if (!ids.length) {
          return { customers: [], prospects: [] };
        }
      }

      const CHUNK = 150;
      async function fetchInChunks<T>(
        ids: string[],
        queryFn: (slice: string[]) => PromiseLike<{ data: T[] | null; error: any }>,
      ): Promise<T[]> {
        const out: T[] = [];
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const { data, error } = await queryFn(slice);
          if (error) throw error;
          out.push(...((data ?? []) as T[]));
        }
        return out;
      }

      let docsData: any[];
      let compData: any[];

      if (allowedCompanyIds) {
        [docsData, compData] = await Promise.all([
          fetchInChunks<any>(allowedCompanyIds, (slice) =>
            supabase
              .from("company_documents")
              .select("id, filename, document_type, expires_at, company_id, companies(id, name, city)")
              .not("expires_at", "is", null)
              .gte("expires_at", today)
              .lte("expires_at", to)
              .in("company_id", slice),
          ),
          fetchInChunks<any>(allowedCompanyIds, (slice) =>
            supabase
              .from("competitor_assignments")
              .select(
                "id, contract_expires_at, company_id, competitor_id, competitors(name), companies(id, name, city)",
              )
              .not("contract_expires_at", "is", null)
              .gte("contract_expires_at", today)
              .lte("contract_expires_at", to)
              .in("company_id", slice),
          ),
        ]);
        docsData = docsData.sort((a, b) =>
          String(a.expires_at).localeCompare(String(b.expires_at)),
        );
        compData = compData.sort((a, b) =>
          String(a.contract_expires_at).localeCompare(String(b.contract_expires_at)),
        );
      } else {
        const docsQ = supabase
          .from("company_documents")
          .select("id, filename, document_type, expires_at, company_id, companies(id, name, city)")
          .not("expires_at", "is", null)
          .gte("expires_at", today)
          .lte("expires_at", to)
          .order("expires_at", { ascending: true });
        const compQ = supabase
          .from("competitor_assignments")
          .select(
            "id, contract_expires_at, company_id, competitor_id, competitors(name), companies(id, name, city)",
          )
          .not("contract_expires_at", "is", null)
          .gte("contract_expires_at", today)
          .lte("contract_expires_at", to)
          .order("contract_expires_at", { ascending: true });
        const [docsRes, compRes] = await Promise.all([docsQ, compQ]);
        if (docsRes.error) throw docsRes.error;
        if (compRes.error) throw compRes.error;
        docsData = docsRes.data ?? [];
        compData = compRes.data ?? [];
      }

      const customers = docsData.map((d: any) => ({
        kind: "doc" as const,
        id: `doc-${d.id}`,
        date: d.expires_at as string,
        companyId: d.company_id as string,
        companyName: d.companies?.name ?? "Ukendt",
        title: d.filename as string,
        subtitle: d.document_type as string,
      })).slice(0, 10);
      const prospects = compData.map((c: any) => ({
        kind: "competitor" as const,
        id: `comp-${c.id}`,
        date: c.contract_expires_at as string,
        companyId: c.company_id as string,
        companyName: c.companies?.name ?? "Ukendt",
        title: c.competitors?.name ?? "Konkurrent",
        subtitle: "Konkurrentaftale",
      })).slice(0, 10);

      return { customers, prospects };
    },
  });

  const expiringMachinesQuery = useQuery({
    enabled: !!userId,
    queryKey: ["dashboard-expiring-machines", userId, isAdmin],
    queryFn: () => fetchExpiringMachines(userId!, isAdmin),
  });





  const overdue = (followupsQuery.data ?? []).filter(
    (f) => f.next_followup_date && f.next_followup_date < today
  );
  const todays = (followupsQuery.data ?? []).filter(
    (f) => f.next_followup_date === today
  );

  const expiringCustomers = expiringDocsQuery.data?.customers ?? [];
  const expiringProspects = expiringDocsQuery.data?.prospects ?? [];
  const expiringMachines = expiringMachinesQuery.data ?? [];

  return (
    <div className="px-3 sm:px-4 md:px-8 py-4 sm:py-6 md:py-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <PersonalGreeting firstName={auth.fullName ? auth.fullName.split(" ")[0] : null} followupsToday={todays.length} />

      {/* 1. DIN MÅNED — personlig for sælgere, team-bredt for admin/support */}
      <div className="mb-6 md:mb-8">
        <MyMonthZone teamScope={isAdmin} />
      </div>

      {/* 2. DAGENS OPFØLGNINGER — personlige for sælgere, team-brede for admin/support */}
      <div className="grid gap-4 md:gap-6 md:grid-cols-2 mb-6 md:mb-8">
        <PanelCard
          title={isAdmin ? "Dagens fokus (team)" : "Dagens fokus"}
          icon={<CalendarCheck className="h-5 w-5" />}
          tone="success"
          count={todays.length}
          emptyText="Ingen opfølgninger planlagt i dag."
          loading={followupsQuery.isLoading}
        >
          {todays.map((item: any) => (
            <FollowupRow
              key={item.id}
              company={item.company?.name ?? "Ukendt"}
              meta={item.company?.city}
              dateLabel="I dag"
              note={item.next_action_note}
              tone="success"
              to="/virksomheder"
            />
          ))}
        </PanelCard>

        <PanelCard
          title={isAdmin ? "Overskredet (team)" : "Overskredet"}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="destructive"
          count={overdue.length}
          emptyText="Ingen overskredne opfølgninger — flot!"
          loading={followupsQuery.isLoading}
        >
          {overdue.slice(0, 8).map((item: any) => (
            <FollowupRow
              key={item.id}
              company={item.company?.name ?? "Ukendt"}
              meta={item.company?.city}
              dateLabel={format(parseISO(item.next_followup_date), "d. MMM", { locale: da })}
              note={item.next_action_note}
              tone="destructive"
              to="/virksomheder"
            />
          ))}
        </PanelCard>
      </div>

      {/* 3. KUNDER PÅ VEJ VÆK + AFTALER UDLØBER (side om side) */}
      <div className="grid gap-4 md:gap-6 md:grid-cols-2 mb-6 md:mb-8 items-start">
        <ChurningCustomersCard initialVisible={2} teamScope={isAdmin} />
        <ExpiringCustomersCard
          customers={expiringMachines}
          loading={expiringMachinesQuery.isLoading}
          initialVisible={2}
        />
      </div>



      {/* 4. KOMPAKT TÆLLER-RÆKKE */}
      <div className="grid gap-2 sm:gap-3 grid-cols-2 lg:grid-cols-3">
        <CompactStat
          to="/virksomheder"
          icon={<Flame className="h-4 w-4" />}
          tone="warning"
          title={isAdmin ? "Varme muligheder" : "Varme muligheder"}
          count={hotOppsQuery.data?.length ?? 0}
          loading={hotOppsQuery.isLoading}
        />
        <CompactStat
          to="/kontaktlister"
          icon={<ListChecks className="h-4 w-4" />}
          tone="primary"
          title={isAdmin ? "Kontaktlister" : "Mine kontaktlister"}
          count={listsQuery.data?.length ?? 0}
          loading={listsQuery.isLoading}
        />
        <CompactStat
          to="/virksomheder"
          icon={<FileText className="h-4 w-4" />}
          tone="warning"
          title="Emner – konkurrentaftaler"
          count={expiringProspects.length}
          loading={expiringDocsQuery.isLoading}
        />
      </div>



    </div>
  );
}

function CompactStat({
  to,
  icon,
  tone,
  title,
  count,
  loading,
}: {
  to: string;
  icon: React.ReactNode;
  tone: "destructive" | "success" | "warning" | "primary";
  title: string;
  count: number;
  loading?: boolean;
}) {
  const toneStyles: Record<string, string> = {
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    primary: "bg-primary/10 text-primary",
  };
  return (
    <Link
      to={to}
      className="group"
    >
      <Card className="px-3 py-2.5 sm:px-4 sm:py-3 min-h-[64px] sm:min-h-[72px] flex items-center gap-2 sm:gap-3 hover:bg-accent/40 transition-colors">
        <div className={`h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-md flex items-center justify-center ${toneStyles[tone]}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] sm:text-xs text-muted-foreground leading-tight line-clamp-2 sm:truncate">{title}</div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            {loading ? "…" : `${count} ${count === 1 ? "post" : "poster"}`}
          </div>
        </div>
        <ArrowRight className="hidden sm:block h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
      </Card>

    </Link>
  );
}


function PanelCard({
  title,
  icon,
  tone,
  count,
  emptyText,
  loading,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "destructive" | "success" | "warning" | "primary";
  count: number;
  emptyText: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  const toneStyles: Record<string, string> = {
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    primary: "bg-primary/10 text-primary",
  };
  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div
            className={`h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-md flex items-center justify-center ${toneStyles[tone]}`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-foreground leading-tight truncate">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {loading ? "Henter…" : `${count} ${count === 1 ? "post" : "poster"}`}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-[60px]">
        {loading ? (
          <div className="space-y-2">
            <div className="h-10 bg-muted/60 rounded animate-pulse" />
            <div className="h-10 bg-muted/60 rounded animate-pulse" />
          </div>
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground py-2">{emptyText}</p>
        ) : (
          <div>{children}</div>
        )}
      </div>
    </Card>
  );
}

function FollowupRow({
  company,
  meta,
  dateLabel,
  note,
  tone,
  to,
}: {
  company: string;
  meta?: string | null;
  dateLabel: string;
  note?: string | null;
  tone: "destructive" | "success";
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-2 sm:gap-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">{company}</div>
        <div className="text-xs text-muted-foreground truncate">
          {meta ? `${meta} · ` : ""}
          {note ?? "Ingen note"}
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <span
          className={`text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap ${
            tone === "destructive"
              ? "bg-destructive/10 text-destructive"
              : "bg-success/10 text-success"
          }`}
        >
          {dateLabel}
        </span>
        <ArrowRight className="hidden sm:block h-4 w-4 text-muted-foreground" />
      </div>
    </Link>

  );
}

function ExpiringCustomerRow({
  companyId,
  companyName,
  date,
  count,
}: {
  companyId: string;
  companyName: string;
  date: string;
  count: number;
}) {
  const days = Math.ceil((parseISO(date).getTime() - Date.now()) / 86400000);
  const tone: "destructive" | "warning" | "success" =
    days < 30 ? "destructive" : days <= 60 ? "warning" : "success";
  const toneCls =
    tone === "destructive"
      ? "bg-destructive/10 text-destructive"
      : tone === "warning"
        ? "bg-warning/15 text-warning-foreground"
        : "bg-success/10 text-success";
  const dateLabel = format(parseISO(date), "d. MMM yyyy", { locale: da });
  return (
    <Link
      to="/virksomheder/$id"
      params={{ id: companyId }}
      hash="lokationer"
      className="flex items-center justify-between gap-2 sm:gap-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">{companyName}</div>
        <div className="text-xs text-muted-foreground">
          {count} {count === 1 ? "maskine udløber" : "maskiner udløber"}
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <span
          className={`text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap ${toneCls}`}
        >
          {dateLabel}
        </span>
        <button
          type="button"
          title="Tilføj til kalender"
          aria-label="Tilføj til kalender"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void import("@/lib/add-to-calendar").then(({ addToCalendar }) =>
              addToCalendar({
                title: `Aftale udløber: ${companyName}`,
                date,
                description: `${count} ${count === 1 ? "maskine udløber" : "maskiner udløber"} hos ${companyName}.`,
                url: `${window.location.origin}/virksomheder/${companyId}#lokationer`,
                uid: `expiring-${companyId}`,
              }),
            );
          }}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
        </button>
        <ArrowRight className="hidden sm:block h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}

function ExpiringCustomersCard({
  customers,
  loading,
  initialVisible = 2,
}: {
  customers: { companyId: string; companyName: string; earliestDate: string; machines: unknown[] }[];
  loading: boolean;
  initialVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = customers.length;
  const visible = expanded ? customers : customers.slice(0, initialVisible);
  const hiddenCount = Math.max(0, count - initialVisible);

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-md flex items-center justify-center bg-warning/15 text-warning-foreground">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-foreground leading-tight truncate">
              Nuværende kunder – aftaler udløber
            </h2>
            <p className="text-xs text-muted-foreground">
              {loading ? "Henter…" : `${count} ${count === 1 ? "kunde" : "kunder"}`}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-[60px]">
        {loading ? (
          <div className="space-y-2">
            <div className="h-10 bg-muted/60 rounded animate-pulse" />
            <div className="h-10 bg-muted/60 rounded animate-pulse" />
          </div>
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Ingen kundeaftaler udløber inden for 90 dage.
          </p>
        ) : (
          <div>
            {visible.map((g) => (
              <ExpiringCustomerRow
                key={g.companyId}
                companyId={g.companyId}
                companyName={g.companyName}
                date={g.earliestDate}
                count={g.machines.length}
              />
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 w-full flex items-center justify-center gap-1 text-xs font-medium text-primary hover:underline py-2"
              >
                {expanded ? (
                  <>Vis færre <ChevronUp className="h-3.5 w-3.5" /></>
                ) : (
                  <>Se alle {count} <ChevronDown className="h-3.5 w-3.5" /></>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}




function statusLabel(status: string) {
  const map: Record<string, string> = {
    ny: "Ny",
    behovsafdækning: "Behovsafdækning",
    møde_demo: "Møde / demo",
    tilbud_under_udarbejdelse: "Tilbud under udarb.",
    tilbud_sendt: "Tilbud sendt",
    opfølgning: "Opfølgning",
    vundet: "Vundet",
    tabt: "Tabt",
    sat_på_pause: "På pause",
  };
  return map[status] ?? status;
}
