// Client-side parser + aggregator for Visma invoice journal.
// Input: raw xlsx/csv file (ISO-8859-1 for CSV, no header, 18 positional cols).
// Output: aggregated monthly rows + top-15 products per location (last 12 mo).

import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { MonthlyRow, TopProductRow, TopProductMonthlyRow } from "./invoice-import.functions";
import { readFileSmart } from "./file-encoding";

const COL = {
  FIRMA: 0,
  AFDELING: 1,
  ORDER_NO: 2,
  DATE: 3,
  DELIVERY: 4,
  VARENR: 8,
  DESC: 9,
  QTY: 10,
  GROUP1: 11,
  NETTOVAEGT: 13,
  REVENUE: 16,
  DB: 17,
} as const;

// Kun firma 10 (Frellsen Kaffe) må importeres. Alt andet (20/30/40/50/70 …) springes over.
const ALLOWED_FIRMA = "10";

export function parseDanishNumber(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (raw == null) return 0;
  let s = String(raw).trim().replace(/\s+/g, "");
  if (!s) return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Danish: 1.234,56 → strip dots, comma to dot
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    // Danish: 1234,56 or 1,5
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function makeUtcDate(y: number, m: number, day: number): Date | null {
  if (m < 1 || m > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(y, m - 1, day));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/**
 * Shared Danish-date parser brugt af alle imports (visma, anden, maskiner,
 * prismatrix, fakturajournal). Håndterer:
 *   - Date-instans (fra xlsx cellFormat:false)
 *   - YYYYMMDD (8 cifre, ingen separator — Visma faktura)
 *   - YYYY-MM-DD / YYYY/M/D (ISO; swap hvis måned>12 og dag<=12)
 *   - DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY (dansk)
 *   - 2-cifret år → 19xx hvis >50, ellers 20xx
 *   - Fallback: new Date(s)
 */
export function parseDanishDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return isNaN(+raw) ? null : raw;
  const s = String(raw).trim();
  if (!s || s === "0") return null;

  // YYYYMMDD (8 digits, no separator) — Visma fakturajournal
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return makeUtcDate(+compact[1], +compact[2], +compact[3]);
  }

  // ISO-lignende: YYYY-MM-DD eller YYYY/M/D (med swap-defensiv hvis måned>12)
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const y = +iso[1];
    let m = +iso[2];
    let day = +iso[3];
    if (m > 12 && day <= 12) [m, day] = [day, m];
    return makeUtcDate(y, m, day);
  }

  // Dansk DD[-./]MM[-./]YY(YY)
  const dk = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
  if (dk) {
    const day = +dk[1];
    const m = +dk[2];
    let y = +dk[3];
    if (dk[3].length === 2) y = y > 50 ? 1900 + y : 2000 + y;
    return makeUtcDate(y, m, day);
  }

  // Sidste udvej
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Returnerer YYYY-MM-DD (UTC) eller null. Bekvem til DB-insert. */
export function parseDanishDateIso(raw: unknown): string | null {
  const d = parseDanishDate(raw);
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type DateFormat = "us" | "dk";

export type DateFormatDetection = {
  format: DateFormat;
  usEvidence: number;
  dkEvidence: number;
  confident: boolean;
  ambiguous: number;
};

/**
 * Selv-verificerende detektor til D/M/Å vs M/D/Å. Kigger kun på utvetydige
 * eksempler (hvor den ene position er > 12 og dermed kun kan være dag).
 */
export function detectDateFormat(rawValues: unknown[]): DateFormatDetection {
  let usEvidence = 0;
  let dkEvidence = 0;
  let ambiguous = 0;
  for (const raw of rawValues) {
    if (raw == null) continue;
    if (raw instanceof Date) continue;
    const s = String(raw).trim();
    if (!s) continue;
    const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const aCanBeMonth = a >= 1 && a <= 12;
    const bCanBeMonth = b >= 1 && b <= 12;
    if (a > 12 && bCanBeMonth) {
      dkEvidence++;
    } else if (b > 12 && aCanBeMonth) {
      usEvidence++;
    } else if (aCanBeMonth && bCanBeMonth) {
      ambiguous++;
    }
  }
  const format: DateFormat = usEvidence > dkEvidence ? "us" : "dk";
  const confident =
    usEvidence + dkEvidence >= 3 && (usEvidence === 0 || dkEvidence === 0);
  return { format, usEvidence, dkEvidence, confident, ambiguous };
}

/**
 * Parser en dato med et allerede detekteret format. Falder tilbage til
 * parseDanishDateIso for ISO / YYYYMMDD / tekstformater.
 */
export function parseDateWithFormat(raw: unknown, format: DateFormat): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) return isNaN(+raw) ? null : raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  if (!s || s === "0") return null;
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!m) return parseDanishDateIso(raw);
  const month = format === "us" ? parseInt(m[1], 10) : parseInt(m[2], 10);
  const day = format === "us" ? parseInt(m[2], 10) : parseInt(m[1], 10);
  let year = parseInt(m[3], 10);
  if (m[3].length === 2) year = year > 50 ? 1900 + year : 2000 + year;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return isNaN(+d) ? null : d.toISOString().slice(0, 10);
}



function monthStart(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export type ParseStats = {
  linesRead: number;
  internalServicePostings: number;
  invalidLines: number;
  skippedFirma: number;
  skippedFirmaSamples: string[];
  uniqueDeliveryNos: number;
  periodFrom: string | null;
  periodTo: string | null;
  totalRevenue: number;
  /** Antal detaljelinjer pr. afdeling (nøgle = afdeling_nr som streng). */
  rowsByAfdeling: Record<string, number>;
};

/** Afdelingsopslag brugt til firma-filter og afdelingsvalidering. */
export type AfdelingRef = { afdeling_nr: number; firma_nr: number | null };

/** Række fra public.afdeling_alias: kildeværdi i Visma → kanonisk afdeling. */
export type AfdelingAliasRef = { kilde_afdeling_nr: number; afdeling_nr: number };

/**
 * Byg et opslag fra kildeafdeling til kanonisk afdeling. Identitetsrækkerne
 * (11→11 osv.) ligger i tabellen med vilje, så importen kun har ét opslag.
 */
export function buildAfdelingAliasMap(aliases: AfdelingAliasRef[] | undefined): Map<number, number> {
  const m = new Map<number, number>();
  for (const a of aliases ?? []) {
    if (Number.isFinite(a?.kilde_afdeling_nr) && Number.isFinite(a?.afdeling_nr)) {
      m.set(Number(a.kilde_afdeling_nr), Number(a.afdeling_nr));
    }
  }
  return m;
}

/**
 * Oversæt en rå kildeafdelingsværdi til kanonisk afdeling_nr.
 * Returnerer null hvis værdien er ukendt (→ filen skal afvises).
 * Når alias-map er tomt (endnu ikke hentet) falder vi tilbage til råværdien.
 */
export function mapAfdeling(raw: unknown, aliasMap: Map<number, number>): number | null {
  const n = parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return null;
  if (!aliasMap.size) return n;
  return aliasMap.get(n) ?? null;
}

export type ParseOptions = {
  /**
   * Gyldige afdelinger (hentet fra public.afdeling). Når listen er sat:
   *  - firma-filteret bruger afdelingstabellens firma_nr i stedet for hardkodet "10"
   *  - detaljerækker med en ukendt afdelingsværdi afviser hele filen
   */
  afdelinger?: AfdelingRef[];
  /**
   * Alias-rækker fra public.afdeling_alias. Kildeværdien i filen (fx 13/23)
   * oversættes til kanonisk afdeling (11/21) FØR aggregering og nøgleopslag.
   */
  afdelingAliases?: AfdelingAliasRef[];
};


async function fileToRows(file: File): Promise<any[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: false, raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: false }) as any[][];
  }
  // CSV: auto-detect UTF-8 vs Windows-1252 (Visma eksporterer cp1252).
  // Space-delimited, quoted.
  const text = await readFileSmart(file);
  const parsed = Papa.parse<string[]>(text, {
    delimiter: " ",
    quoteChar: '"',
    header: false,
    skipEmptyLines: true,
  });
  return parsed.data as any[][];
}

type MonthlyAcc = {
  revenue: number;
  quantity: number;
  contribution: number;
  weightKg: number;
  orders: Set<string>;
  lastInvoiceDate: string | null;
};
type TopProductAcc = {
  description: string;
  revenue: number;
  quantity: number;
  contribution: number;
  group: string;
};


type TopProductMonthlyAcc = TopProductAcc & { period: string };


export async function parseAndAggregate(
  file: File,
  opts: ParseOptions = {},
): Promise<{
  monthly: MonthlyRow[];
  topProducts: TopProductRow[];
  topProductsMonthly: TopProductMonthlyRow[];
  stats: ParseStats;
}> {
  const rows = await fileToRows(file);
  const monthlyMap = new Map<
    string,
    MonthlyAcc & { delivery: string; period: string; group: string; afdeling: number }
  >();
  // For top products: keyed by (afdeling|delivery|varenr), only rows in last 12 months
  const topMap = new Map<string, TopProductAcc & { delivery: string; varenr: string; afdeling: number }>();
  // Monthly top products: keyed by (afdeling|delivery|period|varenr), also last 12 months
  const topMonthlyMap = new Map<
    string,
    TopProductMonthlyAcc & { delivery: string; varenr: string; afdeling: number }
  >();

  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);

  const stats: ParseStats = {
    linesRead: 0,
    internalServicePostings: 0,
    invalidLines: 0,
    skippedFirma: 0,
    skippedFirmaSamples: [],
    uniqueDeliveryNos: 0,
    periodFrom: null,
    periodTo: null,
    totalRevenue: 0,
    rowsByAfdeling: {},
  };
  const firmaSampleSet = new Set<string>();
  const deliverySet = new Set<string>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  // Afdelingsopslag. Uden liste: bevar gammel adfærd (kun firma 10, afdeling
  // fra filen eller 11 som fallback) og ingen validering.
  const afdelingList = opts.afdelinger ?? [];
  const validAfdelinger = new Set(afdelingList.map((a) => a.afdeling_nr));
  const aliasMap = buildAfdelingAliasMap(opts.afdelingAliases);
  const allowedFirma = new Set(
    afdelingList.map((a) => (a.firma_nr == null ? "" : String(a.firma_nr))).filter(Boolean),
  );
  const unknownAfdelinger = new Set<string>();

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 20) {
      stats.invalidLines++;
      continue;
    }
    const firma = String(row[COL.FIRMA] ?? "").trim();
    // Firma-filteret frasorterer også per-kunde subtotalrækkerne, som har
    // Firma="0"/Afdeling="0". Derfor kører afdelingsvalideringen EFTER dette.
    const firmaOk = allowedFirma.size ? allowedFirma.has(firma) : !firma || firma === ALLOWED_FIRMA;
    if (!firmaOk) {
      stats.skippedFirma++;
      if (firmaSampleSet.size < 10) firmaSampleSet.add(firma);
      continue;
    }
    const afdRaw = String(row[COL.AFDELING] ?? "").trim();
    // Kildeværdien oversættes gennem afdeling_alias til kanonisk afdeling
    // (13→11, 23→21) FØR aggregering og nøgleopslag.
    const mapped = mapAfdeling(afdRaw, aliasMap);
    if (validAfdelinger.size) {
      if (mapped == null || !validAfdelinger.has(mapped)) {
        unknownAfdelinger.add(afdRaw || "(tom)");
        continue;
      }
    }
    const afdeling = mapped ?? 11;

    const date = parseDanishDate(row[COL.DATE]);
    const delivery = String(row[COL.DELIVERY] ?? "").trim();
    if (!date || !delivery) {
      stats.invalidLines++;
      continue;
    }
    stats.linesRead++;
    stats.rowsByAfdeling[String(afdeling)] = (stats.rowsByAfdeling[String(afdeling)] ?? 0) + 1;
    const orderNo = String(row[COL.ORDER_NO] ?? "").trim();
    const varenr = String(row[COL.VARENR] ?? "").trim();
    const desc = String(row[COL.DESC] ?? "").trim();
    const qty = parseDanishNumber(row[COL.QTY]);
    const group1 = String(row[COL.GROUP1] ?? "").trim() || "0";
    const revenue = parseDanishNumber(row[COL.REVENUE]);
    const db = parseDanishNumber(row[COL.DB]);
    const weightKg = parseDanishNumber(row[COL.NETTOVAEGT]);

    deliverySet.add(delivery);
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
    stats.totalRevenue += revenue;

    const period = monthStart(date);
    const dateIso = parseDanishDateIso(row[COL.DATE]);
    const key = `${afdeling}|${delivery}|${period}|${group1}`;
    let acc = monthlyMap.get(key);
    if (!acc) {
      acc = {
        delivery,
        period,
        group: group1,
        afdeling,
        revenue: 0,
        quantity: 0,
        contribution: 0,
        weightKg: 0,
        orders: new Set(),
        lastInvoiceDate: null,
      };
      monthlyMap.set(key, acc);
    }
    if (dateIso && (!acc.lastInvoiceDate || dateIso > acc.lastInvoiceDate)) {
      acc.lastInvoiceDate = dateIso;
    }

    const isInternal = revenue === 0 && db !== 0;
    if (isInternal) {
      stats.internalServicePostings++;
      acc.contribution += db;
    } else {
      acc.revenue += revenue;
      acc.quantity += qty;
      acc.contribution += db;
      acc.weightKg += weightKg;
      if (orderNo) acc.orders.add(orderNo);
    }

    // top products: only last 12 months, only real revenue (not internal)
    if (!isInternal && varenr && date >= cutoff) {
      const tkey = `${afdeling}|${delivery}|${varenr}`;
      let t = topMap.get(tkey);
      if (!t) {
        t = { delivery, varenr, afdeling, description: desc, revenue: 0, quantity: 0, contribution: 0, group: group1 };
        topMap.set(tkey, t);
      }
      t.revenue += revenue;
      t.quantity += qty;
      t.contribution += db;
      if (!t.description && desc) t.description = desc;
      if ((!t.group || t.group === "0") && group1) t.group = group1;

      const tmKey = `${afdeling}|${delivery}|${period}|${varenr}`;
      let tm = topMonthlyMap.get(tmKey);
      if (!tm) {
        tm = { delivery, period, varenr, afdeling, description: desc, revenue: 0, quantity: 0, contribution: 0, group: group1 };
        topMonthlyMap.set(tmKey, tm);
      }
      tm.revenue += revenue;
      tm.quantity += qty;
      tm.contribution += db;
      if (!tm.description && desc) tm.description = desc;
      if ((!tm.group || tm.group === "0") && group1) tm.group = group1;
    }

  }

  if (unknownAfdelinger.size) {
    throw new Error(
      `Fakturajournalen indeholder detaljerækker med ukendte kilde-afdelingsværdier: ${Array.from(unknownAfdelinger)
        .sort()
        .join(", ")}. Kendte kildeværdier (afdeling_alias): ${Array.from(aliasMap.keys())
        .sort((a, b) => a - b)
        .join(", ")}. Tilføj de manglende værdier i afdeling_alias.`,
    );
  }

  stats.uniqueDeliveryNos = deliverySet.size;
  stats.periodFrom = minDate ? monthStart(minDate) : null;
  stats.periodTo = maxDate ? monthStart(maxDate) : null;
  stats.skippedFirmaSamples = Array.from(firmaSampleSet).sort();

  const monthly: MonthlyRow[] = Array.from(monthlyMap.values()).map((a) => ({
    visma_delivery_no: a.delivery,
    afdeling_nr: a.afdeling,
    period: a.period,
    product_group_1: a.group,
    revenue: Math.round(a.revenue * 100) / 100,
    quantity: Math.round(a.quantity * 1000) / 1000,
    contribution: Math.round(a.contribution * 100) / 100,
    weight_kg: Math.round(a.weightKg * 1000) / 1000,
    order_count: a.orders.size,
    last_invoice_date: a.lastInvoiceDate,
  }));

  // Group top products by (afdeling, delivery), take top 15 per group
  const byDelivery = new Map<
    string,
    Array<TopProductAcc & { delivery: string; varenr: string; afdeling: number }>
  >();
  topMap.forEach((v) => {
    const k = `${v.afdeling}|${v.delivery}`;
    const arr = byDelivery.get(k) ?? [];
    arr.push(v);
    byDelivery.set(k, arr);
  });
  const topProducts: TopProductRow[] = [];
  byDelivery.forEach((arr) => {
    arr.sort((a, b) => b.revenue - a.revenue);
    arr.slice(0, 15).forEach((t) => {
      topProducts.push({
        visma_delivery_no: t.delivery,
        afdeling_nr: t.afdeling,
        varenr: t.varenr,
        description: t.description,
        revenue: Math.round(t.revenue * 100) / 100,
        quantity: Math.round(t.quantity * 1000) / 1000,
        contribution: Math.round(t.contribution * 100) / 100,
        product_group_1: t.group,
      });
    });
  });

  // Group monthly top products by (afdeling, delivery, period), top 15 per group
  const byDeliveryPeriod = new Map<
    string,
    Array<TopProductMonthlyAcc & { delivery: string; varenr: string; afdeling: number }>
  >();
  topMonthlyMap.forEach((v) => {
    const k = `${v.afdeling}|${v.delivery}|${v.period}`;
    const arr = byDeliveryPeriod.get(k) ?? [];
    arr.push(v);
    byDeliveryPeriod.set(k, arr);
  });
  const topProductsMonthly: TopProductMonthlyRow[] = [];
  byDeliveryPeriod.forEach((arr) => {
    arr.sort((a, b) => b.revenue - a.revenue);
    arr.slice(0, 15).forEach((t) => {
      topProductsMonthly.push({
        visma_delivery_no: t.delivery,
        afdeling_nr: t.afdeling,
        period: t.period,
        varenr: t.varenr,
        description: t.description,
        revenue: Math.round(t.revenue * 100) / 100,
        quantity: Math.round(t.quantity * 1000) / 1000,
        contribution: Math.round(t.contribution * 100) / 100,
        product_group_1: t.group,
      });
    });
  });

  return { monthly, topProducts, topProductsMonthly, stats };
}
