import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RelationType = "forsynes_af" | "leverer_til" | "maskiner_paa" | "efterfoelger";

export type ConfirmedRelation = {
  id: string;
  relation_type: RelationType;
  direction: "out" | "in"; // out = this company is the "from"; in = this company is the "to"
  other_company_id: string;
  other_company_name: string;
  other_company_city: string | null;
  other_visma_id: string | null;
  created_at: string;
};

export type RelationSuggestion = {
  id: string;
  to_visma_id: string;
  to_company_id: string | null;
  to_company_name: string | null;
  to_company_city: string | null;
  source_text: string | null;
  created_at: string;
};

const INVERSE: Record<RelationType, RelationType | null> = {
  forsynes_af: "leverer_til",
  leverer_til: "forsynes_af",
  maskiner_paa: null,
  efterfoelger: null,
};

// ---------- PARSER ----------

/**
 * Find kundenr-henvisninger (6-7 cifre) i en bemærkningstekst.
 * Returnerer unikke kundenumre, ekskl. ownVismaId.
 */
export function extractKundenrReferences(notes: string | null | undefined, ownVismaId?: string | null): string[] {
  if (!notes) return [];
  const found = new Set<string>();
  const own = (ownVismaId ?? "").trim();

  // Mønster 1: "nr.", "nr", "K-", "kundenr", "via", "på", "kunde nr" foran et 6-7-cifret tal
  const re1 = /(?:nr\.?|K-|kundenr\.?|kunde\s*nr\.?|via|på)\s*[K\-]?\s*(\d{6,7})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(notes)) !== null) found.add(m[1]);

  // Mønster 2: løse 6-7-cifrede tal hvis bemærkningen indeholder relevante nøgleord
  if (/varer|maskin|kantin|forbrugs|fakt|køber|konkurs|lukket|brug/i.test(notes)) {
    const re2 = /\b(\d{6,7})\b/g;
    while ((m = re2.exec(notes)) !== null) found.add(m[1]);
  }

  if (own) found.delete(own);
  // Filtrér urealistiske: rene 0000000 etc
  return Array.from(found).filter((s) => !/^0+$/.test(s));
}

// ---------- READ ----------

export const getCompanyRelations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => d)
  .handler(async ({ data, context }): Promise<{
    confirmed: ConfirmedRelation[];
    suggestions: RelationSuggestion[];
  }> => {
    const supabase = context.supabase;
    const companyId = data.companyId;

    const [{ data: out }, { data: incoming }, { data: sugg }] = await Promise.all([
      supabase
        .from("company_relations")
        .select("id, relation_type, to_company_id, created_at, to:companies!company_relations_to_company_id_fkey(id, name, city, visma_id)")
        .eq("from_company_id", companyId),
      supabase
        .from("company_relations")
        .select("id, relation_type, from_company_id, created_at, from:companies!company_relations_from_company_id_fkey(id, name, city, visma_id)")
        .eq("to_company_id", companyId),
      supabase
        .from("company_relation_suggestions")
        .select("id, to_visma_id, to_company_id, source_text, created_at, to:companies!company_relation_suggestions_to_company_id_fkey(id, name, city)")
        .eq("from_company_id", companyId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    const confirmed: ConfirmedRelation[] = [
      ...(out ?? []).map((r: any) => ({
        id: r.id,
        relation_type: r.relation_type,
        direction: "out" as const,
        other_company_id: r.to?.id ?? r.to_company_id,
        other_company_name: r.to?.name ?? "Ukendt",
        other_company_city: r.to?.city ?? null,
        other_visma_id: r.to?.visma_id ?? null,
        created_at: r.created_at,
      })),
      ...(incoming ?? []).map((r: any) => ({
        id: r.id,
        relation_type: r.relation_type,
        direction: "in" as const,
        other_company_id: r.from?.id ?? r.from_company_id,
        other_company_name: r.from?.name ?? "Ukendt",
        other_company_city: r.from?.city ?? null,
        other_visma_id: r.from?.visma_id ?? null,
        created_at: r.created_at,
      })),
    ];

    const suggestions: RelationSuggestion[] = (sugg ?? []).map((s: any) => ({
      id: s.id,
      to_visma_id: s.to_visma_id,
      to_company_id: s.to_company_id,
      to_company_name: s.to?.name ?? null,
      to_company_city: s.to?.city ?? null,
      source_text: s.source_text,
      created_at: s.created_at,
    }));

    return { confirmed, suggestions };
  });

// ---------- WRITE ----------

export const confirmRelationSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { suggestionId: string; relationType: RelationType }) => d)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: sugg, error: se } = await supabase
      .from("company_relation_suggestions")
      .select("id, from_company_id, to_company_id, to_visma_id")
      .eq("id", data.suggestionId)
      .single();
    if (se) throw se;
    if (!sugg) throw new Error("Forslag ikke fundet");

    let toCompanyId = sugg.to_company_id as string | null;
    if (!toCompanyId) {
      const { data: match } = await supabase
        .from("companies")
        .select("id")
        .eq("visma_id", sugg.to_visma_id)
        .maybeSingle();
      if (match) toCompanyId = match.id;
    }
    if (!toCompanyId) {
      throw new Error(`Ingen virksomhed fundet med kundenr ${sugg.to_visma_id}. Forslaget kan ikke bekræftes endnu.`);
    }

    const { error: insErr } = await supabase.from("company_relations").insert({
      from_company_id: sugg.from_company_id,
      to_company_id: toCompanyId,
      relation_type: data.relationType,
      created_by: context.userId,
    });
    if (insErr && !insErr.message?.includes("duplicate")) throw insErr;

    const inverse = INVERSE[data.relationType];
    if (inverse) {
      await supabase.from("company_relations").insert({
        from_company_id: toCompanyId,
        to_company_id: sugg.from_company_id,
        relation_type: inverse,
        created_by: context.userId,
      });
    }

    await supabase
      .from("company_relation_suggestions")
      .update({ status: "confirmed", resolved_by: context.userId, resolved_at: new Date().toISOString() })
      .eq("id", data.suggestionId);

    return { ok: true };
  });

export const rejectRelationSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { suggestionId: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("company_relation_suggestions")
      .update({ status: "rejected", resolved_by: context.userId, resolved_at: new Date().toISOString() })
      .eq("id", data.suggestionId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCompanyRelation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { relationId: string }) => d)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: rel } = await supabase
      .from("company_relations")
      .select("from_company_id, to_company_id, relation_type")
      .eq("id", data.relationId)
      .single();
    if (!rel) return { ok: true };

    await supabase.from("company_relations").delete().eq("id", data.relationId);

    const inverse = INVERSE[rel.relation_type as RelationType];
    if (inverse) {
      await supabase
        .from("company_relations")
        .delete()
        .eq("from_company_id", rel.to_company_id)
        .eq("to_company_id", rel.from_company_id)
        .eq("relation_type", inverse);
    }
    return { ok: true };
  });

// ---------- RESCAN ----------

export const rescanRelationSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;

    // Admin check
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Kun administratorer kan scanne bemærkninger");

    // Fetch all companies with notes
    const companies: { id: string; visma_id: string | null; visma_notes: string | null }[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("companies")
        .select("id, visma_id, visma_notes")
        .not("visma_notes", "is", null)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const page = data ?? [];
      companies.push(...page);
      if (page.length < PAGE) break;
    }

    // Build visma_id → company_id lookup
    const allCompanies: { id: string; visma_id: string | null }[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("companies")
        .select("id, visma_id")
        .not("visma_id", "is", null)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const page = data ?? [];
      allCompanies.push(...page);
      if (page.length < PAGE) break;
    }
    const vismaMap = new Map<string, string>();
    for (const c of allCompanies) {
      if (c.visma_id) vismaMap.set(c.visma_id.trim(), c.id);
    }

    // Existing pending suggestions to avoid duplicates
    const { data: existing } = await supabase
      .from("company_relation_suggestions")
      .select("from_company_id, to_visma_id");
    const existingKeys = new Set((existing ?? []).map((e: any) => `${e.from_company_id}|${e.to_visma_id}`));

    const inserts: any[] = [];
    let totalFound = 0;
    for (const c of companies) {
      const refs = extractKundenrReferences(c.visma_notes, c.visma_id);
      for (const r of refs) {
        totalFound++;
        const key = `${c.id}|${r}`;
        if (existingKeys.has(key)) continue;
        inserts.push({
          from_company_id: c.id,
          to_visma_id: r,
          to_company_id: vismaMap.get(r) ?? null,
          source_text: (c.visma_notes ?? "").slice(0, 500),
          status: "pending",
        });
      }
    }

    let newCount = 0;
    if (inserts.length) {
      // Chunked insert
      for (let i = 0; i < inserts.length; i += 200) {
        const slice = inserts.slice(i, i + 200);
        const { error } = await supabase.from("company_relation_suggestions").insert(slice);
        if (!error) newCount += slice.length;
      }
    }

    return { scanned: companies.length, totalReferencesFound: totalFound, newSuggestions: newCount };
  });

// ---------- HELPERS ----------

export async function getCompaniesSuppliedByOthers(
  supabase: any,
  companyIds: string[],
): Promise<Set<string>> {
  if (!companyIds.length) return new Set();
  const result = new Set<string>();
  for (let i = 0; i < companyIds.length; i += 200) {
    const slice = companyIds.slice(i, i + 200);
    const { data } = await supabase
      .from("company_relations")
      .select("from_company_id")
      .eq("relation_type", "forsynes_af")
      .in("from_company_id", slice);
    (data ?? []).forEach((r: any) => result.add(r.from_company_id));
  }
  return result;
}
