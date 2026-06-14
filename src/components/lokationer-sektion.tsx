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
}: {
  companyId: string;
  isAdmin: boolean;
  onRegisterActivity: (locationId: string) => void;
  reloadKey?: number;
  contactsByLocation?: Map<string, LocationContact[]>;
  companyFallbackAddress?: string | null;
  companyFallbackZip?: string | null;
  companyFallbackCity?: string | null;
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

  const summaryFn = useServerFn(getLocationSalesSummary);
  const summaryQ = useQuery({
    enabled: locations.length > 0,
    queryKey: ["location-sales-summary", locations.map((l) => l.id).sort().join(",")],
    queryFn: () => summaryFn({ data: { locationIds: locations.map((l) => l.id) } }),
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
                  <div className="pl-4 text-muted-foreground">{c.email}</div>
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
            <div className="text-muted-foreground">{location.email}</div>
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
  source: "rental" | "service";
  is_filter: boolean;
  machine_type: string | null;
  serial_no: string | null;
  sub_location: string | null;
  agreement_type: string | null;
  is_free_loan: boolean;
  has_service_contract: boolean;
};

// Ejerskab udledes af (source, agreement_type, is_free_loan).
// "kundeejet"     → kunden ejer maskinen (service-import)
// "leje"          → Frellsen ejer, kunden betaler leje
// "gratis_udlaan" → Frellsen ejer, ingen betaling
// "midlertidigt"  → midlertidig opsætning / prøve / bytte (vis rå type)
// "ukendt"        → fallback
type Ownership = "kundeejet" | "leje" | "gratis_udlaan" | "midlertidigt" | "ukendt";

function deriveOwnership(u: {
  source: string | null;
  agreement_type: string | null;
  is_free_loan: boolean | null;
}): { kind: Ownership; label: string } {
  if (u.source === "service") return { kind: "kundeejet", label: "Kundeejet" };
  const t = (u.agreement_type ?? "").trim();
  const lower = t.toLowerCase();
  if (lower === "leje" || lower.startsWith("leje /")) {
    return { kind: "leje", label: "Leje" };
  }
  if (u.is_free_loan || lower.includes("udlån") || lower.includes("leje u/b")) {
    // Midlertidigt / prøveopsætning / bytteservice → vis rå type
    if (
      lower.includes("midlertidig") ||
      lower.includes("prøve") ||
      lower.includes("bytte")
    ) {
      return { kind: "midlertidigt", label: t || "Midlertidigt" };
    }
    return { kind: "gratis_udlaan", label: "Gratis udlån" };
  }
  if (lower.includes("midlertidig") || lower.includes("prøve") || lower.includes("bytte")) {
    return { kind: "midlertidigt", label: t };
  }
  return { kind: "ukendt", label: t || "Ukendt ejerskab" };
}

function OwnershipBadge({ kind, label }: { kind: Ownership; label: string }) {
  const tone =
    kind === "kundeejet"
      ? "bg-emerald-100 text-emerald-900 border-emerald-200"
      : kind === "leje"
        ? "bg-violet-100 text-violet-900 border-violet-200"
        : kind === "gratis_udlaan"
          ? "bg-amber-100 text-amber-900 border-amber-200"
          : kind === "midlertidigt"
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

function pickRespons(data: any): string | null {
  if (!data || typeof data !== "object") return null;
  for (const k of Object.keys(data)) {
    const kn = k.toLowerCase().replace(/[\s._-]/g, "");
    if (kn === "respons" || kn === "responstid") {
      const v = data[k];
      if (v == null || String(v).trim() === "") return null;
      return String(v).trim();
    }
  }
  return null;
}

function EquipmentBox({ location }: { location: Location }) {
  const [units, setUnits] = useState<EquipmentUnit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openType, setOpenType] = useState<string | null>(null);
  const [enrichBySerial, setEnrichBySerial] = useState<Map<string, EnrichmentInfo>>(new Map());
  const signal = (location.sales_signal ?? "").trim();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("location_equipment_units")
        .select("id, source, is_filter, machine_type, serial_no, sub_location, agreement_type, is_free_loan, has_service_contract")
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
      const [enrRes, machRes] = await Promise.all([
        (supabase as any)
          .from("machine_enrichment")
          .select("serienr, taelleraflaesning, binding_ophor, handlingsdato, data")
          .eq("record_status", "aktiv")
          .in("serienr", serials),
        (supabase as any)
          .from("machines")
          .select("serienr, taellerstand, data")
          .eq("record_status", "aktiv")
          .in("serienr", serials),
      ]);
      if (cancelled) return;
      const m = new Map<string, EnrichmentInfo>();
      for (const e of (enrRes.data ?? []) as any[]) {
        m.set(e.serienr, {
          binding_ophor: e.binding_ophor ?? null,
          handlingsdato: e.handlingsdato ?? null,
          taelleraflaesning: e.taelleraflaesning ?? null,
          respons: pickRespons(e.data),
        });
      }
      for (const x of (machRes.data ?? []) as any[]) {
        const prev = m.get(x.serienr) ?? {};
        m.set(x.serienr, {
          ...prev,
          taellerstand: x.taellerstand ?? null,
          respons: prev.respons ?? pickRespons(x.data),
        });
      }
      setEnrichBySerial(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [units]);



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
  if (ownershipCounts.kundeejet) summaryParts.push(`${ownershipCounts.kundeejet} kundeejede`);
  if (ownershipCounts.leje) summaryParts.push(`${ownershipCounts.leje} leje`);
  if (ownershipCounts.gratis_udlaan) summaryParts.push(`${ownershipCounts.gratis_udlaan} gratis udlån`);
  if (ownershipCounts.midlertidigt) summaryParts.push(`${ownershipCounts.midlertidigt} midlertidigt`);
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

  const renderGroup = (
    type: string,
    list: EquipmentUnit[],
    opts: { isFilter?: boolean } = {},
  ) => {
    const subLocs = Array.from(
      new Set(list.map((u) => u.sub_location?.trim()).filter(Boolean) as string[]),
    );
    const hasService = list.some((u) => u.has_service_contract);
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
              return (
                <li key={u.id} className="px-2 py-1.5 text-muted-foreground">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <OwnershipBadge kind={o.kind} label={o.label} />
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
              inkl. {filters.length} {filters.length === 1 ? "filter" : "filtre"}
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
