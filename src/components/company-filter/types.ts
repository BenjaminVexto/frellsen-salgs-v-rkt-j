export type CompanyRow = {
  id: string;
  name: string;
  cvr: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  municipality: string | null;
  customer_type: string;
  sources: string[] | null;
  customer_segment_2: string | null;
  last_purchase_date: string | null;
  employees: number | null;
  is_public: boolean | null;
  binding_status: string | null;
  customer_category: string | null;
  visma_id?: string | null;
  visma_delivery_id?: string | null;
};

export type AssignmentRow = { company_id: string; assigned_to: string | null };

export type LocationLite = {
  city: string | null;
  address: string | null;
  zip: string | null;
  visma_delivery_no: string | null;
};

export type EquipmentSummary = {
  hasLeased: boolean;
  hasFreeLoan: boolean;
  hasService: boolean;
  hasAny: boolean;
  machineTypes: string[];
};

export type Seller = { id: string; full_name: string };

export type FilterState = {
  customerTypes: string[];
  sources: string[];
  assignment: "all" | "unassigned" | "assigned" | "specific";
  assignedToUserId: string;
  machines: string[];
  machineTypeQuery: string;
  city: string;
  municipality: string;
  zipFrom: string;
  zipTo: string;
  lastPurchase: string[];
  employeeRanges: string[];
  binding: "all" | "offentlig_aftale" | "frit_salg" | "intern_privat" | "unknown";
};

export const DEFAULT_FILTERS: FilterState = {
  customerTypes: [],
  sources: [],
  assignment: "all",
  assignedToUserId: "",
  machines: [],
  machineTypeQuery: "",
  city: "",
  municipality: "",
  zipFrom: "",
  zipTo: "",
  lastPurchase: [],
  employeeRanges: [],
  binding: "all",
};

export function normalizeFilterConfig(input: any): FilterState {
  const cfg = { ...(input ?? {}) };
  // Bagudkompat: gammelt felt machineStatus → nyt machines
  if (Array.isArray(cfg.machineStatus) && !cfg.machines) {
    cfg.machines = cfg.machineStatus.filter((v: string) =>
      ["leased", "none"].includes(v),
    );
    delete cfg.machineStatus;
  }
  return { ...DEFAULT_FILTERS, ...cfg };
}

export function isFilterActive(f: FilterState): boolean {
  return (
    f.customerTypes.length > 0 ||
    f.sources.length > 0 ||
    f.assignment !== "all" ||
    f.machines.length > 0 ||
    f.machineTypeQuery.trim() !== "" ||
    f.city.trim() !== "" ||
    f.municipality !== "" ||
    f.zipFrom !== "" ||
    f.zipTo !== "" ||
    f.lastPurchase.length > 0 ||
    f.employeeRanges.length > 0 ||
    f.binding !== "all"
  );
}
