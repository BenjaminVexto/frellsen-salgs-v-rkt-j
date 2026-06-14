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

  const expiringMachinesQuery = useQuery({
    enabled: !!userId,
    queryKey: ["dashboard-expiring-machines", userId, isAdmin],
    queryFn: async () => {
      const todayS = today;
      const in90D = new Date();
      in90D.setDate(in90D.getDate() + 90);
      const in90S = in90D.toISOString().slice(0, 10);

      // 1. Enrichment-rækker hvor binding_ophor ELLER handlingsdato ligger i vinduet
      const { data: enr, error: enrErr } = await (supabase as any)
        .from("machine_enrichment")
        .select("serienr, binding_ophor, handlingsdato")
        .or(
          `and(binding_ophor.gte.${todayS},binding_ophor.lte.${in90S}),and(handlingsdato.gte.${todayS},handlingsdato.lte.${in90S})`,
        );
      if (enrErr) throw enrErr;
      const serienrs = Array.from(
        new Set(((enr ?? []) as any[]).map((e) => e.serienr).filter(Boolean)),
      );
      if (!serienrs.length) return [];

      // 2. Maskiner for disse serienr (chunked IN)
      const machines: any[] = [];
      const CHUNK = 500;
      for (let i = 0; i < serienrs.length; i += CHUNK) {
        const slice = serienrs.slice(i, i + CHUNK);
        const { data, error } = await (supabase as any)
          .from("machines")
          .select("serienr, fak_kundenr")
          .in("serienr", slice);
        if (error) throw error;
        machines.push(...(data ?? []));
      }
      if (!machines.length) return [];

      const kundenrs = Array.from(
        new Set(machines.map((m) => m.fak_kundenr).filter(Boolean) as string[]),
      );
      if (!kundenrs.length) return [];

      // 3. Tilladte virksomheder (admin = alle; sælger = egne tildelte)
      let compQ = supabase
        .from("companies")
        .select("id, name, visma_id")
        .in("visma_id", kundenrs);
      if (!isAdmin) compQ = compQ.eq("assigned_to", userId!);
      const { data: companies, error: cErr } = await compQ;
      if (cErr) throw cErr;
      const compByVisma = new Map<string, { id: string; name: string }>();
      (companies ?? []).forEach((c: any) =>
        compByVisma.set(c.visma_id, { id: c.id, name: c.name }),
      );
      if (compByVisma.size === 0) return [];

      // 4. Aggregér: pr. virksomhed = nærmeste dato + antal maskiner i vinduet
      const enrBySerienr = new Map<string, any>();
      ((enr ?? []) as any[]).forEach((e) => enrBySerienr.set(e.serienr, e));

      type Earliest = {
        companyId: string;
        companyName: string;
        date: string;
        type: "binding" | "service";
      };
      const byCompany = new Map<string, { earliest: Earliest; count: number }>();

      for (const m of machines) {
        const comp = m.fak_kundenr ? compByVisma.get(m.fak_kundenr) : null;
        if (!comp) continue;
        const e = enrBySerienr.get(m.serienr);
        if (!e) continue;

        const cands: { date: string; type: "binding" | "service" }[] = [];
        if (e.binding_ophor && e.binding_ophor >= todayS && e.binding_ophor <= in90S) {
          cands.push({ date: e.binding_ophor, type: "binding" });
        }
        if (e.handlingsdato && e.handlingsdato >= todayS && e.handlingsdato <= in90S) {
          cands.push({ date: e.handlingsdato, type: "service" });
        }
        if (!cands.length) continue;
        cands.sort((a, b) => a.date.localeCompare(b.date));
        const best = cands[0];

        const existing = byCompany.get(comp.id);
        if (!existing) {
          byCompany.set(comp.id, {
            earliest: { companyId: comp.id, companyName: comp.name, ...best },
            count: 1,
          });
        } else {
          existing.count++;
          if (best.date < existing.earliest.date) {
            existing.earliest = { companyId: comp.id, companyName: comp.name, ...best };
          }
        }
      }

      return Array.from(byCompany.values())
        .map(({ earliest, count }) => ({ ...earliest, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
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

      {/* 1. DIN MÅNED */}
      <div className="mb-6 md:mb-8">
        <MyMonthZone />
      </div>

      {/* 2. DAGENS OPFØLGNINGER */}
      <div className="grid gap-4 md:gap-6 md:grid-cols-2 mb-6 md:mb-8">
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
      </div>

      {/* 3. KUNDER PÅ VEJ VÆK */}
      <div className="mb-6 md:mb-8">
        <ChurningCustomersCard initialVisible={2} />
      </div>

      {/* 4. NUVÆRENDE KUNDER — AFTALER UDLØBER (binding / service efter regning) */}
      <div className="mb-6 md:mb-8">
        <PanelCard
          title="Nuværende kunder – aftaler udløber"
          icon={<FileText className="h-5 w-5" />}
          tone="warning"
          count={expiringMachines.length}
          emptyText="Ingen kundeaftaler udløber inden for 90 dage."
          loading={expiringMachinesQuery.isLoading}
        >
          {expiringMachines.slice(0, 10).map((row) => (
            <ExpiringCustomerRow key={row.companyId} {...row} />
          ))}
        </PanelCard>
      </div>


      {/* 4. KOMPAKT TÆLLER-RÆKKE */}
      <div className="grid gap-2 sm:gap-3 grid-cols-2 lg:grid-cols-4">
        <CompactStat
          to="/virksomheder"
          icon={<Flame className="h-4 w-4" />}
          tone="warning"
          title="Varme muligheder"
          count={hotOppsQuery.data?.length ?? 0}
          loading={hotOppsQuery.isLoading}
        />
        <CompactStat
          to="/kontaktlister"
          icon={<ListChecks className="h-4 w-4" />}
          tone="primary"
          title="Mine kontaktlister"
          count={listsQuery.data?.length ?? 0}
          loading={listsQuery.isLoading}
        />
        <CompactStat
          to="/virksomheder"
          icon={<FileText className="h-4 w-4" />}
          tone="success"
          title="Kunder – aftaler udløber"
          count={expiringMachines.length}
          loading={expiringMachinesQuery.isLoading}
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
  type,
  count,
}: {
  companyId: string;
  companyName: string;
  date: string;
  type: "binding" | "service";
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
  const typeLabel = type === "binding" ? "Binding" : "Service → efter regning";
  return (
    <Link
      to="/virksomheder/$id"
      params={{ id: companyId }}
      className="flex items-center justify-between gap-2 sm:gap-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">{companyName}</div>
        <div className="text-xs text-muted-foreground truncate">{typeLabel}</div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {count > 1 && (
          <span className="text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
            {count} maskiner
          </span>
        )}
        <span
          className={`text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap ${toneCls}`}
        >
          {dateLabel}
        </span>
        <ArrowRight className="hidden sm:block h-4 w-4 text-muted-foreground" />
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
