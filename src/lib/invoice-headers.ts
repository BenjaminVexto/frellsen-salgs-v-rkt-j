/** Browser-safe column matching shared by invoice parsing and its analysis preview. */
export const INVOICE_FIELDS = [
  { key: "FIRMA", label: "Firma", aliases: ["firma", "firm"] },
  { key: "AFDELING", label: "Afdeling", aliases: ["afdeling", "afd"] },
  { key: "ORDER_NO", label: "Ordrenr", aliases: ["ordrenr"] },
  { key: "DATE", label: "Fakturadato", aliases: ["fakturadato"] },
  { key: "DELIVERY", label: "Lev. kunde", aliases: ["lev kunde", "lev kund", "kundenr"] },
  { key: "VARENR", label: "Varenr", aliases: ["varenr"] },
  { key: "DESC", label: "Varetekst", aliases: ["beskrivelse", "varetekst"] },
  { key: "QTY", label: "Antal", aliases: ["antal"] },
  { key: "GROUP1", label: "Varegruppe 1", aliases: ["produktprisgruppe 1"] },
  { key: "GROUP2", label: "Varegruppe 2", aliases: ["produktprisgruppe 2"] },
  { key: "NETTOVAEGT", label: "Nettovægt", aliases: ["nettovægt", "netto vægt"] },
  { key: "KOSTPRIS", label: "Listepris", aliases: ["pris"] },
  { key: "ENHEDSPRIS", label: "Pris efter rabat", aliases: ["pris efter rabat"] },
  { key: "REVENUE", label: "Beløb", aliases: ["beløb"] },
  { key: "DB", label: "DB", aliases: ["db"] },
  { key: "DG", label: "DG%", aliases: ["dækningsgrad"] },
  { key: "INITIALER", label: "Initialer", aliases: ["oprettet af bruger", "initialer"] },
] as const;

export type ColMap = Record<(typeof INVOICE_FIELDS)[number]["key"], number>;
export type InvoiceHeaderReport = {
  matched: Array<{ index: number; header: string; field: string }>;
  ignored: Array<{ index: number; header: string }>;
  missing: string[];
  duplicates: Array<{ field: string; headers: string[] }>;
};

export function normalizeInvoiceHeader(value: unknown): string {
  return String(value ?? "").replace(/[\u00ad-]/g, "").toLowerCase()
    .replace(/\(kr\)/g, "").replace(/\./g, "").replace(/\s+/g, " ").trim();
}

export class InvoiceHeaderError extends Error {
  constructor(public report: InvoiceHeaderReport) {
    const messages: string[] = [];
    if (report.missing.length) messages.push(`Manglende felter: ${report.missing.join(", ")}.`);
    for (const duplicate of report.duplicates) {
      messages.push(`Dublet for ${duplicate.field}: ${duplicate.headers.join(" og ")}.`);
    }
    super(`Filen afvist — ingen data importeres. ${messages.join(" ")}`);
    this.name = "InvoiceHeaderError";
  }
}

/** At least 12 matching cells (not distinct fields) identify the first row as headers. */
export function matchInvoiceHeaders(row: unknown[]): { columns: ColMap; report: InvoiceHeaderReport } | null {
  const normalized = row.map(normalizeInvoiceHeader);
  const hasGroup2 = normalized.includes("produktprisgruppe 2");
  const found = new Map<keyof ColMap, number[]>();
  const report: InvoiceHeaderReport = { matched: [], ignored: [], missing: [], duplicates: [] };
  row.forEach((value, index) => {
    const header = String(value ?? "");
    const field = INVOICE_FIELDS.find((f) =>
      (f.aliases as readonly string[]).includes(normalized[index]) ||
      (f.key === "GROUP1" && hasGroup2 && normalized[index] === "produktprisgruppe"),
    );
    if (!field) {
      report.ignored.push({ index, header });
      return;
    }
    found.set(field.key, [...(found.get(field.key) ?? []), index]);
    report.matched.push({ index, header, field: field.label });
  });
  if (report.matched.length < 12) return null;
  const columns: Partial<ColMap> = {};
  for (const field of INVOICE_FIELDS) {
    const indices = found.get(field.key) ?? [];
    if (!indices.length) report.missing.push(field.label);
    else {
      columns[field.key] = indices[0];
      if (indices.length > 1) report.duplicates.push({
        field: field.label,
        headers: indices.map((index) => `kolonne ${index + 1} "${String(row[index] ?? "")}"`),
      });
    }
  }
  if (report.missing.length || report.duplicates.length) throw new InvoiceHeaderError(report);
  // All required keys have been checked above.
  return { columns: columns as ColMap, report };
}