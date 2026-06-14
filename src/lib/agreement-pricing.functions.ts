import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PricingRow = {
  id: string;
  kundeprisgruppe2: string | null;
  produktprisgruppe1: string | null;
  produktprisgruppe2: string | null;
  produktprisgruppe3: string | null;
  varenr: string | null;
  beskrivelse: string | null;
  rab_kr: number | null;
  rab_pct: number | null;
  udsalgspris: number | null;
  udlejningspris: number | null;
  kampagne: string | null;
  kommentar: string | null;
  fra_dato: string | null;
  til_dato: string | null;
  rabat_kategori: string | null;
  record_status: string;
};

export function extractLeadingCode(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

function buildKp2OrFilter(code: string) {
  // Matcher "59", "59 ...", "59[...", "59\t..."
  return [
    `kundeprisgruppe2.eq.${code}`,
    `kundeprisgruppe2.ilike.${code} %`,
    `kundeprisgruppe2.ilike.${code}[%`,
    `kundeprisgruppe2.ilike.${code}\t%`,
  ].join(",");
}

async function fetchPricingByKp2(code: string): Promise<PricingRow[]> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("agreement_pricing" as any)
      .select("*")
      .or(buildKp2OrFilter(code))
      .eq("record_status", "aktiv")
      .order("rabat_kategori", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out as PricingRow[];
}

export const listPricingByKp2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ kp2: z.string().trim().min(1).max(50) }).parse(input),
  )
  .handler(async ({ data }) => {
    return await fetchPricingByKp2(data.kp2.trim());
  });

export type CategorySummary = {
  kategori: string;
  avg_kr: number | null;
  avg_pct: number | null;
  count: number;
};

function summarize(rows: PricingRow[]): {
  segments: CategorySummary[];
  valid_from: string | null;
  valid_to: string | null;
  rowCount: number;
} {
  // Filtrér linjer hvor (rab_kr=0 OG rab_pct=0) ELLER rab_pct=100
  const usable = rows.filter((r) => {
    const kr = Number(r.rab_kr ?? 0);
    const pct = Number(r.rab_pct ?? 0);
    if (pct === 100) return false;
    if (!kr && !pct) return false;
    return true;
  });
  const byCat = new Map<string, { krs: number[]; pcts: number[] }>();
  for (const r of usable) {
    const cat = r.rabat_kategori ?? "Øvrige";
    const e = byCat.get(cat) ?? { krs: [], pcts: [] };
    const kr = Number(r.rab_kr ?? 0);
    const pct = Number(r.rab_pct ?? 0);
    if (kr > 0) e.krs.push(kr);
    if (pct > 0) e.pcts.push(pct);
    byCat.set(cat, e);
  }
  const segments: CategorySummary[] = Array.from(byCat.entries()).map(
    ([kategori, v]) => ({
      kategori,
      avg_kr: v.krs.length
        ? v.krs.reduce((a, b) => a + b, 0) / v.krs.length
        : null,
      avg_pct: v.pcts.length
        ? v.pcts.reduce((a, b) => a + b, 0) / v.pcts.length
        : null,
      count: v.krs.length + v.pcts.length,
    }),
  );
  const fras = rows.map((r) => r.fra_dato).filter(Boolean).sort() as string[];
  const tils = rows.map((r) => r.til_dato).filter(Boolean).sort() as string[];
  return {
    segments,
    valid_from: fras[0] ?? null,
    valid_to: tils.length ? tils[tils.length - 1] : null,
    rowCount: rows.length,
  };
}

export const getCompanyPricingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: company, error } = await supabaseAdmin
      .from("companies")
      .select("customer_segment_2")
      .eq("id", data.company_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const kp2 = extractLeadingCode((company as any)?.customer_segment_2);
    if (!kp2) {
      return {
        kp2: null as string | null,
        agreement_id: null as string | null,
        segments: [] as CategorySummary[],
        rowCount: 0,
        valid_from: null as string | null,
        valid_to: null as string | null,
      };
    }
    const [rows, agr] = await Promise.all([
      fetchPricingByKp2(kp2),
      supabaseAdmin
        .from("agreements")
        .select("id")
        .eq("kp2_code", kp2)
        .maybeSingle()
        .then((r) => (r.data as any)?.id ?? null),
    ]);
    const sum = summarize(rows);
    return { kp2, agreement_id: agr as string | null, ...sum };
  });

export const listPricingKp2Groups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const PAGE = 1000;
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseAdmin
        .from("agreement_pricing" as any)
        .select("kundeprisgruppe2, fra_dato, til_dato")
        .eq("record_status", "aktiv")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    type Group = {
      code: string;
      label: string;
      raw: string;
      count: number;
      fra: string | null;
      til: string | null;
    };
    const groups = new Map<string, Group>();
    for (const r of rows) {
      const raw = String(r.kundeprisgruppe2 ?? "").trim();
      if (!raw) continue;
      const code = extractLeadingCode(raw);
      if (!code) continue;
      const labelMatch = raw.match(/^\d+\s*[\[\(]\s*(.+?)\s*[\]\)]?$/);
      const label = labelMatch?.[1]?.trim() || raw;
      const g =
        groups.get(code) ??
        ({
          code,
          label,
          raw,
          count: 0,
          fra: null,
          til: null,
        } as Group);
      g.count++;
      if (r.fra_dato && (!g.fra || r.fra_dato < g.fra)) g.fra = r.fra_dato;
      if (r.til_dato && (!g.til || r.til_dato > g.til)) g.til = r.til_dato;
      if (raw.length > g.raw.length) {
        g.raw = raw;
        g.label = label;
      }
      groups.set(code, g);
    }
    const { data: agreements } = await supabaseAdmin
      .from("agreements")
      .select("id, name, kp2_code, valid_from, valid_to, is_public_sector");
    const byKp2 = new Map<string, any>();
    (agreements ?? []).forEach((a: any) => {
      if (a.kp2_code) byKp2.set(String(a.kp2_code).trim(), a);
    });
    return Array.from(groups.values())
      .map((g) => ({ ...g, agreement: byKp2.get(g.code) ?? null }))
      .sort((a, b) => Number(a.code) - Number(b.code));
  });
