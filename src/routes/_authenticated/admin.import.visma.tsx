import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import {
  createImportBatch,
  importUpsertCompaniesByCvr,
  importInsertCompaniesNoCvr,
  importUpdateCompaniesById,
  importInsertLocations,
  importAssignSellersToCompanies,
  importUpsertContacts,
  enrichCompaniesFromCvr,
} from "@/lib/admin-companies.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileUp,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { importRunner, useImportRunner } from "@/lib/import-runner";

export const Route = createFileRoute("/_authenticated/admin/import/visma")({
  component: ImportSide,
});

type SystemField =
  | "cvr"
  | "name"
  | "address"
  | "zip"
  | "city"
  | "municipality"
  | "industry"
  | "employees"
  | "phone"
  | "email"
  | "website"
  | "created_in_visma"
  | "last_purchase_date"
  | "customer_segment_1"
  | "customer_segment_2"
  | "customer_segment_3"
  | "visma_id"
  | "visma_delivery_id"
  | "contact_person"
  | "salesperson_no"
  | "ean_number"
  | "parent_cvr"
  | "is_public"
  // Lokations-felter (kan også mappes; en række pr. unik visma_delivery_id bliver til én lokation)
  | "location_address"
  | "location_zip"
  | "location_city"
  | "location_phone"
  | "location_email"
  | "location_contact_person";

// Felter der gemmes direkte på companies-tabellen
const COMPANY_DB_FIELDS = new Set<SystemField>([
  "cvr", "name", "address", "zip", "city", "municipality", "industry",
  "employees", "phone", "email", "website",
  "created_in_visma", "last_purchase_date",
  "customer_segment_1", "customer_segment_2", "customer_segment_3",
  "visma_id", "visma_delivery_id", "contact_person",
  "ean_number", "parent_cvr", "is_public",
]);

const LOCATION_FIELDS = new Set<SystemField>([
  "location_address", "location_zip", "location_city",
  "location_phone", "location_email", "location_contact_person",
]);

const DATE_FIELDS = new Set<SystemField>(["created_in_visma", "last_purchase_date"]);
const BOOLEAN_FIELDS = new Set<SystemField>(["is_public"]);

const SYSTEM_FIELDS: { key: SystemField; label: string }[] = [
  { key: "cvr", label: "CVR" },
  { key: "name", label: "Navn" },
  { key: "address", label: "Adresse (fakturering)" },
  { key: "zip", label: "Postnummer (fakturering)" },
  { key: "city", label: "By (fakturering)" },
  { key: "municipality", label: "Kommune" },
  { key: "industry", label: "Branche" },
  { key: "employees", label: "Antal ansatte" },
  { key: "phone", label: "Telefon" },
  { key: "email", label: "Email" },
  { key: "website", label: "Hjemmeside" },
  { key: "created_in_visma", label: "Oprettet dato" },
  { key: "last_purchase_date", label: "Sidste varekøb" },
  { key: "customer_segment_1", label: "Kundesegmentering 1" },
  { key: "customer_segment_2", label: "Kundesegmentering 2" },
  { key: "customer_segment_3", label: "Kundesegmentering 3" },
  { key: "visma_id", label: "Visma kundenummer (Fakt. kunde)" },
  { key: "visma_delivery_id", label: "Visma leveringsnummer (Lev. kund)" },
  { key: "contact_person", label: "Kontaktperson" },
  { key: "salesperson_no", label: "Sælgernummer" },
  { key: "ean_number", label: "EAN-nummer" },
  { key: "parent_cvr", label: "Overordnet CVR (kommunens)" },
  { key: "is_public", label: "Er offentlig institution (ja/nej)" },
  // Lokationer
  { key: "location_address", label: "Lokation: Adresselinje 1" },
  { key: "location_zip", label: "Lokation: Postnr." },
  { key: "location_city", label: "Lokation: By" },
  { key: "location_contact_person", label: "Lokation: Ref person" },
  { key: "location_phone", label: "Lokation: Telefonnr.1" },
  { key: "location_email", label: "Lokation: E-mailadresse" },
];

const AUTO_MATCH: Record<SystemField, string[]> = {
  cvr: ["cvr", "cvrnr", "cvr_nr", "cvr_nummer"],
  name: ["navn", "name", "virksomhed", "firmanavn", "selskab"],
  address: ["adresselinje_2", "adresse", "address", "vejnavn", "gade"],
  zip: ["postnummer", "postnr", "zip", "postcode"],
  city: ["by", "city", "bynavn"],
  municipality: ["kommune", "municipality"],
  industry: ["branche", "industri", "industry"],
  employees: ["ansatte", "medarbejdere", "employees", "antal_ansatte"],
  phone: ["telefon", "tlf", "phone", "mobil"],
  email: ["email", "mail", "e_mail"],
  website: ["hjemmeside", "website", "web", "url"],
  created_in_visma: ["oprettet", "oprettet_dato", "created", "created_in_visma"],
  last_purchase_date: ["sidste_varekøb", "sidste_varekoeb", "sidste_køb", "last_purchase", "last_purchase_date"],
  customer_segment_1: ["kundesegment_1", "kundesegmentering_1", "segment_1", "prisgruppe"],
  customer_segment_2: ["kundesegment_2", "kundesegmentering_2", "segment_2", "maskinstatus"],
  customer_segment_3: ["kundesegment_3", "kundesegmentering_3", "segment_3", "kundetype"],
  visma_id: ["visma_id", "visma_kundenummer", "fakt_kunde", "fakturakunde", "kundenummer"],
  visma_delivery_id: ["visma_leveringsnummer", "lev_kund", "lev_kunde", "leveringsnummer"],
  contact_person: ["kontaktperson", "kontakt", "contact_person"],
  salesperson_no: ["sælger", "saelger", "sælgernummer", "saelgernummer", "salesperson", "sælgernr", "saelgernr"],
  ean_number: ["ean", "ean_nr", "ean_nummer", "ean_lokationsnummer", "ean_lokation"],
  parent_cvr: ["overordnet_cvr", "kommune_cvr", "parent_cvr", "moder_cvr"],
  is_public: ["offentlig", "er_offentlig", "is_public", "offentlig_institution"],
  location_address: ["adresselinje_2", "lev_adresse", "leveringsadresse"],
  location_zip: ["lev_postnr", "leveringspostnr"],
  location_city: ["lev_by", "leveringsby"],
  location_phone: ["telefonnr_1", "telefonnr1", "lev_telefon"],
  location_email: ["e_mailadresse", "lev_email"],
  location_contact_person: ["ref_person", "kontaktperson_lev"],
};

// Visma debitorliste → systemfelter (eksakt headerne fra Visma CSV)
const VISMA_MAPPING: Partial<Record<SystemField, string[]>> = {
  cvr: ["CVR nr.", "CVR nr"],
  name: ["Navn"],
  address: ["Adresselinje 2"],
  zip: ["Postnr."],
  city: ["By"],
  phone: ["Telefonnr.1"],
  email: ["E-mailadresse"],
  created_in_visma: ["Oprettet dato"],
  last_purchase_date: ["Sidste Varekøb"],
  customer_segment_1: ["Kundeprisgruppe 1"],
  customer_segment_2: ["Kundeprisgruppe 2"],
  customer_segment_3: ["Kundeprisgruppe 3"],
  visma_id: ["Fakt. kunde"],
  visma_delivery_id: ["Lev. kund"],
  contact_person: ["Ref person"],
  salesperson_no: ["Sælger"],
  ean_number: ["EAN nr."],
  location_address: ["Adresselinje 2"],
  location_zip: ["Postnr."],
  location_city: ["By"],
  location_contact_person: ["Ref person"],
  location_phone: ["Telefonnr.1"],
  location_email: ["E-mailadresse"],
};

type VismaFilters = {
  excludeInternal: boolean;
  excludeForeign: boolean;
  excludeCreditBlocked: boolean;
};


function parseBool(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (["true", "1", "ja", "yes", "y", "j", "x", "sand"].includes(s)) return true;
  if (["false", "0", "nej", "no", "n", "falsk"].includes(s)) return false;
  return null;
}
function normEan(v: string | undefined | null): string | null {
  if (!v) return null;
  const digits = String(v).replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

// Virksomheds-nøgle = (lower(name), visma_id). Bruges som dedup-nøgle ved import.
// Returnerer null hvis navn eller visma_id mangler — så falder vi tilbage til
// name-match eller insert-uden-nøgle.
function companyKey(
  name: string | null | undefined,
  vismaId: string | null | undefined,
): string | null {
  const n = (name ?? "").trim().toLowerCase();
  const v = (vismaId ?? "").trim();
  if (!n || !v) return null;
  return `${n}|${v}`;
}

type ParsedRow = Record<string, string>;

interface PreparedRow {
  raw: ParsedRow;
  cvr: string | null;
  ean: string | null;
  data: Partial<Record<SystemField, string | number | boolean | null>>;
  salespersonNo: string | null;
  matchedSellerId: string | null;
  isDuplicate: boolean;
  missingCvr: boolean;
  isPublic: boolean;
  nameMatchId: string | null;
  eanMatchId: string | null;
  hasError: boolean;
  errorMessage?: string;
}

function parseDanishDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  // ISO YYYY-MM-DD or YYYY/MM/DD
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  // DK DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dk = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dk) {
    let y = dk[3];
    if (y.length === 2) y = (parseInt(y, 10) > 50 ? "19" : "20") + y;
    return `${y}-${dk[2].padStart(2, "0")}-${dk[1].padStart(2, "0")}`;
  }
  return null;
}

function ImportSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<SystemField, string>>>({});
  const [existingCvrs, setExistingCvrs] = useState<Set<string>>(new Set());
  const [existingNameMap, setExistingNameMap] = useState<Map<string, string>>(new Map());
  const [existingEanMap, setExistingEanMap] = useState<Map<string, string>>(new Map());
  const [includeMissingCvr, setIncludeMissingCvr] = useState(false);
  const [contactLists, setContactLists] = useState<{ id: string; name: string }[]>([]);
  const [sellers, setSellers] = useState<{ id: string; full_name: string }[]>([]);
  const [chosenList, setChosenList] = useState<string>("");
  const [chosenSeller, setChosenSeller] = useState<string>("");
  const runnerState = useImportRunner();
  const importing = runnerState.running && runnerState.kind === "visma";
  const progress = runnerState.kind === "visma" ? runnerState.progress : 0;
  const progressLabel = runnerState.kind === "visma" ? runnerState.label : "";
  const [result, setResult] = useState<{
    created: number; updated: number; skipped: number; failed: number; enriched: number;
    noCvrCount: number;
    importSource: "visma" | "cvr";
    unmatchedSalespersonNos: string[];
  } | null>(null);
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [importedSellerByCompany, setImportedSellerByCompany] = useState<Record<string, string>>({});
  const [importedRowAssignments, setImportedRowAssignments] = useState<
    { company_id: string; location_id: string | null; seller_id: string | null }[]
  >([]);
  const [salespersonMap, setSalespersonMap] = useState<Map<string, string>>(new Map());
  const [assigning, setAssigning] = useState(false);
  const [vismaFilters, setVismaFilters] = useState<VismaFilters>({
    excludeInternal: true,
    excludeForeign: true,
    excludeCreditBlocked: true,
  });
  const [autoMatchReport, setAutoMatchReport] = useState<{ matched: string[]; missing: string[] }>({
    matched: [],
    missing: [],
  });
  const createBatch = useServerFn(createImportBatch);
  const upsertByCvr = useServerFn(importUpsertCompaniesByCvr);
  const insertNoCvr = useServerFn(importInsertCompaniesNoCvr);
  const updateById = useServerFn(importUpdateCompaniesById);
  const upsertLocations = useServerFn(importInsertLocations);
  const assignSellers = useServerFn(importAssignSellersToCompanies);
  const upsertContacts = useServerFn(importUpsertContacts);
  const enrichFn = useServerFn(enrichCompaniesFromCvr);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  // Hydrate post-import state if user navigates back to the page after import finished.
  useEffect(() => {
    const r = importRunner.get();
    if (r.kind === "visma" && r.postState && !result) {
      const p = r.postState as any;
      if (p.companyIds) setImportedIds(p.companyIds);
      if (p.sellerByCompany) setImportedSellerByCompany(p.sellerByCompany);
      if (p.rowAssignments) setImportedRowAssignments(p.rowAssignments);
      if (p.result) setResult(p.result);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trin 1: Parse Visma-fil (altid semikolon-separator, UTF-8 m. BOM)
  async function handleFile(f: File) {
    setFile(f);
    Papa.parse<ParsedRow>(f, {
      delimiter: ";",
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
      complete: (res) => {
        const hdrs = res.meta.fields ?? [];
        setHeaders(hdrs);
        setRows(res.data);
        // Auto-mapping baseret på eksakte Visma-headers
        const auto: Partial<Record<SystemField, string>> = {};
        const matchedHeaders: string[] = [];
        const missingFields: string[] = [];
        for (const [field, aliases] of Object.entries(VISMA_MAPPING) as [
          SystemField,
          string[],
        ][]) {
          const found = hdrs.find((h) =>
            aliases.some((a) => h.toLowerCase() === a.toLowerCase()),
          );
          if (found) {
            auto[field] = found;
            matchedHeaders.push(found);
          } else {
            missingFields.push(aliases[0]);
          }
        }
        setMapping(auto);
        setAutoMatchReport({ matched: matchedHeaders, missing: missingFields });
        toast.success(`${res.data.length} rækker indlæst`);
        setStep(2);
      },
      error: (err: { message: string }) => toast.error("Kunne ikke læse CSV: " + err.message),
    });
  }

  // Trin 3: Forbered rækker + slå dubletter og sælgernumre op
  async function gotoPreview() {
    // Hent eksisterende CVR'er for at vise dubletter
    const cvrs = mapping.cvr
      ? rows.map((r) => normCvr(r[mapping.cvr!])).filter((v): v is string => !!v)
      : [];
    const unique = Array.from(new Set(cvrs));
    const dupSet = new Set<string>();
    for (let i = 0; i < unique.length; i += 500) {
      const slice = unique.slice(i, i + 500);
      const { data } = await supabase.from("companies").select("cvr").in("cvr", slice);
      (data ?? []).forEach((d) => { if (d.cvr) dupSet.add(d.cvr); });
    }
    setExistingCvrs(dupSet);

    // Slå navne+postnr op for rækker uden CVR/EAN (soft-match)
    const nameMap = new Map<string, string>();
    const nameZipRows = rows.filter(
      (r) =>
        !(mapping.cvr ? normCvr(r[mapping.cvr!]) : null) &&
        !(mapping.ean_number ? normEan(r[mapping.ean_number!]) : null),
    );
    const uniqueNames = Array.from(
      new Set(
        nameZipRows
          .map((r) => (mapping.name ? (r[mapping.name] ?? "").trim() : ""))
          .filter((n) => !!n),
      ),
    );
    for (let i = 0; i < uniqueNames.length; i += 200) {
      const slice = uniqueNames.slice(i, i + 200);
      const { data: ndata } = await supabase
        .from("companies")
        .select("id, name, zip")
        .in("name", slice);
      (ndata ?? []).forEach((d: any) => {
        const key = `${(d.name ?? "").toLowerCase()}|${d.zip ?? ""}`;
        if (!nameMap.has(key)) nameMap.set(key, d.id);
      });
    }
    setExistingNameMap(nameMap);

    // EAN bruges ikke til deduplicering
    setExistingEanMap(new Map());

    // Hent sælgernumre → user_id-mapping
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, salesperson_no, is_active")
      .not("salesperson_no", "is", null);
    const map = new Map<string, string>();
    for (const p of (profs ?? []) as any[]) {
      if (p.salesperson_no && p.is_active !== false) {
        map.set(String(p.salesperson_no).trim(), p.id);
      }
    }
    setSalespersonMap(map);

    setStep(3);
  }

  // Trin 4 → 5: hent lister og sælgere
  async function gotoAssignment() {
    const [{ data: lists }, { data: roles }] = await Promise.all([
      supabase.from("contact_lists").select("id,name").eq("is_active", true).order("name"),
      supabase.from("user_roles").select("user_id").eq("role", "saelger"),
    ]);
    setContactLists(lists ?? []);
    const ids = (roles ?? []).map((r: any) => r.user_id);
    let sellersFlat: { id: string; full_name: string }[] = [];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, is_active")
        .in("id", ids);
      sellersFlat = (profs ?? [])
        .filter((p: any) => p.is_active !== false)
        .map((p: any) => ({ id: p.id, full_name: p.full_name || "(uden navn)" }));
    }
    setSellers(sellersFlat);
    setStep(5);
  }

  const prepared = useMemo<PreparedRow[]>(() => {
    return rows.map((r) => {
      const cvr = mapping.cvr ? normCvr(r[mapping.cvr]) : null;
      const ean = mapping.ean_number ? normEan(r[mapping.ean_number]) : null;
      const data: PreparedRow["data"] = {};
      for (const f of SYSTEM_FIELDS) {
        if (!COMPANY_DB_FIELDS.has(f.key)) continue;
        const src = mapping[f.key];
        if (!src) continue;
        const v = (r[src] ?? "").trim();
        if (!v) continue;
        if (f.key === "employees") {
          const n = parseInt(v.replace(/\D/g, ""), 10);
          data.employees = isNaN(n) ? null : n;
        } else if (DATE_FIELDS.has(f.key)) {
          const d = parseDanishDate(v);
          if (d) (data as any)[f.key] = d;
        } else if (BOOLEAN_FIELDS.has(f.key)) {
          const b = parseBool(v);
          if (b !== null) (data as any)[f.key] = b;
        } else if (f.key === "ean_number") {
          if (ean) (data as any).ean_number = ean;
        } else {
          (data as any)[f.key] = v;
        }
      }
      // Sælgernummer-lookup
      let salespersonNo: string | null = null;
      let matchedSellerId: string | null = null;
      if (mapping.salesperson_no) {
        const raw = (r[mapping.salesperson_no] ?? "").trim();
        if (raw) {
          salespersonNo = raw;
          matchedSellerId = salespersonMap.get(raw) ?? null;
        }
      }
      const missingCvr = !cvr;
      const seg3 = String(data.customer_segment_3 ?? "").toLowerCase();
      const isPublicFromSegment =
        seg3.includes("offentlig") ||
        seg3.includes("udbudskunder") ||
        seg3.includes("aftale kunder") ||
        seg3.includes("kommune") ||
        seg3.includes("region");
      const isPublic = data.is_public === true || isPublicFromSegment;
      (data as any).is_public = isPublic;
      const isDuplicate = !!cvr && existingCvrs.has(cvr);
      const eanMatchId = null;
      const nameMatchId =
        !cvr && !ean && data.name
          ? existingNameMap.get(`${String(data.name).toLowerCase()}|${(data.zip as string) ?? ""}`) ?? null
          : null;
      const hasError = !data.name;
      // Visma-noter: saml "Adresselinje 1" og "Bem. Intern" i ét felt
      const adrLinje1 = (r["Adresselinje 1"] ?? "").trim();
      const bemIntern = (r["Bem. Intern"] ?? r["Bem Intern"] ?? r["Bemærkning intern"] ?? "").trim();
      const notesParts: string[] = [];
      if (adrLinje1) notesParts.push(`Adresselinje 1: ${adrLinje1}`);
      if (bemIntern) notesParts.push(`Bem. intern: ${bemIntern}`);
      if (notesParts.length) (data as any).visma_notes = notesParts.join("\n");
      return {
        raw: r,
        cvr,
        ean,
        data,
        salespersonNo,
        matchedSellerId,
        isDuplicate,
        missingCvr,
        isPublic,
        nameMatchId,
        eanMatchId,
        hasError,
        errorMessage: !data.name ? "Mangler navn" : undefined,
      };
    });
  }, [rows, mapping, existingCvrs, existingEanMap, existingNameMap, salespersonMap]);

  function isClosedName(name: unknown): boolean {
    if (!name) return false;
    // Matcher fx "LUKKET/ Firma", "LUKKET / Firma", "LUK/ Firma", "LUK / Firma"
    // (case-insensitive, ekstra whitespace tilladt foran og rundt om skråstreg)
    return /^\s*luk(?:ket)?\s*\/\s*/i.test(String(name));
  }

  function isFilteredByVisma(p: PreparedRow): boolean {
    // Altid: filtrér virksomheder hvis navn er markeret som lukket i Visma
    if (isClosedName(p.data.name)) return true;
    if (vismaFilters.excludeInternal) {
      const seg1 = String(p.data.customer_segment_1 ?? "").toLowerCase();
      if (seg1.includes("personale") || seg1.includes("interne")) return true;
    }
    if (vismaFilters.excludeForeign) {
      const land = (p.raw["Landnr."] ?? "").trim();
      // 45 = Danmark (dansk telefonkode brugt i Visma)
      // 1 = alternativ dansk kode
      // tom = dansk (ikke udfyldt)
      const isDanish = !land || land === "1" || land === "45";
      if (!isDanish) return true;
    }
    if (vismaFilters.excludeCreditBlocked) {
      const credit = (p.raw["Kreditspærre"] ?? "").trim();
      if (credit) return true;
    }
    return false;
  }

  const stats = useMemo(() => {
    const kept = prepared.filter((p) => !isFilteredByVisma(p));
    const filteredCount = prepared.length - kept.length;
    const newCount = kept.filter((p) => !p.isDuplicate && !p.missingCvr && !p.hasError).length;
    const dupCount = kept.filter((p) => p.isDuplicate).length;
    const missingCount = kept.filter((p) => p.missingCvr && !p.hasError).length;
    const errorCount = kept.filter((p) => p.hasError).length;
    const unmatchedSp = new Set(
      kept.filter((p) => p.salespersonNo && !p.matchedSellerId).map((p) => p.salespersonNo!),
    );
    return {
      newCount,
      dupCount,
      missingCount,
      errorCount,
      filteredCount,
      totalRows: prepared.length,
      unmatchedSalespersonNos: Array.from(unmatchedSp),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, vismaFilters]);

  // Trin 4: kør import (batch-baseret bulk upsert)
  async function runImport() {
    if (importRunner.isBusy()) {
      toast.error("Der kører allerede en import. Vent indtil den er færdig.");
      return;
    }
    importRunner.start("visma");

    const CHUNK = 500;
    const yieldUI = () => new Promise((r) => setTimeout(r, 0));

    let created = 0, updated = 0, skipped = 0, failed = 0, enriched = 0, noCvrCount = 0;
    const toImport = prepared.filter((p) => {
      if (p.hasError) return false;
      if (isFilteredByVisma(p)) return false;
      // Tillad rækker uden CVR hvis de har EAN, ellers respekter checkbox
      if (p.missingCvr && !p.ean && !includeMissingCvr) return false;
      return true;
    });
    const importSource: "visma" | "cvr" = mapping.visma_id ? "visma" : "cvr";
    const nowIso = new Date().toISOString();
    const companyIds: string[] = [];
    const sellerByCompany: Record<string, string> = {};
    // Bygges løbende under upsert/update så vi undgår at re-fetche companies bagefter
    const cvrToCompanyId = new Map<string, string>();

    const VISMA_OVERWRITE = new Set([
      "visma_id", "visma_delivery_id", "created_in_visma",
      "turnover_12m", "last_purchase_date",
      "customer_segment_1", "customer_segment_2", "customer_segment_3",
      "visma_notes",
    ]);

    // 1) Hent ALLE eksisterende rækker for berørte CVR'er + name-match-IDs i bulk
    const cvrsToFetch = Array.from(
      new Set(toImport.map((p) => p.cvr).filter((v): v is string => !!v)),
    );
    const eanMatchIdSet = new Set(
      toImport.map((p) => p.eanMatchId).filter((v): v is string => !!v),
    );
    const nameMatchIds = Array.from(
      new Set([
        ...toImport.map((p) => p.nameMatchId).filter((v): v is string => !!v),
        ...eanMatchIdSet,
      ]),
    );

    const existingByCvr = new Map<string, any>();
    const existingById = new Map<string, any>();

    importRunner.setLabel("Henter eksisterende virksomheder…");
    for (let i = 0; i < cvrsToFetch.length; i += CHUNK) {
      const slice = cvrsToFetch.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .in("cvr", slice);
      if (error) {
        toast.error("Kunne ikke hente eksisterende: " + error.message);
        importRunner.fail(progressLabel || "Import afbrudt");
        return;
      }
      (data ?? []).forEach((r: any) => {
        if (r.cvr) existingByCvr.set(r.cvr, r);
        existingById.set(r.id, r);
      });
      await yieldUI();
    }
    for (let i = 0; i < nameMatchIds.length; i += CHUNK) {
      const slice = nameMatchIds.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .in("id", slice);
      if (error) {
        toast.error("Kunne ikke hente eksisterende match: " + error.message);
        importRunner.fail(progressLabel || "Import afbrudt");
        return;
      }
      (data ?? []).forEach((r: any) => existingById.set(r.id, r));
      await yieldUI();
    }

    // 2) Klassificér rækker i: upserts m. cvr, updates by id (name-match), pure inserts
    const buildMerged = (existing: any, incoming: Record<string, any>) => {
      const payload: Record<string, any> = { id: existing.id };
      for (const [k, v] of Object.entries(incoming)) {
        if (importSource === "visma" && VISMA_OVERWRITE.has(k)) {
          payload[k] = v;
          continue;
        }
        const cur = (existing as any)[k];
        if (cur === null || cur === undefined || cur === "") payload[k] = v;
      }
      const existingSources: string[] = Array.isArray(existing.sources) ? existing.sources : [];
      payload.sources = existingSources.includes(importSource)
        ? existingSources
        : [...existingSources, importSource];
      payload.source_updated_at = nowIso;
      // Sikring: NOT NULL-felter skal ALTID være sat i payload'en — ellers
      // fejler upsert hvis Supabase falder tilbage på INSERT-vejen (fx ved
      // duplikerede CVR'er i samme batch). Brug eksisterende værdi som fallback.
      if (payload.name == null || payload.name === "") {
        payload.name = existing.name ?? (incoming as any).name ?? "(uden navn)";
      }
      if (payload.cvr == null && existing.cvr) {
        payload.cvr = existing.cvr;
      }
      return payload;
    };


    type Job =
      | { kind: "upsert_cvr"; payload: Record<string, any>; sellerId: string | null; isUpdate: boolean; isEnrich: boolean; isNoCvr: boolean }
      | { kind: "update_id"; id: string; payload: Record<string, any>; sellerId: string | null; isNoCvr: boolean }
      | { kind: "insert_no_cvr"; payload: Record<string, any>; sellerId: string | null };

    const jobs: Job[] = [];

    for (const p of toImport) {
      const incoming = stripUndef(p.data) as Record<string, any>;
      if (p.cvr) {
        const existing = existingByCvr.get(p.cvr);
        if (existing) {
          const merged = buildMerged(existing, incoming);
          merged.cvr = p.cvr;
          jobs.push({
            kind: "upsert_cvr",
            payload: merged,
            sellerId: p.matchedSellerId,
            isUpdate: true,
            isEnrich: importSource === "cvr",
            isNoCvr: false,
          });
        } else {
          jobs.push({
            kind: "upsert_cvr",
            payload: {
              ...incoming,
              cvr: p.cvr,
              sources: [importSource],
              source_updated_at: nowIso,
            },
            sellerId: p.matchedSellerId,
            isUpdate: false,
            isEnrich: false,
            isNoCvr: false,
          });
        }
      } else if (p.eanMatchId && existingById.has(p.eanMatchId)) {
        const existing = existingById.get(p.eanMatchId);
        const merged = buildMerged(existing, incoming);
        jobs.push({
          kind: "update_id",
          id: existing.id,
          payload: merged,
          sellerId: p.matchedSellerId,
          isNoCvr: !p.cvr,
        });
      } else if (p.nameMatchId && existingById.has(p.nameMatchId)) {
        const existing = existingById.get(p.nameMatchId);
        const merged = buildMerged(existing, incoming);
        jobs.push({
          kind: "update_id",
          id: existing.id,
          payload: merged,
          sellerId: p.matchedSellerId,
          isNoCvr: true,
        });
      } else {
        jobs.push({
          kind: "insert_no_cvr",
          payload: {
            ...incoming,
            cvr: null,
            source: "csv_uden_cvr",
            sources: [importSource],
            source_updated_at: nowIso,
          },
          sellerId: p.matchedSellerId,
        });
      }
    }

    // 3) Eksekvér i batches
    // Dedupér upserts pr. CVR — Postgres' ON CONFLICT kan ikke ramme samme række
    // to gange i samme batch, og ét duplikat ville ellers fejle hele chunken.
    const upsertsRaw = jobs.filter((j) => j.kind === "upsert_cvr") as Extract<Job, { kind: "upsert_cvr" }>[];
    const upsertsByCvr = new Map<string, Extract<Job, { kind: "upsert_cvr" }>>();
    let dedupedCvrDuplicates = 0;
    const isPrimaryRow = (j: Extract<Job, { kind: "upsert_cvr" }>) => {
      const k = j.payload.visma_id;
      const d = j.payload.visma_delivery_id;
      return !!k && !!d && String(k).trim() === String(d).trim();
    };
    for (const j of upsertsRaw) {
      const key = j.payload.cvr as string;
      const existing = upsertsByCvr.get(key);
      if (!existing) {
        upsertsByCvr.set(key, j);
      } else {
        dedupedCvrDuplicates++;
        // Foretræk primær-rækken (Visma Kundenr == Visma Lev.nr) som hovedkort.
        // Ellers behold den første forekomst.
        if (isPrimaryRow(j) && !isPrimaryRow(existing)) {
          upsertsByCvr.set(key, j);
        }
      }
    }
    const upserts = Array.from(upsertsByCvr.values());
    if (dedupedCvrDuplicates > 0) {
      console.warn(`Dedupliceret ${dedupedCvrDuplicates} dublerede CVR-rækker i upload (primær-række valgt til hovedkort)`);
    }
    const updates = jobs.filter((j) => j.kind === "update_id") as Extract<Job, { kind: "update_id" }>[];
    const inserts = jobs.filter((j) => j.kind === "insert_no_cvr") as Extract<Job, { kind: "insert_no_cvr" }>[];

    const totalBatches =
      Math.ceil(upserts.length / CHUNK) +
      Math.ceil(updates.length / CHUNK) +
      Math.ceil(inserts.length / CHUNK);
    let batchIdx = 0;
    let processed = 0;

    const tick = (label: string, doneRows: number) => {
      batchIdx++;
      processed += doneRows;
      importRunner.setProgress(Math.round((processed / toImport.length) * 100));
      importRunner.setLabel(
        `Importerer batch ${batchIdx} af ${totalBatches}… (${processed.toLocaleString("da-DK")} / ${toImport.length.toLocaleString("da-DK")})`,
      );
    };

    // 3a) Bulk upsert (cvr conflict) — kører server-side via service role
    for (let i = 0; i < upserts.length; i += CHUNK) {
      const slice = upserts.slice(i, i + CHUNK);
      const payloads = slice.map((j) => j.payload);
      try {
        const res = await upsertByCvr({ data: { rows: payloads } });
        const byCvr = new Map(res.results.map((r) => [r.cvr, r.id]));
        slice.forEach((j) => {
          const id = j.payload.id ?? byCvr.get(j.payload.cvr);
          if (id) {
            companyIds.push(id);
            if (j.payload.cvr) cvrToCompanyId.set(j.payload.cvr, id);
            if (j.sellerId) sellerByCompany[id] = j.sellerId;
            if (j.isUpdate) {
              updated++;
              if (j.isEnrich) enriched++;
            } else {
              created++;
            }
          } else {
            failed++;
          }
        });
        if (res.failed) failed += res.failed;
        if (res.errors.length) {
          toast.error(`Batch fejl: ${res.errors[0]}`);
        }
      } catch (e: any) {
        console.error("Bulk upsert server-fn fejl", e);
        toast.error(`Batch fejlede (${slice.length} rækker): ${e?.message ?? e}`);
        failed += slice.length;
      }
      tick("upsert", slice.length);
      await yieldUI();
    }

    // 3b) Bulk insert (no-cvr nye) — server-side
    for (let i = 0; i < inserts.length; i += CHUNK) {
      const slice = inserts.slice(i, i + CHUNK);
      const payloads = slice.map((j) => j.payload);
      try {
        const res = await insertNoCvr({ data: { rows: payloads } });
        res.results.forEach((r, idx) => {
          companyIds.push(r.id);
          const sid = slice[idx]?.sellerId;
          if (sid) sellerByCompany[r.id] = sid;
          created++;
          noCvrCount++;
        });
        if (res.failed) failed += res.failed;
      } catch (e: any) {
        console.error("Bulk insert server-fn fejl", e);
        failed += slice.length;
      }
      tick("insert", slice.length);
      await yieldUI();
    }

    // 3c) Name-match updates (per id) — server-side
    for (let i = 0; i < updates.length; i += CHUNK) {
      const slice = updates.slice(i, i + CHUNK);
      try {
        const payload = slice.map((j) => {
          const { id, ...rest } = j.payload;
          return { id: j.id, payload: rest };
        });
        const res = await updateById({ data: { updates: payload } });
        const okSet = new Set(res.results.filter((r) => r.ok).map((r) => r.id));
        slice.forEach((j) => {
          if (okSet.has(j.id)) {
            companyIds.push(j.id);
            const cvr = (j.payload as any)?.cvr;
            if (cvr) cvrToCompanyId.set(String(cvr), j.id);
            if (j.sellerId) sellerByCompany[j.id] = j.sellerId;
            updated++;
            if (j.isNoCvr) noCvrCount++;
          } else {
            failed++;
          }
        });
      } catch (e: any) {
        console.error("Bulk update server-fn fejl", e);
        failed += slice.length;
      }
      tick("update", slice.length);
      await yieldUI();
    }



    skipped = prepared.length - toImport.length;

    skipped = prepared.length - toImport.length;

    if (companyIds.length) {
      try {
        await createBatch({
          data: {
            filename: file?.name ?? null,
            company_count: companyIds.length,
            company_ids: companyIds,
          },
        });
      } catch (e: any) {
        console.error("Kunne ikke registrere import-batch", e);
      }
    }

    // 4) Byg lokationsrækker IN-MEMORY (ingen DB-kald).
    // Model B: kun virksomheder med 2+ leveringsadresser får lokationer.
    // Primær = den ENE lokation hvor leveringsnr = virksomhedens Visma kundenr.
    const locRows: any[] = [];
    let companiesWithMultipleLocations = 0;
    try {
      // Map cvr → virksomhedens kundenr (det første visma_id vi har set for denne cvr).
      // Dette matcher det visma_id der upsertes på companies, så præcis én lokation pr.
      // virksomhed kan markeres primær.
      const cvrToCompanyVismaId = new Map<string, string>();
      for (const p of prepared) {
        if (!p.cvr) continue;
        const vid = (p.data as any).visma_id as string | undefined;
        if (!vid) continue;
        if (!cvrToCompanyVismaId.has(p.cvr)) cvrToCompanyVismaId.set(p.cvr, vid);
      }

      type LocRow = { delivery: string; faktKunde: string | null; loc: Record<string, string | null> };
      const byCvr = new Map<string, LocRow[]>();
      for (const r of rows) {
        const cvr = mapping.cvr ? normCvr(r[mapping.cvr]) : null;
        if (!cvr || !cvrToCompanyId.has(cvr)) continue;
        const delivery = mapping.visma_delivery_id ? (r[mapping.visma_delivery_id] ?? "").trim() : "";
        if (!delivery) continue;
        const faktKunde = mapping.visma_id ? (r[mapping.visma_id] ?? "").trim() : null;
        const loc: Record<string, string | null> = {
          address: mapping.location_address ? (r[mapping.location_address] ?? "").trim() || null : null,
          zip: mapping.location_zip ? (r[mapping.location_zip] ?? "").trim() || null : null,
          city: mapping.location_city ? (r[mapping.location_city] ?? "").trim() || null : null,
          phone: mapping.location_phone ? (r[mapping.location_phone] ?? "").trim() || null : null,
          email: mapping.location_email ? (r[mapping.location_email] ?? "").trim() || null : null,
          contact_person: mapping.location_contact_person ? (r[mapping.location_contact_person] ?? "").trim() || null : null,
        };
        const list = byCvr.get(cvr) ?? [];
        if (!list.find((x) => x.delivery === delivery)) list.push({ delivery, faktKunde, loc });
        byCvr.set(cvr, list);
      }

      for (const [cvr, list] of byCvr.entries()) {
        if (list.length < 2) continue;
        companiesWithMultipleLocations++;
        const companyId = cvrToCompanyId.get(cvr)!;
        const companyKundenr = cvrToCompanyVismaId.get(cvr) ?? null;
        for (const row of list) {
          locRows.push({
            company_id: companyId,
            visma_delivery_no: row.delivery,
            address: row.loc.address,
            zip: row.loc.zip,
            city: row.loc.city,
            phone: row.loc.phone,
            email: row.loc.email,
            contact_person: row.loc.contact_person,
            is_primary: companyKundenr !== null && row.delivery === companyKundenr,
          });
        }
      }

    } catch (e) {
      console.error("Kunne ikke bygge lokationsrækker", e);
    }

    // 5) Byg kontaktrækker IN-MEMORY med delivery_no (ingen location_id endnu).
    type ContactRow = {
      company_id: string;
      delivery_no: string;
      location_id: string | null;
      name: string;
      phone: string | null;
      email: string | null;
      is_primary: boolean;
    };
    const contactRows: ContactRow[] = [];
    try {
      if (mapping.location_contact_person && mapping.visma_delivery_id) {
        const seenKeys = new Set<string>();
        for (const r of rows) {
          const cvr = mapping.cvr ? normCvr(r[mapping.cvr]) : null;
          if (!cvr) continue;
          const companyId = cvrToCompanyId.get(cvr);
          if (!companyId) continue;
          const delivery = (r[mapping.visma_delivery_id!] ?? "").trim();
          if (!delivery) continue;
          const name = (r[mapping.location_contact_person!] ?? "").trim();
          if (!name) continue;
          const key = `${companyId}|${delivery}|${name.toLowerCase()}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          contactRows.push({
            company_id: companyId,
            delivery_no: delivery,
            location_id: null,
            name,
            phone: mapping.location_phone ? ((r[mapping.location_phone] ?? "").trim() || null) : null,
            email: mapping.location_email ? ((r[mapping.location_email] ?? "").trim() || null) : null,
            is_primary: false,
          });
        }
      }
    } catch (e) {
      console.error("Kunne ikke bygge kontaktrækker", e);
    }

    // Simpel rowAssignments uden DB-opslag — location_id udfyldes i baggrunden hvis nødvendigt
    const rowAssignments = companyIds.map((id) => ({
      company_id: id,
      location_id: null as string | null,
      seller_id: sellerByCompany[id] ?? null,
    }));

    // Auto-tildel sælger direkte på virksomheden ud fra Visma-sælgernummer (INDEN finish)
    const sellerAssignments = Object.entries(sellerByCompany)
      .filter(([, sid]) => !!sid)
      .map(([company_id, seller_id]) => ({ company_id, seller_id: seller_id as string }));
    if (sellerAssignments.length) {
      importRunner.setLabel(`Tildeler sælgere til ${sellerAssignments.length} virksomheder…`);
      try {
        const res = await assignSellers({ data: { assignments: sellerAssignments } });
        if (res.failed) {
          console.warn(`Sælger-tildeling: ${res.failed} fejlede`);
        }
      } catch (e) {
        console.error("Auto-tildeling af sælgere fejlede", e);
        toast.error("Auto-tildeling af sælgere fejlede – kør Trin 5 manuelt");
      }
    }

    const resultPayload = {
      created, updated, skipped, failed, enriched, noCvrCount,
      importSource,
      unmatchedSalespersonNos: stats.unmatchedSalespersonNos,
    };
    setImportedIds(companyIds);
    setImportedSellerByCompany(sellerByCompany);
    setImportedRowAssignments(rowAssignments);
    setResult(resultPayload);
    importRunner.finish(
      `Færdig: ${companyIds.length.toLocaleString("da-DK")} virksomheder`,
      { companyIds, sellerByCompany, rowAssignments, result: resultPayload },
    );
    toast.success("Import gennemført");
    if (companiesWithMultipleLocations > 0) {
      toast.success(
        `${companiesWithMultipleLocations} virksomheder fik flere lokationer registreret`,
      );
    }

    // Fire-and-forget baggrunds-opgaver: lokationer, kontakter, CVR-berigelse
    setTimeout(() => {
      (async () => {
        try {
          // Lokationer: upsert pre-byggede locRows
          if (locRows.length) {
            importRunner.setLabel("Opretter lokationer i baggrunden…");
            try {
              await upsertLocations({ data: { rows: locRows } });
            } catch (e) {
              console.error("Lokationer-upsert fejl", e);
            }
          }

          // Kontakter: hent locIdMap kun for virksomheder med lokationer
          if (
            contactRows.length > 0 &&
            mapping.location_contact_person &&
            mapping.visma_delivery_id
          ) {
            const companiesWithLocs = [...new Set(locRows.map((r) => r.company_id))];
            const locIdMap = new Map<string, { id: string; is_primary: boolean }>();
            for (let i = 0; i < companiesWithLocs.length; i += 500) {
              const slice = companiesWithLocs.slice(i, i + 500);
              const { data } = await (supabase as any)
                .from("locations")
                .select("id, company_id, visma_delivery_no, is_primary")
                .in("company_id", slice);
              (data ?? []).forEach((l: any) => {
                if (l.visma_delivery_no) {
                  locIdMap.set(`${l.company_id}|${l.visma_delivery_no}`, {
                    id: l.id,
                    is_primary: !!l.is_primary,
                  });
                }
              });
            }

            const resolvedContacts = contactRows
              .map((c) => {
                const loc = locIdMap.get(`${c.company_id}|${c.delivery_no}`);
                if (!loc) return null;
                return {
                  company_id: c.company_id,
                  location_id: loc.id,
                  name: c.name,
                  phone: c.phone,
                  email: c.email,
                  is_primary: loc.is_primary,
                };
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);

            if (resolvedContacts.length) {
              try {
                await upsertContacts({ data: { rows: resolvedContacts } });
              } catch (e) {
                console.error("Kontakter-upsert fejl", e);
              }
            }
          }

          // CVR-berigelse
          if (companyIds.length) {
            const ENRICH_CHUNK = 500;
            for (let i = 0; i < companyIds.length; i += ENRICH_CHUNK) {
              try {
                await enrichFn({
                  data: { company_ids: companyIds.slice(i, i + ENRICH_CHUNK) },
                });
              } catch (e) {
                console.error("CVR enrichment fejl:", e);
              }
            }
          }
        } catch (e) {
          console.error("Baggrunds-opgave fejl:", e);
        }
      })();
    }, 0);
  }


  // Trin 5: tildel allerede importerede virksomheder
  async function runAssignment() {
    if (!chosenList) {
      toast.error("Vælg en kontaktliste");
      return;
    }
    const hasPerRowSeller = !!mapping.salesperson_no;
    if (!hasPerRowSeller && !chosenSeller) {
      toast.error("Vælg en sælger");
      return;
    }
    if (!importedIds.length) {
      toast.error("Ingen virksomheder at tildele");
      return;
    }
    setAssigning(true);
    const hasPerRowLocation = !!mapping.visma_delivery_id && importedRowAssignments.some((r) => r.location_id);
    const assignments = hasPerRowLocation
      ? importedRowAssignments
          .map((r) => ({
            company_id: r.company_id,
            location_id: r.location_id,
            contact_list_id: chosenList,
            assigned_to: hasPerRowSeller ? (r.seller_id ?? (chosenSeller || null)) : chosenSeller,
          }))
          .filter((a) => a.assigned_to)
      : importedIds.map((id) => ({
          company_id: id,
          location_id: null as string | null,
          contact_list_id: chosenList,
          assigned_to: hasPerRowSeller
            ? (importedSellerByCompany[id] ?? (chosenSeller || null))
            : chosenSeller,
        })).filter((a) => a.assigned_to);
    let failed = 0;
    for (let i = 0; i < assignments.length; i += 200) {
      const { error } = await (supabase as any)
        .from("contact_list_assignments")
        .insert(assignments.slice(i, i + 200));
      if (error) failed++;
    }
    setAssigning(false);
    if (failed) {
      toast.error("Nogle tildelinger fejlede");
    } else {
      const locCount = hasPerRowLocation ? assignments.filter((a) => a.location_id).length : 0;
      toast.success(
        hasPerRowLocation
          ? `${assignments.length} tildelinger oprettet (heraf ${locCount} på specifik lokation)`
          : `${assignments.length} virksomheder tildelt`,
      );
    }
    navigate({ to: "/virksomheder" });
  }

  function goLater() {
    if (importedIds.length) {
      try {
        sessionStorage.setItem(
          "recently_imported_ids",
          JSON.stringify({ ids: importedIds, at: Date.now() }),
        );
      } catch {}
    }
    navigate({ to: "/virksomheder" });
  }

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-8 max-w-5xl mx-auto pb-24 md:pb-8">
      <Link
        to="/admin/import"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Vælg anden importtype
      </Link>
      <h1 className="text-2xl md:text-3xl font-semibold mb-2">Visma-import</h1>
      <p className="text-sm text-muted-foreground mb-6">
        CSV-eksport fra Visma Debitorliste. Kolonner auto-mappes — du behøver ikke matche manuelt.
      </p>

      <Stepper step={step} />

      {step === 1 && <Trin1VismaUpload onFile={handleFile} />}
      {step === 2 && (
        <Trin2VismaConfirm
          report={autoMatchReport}
          filters={vismaFilters}
          setFilters={setVismaFilters}
          rowCount={rows.length}
          onBack={() => setStep(1)}
          onNext={gotoPreview}
        />
      )}
      {step === 3 && (
        <Trin3Preview
          prepared={prepared}
          stats={stats}
          includeMissingCvr={includeMissingCvr}
          setIncludeMissingCvr={setIncludeMissingCvr}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <Trin4Import
          stats={stats}
          includeMissingCvr={includeMissingCvr}
          importing={importing}
          progress={progress}
          progressLabel={progressLabel}
          result={result}
          importedCount={importedIds.length}
          onBack={() => setStep(3)}
          onRun={runImport}
          onAssignNow={gotoAssignment}
          onLater={goLater}
        />
      )}
      {step === 5 && (
        <Trin5Tildeling
          contactLists={contactLists}
          sellers={sellers}
          chosenList={chosenList}
          chosenSeller={chosenSeller}
          setChosenList={setChosenList}
          setChosenSeller={setChosenSeller}
          importedCount={importedIds.length}
          assigning={assigning}
          onBack={() => setStep(4)}
          onAssign={runAssignment}
          onSkip={goLater}
          hasPerRowMapping={!!mapping.salesperson_no}
          perRowMatchedCount={importedIds.filter((id) => importedSellerByCompany[id]).length}
          locationAssignmentCount={importedRowAssignments.filter((r) => r.location_id).length}
        />
      )}
    </div>
  );
}

function stripUndef<T extends object>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== "" && v !== null) out[k] = v;
  }
  return out;
}

function normCvr(v: string | undefined | null): string | null {
  if (!v) return null;
  const digits = String(v).replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : null;
}

function Stepper({ step }: { step: number }) {
  const steps = ["Upload", "Kolonnematch", "Preview", "Importér", "Tildeling (valgfri)"];
  return (
    <div className="flex items-center gap-2 mb-6 overflow-x-auto">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2 shrink-0">
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium ${
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : n}
            </div>
            <span className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
            {n < steps.length && <div className="w-6 h-px bg-border mx-1" />}
          </div>
        );
      })}
    </div>
  );
}


function Trin3Preview({
  prepared,
  stats,
  includeMissingCvr,
  setIncludeMissingCvr,
  onBack,
  onNext,
}: {
  prepared: PreparedRow[];
  stats: { newCount: number; dupCount: number; missingCount: number; errorCount: number; filteredCount: number; totalRows: number; unmatchedSalespersonNos: string[] };
  includeMissingCvr: boolean;
  setIncludeMissingCvr: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const sample = prepared.slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Nye virksomheder" value={stats.newCount} tone="success" />
        <StatCard label="CVR-dubletter (opdateres)" value={stats.dupCount} tone="warning" />
        <StatCard label="Mangler CVR" value={stats.missingCount} tone="muted" />
        <StatCard label="Fejl" value={stats.errorCount} tone="destructive" />
      </div>

      {stats.missingCount > 0 && (
        <Card className="p-4 border-warning/30 bg-warning/5 flex gap-3 items-start">
          <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium mb-1">
              {stats.missingCount} rækker har intet CVR
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Vælg om de skal importeres alligevel eller springes over.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeMissingCvr}
                onCheckedChange={(v) => setIncludeMissingCvr(v === true)}
              />
              Importér også rækker uden CVR
            </label>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Status</TableHead>
              <TableHead>CVR</TableHead>
              <TableHead>Navn</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sample.map((p, i) => (
              <TableRow key={i}>
                <TableCell>
                  {p.hasError ? (
                    <Badge variant="destructive">Fejl</Badge>
                  ) : p.isPublic ? (
                    <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
                      Offentlig
                    </Badge>
                  ) : p.missingCvr ? (
                    <Badge variant="outline">Uden CVR</Badge>
                  ) : p.isDuplicate ? (
                    <Badge variant="secondary">Opdater</Badge>
                  ) : (
                    <Badge>Ny</Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{p.cvr ?? "—"}</TableCell>
                <TableCell>{(p.data.name as string) ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{(p.data.city as string) ?? ""}</TableCell>
                <TableCell className="text-muted-foreground">{(p.data.phone as string) ?? ""}</TableCell>
                <TableCell className="text-muted-foreground">{(p.data.email as string) ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">
        Viser de første 10 af {prepared.length} rækker.
      </p>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
        </Button>
        <Button onClick={onNext}>
          Fortsæt <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function Trin4Import({
  stats,
  includeMissingCvr,
  importing,
  progress,
  progressLabel,
  result,
  importedCount,
  onBack,
  onRun,
  onAssignNow,
  onLater,
}: {
  stats: { newCount: number; dupCount: number; missingCount: number; errorCount: number; filteredCount: number; totalRows: number; unmatchedSalespersonNos: string[] };
  includeMissingCvr: boolean;
  importing: boolean;
  progress: number;
  progressLabel: string;
  result: { created: number; updated: number; skipped: number; failed: number; enriched: number; noCvrCount: number; importSource: "visma" | "cvr"; unmatchedSalespersonNos: string[] } | null;
  importedCount: number;
  onBack: () => void;
  onRun: () => void;
  onAssignNow: () => void;
  onLater: () => void;
}) {
  if (result) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-3" />
        <h2 className="font-semibold mb-2">Import gennemført</h2>
        <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
          {importedCount} virksomheder importeret. Vil du tildele dem til en kontaktliste og sælger nu, eller gøre det senere?
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-md mx-auto mb-6">
          <StatCard label="Oprettet" value={result.created} tone="success" />
          <StatCard label="Opdateret" value={result.updated} tone="warning" />
          <StatCard label="Sprunget over" value={result.skipped} tone="muted" />
          <StatCard label="Fejl" value={result.failed} tone="destructive" />
        </div>
        {result.importSource === "cvr" && result.enriched > 0 && (
          <p className="text-sm text-muted-foreground mb-4">
            {result.enriched} virksomheder beriget med CVR-data.
          </p>
        )}
        {result.unmatchedSalespersonNos.length > 0 && (
          <Card className="p-4 border-warning/30 bg-warning/5 flex gap-3 items-start max-w-md mx-auto mb-6 text-left">
            <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div className="text-sm">
              {result.unmatchedSalespersonNos.length} sælgernumre kunne ikke matches — sælgernummer{result.unmatchedSalespersonNos.length === 1 ? "" : "ne"}{" "}
              <span className="font-mono">{result.unmatchedSalespersonNos.join(", ")}</span> findes ikke i systemet. Berørte virksomheder er importeret men markeret som "Ikke tildelt".
            </div>
          </Card>
        )}
        {result.noCvrCount > 0 && (
          <Card className="p-4 border-warning/30 bg-warning/5 flex gap-3 items-start max-w-md mx-auto mb-6 text-left">
            <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div className="text-sm">
              {result.noCvrCount} virksomheder uden CVR-nummer — disse kan ikke garanteres mod dubletter ved fremtidige imports. Vi anbefaler at efterslå CVR manuelt.
            </div>
          </Card>
        )}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button variant="outline" onClick={onLater}>Gør det senere</Button>
          <Button onClick={onAssignNow} disabled={importedCount === 0}>
            Tildel nu <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </Card>
    );
  }

  const willImport =
    stats.newCount + stats.dupCount + (includeMissingCvr ? stats.missingCount : 0);
  return (
    <Card className="p-6">
      <h2 className="font-semibold mb-1">Bekræft og importér</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {willImport} rækker importeres. {stats.dupCount} eksisterende opdateres, {stats.newCount} nye oprettes.
        {!includeMissingCvr && stats.missingCount > 0 && (
          <> {stats.missingCount} rækker uden CVR springes over.</>
        )}
        {stats.errorCount > 0 && <> {stats.errorCount} rækker med fejl springes over.</>}
      </p>

      {importing && (
        <div className="mb-4">
          <Progress value={progress} className="mb-2" />
          <p className="text-xs text-muted-foreground text-center">
            {progressLabel || `Importerer… ${progress}%`}
          </p>
        </div>
      )}

      <div className="flex justify-between mt-4">
        <Button variant="outline" onClick={onBack} disabled={importing}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
        </Button>
        <Button onClick={onRun} disabled={importing || willImport === 0}>
          {importing ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importerer…</>
          ) : (
            <><Upload className="h-4 w-4 mr-2" /> Start import</>
          )}
        </Button>
      </div>
    </Card>
  );
}

function Trin5Tildeling({
  contactLists,
  sellers,
  chosenList,
  chosenSeller,
  setChosenList,
  setChosenSeller,
  importedCount,
  perRowMatchedCount,
  hasPerRowMapping,
  locationAssignmentCount,
  assigning,
  onBack,
  onAssign,
  onSkip,
}: {
  contactLists: { id: string; name: string }[];
  sellers: { id: string; full_name: string }[];
  chosenList: string;
  chosenSeller: string;
  setChosenList: (v: string) => void;
  setChosenSeller: (v: string) => void;
  importedCount: number;
  perRowMatchedCount: number;
  hasPerRowMapping: boolean;
  locationAssignmentCount: number;
  assigning: boolean;
  onBack: () => void;
  onAssign: () => void;
  onSkip: () => void;
}) {
  const sellerDisabled = hasPerRowMapping && perRowMatchedCount === importedCount;
  return (
    <Card className="p-6">
      <h2 className="font-semibold mb-1">Tildel til kontaktliste og sælger</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {hasPerRowMapping
          ? `${perRowMatchedCount} af ${importedCount} virksomheder har et matchet sælgernummer fra CSV-filen. Vælg evt. en fallback-sælger for de øvrige.`
          : `${importedCount} importerede virksomheder tildeles den valgte kontaktliste og sælger.`}
        {locationAssignmentCount > 0 && (
          <>
            {" "}
            <span className="text-primary">
              📍 {locationAssignmentCount} tildelinger oprettes på specifikke lokationer.
            </span>
          </>
        )}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <Label className="mb-1.5 block">Kontaktliste</Label>
          <Select value={chosenList} onValueChange={setChosenList}>
            <SelectTrigger><SelectValue placeholder="Vælg liste" /></SelectTrigger>
            <SelectContent>
              {contactLists.length === 0 ? (
                <SelectItem value="__none" disabled>Ingen aktive lister</SelectItem>
              ) : (
                contactLists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block">
            {hasPerRowMapping ? "Fallback-sælger (valgfri)" : "Sælger"}
          </Label>
          <Select value={chosenSeller} onValueChange={setChosenSeller} disabled={sellerDisabled}>
            <SelectTrigger><SelectValue placeholder={sellerDisabled ? "Fra CSV" : "Vælg sælger"} /></SelectTrigger>
            <SelectContent>
              {sellers.length === 0 ? (
                <SelectItem value="__none" disabled>Ingen sælgere fundet</SelectItem>
              ) : (
                sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={assigning}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip} disabled={assigning}>
            Spring over
          </Button>
          <Button
            onClick={onAssign}
            disabled={assigning || !chosenList || (!hasPerRowMapping && !chosenSeller)}
          >
            {assigning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Tildeler…</>
            ) : (
              <>Tildel <ArrowRight className="h-4 w-4 ml-2" /></>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "destructive" | "muted";
}) {
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <Card className="p-4">
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </Card>
  );
}

function Trin1VismaUpload({ onFile }: { onFile: (f: File) => void }) {
  return (
    <Card className="p-8">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileUp className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="font-semibold mb-1">Upload din CSV-eksport fra Visma</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Filen skal være eksporteret som semikolon-separeret CSV fra Visma Debitorliste.
        </p>
        <div className="max-w-sm mx-auto">
          <Input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </div>
      </div>
    </Card>
  );
}

function Trin2VismaConfirm({
  report,
  filters,
  setFilters,
  rowCount,
  onBack,
  onNext,
}: {
  report: { matched: string[]; missing: string[] };
  filters: { excludeInternal: boolean; excludeForeign: boolean; excludeCreditBlocked: boolean };
  setFilters: (f: { excludeInternal: boolean; excludeForeign: boolean; excludeCreditBlocked: boolean }) => void;
  rowCount: number;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="font-semibold mb-3">Auto-mapping fra Visma-format</h2>
        <p className="text-sm mb-2">
          <span className="text-success font-medium">✅ {report.matched.length} kolonner</span>{" "}
          auto-matchet fra Visma-format ({rowCount.toLocaleString("da-DK")} rækker)
        </p>
        {report.missing.length > 0 && (
          <p className="text-sm text-muted-foreground">
            ⚠️ {report.missing.length} kolonner ikke fundet i filen: {report.missing.join(", ")}
          </p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-3">Filtreringsindstillinger</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Slå filtre fra hvis du vil importere alle rækker.
        </p>
        <div className="space-y-3">
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <Checkbox
              checked={filters.excludeInternal}
              onCheckedChange={(v) => setFilters({ ...filters, excludeInternal: v === true })}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium">Udeluk interne og personalekonti</div>
              <div className="text-xs text-muted-foreground">
                Kundeprisgruppe 1 indeholder "Personale" eller "Interne"
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <Checkbox
              checked={filters.excludeForeign}
              onCheckedChange={(v) => setFilters({ ...filters, excludeForeign: v === true })}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium">Udeluk udenlandske kunder</div>
              <div className="text-xs text-muted-foreground">Landnr. er hverken 1, 45 eller tom</div>
            </div>
          </label>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <Checkbox
              checked={filters.excludeCreditBlocked}
              onCheckedChange={(v) => setFilters({ ...filters, excludeCreditBlocked: v === true })}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium">Udeluk kreditspærrede kunder</div>
              <div className="text-xs text-muted-foreground">Kreditspærre-feltet er udfyldt</div>
            </div>
          </label>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
        </Button>
        <Button onClick={onNext}>
          Forhåndsvis <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
