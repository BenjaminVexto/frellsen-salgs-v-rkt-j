import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  supabaseAdmin,
  SALES_COLS_BASE,
  SALES_COLS_ADMIN,
  isAdminUser,
  isTeamScopeUser,
  resolveEffectiveUserId,
  fetchAllSalesMonthlyRows,
  fetchAllInChunks,
  stripContribution,
  withContribution,
  getSellerCompanyIds,
  MASKIN_KODER,
  FORBRUG_KODER,
  gruppeKode,
  maanederSiden,
  maskinBucketNavn,
} from "./sales.server";
import { parseProductGroup, isConsumableGroup, type SalesMonthlyRow, type TopProductRow } from "./sales-utils";
import { getCompaniesSuppliedByOthers } from "./relations.functions";


export const getSalesForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => {
    if (!input?.companyId) throw new Error("companyId krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ rows: SalesMonthlyRow[]; isAdmin: boolean; hasActiveEquipment: boolean }> => {
    const isAdmin = await isAdminUser(context.supabase, context.userId);
    const salesClient = isAdmin ? supabaseAdmin : context.supabase;
    const cols = isAdmin ? SALES_COLS_ADMIN : SALES_COLS_BASE;
    const [rows, companyRes] = await Promise.all([
      fetchAllSalesMonthlyRows(async (from, to) => {
        return await salesClient
          .from("sales_monthly")
          .select(cols)
          .eq("company_id", data.companyId)
          .order("period", { ascending: true })
          .order("visma_delivery_no", { ascending: true })
          .order("product_group_1", { ascending: true })
          .range(from, to);
      }),
      context.supabase
        .from("companies")
        .select("has_active_equipment")
        .eq("id", data.companyId)
        .maybeSingle(),
    ]);
    return {
      rows: isAdmin ? withContribution(rows ?? []) : stripContribution(rows ?? []),
      isAdmin,
      hasActiveEquipment: !!(companyRes.data as any)?.has_active_equipment,
    };
  });

export const getSalesForLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { locationId: string }) => {
    if (!input?.locationId) throw new Error("locationId krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ rows: SalesMonthlyRow[]; topProducts: TopProductRow[]; isAdmin: boolean }> => {
    const isAdmin = await isAdminUser(context.supabase, context.userId);
    const salesClient = isAdmin ? supabaseAdmin : context.supabase;
    const cols = isAdmin ? SALES_COLS_ADMIN : SALES_COLS_BASE;
    const [monthlyRes, topRes] = await Promise.all([
      fetchAllSalesMonthlyRows(async (from, to) => {
        return await salesClient
          .from("sales_monthly")
          .select(cols)
          .eq("location_id", data.locationId)
          .order("period", { ascending: true })
          .order("visma_delivery_no", { ascending: true })
          .order("product_group_1", { ascending: true })
          .range(from, to);
      }),
      context.supabase
        .from("sales_top_products")
        .select("visma_delivery_no, location_id, varenr, description, revenue, quantity")
        .eq("location_id", data.locationId)
        .order("revenue", { ascending: false })
        .limit(15),
    ]);
    if (topRes.error) throw topRes.error;
    return {
      rows: isAdmin ? withContribution(monthlyRes ?? []) : stripContribution(monthlyRes ?? []),
      topProducts: (topRes.data ?? []).map((t: any) => ({
        visma_delivery_no: t.visma_delivery_no,
        location_id: t.location_id,
        varenr: t.varenr,
        description: t.description,
        revenue: Number(t.revenue) || 0,
        quantity: Number(t.quantity) || 0,
      })),
      isAdmin,
    };
  });

export type CategoryTopProduct = {
  varenr: string;
  description: string;
  revenue: number;
  quantity: number;
  contribution: number | null;
};

export const getTopProductsForCompanyCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; categoryLabel: string }) => {
    if (!input?.companyId || !input?.categoryLabel) throw new Error("input krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ topProducts: CategoryTopProduct[]; isAdmin: boolean }> => {
    const isAdmin = await isAdminUser(context.supabase, context.userId);
    const { data: locs, error: lerr } = await context.supabase
      .from("locations")
      .select("id")
      .eq("company_id", data.companyId);
    if (lerr) throw lerr;
    const locIds = (locs ?? []).map((l: any) => l.id).filter(Boolean);
    if (!locIds.length) return { topProducts: [], isAdmin };

    const topClient = isAdmin ? supabaseAdmin : context.supabase;
    const topSelect = isAdmin
      ? "varenr, description, revenue, quantity, contribution, product_group_1"
      : "varenr, description, revenue, quantity, product_group_1";
    const rows = await fetchAllInChunks(locIds, 100, (slice, from, to) =>
      topClient
        .from("sales_top_products")
        .select(topSelect)
        .in("location_id", slice)
        .range(from, to),
    );


    const target = data.categoryLabel;
    const filtered = rows.filter((r) => parseProductGroup(r.product_group_1) === target);

    const map = new Map<string, { varenr: string; description: string; revenue: number; quantity: number; contribution: number }>();
    for (const r of filtered) {
      const cur = map.get(r.varenr) ?? { varenr: r.varenr, description: r.description ?? "", revenue: 0, quantity: 0, contribution: 0 };
      cur.revenue += Number(r.revenue) || 0;
      cur.quantity += Number(r.quantity) || 0;
      cur.contribution += Number(r.contribution) || 0;
      if (!cur.description && r.description) cur.description = r.description;
      map.set(r.varenr, cur);
    }
    const top = Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((t) => ({
        varenr: t.varenr,
        description: t.description,
        revenue: t.revenue,
        quantity: t.quantity,
        contribution: isAdmin ? t.contribution : null,
      }));
    return { topProducts: top, isAdmin };
  });


export const getLocationSalesSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { locationIds: string[] }) => {
    if (!Array.isArray(input?.locationIds)) throw new Error("locationIds krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<Record<string, { revenue12m: number; lastPeriod: string | null }>> => {
    if (data.locationIds.length === 0) return {};
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
    cutoff.setUTCDate(1);
    const cutoffStr = `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}-01`;

    const out: Record<string, { revenue12m: number; lastPeriod: string | null }> = {};
    const rows = await fetchAllInChunks(data.locationIds, 100, (slice, from, to) =>
      context.supabase
        .from("sales_monthly")
        .select("location_id, period, revenue")
        .in("location_id", slice)
        .gte("period", cutoffStr)
        .range(from, to),
    );
    rows.forEach((r: any) => {
      if (!r.location_id) return;
      const cur = out[r.location_id] ?? { revenue12m: 0, lastPeriod: null };
      const rev = Number(r.revenue) || 0;
      cur.revenue12m += rev;
      if (rev > 0 && (!cur.lastPeriod || r.period > cur.lastPeriod)) cur.lastPeriod = r.period;
      out[r.location_id] = cur;
    });
    return out;
  });

// --- Seller dashboard ---



export const getMyMonthlySales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { viewAsUserId?: string | null; teamScope?: boolean; afdelingNr?: number | null }) => input ?? {})
  .handler(async ({ data, context }): Promise<{
    revenue: number;
    companies: number;
    period: string;
    revenueLastYear: number;
    periodLastYear: string;
    comparisonMode: "full_month";
  }> => {
    const effectiveUserId = await resolveEffectiveUserId(context.supabase, context.userId, data.viewAsUserId);
    const teamScope =
      !!data.teamScope &&
      !data.viewAsUserId &&
      (await isTeamScopeUser(context.supabase, context.userId));
    const d = new Date();
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const periodLastYear = `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;

    let revenue = 0;
    let revenueLastYear = 0;
    const compsWithSales = new Set<string>();

    if (teamScope) {
      const client = supabaseAdmin;
      const rows = await fetchAllSalesMonthlyRows((from, to) => {
        let q = client
          .from("sales_monthly")
          .select("company_id, period, revenue")
          .in("period", [period, periodLastYear]);
        if (data.afdelingNr != null) q = q.eq("afdeling_nr", data.afdelingNr);
        return q.range(from, to);
      });
      rows.forEach((r: any) => {
        const rev = Number(r.revenue) || 0;
        if (r.period === period) {
          revenue += rev;
          if (r.company_id) compsWithSales.add(r.company_id);
        } else if (r.period === periodLastYear) {
          revenueLastYear += rev;
        }
      });
    } else {
      const companyIds = await getSellerCompanyIds(context.supabase, effectiveUserId, data.afdelingNr ?? null);
      if (!companyIds.length) {
        return { revenue: 0, companies: 0, period, revenueLastYear: 0, periodLastYear, comparisonMode: "full_month" };
      }
      const rows = await fetchAllInChunks(companyIds, 100, (slice, from, to) =>
        context.supabase
          .from("sales_monthly")
          .select("company_id, period, revenue")
          .in("company_id", slice)
          .in("period", [period, periodLastYear])
          .range(from, to),
      );
      rows.forEach((r: any) => {
        const rev = Number(r.revenue) || 0;
        if (r.period === period) {
          revenue += rev;
          if (r.company_id) compsWithSales.add(r.company_id);
        } else if (r.period === periodLastYear) {
          revenueLastYear += rev;
        }
      });
    }

    return {
      revenue,
      companies: compsWithSales.size,
      period,
      revenueLastYear,
      periodLastYear,
      comparisonMode: "full_month",
    };
  });

export const getMyNewActivitiesCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { viewAsUserId?: string | null; teamScope?: boolean; afdelingNr?: number | null }) => input ?? {})
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    const effectiveUserId = await resolveEffectiveUserId(context.supabase, context.userId, data.viewAsUserId);
    const teamScope =
      !!data.teamScope &&
      !data.viewAsUserId &&
      (await isTeamScopeUser(context.supabase, context.userId));
    const d = new Date();
    const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
    let q = context.supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart);
    if (!teamScope) q = q.eq("created_by", effectiveUserId);
    if (data.afdelingNr != null) q = q.eq("afdeling_nr", data.afdelingNr);
    const { count, error } = await q;
    if (error) throw error;
    return { count: count ?? 0 };
  });

export type MonthActivityRow = {
  id: string;
  created_at: string;
  activity_type: string;
  note: string | null;
  company_id: string;
  company_name: string | null;
  created_by: string;
  created_by_name: string | null;
};

/** Samme filter som getMyNewActivitiesCount — blot rækkerne bag tallet. */
export const getMyNewActivitiesList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { viewAsUserId?: string | null; teamScope?: boolean; afdelingNr?: number | null }) => input ?? {})
  .handler(async ({ data, context }): Promise<{ rows: MonthActivityRow[] }> => {
    const effectiveUserId = await resolveEffectiveUserId(context.supabase, context.userId, data.viewAsUserId);
    const teamScope =
      !!data.teamScope &&
      !data.viewAsUserId &&
      (await isTeamScopeUser(context.supabase, context.userId));
    const d = new Date();
    const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
    let q = context.supabase
      .from("activities")
      .select("id, created_at, activity_type, note, company_id, created_by, companies(name)")
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (!teamScope) q = q.eq("created_by", effectiveUserId);
    if (data.afdelingNr != null) q = q.eq("afdeling_nr", data.afdelingNr);
    const { data: rows, error } = await q;
    if (error) throw error;
    const list = (rows ?? []) as any[];

    const userIds = [...new Set(list.map((r) => r.created_by).filter(Boolean))];
    const { data: profs } = userIds.length
      ? await context.supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as any[] };
    const nameById = new Map<string, string>(
      ((profs ?? []) as any[]).map((p) => [p.id as string, p.full_name as string]),
    );

    return {
      rows: list.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        activity_type: r.activity_type,
        note: r.note ?? null,
        company_id: r.company_id,
        company_name: r.companies?.name ?? null,
        created_by: r.created_by,
        created_by_name: nameById.get(r.created_by) ?? null,
      })),
    };
  });





export type ChurningCustomer = {
  company_id: string;
  company_name: string;
  daysSinceLastPurchase: number;
  monthlyAverageRevenue: number;
  monthsWithPurchases: number;
};

// Erstattet af getFaldendeKunder i forbrug-signal.functions.ts. Ingen aktive kaldere.
export const getMyChurningCustomers = createServerFn({ method: "POST" })

  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { viewAsUserId?: string | null; teamScope?: boolean; afdelingNr?: number | null }) => input ?? {})
  .handler(async ({ data, context }): Promise<{ customers: ChurningCustomer[]; hasData: boolean }> => {
    const effectiveUserId = await resolveEffectiveUserId(context.supabase, context.userId, data.viewAsUserId);
    const teamScope =
      !!data.teamScope &&
      !data.viewAsUserId &&
      (await isTeamScopeUser(context.supabase, context.userId));

    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 24);
    cutoff.setUTCDate(1);
    const cutoffStr = `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}-01`;

    type Row = { company_id: string; period: string; revenue: number; product_group_1: string | null };
    let rawRows: any[];
    if (teamScope) {
      rawRows = await fetchAllSalesMonthlyRows((from, to) => {
        let q = supabaseAdmin
          .from("sales_monthly")
          .select("company_id, period, revenue, product_group_1")
          .gte("period", cutoffStr);
        if (data.afdelingNr != null) q = q.eq("afdeling_nr", data.afdelingNr);
        return q.range(from, to);
      });
    } else {
      const companyIds = await getSellerCompanyIds(context.supabase, effectiveUserId, data.afdelingNr ?? null);
      if (!companyIds.length) return { customers: [], hasData: false };
      rawRows = await fetchAllInChunks(companyIds, 100, (slice, from, to) =>
        context.supabase
          .from("sales_monthly")
          .select("company_id, period, revenue, product_group_1")
          .in("company_id", slice)
          .gte("period", cutoffStr)
          .range(from, to),
      );
    }
    const rows: Row[] = rawRows
      .filter((r: any) => r.company_id)
      .map((r: any) => ({
        company_id: r.company_id,
        period: r.period,
        revenue: Number(r.revenue) || 0,
        product_group_1: r.product_group_1 ?? null,
      }));

    if (!rows.length) return { customers: [], hasData: false };


    type Acc = { periods: Set<string>; lastPeriod: string | null; totalRevenue: number };
    const byCompany = new Map<string, Acc>();
    for (const r of rows) {
      if (!isConsumableGroup(r.product_group_1)) continue; // kun kaffe/te/chokolade/drikke tæller
      const acc = byCompany.get(r.company_id) ?? { periods: new Set(), lastPeriod: null, totalRevenue: 0 };
      if (r.revenue > 0) {
        acc.periods.add(r.period);
        acc.totalRevenue += r.revenue;
        if (!acc.lastPeriod || r.period > acc.lastPeriod) acc.lastPeriod = r.period;
      }
      byCompany.set(r.company_id, acc);
    }

    const cutoffDays = 60;
    const now = Date.now();
    const candidates: { company_id: string; lastPeriod: string; daysSinceLastPurchase: number; monthsWithPurchases: number; monthlyAverageRevenue: number }[] = [];
    byCompany.forEach((acc, company_id) => {
      if (!acc.lastPeriod || acc.periods.size < 3) return;
      const last = new Date(acc.lastPeriod + "T00:00:00Z").getTime();
      const days = Math.floor((now - last) / 86400000);
      const monthEnd = new Date(acc.lastPeriod + "T00:00:00Z");
      monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
      const daysSinceMonthEnd = Math.floor((now - monthEnd.getTime()) / 86400000);
      if (daysSinceMonthEnd < cutoffDays) return;
      candidates.push({
        company_id,
        lastPeriod: acc.lastPeriod,
        daysSinceLastPurchase: days,
        monthsWithPurchases: acc.periods.size,
        monthlyAverageRevenue: acc.totalRevenue / acc.periods.size,
      });
    });

    if (!candidates.length) return { customers: [], hasData: true };

    // Filter out dismissed (reset rule: any consumable purchase after dismissal ignores it)
    const candIds = candidates.map((c) => c.company_id);
    const CHUNK = 150;
    const dismissals: any[] = [];
    for (let i = 0; i < candIds.length; i += CHUNK) {
      const slice = candIds.slice(i, i + CHUNK);
      const { data } = await context.supabase
        .from("churn_dismissals")
        .select("company_id, reason, snooze_user_id, snooze_until, created_at")
        .in("company_id", slice);
      if (data) dismissals.push(...data);
    }

    const today = new Date().toISOString().slice(0, 10);
    const dismissedSet = new Set<string>();
    for (const cand of candidates) {
      const lastEndDate = new Date(cand.lastPeriod + "T00:00:00Z");
      lastEndDate.setUTCMonth(lastEndDate.getUTCMonth() + 1);
      const lastEndMs = lastEndDate.getTime();
      const relevant = (dismissals ?? []).filter(
        (d: any) =>
          d.company_id === cand.company_id &&
          new Date(d.created_at).getTime() >= lastEndMs,
      );
      for (const d of relevant) {
        if (d.reason === "paused") {
          if ((teamScope || d.snooze_user_id === effectiveUserId) && d.snooze_until && d.snooze_until >= today) {
            dismissedSet.add(cand.company_id);
            break;
          }
        } else {
          dismissedSet.add(cand.company_id);
          break;
        }
      }
    }

    // Exclude companies that are supplied via another company (kantine-mønster)
    const suppliedSet = await getCompaniesSuppliedByOthers(context.supabase, candIds);

    const filtered = candidates.filter(
      (c) => !dismissedSet.has(c.company_id) && !suppliedSet.has(c.company_id),
    );
    filtered.sort((a, b) => b.monthlyAverageRevenue - a.monthlyAverageRevenue);
    const top = filtered.slice(0, 10);
    if (!top.length) return { customers: [], hasData: true };

    const { data: comps, error: compErr } = await context.supabase
      .from("companies")
      .select("id, name")
      .in("id", top.map((c) => c.company_id));
    if (compErr) throw compErr;
    const nameMap = new Map<string, string>();
    (comps ?? []).forEach((c: any) => nameMap.set(c.id, c.name));

    return {
      customers: top.map((c) => ({
        company_id: c.company_id,
        company_name: nameMap.get(c.company_id) ?? "Ukendt",
        daysSinceLastPurchase: c.daysSinceLastPurchase,
        monthlyAverageRevenue: c.monthlyAverageRevenue,
        monthsWithPurchases: c.monthsWithPurchases,
      })),
      hasData: true,
    };
  });

type DismissReason = "lost_competitor" | "lost_tender" | "closed" | "paused";

export const dismissChurningCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      company_id: string;
      reason: DismissReason;
      competitor_id?: string | null;
      expected_date?: string | null;
      snooze_days?: number | null;
      notes?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const payload: any = {
      company_id: data.company_id,
      reason: data.reason,
      created_by: userId,
      notes: data.notes ?? null,
    };

    if (data.reason === "lost_competitor" || data.reason === "lost_tender") {
      if (!data.competitor_id) throw new Error("Konkurrent skal vælges");
      payload.competitor_id = data.competitor_id;
      payload.expected_date = data.expected_date ?? null;

      const noteText =
        data.reason === "lost_tender"
          ? `Tabt udbud${data.notes ? ` — ${data.notes}` : ""}`
          : `Tabt til konkurrent${data.notes ? ` — ${data.notes}` : ""}`;

      const { data: existing } = await supabase
        .from("competitor_assignments")
        .select("id")
        .eq("company_id", data.company_id)
        .eq("competitor_id", data.competitor_id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("competitor_assignments")
          .update({
            contract_expires_at: data.expected_date ?? null,
            notes: noteText,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("competitor_assignments").insert({
          company_id: data.company_id,
          competitor_id: data.competitor_id,
          contract_expires_at: data.expected_date ?? null,
          registered_by: userId,
          notes: noteText,
        });
      }
    } else if (data.reason === "paused") {
      const days = data.snooze_days ?? 30;
      const until = new Date();
      until.setDate(until.getDate() + days);
      payload.snooze_user_id = userId;
      payload.snooze_until = until.toISOString().slice(0, 10);
    }

    const { error } = await supabase.from("churn_dismissals").insert(payload);
    if (error) throw error;
    return { ok: true };
  });

export const listCompetitorsForSelect = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("competitors")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) throw error;
    return { competitors: (data ?? []) as { id: string; name: string }[] };
  });

export type MonthlyTopProduct = {
  varenr: string;
  description: string | null;
  revenue: number;
  quantity: number;
  product_group_1: string | null;
};

export const getMonthlyTopProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { locationIds: string[]; period: string }) => {
    if (!Array.isArray(input?.locationIds)) throw new Error("locationIds krævet");
    if (!input?.period) throw new Error("period krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<MonthlyTopProduct[]> => {
    if (!data.locationIds.length) return [];
    const { data: rows, error } = await context.supabase
      .from("sales_monthly_products")
      .select("varenr, description, revenue, quantity, product_group_1")
      .in("location_id", data.locationIds)
      .eq("period", data.period)
      .order("revenue", { ascending: false })
      .limit(15);
    if (error) throw error;
    return (rows ?? []).map((r: any) => ({
      varenr: r.varenr,
      description: r.description,
      revenue: Number(r.revenue) || 0,
      quantity: Number(r.quantity) || 0,
      product_group_1: r.product_group_1,
    }));
  });

export type MonthlyConsumableProduct = {
  varenr: string;
  description: string | null;
  revenue: number;
  quantity: number;
  weightKg: number;
};

/** Varelinjer for én måned, kun forbrugsvarer, sorteret efter kilo faldende. */
export const getMonthlyConsumableProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { locationIds: string[]; period: string }) => {
    if (!Array.isArray(input?.locationIds)) throw new Error("locationIds krævet");
    if (!input?.period) throw new Error("period krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<MonthlyConsumableProduct[]> => {
    if (!data.locationIds.length) return [];
    const { data: rows, error } = await context.supabase
      .from("sales_monthly_products")
      .select("varenr, description, revenue, quantity, weight_kg, product_group_1")
      .in("location_id", data.locationIds)
      .eq("period", data.period);
    if (error) throw error;
    const acc = new Map<string, MonthlyConsumableProduct>();
    for (const r of (rows ?? []) as any[]) {
      const kode = gruppeKode(r.product_group_1);
      if (!kode || !FORBRUG_KODER.has(kode)) continue;
      const cur =
        acc.get(r.varenr) ??
        { varenr: r.varenr, description: r.description ?? null, revenue: 0, quantity: 0, weightKg: 0 };
      cur.revenue += Number(r.revenue) || 0;
      cur.quantity += Number(r.quantity) || 0;
      cur.weightKg += Number(r.weight_kg) || 0;
      if (!cur.description && r.description) cur.description = r.description;
      acc.set(r.varenr, cur);
    }
    return Array.from(acc.values()).sort(
      (a, b) => b.weightKg - a.weightKg || b.revenue - a.revenue,
    );
  });

export type SortimentTal = { nu: number; foer: number };

export type UdviklingDetaljer = {
  vindueNuFra: string;
  vindueFoerFra: string;
  sortimentForbrug: SortimentTal;
  sortimentMaskine: SortimentTal;
  /** Er året-før-vinduet faktisk dækket af varelinje-data? Ellers må der ikke sammenlignes. */
  foerDaekket: boolean;
  /** Fordeling inden for maskiner/teknik, baseret på registrerede varelinjer. */
  maskinBuckets: { navn: string; revenue: number; contribution: number | null }[];
  /** Varegruppekode → navn (produktgruppe_rolle). */
  gruppeNavne: Record<string, string>;
  isAdmin: boolean;
};

/** Sortimentsbredde (6 hele mdr. mod samme 6 mdr. året før) + maskin/teknik-fordeling. */
export const getUdviklingDetaljer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => {
    if (!input?.companyId) throw new Error("companyId krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<UdviklingDetaljer> => {
    const isAdmin = await isAdminUser(context.supabase, context.userId);
    const { data: locs, error: lerr } = await context.supabase
      .from("locations")
      .select("id")
      .eq("company_id", data.companyId);
    if (lerr) throw lerr;
    const locIds = (locs ?? []).map((l: any) => l.id).filter(Boolean);

    const nuFra = maanederSiden(6);
    const nuTil = maanederSiden(0);
    const foerFra = maanederSiden(18);
    const foerTil = maanederSiden(12);

    // Varelinje-historikken starter senere end salgshistorikken. Uden data i hele
    // året-før-vinduet må der ikke vises en sammenligning.
    const [{ data: minRow }, { data: roller }] = await Promise.all([
      context.supabase
        .from("sales_monthly_products")
        .select("period")
        .order("period", { ascending: true })
        .limit(1)
        .maybeSingle(),
      context.supabase.from("produktgruppe_rolle" as any).select("product_group_1, navn"),
    ]);
    const foerDaekket = !!minRow?.period && String(minRow.period).slice(0, 10) <= foerFra;
    const gruppeNavne: Record<string, string> = {};
    (roller ?? []).forEach((r: any) => {
      if (r?.product_group_1 && r?.navn) gruppeNavne[String(r.product_group_1)] = String(r.navn);
    });

    const empty: UdviklingDetaljer = {
      vindueNuFra: nuFra,
      vindueFoerFra: foerFra,
      sortimentForbrug: { nu: 0, foer: 0 },
      sortimentMaskine: { nu: 0, foer: 0 },
      foerDaekket,
      maskinBuckets: [],
      gruppeNavne,
      isAdmin,
    };
    if (!locIds.length) return empty;

    const client = isAdmin ? supabaseAdmin : context.supabase;
    const cols = isAdmin
      ? "period, varenr, description, product_group_1, revenue, contribution"
      : "period, varenr, description, product_group_1, revenue";
    const rows = await fetchAllInChunks(locIds, 100, (slice, from, to) =>
      client
        .from("sales_monthly_products")
        .select(cols)
        .in("location_id", slice)
        .gte("period", foerFra)
        .lt("period", nuTil)
        .range(from, to),
    );

    const set = { fNu: new Set<string>(), fFoer: new Set<string>(), mNu: new Set<string>(), mFoer: new Set<string>() };
    const buckets = new Map<string, { revenue: number; contribution: number }>();
    const addBucket = (navn: string, rev: number, db: number) => {
      const cur = buckets.get(navn) ?? { revenue: 0, contribution: 0 };
      cur.revenue += rev;
      cur.contribution += db;
      buckets.set(navn, cur);
    };

    for (const r of rows) {
      const period = String(r.period);
      const kode = gruppeKode(r.product_group_1);
      const iNu = period >= nuFra && period < nuTil;
      const iFoer = period >= foerFra && period < foerTil;
      if (kode && FORBRUG_KODER.has(kode)) {
        if (iNu) set.fNu.add(r.varenr);
        if (iFoer) set.fFoer.add(r.varenr);
      } else if (kode && MASKIN_KODER.has(kode)) {
        if (iNu) set.mNu.add(r.varenr);
        if (iFoer) set.mFoer.add(r.varenr);
      }

      // Maskin/teknik-fordeling: seneste 12 hele måneder
      if (kode && MASKIN_KODER.has(kode) && period >= maanederSiden(12) && period < nuTil) {
        const rev = Number(r.revenue) || 0;
        const db = isAdmin ? Number((r as any).contribution) || 0 : 0;
        addBucket(maskinBucketNavn(kode, r.description), rev, db);
      }
    }

    return {
      vindueNuFra: nuFra,
      vindueFoerFra: foerFra,
      sortimentForbrug: { nu: set.fNu.size, foer: set.fFoer.size },
      sortimentMaskine: { nu: set.mNu.size, foer: set.mFoer.size },
      foerDaekket,
      maskinBuckets: Array.from(buckets.entries())
        .map(([navn, v]) => ({ navn, revenue: v.revenue, contribution: isAdmin ? v.contribution : null }))
        .sort((a, b) => b.revenue - a.revenue),
      gruppeNavne,
      isAdmin,
    };
  });
