import { createServerFn } from "@tanstack/react-start";
import { harGyldigtSammenligningsvindue } from "./kunde-status";
import { erFalder, erVokser } from "./fald";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  sektor: "privat" | "offentlig" | "intern";
  assigned_to: string | null;
  saelger_navn: string | null;
  /** Antal lokationer hos den valgte sælger (eller alle) og i alt (i Aktør). */
  lok_antal: number;
  lok_total: number;
  kreditspaerret: boolean;
  /** Virksomhedens og lokationernes adresser (til søgning). */
  address: string | null;
  zip: string | null;
  /** Forbrugsvarer (samme grupper som kundestatus) 12 hele mdr. og de 12 før. */
  forbrug12m: number;
  forbrug12mPrior: number;
  /** Forbruget er faldet: 12 hele mdr. mod de 12 før, kun forbrugsvarer. */
  falder: boolean;
  vokser: boolean;
  /** Forventet køb er overskredet (rytme). */
  overRytme: boolean;
  /** Manuel markering "Stoppet". stopSkjult = holdes ude af sovende/fald/Sælg mere lige nu. */
  stoppet: boolean;
  stopSkjult: boolean;
  stopAarsag: string | null;
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
  sektor: "privat" | "offentlig" | "intern";
};

export type VindTilbageRow = {
  stop_id: string;
  company_id: string;
  company_name: string;
  location_id: string | null;
  lokation: string | null;
  konkurrent: string | null;
  udloeber: string | null;
  vind_dato: string;
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
    weightKgYtd: number;
    weightKgYtdPriorSamePeriod: number;
    ytdLatestPeriod: string | null;
    ytdFraction: number;
    contribution12m: number | null;
  };

  statusCounts: {
    aktive: number;
    sovende: number;
    servicekunder: number;
    paaVejVaek: number;
    total: number;
  };
  // Deterministisk re-evaluering for 30 dage siden (samme 12/24-mdr-vinduer,
  // eval-dato skubbet 30 dage tilbage). Bruges til "↑/↓ X siden sidst".
  senesteFakturadato?: string | null;
  statusCountsPrior: {
    aktive: number;
    sovende: number;
    servicekunder: number;
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
    vindTilbage: VindTilbageRow[];
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
  // afdelingNr er et rent kosmetisk filter fra afdelingsvælgeren — den rigtige
  // adgangskontrol ligger i RLS/my_afdelinger().
  .inputValidator((input: { sellerId?: string | null; afdelingNr?: number | null }) => input ?? {})
  .handler(async ({ data, context }): Promise<string> => JSON.stringify(await (async (): Promise<PortfolioPayload> => {
    const { supabase, userId } = context;
    const isAdmin = await isAdminUser(supabase, userId);
    const { data: seDbRes } = await (supabase as any).rpc("maa_se_db", { _user_id: userId });
    const seDb = isAdmin || seDbRes === true;

    // Seller options for admin
    let sellerOptions: { id: string; name: string }[] = [];
    let maaSeAnalyse = false;
    if (!isAdmin) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("maa_se_analyse")
        .eq("id", userId)
        .maybeSingle();
      maaSeAnalyse = (prof as any)?.maa_se_analyse === true;
    }
    let erSalgssupport = false;
    if (!isAdmin) {
      const { data: ss } = await supabase
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "salgssupport").maybeSingle();
      erSalgssupport = !!ss;
    }
    if (isAdmin || erSalgssupport) {
      // Rolle-/profil-rækker for andre brugere er ikke læsbare for ikke-admins
      // via RLS, så listen hentes server-side — begrænset til sælgere i
      // brugerens egne afdelinger (my_afdelinger()).
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: mine } = await supabase.rpc("my_afdelinger");
      const mineAfd = Array.isArray(mine) ? (mine as number[]) : [];
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "saelger");
      let ids = (roles ?? []).map((r: any) => r.user_id as string);
      if (!isAdmin && ids.length) {
        const [{ data: acc }, { data: prim }] = await Promise.all([
          supabaseAdmin.from("user_afdeling_access").select("user_id").in("user_id", ids).in("afdeling_nr", mineAfd.length ? mineAfd : [-1]),
          supabaseAdmin.from("profiles").select("id").in("id", ids).in("primary_afdeling_nr", mineAfd.length ? mineAfd : [-1]),
        ]);
        const ok = new Set<string>([
          ...(acc ?? []).map((r: any) => r.user_id),
          ...(prim ?? []).map((r: any) => r.id),
        ]);
        ids = ids.filter((id) => ok.has(id));
      }
      if (ids.length) {
        const { data: profs } = await supabaseAdmin
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

    // Salgssupport må følge en valgt sælger (kun sælgere fra listen).
    const appliedSellerId: string | null = isAdmin
      ? (data.sellerId ?? null) // null = alle sælgere
      : erSalgssupport
        ? (data.sellerId && sellerOptions.some((o) => o.id === data.sellerId) ? data.sellerId : null)
        : userId;

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

    // 12-month prior year window (bruges til datagulv for growthPct)
    const startPrior = shiftMonths(thisMonth, -23);

    const emptyRankings = {
      topRevenue: [] as RankingRow[],
      topDecliners: [] as RankingRow[],
      topGrowers: [] as RankingRow[],
      topContribution: seDb ? ([] as RankingRow[]) : null,
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
      vindTilbage: [] as VindTilbageRow[],
    };

    // --- Aggregering sker i databasen: én række pr. virksomhed + én totalrække. ---
    const rpcArgs = {
      _saelger: appliedSellerId,
      _afdeling_nr: data.afdelingNr ?? null,
    };
    // Ét kald hver: aggregatet leveres som JSON, så 1.000-rækkegrænsen ikke
    // tvinger funktionen til at køre om for hver side.
    const [aggSvar, totSvar, refSvar, faldSvar] = await Promise.all([
      (supabase as any).rpc("portfolio_aggregat_json", rpcArgs),
      (supabase as any).rpc("portfolio_totaler", rpcArgs),
      (supabase as any).rpc("seneste_fakturadato"),
      (supabase as any).from("fald_indstilling").select("min_fald_pct, min_fald_kr").maybeSingle(),
    ]);
    const senesteFakturadato: string | null = (refSvar?.data as string | null) ?? null;
    const faldMinPct = Number(faldSvar?.data?.min_fald_pct ?? 20);
    const faldMinKr = Number(faldSvar?.data?.min_fald_kr ?? 5000);
    if (aggSvar.error) throw aggSvar.error;
    if (totSvar.error) throw totSvar.error;
    const aggRows: any[] = (aggSvar.data ?? []) as any[];
    const totRows = totSvar.data;
    const tot = (Array.isArray(totRows) ? totRows[0] : totRows) ?? null;

    if (!aggRows.length) {
      return {
        isAdmin,
        appliedSellerId: isAdmin || erSalgssupport ? appliedSellerId : null,
        sellerOptions,
        totals: {
          revenue12m: 0,
          revenue12mPriorYear: 0,
          revenueYtd: 0,
          revenueYtdPriorSamePeriod: 0,
          weightKgYtd: 0,
          weightKgYtdPriorSamePeriod: 0,
          ytdLatestPeriod: null,
          ytdFraction: 1,
          contribution12m: seDb ? 0 : null,
        },

        statusCounts: { aktive: 0, sovende: 0, servicekunder: 0, paaVejVaek: 0, total: 0 },
        statusCountsPrior: { aktive: 0, sovende: 0, servicekunder: 0, paaVejVaek: 0 },
        monthLabels,
        companies: [],
        rankings: emptyRankings,
        signals: emptySignals,
      };
    }

    const companyIdSet = new Set<string>(aggRows.map((r) => r.id as string));

    // "Forventet køb er overskredet" (companies.over_rytme) — grundlag for "På vej væk".
    const overRytmeSet = new Set<string>();
    {
      const ids = Array.from(companyIdSet);
      const svar = await Promise.all(
        Array.from({ length: Math.ceil(ids.length / 300) }, (_, i) =>
          (supabase as any).from("companies").select("id").eq("over_rytme", true).in("id", ids.slice(i * 300, i * 300 + 300)),
        ),
      );
      for (const r of svar) for (const x of (r.data ?? []) as any[]) overRytmeSet.add(x.id);
    }

    // Forsyningsrelationer (forsynes_af) — få rækker i alt, hentes i ét kald.
    const relRows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await supabase
        .from("company_relations")
        .select("from_company_id, to:companies!company_relations_to_company_id_fkey(id, name)")
        .eq("relation_type", "forsynes_af")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const arr = (page ?? []) as any[];
      relRows.push(...arr);
      if (arr.length < PAGE) break;
    }
    const suppliedMap = new Map<string, { id: string; name: string }>();
    for (const r of relRows) {
      if (r.to && companyIdSet.has(r.from_company_id)) {
        suppliedMap.set(r.from_company_id, { id: r.to.id, name: r.to.name });
      }
    }

    // Pr-kunde aggregater fra databasen
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
    const consPeriodsByCompany = new Map<string, Set<string>>();
    const lastSalesNow = new Map<string, string>();
    const lastSalesPrior = new Map<string, string>();
    const lastConsNow = new Map<string, string>();
    const lastConsPrior = new Map<string, string>();
    const groupsByCompany = new Map<string, Set<string>>();
    const consumableRev = new Map<string, number>();
    const compsMeta = aggRows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      city: r.city ?? null,
      customer_type: r.customer_type ?? null,
      has_active_equipment: !!r.has_active_equipment,
      last_consumable_sales_date: r.last_consumable_sales_date ?? null,
      last_sales_date: r.last_sales_date ?? null,
      employees: r.employees ?? null,
      is_public: !!r.is_public,
      sektor: (r.sektor ?? "privat") as "privat" | "offentlig" | "intern",
      assigned_to: (r.assigned_to ?? null) as string | null,
      saelger_navn: (r.saelger_navn ?? null) as string | null,
      lok_antal: Number(r.lok_antal ?? 0),
      lok_total: Number(r.lok_total ?? 0),
      kreditspaerret: !!r.kreditspaerret,
      address: (r.address ?? null) as string | null,
      zip: (r.zip ?? null) as string | null,
      forbrug12m: Number(r.forbrug12m) || 0,
      forbrug12mPrior: Number(r.forbrug12m_prior) || 0,
      stoppet: !!r.stoppet,
      stopSkjult: !!r.stop_skjult,
      stopAarsag: (r.stop_aarsag ?? null) as string | null,
    }));

    for (const r of aggRows) {
      const cid = r.id as string;
      const monthly = new Map<string, number>();
      const arr = (r.monthly ?? []) as any[];
      last5.forEach((p, i) => monthly.set(p, Number(arr[i]) || 0));
      aggs.set(cid, {
        monthly,
        revenue12m: Number(r.revenue12m) || 0,
        revenue12mPrior: Number(r.revenue12m_prior) || 0,
        contribution12m: Number(r.contribution12m) || 0,
        revenueYtd: Number(r.revenue_ytd) || 0,
        revenueYtdPrior: Number(r.revenue_ytd_prior) || 0,
        ytdPriorLastMonthRev: Number(r.ytd_prior_last_month_rev) || 0,
      });
      const cons = (r.cons_perioder ?? []) as string[];
      if (cons.length) consPeriodsByCompany.set(cid, new Set(cons));
      const grupper = (r.vare_grupper ?? []) as string[];
      if (grupper.length) groupsByCompany.set(cid, new Set(grupper));
      consumableRev.set(cid, Number(r.consumable_rev12m) || 0);
      if (r.last_sales_now) lastSalesNow.set(cid, r.last_sales_now as string);
      if (r.last_sales_prior) lastSalesPrior.set(cid, r.last_sales_prior as string);
      if (r.last_cons_now) lastConsNow.set(cid, r.last_cons_now as string);
      if (r.last_cons_prior) lastConsPrior.set(cid, r.last_cons_prior as string);
    }

    // Totaler fra databasen
    const totalRev12 = Number(tot?.revenue12m) || 0;
    const totalRevPrior = Number(tot?.revenue12m_prior_year) || 0;
    const totalRevYtd = Number(tot?.revenue_ytd) || 0;
    const totalRevYtdPrior = Number(tot?.revenue_ytd_prior) || 0;
    const ytdPriorLastMonthRev = Number(tot?.ytd_prior_last_month_rev) || 0;
    const totalWeightKgYtd = Number(tot?.weight_kg_ytd) || 0;
    const totalWeightKgYtdPrior = Number(tot?.weight_kg_ytd_prior) || 0;
    const ytdPriorLastMonthWeightKg = Number(tot?.ytd_prior_last_month_weight_kg) || 0;
    const totalContrib = Number(tot?.contribution12m) || 0;
    const latestPeriod: string | null = (tot?.latest_period as string | null) ?? null;
    const refPeriod = latestPeriod ?? thisMonth;
    const refYear = parseInt(refPeriod.slice(0, 4), 10);
    const refMonth = parseInt(refPeriod.slice(5, 7), 10);


    // Pro-rata fraction for YTD prior (samme udregning som totals nedenfor)
    const _today = new Date();
    const _isCurMonth =
      _today.getUTCFullYear() === refYear && _today.getUTCMonth() + 1 === refMonth;
    const _daysInMonth = new Date(Date.UTC(refYear, refMonth, 0)).getUTCDate();
    const ytdFraction = _isCurMonth
      ? Math.min(_today.getUTCDate(), _daysInMonth) / _daysInMonth
      : 1;


    // --- Rytme + status-snapshot pr. kunde ---
    const ATTENTION_MIN_REV_12M = 25000; // mindst ~25k 12m før trend nedjusterer rytme
    const TREND_DOWN_PCT = -15; // growthPct < -15% = "trendDown"

    const todayMs = Date.now();
    const today = new Date();
    // Referencedato for status og "↑/↓ siden sidst" = seneste fakturadato i data.
    const refDato = senesteFakturadato ? new Date(senesteFakturadato + "T00:00:00Z") : today;
    const evalPrior = new Date(refDato);
    evalPrior.setUTCDate(evalPrior.getUTCDate() - 30);
    const cutoff12Now = new Date(today); cutoff12Now.setUTCMonth(cutoff12Now.getUTCMonth() - 12);
    const cutoff24Now = new Date(today); cutoff24Now.setUTCMonth(cutoff24Now.getUTCMonth() - 24);
    const cutoff12Prior = new Date(evalPrior); cutoff12Prior.setUTCMonth(cutoff12Prior.getUTCMonth() - 12);
    const cutoff24Prior = new Date(evalPrior); cutoff24Prior.setUTCMonth(cutoff24Prior.getUTCMonth() - 24);

    const periodToDate = (p: string) => new Date(p + "T00:00:00Z");
    const parseDate = (s: string | null) => (s ? new Date(s + "T00:00:00Z") : null);

    // Build company rows
    const companies: PortfolioCompanyRow[] = (compsMeta as any[]).map((c) => {
      const agg = aggs.get(c.id);
      const monthly = last5.map((p) => ({ period: p, revenue: agg?.monthly.get(p) ?? 0 }));
      const supplied = suppliedMap.get(c.id) ?? null;
      const revenue12m = agg?.revenue12m ?? 0;
      const revenue12mPrior = agg?.revenue12mPrior ?? 0;

      // growthPct + trendDown
      // Datagulv: en 12-mdr.-sammenligning kræver, at hele år-før-vinduet er
      // dækket af salgshistorik. Ellers vises ingen procent.
      // Fald/vækst måles kun på forbrugsvarer (uden maskiner, leje, service,
      // vandfiltre og reservedele): 12 hele mdr. mod de 12 før.
      const f12 = c.forbrug12m as number;
      const f12p = c.forbrug12mPrior as number;
      const growthPct =
        f12p > 0
          ? ((f12 - f12p) / f12p) * 100
          : null;
      const falder = erFalder(growthPct, f12, f12p, faldMinPct, faldMinKr);
      const vokser = erVokser(f12, f12p, faldMinPct, faldMinKr);
      const trendDown =
        growthPct !== null && growthPct < TREND_DOWN_PCT && revenue12m >= ATTENTION_MIN_REV_12M;

      // Rytme (måneds-opløsning) — kun ud fra consumable-perioder med rev > 0.
      const periods = consPeriodsByCompany.get(c.id);
      let rhythmMonths: number | null = null;
      if (periods && periods.size >= 3) {
        const sorted = Array.from(periods).sort();
        const diffs: number[] = [];
        for (let i = 1; i < sorted.length; i++) {
          diffs.push(monthsBetweenPeriods(sorted[i - 1], sorted[i]));
        }
        rhythmMonths = medianOf(diffs);
        if (rhythmMonths < 1) rhythmMonths = 1; // måneds-opløsning gulvet
      }

      // Måneder siden seneste consumable-køb
      const lastCons = c.last_consumable_sales_date ?? null;
      let monthsSinceConsumable: number | null = null;
      if (lastCons) {
        const d = periodToDate(lastCons);
        monthsSinceConsumable =
          (today.getUTCFullYear() - d.getUTCFullYear()) * 12 +
          (today.getUTCMonth() - d.getUTCMonth());
        if (monthsSinceConsumable < 0) monthsSinceConsumable = 0;
      }

      // Klassifikation: enten rytme-baseret (≥3 aktive måneder) eller fallback 60-d.
      let rhythmClass: RhythmClass;
      if (!lastCons) {
        rhythmClass = "never";
      } else if (rhythmMonths !== null) {
        const ratio = (monthsSinceConsumable ?? 0) / rhythmMonths;
        if (ratio <= 1.5) rhythmClass = "normal";
        else if (ratio <= 2.5) rhythmClass = "slower";
        else rhythmClass = "stopped";
      } else {
        // Fallback: gammel 60-dages-regel
        const days = Math.floor((todayMs - periodToDate(lastCons).getTime()) / 86400000);
        rhythmClass = days <= 60 ? "normal" : days <= 150 ? "slower" : "stopped";
      }

      // Smelt trend ind: faldende kunde må ikke vise grønt.
      if (trendDown) {
        if (rhythmClass === "normal") rhythmClass = "slower";
        else if (rhythmClass === "slower") rhythmClass = "stopped";
      }

      return {
        id: c.id,
        name: c.name,
        city: c.city ?? null,
        customer_type: c.customer_type ?? null,
        has_active_equipment: !!c.has_active_equipment,
        last_consumable_sales_date: lastCons,
        supplied_via_id: supplied?.id ?? null,
        supplied_via_name: supplied?.name ?? null,
        monthly,
        revenue12m,
        revenue12mPrior,
        revenueYtd: agg?.revenueYtd ?? 0,
        revenueYtdPriorSamePeriod:
          (agg?.revenueYtdPrior ?? 0) - (agg?.ytdPriorLastMonthRev ?? 0) * (1 - ytdFraction),
        contribution12m: seDb ? (agg?.contribution12m ?? 0) : null,
        employees: c.employees ?? null,
        is_public: !!c.is_public,
        sektor: c.sektor,
        assigned_to: c.assigned_to,
        saelger_navn: c.saelger_navn,
        lok_antal: c.lok_antal,
        lok_total: c.lok_total,
        kreditspaerret: c.kreditspaerret,
        rhythmMonths,
        monthsSinceConsumable,
        rhythmClass,
        growthPct,
        trendDown,
        address: c.address,
        zip: c.zip,
        forbrug12m: f12,
        forbrug12mPrior: f12p,
        falder,
        vokser,
        overRytme: overRytmeSet.has(c.id),
        stoppet: c.stoppet,
        stopSkjult: c.stopSkjult,
        stopAarsag: c.stopAarsag,
      };
    });

    // --- Status counts (nu) + deterministisk prior-snapshot (30 dage siden) ---
    type StatusBuckets = { aktive: number; sovende: number; servicekunder: number; paaVejVaek: number };
    // Samme regel som public.kundestatus_dage() i databasen (bruges kun til prior-snapshot).
    // Prior-data er pr. måned, så seneste køb regnes som sidste dag i måneden.
    const statusFor = (lastCons: string | undefined, lastAny: string | undefined, hasEq: boolean, evalDate: Date) => {
      const dageSiden = (p: string) => {
        const d = periodToDate(p);
        const slut = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
        return Math.floor((evalDate.getTime() - slut) / 86400000);
      };
      if (lastCons && dageSiden(lastCons) <= 90) return "aktiv_kunde";
      if (lastCons && dageSiden(lastCons) <= 365) return "sovende_kunde";
      if (hasEq && lastAny && dageSiden(lastAny) <= 365) return "servicekunde";
      return "tidligere_kunde";
    };
    const tael = (getType: (c: PortfolioCompanyRow, i: number) => string | null, getLastCons: (cid: string) => string | undefined, evalDate: Date): StatusBuckets => {
      let aktive = 0, sovende = 0, servicekunder = 0, paaVejVaek = 0;
      companies.forEach((c, i) => {
        const type = getType(c, i);
        if (type === "aktiv_kunde") aktive++;
        else if (type === "sovende_kunde") sovende++;
        else if (type === "servicekunde") servicekunder++;
        // "På vej væk" er et separat trendsignal, ikke en status.
        if (type === "aktiv_kunde" && c.has_active_equipment && !c.supplied_via_id) {
          const lastConsPeriod = getLastCons(c.id);
          const lastConsDate = lastConsPeriod ? periodToDate(lastConsPeriod) : parseDate(c.last_consumable_sales_date);
          const daysSince = lastConsDate ? Math.floor((evalDate.getTime() - lastConsDate.getTime()) / 86400000) : Infinity;
          void daysSince;
          // På vej væk = forventet køb overskredet (samme regel som kundekortet).
          if (c.overRytme) paaVejVaek++;
        }
      });
      return { aktive, sovende, servicekunder, paaVejVaek };
    };
    const statusNow = tael((c) => c.customer_type, (cid) => lastConsNow.get(cid), refDato);
    const statusPriorRaw = tael(
      (c) => statusFor(lastConsPrior.get(c.id), lastSalesPrior.get(c.id), c.has_active_equipment, evalPrior),
      (cid) => lastConsPrior.get(cid),
      evalPrior,
    );
    // Rytmen for 30 dage siden kendes ikke; "på vej væk" sammenlignes derfor ikke bagud.
    const statusPrior = { ...statusPriorRaw, paaVejVaek: statusNow.paaVejVaek };
    void harGyldigtSammenligningsvindue; void startPrior;
    void cutoff12Now; void cutoff12Prior; void cutoff24Prior; void cutoff24Now; void deriveCustomerType;
    const aktive = statusNow.aktive;
    const sovende = statusNow.sovende;
    const servicekunder = statusNow.servicekunder;
    const paaVejVaek = statusNow.paaVejVaek;

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
      rhythmClass: c.rhythmClass,
      monthsSinceConsumable: c.monthsSinceConsumable,
      rhythmMonths: c.rhythmMonths,
      trendDown: c.trendDown,
    });

    const topRevenue = [...companies]
      .filter((c) => c.revenue12m > 0)
      .sort((a, b) => b.revenue12m - a.revenue12m)
      .slice(0, 25)
      .map(toRanking);

    // Bevægelse i YTD vs. samme periode sidste år (pro-rata-justeret prior).
    // Kræver at kunden havde reel omsætning sidste år ELLER har den i år.
    const withYtdDelta = companies
      .filter((c) => c.revenueYtdPriorSamePeriod > 0 || c.revenueYtd > 0)
      .map((c) => ({ c, delta: c.revenueYtd - c.revenueYtdPriorSamePeriod }));

    // Største fald: kun forbrugsvarer, 12 hele mdr. mod de 12 før.
    // Stoppede kunder er ude, så længe markeringen holder dem ude.
    const topDecliners = companies
      .filter((c) => c.falder && !c.stopSkjult)
      .sort((a, b) => (a.forbrug12m - a.forbrug12mPrior) - (b.forbrug12m - b.forbrug12mPrior))
      .slice(0, 25)
      .map((c) => ({ ...toRanking(c), revenue12m: c.forbrug12m, revenue12mPrior: c.forbrug12mPrior }));

    // Største vækst: samme mål og grænser som fald (forbrugsvarer, ≥ grænserne).
    void withYtdDelta;
    const topGrowers = companies
      .filter((c) => c.vokser && !c.stopSkjult)
      .sort((a, b) => (b.forbrug12m - b.forbrug12mPrior) - (a.forbrug12m - a.forbrug12mPrior))
      .slice(0, 25)
      .map((c) => ({ ...toRanking(c), revenue12m: c.forbrug12m, revenue12mPrior: c.forbrug12mPrior }));

    const activeCompanies = companies.filter((c) => c.customer_type === "aktiv_kunde");

    const topContribution: RankingRow[] | null = seDb
      ? [...companies]
          .filter((c) => (c.contribution12m ?? 0) > 0)
          .sort((a, b) => (b.contribution12m ?? 0) - (a.contribution12m ?? 0))
          .slice(0, 25)
          .map(toRanking)
      : null;


    // Potentiale: active + private (ikke offentlig) + employees>0
    const potentialPool = activeCompanies.filter((c) => c.sektor === "privat");
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
    // groupsByCompany + consumableRev kommer fra databaseaggregatet ovenfor.


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
      sektor: c.sektor,
    });

    // 1) Maskine men ingen kaffe
    const machineNoCoffee: SignalRow[] = companies
      .filter((c) => !c.kreditspaerret && !c.stopSkjult)
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
      .filter((c) => !c.kreditspaerret && !c.stopSkjult)
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
    void withTrend;
    const growing = companies
      .filter((c) => c.vokser && !c.stopSkjult)
      .map((c) => ({ ...blankSignal(c), growthPct: c.growthPct }))
      .sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0));
    // Faldende: kun forbrugsvarer, 12 hele mdr. mod de 12 før.
    const declining = companies
      .filter((c) => c.falder && !c.stopSkjult)
      .map((c) => ({ ...blankSignal(c), growthPct: c.growthPct }))
      .sort((a, b) => (a.growthPct ?? 0) - (b.growthPct ?? 0));

    // 5 / 6) Udløb inden for 90 dage
    const today_s = today.toISOString().slice(0, 10);
    const in90 = new Date(today);
    in90.setDate(in90.getDate() + 90);
    const in90_s = in90.toISOString().slice(0, 10);
    const compNameById = new Map(companies.map((c) => [c.id, c] as const));

    // Ét kald pr. tabel: filtrér på sælger/afdeling via join til companies.
    const hentAlle = async (byg: (from: number, to: number) => any) => {
      const ud: any[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data: page, error } = await byg(from, from + PAGE - 1);
        if (error) throw error;
        const arr = (page ?? []) as any[];
        ud.push(...arr);
        if (arr.length < PAGE) break;
      }
      return ud;
    };

    const docRows = await hentAlle((from, to) => {
      let q = supabase
        .from("company_documents")
        .select("id, filename, document_type, expires_at, company_id, companies!inner(id)")
        .not("expires_at", "is", null)
        .gte("expires_at", today_s)
        .lte("expires_at", in90_s)
        .is("companies.afloest_af_company_id", null)
        .order("expires_at", { ascending: true })
        .range(from, to);
      if (appliedSellerId) q = q.eq("companies.assigned_to", appliedSellerId);
      else q = q.not("companies.assigned_to", "is", null);
      if (data.afdelingNr != null) q = q.eq("companies.afdeling_nr", data.afdelingNr);
      return q;
    });

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

    const compAssRows = await hentAlle((from, to) => {
      let q = supabase
        .from("competitor_assignments")
        .select(
          "id, contract_expires_at, company_id, competitors(name), companies!inner(id)",
        )
        .not("contract_expires_at", "is", null)
        .is("afsluttet_dato", null)
        .gte("contract_expires_at", today_s)
        .lte("contract_expires_at", in90_s)
        .is("companies.afloest_af_company_id", null)
        .order("contract_expires_at", { ascending: true })
        .range(from, to);
      if (appliedSellerId) q = q.eq("companies.assigned_to", appliedSellerId);
      else q = q.not("companies.assigned_to", "is", null);
      if (data.afdelingNr != null) q = q.eq("companies.afdeling_nr", data.afdelingNr);
      return q;
    });

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

    const { data: vtData, error: vtErr } = await (supabase as any).rpc("vind_tilbage_liste", {
      _saelger: appliedSellerId,
    });
    if (vtErr) throw vtErr;
    const vindTilbage: VindTilbageRow[] = ((vtData ?? []) as any[])
      .filter((r) => companyIdSet.has(r.company_id) || data.afdelingNr == null)
      .map((r) => ({
        stop_id: r.stop_id,
        company_id: r.company_id,
        company_name: r.company_name,
        location_id: r.location_id ?? null,
        lokation: r.lokation ?? null,
        konkurrent: r.konkurrent ?? null,
        udloeber: r.udloeber ?? null,
        vind_dato: r.vind_dato,
      }));

    return {
      isAdmin,
      appliedSellerId: isAdmin || erSalgssupport ? appliedSellerId : null,
      sellerOptions,
      totals: (() => {
        // Pro-rata: hvis refPeriod = indeværende måned, reducér sidste års samme måned
        // til samme dag-fraktion. Ellers antages refMonth fuldt indlæst (fraction=1).
        const isCurMonth =
          today.getUTCFullYear() === refYear && today.getUTCMonth() + 1 === refMonth;
        const daysInMonth = new Date(Date.UTC(refYear, refMonth, 0)).getUTCDate();
        const fraction = isCurMonth
          ? Math.min(today.getUTCDate(), daysInMonth) / daysInMonth
          : 1;
        const priorAdj = totalRevYtdPrior - ytdPriorLastMonthRev * (1 - fraction);
        const priorAdjWeightKg =
          totalWeightKgYtdPrior - ytdPriorLastMonthWeightKg * (1 - fraction);
        return {
          revenue12m: totalRev12,
          revenue12mPriorYear: totalRevPrior,
          revenueYtd: totalRevYtd,
          revenueYtdPriorSamePeriod: priorAdj,
          weightKgYtd: totalWeightKgYtd,
          weightKgYtdPriorSamePeriod: priorAdjWeightKg,
          ytdLatestPeriod: latestPeriod,
          ytdFraction: fraction,
          contribution12m: seDb ? totalContrib : null,
        };
      })(),

      statusCounts: {
        aktive,
        sovende,
        servicekunder,
        paaVejVaek,
        total: companies.length,
      },
      statusCountsPrior: statusPrior,
      senesteFakturadato,
      faldGraenser: { minPct: faldMinPct, minKr: faldMinKr },
      monthLabels,
      companies,
      rankings: {
        topRevenue,
        topDecliners,
        topGrowers,
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
        vindTilbage,
      },
    };
  })()));



/**
 * Sælgervælgerens valgmuligheder — hentes uafhængigt af den valgte sælger,
 * så vælgeren aldrig forsvinder, mens en sælgers tal hentes.
 */
export const getSellerOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const isAdmin = await isAdminUser(supabase, userId);
    let erSalgssupport = false;
    if (!isAdmin) {
      const { data: ss } = await supabase
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "salgssupport").maybeSingle();
      erSalgssupport = !!ss;
    }
    if (!isAdmin && !erSalgssupport) return { isAdmin, sellerOptions: [] as { id: string; name: string }[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mine } = await supabase.rpc("my_afdelinger");
    const mineAfd = Array.isArray(mine) ? (mine as number[]) : [];
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "saelger");
    let ids = (roles ?? []).map((r: any) => r.user_id as string);
    if (!isAdmin && ids.length) {
      const [{ data: acc }, { data: prim }] = await Promise.all([
        supabaseAdmin.from("user_afdeling_access").select("user_id").in("user_id", ids).in("afdeling_nr", mineAfd.length ? mineAfd : [-1]),
        supabaseAdmin.from("profiles").select("id").in("id", ids).in("primary_afdeling_nr", mineAfd.length ? mineAfd : [-1]),
      ]);
      const ok = new Set<string>([...(acc ?? []).map((r: any) => r.user_id), ...(prim ?? []).map((r: any) => r.id)]);
      ids = ids.filter((id) => ok.has(id));
    }
    let sellerOptions: { id: string; name: string }[] = [];
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids).order("full_name");
      sellerOptions = (profs ?? []).map((p: any) => ({ id: p.id, name: p.full_name || "(Ukendt)" }));
    }
    return { isAdmin, sellerOptions };
  });
