import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  X,
  Filter as FilterIcon,
  ChevronDown,
  Save,
  Trash2,
} from "lucide-react";
import { FilterState, Seller } from "./types";

function FilterGroup({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: { v: string; l: string }[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  return (
    <div>
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      <div className="mt-1 space-y-1.5">
        {options.map((o) => (
          <label
            key={o.v}
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <Checkbox
              checked={values.includes(o.v)}
              onCheckedChange={() => toggle(o.v)}
            />
            {o.l}
          </label>
        ))}
      </div>
    </div>
  );
}

export type FilterTemplate = { id: string; name: string; filter_config: any };

export function CompanyFilterBar({
  q,
  onQChange,
  filtersOpen,
  setFiltersOpen,
  isFilterActive,
  onReset,
  onSaveTemplate,
  showFilterButton = true,
  searchPlaceholder = "Søg navn, CVR, by, postnr…",
}: {
  q: string;
  onQChange: (v: string) => void;
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;
  isFilterActive: boolean;
  onReset: () => void;
  onSaveTemplate?: () => void;
  showFilterButton?: boolean;
  searchPlaceholder?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="relative flex-1 md:max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={searchPlaceholder}
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          className="pl-9 h-10 md:h-9 text-base md:text-sm"
          type="search"
          inputMode="search"
          autoComplete="off"
        />
        {q && (
          <button
            type="button"
            onClick={() => onQChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Ryd søgning"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        {showFilterButton && (
          <Button
            variant={filtersOpen || isFilterActive ? "default" : "outline"}
            size="sm"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <FilterIcon className="h-4 w-4 mr-1" />
            Filtre
            {isFilterActive && (
              <Badge variant="secondary" className="ml-2">
                Aktiv
              </Badge>
            )}
            <ChevronDown
              className={`h-4 w-4 ml-1 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
            />
          </Button>
        )}
        {isFilterActive && (
          <>
            <Button size="sm" variant="ghost" onClick={onReset}>
              <X className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Nulstil filtre</span>
              <span className="sm:hidden">Nulstil</span>
            </Button>
            {onSaveTemplate && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSaveTemplate}
                className="hidden sm:inline-flex"
              >
                <Save className="h-4 w-4 mr-1" /> Gem filter som skabelon
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function CompanyFilterPanel({
  open,
  filters,
  setFilters,
  sellers,
  municipalities,
  isAdmin,
  templates,
  onApplyTemplate,
  onDeleteTemplate,
}: {
  open: boolean;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  sellers: Seller[];
  municipalities: string[];
  isAdmin: boolean;
  templates?: FilterTemplate[];
  onApplyTemplate?: (id: string) => void;
  onDeleteTemplate?: (id: string) => void;
}) {
  return (
    <Collapsible open={open}>
      <CollapsibleContent>
        <Card className="p-4 mb-3 space-y-4">
          {templates && templates.length > 0 && (
            <div>
              <Label className="text-xs uppercase text-muted-foreground">
                Skabeloner
              </Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="inline-flex items-center gap-1 border rounded-md px-2 py-1 text-sm bg-muted/30"
                  >
                    <button
                      className="hover:underline"
                      onClick={() => onApplyTemplate?.(t.id)}
                    >
                      {t.name}
                    </button>
                    {onDeleteTemplate && (
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => onDeleteTemplate(t.id)}
                        title="Slet skabelon"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FilterGroup
              label="Kundestatus"
              options={[
                { v: "aktiv_kunde", l: "Aktiv kunde" },
                { v: "sovende_kunde", l: "Sovende kunde" },
                { v: "tidligere_kunde", l: "Tidligere kunde" },
                { v: "nyt_emne", l: "Nyt emne" },
              ]}
              values={filters.customerTypes}
              onChange={(v) => setFilters((f) => ({ ...f, customerTypes: v }))}
            />
            <FilterGroup
              label="Kilde"
              options={[
                { v: "visma", l: "Visma-kunde" },
                { v: "cvr", l: "CVR-beriget" },
                { v: "manuel", l: "Manuelt oprettet" },
              ]}
              values={filters.sources}
              onChange={(v) => setFilters((f) => ({ ...f, sources: v }))}
            />
            {isAdmin && (
              <div>
                <Label className="text-xs uppercase text-muted-foreground">
                  Tildeling
                </Label>
                <Select
                  value={filters.assignment}
                  onValueChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      assignment: v as FilterState["assignment"],
                    }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle</SelectItem>
                    <SelectItem value="unassigned">Ikke tildelt</SelectItem>
                    <SelectItem value="assigned">Tildelt</SelectItem>
                    <SelectItem value="specific">
                      Tildelt til specifik sælger
                    </SelectItem>
                  </SelectContent>
                </Select>
                {filters.assignment === "specific" && (
                  <Select
                    value={filters.assignedToUserId}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, assignedToUserId: v }))
                    }
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Vælg sælger…" />
                    </SelectTrigger>
                    <SelectContent>
                      {sellers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_name || "Uden navn"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            <div className="space-y-2">
              <FilterGroup
                label="Maskiner"
                options={[
                  { v: "leased", l: "Har leje-maskiner" },
                  { v: "free_loan", l: "Har gratis udlån" },
                  { v: "service", l: "Har serviceaftale" },
                  { v: "none", l: "Ingen registreret maskine" },
                ]}
                values={filters.machines}
                onChange={(v) => setFilters((f) => ({ ...f, machines: v }))}
              />
              <div>
                <Label className="text-xs text-muted-foreground">
                  Maskintype indeholder…
                </Label>
                <Input
                  className="mt-1"
                  placeholder="Fx Bonamat, Rex-Royal, Wittenborg"
                  value={filters.machineTypeQuery}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      machineTypeQuery: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">
                Geografi
              </Label>
              <Input
                className="mt-1"
                placeholder="By…"
                value={filters.city}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, city: e.target.value }))
                }
              />
              <Select
                value={filters.municipality || "__all"}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    municipality: v === "__all" ? "" : v,
                  }))
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Alle kommuner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Alle kommuner</SelectItem>
                  {municipalities.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Input
                  placeholder="Postnr fra"
                  value={filters.zipFrom}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, zipFrom: e.target.value }))
                  }
                />
                <Input
                  placeholder="Postnr til"
                  value={filters.zipTo}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, zipTo: e.target.value }))
                  }
                />
              </div>
            </div>
            <FilterGroup
              label="Seneste varekøb"
              options={[
                { v: "never", l: "Aldrig købt" },
                { v: "0-3", l: "Inden for 3 måneder" },
                { v: "3-6", l: "3–6 måneder siden" },
                { v: "6-12", l: "6–12 måneder siden" },
                { v: "12-18", l: "12–18 måneder siden" },
                { v: "18+", l: "Over 18 måneder siden" },
              ]}
              values={filters.lastPurchase}
              onChange={(v) => setFilters((f) => ({ ...f, lastPurchase: v }))}
            />
            <FilterGroup
              label="Antal ansatte"
              options={[
                { v: "lt10", l: "Under 10" },
                { v: "10-49", l: "10–49" },
                { v: "50-199", l: "50–199" },
                { v: "200+", l: "200+" },
                { v: "unknown", l: "Ukendt" },
              ]}
              values={filters.employeeRanges}
              onChange={(v) =>
                setFilters((f) => ({ ...f, employeeRanges: v }))
              }
            />
            <div>
              <Label className="text-xs uppercase text-muted-foreground">
                Kundetype
              </Label>
              <Select
                value={filters.binding}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    binding: v as FilterState["binding"],
                  }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="frit_salg">Frit salg</SelectItem>
                  <SelectItem value="offentlig_aftale">
                    Offentlig aftale
                  </SelectItem>
                  <SelectItem value="intern_privat">Intern / privat</SelectItem>
                  <SelectItem value="unknown">Ukendt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
