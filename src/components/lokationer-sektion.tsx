import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { MapPin, Plus, ChevronDown, ChevronUp, User, AlertTriangle, Wrench } from "lucide-react";
import { toast } from "sonner";
import { LocationSalesStrip } from "@/components/sales/location-sales-strip";
import { getLocationSalesSummary } from "@/lib/sales.functions";
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
}) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [sortMode, setSortMode] = useState<"default" | "revenue">("default");


  const load = async () => {
    const { data } = await (supabase as any)
      .from("locations")
      .select("*")
      .eq("company_id", companyId)
      .order("is_primary", { ascending: false })
      .order("city", { ascending: true });
    setLocations(((data ?? []) as Location[]));
  };

  useEffect(() => {
    load();
  }, [companyId, reloadKey]);

  // Åbn + scroll til en bestemt lokation
  const openLocation = (locationId: string) => {
    setExpanded(true);
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

  const sortedLocations = useMemo(() => {
    if (sortMode !== "revenue") return locations;
    const summary = summaryQ.data ?? {};
    return [...locations].sort((a, b) => {
      const ra = summary[a.id]?.revenue12m ?? 0;
      const rb = summary[b.id]?.revenue12m ?? 0;
      if (rb !== ra) return rb - ra;
      return (a.is_primary ? 0 : 1) - (b.is_primary ? 0 : 1);
    });
  }, [locations, sortMode, summaryQ.data]);

  const expiringByLoc = expiringQ.data ?? new Map<string, number>();
  const expiringTotal = Array.from(expiringByLoc.values()).reduce((n, v) => n + v, 0);
  const [expiringOpen, setExpiringOpen] = useState(false);


  // Always render the section (header) when admin; hide entirely if no data and no write
  if (locations.length === 0 && !isAdmin) return null;

  const visible = expanded ? sortedLocations : sortedLocations.slice(0, 3);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Lokationer
          {locations.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              ({locations.length})
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {locations.length > 1 && (
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as any)}>
              <SelectTrigger className="h-8 text-xs w-auto min-w-[180px]">
                <SelectValue placeholder="Sortering" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Primær / by</SelectItem>
                <SelectItem value="revenue">Omsætning (høj→lav)</SelectItem>
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
          <ul className="divide-y">

            {visible.map((l) => (
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
              />
            ))}
          </ul>
          {locations.length > 3 && (
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
                  Vis alle {locations.length} lokationer
                </>
              )}
            </Button>
          )}
        </>
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
}: {
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
}) {
  const address = firstFilled(location.address, fallbackAddress);
  const zip = firstFilled(location.zip, fallbackZip);
  const city = firstFilled(location.city, fallbackCity);
  const cityLine = [zip, city].filter(Boolean).join(" ");
  const headline = [address, cityLine].filter(Boolean).join(", ") || "Lokation";

  return (
    <li id={`location-${location.id}`} className="scroll-mt-20">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 py-2.5 text-left hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="truncate text-sm">{headline}</span>
          {isPrimary && (
            <Badge variant="secondary" className="text-xs flex-shrink-0">
              Primær
            </Badge>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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
          <LocationSalesStrip locationId={location.id} isAdmin={!!isAdmin} />
          <EquipmentBox location={location} />
          <div className="pt-2">
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
  const [units, setUnits] = useState<EquipmentUnit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openType, setOpenType] = useState<string | null>(null);
  const [enrichBySerial, setEnrichBySerial] = useState<Map<string, EnrichmentInfo>>(new Map());
  const [agreementStatusBySerial, setAgreementStatusBySerial] = useState<
    Map<string, MachineAgreementStatusValue>
  >(new Map());
  const fetchAgreementStatuses = useServerFn(getMachineAgreementStatuses);
  const signal = (location.sales_signal ?? "").trim();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("location_equipment_units")
        .select("id, source, is_filter, machine_type, serial_no, sub_location, agreement_type, is_free_loan, has_service_contract, udstyr_type")
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
      const { data: enrData } = await (supabase as any)
        .from("machine_enrichment")
        .select("serienr, taelleraflaesning, binding_ophor, handlingsdato, data")
        .eq("record_status", "aktiv")
        .in("serienr", serials);
      if (cancelled) return;
      const m = new Map<string, EnrichmentInfo>();
      for (const e of (enrData ?? []) as any[]) {
        m.set(String(e.serienr), {
          binding_ophor: e.binding_ophor ?? null,
          handlingsdato: e.handlingsdato ?? null,
          taelleraflaesning: e.taelleraflaesning ?? null,
          taellerstand: pickTaellerstand(e.data),
          respons: pickRespons(e.data),
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
  const isExpiringSoon = (enr?: EnrichmentInfo | null) => {
    if (!enr) return false;
    const b = enr.binding_ophor;
    const h = enr.handlingsdato;
    return (
      (!!b && b >= todayISO && b <= in90ISO) ||
      (!!h && h >= todayISO && h <= in90ISO)
    );
  };

  const renderGroup = (
    type: string,
    list: EquipmentUnit[],
    opts: { isFilter?: boolean } = {},
  ) => {
    const subLocs = Array.from(
      new Set(list.map((u) => u.sub_location?.trim()).filter(Boolean) as string[]),
    );
    const hasService = list.some((u) => u.has_service_contract);
    const expiringCount = opts.isFilter
      ? 0
      : list.filter((u) => isExpiringSoon(u.serial_no ? enrichBySerial.get(u.serial_no.trim()) : null))
          .length;
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
                </>
              )}
            </div>
            {opts.isFilter ? (
              <div className="text-xs text-muted-foreground mt-0.5">
                Kundeejet maskine · filter lejet af os
              </div>
            ) : (
              subLocs.length > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {subLocs.join(", ")}
                </div>
              )
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
            {list.map((u) => {
              const o = deriveOwnership(u);
              const enr = u.serial_no ? enrichBySerial.get(u.serial_no.trim()) : null;
              const today = new Date().toISOString().slice(0, 10);
              const bindingPassed =
                enr?.binding_ophor && enr.binding_ophor < today ? true : false;
              const expiringSoon = !opts.isFilter && isExpiringSoon(enr);
              return (
                <li key={u.id} className="px-2 py-1.5 text-muted-foreground">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <OwnershipBadge kind={o.kind} label={o.label} />
                    {expiringSoon && (
                      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-300 text-[10px] px-1.5 py-0">
                        Udløber snart
                      </Badge>
                    )}
                    <span>
                      {[
                        u.serial_no ? `Serienr ${u.serial_no}` : "Uden serienr",
                        u.sub_location,
                        u.agreement_type,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>

                  {enr && (
                    <div className="mt-1 ml-1 space-y-0.5 text-[11px]">
                      {enr.binding_ophor &&
                        (bindingPassed ? (
                          <div className="text-amber-700 font-medium">
                            Fri opsigelse (binding udløb {fmtDa(enr.binding_ophor)})
                          </div>
                        ) : (
                          <div>Binding til {fmtDa(enr.binding_ophor)}</div>
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
          <div className="space-y-1.5">
            {machineGroups.map(([type, list]) => renderGroup(type, list))}
          </div>
          {filters.length > 0 && (
            <div className="text-xs text-muted-foreground pl-1">
              inkl. {filterGroups.map(([type, list]) => {
                const t = type.toLowerCase();
                const isAccessory = t.includes("køl") || t.includes("mælk") || t.includes("milk");
                const noun = isAccessory
                  ? "tilbehørsdel" + (list.length === 1 ? "" : "e")
                  : (list.length === 1 ? "filter" : "filtre");
                return `${list.length} ${noun}`;
              }).join(", ")}
              {filtersFreeLoan ? " (gratis udlån)" : ""}
            </div>
          )}
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
