/**
 * Server-only helper: beriger virksomheder med data fra CVR-API'et.
 * Bruges af både den authenticated server-fn (enrichCompaniesFromCvr)
 * og den offentlige worker-endpoint /api/public/hooks/process-cvr-enrichment.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CVR_URL =
  "http://distribution.virk.dk/cvr-permanent/virksomhed/_search";

export async function enrichCompaniesByIds(
  companyIds: string[],
): Promise<{ enriched: number; error?: string }> {
  if (!companyIds.length) return { enriched: 0 };

  const user = process.env.CVR_USERNAME;
  const pass = process.env.CVR_PASSWORD;
  if (!user || !pass) {
    return { enriched: 0, error: "CVR credentials mangler" };
  }
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");

  const { data: companies, error: selectErr } = await supabaseAdmin
    .from("companies")
    .select("id, cvr, name")
    .in("id", companyIds)
    .not("cvr", "is", null);

  if (selectErr) return { enriched: 0, error: selectErr.message };
  if (!companies?.length) return { enriched: 0 };

  const CHUNK = 500;
  let enriched = 0;

  for (let i = 0; i < companies.length; i += CHUNK) {
    const slice = companies.slice(i, i + CHUNK);
    const cvrs = slice
      .map((c) => parseInt((c.cvr as string) ?? "", 10))
      .filter((n) => !Number.isNaN(n));
    if (!cvrs.length) continue;

    const payload = {
      _source: ["Vrvirksomhed.cvrNummer", "Vrvirksomhed.virksomhedMetadata"],
      query: { terms: { "Vrvirksomhed.cvrNummer": cvrs } },
      size: CHUNK,
    };

    const res = await fetch(CVR_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return {
        enriched,
        error: `CVR-API fejl ${res.status}: ${res.statusText}`,
      };
    }
    const json: any = await res.json();
    const hits = json?.hits?.hits ?? [];

    const rows: any[] = [];
    for (const hit of hits) {
      const v = hit._source?.Vrvirksomhed;
      if (!v) continue;
      const cvr = String(v.cvrNummer);
      const company = slice.find((c) => c.cvr === cvr);
      if (!company) continue;
      const meta = v.virksomhedMetadata ?? {};
      rows.push({
        id: company.id,
        name: company.name,
        employees:
          meta.nyesteErstMaanedsbeskaeftigelse?.antalAnsatte ??
          meta.nyesteMaanedsbeskaeftigelse?.antalAnsatte ??
          meta.nyesteKvartalsbeskaeftigelse?.antalAnsatte ??
          meta.nyesteAarsbeskaeftigelse?.antalAnsatte ??
          null,
        municipality:
          meta.nyesteBeliggenhedsadresse?.kommune?.kommuneNavn ?? null,
        main_branch_code: meta.nyesteHovedbranche?.branchekode ?? null,
        main_branch_text: meta.nyesteHovedbranche?.branchetekst ?? null,
        bi_branch_1_code: meta.nyesteBibranche1?.branchekode ?? null,
        bi_branch_2_code: meta.nyesteBibranche2?.branchekode ?? null,
        bi_branch_3_code: meta.nyesteBibranche3?.branchekode ?? null,
        cvr_p_enhed_count: meta.antalPenheder ?? null,
        source_updated_at: new Date().toISOString(),
      });
    }

    if (rows.length) {
      const { error: upErr } = await supabaseAdmin
        .from("companies")
        .upsert(rows, { onConflict: "id", ignoreDuplicates: false });
      if (upErr) {
        return { enriched, error: `Upsert fejl: ${upErr.message}` };
      }
      enriched += rows.length;
    }
  }

  return { enriched };
}
