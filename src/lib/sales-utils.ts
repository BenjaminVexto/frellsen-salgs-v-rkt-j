export type SalesMonthlyRow = {
  visma_delivery_no: string;
  location_id: string | null;
  company_id: string | null;
  period: string; // YYYY-MM-01
  last_invoice_date: string | null; // faktisk seneste fakturadato indenfor aggregat
  product_group_1: string;
  revenue: number;
  quantity: number;
  weight_kg: number;
  contribution: number | null; // null for non-admin
  order_count: number;
};

export type TopProductRow = {
  visma_delivery_no: string;
  location_id: string | null;
  varenr: string;
  description: string | null;
  revenue: number;
  quantity: number;
};

export function parseProductGroup(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s || s === "0") return "Øvrigt/ukategoriseret";
  // "2 [Kaffe]" -> "Kaffe"; fallback to raw
  const m = s.match(/\[([^\]]+)\]/);
  if (m) return m[1].trim();
  // "2 Kaffe" -> "Kaffe"
  const parts = s.split(/\s+/);
  if (parts.length > 1 && /^\d+$/.test(parts[0])) return parts.slice(1).join(" ");
  return s;
}

export function fmtKr(n: number, decimals = 0): string {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
}

export function fmtKg(n: number, decimals = 0): string {
  const formatted = new Intl.NumberFormat("da-DK", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
  return `${formatted} kg`;
}

export function fmtPct(n: number, decimals = 1): string {
  return new Intl.NumberFormat("da-DK", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function monthsAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function currentMonthStart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// Sum revenue/qty/contribution/orders across rows
export function sumRows(rows: SalesMonthlyRow[]) {
  let revenue = 0,
    quantity = 0,
    contribution = 0,
    orders = 0,
    weightKg = 0;
  let hasContribution = false;
  for (const r of rows) {
    revenue += Number(r.revenue) || 0;
    quantity += Number(r.quantity) || 0;
    weightKg += Number(r.weight_kg) || 0;
    if (r.contribution != null) {
      contribution += Number(r.contribution) || 0;
      hasContribution = true;
    }
    orders += Number(r.order_count) || 0;
  }
  return { revenue, quantity, weightKg, contribution: hasContribution ? contribution : null, orders };
}

// Filter rows by period range (inclusive start, exclusive end)
export function filterByPeriod(
  rows: SalesMonthlyRow[],
  fromInclusive: string,
  toExclusive: string,
): SalesMonthlyRow[] {
  return rows.filter((r) => r.period >= fromInclusive && r.period < toExclusive);
}

// Sidste køb (alt) = max faktisk fakturadato (falder tilbage til period=1. i mdr.
// hvis last_invoice_date ikke er sat endnu på ældre importrækker).
export function lastPurchasePeriod(rows: SalesMonthlyRow[]): string | null {
  let max: string | null = null;
  for (const r of rows) {
    const hasActivity =
      (Number(r.revenue) || 0) > 0 ||
      (Number(r.quantity) || 0) > 0 ||
      (Number(r.order_count) || 0) > 0;
    if (!hasActivity) continue;
    const d = r.last_invoice_date ?? r.period;
    if (!max || d > max) max = d;
  }
  return max;
}

// Forbrugsvare-grupper: kaffe (2), te (4), drikke & automatvarer (6), chokolade (10).
// Bruges til "kunde på vej væk"-signalet — IKKE til status.
const CONSUMABLE_CODES = new Set(["2", "4", "6", "10"]);
export function isConsumableGroup(raw: string | null | undefined): boolean {
  const s = (raw ?? "").trim();
  const m = s.match(/^(\d+)/);
  if (!m) return false;
  return CONSUMABLE_CODES.has(m[1]);
}

// Sidste forbrugsvarekøb (kaffe/te/chokolade/drikke).
export function lastConsumablePurchasePeriod(rows: SalesMonthlyRow[]): string | null {
  let max: string | null = null;
  for (const r of rows) {
    if (!isConsumableGroup(r.product_group_1)) continue;
    const hasActivity =
      (Number(r.revenue) || 0) > 0 ||
      (Number(r.quantity) || 0) > 0 ||
      (Number(r.order_count) || 0) > 0;
    if (!hasActivity) continue;
    if (!max || r.period > max) max = r.period;
  }
  return max;
}

// Group revenue by product group (label), return sorted desc, top N + "Øvrigt"
export function groupByCategory(rows: SalesMonthlyRow[], topN = 6) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const label = parseProductGroup(r.product_group_1);
    m.set(label, (m.get(label) ?? 0) + (Number(r.revenue) || 0));
  }
  const sorted = Array.from(m.entries())
    .map(([label, revenue]) => ({ label, revenue }))
    .filter((x) => x.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
  if (sorted.length <= topN) return sorted;
  const top = sorted.slice(0, topN);
  const restSum = sorted.slice(topN).reduce((s, x) => s + x.revenue, 0);
  if (restSum > 0) top.push({ label: "Øvrigt", revenue: restSum });
  return top;
}

// 12-month revenue series ending current month (inclusive). Returns 12 entries.
export function monthlyRevenueSeries(rows: SalesMonthlyRow[], months = 12) {
  const out: { period: string; label: string; revenue: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const label = d.toLocaleDateString("da-DK", { month: "short" });
    out.push({ period, label, revenue: 0 });
  }
  const idx = new Map(out.map((o, i) => [o.period, i]));
  for (const r of rows) {
    const i = idx.get(r.period);
    if (i != null) out[i].revenue += Number(r.revenue) || 0;
  }
  return out;
}
