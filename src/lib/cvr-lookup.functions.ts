import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveKommuneKode } from "./cvr-kommuner";

const CVR_ES_URL =
  "http://distribution.virk.dk/cvr-permanent/virksomhed/_search";

export type CvrCompany = {
  cvr: string;
  name: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  municipality: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  company_form: string | null;
  status: "AKTIV" | "OPLØST" | "KONKURS" | "UKENDT" | string;
  start_date: string | null;
  ad_protection: boolean;
  employees_interval: string | null;
  employees_source: string | null;
  main_branch_code: string | null;
  main_branch_text: string | null;
  sub_branch_1_code: string | null;
  sub_branch_1_text: string | null;
  sub_branch_2_code: string | null;
  sub_branch_2_text: string | null;
  sub_branch_3_code: string | null;
  sub_branch_3_text: string | null;
};

export type CvrResponse =
  | { success: true; data: CvrCompany | CvrCompany[]; error?: string }
  | { success: false; error: string; data?: null };

const SOURCE_FIELDS = [
  "Vrvirksomhed.cvrNummer",
  "Vrvirksomhed.virksomhedMetadata.nyesteNavn.navn",
  "Vrvirksomhed.virksomhedMetadata.nyesteBeliggenhedsadresse",
  "Vrvirksomhed.virksomhedMetadata.nyesteTelefonnummer",
  "Vrvirksomhed.virksomhedMetadata.nyesteElektroniskPost",
  "Vrvirksomhed.virksomhedMetadata.nyesteHjemmeside",
  "Vrvirksomhed.virksomhedMetadata.sammensatStatus",
  "Vrvirksomhed.virksomhedsform",
  "Vrvirksomhed.livsforloeb",
  "Vrvirksomhed.reklamebeskyttelse",
  "Vrvirksomhed.hovedbranche",
  "Vrvirksomhed.bibranche1",
  "Vrvirksomhed.bibranche2",
  "Vrvirksomhed.bibranche3",
  "Vrvirksomhed.aarsbeskaeftigelse",
  "Vrvirksomhed.kvartalsbeskaeftigelse",
  "Vrvirksomhed.maanedsbeskaeftigelse",
];

function pickLatest<T extends { periode?: { gyldigFra?: string | null; gyldigTil?: string | null } }>(
  arr: T[] | undefined | null,
): T | null {
  if (!arr || !arr.length) return null;
  // Foretræk poster uden gyldigTil (stadig aktive); ellers seneste gyldigFra
  const active = arr.filter((x) => !x?.periode?.gyldigTil);
  const list = active.length ? active : arr;
  return [...list].sort((a, b) => {
    const da = a?.periode?.gyldigFra ?? "";
    const db = b?.periode?.gyldigFra ?? "";
    return db.localeCompare(da);
  })[0];
}

function mapVirksomhed(v: any): CvrCompany {
  const meta = v?.virksomhedMetadata ?? {};
  const addr = meta?.nyesteBeliggenhedsadresse ?? null;

  const vejnavn = addr?.vejnavn ?? "";
  const husnr = addr?.husnummerFra != null ? String(addr.husnummerFra) : "";
  const husnrTil = addr?.husnummerTil != null ? `-${addr.husnummerTil}` : "";
  const bogstavFra = addr?.bogstavFra ?? "";
  const etage = addr?.etage ? `, ${addr.etage}.` : "";
  const sidedoer = addr?.sidedoer ? ` ${addr.sidedoer}` : "";
  const addressLine = vejnavn
    ? `${vejnavn} ${husnr}${bogstavFra}${husnrTil}${etage}${sidedoer}`.trim()
    : null;

  const form = pickLatest<any>(v?.virksomhedsform);
  const liv = pickLatest<any>(v?.livsforloeb);
  const hoved = pickLatest<any>(v?.hovedbranche);
  const bi1 = pickLatest<any>(v?.bibranche1);
  const bi2 = pickLatest<any>(v?.bibranche2);
  const bi3 = pickLatest<any>(v?.bibranche3);

  // Antal ansatte: foretræk månedlig, derefter kvartal, derefter år
  const mnd = pickLatest<any>(v?.maanedsbeskaeftigelse);
  const kvt = pickLatest<any>(v?.kvartalsbeskaeftigelse);
  const aar = pickLatest<any>(v?.aarsbeskaeftigelse);
  let employees_interval: string | null = null;
  let employees_source: string | null = null;
  if (mnd?.intervalKodeAntalAnsatte) {
    employees_interval = String(mnd.intervalKodeAntalAnsatte).replace(/^ANTAL_/, "");
    employees_source = "maaned";
  } else if (kvt?.intervalKodeAntalAnsatte) {
    employees_interval = String(kvt.intervalKodeAntalAnsatte).replace(/^ANTAL_/, "");
    employees_source = "kvartal";
  } else if (aar?.intervalKodeAntalAnsatte) {
    employees_interval = String(aar.intervalKodeAntalAnsatte).replace(/^ANTAL_/, "");
    employees_source = "aar";
  }

  return {
    cvr: v?.cvrNummer != null ? String(v.cvrNummer) : "",
    name: meta?.nyesteNavn?.navn ?? null,
    address: addressLine,
    zip: addr?.postnummer != null ? String(addr.postnummer) : null,
    city: addr?.postdistrikt ?? null,
    municipality: addr?.kommune?.kommuneNavn ?? null,
    phone: meta?.nyesteTelefonnummer?.kontaktoplysning ?? null,
    email: meta?.nyesteElektroniskPost?.kontaktoplysning ?? null,
    website: meta?.nyesteHjemmeside?.kontaktoplysning ?? null,
    company_form: form?.kortBeskrivelse ?? form?.virksomhedsformkode ?? null,
    status: meta?.sammensatStatus ?? "UKENDT",
    start_date: liv?.periode?.gyldigFra ?? null,
    ad_protection: Boolean(v?.reklamebeskyttelse),
    employees_interval,
    employees_source,
    main_branch_code: hoved?.branchekode ?? null,
    main_branch_text: hoved?.branchetekst ?? null,
    sub_branch_1_code: bi1?.branchekode ?? null,
    sub_branch_1_text: bi1?.branchetekst ?? null,
    sub_branch_2_code: bi2?.branchekode ?? null,
    sub_branch_2_text: bi2?.branchetekst ?? null,
    sub_branch_3_code: bi3?.branchekode ?? null,
    sub_branch_3_text: bi3?.branchetekst ?? null,
  };
}

async function callCvr(payload: unknown): Promise<any> {
  const user = process.env.CVR_USERNAME;
  const pass = process.env.CVR_PASSWORD;
  if (!user || !pass) throw new Error("CONFIG_ERROR: CVR_USERNAME/CVR_PASSWORD mangler");
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(CVR_ES_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const err: any = new Error("NETWORK_ERROR");
    err.code = "NETWORK_ERROR";
    throw err;
  }
  if (!res.ok) {
    const err: any = new Error(`HTTP_ERROR: ${res.status}`);
    err.code = "HTTP_ERROR";
    throw err;
  }
  return res.json();
}

const InputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("single"),
    cvr: z.string().regex(/^\d{8}$/, "CVR skal være 8 cifre"),
  }),
  z.object({
    type: z.literal("search"),
    name: z.string().min(2).max(200),
    location: z.string().min(1).max(100).optional(),
    size: z.number().int().min(1).max(50).optional(),
  }),
  z.object({
    type: z.literal("bulk"),
    filters: z.object({
      municipality: z.string().min(1).max(60).optional(),
      municipality_code: z.string().regex(/^\d{3,4}$/).optional(),
      branch_codes: z.array(z.string().min(2).max(10)).max(50).optional(),
      min_employees: z.number().int().min(0).max(100000).optional(),
      max_employees: z.number().int().min(0).max(100000).optional(),
      company_forms: z.array(z.string().min(1).max(20)).max(20).optional(),
      status: z.string().min(1).max(20).optional(),
    }),
    size: z.number().int().min(1).max(1000).optional(),
  }),
]);

export const cvrLookup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<CvrResponse> => {
    try {
      if (data.type === "single") {
        const payload = {
          _source: SOURCE_FIELDS,
          query: { term: { "Vrvirksomhed.cvrNummer": data.cvr } },
          size: 1,
        };
        const json = await callCvr(payload);
        const hit = json?.hits?.hits?.[0]?._source?.Vrvirksomhed;
        if (!hit) return { success: false, error: "NOT_FOUND" };
        return { success: true, data: mapVirksomhed(hit) };
      }

      // bulk
      const f = data.filters;
      const must: any[] = [];
      const filter: any[] = [];

      const status = f.status ?? "AKTIV";
      must.push({ term: { "Vrvirksomhed.virksomhedMetadata.sammensatStatus": status } });

      // Kommune
      let kommuneKode: string | null = null;
      if (f.municipality_code) kommuneKode = f.municipality_code.padStart(4, "0");
      else if (f.municipality) kommuneKode = resolveKommuneKode(f.municipality);
      if (f.municipality && !kommuneKode) {
        return { success: false, error: `UNKNOWN_MUNICIPALITY: ${f.municipality}` };
      }
      if (kommuneKode) {
        filter.push({
          term: { "Vrvirksomhed.beliggenhedskommune.kommuneKode": kommuneKode },
        });
      }

      // Brancher: match i hovedbranche ELLER bibranche1/2/3
      if (f.branch_codes && f.branch_codes.length) {
        const should: any[] = [];
        for (const code of f.branch_codes) {
          should.push({ term: { "Vrvirksomhed.hovedbranche.branchekode": code } });
          should.push({ term: { "Vrvirksomhed.bibranche1.branchekode": code } });
          should.push({ term: { "Vrvirksomhed.bibranche2.branchekode": code } });
          should.push({ term: { "Vrvirksomhed.bibranche3.branchekode": code } });
        }
        filter.push({ bool: { should, minimum_should_match: 1 } });
      }

      // Virksomhedsformer
      if (f.company_forms && f.company_forms.length) {
        filter.push({
          bool: {
            should: f.company_forms.map((form) => ({
              term: { "Vrvirksomhed.virksomhedsform.kortBeskrivelse": form },
            })),
            minimum_should_match: 1,
          },
        });
      }

      const payload: any = {
        query: { bool: { must, filter } },
        _source: SOURCE_FIELDS,
        size: data.size ?? 500,
      };

      const json = await callCvr(payload);
      const hits = json?.hits?.hits ?? [];
      let companies: CvrCompany[] = hits
        .map((h: any) => h?._source?.Vrvirksomhed)
        .filter(Boolean)
        .map(mapVirksomhed);

      // Filtrér ansatte-interval i kode, da ES-feltet er en interval-kode (ikke et tal)
      if (f.min_employees != null || f.max_employees != null) {
        const min = f.min_employees ?? 0;
        const max = f.max_employees ?? Number.MAX_SAFE_INTEGER;
        companies = companies.filter((c) => {
          if (!c.employees_interval) return false;
          // Eksempler: "10_19", "1_4", "100_199", "ANTAL_0" -> 0
          const parts = c.employees_interval.split("_").map((p) => parseInt(p, 10));
          const lo = isNaN(parts[0]) ? null : parts[0];
          const hi = parts.length > 1 && !isNaN(parts[1]) ? parts[1] : lo;
          if (lo == null) return false;
          return (hi ?? lo) >= min && lo <= max;
        });
      }

      return { success: true, data: companies };
    } catch (e: any) {
      const code = e?.code ?? (e?.message?.startsWith("NETWORK_ERROR") ? "NETWORK_ERROR" : "HTTP_ERROR");
      console.error("cvrLookup error:", e);
      return { success: false, error: code };
    }
  });
