import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MatchSource = "kundenr" | "kp1+kp2" | "kp1" | "kp2";

export type PricingRow = {
  id: string;
  kundeprisgruppe1: string | null;
  kundeprisgruppe2: string | null;
  fak_kundenr: string | null;
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
  match_source?: MatchSource;
};

export function extractLeadingCode(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

/** Pakker "4 [Te]" → "Te"; "78 [Maskiner - Salg...]" → "Maskiner - Salg..."; fallback til rå tekst. */
export function extractGroupLabel(s: string | null | undefined): string | null {
  if (!s) return null;
  const raw = String(s).trim();
  if (!raw || raw === "0") return null;
  const m = raw.match(/\[\s*(.+?)\s*\]?\s*$/);
  if (m && m[1]) return m[1].replace(/\]+$/, "").trim();
  // ren tekst uden klamme — drop ledende kode hvis der er en
  const stripped = raw.replace(/^\d+\s*/, "").trim();
  return stripped || raw;
}

/** Afled visningsetiket for en prismatrix-række: varenr > pg3 > pg2 > pg1 > "Øvrige". */
export function deriveRowLabel(r: {
  varenr?: string | null;
  beskrivelse?: string | null;
  produktprisgruppe1?: string | null;
  produktprisgruppe2?: string | null;
  produktprisgruppe3?: string | null;
}): string {
  const v = (r.varenr ?? "").trim();
  if (v && v !== "0") return r.beskrivelse?.trim() || `Vare ${v}`;
  return (
    extractGroupLabel(r.produktprisgruppe3) ??
    extractGroupLabel(r.produktprisgruppe2) ??
    extractGroupLabel(r.produktprisgruppe1) ??
    "Øvrige"
  );
}

// PostgREST OR-filter for et tekstfelt der starter med koden ("59", "59 ...", "59[...", "59\t...")
function startsWithCodeFilter(col: string, code: string): string {
  return [
    `${col}.eq.${code}`,
    `${col}.ilike.${code} %`,
    `${col}.ilike.${code}[%`,
    `${col}.ilike.${code}\t%`,
  ].join(",");
}

function buildKp2OrFilter(code: string) {
  return startsWithCodeFilter("kundeprisgruppe2", code);
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

async function fetchPagedOr(orFilter: string): Promise<any[]> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("agreement_pricing" as any)
      .select("*")
      .or(orFilter)
      .eq("record_status", "aktiv")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * 4-nøgle matching pr. virksomhed:
 *   1) Kundespecifik:  fak_kundenr = visma_id
 *   2) Kombi-gruppe:   kp1 matcher virksomhedens kp1 OG kp2 matcher virksomhedens kp2
 *   3) Kun KP1-gruppe: kp1 matcher, kp2 og fak_kundenr tomme på rækken
 *   4) Kun KP2-gruppe: kp2 matcher, kp1 og fak_kundenr tomme på rækken
 * Generelle rækker (alle tre nøgler tomme) udelades — de er fra prismatrixens 3% "generel"-rest
 * og hører ikke til en specifik kunde.
 */
async function fetchPricingForCompany(
  vismaId: string | null,
  kp1: string | null,
  kp2: string | null,
): Promise<PricingRow[]> {
  const orParts: string[] = [];
  if (vismaId) orParts.push(`fak_kundenr.eq.${vismaId}`);
  if (kp1) orParts.push(startsWithCodeFilter("kundeprisgruppe1", kp1));
  if (kp2) orParts.push(startsWithCodeFilter("kundeprisgruppe2", kp2));
  if (!orParts.length) return [];

  const candidates = await fetchPagedOr(orParts.join(","));

  const isCode = (val: string | null | undefined, code: string | null): boolean => {
    if (!code) return false;
    const c = extractLeadingCode(val);
    return c === code;
  };
  const isEmpty = (v: string | null | undefined) =>
    v == null || String(v).trim() === "";

  const seen = new Map<string, PricingRow>();
  for (const r of candidates as PricingRow[]) {
    const rowKundenr = (r.fak_kundenr ?? "").trim();
    const rowHasKp1 = !isEmpty(r.kundeprisgruppe1);
    const rowHasKp2 = !isEmpty(r.kundeprisgruppe2);
    const rowHasKundenr = !!rowKundenr;

    let source: MatchSource | null = null;
    if (vismaId && rowKundenr === vismaId) {
      source = "kundenr";
    } else if (
      !rowHasKundenr &&
      rowHasKp1 &&
      rowHasKp2 &&
      isCode(r.kundeprisgruppe1, kp1) &&
      isCode(r.kundeprisgruppe2, kp2)
    ) {
      source = "kp1+kp2";
    } else if (
      !rowHasKundenr &&
      rowHasKp1 &&
      !rowHasKp2 &&
      isCode(r.kundeprisgruppe1, kp1)
    ) {
      source = "kp1";
    } else if (
      !rowHasKundenr &&
      !rowHasKp1 &&
      rowHasKp2 &&
      isCode(r.kundeprisgruppe2, kp2)
    ) {
      source = "kp2";
    }
    if (!source) continue;

    const prev = seen.get(r.id);
    if (!prev) {
      seen.set(r.id, { ...r, match_source: source });
      continue;
    }
    // Prioritér mest specifikke match hvis samme id rammer flere veje
    const priority: Record<MatchSource, number> = {
      kundenr: 4,
      "kp1+kp2": 3,
      kp1: 2,
      kp2: 1,
    };
    if (priority[source] > priority[prev.match_source!]) {
      seen.set(r.id, { ...r, match_source: source });
    }
  }
  return Array.from(seen.values());
}

export const listPricingByKp2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ kp2: z.string().trim().min(1).max(50) }).parse(input),
  )
  .handler(async ({ data }) => {
    return await fetchPricingByKp2(data.kp2.trim());
  });

export const listPricingForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: company, error } = await supabaseAdmin
      .from("companies")
      .select("visma_id, customer_segment_1, customer_segment_2")
      .eq("id", data.company_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const vismaId = ((company as any)?.visma_id ?? "").toString().trim() || null;
    const kp1 = extractLeadingCode((company as any)?.customer_segment_1);
    const kp2 = extractLeadingCode((company as any)?.customer_segment_2);
    const rows = await fetchPricingForCompany(vismaId, kp1, kp2);
    return { rows, vismaId, kp1, kp2 };
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
  countsBySource: Record<MatchSource, number>;
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
  const counts: Record<MatchSource, number> = { kundenr: 0, "kp1+kp2": 0, kp1: 0, kp2: 0 };
  for (const r of rows) {
    if (r.match_source) counts[r.match_source]++;
  }
  return {
    segments,
    valid_from: fras[0] ?? null,
    valid_to: tils.length ? tils[tils.length - 1] : null,
    rowCount: rows.length,
    countsBySource: counts,
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
      .select("visma_id, customer_segment_1, customer_segment_2")
      .eq("id", data.company_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const vismaId = ((company as any)?.visma_id ?? "").toString().trim() || null;
    const kp1 = extractLeadingCode((company as any)?.customer_segment_1);
    const kp2 = extractLeadingCode((company as any)?.customer_segment_2);

    if (!vismaId && !kp1 && !kp2) {
      return {
        vismaId: null as string | null,
        kp1: null as string | null,
        kp2: null as string | null,
        agreement_id: null as string | null,
        segments: [] as CategorySummary[],
        rowCount: 0,
        valid_from: null as string | null,
        valid_to: null as string | null,
        countsBySource: { kundenr: 0, "kp1+kp2": 0, kp1: 0, kp2: 0 } as Record<
          MatchSource,
          number
        >,
      };
    }

    const [rows, agr] = await Promise.all([
      fetchPricingForCompany(vismaId, kp1, kp2),
      kp2
        ? supabaseAdmin
            .from("agreements")
            .select("id")
            .eq("kp2_code", kp2)
            .maybeSingle()
            .then((r) => (r.data as any)?.id ?? null)
        : Promise.resolve(null),
    ]);
    const sum = summarize(rows);
    return { vismaId, kp1, kp2, agreement_id: agr as string | null, ...sum };
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
