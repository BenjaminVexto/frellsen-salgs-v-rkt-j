import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AssignmentRow,
  CompanyRow,
  DEFAULT_FILTERS,
  EquipmentSummary,
  FilterState,
  LocationLite,
  Seller,
  isFilterActive as computeIsFilterActive,
} from "./types";

const COMPANY_COLS =
  "id,name,cvr,address,city,zip,municipality,customer_type,sources,customer_segment_2,last_purchase_date,last_sales_date,last_consumable_sales_date,has_active_equipment,employees,is_public,binding_status,customer_category,assigned_to,visma_id,visma_delivery_id";

function matchesMachines(eq: EquipmentSummary | undefined, modes: string[]) {
  if (!modes.length) return true;
  return modes.some((m) => {
    if (m === "leased") return !!eq?.hasLeased;
    if (m === "free_loan") return !!eq?.hasFreeLoan;
    if (m === "service") return !!eq?.hasService;
    if (m === "none") return !eq || !eq.hasAny;
    return false;
  });
}

function matchesLastPurchase(date: string | null, modes: string[]) {
  if (!modes.length) return true;
  if (!date) return modes.includes("never");
  const d = new Date(date);
  const months = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  return modes.some((m) => {
    switch (m) {
      case "never":
        return false;
      case "0-3":
        return months < 3;
      case "3-6":
        return months >= 3 && months < 6;
      case "6-12":
        return months >= 6 && months < 12;
      case "12-18":
        return months >= 12 && months < 18;
      case "18+":
        return months >= 18;
      default:
        return false;
    }
  });
}

function matchesEmployees(n: number | null, ranges: string[]) {
  if (!ranges.length) return true;
  return ranges.some((r) => {
    if (r === "unknown") return n == null;
    if (n == null) return false;
    if (r === "lt10") return n < 10;
    if (r === "10-49") return n >= 10 && n <= 49;
    if (r === "50-199") return n >= 50 && n <= 199;
    if (r === "200+") return n >= 200;
    return false;
  });
}

export type UseCompanyFilterOptions = {
  isAdmin: boolean;
  restrictToIds?: string[] | null;
  initialFilters?: FilterState;
};

export function useCompanyFilter({
  isAdmin,
  restrictToIds,
  initialFilters,
}: UseCompanyFilterOptions) {
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterState>(
    initialFilters ?? DEFAULT_FILTERS,
  );

  const [assignmentMap, setAssignmentMap] = useState<Map<string, string[]>>(
    new Map(),
  );
  const [locationMap, setLocationMap] = useState<Map<string, LocationLite[]>>(
    new Map(),
  );
  const [equipmentMap, setEquipmentMap] = useState<Map<string, EquipmentSummary>>(
    new Map(),
  );
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [municipalities, setMunicipalities] = useState<string[]>([]);

  // Load companies
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (restrictToIds && restrictToIds.length) {
        const { data } = await supabase
          .from("companies")
          .select(COMPANY_COLS)
          .in("id", restrictToIds)
          .order("name");
        if (!cancelled) setRows((data ?? []) as any);
        if (!cancelled) setLoading(false);
        return;
      }
      const PAGE = 1000;
      const all: any[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("companies")
          .select(COMPANY_COLS)
          .order("name", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) break;
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < PAGE) break;
      }
      if (!cancelled) {
        setRows(all as any);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restrictToIds]);

  // Assignments
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase
        .from("contact_list_assignments")
        .select("company_id, assigned_to")
        .limit(10000);
      const m = new Map<string, string[]>();
      for (const r of rows as any[]) {
        if (r.assigned_to) m.set(r.id, [r.assigned_to]);
      }
      (data ?? []).forEach((a: AssignmentRow) => {
        const arr = m.get(a.company_id) ?? [];
        if (a.assigned_to && !arr.includes(a.assigned_to))
          arr.push(a.assigned_to);
        m.set(a.company_id, arr);
      });
      setAssignmentMap(m);
    })();
  }, [isAdmin, rows]);

  // Locations
  useEffect(() => {
    if (!rows.length) return;
    (async () => {
      const ids = rows.map((r) => r.id);
      const m = new Map<string, LocationLite[]>();
      for (let i = 0; i < ids.length; i += 500) {
        const slice = ids.slice(i, i + 500);
        const { data } = await (supabase as any)
          .from("locations")
          .select("company_id, city, address, zip, visma_delivery_no")
          .in("company_id", slice);
        (data ?? []).forEach((l: any) => {
          const arr = m.get(l.company_id) ?? [];
          arr.push({
            city: l.city,
            address: l.address,
            zip: l.zip,
            visma_delivery_no: l.visma_delivery_no,
          });
          m.set(l.company_id, arr);
        });
      }
      setLocationMap(m);
    })();
  }, [rows]);

  // Equipment
  useEffect(() => {
    if (!rows.length) return;
    (async () => {
      const ids = rows.map((r) => r.id);
      const locToCompany = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 500) {
        const slice = ids.slice(i, i + 500);
        const { data: locs } = await (supabase as any)
          .from("locations")
          .select("id, company_id")
          .in("company_id", slice);
        (locs ?? []).forEach((l: any) =>
          locToCompany.set(l.id, l.company_id),
        );
      }
      const locIds = Array.from(locToCompany.keys());
      const summary = new Map<string, EquipmentSummary>();
      for (let i = 0; i < locIds.length; i += 500) {
        const slice = locIds.slice(i, i + 500);
        const { data: eq } = await (supabase as any)
          .from("location_equipment_units")
          .select(
            "location_id, agreement_type, is_free_loan, has_service_contract, machine_type",
          )
          .in("location_id", slice);
        (eq ?? []).forEach((u: any) => {
          const companyId = locToCompany.get(u.location_id);
          if (!companyId) return;
          const cur = summary.get(companyId) ?? {
            hasLeased: false,
            hasFreeLoan: false,
            hasService: false,
            hasAny: false,
            machineTypes: [],
          };
          cur.hasAny = true;
          if (u.is_free_loan) cur.hasFreeLoan = true;
          if (u.has_service_contract) cur.hasService = true;
          const at = (u.agreement_type ?? "").toLowerCase();
          if (!u.is_free_loan && /leje/.test(at)) cur.hasLeased = true;
          if (u.machine_type) cur.machineTypes.push(String(u.machine_type));
          summary.set(companyId, cur);
        });
      }
      setEquipmentMap(summary);
    })();
  }, [rows]);

  // Sellers
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "saelger");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids)
        .eq("is_active", true);
      setSellers(profs ?? []);
    })();
  }, [isAdmin]);

  // Municipalities
  useEffect(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.municipality) set.add(r.municipality);
    });
    setMunicipalities(Array.from(set).sort());
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (q) {
        const rawQuery = q.trim();
        if (rawQuery) {
          const qq = rawQuery.toLowerCase();
          const locs = locationMap.get(r.id) ?? [];
          const hit =
            r.name.toLowerCase().includes(qq) ||
            (r.cvr ?? "").includes(rawQuery) ||
            (r.address ?? "").toLowerCase().includes(qq) ||
            (r.city ?? "").toLowerCase().includes(qq) ||
            (r.zip ?? "").includes(rawQuery) ||
            ((r as any).visma_id ?? "").toLowerCase().includes(qq) ||
            ((r as any).visma_delivery_id ?? "").toLowerCase().includes(qq) ||
            locs.some(
              (l) =>
                (l.city ?? "").toLowerCase().includes(qq) ||
                (l.address ?? "").toLowerCase().includes(qq) ||
                (l.zip ?? "").includes(rawQuery) ||
                (l.visma_delivery_no ?? "").toLowerCase().includes(qq),
            );
          if (!hit) return false;
        }
      }
      if (
        filters.customerTypes.length &&
        !filters.customerTypes.includes(r.customer_type)
      )
        return false;
      if (filters.sources.length) {
        const src = r.sources ?? [];
        if (!filters.sources.some((s) => src.includes(s))) return false;
      }
      if (filters.assignment !== "all") {
        const assigns = assignmentMap.get(r.id) ?? [];
        if (filters.assignment === "unassigned" && assigns.length > 0)
          return false;
        if (filters.assignment === "assigned" && assigns.length === 0)
          return false;
        if (
          filters.assignment === "specific" &&
          (!filters.assignedToUserId ||
            !assigns.includes(filters.assignedToUserId))
        )
          return false;
      }
      const eq = equipmentMap.get(r.id);
      if (!matchesMachines(eq, filters.machines)) return false;
      if (filters.machineTypeQuery.trim()) {
        const needle = filters.machineTypeQuery.trim().toLowerCase();
        const types = eq?.machineTypes ?? [];
        if (!types.some((t) => t.toLowerCase().includes(needle)))
          return false;
      }
      if (
        filters.city &&
        !(r.city ?? "").toLowerCase().includes(filters.city.toLowerCase())
      )
        return false;
      if (filters.municipality && r.municipality !== filters.municipality)
        return false;
      if (filters.zipFrom || filters.zipTo) {
        const z = parseInt(r.zip ?? "");
        if (Number.isNaN(z)) return false;
        if (filters.zipFrom && z < parseInt(filters.zipFrom)) return false;
        if (filters.zipTo && z > parseInt(filters.zipTo)) return false;
      }
      if (!matchesLastPurchase(r.last_sales_date ?? r.last_purchase_date, filters.lastPurchase))
        return false;
      if (!matchesEmployees(r.employees, filters.employeeRanges))
        return false;
      if (filters.binding !== "all") {
        const b = r.binding_status;
        if (filters.binding === "unknown" && b) return false;
        if (filters.binding !== "unknown" && b !== filters.binding)
          return false;
      }
      return true;
    });
  }, [rows, q, filters, assignmentMap, locationMap, equipmentMap]);

  const isActive = useMemo(() => computeIsFilterActive(filters), [filters]);

  return {
    rows,
    filtered,
    loading,
    q,
    setQ,
    filters,
    setFilters,
    assignmentMap,
    locationMap,
    equipmentMap,
    sellers,
    municipalities,
    isFilterActive: isActive,
  };
}
