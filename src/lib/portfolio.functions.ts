import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isConsumableGroup } from "./sales-utils";

const PAGE = 1000;

async function isAdminUser(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

async function fetchAllInChunks(
  ids: string[],
  chunkSize: number,
  queryPage: (slice: string[], from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    for (let from = 0; ; from += PAGE) {
      const to = from + PAGE - 1;
      const { data, error } = await queryPage(slice, from, to);
      if (error) throw error;
      const page = data ?? [];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  }
  return rows;
}

export type PortfolioCompanyRow = {
  id: string;
  name: string;
  city: string | null;
  customer_type: string | null;
  has_active_equipment: boolean;
  last_consumable_sales_date: string | null;
  supplied_via_name: string | null;
  supplied_via_id: string | null;
  monthly: { period: string; revenue: number }[]; // last 5, oldest -> newest
  revenue12m: number;
  revenue12mPrior: number;
  contribution12m: number | null;
  employees: number | null;
  is_public: boolean;
};

export type RankingRow = {
  id: string;
  name: string;
  city: string | null;
  revenue12m: number;
  revenue12mPrior: number;
  contribution12m: number | null;
  last_consumable_sales_date: string | null;
  supplied_via_name: string | null;
  supplied_via_id: string | null;
  employees: number | null;
  ratio: number | null; // kr/ansat
};

export type ScatterPoint = {
  id: string;
  name: string;
  employees: number;
  revenue12m: number;
};

export type SignalRow = {
  id: string;
  name: string;
  city: string | null;
  revenue12m: number;
  revenue12mPrior: number;
  daysSinceConsumable: number | null;
  consumableAvgPerMonth: number | null;
  missingGroups: string[]; // whitespace tags
  growthPct: number | null;
  expiresAt: string | null;
  expiryLabel: string | null;
  expirySubtitle: string | null;
};

export type PortfolioPayload = {
  isAdmin: boolean;
  appliedSellerId: string | null;
  sellerOptions: { id: string; name: string }[];
  totals: {
    revenue12m: number;
    revenue12mPriorYear: number;
    contribution12m: number | null;
  };
  statusCounts: {
    aktive: number;
    sovende: number;
    paaVejVaek: number;
    total: number;
  };
  monthLabels: { period: string; label: string }[]; // last 5
  companies: PortfolioCompanyRow[];
  rankings: {
    topRevenue: RankingRow[];
    bottomRevenueActive: RankingRow[];
    topContribution: RankingRow[] | null;
    potential: RankingRow[];
    potentialScatter: ScatterPoint[];
    potentialMissingEmployees: number;
  };
  signals: {
    machineNoCoffee: SignalRow[];
    whiteSpace: SignalRow[];
    growing: SignalRow[];
    declining: SignalRow[];
    expiringAgreements: SignalRow[];
    expiringCompetitor: SignalRow[];
  };
};


function monthStart(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function shiftMonths(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return monthStart(d);
}

export const getMyPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sellerId?: string | null }) => input ?? {})
  .handler(async ({ data, context }): Promise<PortfolioPayload> => {
    const { supabase, userId } = context;
    const isAdmin = await isAdminUser(supabase, userId);

    // Seller options for admin
    let sellerOptions: { id: string; name: string }[] = [];
    if (isAdmin) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "saelger");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids)
          .order("full_name");
        sellerOptions = (profs ?? []).map((p: any) => ({
          id: p.id,
          name: p.full_name || "(Ukendt)",
        }));
      }
    }

    const appliedSellerId: string | null = isAdmin
      ? (data.sellerId ?? null) // null = alle sælgere
      : userId;

    // Determine portfolio company ids
    let companyIds: string[] = [];
    {
      let q = supabase.from("companies").select("id");
      if (appliedSellerId) q = q.eq("assigned_to", appliedSellerId);
      else q = q.not("assigned_to", "is", null);
      const { data: comps, error } = await q;
      if (error) throw error;
      companyIds = (comps ?? []).map((c: any) => c.id);
    }

    // Month windows
    const now = new Date();
    const thisMonth = monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
    const last5: string[] = [];
    for (let i = 4; i >= 0; i--) last5.push(shiftMonths(thisMonth, -i));
    const monthLabels = last5.map((p) => ({
      period: p,
      label: new Date(p + "T00:00:00Z").toLocaleDateString("da-DK", { month: "short" }),
    }));

    // 12-month current window (including current partial)
    const startCur = shiftMonths(thisMonth, -11);
    // 12-month prior year window
    const startPrior = shiftMonths(thisMonth, -23);
    const endPriorExcl = shiftMonths(thisMonth, -11); // exclusive

    const emptyRankings = {
      topRevenue: [] as RankingRow[],
      bottomRevenueActive: [] as RankingRow[],
      topContribution: isAdmin ? ([] as RankingRow[]) : null,
      potential: [] as RankingRow[],
      potentialScatter: [] as ScatterPoint[],
      potentialMissingEmployees: 0,
    };
    const emptySignals = {
      machineNoCoffee: [] as SignalRow[],
      whiteSpace: [] as SignalRow[],
      growing: [] as SignalRow[],
      declining: [] as SignalRow[],
      expiringAgreements: [] as SignalRow[],
      expiringCompetitor: [] as SignalRow[],
    };

    if (!companyIds.length) {
      return {
        isAdmin,
        appliedSellerId: isAdmin ? appliedSellerId : null,
        sellerOptions,
        totals: { revenue12m: 0, revenue12mPriorYear: 0, contribution12m: isAdmin ? 0 : null },
        statusCounts: { aktive: 0, sovende: 0, paaVejVaek: 0, total: 0 },
        monthLabels,
        companies: [],
        rankings: emptyRankings,
        signals: emptySignals,
      };
    }

    // Fetch companies meta
    const compsMeta = await fetchAllInChunks(companyIds, 200, (slice, from, to) =>
      supabase
        .from("companies")
        .select(
          "id, name, city, customer_type, has_active_equipment, last_consumable_sales_date, employees, is_public",
        )
        .in("id", slice)
        .range(from, to),
    );

    // Fetch sales_monthly for the prior-year window through now
    const select = isAdmin
      ? "company_id, period, revenue, contribution, product_group_1"
      : "company_id, period, revenue, product_group_1";
    const salesRows = await fetchAllInChunks(companyIds, 100, (slice, from, to) =>
      supabase
        .from("sales_monthly")
        .select(select)
        .in("company_id", slice)
        .gte("period", startPrior)
        .range(from, to),
    );

    // Fetch supplied_via relations (forsynes_af) where from_company_id in portfolio
    const relRows = await fetchAllInChunks(companyIds, 200, (slice, from, to) =>
      supabase
        .from("company_relations")
        .select("from_company_id, to:companies!company_relations_to_company_id_fkey(id, name)")
        .eq("relation_type", "forsynes_af")
        .in("from_company_id", slice)
        .range(from, to),
    );
    const suppliedMap = new Map<string, { id: string; name: string }>();
    for (const r of relRows as any[]) {
      if (r.to) suppliedMap.set(r.from_company_id, { id: r.to.id, name: r.to.name });
    }

    // Aggregate per company
    type Agg = {
      monthly: Map<string, number>;
      revenue12m: number;
      revenue12mPrior: number;
      contribution12m: number;
    };
    const aggs = new Map<string, Agg>();
    let totalRev12 = 0;
    let totalRevPrior = 0;
    let totalContrib = 0;
    const last5Set = new Set(last5);

    for (const r of salesRows) {
      const cid = r.company_id as string;
      if (!cid) continue;
      const period = r.period as string;
      const rev = Number(r.revenue) || 0;
      const inCurrent = period >= startCur && period <= thisMonth;
      const inPrior = period >= startPrior && period < endPriorExcl;

      const agg =
        aggs.get(cid) ?? { monthly: new Map(), revenue12m: 0, revenue12mPrior: 0, contribution12m: 0 };
      if (inCurrent) {
        totalRev12 += rev;
        if (isAdmin) totalContrib += Number((r as any).contribution) || 0;
        agg.revenue12m += rev;
        if (isAdmin) agg.contribution12m += Number((r as any).contribution) || 0;
        if (last5Set.has(period)) {
          agg.monthly.set(period, (agg.monthly.get(period) ?? 0) + rev);
        }
        aggs.set(cid, agg);
      } else if (inPrior) {
        totalRevPrior += rev;
        agg.revenue12mPrior += rev;
        aggs.set(cid, agg);
      }
    }

    // Build company rows
    const companies: PortfolioCompanyRow[] = (compsMeta as any[]).map((c) => {
      const agg = aggs.get(c.id);
      const monthly = last5.map((p) => ({ period: p, revenue: agg?.monthly.get(p) ?? 0 }));
      const supplied = suppliedMap.get(c.id) ?? null;
      return {
        id: c.id,
        name: c.name,
        city: c.city ?? null,
        customer_type: c.customer_type ?? null,
        has_active_equipment: !!c.has_active_equipment,
        last_consumable_sales_date: c.last_consumable_sales_date ?? null,
        supplied_via_id: supplied?.id ?? null,
        supplied_via_name: supplied?.name ?? null,
        monthly,
        revenue12m: agg?.revenue12m ?? 0,
        revenue12mPrior: agg?.revenue12mPrior ?? 0,
        contribution12m: isAdmin ? (agg?.contribution12m ?? 0) : null,
        employees: c.employees ?? null,
        is_public: !!c.is_public,
      };
    });

    // Status counts
    const todayMs = Date.now();
    let aktive = 0;
    let sovende = 0;
    let paaVejVaek = 0;
    for (const c of companies) {
      if (c.customer_type === "aktiv_kunde") aktive++;
      else if (c.customer_type === "sovende_kunde") sovende++;
      // "På vej væk" = aktiv kunde med udstyr, ingen forbrugsvarekøb (eller >60 dage),
      // og ikke forsynes_af en anden konto.
      if (
        c.customer_type === "aktiv_kunde" &&
        c.has_active_equipment &&
        !c.supplied_via_id
      ) {
        const last = c.last_consumable_sales_date;
        const daysSince = last
          ? Math.floor((todayMs - new Date(last + "T00:00:00Z").getTime()) / 86400000)
          : Infinity;
        if (daysSince > 60) paaVejVaek++;
      }
    }

    // --- Rankings ---
    const toRanking = (c: PortfolioCompanyRow): RankingRow => ({
      id: c.id,
      name: c.name,
      city: c.city,
      revenue12m: c.revenue12m,
      revenue12mPrior: c.revenue12mPrior,
      contribution12m: c.contribution12m,
      last_consumable_sales_date: c.last_consumable_sales_date,
      supplied_via_name: c.supplied_via_name,
      supplied_via_id: c.supplied_via_id,
      employees: c.employees,
      ratio: c.employees && c.employees > 0 ? c.revenue12m / c.employees : null,
    });

    const topRevenue = [...companies]
      .filter((c) => c.revenue12m > 0)
      .sort((a, b) => b.revenue12m - a.revenue12m)
      .slice(0, 25)
      .map(toRanking);

    const activeCompanies = companies.filter((c) => c.customer_type === "aktiv_kunde");
    const bottomRevenueActive = [...activeCompanies]
      .sort((a, b) => a.revenue12m - b.revenue12m)
      .slice(0, 25)
      .map(toRanking);

    const topContribution: RankingRow[] | null = isAdmin
      ? [...companies]
          .filter((c) => (c.contribution12m ?? 0) > 0)
          .sort((a, b) => (b.contribution12m ?? 0) - (a.contribution12m ?? 0))
          .slice(0, 25)
          .map(toRanking)
      : null;

    // Potentiale: active + private (ikke offentlig) + employees>0
    const potentialPool = activeCompanies.filter((c) => !c.is_public);
    const missingEmployees = potentialPool.filter((c) => !c.employees || c.employees <= 0).length;
    const withEmployees = potentialPool.filter((c) => c.employees && c.employees > 0);
    const potential = [...withEmployees]
      .map(toRanking)
      .sort((a, b) => (a.ratio ?? Infinity) - (b.ratio ?? Infinity))
      .slice(0, 25);
    const potentialScatter: ScatterPoint[] = withEmployees.map((c) => ({
      id: c.id,
      name: c.name,
      employees: c.employees as number,
      revenue12m: c.revenue12m,
    }));

    return {
      isAdmin,
      appliedSellerId: isAdmin ? appliedSellerId : null,
      sellerOptions,
      totals: {
        revenue12m: totalRev12,
        revenue12mPriorYear: totalRevPrior,
        contribution12m: isAdmin ? totalContrib : null,
      },
      statusCounts: {
        aktive,
        sovende,
        paaVejVaek,
        total: companies.length,
      },
      monthLabels,
      companies,
      rankings: {
        topRevenue,
        bottomRevenueActive,
        topContribution,
        potential,
        potentialScatter,
        potentialMissingEmployees: missingEmployees,
      },
    };
  });

