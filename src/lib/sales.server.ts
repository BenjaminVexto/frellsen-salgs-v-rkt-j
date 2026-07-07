// Server-only helpers for sales.functions.ts.
// MUST live outside the .functions.ts file: the tss-serverfn-split transform
// can drop module-scope siblings referenced inside handlers, producing runtime
// ReferenceError (swallowed by h3 as a bare 500). Keep handler bodies limited
// to imports + locals; put shared logic here.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const SALES_COLS_BASE =
  "visma_delivery_no, location_id, company_id, period, last_invoice_date, product_group_1, revenue, quantity, weight_kg, order_count";
export const SALES_COLS_ADMIN = SALES_COLS_BASE + ", contribution";

export const SALES_PAGE_SIZE = 1000;

export { supabaseAdmin };

export async function isAdminUser(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export async function isTeamScopeUser(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "salgssupport"])
    .maybeSingle();
  return !!data;
}

export async function resolveEffectiveUserId(
  supabase: any,
  callerUserId: string,
  requestedViewAsUserId: string | null | undefined,
): Promise<string> {
  if (!requestedViewAsUserId) return callerUserId;
  const admin = await isAdminUser(supabase, callerUserId);
  return admin ? requestedViewAsUserId : callerUserId;
}

export async function fetchAllSalesMonthlyRows(
  queryPage: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += SALES_PAGE_SIZE) {
    const to = from + SALES_PAGE_SIZE - 1;
    const { data, error } = await queryPage(from, to);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < SALES_PAGE_SIZE) break;
  }
  return rows;
}

export async function fetchAllInChunks(
  ids: string[],
  chunkSize: number,
  queryPage: (
    slice: string[],
    from: number,
    to: number,
  ) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    for (let from = 0; ; from += SALES_PAGE_SIZE) {
      const to = from + SALES_PAGE_SIZE - 1;
      const { data, error } = await queryPage(slice, from, to);
      if (error) throw error;
      const page = data ?? [];
      rows.push(...page);
      if (page.length < SALES_PAGE_SIZE) break;
    }
  }
  return rows;
}

export function stripContribution(rows: any[]) {
  return rows.map((r) => ({
    visma_delivery_no: r.visma_delivery_no,
    location_id: r.location_id,
    company_id: r.company_id,
    period: r.period,
    last_invoice_date: r.last_invoice_date ?? null,
    product_group_1: r.product_group_1,
    revenue: Number(r.revenue) || 0,
    quantity: Number(r.quantity) || 0,
    weight_kg: Number(r.weight_kg) || 0,
    contribution: null,
    order_count: r.order_count ?? 0,
  }));
}

export function withContribution(rows: any[]) {
  return rows.map((r) => ({
    visma_delivery_no: r.visma_delivery_no,
    location_id: r.location_id,
    company_id: r.company_id,
    period: r.period,
    last_invoice_date: r.last_invoice_date ?? null,
    product_group_1: r.product_group_1,
    revenue: Number(r.revenue) || 0,
    quantity: Number(r.quantity) || 0,
    weight_kg: Number(r.weight_kg) || 0,
    contribution: Number(r.contribution) || 0,
    order_count: r.order_count ?? 0,
  }));
}

export async function getSellerCompanyIds(supabase: any, userId: string): Promise<string[]> {
  const ids = new Set<string>();
  const [{ data: assigned }, { data: assignments }, { data: opps }] = await Promise.all([
    supabase.from("companies").select("id").eq("assigned_to", userId),
    supabase.from("contact_list_assignments").select("company_id").eq("assigned_to", userId),
    supabase.from("sales_opportunities").select("company_id").eq("assigned_to", userId),
  ]);
  (assigned ?? []).forEach((r: any) => r.id && ids.add(r.id));
  (assignments ?? []).forEach((r: any) => r.company_id && ids.add(r.company_id));
  (opps ?? []).forEach((r: any) => r.company_id && ids.add(r.company_id));
  return Array.from(ids);
}
