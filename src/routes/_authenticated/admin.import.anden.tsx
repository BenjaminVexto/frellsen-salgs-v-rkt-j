import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import {
  createImportBatch,
  importUpsertCompaniesByCvr,
  importUpsertCompaniesByVismaId,
  importInsertCompaniesNoCvr,
  importUpdateCompaniesById,
  importInsertLocations,
} from "@/lib/admin-companies.functions";
import { parseDanishDateIso as parseDanishDate } from "@/lib/invoice-parse";
import { readFileSmart } from "@/lib/file-encoding";
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
import {
  deriveBindingStatus,
  deriveCustomerCategory,
} from "@/lib/customer-segment-mapping";

export const Route = createFileRoute("/_authenticated/admin/import/anden")({
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

type ParsedRow = Record<string, string>;

function normalizeHeaderName(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s.\-/]+/g, "_")
    .replace(/[^a-z0-9æøå_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function selectableHeaders(fields: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of fields ?? []) {
    const header = String(h ?? "").trim();
    if (!header || header === "__none" || seen.has(header)) continue;
    seen.add(header);
    out.push(header);
  }
  return out;
}

function stripCsvPreamble(text: string, delimiter: string): string {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return text;
  const nonEmptyCells = (line: string) =>
    line.split(delimiter).filter((cell) => cell.trim()).length;
  if (nonEmptyCells(lines[0]) <= 1 && nonEmptyCells(lines[1]) > 1) {
    return lines.slice(1).join("\n");
  }
  return text;
}

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

// parseDanishDate er den delte parseDanishDateIso fra @/lib/invoice-parse

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
  const importing = runnerState.running && runnerState.kind === "anden";
  const progress = runnerState.kind === "anden" ? runnerState.progress : 0;
  const progressLabel = runnerState.kind === "anden" ? runnerState.label : "";
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
  const createBatch = useServerFn(createImportBatch);
  const upsertByCvr = useServerFn(importUpsertCompaniesByCvr);
  const insertNoCvr = useServerFn(importInsertCompaniesNoCvr);
  const updateById = useServerFn(importUpdateCompaniesById);
  const upsertLocations = useServerFn(importInsertLocations);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  // Hydrate post-import state if user navigates back after import finished.
  useEffect(() => {
    const r = importRunner.get();
    if (r.kind === "anden" && r.postState && !result) {
      const p = r.postState as any;
      if (p.companyIds) setImportedIds(p.companyIds);
      if (p.sellerByCompany) setImportedSellerByCompany(p.sellerByCompany);
      if (p.rowAssignments) setImportedRowAssignments(p.rowAssignments);
      if (p.result) setResult(p.result);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trin 1: Parse fil
  async function handleFile(f: File) {
    setFile(f);
    const rawText = await readFileSmart(f);
    const firstLine = rawText.split("\n")[0] ?? "";
    const delimiter =
      firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
    const csvText = stripCsvPreamble(rawText, delimiter);
    Papa.parse<ParsedRow>(csvText, {
      delimiter,
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
      complete: (res) => {
        const hdrs = selectableHeaders(res.meta.fields);
        setHeaders(hdrs);
        setRows(res.data);
        // Auto-match
        const auto: Partial<Record<SystemField, string>> = {};
        for (const f of SYSTEM_FIELDS) {
          const found = hdrs.find((h) =>
            AUTO_MATCH[f.key].some((alias) => normalizeHeaderName(h) === alias),
          );
          if (found) auto[f.key] = found;
        }
        setMapping(auto);
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
      const seg3Raw = data.customer_segment_3 as string | null | undefined;
      (data as any).binding_status = deriveBindingStatus(seg3Raw);
      (data as any).customer_category = deriveCustomerCategory(seg3Raw);
      const isPublic = (data as any).binding_status === "offentlig_aftale";
      (data as any).is_public = isPublic;
      const isDuplicate = !!cvr && existingCvrs.has(cvr);
      const eanMatchId = null;
      const nameMatchId =
        !cvr && !ean && data.name
          ? existingNameMap.get(`${String(data.name).toLowerCase()}|${(data.zip as string) ?? ""}`) ?? null
          : null;
      const hasError = !data.name;
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

  const stats = useMemo(() => {
    const newCount = prepared.filter((p) => !p.isDuplicate && !p.missingCvr && !p.hasError).length;
    const dupCount = prepared.filter((p) => p.isDuplicate).length;
    const missingCount = prepared.filter((p) => p.missingCvr && !p.hasError).length;
    const errorCount = prepared.filter((p) => p.hasError).length;
    const unmatchedSp = new Set(
      prepared.filter((p) => p.salespersonNo && !p.matchedSellerId).map((p) => p.salespersonNo!),
    );
    return { newCount, dupCount, missingCount, errorCount, unmatchedSalespersonNos: Array.from(unmatchedSp) };
  }, [prepared]);

  // Trin 4: kør import (batch-baseret bulk upsert)
  async function runImport() {
    if (importRunner.isBusy()) {
      toast.error("Der kører allerede en import. Vent indtil den er færdig.");
      return;
    }
    importRunner.start("anden");

    const CHUNK = 500;
    const yieldUI = () => new Promise((r) => setTimeout(r, 0));

    let created = 0, updated = 0, skipped = 0, failed = 0, enriched = 0, noCvrCount = 0;
    const toImport = prepared.filter((p) => {
      if (p.hasError) return false;
      // Tillad rækker uden CVR hvis de har EAN, ellers respekter checkbox
      if (p.missingCvr && !p.ean && !includeMissingCvr) return false;
      return true;
    });
    const importSource: "visma" | "cvr" = mapping.visma_id ? "visma" : "cvr";
    const nowIso = new Date().toISOString();
    const companyIds: string[] = [];
    const sellerByCompany: Record<string, string> = {};

    const VISMA_OVERWRITE = new Set([
      "visma_id", "visma_delivery_id", "created_in_visma",
      "turnover_12m", "last_purchase_date",
      "customer_segment_1", "customer_segment_2", "customer_segment_3",
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
    for (const j of upsertsRaw) {
      const key = j.payload.cvr as string;
      if (upsertsByCvr.has(key)) {
        dedupedCvrDuplicates++;
        // Behold seneste forekomst (overskriver tidligere) — typisk samme data
        upsertsByCvr.set(key, j);
      } else {
        upsertsByCvr.set(key, j);
      }
    }
    const upserts = Array.from(upsertsByCvr.values());
    if (dedupedCvrDuplicates > 0) {
      console.warn(`Dedupliceret ${dedupedCvrDuplicates} dublerede CVR-rækker i upload`);
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

    // 4) Opret lokationer pr. unikt Lev.kund-nr. (visma_delivery_id) pr. CVR.
    // Den række hvor Lev. kund == Fakt. kunde markeres som primær.
    let companiesWithMultipleLocations = 0;
    try {
      const cvrToCompanyId = new Map<string, string>();
      // Hent CVR for de oprettede/opdaterede company-id'er
      for (let i = 0; i < companyIds.length; i += 500) {
        const slice = companyIds.slice(i, i + 500);
        const { data } = await supabase.from("companies").select("id, cvr").in("id", slice);
        (data ?? []).forEach((r: any) => { if (r.cvr) cvrToCompanyId.set(r.cvr, r.id); });
      }

      // Grupper rækker pr. CVR for at finde unikke leveringsnumre
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

      const locRows: any[] = [];
      for (const [cvr, list] of byCvr.entries()) {
        if (list.length > 1) companiesWithMultipleLocations++;
        const companyId = cvrToCompanyId.get(cvr)!;
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
            is_primary: row.faktKunde !== null && row.faktKunde === row.delivery,
          });
        }
      }
      // Upsert pr. (company_id, visma_delivery_no) — server-side
      if (locRows.length) {
        try {
          await upsertLocations({ data: { rows: locRows } });
        } catch (e) {
          console.error("Lokationer-upsert fejl", e);
        }
      }
      if (companiesWithMultipleLocations > 0) {
        toast.success(
          `${companiesWithMultipleLocations} virksomheder fik flere lokationer registreret`,
        );
      }
    } catch (e) {
      console.error("Kunne ikke oprette lokationer", e);
    }

    // Byg per-række tildelinger (company + lokation + sælger) til Trin 5
    const rowAssignments: { company_id: string; location_id: string | null; seller_id: string | null }[] = [];
    try {
      // Hent location id-map (company_id, visma_delivery_no) -> location_id
      const locIdMap = new Map<string, string>();
      for (let i = 0; i < companyIds.length; i += 500) {
        const slice = companyIds.slice(i, i + 500);
        const { data } = await (supabase as any)
          .from("locations")
          .select("id, company_id, visma_delivery_no")
          .in("company_id", slice);
        (data ?? []).forEach((l: any) => {
          if (l.visma_delivery_no) {
            locIdMap.set(`${l.company_id}|${l.visma_delivery_no}`, l.id);
          }
        });
      }

      // Byg cvr -> company_id map
      const cvrToCompanyId = new Map<string, string>();
      for (let i = 0; i < companyIds.length; i += 500) {
        const slice = companyIds.slice(i, i + 500);
        const { data } = await supabase.from("companies").select("id, cvr").in("id", slice);
        (data ?? []).forEach((c: any) => { if (c.cvr) cvrToCompanyId.set(c.cvr, c.id); });
      }

      const seen = new Set<string>();
      for (const r of rows) {
        const cvr = mapping.cvr ? normCvr(r[mapping.cvr]) : null;
        const companyId = cvr ? cvrToCompanyId.get(cvr) : null;
        if (!companyId) continue;
        const delivery = mapping.visma_delivery_id ? (r[mapping.visma_delivery_id] ?? "").trim() : "";
        const locationId = delivery ? (locIdMap.get(`${companyId}|${delivery}`) ?? null) : null;
        const sellerRaw = mapping.salesperson_no ? (r[mapping.salesperson_no] ?? "").trim() : "";
        const sellerId = sellerRaw ? (salespersonMap.get(sellerRaw) ?? null) : (sellerByCompany[companyId] ?? null);
        const key = `${companyId}|${locationId ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rowAssignments.push({ company_id: companyId, location_id: locationId, seller_id: sellerId });
      }
    } catch (e) {
      console.error("Kunne ikke bygge per-række tildelinger", e);
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
      <h1 className="text-2xl md:text-3xl font-semibold mb-2">Anden fil – manuel mapping</h1>
      <p className="text-sm text-muted-foreground mb-6">CSV-import i 4 trin (+ valgfri tildeling)</p>

      <Stepper step={step} />

      {step === 1 && <Trin1Upload onFile={handleFile} />}
      {step === 2 && (
        <Trin2Mapping
          headers={headers}
          mapping={mapping}
          setMapping={setMapping}
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

function Trin1Upload({ onFile }: { onFile: (f: File) => void }) {
  return (
    <Card className="p-8">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileUp className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="font-semibold mb-1">Upload CSV-fil</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Filen skal have en kolonne med CVR-nummer og en med virksomhedsnavn.
        </p>
        <div className="max-w-sm mx-auto">
          <Input
            type="file"
            accept=".csv,text/csv"
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

function Trin2Mapping({
  headers,
  mapping,
  setMapping,
  onBack,
  onNext,
}: {
  headers: string[];
  mapping: Partial<Record<SystemField, string>>;
  setMapping: (m: Partial<Record<SystemField, string>>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Card className="p-6">
      <h2 className="font-semibold mb-1">Match kolonner</h2>
      <p className="text-sm text-muted-foreground mb-5">
        Vælg hvilken CSV-kolonne der svarer til hvert systemfelt. Alle felter er valgfrie — vælg "Tom / spring over" hvis kolonnen ikke findes i din fil.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SYSTEM_FIELDS.map((f) => (
          <div key={f.key}>
            <Label className="mb-1.5 block">{f.label}</Label>
            <Select
              value={mapping[f.key] ?? "__none"}
              onValueChange={(v) =>
                setMapping({ ...mapping, [f.key]: v === "__none" ? undefined : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Tom / spring over" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Tom / spring over</SelectItem>
                {headers.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
        </Button>
        <Button onClick={onNext}>
          Forhåndsvis <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </Card>
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
  stats: { newCount: number; dupCount: number; missingCount: number; errorCount: number; unmatchedSalespersonNos: string[] };
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
  stats: { newCount: number; dupCount: number; missingCount: number; errorCount: number; unmatchedSalespersonNos: string[] };
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
