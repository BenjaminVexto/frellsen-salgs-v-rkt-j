// Client-side parser + aggregator for Visma invoice journal.
// Input: raw xlsx/csv file (ISO-8859-1 for CSV, no header, 18 positional cols).
// Output: aggregated monthly rows + top-15 products per location (last 12 mo).

import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { MonthlyRow, TopProductRow } from "./invoice-import.functions";

const COL = {
  FIRMA: 0,
  ORDER_NO: 2,
  DATE: 3,
  DELIVERY: 4,
  VARENR: 8,
  DESC: 9,
  QTY: 10,
  GROUP1: 11,
  REVENUE: 15,
  DB: 16,
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
  orders: Set<string>;
};
type TopProductAcc = {
  description: string;
  revenue: number;
  quantity: number;
  contribution: number;
  group: string;
};


export async function parseAndAggregate(file: File): Promise<{
  monthly: MonthlyRow[];
  topProducts: TopProductRow[];
  stats: ParseStats;
}> {
  const rows = await fileToRows(file);
  const monthlyMap = new Map<string, MonthlyAcc & { delivery: string; period: string; group: string }>();
  // For top products: keyed by (delivery|varenr), only for rows in last 12 months
  const topMap = new Map<string, TopProductAcc & { delivery: string; varenr: string }>();

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
  };
  const firmaSampleSet = new Set<string>();
  const deliverySet = new Set<string>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 17) {
      stats.invalidLines++;
      continue;
    }
    const firma = String(row[COL.FIRMA] ?? "").trim();
    if (firma && firma !== ALLOWED_FIRMA) {
      stats.skippedFirma++;
      if (firmaSampleSet.size < 10) firmaSampleSet.add(firma);
      continue;
    }
    const date = parseDanishDate(row[COL.DATE]);
    const delivery = String(row[COL.DELIVERY] ?? "").trim();
    if (!date || !delivery) {
      stats.invalidLines++;
      continue;
    }
    stats.linesRead++;
    const orderNo = String(row[COL.ORDER_NO] ?? "").trim();
    const varenr = String(row[COL.VARENR] ?? "").trim();
    const desc = String(row[COL.DESC] ?? "").trim();
    const qty = parseDanishNumber(row[COL.QTY]);
    const group1 = String(row[COL.GROUP1] ?? "").trim() || "0";
    const revenue = parseDanishNumber(row[COL.REVENUE]);
    const db = parseDanishNumber(row[COL.DB]);

    deliverySet.add(delivery);
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
    stats.totalRevenue += revenue;

    const period = monthStart(date);
    const key = `${delivery}|${period}|${group1}`;
    let acc = monthlyMap.get(key);
    if (!acc) {
      acc = {
        delivery,
        period,
        group: group1,
        revenue: 0,
        quantity: 0,
        contribution: 0,
        orders: new Set(),
      };
      monthlyMap.set(key, acc);
    }

    const isInternal = revenue === 0 && db !== 0;
    if (isInternal) {
      stats.internalServicePostings++;
      acc.contribution += db;
    } else {
      acc.revenue += revenue;
      acc.quantity += qty;
      acc.contribution += db;
      if (orderNo) acc.orders.add(orderNo);
    }

    // top products: only last 12 months, only real revenue (not internal)
    if (!isInternal && varenr && date >= cutoff) {
      const tkey = `${delivery}|${varenr}`;
      let t = topMap.get(tkey);
      if (!t) {
        t = { delivery, varenr, description: desc, revenue: 0, quantity: 0, contribution: 0, group: group1 };
        topMap.set(tkey, t);
      }
      t.revenue += revenue;
      t.quantity += qty;
      t.contribution += db;
      if (!t.description && desc) t.description = desc;
      if ((!t.group || t.group === "0") && group1) t.group = group1;
    }

  }

  stats.uniqueDeliveryNos = deliverySet.size;
  stats.periodFrom = minDate ? monthStart(minDate) : null;
  stats.periodTo = maxDate ? monthStart(maxDate) : null;
  stats.skippedFirmaSamples = Array.from(firmaSampleSet).sort();

  const monthly: MonthlyRow[] = Array.from(monthlyMap.values()).map((a) => ({
    visma_delivery_no: a.delivery,
    period: a.period,
    product_group_1: a.group,
    revenue: Math.round(a.revenue * 100) / 100,
    quantity: Math.round(a.quantity * 1000) / 1000,
    contribution: Math.round(a.contribution * 100) / 100,
    order_count: a.orders.size,
  }));

  // Group top products by delivery, take top 15 per delivery
  const byDelivery = new Map<string, Array<TopProductAcc & { delivery: string; varenr: string }>>();
  topMap.forEach((v) => {
    const arr = byDelivery.get(v.delivery) ?? [];
    arr.push(v);
    byDelivery.set(v.delivery, arr);
  });
  const topProducts: TopProductRow[] = [];
  byDelivery.forEach((arr) => {
    arr.sort((a, b) => b.revenue - a.revenue);
    arr.slice(0, 15).forEach((t) => {
      topProducts.push({
        visma_delivery_no: t.delivery,
        varenr: t.varenr,
        description: t.description,
        revenue: Math.round(t.revenue * 100) / 100,
        quantity: Math.round(t.quantity * 1000) / 1000,
        contribution: Math.round(t.contribution * 100) / 100,
        product_group_1: t.group,
      });
    });
  });


  return { monthly, topProducts, stats };
}
