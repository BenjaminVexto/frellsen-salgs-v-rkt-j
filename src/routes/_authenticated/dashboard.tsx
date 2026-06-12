import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
} from "lucide-react";
import { format, isToday, parseISO, addDays } from "date-fns";
import { da } from "date-fns/locale";
import { PersonalGreeting } from "@/components/sales/personal-greeting";
import { MyMonthZone } from "@/components/sales/my-month-zone";
import { ChurningCustomersCard } from "@/components/sales/churning-customers-card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Mit overblik — Frellsen Salgsoversigt" }] }),
});

function DashboardPage() {
  const auth = useAuth();
  const userId = auth.user?.id;

  const today = new Date().toISOString().slice(0, 10);

  const followupsQuery = useQuery({
    enabled: !!userId,
    queryKey: ["dashboard-followups", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_list_assignments")
        .select(
          "id, status, priority, next_followup_date, next_action_note, company:companies(id, name, city)"
        )
        .eq("assigned_to", userId!)
        .not("next_followup_date", "is", null)
        .order("next_followup_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const hotOppsQuery = useQuery({
    enabled: !!userId,
    queryKey: ["dashboard-hot-opps", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_opportunities")
        .select(
          "id, name, status, estimated_value, next_followup_date, company:companies(id, name)"
        )
        .eq("assigned_to", userId!)
        .in("status", ["tilbud_sendt", "møde_demo"])
        .order("next_followup_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const listsQuery = useQuery({
    enabled: !!userId,
    queryKey: ["dashboard-lists", userId],
    queryFn: async () => {
      // hent unikke kontaktlister via assignments
      const { data: assignments, error } = await supabase
        .from("contact_list_assignments")
        .select("contact_list_id, status, contact_list:contact_lists(id, name, is_active)")
        .eq("assigned_to", userId!);
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

  const isAdmin = auth.role === "admin";

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

      let docsQ = supabase
        .from("company_documents")
        .select("id, filename, document_type, expires_at, company_id, companies(id, name, city)")
        .not("expires_at", "is", null)
        .gte("expires_at", today)
        .lte("expires_at", to)
        .order("expires_at", { ascending: true });
      let compQ = supabase
        .from("competitor_assignments")
        .select(
          "id, contract_expires_at, company_id, competitor_id, competitors(name), companies(id, name, city)",
        )
        .not("contract_expires_at", "is", null)
        .gte("contract_expires_at", today)
        .lte("contract_expires_at", to)
        .order("contract_expires_at", { ascending: true });

      if (allowedCompanyIds) {
        docsQ = docsQ.in("company_id", allowedCompanyIds);
        compQ = compQ.in("company_id", allowedCompanyIds);
      }

      const [docsRes, compRes] = await Promise.all([docsQ, compQ]);

      if (docsRes.error) throw docsRes.error;
      if (compRes.error) throw compRes.error;

      const customers = (docsRes.data ?? []).map((d: any) => ({
        kind: "doc" as const,
        id: `doc-${d.id}`,
        date: d.expires_at as string,
        companyId: d.company_id as string,
        companyName: d.companies?.name ?? "Ukendt",
        title: d.filename as string,
        subtitle: d.document_type as string,
      })).slice(0, 10);
      const prospects = (compRes.data ?? []).map((c: any) => ({
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



  const overdue = (followupsQuery.data ?? []).filter(
    (f) => f.next_followup_date && f.next_followup_date < today
  );
  const todays = (followupsQuery.data ?? []).filter(
    (f) => f.next_followup_date === today
  );

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <PersonalGreeting firstName={auth.fullName ? auth.fullName.split(" ")[0] : null} followupsToday={todays.length} />

      <div className="mb-6 md:mb-8">
        <MyMonthZone />
      </div>

      <div className="mb-6 md:mb-8">
        <ChurningCustomersCard />
      </div>



      <div className="grid gap-4 md:gap-6 md:grid-cols-2">
        <PanelCard
          title="Overskredet"
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

        <PanelCard
          title="Dagens fokus"
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
          title="Varme muligheder"
          icon={<Flame className="h-5 w-5" />}
          tone="warning"
          count={hotOppsQuery.data?.length ?? 0}
          emptyText="Ingen åbne tilbud eller møder lige nu."
          loading={hotOppsQuery.isLoading}
        >
          {(hotOppsQuery.data ?? []).slice(0, 8).map((opp: any) => (
            <div
              key={opp.id}
              className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {opp.company?.name ?? "Ukendt virksomhed"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {opp.name} · {statusLabel(opp.status)}
                </div>
              </div>
              <div className="text-sm font-medium text-foreground tabular-nums whitespace-nowrap">
                {opp.estimated_value
                  ? `${Number(opp.estimated_value).toLocaleString("da-DK")} kr.`
                  : "—"}
              </div>
            </div>
          ))}
        </PanelCard>

        <PanelCard
          title="Mine kontaktlister"
          icon={<ListChecks className="h-5 w-5" />}
          tone="primary"
          count={listsQuery.data?.length ?? 0}
          emptyText="Du har ingen aktive kontaktlister."
          loading={listsQuery.isLoading}
        >
          {(listsQuery.data ?? []).map((list) => {
            const pct = list.total ? Math.round((list.progressed / list.total) * 100) : 0;
            return (
              <Link
                key={list.id}
                to="/kontaktlister"
                className="block py-3 border-b border-border last:border-0 hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-sm font-medium text-foreground">{list.name}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {list.progressed}/{list.total}
                  </div>
                </div>
                <Progress value={pct} className="h-1.5" />
              </Link>
            );
          })}
        </PanelCard>

        {(["customers", "prospects"] as const).map((bucket) => {
          const items = expiringDocsQuery.data?.[bucket] ?? [];
          const isCustomers = bucket === "customers";
          return (
            <PanelCard
              key={bucket}
              title={isCustomers ? "Nuværende kunder – aftaler udløber" : "Potentielle emner – konkurrentaftaler udløber"}
              icon={<FileText className="h-5 w-5" />}
              tone={isCustomers ? "success" : "warning"}
              count={items.length}
              emptyText={
                isCustomers
                  ? "Ingen kundeaftaler udløber inden for 90 dage."
                  : "Ingen konkurrentaftaler udløber inden for 90 dage."
              }
              loading={expiringDocsQuery.isLoading}
            >
              {items.map((item) => (
                <Link
                  key={item.id}
                  to="/virksomheder/$id"
                  params={{ id: item.companyId }}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                      <span>{item.kind === "doc" ? "📄" : "☕"}</span>
                      <span className="truncate">{item.companyName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {item.title}
                    </div>
                  </div>
                  {(() => {
                    const days = Math.ceil(
                      (parseISO(item.date).getTime() - Date.now()) / 86400000,
                    );
                    const tone =
                      days <= 14
                        ? "bg-destructive/15 text-destructive"
                        : days <= 30
                          ? "bg-warning/15 text-warning-foreground"
                          : "bg-success/15 text-success";
                    return (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap ${tone}`}>
                        {format(parseISO(item.date), "d. MMM yyyy", { locale: da })}
                      </span>
                    );
                  })()}
                </Link>
              ))}
            </PanelCard>
          );
        })}

      </div>

      {(followupsQuery.data?.length ?? 0) === 0 &&
        (hotOppsQuery.data?.length ?? 0) === 0 &&
        (listsQuery.data?.length ?? 0) === 0 &&
        !followupsQuery.isLoading && (
          <Card className="mt-8 p-6 text-center bg-muted/40 border-dashed">
            <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Du har endnu ingen tildelinger. Kontakt din administrator for at få tildelt
              virksomheder og kontaktlister.
            </p>
          </Card>
        )}
    </div>
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
    <Card className="p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-9 w-9 rounded-md flex items-center justify-center ${toneStyles[tone]}`}
          >
            {icon}
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground leading-tight">
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
      className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{company}</div>
        <div className="text-xs text-muted-foreground truncate">
          {meta ? `${meta} · ` : ""}
          {note ?? "Ingen note"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            tone === "destructive"
              ? "bg-destructive/10 text-destructive"
              : "bg-success/10 text-success"
          }`}
        >
          {dateLabel}
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
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
