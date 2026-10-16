/**
 * Server-only helper: beriger med data fra CVR-API'et — ét opslag pr. CVR-nummer.
 * Resultatet gemmes i cvr_enhed (én række pr. CVR) og kopieres derefter ud på
 * konti (ansatte, branche, kommune) via SQL cvr_enhed_til_konti. Visma-felter røres ikke.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CVR_URL = "http://distribution.virk.dk/cvr-permanent/virksomhed/_search";
const CHUNK = 500;

/** Normaliseret 8-cifret CVR (samme regel som SQL cvr_norm); ellers null. */
function norm(cvr: unknown): string | null {
  const x = String(cvr ?? "").toUpperCase().replace(/^\s*DK/, "").replace(/\D/g, "");
  return /^\d{8}$/.test(x) ? x : null;
}

function adresseTekst(a: any): string | null {
  if (!a) return null;
  const nr = [a.husnummerFra, a.bogstavFra].filter((v) => v != null && v !== "").join("");
  const s = [a.vejnavn, nr].filter(Boolean).join(" ");
  return s || a.fritekst || null;
}

/** Henter CVR-data for de givne CVR-numre og gemmer i cvr_enhed + konti. */
export async function enrichCvrNumre(
  cvrInput: string[],
): Promise<{ hentet: number; fundet: number; ikkeFundet: number; konti: number; error?: string }> {
  const cvrs = Array.from(new Set(cvrInput.map(norm).filter((x): x is string => !!x)));
  const tom = { hentet: 0, fundet: 0, ikkeFundet: 0, konti: 0 };
  if (!cvrs.length) return tom;
  const user = process.env.CVR_USERNAME;
  const pass = process.env.CVR_PASSWORD;
  if (!user || !pass) return { ...tom, error: "CVR credentials mangler" };
  const auth = btoa(`${user}:${pass}`);
  const res0 = { ...tom };

  for (let i = 0; i < cvrs.length; i += CHUNK) {
    const slice = cvrs.slice(i, i + CHUNK);
    const res = await fetch(CVR_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        _source: ["Vrvirksomhed.cvrNummer", "Vrvirksomhed.virksomhedMetadata"],
        query: { terms: { "Vrvirksomhed.cvrNummer": slice.map(Number) } },
        size: slice.length,
      }),
    });
    if (!res.ok) return { ...res0, error: `CVR-API fejl ${res.status}: ${res.statusText}` };
    const json: any = await res.json();
    const nu = new Date().toISOString();
    const rows = new Map<string, any>();
    for (const hit of json?.hits?.hits ?? []) {
      const v = hit._source?.Vrvirksomhed;
      if (!v) continue;
      const cvr = String(v.cvrNummer).padStart(8, "0");
      const m = v.virksomhedMetadata ?? {};
      const a = m.nyesteBeliggenhedsadresse;
      rows.set(cvr, {
        cvr,
        cvr_navn: m.nyesteNavn?.navn ?? null,
        virksomhedsform: m.nyesteVirksomhedsform?.langBeskrivelse ?? m.nyesteVirksomhedsform?.kortBeskrivelse ?? null,
        cvr_status: m.sammensatStatus ?? null,
        adresse: adresseTekst(a),
        postnr: a?.postnummer != null ? String(a.postnummer) : null,
        by: a?.postdistrikt ?? null,
        kommune: a?.kommune?.kommuneNavn ?? null,
        branchekode: m.nyesteHovedbranche?.branchekode ?? null,
        branchetekst: m.nyesteHovedbranche?.branchetekst ?? null,
        ansatte:
          m.nyesteErstMaanedsbeskaeftigelse?.antalAnsatte ??
          m.nyesteMaanedsbeskaeftigelse?.antalAnsatte ??
          m.nyesteKvartalsbeskaeftigelse?.antalAnsatte ??
          m.nyesteAarsbeskaeftigelse?.antalAnsatte ??
          null,
        fundet: true,
        hentet_at: nu,
      });
    }
    // Ikke fundet i CVR: markér som forsøgt, så de ikke hentes igen hvert minut.
    const ikke = slice.filter((c) => !rows.has(c));
    const alle = [...rows.values()];
    if (alle.length) {
      const { error } = await (supabaseAdmin as any).from("cvr_enhed").upsert(alle, { onConflict: "cvr" });
      if (error) return { ...res0, error: `Gem fejl: ${error.message}` };
    }
    if (ikke.length) {
      const { error } = await (supabaseAdmin as any)
        .from("cvr_enhed")
        .upsert(ikke.map((cvr) => ({ cvr, fundet: false, hentet_at: nu })), { onConflict: "cvr", ignoreDuplicates: true });
      if (error) return { ...res0, error: `Gem fejl: ${error.message}` };
      // Tidligere fundne, som nu mangler, beholder deres data men får nyt tidsstempel.
      await (supabaseAdmin as any).from("cvr_enhed").update({ hentet_at: nu }).in("cvr", ikke);
    }
    const { data: n, error: kErr } = await (supabaseAdmin as any).rpc("cvr_enhed_til_konti", { _cvrs: [...rows.keys()] });
    if (kErr) return { ...res0, error: `Konti fejl: ${kErr.message}` };
    res0.hentet += slice.length;
    res0.fundet += rows.size;
    res0.ikkeFundet += ikke.length;
    res0.konti += Number(n ?? 0);
  }
  return res0;
}

/** Bagudkompatibel: beriger konti ud fra deres CVR (via cvr_enhed). */
export async function enrichCompaniesByIds(companyIds: string[]): Promise<{ enriched: number; error?: string }> {
  if (!companyIds.length) return { enriched: 0 };
  const cvrs: string[] = [];
  for (let i = 0; i < companyIds.length; i += 500) {
    const { data, error } = await supabaseAdmin
      .from("companies")
      .select("cvr")
      .in("id", companyIds.slice(i, i + 500))
      .not("cvr", "is", null);
    if (error) return { enriched: 0, error: error.message };
    for (const c of data ?? []) if (c.cvr) cvrs.push(c.cvr);
  }
  const r = await enrichCvrNumre(cvrs);
  return { enriched: r.konti, error: r.error };
}
