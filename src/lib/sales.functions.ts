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
  .handler(async ({ data, context }): Promise<{ rows: SalesMonthlyRow[]; isAdmin: boolean; hasActiveEquipment: boolean; gruppeNavne: Record<string, string> }> => {
    const isAdmin = await isAdminUser(context.supabase, context.userId);
    const [aggRes, companyRes, rolleRes] = await Promise.all([
      (context.supabase as any).rpc("company_group_monthly", { _company_id: data.companyId }),
      context.supabase
        .from("companies")
        .select("has_active_equipment, afdeling_nr")
        .eq("id", data.companyId)
        .maybeSingle(),
      context.supabase.from("produktgruppe_rolle" as any).select("product_group_1, navn"),
    ]);
    if (aggRes.error) throw aggRes.error;
    const rows: SalesMonthlyRow[] = ((aggRes.data as any[]) ?? []).map((r: any) => ({
      visma_delivery_no: "",
      location_id: null,
      company_id: data.companyId,
      period: String(r.period).slice(0, 10),
      last_invoice_date: r.last_invoice_date ? String(r.last_invoice_date).slice(0, 10) : null,
      product_group_1: r.product_group_1,
      revenue: Number(r.revenue) || 0,
      quantity: Number(r.quantity) || 0,
      weight_kg: Number(r.weight_kg) || 0,
      contribution: r.contribution == null ? null : Number(r.contribution) || 0,
      order_count: Number(r.order_count) || 0,
    }));

    const gruppeNavne: Record<string, string> = {};
    ((rolleRes as any).data ?? []).forEach((r: any) => {
      if (r?.product_group_1 && r?.navn) gruppeNavne[String(r.product_group_1)] = String(r.navn);
    });
    const afdNr = (companyRes.data as any)?.afdeling_nr;
    if (afdNr != null) {
      const { data: lokale } = await context.supabase
        .from("produktgruppe_navn" as any)
        .select("product_group_1, navn")
        .eq("afdeling_nr", afdNr);
      ((lokale as any[]) ?? []).forEach((r: any) => {
        if (r?.product_group_1 && r?.navn) gruppeNavne[String(r.product_group_1)] = String(r.navn);
      });
    }
    return {
      rows: isAdmin ? withContribution(rows ?? []) : stripContribution(rows ?? []),
      isAdmin,
      hasActiveEquipment: !!(companyRes.data as any)?.has_active_equipment,
      gruppeNavne,
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
  .handler(async ({ data, context }): Promise<Record<string, { revenue12m: number; lastPeriod: string | null; lastPurchase: string | null }>> => {
    if (data.locationIds.length === 0) return {};
    // Summeringen sker i databasen (SECURITY INVOKER, så RLS/afdelingsadgang gælder).
    const { data: rows, error } = await (context.supabase as any).rpc("location_sales_summary", {
      _location_ids: data.locationIds,
    });
    if (error) throw error;
    const out: Record<string, { revenue12m: number; lastPeriod: string | null; lastPurchase: string | null }> = {};
    ((rows ?? []) as any[]).forEach((r) => {
      if (!r.location_id) return;
      out[r.location_id] = {
        revenue12m: Number(r.revenue_12m) || 0,
        lastPeriod: r.last_period ?? null,
        lastPurchase: r.last_purchase ?? null,
      };
    });
    return out;
  });

// Omsætning 12 mdr. + sidste køb pr. company_id (samme kilde som fanen "Salg").
// companies.turnover_12m er tom og bruges ikke.
export const getCompanySalesSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyIds: string[] }) => {
    if (!Array.isArray(input?.companyIds)) throw new Error("companyIds krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<Record<string, { revenue12m: number; lastPurchase: string | null }>> => {
    if (data.companyIds.length === 0) return {};
    const { data: rows, error } = await (context.supabase as any).rpc("company_sales_summary", {
      _company_ids: data.companyIds,
    });
    if (error) throw error;
    const out: Record<string, { revenue12m: number; lastPurchase: string | null }> = {};
    ((rows ?? []) as any[]).forEach((r) => {
      if (!r.company_id) return;
      out[r.company_id] = {
        revenue12m: Number(r.revenue_12m) || 0,
        lastPurchase: r.last_purchase ?? null,
      };
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
    let companies = 0;

    // Summeringen sker i databasen. Funktionen er SECURITY INVOKER, så en sælger
    // kun kan se egne afdelinger; team-scope bruger som før admin-klienten.
    let rpcRes: any;
    if (teamScope) {
      rpcRes = await (supabaseAdmin as any).rpc("monthly_revenue_totals", {
        _periods: [period, periodLastYear],
        _afdeling_nr: data.afdelingNr ?? null,
        _company_ids: null,
      });
    } else {
      const companyIds = await getSellerCompanyIds(context.supabase, effectiveUserId, data.afdelingNr ?? null);
      if (!companyIds.length) {
        return { revenue: 0, companies: 0, period, revenueLastYear: 0, periodLastYear, comparisonMode: "full_month" };
      }
      rpcRes = await (context.supabase as any).rpc("monthly_revenue_totals", {
        _periods: [period, periodLastYear],
        _afdeling_nr: null,
        _company_ids: companyIds,
      });
    }
    if (rpcRes.error) throw rpcRes.error;
    ((rpcRes.data ?? []) as any[]).forEach((r) => {
      const rev = Number(r.revenue) || 0;
      if (r.period === period) {
        revenue += rev;
        companies = Number(r.companies_with_sales) || 0;
      } else if (r.period === periodLastYear) {
        revenueLastYear += rev;
      }
    });


    return {
      revenue,
      companies,
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

/** Samme filter som getMyNewActivitiesCount — blot rækkerne bag tallet. Paget. */
export const getMyNewActivitiesList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { viewAsUserId?: string | null; teamScope?: boolean; afdelingNr?: number | null; offset?: number; limit?: number }) => input ?? {})
  .handler(async ({ data, context }): Promise<{ rows: MonthActivityRow[]; nextOffset: number | null }> => {
    const effectiveUserId = await resolveEffectiveUserId(context.supabase, context.userId, data.viewAsUserId);
    const teamScope =
      !!data.teamScope &&
      !data.viewAsUserId &&
      (await isTeamScopeUser(context.supabase, context.userId));
    const offset = Math.max(0, Number(data.offset) || 0);
    const limit = Math.min(100, Math.max(1, Number(data.limit) || 100));
    const d = new Date();
    const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
    let q = context.supabase
      .from("activities")
      .select(
        "id, created_at, activity_type, note, company_id, created_by, companies(name), profiles!activities_created_by_profiles_fkey(full_name)",
      )
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (!teamScope) q = q.eq("created_by", effectiveUserId);
    if (data.afdelingNr != null) q = q.eq("afdeling_nr", data.afdelingNr);
    const { data: rows, error } = await q;
    if (error) throw error;
    const list = (rows ?? []) as any[];

    return {
      rows: list.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        activity_type: r.activity_type,
        note: r.note ?? null,
        company_id: r.company_id,
        company_name: r.companies?.name ?? null,
        created_by: r.created_by,
        created_by_name: r.profiles?.full_name ?? null,
      })),
      nextOffset: list.length === limit ? offset + limit : null,
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

/** Varelinjer for én måned. Filtreres og sorteres efter den valgte enhed. */
export const getMonthlyConsumableProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      locationIds: string[];
      period: string;
      gruppeKode?: string | null;
      enhed?: "kg" | "kr";
    }) => {
      if (!Array.isArray(input?.locationIds)) throw new Error("locationIds krævet");
      if (!input?.period) throw new Error("period krævet");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<MonthlyConsumableProduct[]> => {
    if (!data.locationIds.length) return [];
    const { data: rows, error } = await context.supabase
      .from("sales_monthly_products")
      .select("varenr, description, revenue, quantity, weight_kg, product_group_1")
      .in("location_id", data.locationIds)
      .eq("period", data.period);
    if (error) throw error;
    const filterKode = data.gruppeKode ?? null;
    const enhed = data.enhed === "kg" ? "kg" : "kr";
    const acc = new Map<string, MonthlyConsumableProduct>();
    for (const r of (rows ?? []) as any[]) {
      const kode = gruppeKode(r.product_group_1);
      if (!kode) continue;
      if (filterKode ? kode !== filterKode : !FORBRUG_KODER.has(kode)) continue;
      const cur =
        acc.get(r.varenr) ??
        { varenr: r.varenr, description: r.description ?? null, revenue: 0, quantity: 0, weightKg: 0 };
      cur.revenue += Number(r.revenue) || 0;
      cur.quantity += Number(r.quantity) || 0;
      cur.weightKg += Number(r.weight_kg) || 0;
      if (!cur.description && r.description) cur.description = r.description;
      acc.set(r.varenr, cur);
    }
    return Array.from(acc.values())
      .filter((v) => (enhed === "kg" ? v.weightKg > 0 : v.revenue !== 0))
      .sort((a, b) =>
        enhed === "kg"
          ? b.weightKg - a.weightKg || b.revenue - a.revenue
          : b.revenue - a.revenue || b.weightKg - a.weightKg,
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
  /** Tidligste måned med varelinje-detalje (YYYY-MM-01), null hvis ingen. */
  varelinjeStart: string | null;
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
    const { data: firma } = await context.supabase
      .from("companies")
      .select("afdeling_nr")
      .eq("id", data.companyId)
      .maybeSingle();

    const [{ data: minRow }, { data: roller }, { data: afdNavne }] = await Promise.all([
      context.supabase
        .from("sales_monthly_products")
        .select("period")
        .order("period", { ascending: true })
        .limit(1)
        .maybeSingle(),
      context.supabase.from("produktgruppe_rolle" as any).select("product_group_1, navn"),
      firma?.afdeling_nr != null
        ? context.supabase
            .from("produktgruppe_navn" as any)
            .select("product_group_1, navn")
            .eq("afdeling_nr", firma.afdeling_nr)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const varelinjeStart = minRow?.period ? String(minRow.period).slice(0, 10) : null;
    const foerDaekket = !!varelinjeStart && varelinjeStart <= foerFra;
    const gruppeNavne: Record<string, string> = {};
    (roller ?? []).forEach((r: any) => {
      if (r?.product_group_1 && r?.navn) gruppeNavne[String(r.product_group_1)] = String(r.navn);
    });
    // Afdelingsspecifikke navne vinder over de globale
    (afdNavne ?? []).forEach((r: any) => {
      if (r?.product_group_1 && r?.navn) gruppeNavne[String(r.product_group_1)] = String(r.navn);
    });

    const empty: UdviklingDetaljer = {
      vindueNuFra: nuFra,
      vindueFoerFra: foerFra,
      sortimentForbrug: { nu: 0, foer: 0 },
      sortimentMaskine: { nu: 0, foer: 0 },
      foerDaekket,
      varelinjeStart,
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
      varelinjeStart,
      maskinBuckets: Array.from(buckets.entries())
        .map(([navn, v]) => ({ navn, revenue: v.revenue, contribution: isAdmin ? v.contribution : null }))
        .sort((a, b) => b.revenue - a.revenue),
      gruppeNavne,
      isAdmin,
    };
  });
