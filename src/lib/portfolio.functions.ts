import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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

export type RhythmClass = "normal" | "slower" | "stopped" | "never";

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
  revenueYtd: number;
  revenueYtdPriorSamePeriod: number;

  contribution12m: number | null;
  employees: number | null;
  is_public: boolean;
  // Købsrytme (forbrugsvarer — prisgrupper 2/4/6/10), måneds-opløsning.
  rhythmMonths: number | null; // median antal måneder mellem aktive consumable-måneder; null hvis <3 aktive
  monthsSinceConsumable: number | null; // måneder siden seneste consumable-køb
  rhythmClass: RhythmClass; // klassifikation efter rytme (eller fallback 60-d for kunder uden rytme)
  growthPct: number | null; // 12m vs forrige 12m
  trendDown: boolean; // growthPct < -15% og revenue12m > tærskel
};

export type RankingRow = {
  id: string;
  name: string;
  city: string | null;
  revenue12m: number;
  revenue12mPrior: number;
  revenueYtd: number;
  revenueYtdPriorSamePeriod: number;
  contribution12m: number | null;
  last_consumable_sales_date: string | null;
  supplied_via_name: string | null;
  supplied_via_id: string | null;
  employees: number | null;
  ratio: number | null; // kr/ansat
  rhythmClass: RhythmClass;
  monthsSinceConsumable: number | null;
  rhythmMonths: number | null;
  trendDown: boolean;
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
    revenueYtd: number;
    revenueYtdPriorSamePeriod: number;
    ytdLatestPeriod: string | null;
    ytdFraction: number;
    contribution12m: number | null;
  };

  statusCounts: {
    aktive: number;
    sovende: number;
    paaVejVaek: number;
    total: number;
  };
  // Deterministisk re-evaluering for 30 dage siden (samme 12/24-mdr-vinduer,
  // eval-dato skubbet 30 dage tilbage). Bruges til "↑/↓ X siden sidst".
  statusCountsPrior: {
    aktive: number;
    sovende: number;
    paaVejVaek: number;
  };
  monthLabels: { period: string; label: string }[]; // last 5
  companies: PortfolioCompanyRow[];
  rankings: {
    topRevenue: RankingRow[];
    topDecliners: RankingRow[];
    topGrowers: RankingRow[];
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

// --- helpers: dato / rytme / customer_type ---
function monthsBetweenPeriods(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}
function medianOf(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function deriveCustomerType(
  effective: Date | null,
  hasEq: boolean,
  cutoff12: Date,
  cutoff24: Date,
): "aktiv_kunde" | "sovende_kunde" | "tidligere_kunde" | "nyt_emne" {
  if (hasEq) return "aktiv_kunde";
  if (!effective) return "nyt_emne";
  if (effective.getTime() >= cutoff12.getTime()) return "aktiv_kunde";
  if (effective.getTime() >= cutoff24.getTime()) return "sovende_kunde";
  return "tidligere_kunde";
}


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

    // Determine portfolio company ids — paginate to avoid the 1000-row PostgREST cap.
    // Udeluk interne konti (Kundeprisgruppe 3 = "5 [Interne]") fra al statistik.
    const INTERNAL_RE = /^\s*5\s*\[/;
    let companyIds: string[] = [];
    {
      for (let from = 0; ; from += PAGE) {
        const to = from + PAGE - 1;
        let q = supabase
          .from("companies")
          .select("id, customer_segment_3")
          .range(from, to);
        if (appliedSellerId) q = q.eq("assigned_to", appliedSellerId);
        else q = q.not("assigned_to", "is", null);
        const { data: comps, error } = await q;
        if (error) throw error;
        const page = comps ?? [];
        for (const c of page as any[]) {
          if (c.customer_segment_3 && INTERNAL_RE.test(c.customer_segment_3)) continue;
          companyIds.push(c.id);
        }
        if (page.length < PAGE) break;
      }
    }

    // Month windows
    const now = new Date();
    const thisMonth = monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
    // Trend = 6 SENESTE HELE måneder. Indeværende (ufuldstændige) måned udelades.
    // 6 giver ren halvering (3 mod 3) i flag-logikken.
    const last5: string[] = [];
    for (let i = 6; i >= 1; i--) last5.push(shiftMonths(thisMonth, -i));
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
      topDecliners: [] as RankingRow[],
      topGrowers: [] as RankingRow[],
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
        totals: {
          revenue12m: 0,
          revenue12mPriorYear: 0,
          revenueYtd: 0,
          revenueYtdPriorSamePeriod: 0,
          ytdLatestPeriod: null,
          ytdFraction: 1,
          contribution12m: isAdmin ? 0 : null,
        },

        statusCounts: { aktive: 0, sovende: 0, paaVejVaek: 0, total: 0 },
        statusCountsPrior: { aktive: 0, sovende: 0, paaVejVaek: 0 },
        monthLabels,
        companies: [],
        rankings: emptyRankings,
        signals: emptySignals,
      };
    }


    // Fetch companies meta (incl. last_sales_date + last_purchase_date til prior status-snapshot)
    const compsMeta = await fetchAllInChunks(companyIds, 200, (slice, from, to) =>
      supabase
        .from("companies")
        .select(
          "id, name, city, customer_type, has_active_equipment, last_consumable_sales_date, last_sales_date, last_purchase_date, employees, is_public",
        )
        .in("id", slice)
        .range(from, to),
    );

    // Fetch sales_monthly for the prior-year window through now
    const select = isAdmin
      ? "company_id, period, revenue, contribution, product_group_1"
      : "company_id, period, revenue, product_group_1";
    const salesClient = isAdmin ? supabaseAdmin : supabase;
    const salesRows = await fetchAllInChunks(companyIds, 100, (slice, from, to) =>
      salesClient
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
      revenueYtd: number;
      revenueYtdPrior: number;
      ytdPriorLastMonthRev: number;
    };

    const aggs = new Map<string, Agg>();
    let totalRev12 = 0;
    let totalRevPrior = 0;
    let totalContrib = 0;
    // YTD-akkumulatorer — vinduer afgøres efter første sweep (refPeriod = max(period))
    let totalRevYtd = 0;
    let totalRevYtdPrior = 0;
    let ytdCurLastMonthRev = 0;
    let ytdPriorLastMonthRev = 0;
    // Find seneste periode i datasættet for YTD-referencepunkt.
    let latestPeriod: string | null = null;
    for (const r of salesRows) {
      const p = r.period as string;
      if (!latestPeriod || p > latestPeriod) latestPeriod = p;
    }
    const refPeriod = latestPeriod ?? thisMonth;
    const refYear = parseInt(refPeriod.slice(0, 4), 10);
    const refMonth = parseInt(refPeriod.slice(5, 7), 10);
    const startCurYtd = `${refYear}-01-01`;
    const startPriorYtd = `${refYear - 1}-01-01`;
    const endPriorYtd = `${refYear - 1}-${String(refMonth).padStart(2, "0")}-01`;
    const last5Set = new Set(last5);
    // Trend (monthly) måler LØBENDE FORBRUG = al omsætning UNDTAGEN
    // produktgruppe "16 [Maskiner/Service]". Maskingruppen klumper i januar
    // pga. årlig service-/leje-fakturering og giver ellers falske fald.
    // revenue12m/contribution12m bevares som TOTAL (inkl. maskiner).
    const MACHINE_RE = /^\s*16\s*\[/;

    // --- Pr-kunde sporing for rytme + prior-snapshot ---
    // Aktive consumable-måneder (revenue > 0 i prisgruppe 2/4/6/10) — bruges til rytme-median.
    const consPeriodsByCompany = new Map<string, Set<string>>();
    // Seneste salgs-/consumable-måned for "nu" (alle perioder i salesRows) og for
    // "30 dage siden" (kun perioder < indeværende måned).
    const lastSalesNow = new Map<string, string>();
    const lastSalesPrior = new Map<string, string>();
    const lastConsNow = new Map<string, string>();
    const lastConsPrior = new Map<string, string>();


    for (const r of salesRows) {
      const cid = r.company_id as string;
      if (!cid) continue;
      const period = r.period as string;
      const rev = Number(r.revenue) || 0;
      const inCurrent = period >= startCur && period <= thisMonth;
      const inPrior = period >= startPrior && period < endPriorExcl;
      const groupRaw = String((r as any).product_group_1 ?? "");
      const isMachine = MACHINE_RE.test(groupRaw);
      const groupCode = groupRaw.trim().match(/^(\d+)/)?.[1] ?? null;
      const isConsumable =
        groupCode === "2" || groupCode === "4" || groupCode === "6" || groupCode === "10";

      // Spor seneste salgs-/consumable-måned (kun måneder med faktisk omsætning)
      if (rev > 0) {
        const lsn = lastSalesNow.get(cid);
        if (!lsn || period > lsn) lastSalesNow.set(cid, period);
        if (period < thisMonth) {
          const lsp = lastSalesPrior.get(cid);
          if (!lsp || period > lsp) lastSalesPrior.set(cid, period);
        }
        if (isConsumable) {
          const lcn = lastConsNow.get(cid);
          if (!lcn || period > lcn) lastConsNow.set(cid, period);
          if (period < thisMonth) {
            const lcp = lastConsPrior.get(cid);
            if (!lcp || period > lcp) lastConsPrior.set(cid, period);
          }
          let cps = consPeriodsByCompany.get(cid);
          if (!cps) {
            cps = new Set();
            consPeriodsByCompany.set(cid, cps);
          }
          cps.add(period);
        }
      }

      const agg =
        aggs.get(cid) ?? {
          monthly: new Map(),
          revenue12m: 0,
          revenue12mPrior: 0,
          contribution12m: 0,
          revenueYtd: 0,
          revenueYtdPrior: 0,
          ytdPriorLastMonthRev: 0,
        };
      // YTD-vinduer (samme periode sidste år, sammenlignet på måned)
      if (period >= startCurYtd && period <= refPeriod) {
        totalRevYtd += rev;
        agg.revenueYtd += rev;
        if (period === refPeriod) ytdCurLastMonthRev += rev;
        aggs.set(cid, agg);
      }
      if (period >= startPriorYtd && period <= endPriorYtd) {
        totalRevYtdPrior += rev;
        agg.revenueYtdPrior += rev;
        if (period === endPriorYtd) {
          ytdPriorLastMonthRev += rev;
          agg.ytdPriorLastMonthRev += rev;
        }
        aggs.set(cid, agg);
      }

      if (inCurrent) {
        totalRev12 += rev;
        if (isAdmin) totalContrib += Number((r as any).contribution) || 0;
        agg.revenue12m += rev;
        if (isAdmin) agg.contribution12m += Number((r as any).contribution) || 0;
        if (last5Set.has(period) && !isMachine) {
          agg.monthly.set(period, (agg.monthly.get(period) ?? 0) + rev);
        }
        aggs.set(cid, agg);
      } else if (inPrior) {
        totalRevPrior += rev;
        agg.revenue12mPrior += rev;
        aggs.set(cid, agg);
      }
    }


    // Pro-rata fraction for YTD prior (samme udregning som totals nedenfor)
    const _today = new Date();
    const _isCurMonth =
      _today.getUTCFullYear() === refYear && _today.getUTCMonth() + 1 === refMonth;
    const _daysInMonth = new Date(Date.UTC(refYear, refMonth, 0)).getUTCDate();
    const ytdFraction = _isCurMonth
      ? Math.min(_today.getUTCDate(), _daysInMonth) / _daysInMonth
      : 1;


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
        revenueYtd: agg?.revenueYtd ?? 0,
        revenueYtdPriorSamePeriod:
          (agg?.revenueYtdPrior ?? 0) - (agg?.ytdPriorLastMonthRev ?? 0) * (1 - ytdFraction),

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
      revenueYtd: c.revenueYtd,
      revenueYtdPriorSamePeriod: c.revenueYtdPriorSamePeriod,
      contribution12m: c.contribution12m,

      last_consumable_sales_date: c.last_consumable_sales_date,
      supplied_via_name: c.supplied_via_name,
      supplied_via_id: c.supplied_via_id,
      employees: c.employees,
      ratio: c.employees && c.employees > 0 ? c.revenue12m / c.employees : null,
    });

    const topRevenue = [...companies]
      .filter((c) => c.revenueYtd > 0)
      .sort((a, b) => b.revenueYtd - a.revenueYtd)
      .slice(0, 25)
      .map(toRanking);

    const activeCompanies = companies.filter((c) => c.customer_type === "aktiv_kunde");
    const bottomRevenueActive = [...activeCompanies]
      .filter((c) => c.revenueYtd > 0)
      .sort((a, b) => a.revenueYtd - b.revenueYtd)
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

    // --- Lag 3: Muligheder & trusler ---
    // Per-company product-group set and consumable revenue in last 12 months
    const groupsByCompany = new Map<string, Set<string>>();
    const consumableRev = new Map<string, number>();
    for (const r of salesRows) {
      const cid = r.company_id as string;
      if (!cid) continue;
      const period = r.period as string;
      if (!(period >= startCur && period <= thisMonth)) continue;
      const raw = (r.product_group_1 ?? "").trim();
      const m = raw.match(/^(\d+)/);
      const code = m ? m[1] : null;
      if (code) {
        let s = groupsByCompany.get(cid);
        if (!s) { s = new Set(); groupsByCompany.set(cid, s); }
        s.add(code);
        if (code === "2" || code === "4" || code === "6" || code === "10") {
          consumableRev.set(cid, (consumableRev.get(cid) ?? 0) + (Number(r.revenue) || 0));
        }
      }
    }

    const blankSignal = (c: PortfolioCompanyRow): SignalRow => ({
      id: c.id,
      name: c.name,
      city: c.city,
      revenue12m: c.revenue12m,
      revenue12mPrior: c.revenue12mPrior,
      daysSinceConsumable: null,
      consumableAvgPerMonth: null,
      missingGroups: [],
      growthPct: null,
      expiresAt: null,
      expiryLabel: null,
      expirySubtitle: null,
    });

    // 1) Maskine men ingen kaffe
    const machineNoCoffee: SignalRow[] = companies
      .filter((c) =>
        c.customer_type === "aktiv_kunde" &&
        c.has_active_equipment &&
        !c.supplied_via_id,
      )
      .map((c) => {
        const last = c.last_consumable_sales_date;
        const days = last
          ? Math.floor((todayMs - new Date(last + "T00:00:00Z").getTime()) / 86400000)
          : null;
        return { c, days };
      })
      .filter(({ days }) => days === null || days > 60)
      .map(({ c, days }) => ({
        ...blankSignal(c),
        daysSinceConsumable: days,
        consumableAvgPerMonth: (consumableRev.get(c.id) ?? 0) / 12,
      }))
      .sort((a, b) => (b.daysSinceConsumable ?? 99999) - (a.daysSinceConsumable ?? 99999));

    // 2) White space — køber kaffe men mangler te/chokolade/automat
    const COMPLEMENT_LABEL: Record<string, string> = {
      "4": "Te",
      "10": "Chokolade",
      "6": "Drikke & Automatvarer",
    };
    const whiteSpace: SignalRow[] = companies
      .filter((c) => {
        const s = groupsByCompany.get(c.id);
        return s?.has("2");
      })
      .map((c) => {
        const s = groupsByCompany.get(c.id)!;
        const missing: string[] = [];
        for (const code of ["4", "10", "6"]) {
          if (!s.has(code)) missing.push(COMPLEMENT_LABEL[code]);
        }
        return { ...blankSignal(c), missingGroups: missing };
      })
      .filter((r) => r.missingGroups.length > 0)
      .sort((a, b) => b.revenue12m - a.revenue12m);

    // 3 / 4) I vækst / Faldende
    const withTrend = companies
      .filter((c) => c.revenue12mPrior > 0 && c.revenue12m > 0)
      .map((c) => ({
        ...blankSignal(c),
        growthPct: ((c.revenue12m - c.revenue12mPrior) / c.revenue12mPrior) * 100,
      }));
    const growing = withTrend
      .filter((r) => (r.growthPct ?? 0) > 0)
      .sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0));
    const declining = withTrend
      .filter((r) => (r.growthPct ?? 0) < 0)
      .sort((a, b) => (a.growthPct ?? 0) - (b.growthPct ?? 0));

    // 5 / 6) Udløb inden for 90 dage
    const today = new Date();
    const today_s = today.toISOString().slice(0, 10);
    const in90 = new Date(today);
    in90.setDate(in90.getDate() + 90);
    const in90_s = in90.toISOString().slice(0, 10);
    const compNameById = new Map(companies.map((c) => [c.id, c] as const));

    const docRows = await fetchAllInChunks(companyIds, 200, (slice, from, to) =>
      supabase
        .from("company_documents")
        .select("id, filename, document_type, expires_at, company_id")
        .in("company_id", slice)
        .not("expires_at", "is", null)
        .gte("expires_at", today_s)
        .lte("expires_at", in90_s)
        .order("expires_at", { ascending: true })
        .range(from, to),
    );
    const expiringAgreements: SignalRow[] = (docRows as any[])
      .map((d) => {
        const c = compNameById.get(d.company_id);
        if (!c) return null;
        return {
          ...blankSignal(c),
          expiresAt: d.expires_at as string,
          expiryLabel: (d.filename as string) ?? "Aftale",
          expirySubtitle: (d.document_type as string) ?? null,
        };
      })
      .filter(Boolean) as SignalRow[];

    const compAssRows = await fetchAllInChunks(companyIds, 200, (slice, from, to) =>
      supabase
        .from("competitor_assignments")
        .select("id, contract_expires_at, company_id, competitors(name)")
        .in("company_id", slice)
        .not("contract_expires_at", "is", null)
        .gte("contract_expires_at", today_s)
        .lte("contract_expires_at", in90_s)
        .order("contract_expires_at", { ascending: true })
        .range(from, to),
    );
    const expiringCompetitor: SignalRow[] = (compAssRows as any[])
      .map((r) => {
        const c = compNameById.get(r.company_id);
        if (!c) return null;
        return {
          ...blankSignal(c),
          expiresAt: r.contract_expires_at as string,
          expiryLabel: r.competitors?.name ?? "Konkurrent",
          expirySubtitle: "Konkurrentaftale",
        };
      })
      .filter(Boolean) as SignalRow[];

    return {
      isAdmin,
      appliedSellerId: isAdmin ? appliedSellerId : null,
      sellerOptions,
      totals: (() => {
        // Pro-rata: hvis refPeriod = indeværende måned, reducér sidste års samme måned
        // til samme dag-fraktion. Ellers antages refMonth fuldt indlæst (fraction=1).
        const today = new Date();
        const isCurMonth =
          today.getUTCFullYear() === refYear && today.getUTCMonth() + 1 === refMonth;
        const daysInMonth = new Date(Date.UTC(refYear, refMonth, 0)).getUTCDate();
        const fraction = isCurMonth
          ? Math.min(today.getUTCDate(), daysInMonth) / daysInMonth
          : 1;
        const priorAdj = totalRevYtdPrior - ytdPriorLastMonthRev * (1 - fraction);
        return {
          revenue12m: totalRev12,
          revenue12mPriorYear: totalRevPrior,
          revenueYtd: totalRevYtd,
          revenueYtdPriorSamePeriod: priorAdj,
          ytdLatestPeriod: latestPeriod,
          ytdFraction: fraction,
          contribution12m: isAdmin ? totalContrib : null,
        };
      })(),

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
      signals: {
        machineNoCoffee,
        whiteSpace,
        growing,
        declining,
        expiringAgreements,
        expiringCompetitor,
      },
    };
  });

