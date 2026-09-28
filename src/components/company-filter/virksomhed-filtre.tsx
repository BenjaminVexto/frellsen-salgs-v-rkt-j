import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ChevronDown, Plus, X, Check } from "lucide-react";
import { FilterState, Seller } from "./types";

export const STATUS_OPTS = [
  { v: "aktiv_kunde", l: "Aktiv" },
  { v: "sovende_kunde", l: "Sovende" },
  { v: "servicekunde", l: "Servicekunde" },
  { v: "nyt_emne", l: "Nyt emne" },
  { v: "tidligere_kunde", l: "Tidligere" },
];
const SEGMENT_OPTS = [
  { v: "all", l: "Alle" },
  { v: "udbud", l: "Udbud (40)" },
  { v: "offentlig_aftale", l: "Offentlig aftale (45)" },
  { v: "andre", l: "Andre" },
] as const;
const MASKINE_OPTS = [
  { v: "any", l: "Har maskine" },
  { v: "none", l: "Ingen registreret maskine" },
  { v: "leased", l: "Har leje-maskiner" },
  { v: "free_loan", l: "Har gratis udlån" },
  { v: "service", l: "Har serviceaftale" },
];
const ANSATTE_OPTS = [
  { v: "lt10", l: "Under 10" },
  { v: "10-49", l: "10–49" },
  { v: "50-199", l: "50–199" },
  { v: "200+", l: "200+" },
  { v: "unknown", l: "Ukendt" },
];
const KILDE_OPTS = [
  { v: "visma", l: "Visma-kunde" },
  { v: "cvr", l: "CVR-beriget" },
  { v: "manuel", l: "Manuelt oprettet" },
];

type SetF = React.Dispatch<React.SetStateAction<FilterState>>;

export function saelgerLabel(v: string, sellers: Seller[]) {
  if (v === "alle") return "Alle";
  if (v === "mine") return "Mine kunder";
  if (v === "ikke_tildelt") return "Ikke tildelt";
  return sellers.find((s) => s.id === v)?.full_name ?? "Sælger";
}

function DD({
  label,
  value,
  active,
  children,
  width = "w-56",
}: {
  label: string;
  value: string;
  active: boolean;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={active ? "secondary" : "outline"} size="sm" className="h-9">
          {label}: <span className="ml-1 font-medium">{value}</span>
          <ChevronDown className="h-4 w-4 ml-1 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={`${width} p-1`}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

function Opt({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm text-left hover:bg-muted"
    >
      <Check className={`h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`} />
      {children}
    </button>
  );
}

export function FilterLinje({
  filters,
  setFilters,
  sellers,
  defaultSaelger,
}: {
  filters: FilterState;
  setFilters: SetF;
  sellers: Seller[];
  defaultSaelger: string;
}) {
  const statusVal =
    filters.customerTypes.length === 0
      ? "Alle"
      : filters.customerTypes.length === 1
        ? STATUS_OPTS.find((o) => o.v === filters.customerTypes[0])?.l ?? "1 valgt"
        : `${filters.customerTypes.length} valgt`;
  const toggleStatus = (v: string) =>
    setFilters((f) => ({
      ...f,
      customerTypes: f.customerTypes.includes(v) ? f.customerTypes.filter((x) => x !== v) : [...f.customerTypes, v],
    }));
  const sorted = [...sellers].sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "da"));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DD
        label="Sælger"
        value={saelgerLabel(filters.saelger, sellers)}
        active={filters.saelger !== defaultSaelger}
        width="w-64"
      >
        <div className="max-h-80 overflow-y-auto">
          {["mine", "alle", "ikke_tildelt"].map((v) => (
            <Opt key={v} selected={filters.saelger === v} onClick={() => setFilters((f) => ({ ...f, saelger: v }))}>
              {saelgerLabel(v, sellers)}
            </Opt>
          ))}
          {sorted.length > 0 && <div className="my-1 border-t" />}
          {sorted.map((s) => (
            <Opt key={s.id} selected={filters.saelger === s.id} onClick={() => setFilters((f) => ({ ...f, saelger: s.id }))}>
              {s.full_name}
            </Opt>
          ))}
        </div>
      </DD>
      <DD label="Status" value={statusVal} active={filters.customerTypes.length > 0}>
        {STATUS_OPTS.map((o) => (
          <label key={o.v} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-muted">
            <Checkbox checked={filters.customerTypes.includes(o.v)} onCheckedChange={() => toggleStatus(o.v)} />
            {o.l}
          </label>
        ))}
      </DD>
      <DD
        label="Segment"
        value={SEGMENT_OPTS.find((o) => o.v === filters.binding)?.l ?? "Alle"}
        active={filters.binding !== "all"}
      >
        {SEGMENT_OPTS.map((o) => (
          <Opt key={o.v} selected={filters.binding === o.v} onClick={() => setFilters((f) => ({ ...f, binding: o.v }))}>
            {o.l}
          </Opt>
        ))}
      </DD>
      <DD label="Område" value={filters.omraade.trim() || "Alle"} active={!!filters.omraade.trim()} width="w-64">
        <div className="p-2">
          <Input
            autoFocus
            placeholder="By, kommune eller postnr."
            value={filters.omraade}
            onChange={(e) => setFilters((f) => ({ ...f, omraade: e.target.value }))}
          />
        </div>
      </DD>
    </div>
  );
}

export function Hurtigvalg({ setFilters, base }: { setFilters: SetF; base: FilterState }) {
  const valg: { l: string; f: Partial<FilterState> }[] = [
    { l: "Mine sovende", f: { saelger: "mine", customerTypes: ["sovende_kunde"] } },
    { l: "Mine servicekunder", f: { saelger: "mine", customerTypes: ["servicekunde"] } },
    { l: "Mine nye emner", f: { saelger: "mine", customerTypes: ["nyt_emne"] } },
    { l: "Uden sælger", f: { saelger: "ikke_tildelt" } },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground mr-1">Hurtigvalg:</span>
      {valg.map((v) => (
        <button
          key={v.l}
          type="button"
          onClick={() => setFilters({ ...base, ...v.f })}
          className="rounded-full border px-2.5 py-1 hover:bg-muted"
        >
          {v.l}
        </button>
      ))}
    </div>
  );
}

function Checks({
  label,
  opts,
  values,
  onChange,
}: {
  label: string;
  opts: { v: string; l: string }[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      <div className="mt-1 space-y-1.5">
        {opts.map((o) => (
          <label key={o.v} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={values.includes(o.v)}
              onCheckedChange={() => onChange(values.includes(o.v) ? values.filter((x) => x !== o.v) : [...values, o.v])}
            />
            {o.l}
          </label>
        ))}
      </div>
    </div>
  );
}

export function FlereFiltre({ filters, setFilters, isAdmin }: { filters: FilterState; setFilters: SetF; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setOpen(!open)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> {open ? "Færre filtre" : "Flere filtre"}
      </Button>
      {open && (
        <Card className="p-4 mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Checks label="Maskiner" opts={MASKINE_OPTS} values={filters.machines} onChange={(v) => setFilters((f) => ({ ...f, machines: v }))} />
            <Input
              placeholder="Maskintype indeholder…"
              value={filters.machineTypeQuery}
              onChange={(e) => setFilters((f) => ({ ...f, machineTypeQuery: e.target.value }))}
            />
          </div>
          <Checks label="Antal ansatte" opts={ANSATTE_OPTS} values={filters.employeeRanges} onChange={(v) => setFilters((f) => ({ ...f, employeeRanges: v }))} />
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Postnummer</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Input placeholder="Fra" inputMode="numeric" value={filters.zipFrom} onChange={(e) => setFilters((f) => ({ ...f, zipFrom: e.target.value }))} />
              <Input placeholder="Til" inputMode="numeric" value={filters.zipTo} onChange={(e) => setFilters((f) => ({ ...f, zipTo: e.target.value }))} />
            </div>
          </div>
          {isAdmin && (
            <div className="space-y-3">
              <Checks label="Kilde" opts={KILDE_OPTS} values={filters.sources} onChange={(v) => setFilters((f) => ({ ...f, sources: v }))} />
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={filters.visAfloeste} onCheckedChange={(v) => setFilters((f) => ({ ...f, visAfloeste: v === true }))} />
                Vis afløste
              </label>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export function FilterChips({
  filters,
  setFilters,
  sellers,
  defaultSaelger,
  onReset,
}: {
  filters: FilterState;
  setFilters: SetF;
  sellers: Seller[];
  defaultSaelger: string;
  onReset: () => void;
}) {
  const chips: { l: string; clear: () => void }[] = [];
  const lbl = (opts: { v: string; l: string }[], v: string) => opts.find((o) => o.v === v)?.l ?? v;
  if (filters.saelger !== defaultSaelger)
    chips.push({ l: `Sælger: ${saelgerLabel(filters.saelger, sellers)}`, clear: () => setFilters((f) => ({ ...f, saelger: defaultSaelger })) });
  filters.customerTypes.forEach((v) =>
    chips.push({ l: `Status: ${lbl(STATUS_OPTS, v)}`, clear: () => setFilters((f) => ({ ...f, customerTypes: f.customerTypes.filter((x) => x !== v) })) }),
  );
  if (filters.binding !== "all")
    chips.push({ l: `Segment: ${lbl(SEGMENT_OPTS as any, filters.binding)}`, clear: () => setFilters((f) => ({ ...f, binding: "all" })) });
  if (filters.omraade.trim())
    chips.push({ l: `Område: ${filters.omraade.trim()}`, clear: () => setFilters((f) => ({ ...f, omraade: "" })) });
  filters.machines.forEach((v) =>
    chips.push({ l: lbl(MASKINE_OPTS, v), clear: () => setFilters((f) => ({ ...f, machines: f.machines.filter((x) => x !== v) })) }),
  );
  if (filters.machineTypeQuery.trim())
    chips.push({ l: `Maskintype: ${filters.machineTypeQuery.trim()}`, clear: () => setFilters((f) => ({ ...f, machineTypeQuery: "" })) });
  filters.employeeRanges.forEach((v) =>
    chips.push({ l: `Ansatte: ${lbl(ANSATTE_OPTS, v)}`, clear: () => setFilters((f) => ({ ...f, employeeRanges: f.employeeRanges.filter((x) => x !== v) })) }),
  );
  if (filters.zipFrom || filters.zipTo)
    chips.push({ l: `Postnr: ${filters.zipFrom || "…"}–${filters.zipTo || "…"}`, clear: () => setFilters((f) => ({ ...f, zipFrom: "", zipTo: "" })) });
  filters.sources.forEach((v) =>
    chips.push({ l: `Kilde: ${lbl(KILDE_OPTS, v)}`, clear: () => setFilters((f) => ({ ...f, sources: f.sources.filter((x) => x !== v) })) }),
  );
  if (filters.visAfloeste) chips.push({ l: "Vis afløste", clear: () => setFilters((f) => ({ ...f, visAfloeste: false })) });
  // Gamle felter fra gemte skabeloner
  if (filters.city) chips.push({ l: `By: ${filters.city}`, clear: () => setFilters((f) => ({ ...f, city: "" })) });
  if (filters.municipality) chips.push({ l: `Kommune: ${filters.municipality}`, clear: () => setFilters((f) => ({ ...f, municipality: "" })) });
  if (filters.lastPurchase.length) chips.push({ l: "Seneste varekøb", clear: () => setFilters((f) => ({ ...f, lastPurchase: [] })) });
  if (filters.assignment !== "all") chips.push({ l: "Tildeling (gammel)", clear: () => setFilters((f) => ({ ...f, assignment: "all", assignedToUserId: "" })) });

  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
          {c.l}
          <button type="button" onClick={c.clear} aria-label={`Fjern ${c.l}`} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onReset}>
        Nulstil
      </Button>
    </div>
  );
}
