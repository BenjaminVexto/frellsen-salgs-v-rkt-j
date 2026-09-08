// Client-side parser for Visma invoice journal.
// Input: raw xlsx/csv file (ISO-8859-1 for CSV, no header, 18 positional cols).
// Output: rå detaljelinjer til public.invoice_lines. Aggregaterne beregnes i
// databasen (rebuild_sales_aggregates) — ikke længere i browseren.

import * as XLSX from "xlsx";
import Papa from "papaparse";
import { readFileSmart } from "./file-encoding";


const COL = {
  FIRMA: 0,
  AFDELING: 1,
  ORDER_NO: 2,
  DATE: 3,
  DELIVERY: 4,
  KUNDENAVN: 5,
  KPG1: 6,
  KPG2: 7,
  VARENR: 8,
  DESC: 9,
  QTY: 10,
  GROUP1: 11,
  GROUP2: 12,
  NETTOVAEGT: 13,
  KOSTPRIS: 14,
  ENHEDSPRIS: 15,
  REVENUE: 16,
  DB: 17,
  DG: 18,
  INITIALER: 19,
} as const;


// Kun firma 10 (Frellsen Kaffe) må importeres. Alt andet (20/30/40/50/70 …) springes over.
const ALLOWED_FIRMA = "10";

export function parseDanishNumber(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (raw == null) return 0;
  let s = String(raw).trim().replace(/\s+/g, "");
  if (!s) return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Danish: 1.234,56 → strip dots, comma to dot
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    // Danish: 1234,56 or 1,5
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function makeUtcDate(y: number, m: number, day: number): Date | null {
  if (m < 1 || m > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(y, m - 1, day));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/**
 * Shared Danish-date parser brugt af alle imports (visma, anden, maskiner,
 * prismatrix, fakturajournal). Håndterer:
 *   - Date-instans (fra xlsx cellFormat:false)
 *   - YYYYMMDD (8 cifre, ingen separator — Visma faktura)
 *   - YYYY-MM-DD / YYYY/M/D (ISO; swap hvis måned>12 og dag<=12)
 *   - DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY (dansk)
 *   - 2-cifret år → 19xx hvis >50, ellers 20xx
 *   - Fallback: new Date(s)
 */
export function parseDanishDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return isNaN(+raw) ? null : raw;
  const s = String(raw).trim();
  if (!s || s === "0") return null;

  // YYYYMMDD (8 digits, no separator) — Visma fakturajournal
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return makeUtcDate(+compact[1], +compact[2], +compact[3]);
  }

  // ISO-lignende: YYYY-MM-DD eller YYYY/M/D (med swap-defensiv hvis måned>12)
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const y = +iso[1];
    let m = +iso[2];
    let day = +iso[3];
    if (m > 12 && day <= 12) [m, day] = [day, m];
    return makeUtcDate(y, m, day);
  }

  // Dansk DD[-./]MM[-./]YY(YY)
  const dk = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
  if (dk) {
    const day = +dk[1];
    const m = +dk[2];
    let y = +dk[3];
    if (dk[3].length === 2) y = y > 50 ? 1900 + y : 2000 + y;
    return makeUtcDate(y, m, day);
  }

  // Sidste udvej
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Returnerer YYYY-MM-DD (UTC) eller null. Bekvem til DB-insert. */
export function parseDanishDateIso(raw: unknown): string | null {
  const d = parseDanishDate(raw);
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type DateFormat = "us" | "dk";

export type DateFormatDetection = {
  format: DateFormat;
  usEvidence: number;
  dkEvidence: number;
  confident: boolean;
  ambiguous: number;
};

/**
 * Selv-verificerende detektor til D/M/Å vs M/D/Å. Kigger kun på utvetydige
 * eksempler (hvor den ene position er > 12 og dermed kun kan være dag).
 */
export function detectDateFormat(rawValues: unknown[]): DateFormatDetection {
  let usEvidence = 0;
  let dkEvidence = 0;
  let ambiguous = 0;
  for (const raw of rawValues) {
    if (raw == null) continue;
    if (raw instanceof Date) continue;
    const s = String(raw).trim();
    if (!s) continue;
    const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const aCanBeMonth = a >= 1 && a <= 12;
    const bCanBeMonth = b >= 1 && b <= 12;
    if (a > 12 && bCanBeMonth) {
      dkEvidence++;
    } else if (b > 12 && aCanBeMonth) {
      usEvidence++;
    } else if (aCanBeMonth && bCanBeMonth) {
      ambiguous++;
    }
  }
  const format: DateFormat = usEvidence > dkEvidence ? "us" : "dk";
  const confident =
    usEvidence + dkEvidence >= 3 && (usEvidence === 0 || dkEvidence === 0);
  return { format, usEvidence, dkEvidence, confident, ambiguous };
}

/**
 * Parser en dato med et allerede detekteret format. Falder tilbage til
 * parseDanishDateIso for ISO / YYYYMMDD / tekstformater.
 */
export function parseDateWithFormat(raw: unknown, format: DateFormat): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) return isNaN(+raw) ? null : raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  if (!s || s === "0") return null;
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!m) return parseDanishDateIso(raw);
  const month = format === "us" ? parseInt(m[1], 10) : parseInt(m[2], 10);
  const day = format === "us" ? parseInt(m[2], 10) : parseInt(m[1], 10);
  let year = parseInt(m[3], 10);
  if (m[3].length === 2) year = year > 50 ? 1900 + year : 2000 + year;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return isNaN(+d) ? null : d.toISOString().slice(0, 10);
}



function monthStart(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/**
 * Én rå detaljelinje fra fakturajournalen, gemt 1:1 i public.invoice_lines.
 * Ingen forretningsregler er anvendt: interne posteringer (beløb 0, DB ≠ 0)
 * er med, og alle 20 kolonner bevares — også dem vi ikke bruger i dag.
 */
export type InvoiceLineRaw = {
  firma_nr: string | null;
  kilde_afdeling_nr: number | null;
  afdeling_nr: number;
  ordre_nr: string | null;
  faktura_dato: string; // YYYY-MM-DD
  visma_delivery_no: string;
  kunde_navn: string | null;
  kundeprisgruppe_1: string | null;
  kundeprisgruppe_2: string | null;
  varenr: string | null;
  varetekst: string | null;
  antal: number | null;
  varegruppe_1: string | null;
  varegruppe_2: string | null;
  nettovaegt: number | null;
  kostpris: number | null;
  enhedspris: number | null;
  beloeb: number | null;
  db: number | null;
  dg: number | null;
  initialer: string | null;
};


export type ParseStats = {
  linesRead: number;
  internalServicePostings: number;
  invalidLines: number;
  skippedFirma: number;
  skippedFirmaSamples: string[];
  uniqueDeliveryNos: number;
  periodFrom: string | null;
  periodTo: string | null;
  /** Præcis tidligste/seneste fakturadato i filen (YYYY-MM-DD). */
  dateFrom: string | null;
  dateTo: string | null;
  totalRevenue: number;
  /** Antal detaljelinjer pr. afdeling (nøgle = afdeling_nr som streng). */
  rowsByAfdeling: Record<string, number>;
};

/** Afdelingsopslag brugt til firma-filter og afdelingsvalidering. */
export type AfdelingRef = { afdeling_nr: number; firma_nr: number | null };

/** Række fra public.afdeling_alias: kildeværdi i Visma → kanonisk afdeling. */
export type AfdelingAliasRef = { kilde_afdeling_nr: number; afdeling_nr: number };

/**
 * Byg et opslag fra kildeafdeling til kanonisk afdeling. Identitetsrækkerne
 * (11→11 osv.) ligger i tabellen med vilje, så importen kun har ét opslag.
 */
export function buildAfdelingAliasMap(aliases: AfdelingAliasRef[] | undefined): Map<number, number> {
  const m = new Map<number, number>();
  for (const a of aliases ?? []) {
    if (Number.isFinite(a?.kilde_afdeling_nr) && Number.isFinite(a?.afdeling_nr)) {
      m.set(Number(a.kilde_afdeling_nr), Number(a.afdeling_nr));
    }
  }
  return m;
}

/**
 * Oversæt en rå kildeafdelingsværdi til kanonisk afdeling_nr.
 * Returnerer null hvis værdien er ukendt (→ filen skal afvises).
 * Når alias-map er tomt (endnu ikke hentet) falder vi tilbage til råværdien.
 */
export function mapAfdeling(raw: unknown, aliasMap: Map<number, number>): number | null {
  const n = parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return null;
  if (!aliasMap.size) return n;
  return aliasMap.get(n) ?? null;
}

export type ParseOptions = {
  /**
   * Gyldige afdelinger (hentet fra public.afdeling). Når listen er sat:
   *  - firma-filteret bruger afdelingstabellens firma_nr i stedet for hardkodet "10"
   *  - detaljerækker med en ukendt afdelingsværdi afviser hele filen
   */
  afdelinger?: AfdelingRef[];
  /**
   * Alias-rækker fra public.afdeling_alias. Kildeværdien i filen (fx 13/23)
   * oversættes til kanonisk afdeling (11/21) FØR aggregering og nøgleopslag.
   */
  afdelingAliases?: AfdelingAliasRef[];
};


async function fileToRows(file: File): Promise<any[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: false, raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: false }) as any[][];
  }
  // CSV: auto-detect UTF-8 vs Windows-1252 (Visma eksporterer cp1252).
  // Space-delimited, quoted.
  const text = await readFileSmart(file);
  const parsed = Papa.parse<string[]>(text, {
    delimiter: " ",
    quoteChar: '"',
    header: false,
    skipEmptyLines: true,
  });
  return parsed.data as any[][];
}

/**
 * Parser fakturajournalen til RÅ linjer. Aggregaterne (sales_monthly,
 * sales_monthly_products, sales_top_products) beregnes i databasen ud fra
 * invoice_lines — derfor bygger parseren ingen summer længere.
 * Beholdt her: firma-filter, afdelings-alias-opslag og afvisning af ukendte
 * afdelingsværdier. De oversætter kilden, de er ikke forretningsregler.
 */
export async function parseInvoiceJournal(
  file: File,
  opts: ParseOptions = {},
): Promise<{
  /** Rå detaljelinjer — én pr. linje i filen, uden forretningsregler. */
  rawLines: InvoiceLineRaw[];
  stats: ParseStats;
}> {
  const rows = await fileToRows(file);
  const rawLines: InvoiceLineRaw[] = [];

  const stats: ParseStats = {
    linesRead: 0,
    internalServicePostings: 0,
    invalidLines: 0,
    skippedFirma: 0,
    skippedFirmaSamples: [],
    uniqueDeliveryNos: 0,
    periodFrom: null,
    periodTo: null,
    dateFrom: null,
    dateTo: null,
    totalRevenue: 0,
    rowsByAfdeling: {},
  };
  const firmaSampleSet = new Set<string>();
  const deliverySet = new Set<string>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  // Afdelingsopslag. Uden liste: bevar gammel adfærd (kun firma 10, afdeling
  // fra filen eller 11 som fallback) og ingen validering.
  const afdelingList = opts.afdelinger ?? [];
  const validAfdelinger = new Set(afdelingList.map((a) => a.afdeling_nr));
  const aliasMap = buildAfdelingAliasMap(opts.afdelingAliases);
  const allowedFirma = new Set(
    afdelingList.map((a) => (a.firma_nr == null ? "" : String(a.firma_nr))).filter(Boolean),
  );
  const unknownAfdelinger = new Set<string>();

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 20) {
      stats.invalidLines++;
      continue;
    }
    const firma = String(row[COL.FIRMA] ?? "").trim();
    // Firma-filteret frasorterer også per-kunde subtotalrækkerne, som har
    // Firma="0"/Afdeling="0". Derfor kører afdelingsvalideringen EFTER dette.
    const firmaOk = allowedFirma.size ? allowedFirma.has(firma) : !firma || firma === ALLOWED_FIRMA;
    if (!firmaOk) {
      stats.skippedFirma++;
      if (firmaSampleSet.size < 10) firmaSampleSet.add(firma);
      continue;
    }
    const afdRaw = String(row[COL.AFDELING] ?? "").trim();
    // Kildeværdien oversættes gennem afdeling_alias til kanonisk afdeling
    // (13→11, 23→21) FØR nøgleopslag.
    const mapped = mapAfdeling(afdRaw, aliasMap);
    if (validAfdelinger.size) {
      if (mapped == null || !validAfdelinger.has(mapped)) {
        unknownAfdelinger.add(afdRaw || "(tom)");
        continue;
      }
    }
    const afdeling = mapped ?? 11;

    const date = parseDanishDate(row[COL.DATE]);
    const delivery = String(row[COL.DELIVERY] ?? "").trim();
    if (!date || !delivery) {
      stats.invalidLines++;
      continue;
    }
    stats.linesRead++;
    stats.rowsByAfdeling[String(afdeling)] = (stats.rowsByAfdeling[String(afdeling)] ?? 0) + 1;
    const revenue = parseDanishNumber(row[COL.REVENUE]);
    const db = parseDanishNumber(row[COL.DB]);

    deliverySet.add(delivery);
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
    stats.totalRevenue += revenue;
    // Kun statistik til previewet — reglen anvendes ved aggregering i databasen.
    if (revenue === 0 && db !== 0) stats.internalServicePostings++;

    const dateIso = parseDanishDateIso(row[COL.DATE]) ?? date.toISOString().slice(0, 10);

    // Rådata: gem linjen som den står i filen — ingen regler anvendt her.
    const strOrNull = (v: unknown): string | null => {
      const s = String(v ?? "").trim();
      return s ? s : null;
    };
    const numOrNull = (v: unknown): number | null => {
      const s = String(v ?? "").trim();
      return s ? parseDanishNumber(v) : null;
    };
    rawLines.push({
      firma_nr: strOrNull(row[COL.FIRMA]),
      kilde_afdeling_nr: Number.isFinite(parseInt(afdRaw, 10)) ? parseInt(afdRaw, 10) : null,
      afdeling_nr: afdeling,
      ordre_nr: strOrNull(row[COL.ORDER_NO]),
      faktura_dato: dateIso,
      visma_delivery_no: delivery,
      kunde_navn: strOrNull(row[COL.KUNDENAVN]),
      kundeprisgruppe_1: strOrNull(row[COL.KPG1]),
      kundeprisgruppe_2: strOrNull(row[COL.KPG2]),
      varenr: strOrNull(row[COL.VARENR]),
      varetekst: strOrNull(row[COL.DESC]),
      antal: numOrNull(row[COL.QTY]),
      varegruppe_1: strOrNull(row[COL.GROUP1]),
      varegruppe_2: strOrNull(row[COL.GROUP2]),
      nettovaegt: numOrNull(row[COL.NETTOVAEGT]),
      kostpris: numOrNull(row[COL.KOSTPRIS]),
      enhedspris: numOrNull(row[COL.ENHEDSPRIS]),
      beloeb: numOrNull(row[COL.REVENUE]),
      db: numOrNull(row[COL.DB]),
      dg: numOrNull(row[COL.DG]),
      initialer: strOrNull(row[COL.INITIALER]),
    });
  }

  if (unknownAfdelinger.size) {
    throw new Error(
      `Fakturajournalen indeholder detaljerækker med ukendte kilde-afdelingsværdier: ${Array.from(unknownAfdelinger)
        .sort()
        .join(", ")}. Kendte kildeværdier (afdeling_alias): ${Array.from(aliasMap.keys())
        .sort((a, b) => a - b)
        .join(", ")}. Tilføj de manglende værdier i afdeling_alias.`,
    );
  }

  stats.uniqueDeliveryNos = deliverySet.size;
  stats.periodFrom = minDate ? monthStart(minDate) : null;
  stats.periodTo = maxDate ? monthStart(maxDate) : null;
  stats.dateFrom = minDate ? (minDate as Date).toISOString().slice(0, 10) : null;
  stats.dateTo = maxDate ? (maxDate as Date).toISOString().slice(0, 10) : null;
  stats.skippedFirmaSamples = Array.from(firmaSampleSet).sort();

  return { rawLines, stats };
}

