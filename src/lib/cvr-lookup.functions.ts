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
  status: string;
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
  | { success: true; data: CvrCompany | CvrCompany[]; total?: number; error?: string }
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
    const body = await res.text().catch(() => "");
    const err: any = new Error(`HTTP_ERROR: ${res.status} ${body}`);
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
    name: z.string().min(2).max(100),
    location: z.string().max(20).optional(),
    size: z.number().int().min(1).max(50).optional(),
  }),
  z.object({
    type: z.literal("bulk"),
    filters: z.object({
      municipality: z.string().min(1).max(60).optional(),
      municipality_code: z.string().regex(/^\d{3,4}$/).optional(),
      branch_codes: z.array(z.string().min(2).max(10)).max(50).optional(),
      company_forms: z.array(z.string().min(1).max(40)).max(20).optional(),
    }),
    from: z.number().int().min(0).optional(),
  }),
]);

export const cvrLookup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<CvrResponse> => {
    try {

      // --- SINGLE ---
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

      // --- SEARCH ---
      if (data.type === "search") {
        const nameQuery = data.name;
        const location = data.location ?? "";
        const isPostalCode = /^\d+$/.test(location);
        const locationFilter: any[] = [];
        if (location) {
          if (isPostalCode) {
            locationFilter.push({
              term: {
                "Vrvirksomhed.virksomhedMetadata.nyesteBeliggenhedsadresse.postnummer":
                  parseInt(location, 10),
              },
            });
          } else {
            locationFilter.push({
              match: {
                "Vrvirksomhed.virksomhedMetadata.nyesteBeliggenhedsadresse.postdistrikt":
                  location,
              },
            });
          }
        }
        const payload: any = {
          _source: SOURCE_FIELDS,
          query: {
            bool: {
              must: [
                {
                  match: {
                    "Vrvirksomhed.virksomhedMetadata.nyesteNavn.navn": {
                      query: nameQuery,
                      fuzziness: "1",
                      prefix_length: 3,
                    },
                  },
                },
                {
                  bool: {
                    should: [
                      { match: { "Vrvirksomhed.virksomhedMetadata.sammensatStatus": "Aktiv" } },
                      { match: { "Vrvirksomhed.virksomhedMetadata.sammensatStatus": "NORMAL" } },
                    ],
                    minimum_should_match: 1,
                  },
                },
              ],
              filter: locationFilter,
            },
          },
          sort: [{ _score: { order: "desc" } }],
          size: data.size ?? 10,
        };
        const json = await callCvr(payload);
        const hits = json?.hits?.hits ?? [];
        const companies: CvrCompany[] = hits
          .map((h: any) => h?._source?.Vrvirksomhed)
          .filter(Boolean)
          .map(mapVirksomhed);
        if (!companies.length) return { success: false, error: "NOT_FOUND" };
        return { success: true, data: companies };
      }

      // --- BULK ---
      // Ansatte filtreres IKKE her — det gøres client-side
      // fordi ES-arrayfelterne indeholder historiske poster
      // og giver upålidelige resultater.
      // ES filtrerer kun på: status, kommune, branche, virksomhedsform.

      const f = data.filters;
      const must: any[] = [];
      const filter: any[] = [];

      // Status: aktiv + normal
      must.push({
        bool: {
          should: [
            { match: { "Vrvirksomhed.virksomhedMetadata.sammensatStatus": "Aktiv" } },
            { match: { "Vrvirksomhed.virksomhedMetadata.sammensatStatus": "NORMAL" } },
          ],
          minimum_should_match: 1,
        },
      });

      // Kommune
      let kommuneKode: string | null = null;
      if (f.municipality_code) kommuneKode = f.municipality_code.padStart(4, "0");
      else if (f.municipality) kommuneKode = resolveKommuneKode(f.municipality);
      if (f.municipality && !kommuneKode) {
        return { success: false, error: `UNKNOWN_MUNICIPALITY: ${f.municipality}` };
      }
      if (kommuneKode) {
        filter.push({
          term: {
            "Vrvirksomhed.virksomhedMetadata.nyesteBeliggenhedsadresse.kommune.kommuneKode":
              kommuneKode,
          },
        });
      }

      // Brancher: prefix-match på hoved- og bibrancher
      if (f.branch_codes && f.branch_codes.length) {
        const should: any[] = [];
        for (const code of f.branch_codes) {
          should.push({ prefix: { "Vrvirksomhed.hovedbranche.branchekode": code } });
          should.push({ prefix: { "Vrvirksomhed.bibranche1.branchekode": code } });
          should.push({ prefix: { "Vrvirksomhed.bibranche2.branchekode": code } });
          should.push({ prefix: { "Vrvirksomhed.bibranche3.branchekode": code } });
        }
        filter.push({ bool: { should, minimum_should_match: 1 } });
      }

      // Virksomhedsformer
      if (f.company_forms && f.company_forms.length) {
        filter.push({
          bool: {
            should: f.company_forms.map((form) => ({
              match: { "Vrvirksomhed.virksomhedsform.kortBeskrivelse": form },
            })),
            minimum_should_match: 1,
          },
        });
      }

      const payload: any = {
        query: { bool: { must, filter } },
        _source: SOURCE_FIELDS,
        from: data.from ?? 0,
        size: 100,
      };

      const json = await callCvr(payload);
      const hits = json?.hits?.hits ?? [];
      const companies: CvrCompany[] = hits
        .map((h: any) => h?._source?.Vrvirksomhed)
        .filter(Boolean)
        .map(mapVirksomhed);

      return {
        success: true,
        data: companies,
        total: json?.hits?.total?.value ?? json?.hits?.total ?? 0,
      };

    } catch (e: any) {
      const code = e?.code ?? "HTTP_ERROR";
      console.error("cvrLookup error:", e?.message ?? e);
      return { success: false, error: code };
    }
  });

// Twins search: by main branch prefix + employee range
const TwinsInput = z.object({
  branch_prefix: z.string().regex(/^\d{2,6}$/),
  min_employees: z.number().int().min(0).optional(),
  max_employees: z.number().int().min(0).optional(),
  municipality: z.string().min(1).max(60).optional(),
  exclude_cvr: z.array(z.string().regex(/^\d{8}$/)).max(500).optional(),
  size: z.number().int().min(1).max(50).optional(),
});

export const cvrSearchTwins = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TwinsInput.parse(input))
  .handler(async ({ data }): Promise<CvrResponse> => {
    try {
      const must: any[] = [
        {
          prefix: {
            "Vrvirksomhed.virksomhedMetadata.nyesteHovedbranche.branchekode":
              data.branch_prefix,
          },
        },
        {
          bool: {
            should: [
              { match: { "Vrvirksomhed.virksomhedMetadata.sammensatStatus": "Aktiv" } },
              { match: { "Vrvirksomhed.virksomhedMetadata.sammensatStatus": "NORMAL" } },
            ],
            minimum_should_match: 1,
          },
        },
      ];
      const filter: any[] = [];
      if (data.min_employees != null || data.max_employees != null) {
        const range: any = {};
        if (data.min_employees != null) range.gte = data.min_employees;
        if (data.max_employees != null) range.lte = data.max_employees;
        filter.push({
          range: {
            "Vrvirksomhed.virksomhedMetadata.nyesteAarsbeskaeftigelse.antalAnsatte":
              range,
          },
        });
      }
      if (data.municipality) {
        filter.push({
          match: {
            "Vrvirksomhed.virksomhedMetadata.nyesteBeliggenhedsadresse.kommune.kommuneNavn":
              data.municipality,
          },
        });
      }
      const mustNot: any[] = [];
      if (data.exclude_cvr?.length) {
        mustNot.push({
          terms: {
            "Vrvirksomhed.cvrNummer": data.exclude_cvr.map((c) => parseInt(c, 10)),
          },
        });
      }
      const payload = {
        _source: SOURCE_FIELDS,
        query: { bool: { must, filter, must_not: mustNot } },
        size: data.size ?? 50,
      };
      const json = await callCvr(payload);
      const hits = json?.hits?.hits ?? [];
      const companies: CvrCompany[] = hits
        .map((h: any) => h?._source?.Vrvirksomhed)
        .filter(Boolean)
        .map(mapVirksomhed);
      return {
        success: true,
        data: companies,
        total: json?.hits?.total?.value ?? json?.hits?.total ?? 0,
      };
    } catch (e: any) {
      const code = e?.code ?? "HTTP_ERROR";
      console.error("cvrSearchTwins error:", e?.message ?? e);
      return { success: false, error: code };
    }
  });
