import { UdskrivMaskinlisteKnap } from "@/components/maskinliste-print";
import { useEffect, useMemo, useState } from "react";
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
import { MapPin, Loader2, Plus, ChevronDown, ChevronUp, User, AlertTriangle, Wrench } from "lucide-react";
import { toast } from "sonner";
import { PenhedDaekning } from "@/components/penhed-daekning";
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
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Åbne adressegrupper registreres via deres lokations-id'er (robust mod at nøglen skifter).
  const [aabneLok, setAabneLok] = useState<Set<string>>(new Set());
  const [visIkkeHos, setVisIkkeHos] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sortMode, setSortMode] = useState<
    "default" | "revenue" | "street" | "lastPurchase" | "machines"
  >("default");




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
    setExpanded(true);
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
      const pnrs = ((penRes.data ?? []) as any[]).map((p) => p.p_number);
      if (pnrs.length && afdelingNr != null) {
        const [{ data: dk }, { data: ir }] = await Promise.all([
          sb.from("location_pnr_link").select("p_nummer").in("p_nummer", pnrs).eq("afdeling_nr", afdelingNr).in("kilde", ["auto", "manuel"]),
          sb.from("penhed_ikke_relevant").select("p_nummer").in("p_nummer", pnrs),
        ]);
        const skjul = new Set([...((dk ?? []) as any[]), ...((ir ?? []) as any[])].map((x) => x.p_nummer));
        ikkeHos = pnrs.filter((p) => !skjul.has(p)).length;
        const daekketSet = new Set(((dk ?? []) as any[]).map((x) => x.p_nummer));
        irAntal = ((ir ?? []) as any[]).filter((x) => !daekketSet.has(x.p_nummer)).length;
      }
      const penListe = ((penRes.data ?? []) as any[]) as (PenhedInfo & { p_number: string })[];
      return { linkByLoc, linkInfo, pInfo, ikkeHos, irAntal, penListe };
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

  const GRUPPER_VIST = 5;
  const visibleGrupper = expanded ? grupper : grupper.slice(0, GRUPPER_VIST);
  const enGruppe = grupper.length === 1;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          {locations.length > 0
            ? `${grupper.length} ${grupper.length === 1 ? "adresse" : "adresser"} · ${locations.length} ${locations.length === 1 ? "konto" : "konti"}`
            : "Lokationer"}
        </h2>
        <div className="flex items-center gap-2">
          {grupper.some((g) => (machineCountQ.data && g.locs.some((l) => (machineCountQ.data?.[l.id] ?? 0) > 0))) && (
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
          )}
          {locations.length > 1 && (
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as any)}>
              <SelectTrigger className="h-8 text-xs w-auto min-w-[180px]">
                <SelectValue placeholder="Sortering" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Primær / by</SelectItem>
                <SelectItem value="street">Vejnavn</SelectItem>
                <SelectItem value="revenue">Omsætning (høj→lav)</SelectItem>
                <SelectItem value="lastPurchase">Sidst købt (nyest→ældst)</SelectItem>
                <SelectItem value="machines">Antal maskiner (flest→færrest)</SelectItem>


              </SelectContent>
            </Select>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Tilføj
            </Button>
          )}
        </div>
      </div>

      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen lokationer registreret.</p>
      ) : (
        <>
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
                {expiringOpen ? (
                  <ChevronUp className="h-4 w-4 text-amber-900" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-amber-900" />
                )}
              </button>
              {expiringOpen && (
                <ul className="border-t border-amber-200 divide-y divide-amber-200">
                  {sortedLocations
                    .filter((l) => (expiringByLoc.get(l.id) ?? 0) > 0)
                    .map((l) => {
                      const n = expiringByLoc.get(l.id) ?? 0;
                      const label =
                        [l.address, [l.zip, l.city].filter(Boolean).join(" ")]
                          .filter(Boolean)
                          .join(", ") || "Lokation";
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
                            <span className="font-medium shrink-0">
                              {n} {n === 1 ? "maskine" : "maskiner"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          )}
          <ul className="@container divide-y rounded-md border">
            <li className="hidden @xl:grid grid-cols-[minmax(0,1fr)_5.5rem_7.5rem_6.5rem_3.5rem_1.25rem] gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30">
              <span>Adresse</span><span>Status</span><span>Sælger</span><span className="text-right">Omsætning 12 mdr.</span><span className="text-right">Maskiner</span><span />
            </li>
            {visibleGrupper.map((g) => {
              const aaben = enGruppe || g.locs.some((l) => aabneLok.has(l.id));
              const titel = g.key === "uden" ? "Uden adresse" : g.address || "Lokation";
              const byTekst = g.key === "uden" ? null : [g.zip, g.city].filter(Boolean).join(" ") || null;
              const meta = [
                g.ansatteTekst ? `${g.ansatteTekst} ansatte` : null,
                g.pnr ? `P-nr. ${g.pnr}` : null,
                `${g.locs.length} ${g.locs.length === 1 ? "konto" : "konti"}: ${g.locs.map((l) => l.visma_delivery_no ?? "–").join(", ")}`,
              ].filter(Boolean).join(" · ");
              const bedst = g.locs
                .map((l) => ((l as any).kreditspaerret ? "spaerret" : ((l as any).customer_type as string)))
                .sort((x, y) => (STATUS_RANG[x] ?? 9) - (STATUS_RANG[y] ?? 9))[0];
              const status = bedst === "spaerret" ? "Spærret" : KONTO_STATUS[bedst] ?? "—";
              const saelgere = Array.from(new Set(g.locs.map((l) => (l as any).saelger?.full_name ?? ((l as any).i_aktoer === false ? "Ikke i Aktør" : "Ingen"))));
              const maskiner = g.locs.reduce((n, l) => n + (machineCountQ.data?.[l.id] ?? 0), 0);
              const egen = !!mitId && g.locs.some((l) => (l as any).saelger_user_id === mitId);
              const toggle = () =>
                setAabneLok((prev) => {
                  const n = new Set(prev);
                  if (aaben) g.locs.forEach((l) => n.delete(l.id));
                  else g.locs.forEach((l) => n.add(l.id));
                  return n;
                });
              return (
                <li key={g.key} className={`relative ${egen ? "border-l-4 border-l-primary" : "border-l-4 border-l-transparent"} ${aaben ? "bg-muted/40" : ""}`}>
                  <button
                    type="button"
                    aria-expanded={aaben}
                    onClick={enGruppe ? undefined : toggle}
                    className="w-full grid grid-cols-[minmax(0,1fr)_1.25rem] @xl:grid-cols-[minmax(0,1fr)_5.5rem_7.5rem_6.5rem_3.5rem_1.25rem] gap-x-2 gap-y-0.5 items-center px-3 py-2.5 text-left hover:bg-muted/40"
                  >
                    <span className="min-w-0 text-sm">
                      {byTekst && <span className="block font-semibold">{byTekst}</span>}
                      <span className="break-words">{titel}</span>
                      {g.primary && (
                        <Badge variant="outline" className="ml-1.5 h-4 px-1.5 text-[10px] font-normal align-middle">Primær</Badge>
                      )}
                      <span className="@xl:hidden block text-xs text-muted-foreground mt-0.5">
                        {[status, saelgere.join(", "), `${Math.round(g.revenue).toLocaleString("da-DK")} kr.`, `${maskiner} maskiner`].join(" · ")}
                      </span>
                    </span>
                    <span className="hidden @xl:block text-xs">{status}</span>
                    <span className="hidden @xl:block text-xs truncate" title={saelgere.join(", ")}>{saelgere.join(", ")}</span>
                    <span className="hidden @xl:block text-xs text-right tabular-nums">{Math.round(g.revenue).toLocaleString("da-DK")} kr.</span>
                    <span className="hidden @xl:block text-xs text-right tabular-nums">{maskiner}</span>
                    {enGruppe ? <span /> : aaben ? <ChevronUp className="h-4 w-4 shrink-0 justify-self-end" /> : <ChevronDown className="h-4 w-4 shrink-0 justify-self-end" />}
                  </button>
                  {aaben && (
                    <div className="pl-6 pr-3 pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">{meta}</div>
                        {maskiner > 0 && (
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
                          onChanged={() => pnrQ.refetch()}
                        />
                      )}
                      <ul className="divide-y mt-1 rounded-md border bg-background px-3">
                        {g.locs.map((l) => (
                          <LokationRow
                            key={l.id}
                            location={l}
                            isPrimary={l.is_primary}
                            isAdmin={isAdmin}
                            open={openId === l.id}
                            onToggle={() => setOpenId(openId === l.id ? null : l.id)}
                            contacts={contactsByLocation?.get(l.id) ?? []}
                            fallbackAddress={l.is_primary ? companyFallbackAddress : null}
                            fallbackZip={l.is_primary ? companyFallbackZip : null}
                            fallbackCity={l.is_primary ? companyFallbackCity : null}
                            onRegister={() => onRegisterActivity(l.id)}
                            companyId={companyId}
                            visBesoeg={locations.length > 1}
                            lastPurchase={summaryQ.data?.[l.id]?.lastPurchase ?? null}
                            showLastPurchase={sortMode === "lastPurchase"}
                            machineCount={machineCountQ.data?.[l.id] ?? 0}
                            showMachineCount={sortMode === "machines"}
                            kontoVisning={{ revenue12m: summaryQ.data?.[l.id]?.revenue12m ?? null }}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {grupper.length > GRUPPER_VIST && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-muted-foreground"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" /> Vis færre
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Vis alle {grupper.length} adresser
                </>
              )}
            </Button>
          )}
        </>
      )}

      {cvr && afdelingNr != null && ((pnrQ.data?.ikkeHos ?? 0) > 0 || (pnrQ.data?.irAntal ?? 0) > 0) && (
        <div className="mt-4 border-t pt-3">
          {(pnrQ.data?.ikkeHos ?? 0) > 0 && (
            <button
              type="button"
              aria-expanded={visIkkeHos}
              onClick={() => setVisIkkeHos((v) => !v)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {pnrQ.data!.ikkeHos} P-enhed{pnrQ.data!.ikkeHos === 1 ? "" : "er"} vi ikke er hos {visIkkeHos ? "▾" : "▸"}
            </button>
          )}
          <div className={visIkkeHos ? "mt-2" : ""}>
            <PenhedDaekning
              cvr={cvr}
              afdelingNr={afdelingNr}
              companyId={companyId}
              companyName={companyName ?? null}
              assignedTo={assignedTo ?? null}
              kunIkkeKunde
              visIkkeHosListe={visIkkeHos && (pnrQ.data?.ikkeHos ?? 0) > 0}
              onChanged={() => pnrQ.refetch()}
            />
          </div>
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
    </Card>
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
  leje_ub: "Leje – ingen binding",
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
        ? "bg-violet-100 text-violet-900 border-violet-200"
        : kind === "leje_ub"
          ? "bg-amber-100 text-amber-900 border-amber-200"
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

function EquipmentBox({ location }: { location: Location }) {
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
        .eq("location_id", location.id)
        .order("is_filter", { ascending: true })
        .order("machine_type", { ascending: true });
      if (!cancelled) {
        setUnits((data ?? []) as EquipmentUnit[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.id]);

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
        (supabase as any).rpc("lokationer_med_leje", { _location_ids: [location.id] }),
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
  if (ownershipCounts.leje_ub) summaryParts.push(`${ownershipCounts.leje_ub} leje – ingen binding`);
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
  const filtersFreeLoan = filters.some((f) => f.is_free_loan);

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
          {machines.length > 0 && (
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
                {filtersFreeLoan ? " (gratis udlån)" : ""}
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
