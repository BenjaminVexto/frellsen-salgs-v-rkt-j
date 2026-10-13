/**
 * Direktør/ejer fra CVR-deltagerdata → kontaktperson "Direktør (CVR)".
 * Ren logik uden server-imports, så den kan bruges af både serverfunktion og batch-kørsel.
 * Kun navnet gemmes – personers telefon/e-mail er ikke offentlige.
 */
export const DIREKTOER_TITEL = "Direktør (CVR)";
const CVR_URL = "http://distribution.virk.dk/cvr-permanent/virksomhed/_search";

// Kun de felter, der skal bruges
const KILDE = [
  "Vrvirksomhed.cvrNummer",
  "Vrvirksomhed.deltagerRelation.deltager.enhedstype",
  "Vrvirksomhed.deltagerRelation.deltager.navne",
  "Vrvirksomhed.deltagerRelation.organisationer.hovedtype",
  "Vrvirksomhed.deltagerRelation.organisationer.medlemsData.attributter",
];

const RANG: Record<string, number> = {
  "ADM. DIR.": 1, "ADMINISTRERENDE DIREKTØR": 1,
  "DIREKTØR": 2, "DIREKTION": 2,
  "INDEHAVER": 3, "FULDT ANSVARLIG DELTAGER": 3,
  "STIFTER": 4, "STIFTERE": 4,
};

/** Aktive direktører (ellers ejer/stifter) for én CVR-virksomhed, bedste først, maks. 2. */
export function direktoererFraCvr(v: any): string[] {
  const fund: { navn: string; rang: number }[] = [];
  for (const r of v?.deltagerRelation ?? []) {
    if (r?.deltager?.enhedstype !== "PERSON") continue;
    const navne = r.deltager.navne ?? [];
    const navn = (navne.find((n: any) => !n?.periode?.gyldigTil) ?? navne[navne.length - 1])?.navn;
    if (!navn) continue;
    let bedst = Infinity;
    for (const o of r.organisationer ?? []) {
      for (const md of o?.medlemsData ?? []) {
        for (const a of md?.attributter ?? []) {
          if (a?.type !== "FUNKTION") continue;
          for (const val of a.vaerdier ?? []) {
            if (val?.periode?.gyldigTil) continue; // kun aktive
            const f = String(val?.vaerdi ?? "").toUpperCase().trim();
            const rang = RANG[f] ?? (f.startsWith("FULDT ANSVARLIG") ? 3 : undefined);
            if (rang && rang < bedst) bedst = rang;
          }
        }
      }
    }
    if (bedst < Infinity) fund.push({ navn: String(navn).trim(), rang: bedst });
  }
  if (!fund.length) return [];
  const top = Math.min(...fund.map((f) => f.rang));
  // Stiftere kun hvis der hverken er direktør eller indehaver
  return [...new Set(fund.filter((f) => f.rang === top).map((f) => f.navn))].slice(0, 2);
}

/**
 * Beriger op til ~200 virksomheder. Kun CVR-importerede nye emner (customer_type nyt_emne,
 * sources indeholder 'cvr'); eksisterende kunders kontaktpersoner røres ikke.
 * Virksomheder, der allerede har en kontaktperson med samme navn, springes over.
 */
export async function berigDirektoerer(
  sb: any,
  companyIds: string[],
  creds: { user: string; pass: string },
): Promise<{ fundet: number; oprettet: number }> {
  if (!companyIds.length) return { fundet: 0, oprettet: 0 };
  const { data: comps, error } = await sb
    .from("companies")
    .select("id, cvr, customer_type, sources")
    .in("id", companyIds)
    .eq("customer_type", "nyt_emne")
    .not("cvr", "is", null);
  if (error) throw new Error(error.message);
  const kandidater = ((comps ?? []) as any[]).filter((c) => (c.sources ?? []).includes("cvr") && /^\d{8}$/.test(String(c.cvr).trim()));
  if (!kandidater.length) return { fundet: 0, oprettet: 0 };

  const cvrs = [...new Set(kandidater.map((c) => parseInt(String(c.cvr).trim(), 10)))];
  const res = await fetch(CVR_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${creds.user}:${creds.pass}`),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ _source: KILDE, query: { terms: { "Vrvirksomhed.cvrNummer": cvrs } }, size: cvrs.length }),
  });
  if (!res.ok) throw new Error(`CVR-fejl ${res.status}`);
  const json: any = await res.json();
  const navnePrCvr = new Map<string, string[]>();
  for (const h of json?.hits?.hits ?? []) {
    const v = h?._source?.Vrvirksomhed;
    if (!v) continue;
    const n = direktoererFraCvr(v);
    if (n.length) navnePrCvr.set(String(v.cvrNummer).padStart(8, "0"), n);
  }

  const ids = kandidater.map((c) => c.id);
  const { data: eksist } = await sb.from("contacts").select("company_id, name").in("company_id", ids);
  const har = new Set(((eksist ?? []) as any[]).map((k) => `${k.company_id}|${String(k.name).toLowerCase().trim()}`));

  let fundet = 0;
  const rows: any[] = [];
  for (const c of kandidater) {
    const navne = navnePrCvr.get(String(c.cvr).trim().padStart(8, "0"));
    if (!navne?.length) continue;
    fundet++;
    navne.forEach((navn, i) => {
      if (har.has(`${c.id}|${navn.toLowerCase()}`)) return;
      rows.push({ company_id: c.id, name: navn, title: DIREKTOER_TITEL, is_primary: i === 0, phone: null, email: null });
    });
  }
  if (rows.length) {
    const { error: e2 } = await sb.from("contacts").insert(rows);
    if (e2) throw new Error(e2.message);
  }
  return { fundet, oprettet: rows.length };
}
