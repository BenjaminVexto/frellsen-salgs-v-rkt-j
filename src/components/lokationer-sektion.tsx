import { UdskrivMaskinlisteKnap } from "@/components/maskinliste-print";
import { useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AfdelingBadge } from "@/components/afdeling-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Loader2, Plus, ChevronDown, ChevronUp, User, AlertTriangle, Wrench, MoreHorizontal, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { PenhedDaekning } from "@/components/penhed-daekning";
import { Link } from "@tanstack/react-router";
import { cvrNorm, cvrGrupperQuery, useGruppeKonti, type CvrPenhedRow } from "@/components/cvr-gruppe";
import { visSomAktivLokation } from "@/lib/lokation-visning";
import { hentAlle } from "@/lib/hent-alle";
import { fjernIndirekte } from "@/components/penhed-forhandler";
import { paenBy } from "@/components/virksomhed-liste";
import { AdressePenhedKobling } from "@/components/adresse-penhed-kobling";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/view-as-context";
import { maskinAftale, reservedeleStatus } from "@/lib/maskinliste";
import { PlaceringFelt, hentPlaceringer, type PlaceringInfo } from "@/components/placering-felt";
import { LocationSalesStrip } from "@/components/sales/location-sales-strip";
import { BesoegtKnap } from "@/components/besoegt-knap";
import { KatalogKnap } from "@/components/katalog-knap";
import { getLocationSalesSummary } from "@/lib/sales.functions";
import { getMasterAgreementSuppression } from "@/lib/agreements.functions";
import {
  isMachineWarningSuppressed,
  masterAgreementTooltip,
  type MasterAgreementSuppression,
  type SuppressionMap,
} from "@/lib/master-agreement";
import {
  getMachineAgreementStatuses,
  MACHINE_AGREEMENT_STATUS_LABELS,
  MACHINE_AGREEMENT_STATUS_TONE,
  type MachineAgreementStatusValue,
} from "@/lib/machine-agreement-status.functions";


export type Location = {
  id: string;
  company_id: string;
  visma_delivery_no: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  is_primary: boolean;
  created_at: string;
  equipment_frellsen_owned?: number | null;
  equipment_coffee_machines?: number | null;
  equipment_filters?: number | null;
  equipment_cooling?: number | null;
  equipment_service_contracts?: number | null;
  has_lease_agreement?: boolean | null;
  has_free_loan?: boolean | null;
  agreement_types?: string | null;
  equipment_summary?: string | null;
  sales_signal?: string | null;
  equipment_updated_at?: string | null;
};

const STATUS_RANG: Record<string, number> = { aktiv_kunde: 1, sovende_kunde: 2, servicekunde: 3, tidligere_kunde: 4, spaerret: 5, nyt_emne: 6 };
const KONTO_STATUS: Record<string, string> = {
  aktiv_kunde: "Aktiv",
  sovende_kunde: "Sovende",
  tidligere_kunde: "Tidligere kunde",
  servicekunde: "Servicekunde",
  nyt_emne: "Emne",
};

type PenhedInfo = {
  p_number: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  ansatte_praecis: number | null;
  ansatte_interval: string | null;
  ansatte_estimat: number | null;
};

type AdresseGruppe = {
  key: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  pnr: string | null;
  ansatte: number | null;
  ansatteTekst: string | null;
  ansatteEstimat: number | null;
  locs: Location[];
  primary: boolean;
  revenue: number;
  foersteIdx: number;
};

export { adresseNoegle } from "@/lib/adresse-grupper";
import { adresseNoegle } from "@/lib/adresse-grupper";

export type LocationContact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

const firstFilled = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

/** Udtræk vejnavn fra en fuld adresse ("Vejnavn 12, 1234 By" → "Vejnavn"). */
const streetName = (address: string | null | undefined): string | null => {
  if (!address || !address.trim()) return null;
  const trimmed = address.trim();
  // Fjern evt. postnummer/by efter komma
  const beforeComma = trimmed.split(",")[0]!.trim();
  // Find første tal-række (husnummer) og behold det der står før
  const match = beforeComma.match(/^(\D+?)\s+\d/);
  return match ? match[1]!.trim() : beforeComma;
};

export function LokationerSektion({
  companyId,
  isAdmin,
  onRegisterActivity,
  reloadKey,
  contactsByLocation,
  companyFallbackAddress,
  companyFallbackZip,
  companyFallbackCity,
  initialOpenLocationId,
  cvr,
  afdelingNr,
  companyName,
  assignedTo,
}: {
  companyId: string;
  isAdmin: boolean;
  onRegisterActivity: (locationId: string) => void;
  reloadKey?: number;
  contactsByLocation?: Map<string, LocationContact[]>;
  companyFallbackAddress?: string | null;
  companyFallbackZip?: string | null;
  companyFallbackCity?: string | null;
  initialOpenLocationId?: string | null;
  cvr?: string | null;
  afdelingNr?: number | null;
  companyName?: string | null;
  assignedTo?: string | null;
}) {
  const { user: authUser } = useAuth();
  const mitId = useViewAs().effectiveUserId ?? authUser?.id ?? null;
  const [locations, setLocations] = useState<Location[]>([]);
  const [hentet, setHentet] = useState(false);
  const [aabneAndre, setAabneAndre] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  // Åbne adressegrupper registreres via deres lokations-id'er (robust mod at nøglen skifter).
  const [aabneLok, setAabneLok] = useState<Set<string>>(new Set());
  const [vis2, setVis2] = useState(false);
  const [vis1, setVis1] = useState(25);
  const [visSov, setVisSov] = useState(25);
  const [visUden, setVisUden] = useState(25);
  const [addOpen, setAddOpen] = useState(false);
  const [sortMode, setSortMode] = useState<
    "default" | "revenue" | "street" | "lastPurchase" | "machines"
  >("default");
  const isMobile = useIsMobile();
  const [topSheet, setTopSheet] = useState(false);
  const [adrSheet, setAdrSheet] = useState<string | null>(null);
  const [aabneKonti, setAabneKonti] = useState<Set<string>>(new Set());
  // Mobil: maskiner pr. lokation til chips på adressekortet.
  const chipsIds = locations.map((l) => l.id).sort();
  const chipsQ = useQuery({
    enabled: isMobile && chipsIds.length > 0,
    queryKey: ["lok-maskinchips", chipsIds.join(",")],
    queryFn: async () => {
      const units = await hentAlle<{ id: string; location_id: string; machine_type: string | null; serial_no: string | null; udstyr_type: EquipmentUnit["udstyr_type"] }>(
        (fra, til) => (supabase as any)
          .from("location_equipment_units")
          .select("id, location_id, machine_type, serial_no, udstyr_type")
          .in("location_id", chipsIds).eq("is_filter", false).order("id").range(fra, til),
      );
      const m: Record<string, typeof units> = {};
      for (const u of units) (m[u.location_id] ??= []).push(u);
      return m;
    },
  });




  const load = async () => {
    const { data } = await (supabase as any)
      .from("locations")
      .select("*, saelger:profiles!locations_saelger_user_id_fkey(full_name)")
      .eq("company_id", companyId)
      .order("is_primary", { ascending: false })
      .order("city", { ascending: true });
    const rows = (data ?? []) as any[];
    // Søsterkonto-mærke: slå kontonummeret op for "køber på"-lokationen.
    const ids = rows.map((r) => r.koeber_paa_location_id).filter(Boolean);
    if (ids.length) {
      const { data: s } = await supabase.from("locations").select("id, visma_delivery_no").in("id", ids);
      const m = new Map((s ?? []).map((x) => [x.id, x.visma_delivery_no]));
      for (const r of rows) if (r.koeber_paa_location_id) r.koeber_paa = { visma_delivery_no: m.get(r.koeber_paa_location_id) ?? null };
    }
    setLocations(rows as Location[]);
    setHentet(true);
  };

  useEffect(() => {
    load();
  }, [companyId, reloadKey]);
  useEffect(() => setHentet(false), [companyId]);

  // Åbn + scroll til en bestemt lokation
  const openLocation = (locationId: string) => {
    setVis1(10000);
    setVisSov(10000);
    setVisUden(10000);
    setAabneLok((prev) => new Set(prev).add(locationId));
    setOpenId(locationId);
    requestAnimationFrame(() => {
      const el = document.getElementById(`location-${locationId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-primary", "rounded-md");
        setTimeout(
          () => el.classList.remove("ring-2", "ring-primary", "rounded-md"),
          2500,
        );
      }
    });
  };

  // Auto-open + scroll til en bestemt lokation når URL'en peger på den
  useEffect(() => {
    if (!initialOpenLocationId) return;
    if (!locations.some((l) => l.id === initialOpenLocationId)) return;
    openLocation(initialOpenLocationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenLocationId, locations]);


  const summaryFn = useServerFn(getLocationSalesSummary);
  const summaryQ = useQuery({
    enabled: locations.length > 0,
    queryKey: ["location-sales-summary", locations.map((l) => l.id).sort().join(",")],
    queryFn: () => summaryFn({ data: { locationIds: locations.map((l) => l.id) } }),
  });

  // Hent udløbende maskiner pr. lokation (90 dages vindue)
  const expiringQ = useQuery({
    enabled: locations.length > 0,
    queryKey: ["company-expiring-machines", companyId, locations.map((l) => l.id).sort().join(",")],
    queryFn: async () => {
      const todayS = new Date().toISOString().slice(0, 10);
      const in90D = new Date();
      in90D.setDate(in90D.getDate() + 90);
      const in90S = in90D.toISOString().slice(0, 10);

      // Hovedaftale-undertrykkelse: er virksomheden dækket, tælles maskinerne
      // ikke som "udløber snart" før hovedaftalen selv nærmer sig udløb.
      try {
        const sup = (await getMasterAgreementSuppression({
          data: { companyIds: [companyId] },
        })) as SuppressionMap;
        if (isMachineWarningSuppressed(sup[companyId], in90S)) {
          return new Map<string, number>();
        }
      } catch {
        // Ignorer — falder tilbage til normal advarsel
      }

      const locationIds = locations.map((l) => l.id);
      const { data: units } = await (supabase as any)
        .from("location_equipment_units")
        .select("serial_no, location_id")
        .eq("is_filter", false)
        .in("location_id", locationIds);
      const serials = Array.from(
        new Set(
          ((units ?? []) as any[])
            .map((u) => u.serial_no)
            .filter((s): s is string => !!s && s.trim().length > 0),
        ),
      );
      if (!serials.length) return new Map<string, number>();

      const { data: enr } = await (supabase as any)
        .from("machine_enrichment")
        .select("serienr, binding_ophor, handlingsdato")
        .eq("record_status", "aktiv")
        .eq("kilde", "sn")
        .in("serienr", serials)
        .or(
          `and(binding_ophor.gte.${todayS},binding_ophor.lte.${in90S}),and(handlingsdato.gte.${todayS},handlingsdato.lte.${in90S})`,
        );
      const expiringSerials = new Set(
        ((enr ?? []) as any[]).map((e) => String(e.serienr)),
      );
      const byLoc = new Map<string, number>();
      for (const u of (units ?? []) as any[]) {
        if (!u.serial_no || !expiringSerials.has(String(u.serial_no))) continue;
        byLoc.set(u.location_id, (byLoc.get(u.location_id) ?? 0) + 1);
      }
      return byLoc;
    },
  });

  // Antal maskiner pr. lokation (ikke-filter udstyrsenheder)
  const machineCountQ = useQuery({
    enabled: locations.length > 0,
    queryKey: [
      "location-machine-counts",
      locations.map((l) => l.id).sort().join(","),
    ],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("location_equipment_units")
        .select("location_id")
        .eq("is_filter", false)
        .in(
          "location_id",
          locations.map((l) => l.id),
        );
      const byLoc: Record<string, number> = {};
      for (const u of ((data ?? []) as any[])) {
        if (!u.location_id) continue;
        byLoc[u.location_id] = (byLoc[u.location_id] ?? 0) + 1;
      }
      return byLoc;
    },
  });

  // P-enheder koblet til lokationerne + CVR'ets P-enheder, vi ikke er hos.
  const pnrQ = useQuery({
    enabled: hentet,
    queryKey: ["lokation-penheder", companyId, cvr ?? null, afdelingNr ?? null, locations.map((l) => l.id).sort().join(",")],
    queryFn: async () => {
      const ids = locations.map((l) => l.id);
      const sb = supabase as any;
      const [lkRes, penRes] = await Promise.all([
        ids.length
          ? sb.from("location_pnr_link").select("p_nummer, location_id, kilde, oprettet_af").in("location_id", ids).in("kilde", ["auto", "manuel"])
          : Promise.resolve({ data: [] }),
        cvr
          ? sb.from("cvr_penheder").select("p_number, address, zip, city, ansatte_praecis, ansatte_interval, ansatte_estimat").eq("cvr", cvr).eq("is_active", true)
          : Promise.resolve({ data: [] }),
      ]);
      if (lkRes.error) throw new Error(lkRes.error.message);
      if (penRes.error) throw new Error(penRes.error.message);
      const pInfo: Record<string, PenhedInfo> = {};
      for (const p of (penRes.data ?? []) as any[]) pInfo[p.p_number] = p;
      const linkByLoc: Record<string, string> = {};
      for (const l of (lkRes.data ?? []) as any[]) linkByLoc[l.location_id] = l.p_nummer;
      const linkInfo: Record<string, { kilde: string; af: string | null }> = {};
      const afIds = Array.from(new Set(((lkRes.data ?? []) as any[]).filter((l) => l.kilde === "manuel" && l.oprettet_af).map((l) => l.oprettet_af)));
      const navne = new Map<string, string>();
      if (afIds.length) {
        const { data: pr } = await sb.from("profiles").select("id, full_name").in("id", afIds);
        for (const x of (pr ?? []) as any[]) navne.set(x.id, x.full_name);
      }
      for (const l of (lkRes.data ?? []) as any[]) linkInfo[l.location_id] = { kilde: l.kilde, af: l.oprettet_af ? navne.get(l.oprettet_af) ?? null : null };
      const mangler = Array.from(new Set(Object.values(linkByLoc))).filter((p) => !pInfo[p]);
      if (mangler.length) {
        const { data } = await sb.from("cvr_penheder").select("p_number, address, zip, city, ansatte_praecis, ansatte_interval, ansatte_estimat").in("p_number", mangler);
        for (const p of (data ?? []) as any[]) pInfo[p.p_number] = p;
      }
      // Antal P-enheder på CVR'et, der ikke er koblet til nogen lokation i afdelingen (ikke-relevante skjules som i listen).
      let ikkeHos = 0;
      let irAntal = 0;
      let indAntal = 0;
      const pnrs = ((penRes.data ?? []) as any[]).map((p) => p.p_number);
      if (pnrs.length && afdelingNr != null) {
        const [{ data: dk }, { data: ir }] = await Promise.all([
          sb.from("location_pnr_link").select("p_nummer, kilde").in("p_nummer", pnrs).eq("afdeling_nr", afdelingNr).in("kilde", ["auto", "manuel", "indirekte"]),
          sb.from("penhed_ikke_relevant").select("p_nummer").in("p_nummer", pnrs),
        ]);
        const skjul = new Set([...((dk ?? []) as any[]), ...((ir ?? []) as any[])].map((x) => x.p_nummer));
        ikkeHos = pnrs.filter((p) => !skjul.has(p)).length;
        const daekketSet = new Set(((dk ?? []) as any[]).map((x) => x.p_nummer));
        irAntal = ((ir ?? []) as any[]).filter((x) => !daekketSet.has(x.p_nummer)).length;
        indAntal = new Set(((dk ?? []) as any[]).filter((x) => x.kilde === "indirekte").map((x) => x.p_nummer)).size;
      }
      const penListe = ((penRes.data ?? []) as any[]) as (PenhedInfo & { p_number: string })[];
      return { linkByLoc, linkInfo, pInfo, ikkeHos, irAntal, indAntal, penListe };
    },
  });

  const cvrGrupperQ = useQuery({ ...cvrGrupperQuery, enabled: !!cvrNorm(cvr) });
  const gruppeKontiQ = useGruppeKonti(cvr);
  const oversigtQ = useQuery({
    enabled: !!cvr && afdelingNr != null,
    queryKey: ["cvr-penhed-oversigt", cvr, afdelingNr],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("cvr_penhed_oversigt", { _cvr: cvr, _afdeling_nr: afdelingNr });
      if (error) throw error;
      return (data ?? []) as CvrPenhedRow[];
    },
  });

  // Fuld lokationsinfo hentes kun for de andre konti, brugeren folder ud.
  const aabenKontoIds = [...aabneAndre].map((key) => {
    if (key.startsWith("k:")) return key.slice(2);
    return (oversigtQ.data ?? []).find((r) => `p:${r.p_number}` === key)?.company_id;
  }).filter((id): id is string => !!id);
  const andreLokQ = useQuery({
    enabled: aabenKontoIds.length > 0,
    queryKey: ["andre-konti-lokationer", [...aabenKontoIds].sort().join(",")],
    queryFn: () => hentAlle<Location>((fra, til) => (supabase as any).from("locations")
      .select("*, saelger:profiles!locations_saelger_user_id_fkey(full_name)")
      .in("company_id", aabenKontoIds).order("id").range(fra, til)),
  });
  const andreSynligeIds = (oversigtQ.data ?? []).map((r) => r.location_id).filter((id): id is string => !!id);
  const andreTalQ = useQuery({
    enabled: andreSynligeIds.length > 0,
    queryKey: ["andre-lokationer-salg-maskiner", [...andreSynligeIds].sort().join(",")],
    queryFn: async () => {
      const salg = await summaryFn({ data: { locationIds: andreSynligeIds } });
      const units = await hentAlle<{ location_id: string }>((fra, til) => (supabase as any)
        .from("location_equipment_units").select("id, location_id")
        .in("location_id", andreSynligeIds).eq("is_filter", false).order("id").range(fra, til));
      const maskiner: Record<string, number> = {};
      for (const u of units) maskiner[u.location_id] = (maskiner[u.location_id] ?? 0) + 1;
      return { salg, maskiner };
    },
  });

  const sortedLocations = useMemo(() => {
    if (sortMode === "street") {
      return [...locations].sort((a, b) => {
        const sa = streetName(a.address) ?? "";
        const sb = streetName(b.address) ?? "";
        return sa.localeCompare(sb, "da") || (a.address ?? "").localeCompare(b.address ?? "", "da");
      });
    }
    if (sortMode === "machines") {
      const counts = machineCountQ.data ?? {};
      return [...locations].sort((a, b) => {
        const ca = counts[a.id] ?? 0;
        const cb = counts[b.id] ?? 0;
        if (cb !== ca) return cb - ca;
        return (a.is_primary ? 0 : 1) - (b.is_primary ? 0 : 1);
      });
    }
    if (sortMode === "lastPurchase") {
      const summary = summaryQ.data ?? {};
      // Nyeste køb først; lokationer uden køb lægges nederst, så det er let at
      // se hvilke afdelinger der ikke handler.
      return [...locations].sort((a, b) => {
        const da = summary[a.id]?.lastPurchase ?? "";
        const db = summary[b.id]?.lastPurchase ?? "";
        if (da !== db) return db.localeCompare(da);
        return (a.is_primary ? 0 : 1) - (b.is_primary ? 0 : 1);
      });
    }

    if (sortMode !== "revenue") {
      return [...locations].sort(
        (a, b) =>
          (a.city ?? a.address ?? "").localeCompare(
            b.city ?? b.address ?? "",
            "da",
          ) || (a.address ?? "").localeCompare(b.address ?? "", "da"),
      );
    }
    const summary = summaryQ.data ?? {};

    return [...locations].sort((a, b) => {
      const ra = summary[a.id]?.revenue12m ?? 0;
      const rb = summary[b.id]?.revenue12m ?? 0;
      if (rb !== ra) return rb - ra;
      return (a.is_primary ? 0 : 1) - (b.is_primary ? 0 : 1);
    });
  }, [locations, sortMode, summaryQ.data, machineCountQ.data]);

  const grupper = useMemo(() => {
    const linkByLoc = pnrQ.data?.linkByLoc ?? {};
    const pInfo = pnrQ.data?.pInfo ?? {};
    const summary = summaryQ.data ?? {};
    const map = new Map<string, AdresseGruppe>();
    sortedLocations.forEach((l, idx) => {
      const adr = firstFilled(l.address, l.is_primary ? companyFallbackAddress : null);
      const zip = firstFilled(l.zip, l.is_primary ? companyFallbackZip : null);
      const city = firstFilled(l.city, l.is_primary ? companyFallbackCity : null);
      const pnr = linkByLoc[l.id] ?? null;
      const nk = adresseNoegle(adr);
      const key = pnr ? `p:${pnr}` : nk ? `a:${zip ?? ""}|${nk}` : "uden";
      let g = map.get(key);
      if (!g) {
        const p = pnr ? pInfo[pnr] : undefined;
        g = {
          key,
          address: key === "uden" ? null : (p?.address ?? adr),
          zip: p?.zip ?? zip,
          city: p?.city ?? city,
          pnr,
          ansatte: p ? (p.ansatte_praecis ?? null) : null,
          ansatteTekst: p ? (p.ansatte_praecis != null ? p.ansatte_praecis.toLocaleString("da-DK") : p.ansatte_interval?.replace("-", "–") ?? null) : null,
          ansatteEstimat: p?.ansatte_estimat ?? (p?.ansatte_praecis ?? null),
          locs: [],
          primary: false,
          revenue: 0,
          foersteIdx: idx,
        };
        map.set(key, g);
      }
      g.locs.push(l);
      if (l.is_primary) g.primary = true;
      g.revenue += summary[l.id]?.revenue12m ?? 0;
    });
    const list = Array.from(map.values());
    const egen = (g: AdresseGruppe) => !!mitId && g.locs.some((l) => (l as any).saelger_user_id === mitId);
    list.sort((a, b) => {
      if ((a.key === "uden") !== (b.key === "uden")) return a.key === "uden" ? 1 : -1;
      if (egen(a) !== egen(b)) return egen(a) ? -1 : 1;
      if (sortMode !== "default") return a.foersteIdx - b.foersteIdx;
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      const ea = a.ansatteEstimat ?? -1;
      const eb = b.ansatteEstimat ?? -1;
      if (eb !== ea) return eb - ea;
      return b.revenue - a.revenue;
    });
    return list;
  }, [mitId, sortedLocations, pnrQ.data, summaryQ.data, sortMode, companyFallbackAddress, companyFallbackZip, companyFallbackCity]);

  const expiringByLoc = expiringQ.data ?? new Map<string, number>();
  const expiringTotal = Array.from(expiringByLoc.values()).reduce((n, v) => n + v, 0);
  const [expiringOpen, setExpiringOpen] = useState(false);
  // Mobil: én adresse foldes ud som standard (kun første gang).
  const autoAabnet = useRef(false);
  useEffect(() => {
    if (!isMobile || autoAabnet.current || !hentet || !grupper.length) return;
    autoAabnet.current = true;
    if (grupper.length === 1) {
      setAabneLok((prev) => { const n = new Set(prev); grupper[0]!.locs.forEach((l) => n.add(l.id)); return n; });
    }
  }, [isMobile, hentet, grupper]);


  // Always render the section (header) when admin; hide entirely if no data and no write
  if (!hentet) {
    return (
      <Card className="p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-4">
          <MapPin className="h-4 w-4" /> Lokationer
        </h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Henter lokationer…
        </div>
      </Card>
    );
  }
  if (locations.length === 0 && !isAdmin) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Ingen lokationer registreret.</p>
      </Card>
    );
  }

  // ---- Samlet visning: aktive lokationer + øvrige (kun visning) ----
  type Raekke = {
    key: string;
    address: string | null;
    zip: string | null;
    city: string | null;
    meta: string | null;
    konto: "egen" | "anden" | "via";
    kontoId: string | null;
    kontoNr: string | null;
    viaNavn: string | null;
    saelger: string | null;
    oms: number | null;
    maskiner: number | null;
    sidsteKoeb: string | null;
    status: string | null;
    primary: boolean;
    gruppe: AdresseGruppe | null;
  };
  const adrKey = (adr: string | null, zip: string | null) => {
    const nk = adresseNoegle(adr);
    return nk ? `${(zip ?? "").trim()}|${nk}` : null;
  };
  const summary = summaryQ.data ?? {};
  const brugtPnr = new Set<string>();
  const brugtAdr = new Set<string>();
  const egneRaekker: Raekke[] = grupper.map((g) => {
    if (g.pnr) brugtPnr.add(g.pnr);
    const k = adrKey(g.address, g.zip);
    if (k) brugtAdr.add(k);
    const bedst = g.locs
      .map((l) => ((l as any).kreditspaerret ? "spaerret" : ((l as any).customer_type as string)))
      .sort((x, y) => (STATUS_RANG[x] ?? 9) - (STATUS_RANG[y] ?? 9))[0] ?? null;
    const saelgere = Array.from(new Set(g.locs.map((l) => (l as any).saelger?.full_name ?? ((l as any).i_aktoer === false ? "Ikke i Aktør" : null)).filter(Boolean)));
    const koeb = g.locs.map((l) => summary[l.id]?.lastPurchase ?? "").sort().pop() || null;
    return {
      key: `g:${g.key}`,
      address: g.key === "uden" ? "Uden adresse" : g.address,
      zip: g.zip,
      city: g.city,
      meta: [g.ansatteTekst ? `${g.ansatteTekst} ansatte` : null, g.pnr ? `P-nr. ${g.pnr}` : null].filter(Boolean).join(" · ") || null,
      konto: "egen",
      kontoId: companyId,
      kontoNr: g.locs.map((l) => l.visma_delivery_no).filter(Boolean).join(", ") || null,
      viaNavn: null,
      saelger: saelgere.join(", ") || null,
      oms: g.revenue,
      maskiner: g.locs.reduce((n, l) => n + (machineCountQ.data?.[l.id] ?? 0), 0),
      sidsteKoeb: koeb,
      status: bedst,
      primary: g.primary,
      gruppe: g,
    };
  });
  const andreRaekker: Raekke[] = [];
  const brugtKonto = new Set<string>([companyId]);
  for (const p of oversigtQ.data ?? []) {
    if (brugtPnr.has(p.p_number)) continue;
    if (p.status === "ikke") continue;
    if (p.status === "direkte" && (!p.company_id || p.company_id === companyId)) continue;
    const k = adrKey(p.address, p.zip);
    if (k && brugtAdr.has(k)) continue;
    if (k) brugtAdr.add(k);
    brugtPnr.add(p.p_number);
    if (p.company_id) brugtKonto.add(p.company_id);
    const ans = p.ansatte != null ? p.ansatte.toLocaleString("da-DK") : p.ansatte_interval?.replace("-", "–") ?? null;
    andreRaekker.push({
      key: `p:${p.p_number}`,
      address: p.address,
      zip: p.zip,
      city: p.city,
      meta: [ans ? `${ans} ansatte` : null, `P-nr. ${p.p_number}`].filter(Boolean).join(" · "),
      konto: p.status === "indirekte" ? "via" : "anden",
      kontoId: p.status === "indirekte" ? p.via_company_id : p.company_id,
      kontoNr: p.visma_delivery_no,
      viaNavn: p.via_company_name,
      saelger: p.status === "indirekte" ? null : p.saelger_navn,
      oms: p.status === "indirekte" ? null : p.oms_12m,
      maskiner: p.location_id && andreTalQ.data ? andreTalQ.data.maskiner[p.location_id] ?? 0 : null,
      sidsteKoeb: p.location_id ? andreTalQ.data?.salg[p.location_id]?.lastPurchase ?? null : null,
      status: p.status === "indirekte" ? "via" : p.customer_type,
      primary: false,
      gruppe: null,
    });
  }
  for (const k of gruppeKontiQ.data ?? []) {
    if (brugtKonto.has(k.company_id)) continue;
    const ak = adrKey(k.address, k.zip);
    if (ak && brugtAdr.has(ak)) continue;
    if (ak) brugtAdr.add(ak);
    andreRaekker.push({
      key: `k:${k.company_id}`,
      address: k.address,
      zip: k.zip,
      city: k.city,
      meta: null,
      konto: "anden",
      kontoId: k.company_id,
      kontoNr: k.visma_id,
      viaNavn: null,
      saelger: k.saelger_navn,
      oms: k.maa_se_salg ? k.oms_12m : null,
      maskiner: null,
      sidsteKoeb: null,
      status: k.customer_type,
      primary: false,
      gruppe: null,
    });
  }
  const erAktiv = (r: Raekke) => visSomAktivLokation(r.status, r.oms, r.konto === "via");
  const omsSort = (a: Raekke, b: Raekke) => (b.oms ?? -1) - (a.oms ?? -1);
  const aktive = [
    ...egneRaekker.filter(erAktiv).sort((a, b) => Number(b.primary) - Number(a.primary) || omsSort(a, b)),
    ...andreRaekker.filter(erAktiv).sort((a, b) => Number(a.konto === "via") - Number(b.konto === "via") || omsSort(a, b)),
  ];
  const sovende = [
    ...egneRaekker.filter((r) => !erAktiv(r) && r.gruppe?.pnr),
    ...andreRaekker.filter((r) => !erAktiv(r)),
  ].sort(omsSort);
  const udenKobling = egneRaekker.filter((r) => !erAktiv(r) && !r.gruppe?.pnr);
  const ikkeHos = cvr && afdelingNr != null ? pnrQ.data?.ikkeHos ?? 0 : 0;
  const harIkkeRel = cvr && afdelingNr != null && (pnrQ.data?.irAntal ?? 0) > 0;
  const antal2 = sovende.length + udenKobling.length + ikkeHos;
  const normalCvr = cvrNorm(cvr);
  const cvrInfo = normalCvr ? cvrGrupperQ.data?.get(normalCvr) : undefined;
  const heleCvr = !!cvrInfo && cvrInfo.antal_konti > 1;
  const samletOms = heleCvr && cvrInfo ? cvrInfo.oms_12m : egneRaekker.reduce((s, r) => s + (r.oms ?? 0), 0);
  const antalPenheder = oversigtQ.data?.length ?? 0;
  const tvungen2 = [...sovende, ...udenKobling].some((r) => r.gruppe?.locs.some((l) => aabneLok.has(l.id)));
  const aaben2 = vis2 || tvungen2;
  const VIS = 25;
  const KOLS = "grid-cols-[minmax(0,1fr)_1.25rem] @xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_6.5rem_4rem_5.5rem_1.25rem]";
  const kroner = (n: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString("da-DK")} kr.`);
  const dato = (d: string | null) => (d ? new Date(d).toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

  const detaljer = (g: AdresseGruppe) => (
    <div className="pl-6 pr-3 pb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {g.locs.length} {g.locs.length === 1 ? "konto" : "konti"} på adressen: {g.locs.map((l) => l.visma_delivery_no ?? "–").join(", ")}
        </div>
        {g.locs.some((l) => (machineCountQ.data?.[l.id] ?? 0) > 0) && (
          <UdskrivMaskinlisteKnap
            lille
            label="Maskinliste for denne adresse"
            company={{ id: companyId, name: companyName ?? "", cvr }}
            locationIds={g.locs.map((l) => l.id)}
          />
        )}
      </div>
      {cvr && g.key !== "uden" && g.locs.some((l) => l.visma_delivery_no) && (
        <AdressePenhedKobling
          pnr={g.pnr}
          pnrAdresse={g.address}
          locs={g.locs.filter((l) => l.visma_delivery_no || g.pnr)}
          linkInfo={pnrQ.data?.linkInfo ?? {}}
          afdelingNr={afdelingNr}
          penListe={pnrQ.data?.penListe ?? []}
          zip={g.zip}
          onChanged={() => { pnrQ.refetch(); oversigtQ.refetch(); }}
        />
      )}
      <ul className="divide-y mt-1 rounded-md border bg-background px-3">
        {g.locs.map((l) => (
          <LokationRow
            key={l.id}
            location={l}
            isPrimary={l.is_primary}
            isAdmin={isAdmin}
            open
            onToggle={() => setAabneLok((prev) => { const n = new Set(prev); g.locs.forEach((x) => n.delete(x.id)); return n; })}
            contacts={contactsByLocation?.get(l.id) ?? []}
            fallbackAddress={l.is_primary ? companyFallbackAddress : null}
            fallbackZip={l.is_primary ? companyFallbackZip : null}
            fallbackCity={l.is_primary ? companyFallbackCity : null}
            onRegister={() => onRegisterActivity(l.id)}
            companyId={companyId}
            visBesoeg={locations.length > 1}
            lastPurchase={summary[l.id]?.lastPurchase ?? null}
            showLastPurchase={false}
            machineCount={machineCountQ.data?.[l.id] ?? 0}
            showMachineCount={false}
            kontoVisning={{ revenue12m: summary[l.id]?.revenue12m ?? null }}
          />
        ))}
      </ul>
    </div>
  );

  const harMaskinerTotal = grupper.some((g) => g.locs.some((l) => (machineCountQ.data?.[l.id] ?? 0) > 0));
  const maskinlisteTop = (
    <UdskrivMaskinlisteKnap
      company={{ id: companyId, name: companyName ?? "", cvr }}
      adresser={grupper
        .filter((g) => g.locs.some((l) => (machineCountQ.data?.[l.id] ?? 0) > 0))
        .map((g) => ({
          key: g.key,
          label: [g.city, g.address].filter(Boolean).join(" · ") || "Uden adresse",
          locIds: g.locs.map((l) => l.id),
          egen: !!mitId && g.locs.some((l) => (l as any).saelger_user_id === mitId),
        }))}
    />
  );
  const dageSiden = (d: string | null) => {
    if (!d) return "Intet køb";
    const n = Math.max(0, Math.floor((Date.now() - new Date(d.slice(0, 10) + "T00:00:00Z").getTime()) / 86400000));
    return n === 0 ? "i dag" : n === 1 ? "1 dag siden" : `${n.toLocaleString("da-DK")} dage siden`;
  };
  const maskinChips = (g: AdresseGruppe) => {
    const set = new Set<string>();
    const m = new Map<string, { label: string; kind: Ownership; n: number }>();
    for (const l of g.locs) {
      for (const u of chipsQ.data?.[l.id] ?? []) {
        const k = u.serial_no?.trim() || `id:${u.id}`;
        if (set.has(k)) continue;
        set.add(k);
        const o = deriveOwnership(u);
        const label = `${(u.machine_type ?? "Ukendt").trim() || "Ukendt"} · ${o.label}`;
        const x = m.get(label) ?? { label, kind: o.kind, n: 0 };
        x.n += 1;
        m.set(label, x);
      }
    }
    return Array.from(m.values());
  };

  const mobilKort = (r: Raekke, g: AdresseGruppe, aaben: boolean, toggle: () => void, egen: boolean, nedtonet: boolean) => {
    const by = [g.zip, paenBy(g.city)].filter(Boolean).join(" ");
    const navne = new Set(
      g.locs.map((l) => (l as any).saelger?.full_name ?? ((l as any).i_aktoer === false ? "Ikke i Aktør" : "Ingen sælger")),
    );
    const saelgerTekst = navne.size > 1 ? "Flere sælgere" : Array.from(navne)[0] ?? null;
    const chips = maskinChips(g);
    const rep =
      g.locs.find((l) => l.is_primary) ?? g.locs.find((l) => (l as any).customer_type === "aktiv_kunde") ?? g.locs[0]!;
    const harMaskiner = g.locs.some((l) => (machineCountQ.data?.[l.id] ?? 0) > 0);
    const kontaktSet = new Set<string>();
    const kontakter: LocationContact[] = [];
    for (const l of g.locs) {
      const liste = contactsByLocation?.get(l.id)?.length
        ? contactsByLocation!.get(l.id)!
        : l.contact_person || l.phone || l.email
          ? [{ id: l.id, name: l.contact_person ?? "", phone: l.phone, email: l.email }]
          : [];
      for (const c of liste) {
        const k = `${c.name}|${c.phone ?? ""}|${c.email ?? ""}`.toLowerCase().replace(/\s+/g, "");
        if (kontaktSet.has(k)) continue;
        kontaktSet.add(k);
        kontakter.push(c);
      }
    }
    const adresse = r.address || "Ukendt adresse";
    return (
      <li
        key={r.key}
        className={`border-l-4 ${egen ? "border-l-primary" : "border-l-transparent"} ${aaben ? "bg-muted/40" : ""} ${nedtonet ? "text-muted-foreground" : ""}`}
      >
        <button type="button" aria-expanded={aaben} onClick={toggle} className="w-full min-h-11 flex items-start gap-2 px-3 pt-3 pb-2 text-left">
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold truncate">{adresse}</span>
              {r.primary && <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal shrink-0">Primær</Badge>}
            </span>
            <span className="block text-xs text-muted-foreground truncate">
              {[by, `${kroner(r.oms)} / 12 mdr.`, dageSiden(r.sidsteKoeb)].filter(Boolean).join(" · ")}
            </span>
            {saelgerTekst && (
              <span className="flex items-center gap-1 text-xs min-w-0">
                <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{saelgerTekst}</span>
              </span>
            )}
            {chips.length > 0 && (
              <span className="flex flex-wrap gap-1 pt-1">
                {chips.slice(0, 3).map((c) => (
                  <span key={c.label} className="rounded-full border bg-background px-2 py-0.5 text-[11px] max-w-full truncate">
                    {c.n > 1 ? `${c.n}× ` : ""}{c.label}
                  </span>
                ))}
                {chips.length > 3 && (
                  <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">+{chips.length - 3}</span>
                )}
              </span>
            )}
          </span>
          {aaben ? <ChevronUp className="h-4 w-4 shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 shrink-0 mt-1" />}
        </button>
        <div className="flex gap-2 px-3 pb-3">
          <BesoegtKnap companyId={companyId} locationId={rep.id} size="sm" compact className="h-11 flex-1 min-w-0" />
          <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Flere handlinger for adressen" onClick={() => setAdrSheet(g.key)}>
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </div>
        <Sheet open={adrSheet === g.key} onOpenChange={(o) => !o && setAdrSheet(null)}>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-lg space-y-3 [&_button]:min-h-11" aria-describedby={undefined}>
            <SheetHeader><SheetTitle className="truncate pr-6">{adresse}</SheetTitle></SheetHeader>
            <KatalogKnap companyId={companyId} locationId={rep.id} size="lg" className="w-full" />
            <Button variant="outline" className="w-full justify-start" onClick={() => { setAdrSheet(null); onRegisterActivity(rep.id); }}>
              Registrér aktivitet her
            </Button>
            {harMaskiner && (
              <div className="[&_button]:w-full [&_button]:justify-start">
                <UdskrivMaskinlisteKnap
                  label="Maskinliste for denne adresse"
                  company={{ id: companyId, name: companyName ?? "", cvr }}
                  locationIds={g.locs.map((l) => l.id)}
                />
              </div>
            )}
            {cvr && g.key !== "uden" && g.locs.some((l) => l.visma_delivery_no) && (
              <div className="rounded-md border [&_button]:text-sm">
                <AdressePenhedKobling
                  pnr={g.pnr}
                  pnrAdresse={g.address}
                  locs={g.locs.filter((l) => l.visma_delivery_no || g.pnr)}
                  linkInfo={pnrQ.data?.linkInfo ?? {}}
                  afdelingNr={afdelingNr}
                  penListe={pnrQ.data?.penListe ?? []}
                  zip={g.zip}
                  onChanged={() => { pnrQ.refetch(); oversigtQ.refetch(); }}
                />
              </div>
            )}
          </SheetContent>
        </Sheet>
        {aaben && (
          <div className="px-3 pb-3 space-y-3">
            <EquipmentBox location={rep} locationIds={g.locs.map((l) => l.id)} skjulSortering />
            {kontakter.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Kontakt</div>
                {kontakter.map((c) => (
                  <div key={c.id} className="text-sm min-w-0">
                    {c.name && <div className="font-medium truncate">{c.name}</div>}
                    <div className="flex flex-wrap gap-2">
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="inline-flex min-h-11 items-center gap-1.5 text-primary">
                          <Phone className="h-4 w-4" /> {c.phone}
                        </a>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="inline-flex min-h-11 items-center gap-1.5 text-primary min-w-0">
                          <Mail className="h-4 w-4 shrink-0" /> <span className="truncate">{c.email}</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                {g.locs.length === 1 ? "Konto" : `Konti (${g.locs.length})`}
              </div>
              <ul className="divide-y rounded-md border bg-background">
                {g.locs.map((l) => {
                  const ab = aabneKonti.has(l.id);
                  const ct = (l as any).customer_type as string;
                  const st = (l as any).kreditspaerret ? "Spærret" : KONTO_STATUS[ct] ?? null;
                  const koeberPaa = (l as any).koeber_paa?.visma_delivery_no && ct !== "aktiv_kunde" ? (l as any).koeber_paa.visma_delivery_no : null;
                  return (
                    <li key={l.id} id={`location-${l.id}`} className="scroll-mt-20">
                      <button
                        type="button"
                        aria-expanded={ab}
                        onClick={() => setAabneKonti((p) => { const n = new Set(p); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })}
                        className="w-full min-h-11 flex items-center gap-2 px-3 py-2 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 min-w-0 text-sm">
                            <span className="truncate tabular-nums">
                              {[l.visma_delivery_no ?? "–", ct === "servicekunde" ? null : st, kroner(summary[l.id]?.revenue12m ?? null), dageSiden(summary[l.id]?.lastPurchase ?? null)].filter(Boolean).join(" · ")}
                            </span>
                            {ct === "servicekunde" && <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal shrink-0">Service</Badge>}
                          </span>
                          {koeberPaa && <span className="block text-xs text-muted-foreground truncate">Køber på konto {koeberPaa}</span>}
                        </span>
                        {ab ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                      </button>
                      {ab && (
                        <div className="px-3 pb-3 space-y-2">
                          <LocationSalesStrip locationId={l.id} isAdmin={!!isAdmin} />
                          {l.visma_delivery_no && <div className="text-xs text-muted-foreground">Lev.nr. {l.visma_delivery_no}</div>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </li>
    );
  };

  const raekkeEl = (r: Raekke, nedtonet = false) => {
    const g = r.gruppe;
    const aaben = g ? g.locs.some((l) => aabneLok.has(l.id)) : aabneAndre.has(r.key);
    const egen = !!g && !!mitId && g.locs.some((l) => (l as any).saelger_user_id === mitId);
    const toggle = () => {
      if (!g) {
        setAabneAndre((prev) => { const n = new Set(prev); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; });
        return;
      }
      setAabneLok((prev) => {
        const n = new Set(prev);
        if (aaben) g.locs.forEach((l) => n.delete(l.id));
        else g.locs.forEach((l) => n.add(l.id));
        return n;
      });
    };
    if (isMobile && g) return mobilKort(r, g, aaben, toggle, egen, nedtonet);
    const by = [r.zip, paenBy(r.city)].filter(Boolean).join(" ");
    const kontoCelle =
      r.konto === "egen" ? (
        <span className="inline-flex flex-wrap items-center gap-1">
          <span className="tabular-nums">{r.kontoNr ?? "–"}</span>
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">Denne konto</Badge>
        </span>
      ) : r.kontoId ? (
        <Link
          to="/virksomheder/$id"
          params={{ id: r.kontoId }}
          onClick={(e) => e.stopPropagation()}
          className="text-primary hover:underline"
        >
          {r.konto === "via" ? `Via ${r.viaNavn ?? "forhandler"}` : `Anden konto ${r.kontoNr ?? ""}`}
        </Link>
      ) : (
        "—"
      );
    const statusTekst = r.status && r.status !== "via" && r.status !== "aktiv_kunde" ? (r.status === "spaerret" ? "Spærret" : KONTO_STATUS[r.status] ?? null) : null;
    const indhold = (
      <>
        <span className="min-w-0 text-sm">
          <span className="font-semibold break-words">{r.address || "Ukendt adresse"}</span>
          {r.primary && (
            <Badge variant="outline" className="ml-1.5 h-4 px-1.5 text-[10px] font-normal align-middle">Primær</Badge>
          )}
          {by && <span className="block text-xs">{by}</span>}
          {r.meta && <span className="block text-[11px] text-muted-foreground">{r.meta}</span>}
          <span className="@xl:hidden block text-xs text-muted-foreground mt-0.5">
            {[r.konto === "egen" ? `Denne konto ${r.kontoNr ?? ""}`.trim() : null, statusTekst, r.saelger, r.konto === "via" ? null : kroner(r.oms)].filter(Boolean).join(" · ")}
          </span>
          {r.konto !== "egen" && <span className="@xl:hidden block text-xs">{kontoCelle}</span>}
        </span>
        <span className="hidden @xl:block text-xs min-w-0">
          {kontoCelle}
          {statusTekst && <span className="block text-muted-foreground">{statusTekst}</span>}
        </span>
        <span className="hidden @xl:block text-xs truncate" title={r.saelger ?? undefined}>{r.saelger ?? "—"}</span>
        <span className="hidden @xl:block text-xs text-right tabular-nums">{kroner(r.oms)}</span>
        <span className="hidden @xl:block text-xs text-right tabular-nums">{r.maskiner ?? "—"}</span>
        <span className="hidden @xl:block text-xs text-right tabular-nums">{dato(r.sidsteKoeb)}</span>
        {aaben ? <ChevronUp className="h-4 w-4 shrink-0 justify-self-end" /> : <ChevronDown className="h-4 w-4 shrink-0 justify-self-end" />}
      </>
    );
    return (
      <li
        key={r.key}
        className={`border-l-4 ${egen ? "border-l-primary" : "border-l-transparent"} ${aaben ? "bg-muted/40" : ""} ${nedtonet ? "text-muted-foreground" : ""}`}
      >
        <div role="button" tabIndex={0} aria-expanded={aaben} onClick={toggle} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); } }} className={`w-full grid ${KOLS} gap-x-2 gap-y-0.5 items-center px-3 py-2 text-left hover:bg-muted/40 cursor-pointer`}>
          {indhold}
        </div>
        {aaben && g && detaljer(g)}
        {aaben && !g && (
          <div className="px-6 pb-3 text-xs">
            {r.konto === "via" ? (
              <>
                {r.meta && <p className="text-muted-foreground mb-2">{(oversigtQ.data ?? []).find((p) => `p:${p.p_number}` === r.key)?.note}</p>}
                <Button variant="outline" size="sm" onClick={async () => {
                  if (afdelingNr == null) return;
                  const p = (oversigtQ.data ?? []).find((p) => `p:${p.p_number}` === r.key);
                  if (!p) return;
                  try { await fjernIndirekte(p.p_number, afdelingNr); pnrQ.refetch(); oversigtQ.refetch(); toast.success("Markering fortrudt"); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Kunne ikke fortryde"); }
                }}>Fortryd "Leveres via forhandler"</Button>
              </>
            ) : (
              <>
                {andreLokQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <ul className="divide-y">
                    {(andreLokQ.data ?? []).filter((l) => l.company_id === r.kontoId && adrKey(l.address, l.zip) === adrKey(r.address, r.zip)).map((l) => (
                      <LokationRow key={l.id} location={l} isPrimary={l.is_primary} isAdmin={isAdmin}
                        open onToggle={() => toggle()} onRegister={() => { if (r.kontoId) window.location.href = `/virksomheder/${r.kontoId}#aktivitet`; }}
                        companyId={r.kontoId ?? undefined} visBesoeg={false}
                        kontoVisning={{ revenue12m: r.oms }} />
                    ))}
                  </ul>
                )}
                {r.kontoId && <Link to="/virksomheder/$id" params={{ id: r.kontoId }} className="text-primary hover:underline">Åbn kontoens kundekort</Link>}
              </>
            )}
          </div>
        )}
      </li>
    );
  };

  const tabel = (rows: Raekke[], vis: number, setVis: (n: number) => void, nedtonet = false, header = true) => (
    <>
      <ul className="@container divide-y rounded-md border">
        {header && (
          <li className={`hidden @xl:grid ${KOLS} gap-x-2 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30`}>
            <span>Lokation</span><span>Konto</span><span>Sælger</span><span className="text-right">Oms. 12 mdr.</span><span className="text-right">Maskiner</span><span className="text-right">Sidste køb</span><span />
          </li>
        )}
        {rows.slice(0, vis).map((r) => raekkeEl(r, nedtonet))}
      </ul>
      {rows.length > vis && (
        <Button variant="ghost" size="sm" className="w-full mt-1 text-muted-foreground" onClick={() => setVis(vis + VIS * 2)}>
          <ChevronDown className="h-4 w-4 mr-1" /> Vis flere ({rows.length - vis} tilbage)
        </Button>
      )}
    </>
  );

  const underOverskrift = (t: string) => (
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mt-3 mb-1">{t}</div>
  );

  return (
    <section className="py-1">
      <p className="text-xs text-muted-foreground mb-3">
        {aktive.length} {aktive.length === 1 ? "aktiv lokation" : "aktive lokationer"} · {kroner(samletOms)} / 12 mdr.
        {heleCvr ? " (hele CVR)" : ""}
        {antalPenheder > 0 ? ` · ${antalPenheder} P-enheder i alt` : ""}
      </p>
      {isMobile ? (
        <div className="flex items-center justify-between mb-1 gap-2">
          <h2 className="font-semibold flex items-center gap-2 min-w-0">
            <MapPin className="h-4 w-4 shrink-0" /> Aktive lokationer
          </h2>
          {(harMaskinerTotal || isAdmin) && (
            <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label="Flere handlinger for lokationer" onClick={() => setTopSheet(true)}>
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          )}
          <Sheet open={topSheet} onOpenChange={setTopSheet}>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-lg space-y-3 [&_button]:min-h-11 [&_button]:w-full [&_button]:justify-start" aria-describedby={undefined}>
              <SheetHeader><SheetTitle>Lokationer</SheetTitle></SheetHeader>
              {harMaskinerTotal && maskinlisteTop}
              {isAdmin && (
                <Button variant="outline" onClick={() => { setTopSheet(false); setAddOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Tilføj lokation
                </Button>
              )}
            </SheetContent>
          </Sheet>
        </div>
      ) : (
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Aktive lokationer
        </h2>
        <div className="flex items-center gap-2">
          {harMaskinerTotal && maskinlisteTop}
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Tilføj lokation
            </Button>
          )}
        </div>
      </div>
      )}


      {expiringTotal > 0 && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50">
          <button
            type="button"
            onClick={() => setExpiringOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-amber-100/60 rounded-md"
          >
            <span className="flex items-center gap-2 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">
                {expiringTotal} {expiringTotal === 1 ? "maskine udløber snart" : "maskiner udløber snart"}
              </span>
              <span className="text-xs text-amber-800/80">(inden for 90 dage)</span>
            </span>
            {expiringOpen ? <ChevronUp className="h-4 w-4 text-amber-900" /> : <ChevronDown className="h-4 w-4 text-amber-900" />}
          </button>
          {expiringOpen && (
            <ul className="border-t border-amber-200 divide-y divide-amber-200">
              {sortedLocations
                .filter((l) => (expiringByLoc.get(l.id) ?? 0) > 0)
                .map((l) => {
                  const n = expiringByLoc.get(l.id) ?? 0;
                  const label = [l.address, [l.zip, paenBy(l.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Lokation";
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => openLocation(l.id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-amber-900 hover:bg-amber-100/60"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{label}</span>
                        </span>
                        <span className="font-medium shrink-0">{n} {n === 1 ? "maskine" : "maskiner"}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}

      {summaryQ.isLoading || (cvr && oversigtQ.isLoading) ? (
        <div role="status" className="flex items-center gap-2 py-3 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Henter lokationer…</div>
      ) : summaryQ.error || oversigtQ.error ? (
        <p role="alert" className="text-sm text-destructive">Lokationsoplysninger kunne ikke hentes.</p>
      ) : aktive.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen aktive lokationer.</p>
      ) : (
        tabel(aktive, vis1, setVis1)
      )}

      {(antal2 > 0 || harIkkeRel) && (
        <div className="mt-4 border-t pt-3">
          <button
            type="button"
            aria-expanded={aaben2}
            onClick={() => setVis2((v) => !v)}
            className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {aaben2 ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Øvrige lokationer og P-enheder ({antal2})
          </button>
          {aaben2 && (
            <div className="mt-1">
              {sovende.length > 0 && (
                <>
                  {underOverskrift("Sovende og tidligere konti")}
                  {tabel(sovende, visSov, setVisSov, true)}
                </>
              )}
              {cvr && afdelingNr != null && (ikkeHos > 0 || harIkkeRel) && (
                <>
                  {ikkeHos > 0 && underOverskrift("P-enheder uden kunde (ikke dækket)")}
                  <PenhedDaekning
                    cvr={cvr}
                    afdelingNr={afdelingNr}
                    companyId={companyId}
                    companyName={companyName ?? null}
                    assignedTo={assignedTo ?? null}
                    kunIkkeKunde
                    skjulIndirekte
                    visIkkeHosListe={ikkeHos > 0}
                    onChanged={() => { pnrQ.refetch(); oversigtQ.refetch(); }}
                  />
                </>
              )}
              {udenKobling.length > 0 && (
                <>
                  {underOverskrift("Lokationer uden P-enhedskobling på denne konto")}
                  {tabel(udenKobling, visUden, setVisUden, true)}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <AddLocationDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          companyId={companyId}
          hasPrimary={locations.some((l) => l.is_primary)}
          onSaved={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function LokationRow({
  location,
  isPrimary,
  isAdmin,
  open,
  onToggle,
  onRegister,
  contacts = [],
  fallbackAddress,
  fallbackZip,
  fallbackCity,
  lastPurchase,
  showLastPurchase,
  machineCount,
  showMachineCount,
  companyId,
  visBesoeg,
  kontoVisning,
}: {
  companyId?: string;
  visBesoeg?: boolean;
  location: Location;
  isPrimary?: boolean;
  isAdmin?: boolean;
  open: boolean;
  onToggle: () => void;
  onRegister: () => void;
  contacts?: LocationContact[];
  fallbackAddress?: string | null;
  fallbackZip?: string | null;
  fallbackCity?: string | null;
  lastPurchase?: string | null;
  showLastPurchase?: boolean;
  machineCount?: number;
  showMachineCount?: boolean;
  /** Vist inde i en adressegruppe: overskriften er kontoen (Visma-nr., status, sælger, omsætning). */
  kontoVisning?: { revenue12m: number | null } | null;
}) {

  const address = firstFilled(location.address, fallbackAddress);
  const zip = firstFilled(location.zip, fallbackZip);
  const city = firstFilled(location.city, fallbackCity);
  const cityLine = [zip, city].filter(Boolean).join(" ");
  const kontoStatus = (location as any).kreditspaerret
    ? "Spærret"
    : KONTO_STATUS[(location as any).customer_type as string] ?? null;
  const kontoSaelger = (location as any).saelger?.full_name ?? null;
  const headline = kontoVisning
    ? [
        `Kundenr. ${location.visma_delivery_no ?? "–"}`,
        kontoStatus,
        kontoSaelger,
        (location as any).koeber_paa?.visma_delivery_no && (location as any).customer_type !== "aktiv_kunde"
          ? `Køber på konto ${(location as any).koeber_paa.visma_delivery_no}`
          : null,
      ].filter(Boolean).join(" · ")
    : [address, cityLine].filter(Boolean).join(", ") || "Lokation";
  const lastPurchaseLabel = lastPurchase
    ? new Date(lastPurchase + "T00:00:00Z").toLocaleDateString("da-DK", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Intet køb registreret";

  const metaLabel = kontoVisning && !showLastPurchase && !showMachineCount
    ? `${Math.round(kontoVisning.revenue12m ?? 0).toLocaleString("da-DK")} kr. / 12 mdr.`
    : showLastPurchase
    ? (lastPurchase ? `Sidst købt ${lastPurchaseLabel}` : lastPurchaseLabel)
    : showMachineCount
      ? (machineCount
          ? `${machineCount} maskine${machineCount === 1 ? "" : "r"}`
          : "Ingen maskiner")
      : null;
  const metaTone = kontoVisning && !showLastPurchase && !showMachineCount
    ? "text-muted-foreground"
    : showLastPurchase
    ? (lastPurchase ? "text-muted-foreground" : "text-destructive")
    : (machineCount ? "text-muted-foreground" : "text-destructive");

  return (
    <li id={`location-${location.id}`} className="scroll-mt-20">
      <button
        type="button"
        onClick={onToggle}
        className="w-full grid items-center gap-2 py-2.5 text-left hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors"
        style={{ gridTemplateColumns: kontoVisning ? "minmax(0, 1fr) 1.5rem" : "minmax(0, 1fr) 10rem 1.5rem" }}
      >
        <span className="flex items-center gap-2 min-w-0">
          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          {kontoVisning ? (
            <span className="min-w-0">
              <span className="block text-sm break-words">{headline}</span>
              <span className={`block text-xs tabular-nums ${metaTone}`}>{metaLabel}</span>
            </span>
          ) : (
            <span className="truncate text-sm">{headline}</span>
          )}
          {isPrimary && !kontoVisning && (
            <Badge variant="secondary" className="text-xs flex-shrink-0">
              Primær
            </Badge>
          )}
        </span>
{!kontoVisning && (        <span
          className={`text-xs text-right tabular-nums whitespace-nowrap overflow-hidden text-ellipsis ${metaTone}`}
        >
          {metaLabel ?? ""}
        </span>)}
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0 justify-self-end" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 justify-self-end" />
        )}
      </button>
      {open && (
        <div className="pl-6 pb-3 pt-1 space-y-1 text-sm">
          {contacts.length > 0 ? (
            contacts.map((c) => (
              <div key={c.id}>
                <span className="inline-flex items-center gap-1 flex-wrap">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{c.name}</span>
                  {c.phone && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <a
                        href={`tel:${c.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline"
                      >
                        {c.phone}
                      </a>
                    </>
                  )}
                </span>
                {c.email && (
                  <div className="pl-4 text-muted-foreground">
                    <a
                      href={`mailto:${c.email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline break-all"
                    >
                      {c.email}
                    </a>
                  </div>
                )}
              </div>
            ))
          ) : (
            (location.contact_person || location.phone) && (
              <div className="text-muted-foreground flex flex-wrap items-center gap-1">
                {location.contact_person && <span>{location.contact_person}</span>}
                {location.contact_person && location.phone && <span>·</span>}
                {location.phone && (
                  <a
                    href={`tel:${location.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-primary hover:underline"
                  >
                    {location.phone}
                  </a>
                )}
              </div>
            )
          )}
          {contacts.length === 0 && location.email && (
            <div className="text-muted-foreground">
              <a
                href={`mailto:${location.email}`}
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline break-all"
              >
                {location.email}
              </a>
            </div>
          )}
          {location.visma_delivery_no && (
            <div className="text-xs text-muted-foreground">
              Lev.nr. {location.visma_delivery_no}
            </div>
          )}
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>
              Sælger:{" "}
              {(location as any).saelger?.full_name ??
                ((location as any).saelger_no
                  ? `Ukendt sælger (${(location as any).saelger_no})`
                  : (location as any).i_aktoer === false
                    ? "Ikke i Aktør"
                    : "Ingen")}
            </span>
            {(location as any).kreditspaerret && (
              <span className="rounded bg-destructive/15 px-1.5 text-destructive">Spærret</span>
            )}
            {(location as any).koeber_paa?.visma_delivery_no &&
              (location as any).customer_type !== "aktiv_kunde" && (
                <span className="rounded border border-border px-1.5">
                  Køber på konto {(location as any).koeber_paa.visma_delivery_no}
                </span>
              )}
          </div>
          <LocationSalesStrip locationId={location.id} isAdmin={!!isAdmin} />
          <EquipmentBox location={location} />
          <div className="pt-2 flex flex-wrap gap-2">
            {visBesoeg && companyId && (
              <BesoegtKnap companyId={companyId} locationId={location.id} size="sm" />
            )}
            {visBesoeg && companyId && (
              <KatalogKnap companyId={companyId} locationId={location.id} size="sm" />
            )}
            <Button size="sm" variant="outline" onClick={onRegister}>
              Registrér aktivitet her
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

type EquipmentUnit = {
  id: string;
  source: "rental" | "service" | "wittenborg" | "wittenborg_uden_sn";
  is_filter: boolean;
  machine_type: string | null;
  serial_no: string | null;
  sub_location: string | null;
  agreement_type: string | null;
  is_free_loan: boolean;
  has_service_contract: boolean;
  udstyr_type: "leje_ub" | "leje_binding" | "kunde_ejet" | "ukendt" | null;
  afdeling_nr?: number | null;
};

type Ownership = "leje_ub" | "leje_binding" | "kunde_ejet" | "ukendt";

const OWNERSHIP_LABEL: Record<Ownership, string> = {
  leje_ub: "Udlån",
  leje_binding: "Leje",
  kunde_ejet: "Kundeejet",
  ukendt: "Ukendt",
};

function deriveOwnership(u: {
  udstyr_type: EquipmentUnit["udstyr_type"];
}): { kind: Ownership; label: string } {
  const k: Ownership = (u.udstyr_type as Ownership) ?? "ukendt";
  return { kind: k in OWNERSHIP_LABEL ? k : "ukendt", label: OWNERSHIP_LABEL[k] ?? "Ukendt" };
}

function aftaleKind(t: string): Ownership {
  if (t.startsWith("Kundeejet")) return "kunde_ejet";
  if (t.startsWith("Leje")) return "leje_binding";
  if (t === "Ukendt") return "ukendt";
  return "leje_ub";
}

function OwnershipBadge({ kind, label }: { kind: Ownership; label: string }) {
  const tone =
    kind === "kunde_ejet"
      ? "bg-emerald-100 text-emerald-900 border-emerald-200"
      : kind === "leje_binding"
        ? "bg-amber-100 text-amber-900 border-amber-200"
        : kind === "leje_ub"
          ? "bg-sky-100 text-sky-900 border-sky-200"
          : "bg-slate-100 text-slate-800 border-slate-200";
  return (
    <Badge className={`${tone} hover:${tone} text-xs font-medium`}>
      {label}
    </Badge>
  );
}


type EnrichmentInfo = {
  binding_ophor?: string | null;
  handlingsdato?: string | null;
  taelleraflaesning?: string | null;
  taellerstand?: number | null;
  respons?: string | null;
  kobt_dato?: string | null;
  lease_leje_dato?: string | null;
  aftale_type?: string | null;
  reservedele?: string | null;
  reservedele_efter?: string | null;
};

function fmtDa(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function fmtAge(iso?: string | null): string {
  if (!iso) return "";
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return "";
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months--;
  if (months < 0) {
    years--;
    months += 12;
  }
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} år`);
  if (months > 0 || years === 0) parts.push(`${months} mdr.`);
  return parts.join(", ");
}

function pickFromData(data: any, names: string[]): string | null {
  if (!data || typeof data !== "object") return null;
  const norm = (s: string) => s.toLowerCase().replace(/[\s._-]/g, "");
  const wanted = new Set(names.map(norm));
  for (const k of Object.keys(data)) {
    if (wanted.has(norm(k))) {
      const v = data[k];
      if (v == null || String(v).trim() === "") continue;
      return String(v).trim();
    }
  }
  return null;
}

function pickRespons(data: any): string | null {
  return pickFromData(data, ["respons", "responstid"]);
}

function pickTaellerstand(data: any): number | null {
  const v = pickFromData(data, ["taellerstand", "tællerstand", "taeller", "tæller"]);
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function EquipmentBox({
  location,
  locationIds,
  skjulSortering = false,
}: {
  location: Location;
  /** Samlet visning for flere konti på samme adresse (mobil). */
  locationIds?: string[];
  skjulSortering?: boolean;
}) {
  const ids = locationIds ?? [location.id];
  const idsKey = ids.join(",");
  const suppressionFn = useServerFn(getMasterAgreementSuppression);
  const suppressionQ = useQuery({
    queryKey: ["master-agreement-suppression", location.company_id],
    queryFn: () =>
      suppressionFn({ data: { companyIds: [location.company_id] } }) as Promise<SuppressionMap>,
    staleTime: 5 * 60 * 1000,
  });
  const [units, setUnits] = useState<EquipmentUnit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openType, setOpenType] = useState<string | null>(null);
  type SortMode = "standard" | "age_desc" | "age_asc" | "cups_desc" | "cups_asc" | "binding_asc" | "binding_desc";
  const [sortMode, setSortMode] = useState<SortMode>("standard");
  const [enrichBySerial, setEnrichBySerial] = useState<Map<string, EnrichmentInfo>>(new Map());
  const [udlaan, setUdlaan] = useState<Map<string, string>>(new Map());
  const [harLeje, setHarLeje] = useState(false);
  const [agreementStatusBySerial, setAgreementStatusBySerial] = useState<
    Map<string, MachineAgreementStatusValue>
  >(new Map());
  const fetchAgreementStatuses = useServerFn(getMachineAgreementStatuses);
  const [placeringer, setPlaceringer] = useState<Map<string, PlaceringInfo>>(new Map());
  useEffect(() => {
    const sn = Array.from(new Set((units ?? []).filter((u) => !u.is_filter && u.serial_no?.trim()).map((u) => u.serial_no!.trim())));
    if (!sn.length) return;
    let c = false;
    hentPlaceringer(sn).then((m) => { if (!c) setPlaceringer(m); }).catch(() => {});
    return () => { c = true; };
  }, [units]);
  const signal = (location.sales_signal ?? "").trim();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("location_equipment_units")
        .select("id, source, is_filter, machine_type, serial_no, sub_location, agreement_type, is_free_loan, has_service_contract, udstyr_type, afdeling_nr")
        .in("location_id", ids)
        .order("is_filter", { ascending: true })
        .order("machine_type", { ascending: true });
      if (!cancelled) {
        let liste = (data ?? []) as EquipmentUnit[];
        // Samlet adressevisning: én række pr. serienr. på tværs af konti.
        if (locationIds) {
          const set = new Set<string>();
          liste = liste.filter((u) => {
            const sn = !u.is_filter ? u.serial_no?.trim() : null;
            if (!sn) return true;
            if (set.has(sn)) return false;
            set.add(sn);
            return true;
          });
        }
        setUnits(liste);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  // Hent enrichment for de serienr-bærende maskiner
  useEffect(() => {
    const serials = Array.from(
      new Set(
        (units ?? [])
          .filter((u) => !u.is_filter && u.serial_no)
          .map((u) => u.serial_no!.trim())
          .filter(Boolean),
      ),
    );
    if (serials.length === 0) {
      setEnrichBySerial(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      // serienr er text i begge tabeller — .in() sammenligner som text,
      // så ledende nuller bevares korrekt.
      const { data: enrData, error: enrError } = await (supabase as any)
        .from("machine_enrichment")
        .select("serienr, taelleraflaesning, binding_ophor, handlingsdato, data, kobt_dato, lease_leje_dato, aftale_type")
        .eq("record_status", "aktiv")
        .in("serienr", serials);
      const [{ data: mData }, { data: lejeData }] = await Promise.all([
        (supabase as any).from("machines").select("serienr, udlanstype").eq("record_status", "aktiv").in("serienr", serials),
        (supabase as any).rpc("lokationer_med_leje", { _location_ids: ids }),
      ]);
      if (cancelled) return;
      const u = new Map<string, string>();
      for (const x of (mData ?? []) as any[]) if (x.udlanstype) u.set(String(x.serienr), x.udlanstype);
      setUdlaan(u);
      setHarLeje(((lejeData ?? []) as any[]).length > 0);
      if (enrError) {
        console.error("[lokationer-sektion] Kunne ikke hente machine_enrichment:", enrError.message);
      }
      if (cancelled) return;
      const m = new Map<string, EnrichmentInfo>();
      for (const e of (enrData ?? []) as any[]) {
        m.set(String(e.serienr), {
          binding_ophor: e.binding_ophor ?? null,
          handlingsdato: e.handlingsdato ?? null,
          taelleraflaesning: e.taelleraflaesning ?? null,
          taellerstand: pickTaellerstand(e.data),
          respons: pickRespons(e.data),
          kobt_dato: e.kobt_dato ?? null,
          lease_leje_dato: e.lease_leje_dato ?? null,
          aftale_type: e.aftale_type ?? null,
          reservedele: e.data?.reservedele ?? null,
          reservedele_efter: e.data?.reservedele_efter ?? null,
        });
      }
      setEnrichBySerial(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [units]);

  // Hent maskinaftale-status (sat fra Mit overblik) for de samme serienr
  useEffect(() => {
    const serials = Array.from(
      new Set(
        (units ?? [])
          .filter((u) => !u.is_filter && u.serial_no)
          .map((u) => u.serial_no!.trim())
          .filter(Boolean),
      ),
    );
    if (serials.length === 0) {
      setAgreementStatusBySerial(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchAgreementStatuses({ data: { serienrs: serials } });
        if (cancelled) return;
        const m = new Map<string, MachineAgreementStatusValue>();
        for (const r of res.statuses) {
          m.set(r.serienr, r.status as MachineAgreementStatusValue);
        }
        setAgreementStatusBySerial(m);
      } catch {
        // Ignorer — badge er blot en visning
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [units, fetchAgreementStatuses]);





  if (loading && units === null) {
    return (
      <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Henter udstyr …
      </div>
    );
  }
  if (!units || units.length === 0) {
    if (!signal) return null;
    return (
      <div className="mt-3 rounded-md border bg-muted/30 p-3">
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{signal}</span>
        </div>
      </div>
    );
  }

  const machines = units.filter((u) => !u.is_filter);
  const filters = units.filter((u) => u.is_filter);

  // Optælling pr. ejerskab (kun maskiner — filtre tælles separat)
  const ownershipCounts = machines.reduce(
    (acc, u) => {
      const o = deriveOwnership(u);
      acc[o.kind] = (acc[o.kind] ?? 0) + 1;
      return acc;
    },
    {} as Record<Ownership, number>,
  );
  const summaryParts: string[] = [];
  if (ownershipCounts.kunde_ejet) summaryParts.push(`${ownershipCounts.kunde_ejet} kundeejede`);
  if (ownershipCounts.leje_binding) summaryParts.push(`${ownershipCounts.leje_binding} leje`);
  if (ownershipCounts.leje_ub) summaryParts.push(`${ownershipCounts.leje_ub} udlån`);
  if (ownershipCounts.ukendt) summaryParts.push(`${ownershipCounts.ukendt} ukendt`);


  // Gruppér efter machine_type
  const groupBy = (list: EquipmentUnit[]) => {
    const m = new Map<string, EquipmentUnit[]>();
    for (const u of list) {
      const k = (u.machine_type ?? "Ukendt").trim() || "Ukendt";
      const arr = m.get(k) ?? [];
      arr.push(u);
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "da"));
  };

  const machineGroups = groupBy(machines);
  const filterGroups = groupBy(filters);
  const filtersFreeLoan = filters.length > 0 && filters.every((f) => f.is_free_loan);

  const todayISO = new Date().toISOString().slice(0, 10);
  const in90ISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  })();
  const masterAgreement: MasterAgreementSuppression | null =
    suppressionQ.data?.[location.company_id] ?? null;
  const warningSuppressed = isMachineWarningSuppressed(masterAgreement, in90ISO);
  const isExpiringSoon = (enr?: EnrichmentInfo | null) => {
    if (warningSuppressed) return false;
    if (!enr) return false;
    const b = enr.binding_ophor;
    const h = enr.handlingsdato;
    return (
      (!!b && b >= todayISO && b <= in90ISO) ||
      (!!h && h >= todayISO && h <= in90ISO)
    );
  };

  /** Ville maskinen have udløst "udløber snart", hvis hovedaftalen ikke dækkede den? */
  const isExpiringRaw = (enr?: EnrichmentInfo | null) => {
    if (!enr) return false;
    const b = enr.binding_ophor;
    const h = enr.handlingsdato;
    return (
      (!!b && b >= todayISO && b <= in90ISO) ||
      (!!h && h >= todayISO && h <= in90ISO)
    );
  };

  const getStartIso = (u: EquipmentUnit): string | null => {
    if (!u.serial_no) return null;
    const enr = enrichBySerial.get(u.serial_no.trim());
    return enr?.kobt_dato ?? enr?.lease_leje_dato ?? null;
  };
  const getCups = (u: EquipmentUnit): number => {
    if (!u.serial_no) return -1;
    const enr = enrichBySerial.get(u.serial_no.trim());
    return enr?.taellerstand ?? -1;
  };
  const getBinding = (u: EquipmentUnit): string | null => {
    if (!u.serial_no) return null;
    return enrichBySerial.get(u.serial_no.trim())?.binding_ophor ?? null;
  };

  const sortUnits = (list: EquipmentUnit[]): EquipmentUnit[] => {
    if (sortMode === "standard") return list;
    const copy = [...list];
    const cmp = (a: string | null, b: string | null, dir: 1 | -1) => {
      if (!a && !b) return 0;
      if (!a) return 1; // mangler data -> nederst
      if (!b) return -1;
      return a < b ? -1 * dir : a > b ? 1 * dir : 0;
    };
    switch (sortMode) {
      case "age_desc": // ældst (tidligst opstillet) først
        copy.sort((a, b) => cmp(getStartIso(a), getStartIso(b), 1));
        break;
      case "age_asc": // nyest opstillet først
        copy.sort((a, b) => cmp(getStartIso(a), getStartIso(b), -1));
        break;
      case "cups_desc":
        copy.sort((a, b) => getCups(b) - getCups(a));
        break;
      case "cups_asc":
        copy.sort((a, b) => getCups(a) - getCups(b));
        break;
      case "binding_asc": // nærmeste udløb først
        copy.sort((a, b) => cmp(getBinding(a), getBinding(b), 1));
        break;
      case "binding_desc":
        copy.sort((a, b) => cmp(getBinding(a), getBinding(b), -1));
        break;
    }
    return copy;
  };

  const renderGroup = (
    type: string,
    list: EquipmentUnit[],
    opts: { isFilter?: boolean } = {},
  ) => {
    const hasService = list.some((u) => u.has_service_contract);
    const expiringCount = opts.isFilter
      ? 0
      : list.filter((u) => isExpiringSoon(u.serial_no ? enrichBySerial.get(u.serial_no.trim()) : null))
          .length;
    const suppressedCount =
      opts.isFilter || !warningSuppressed || !masterAgreement
        ? 0
        : list.filter((u) =>
            isExpiringRaw(u.serial_no ? enrichBySerial.get(u.serial_no.trim()) : null),
          ).length;
    // Unikke ejerskabs-mærkater i gruppen
    const ownerships = Array.from(
      new Map(
        list.map((u) => {
          const o = deriveOwnership(u);
          return [`${o.kind}:${o.label}`, o] as const;
        }),
      ).values(),
    );
    const key = `${opts.isFilter ? "f" : "m"}::${type}`;
    const open = openType === key;
    return (
      <div key={key} className="rounded-md border bg-background">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpenType(open ? null : key);
          }}
          className="w-full flex items-start justify-between gap-2 p-2 text-left hover:bg-muted/40 rounded-md"
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <span className="truncate">{type}</span>
              <span className="text-xs text-muted-foreground">×{list.length}</span>
              {opts.isFilter ? (
                <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100 border-slate-200 text-xs">
                  Filteraftale
                </Badge>
              ) : (
                <>
                  {ownerships.map((o) => (
                    <OwnershipBadge key={`${o.kind}:${o.label}`} kind={o.kind} label={o.label} />
                  ))}
                  {hasService && (
                    <Badge className="bg-blue-100 text-blue-900 hover:bg-blue-100 border-blue-200 text-xs">
                      Serviceaftale
                    </Badge>
                  )}
                  {expiringCount > 0 && (
                    <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-300 text-xs">
                      Udløber snart{expiringCount > 1 ? ` (${expiringCount})` : ""}
                    </Badge>
                  )}
                  {suppressedCount > 0 && masterAgreement && (
                    <Badge
                      variant="secondary"
                      className="text-xs"
                      title={masterAgreementTooltip(masterAgreement)}
                    >
                      Følger hovedaftale
                      {suppressedCount > 1 ? ` (${suppressedCount})` : ""}
                    </Badge>
                  )}
                </>
              )}
            </div>
            {opts.isFilter ? (
              <div className="text-xs text-muted-foreground mt-0.5">
                Kundeejet maskine · filter lejet af os
              </div>
            ) : (
null
            )}
          </div>
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-1" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-1" />
          )}
        </button>
        {open && (
          <ul className="border-t divide-y text-xs">
            {(opts.isFilter ? list : sortUnits(list)).map((u) => {
              const enr = u.serial_no ? enrichBySerial.get(u.serial_no.trim()) : null;
              const aftaleTekst = opts.isFilter
                ? deriveOwnership(u).label
                : maskinAftale({
                    g4: enr?.aftale_type,
                    udlaanstype: u.serial_no ? udlaan.get(u.serial_no.trim()) : null,
                    lejelinjer: harLeje,
                    gratisUdlaan: u.is_free_loan,
                  });
              const o = { kind: aftaleKind(aftaleTekst), label: aftaleTekst };
              const rd = !opts.isFilter && enr ? reservedeleStatus(enr.reservedele, enr.reservedele_efter) : null;
              const today = new Date().toISOString().slice(0, 10);
              const bindingPassed =
                enr?.binding_ophor && enr.binding_ophor < today ? true : false;
              const expiringSoon = !opts.isFilter && isExpiringSoon(enr);
              const followsMaster =
                !opts.isFilter && warningSuppressed && !!masterAgreement && isExpiringRaw(enr);
              return (
                <li key={u.id} className="px-2 py-1.5 text-muted-foreground">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <OwnershipBadge kind={o.kind} label={o.label} />
                    <AfdelingBadge afdelingNr={u.afdeling_nr} className="text-[10px] px-1.5 py-0" />
                    {expiringSoon && (
                      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-300 text-[10px] px-1.5 py-0">
                        Udløber snart
                      </Badge>
                    )}
                    {followsMaster && masterAgreement && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                        title={masterAgreementTooltip(masterAgreement)}
                      >
                        Følger hovedaftale
                      </Badge>
                    )}
                    <span>
                      {[
                        u.serial_no ? `Serienr ${u.serial_no}` : "Uden serienr",
                        rd?.lang,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  {!opts.isFilter && u.serial_no?.trim() && (
                    <PlaceringFelt
                      serienr={u.serial_no.trim()}
                      info={placeringer.get(u.serial_no.trim())}
                      onSaved={(ny) =>
                        setPlaceringer((m) => {
                          const n = new Map(m);
                          n.set(u.serial_no!.trim(), { placering: ny, kilde: "crm", af: "dig", at: new Date().toISOString() });
                          return n;
                        })
                      }
                    />
                  )}

                  {enr && (
                    <div className="mt-1 ml-1 space-y-0.5 text-[11px]">
                      {(() => {
                        const startIso = enr.kobt_dato ?? enr.lease_leje_dato ?? null;
                        if (!startIso) return null;
                        const age = fmtAge(startIso);
                        return (
                          <div className="text-muted-foreground">
                            Opstillet: {fmtDa(startIso)}
                            {age ? ` (${age})` : ""}
                          </div>
                        );
                      })()}
                      {enr.binding_ophor &&
                        (bindingPassed ? (
                          <div className="text-amber-700 font-medium">
                            Fri opsigelse (binding udløb {fmtDa(enr.binding_ophor)})
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>Binding til {fmtDa(enr.binding_ophor)}</span>
                            {u.serial_no && agreementStatusBySerial.get(u.serial_no.trim()) && (
                              <Badge
                                className={`text-[10px] px-1.5 py-0 border ${
                                  MACHINE_AGREEMENT_STATUS_TONE[
                                    agreementStatusBySerial.get(u.serial_no.trim())!
                                  ]
                                }`}
                              >
                                {
                                  MACHINE_AGREEMENT_STATUS_LABELS[
                                    agreementStatusBySerial.get(u.serial_no.trim())!
                                  ]
                                }
                              </Badge>
                            )}
                          </div>
                        ))}
                      {enr.handlingsdato && (
                        <div>Reservedele inkl. til {fmtDa(enr.handlingsdato)}</div>
                      )}
                      {enr.taellerstand != null && (
                        <div>
                          Tæller: {Number(enr.taellerstand).toLocaleString("da-DK")}
                          {enr.taelleraflaesning
                            ? ` (aflæst ${fmtDa(enr.taelleraflaesning)})`
                            : ""}
                        </div>
                      )}
                      {enr.respons && <div>Responstid: {enr.respons}</div>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          Udstyr (Visma)
        </div>
        {summaryParts.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {summaryParts.join(" · ")}
          </div>
        )}
      </div>

      {machines.length > 0 ? (
        <>
          {machines.length > 0 && !skjulSortering && (
            <div className="flex items-center justify-end mb-1.5">
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="text-xs border rounded-md px-2 py-1 bg-background text-muted-foreground"
              >
                <option value="standard">Standard rækkefølge</option>
                <option value="age_desc">Alder: ældst først</option>
                <option value="age_asc">Alder: nyest først</option>
                <option value="cups_desc">Antal kopper: flest først</option>
                <option value="cups_asc">Antal kopper: færrest først</option>
                <option value="binding_asc">Binding: udløber snarest</option>
                <option value="binding_desc">Binding: udløber senest</option>
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            {machineGroups.map(([type, list]) => renderGroup(type, list))}
          </div>
          {filters.length > 0 && (() => {
            const filterTotal = filterGroups
              .filter(([type]) => !(type.toLowerCase().includes("køl") || type.toLowerCase().includes("mælk") || type.toLowerCase().includes("milk")))
              .reduce((sum, [, list]) => sum + list.length, 0);
            const accessoryTotal = filterGroups
              .filter(([type]) => type.toLowerCase().includes("køl") || type.toLowerCase().includes("mælk") || type.toLowerCase().includes("milk"))
              .reduce((sum, [, list]) => sum + list.length, 0);
            const parts: string[] = [];
            if (filterTotal > 0) parts.push(`${filterTotal} ${filterTotal === 1 ? "filter" : "filtre"}`);
            if (accessoryTotal > 0) parts.push(`${accessoryTotal} ${accessoryTotal === 1 ? "tilbehørsdel" : "tilbehørsdele"}`);
            return (
              <div className="text-xs text-muted-foreground pl-1">
                inkl. {parts.join(", ")}
                {filtersFreeLoan ? " (udlån)" : ""}
              </div>
            );
          })()}
        </>
      ) : (
        <div className="space-y-1.5">
          {filterGroups.map(([type, list]) => renderGroup(type, list, { isFilter: true }))}
        </div>
      )}

      {signal && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{signal}</span>
        </div>
      )}
    </div>
  );
}

function AddLocationDialog({
  open,
  onOpenChange,
  companyId,
  hasPrimary,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  hasPrimary: boolean;
  onSaved: () => void;
}) {
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [deliveryNo, setDeliveryNo] = useState("");
  const [isPrimary, setIsPrimary] = useState(!hasPrimary);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAddress("");
      setZip("");
      setCity("");
      setPhone("");
      setEmail("");
      setContact("");
      setDeliveryNo("");
      setIsPrimary(!hasPrimary);
    }
  }, [open, hasPrimary]);

  async function save() {
    setSaving(true);
    if (isPrimary && hasPrimary) {
      await (supabase as any)
        .from("locations")
        .update({ is_primary: false })
        .eq("company_id", companyId);
    }
    const { error } = await (supabase as any).from("locations").insert({
      company_id: companyId,
      address: address.trim() || null,
      zip: zip.trim() || null,
      city: city.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      contact_person: contact.trim() || null,
      visma_delivery_no: deliveryNo.trim() || null,
      is_primary: isPrimary,
    });
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke gemme: " + error.message);
      return;
    }
    toast.success("Lokation tilføjet");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tilføj lokation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Adresse</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="mb-1.5 block">Postnr.</Label>
              <Input value={zip} onChange={(e) => setZip(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block">By</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Kontaktperson</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1.5 block">Telefon</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Visma lev.nr.</Label>
            <Input
              value={deliveryNo}
              onChange={(e) => setDeliveryNo(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            Markér som primær lokation
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Gemmer…" : "Gem lokation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
