/**
 * Byg ES-forespørgsel til CVR-bulk-søgning. Ansatte filtreres på
 * nyeste-felterne med samme prioritet som visningen: måned → kvartal → år.
 */
export const EMP_FIELDS = [
  "Vrvirksomhed.virksomhedMetadata.nyesteMaanedsbeskaeftigelse.intervalKodeAntalAnsatte",
  "Vrvirksomhed.virksomhedMetadata.nyesteKvartalsbeskaeftigelse.intervalKodeAntalAnsatte",
  "Vrvirksomhed.virksomhedMetadata.nyesteAarsbeskaeftigelse.intervalKodeAntalAnsatte",
] as const;

export const PHONE_FIELD = "Vrvirksomhed.telefonNummer.kontaktoplysning";
const ADDR = "Vrvirksomhed.virksomhedMetadata.nyesteBeliggenhedsadresse";

export type BulkFilters = {
  municipality_codes?: string[];
  include_ceased?: boolean;
  branch_codes?: string[];
  company_forms?: string[];
  /** CVR-koder uden ANTAL_, fx "50_99", "1000_999999" */
  employee_codes?: string[];
  include_unknown_employees?: boolean;
  only_phone?: boolean;
  zip_from?: number;
  zip_to?: number;
};

/** Ansatte-filter i ES med prioritet måned → kvartal → år. */
export function employeeQuery(codes: string[], includeUnknown: boolean): any | null {
  if (!codes.length) return null;
  const full = codes.map((c) => `ANTAL_${c}`);
  const [m, k, a] = EMP_FIELDS;
  const ex = (f: string) => ({ exists: { field: f } });
  const should: any[] = [
    { terms: { [m]: full } },
    { bool: { must_not: [ex(m)], filter: [{ terms: { [k]: full } }] } },
    { bool: { must_not: [ex(m), ex(k)], filter: [{ terms: { [a]: full } }] } },
  ];
  if (includeUnknown) should.push({ bool: { must_not: [ex(m), ex(k), ex(a)] } });
  return { bool: { should, minimum_should_match: 1 } };
}

export function buildBulkQuery(f: BulkFilters): any {
  const filter: any[] = [];
  if (!f.include_ceased) {
    filter.push({
      bool: {
        should: [
          { match: { "Vrvirksomhed.virksomhedMetadata.sammensatStatus": "Aktiv" } },
          { match: { "Vrvirksomhed.virksomhedMetadata.sammensatStatus": "NORMAL" } },
        ],
        minimum_should_match: 1,
      },
    });
  }
  if (f.municipality_codes?.length) {
    filter.push({ terms: { [`${ADDR}.kommune.kommuneKode`]: f.municipality_codes.map((k) => k.padStart(4, "0")) } });
  }
  if (f.zip_from != null || f.zip_to != null) {
    const r: any = {};
    if (f.zip_from != null) r.gte = f.zip_from;
    if (f.zip_to != null) r.lte = f.zip_to;
    filter.push({ range: { [`${ADDR}.postnummer`]: r } });
  }
  if (f.branch_codes?.length) {
    const should: any[] = [];
    for (const code of f.branch_codes) {
      for (const fld of ["hovedbranche", "bibranche1", "bibranche2", "bibranche3"]) {
        should.push({ prefix: { [`Vrvirksomhed.${fld}.branchekode`]: code } });
      }
    }
    filter.push({ bool: { should, minimum_should_match: 1 } });
  }
  if (f.company_forms?.length) {
    filter.push({
      bool: {
        should: f.company_forms.map((form) => ({ match: { "Vrvirksomhed.virksomhedsform.kortBeskrivelse": form } })),
        minimum_should_match: 1,
      },
    });
  }
  const emp = employeeQuery(f.employee_codes ?? [], !!f.include_unknown_employees);
  if (emp) filter.push(emp);
  if (f.only_phone) filter.push({ exists: { field: PHONE_FIELD } });
  return { bool: { filter } };
}

/** Samme prioritet som ES-filteret og mapVirksomhed. Koden er uden ANTAL_. */
export function matchesEmployeeCodes(emp: string | null, codes: string[], includeUnknown: boolean): boolean {
  if (!codes.length) return true;
  if (!emp) return includeUnknown;
  return codes.includes(emp);
}
