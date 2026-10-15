import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CustomerStatusBadge } from "@/components/customer-status-info";
import type { CompanyRow } from "@/components/company-filter/types";

/** Normaliseret 8-cifret CVR (samme regel som SQL cvr_norm). */
export function cvrNorm(cvr: string | null | undefined): string | null {
  const x = (cvr ?? "").toUpperCase().replace(/^\s*DK/, "").replace(/\D/g, "");
  return /^\d{8}$/.test(x) ? x : null;
}

export type CvrGruppeInfo = {
  cvr: string;
  antal_konti: number;
  aktive: number;
  bedste_status: string;
  oms_12m: number;
};

export type ListeItem =
  | { kind: "en"; row: CompanyRow }
  | { kind: "gruppe"; cvr: string; konti: CompanyRow[]; hits: Set<string>; tvungen: boolean };

export const kr = (n: number | null | undefined) =>
  n == null ? "–" : `${Math.round(n).toLocaleString("da-DK")} kr.`;

const RANG: Record<string, number> = { aktiv_kunde: 1, servicekunde: 2, sovende_kunde: 3, tidligere_kunde: 4 };
const VIS_ANTAL = 25;

export function CvrGruppeRaekke({
  cvr,
  konti,
  hits,
  info,
  udfoldet,
  onToggle,
  isAdmin,
  selected,
  setSelected,
  rowEl,
}: {
  cvr: string;
  konti: CompanyRow[];
  hits: Set<string>;
  info: CvrGruppeInfo | undefined;
  udfoldet: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  selected: Set<string>;
  setSelected: (fn: (s: Set<string>) => Set<string>) => void;
  rowEl: (r: CompanyRow, indent?: boolean, hit?: boolean) => ReactNode;
}) {
  const [vis, setVis] = useState(VIS_ANTAL);
  const bedste = [...konti].sort((a, b) => (RANG[a.customer_type] ?? 9) - (RANG[b.customer_type] ?? 9))[0];
  const antal = info?.antal_konti ?? konti.length;
  const aktive = info?.aktive ?? konti.filter((k) => k.customer_type === "aktiv_kunde").length;
  const alleValgt = konti.every((k) => selected.has(k.id));
  return (
    <div>
      <div className="flex items-start gap-3 px-3 md:px-4 py-3 hover:bg-muted/50">
        {isAdmin && (
          <Checkbox
            checked={alleValgt}
            onCheckedChange={(v) =>
              setSelected((prev) => {
                const n = new Set(prev);
                konti.forEach((k) => (v ? n.add(k.id) : n.delete(k.id)));
                return n;
              })
            }
            className="mt-1 shrink-0"
            aria-label="Vælg alle konti i gruppen"
          />
        )}
        <button type="button" onClick={onToggle} className="flex flex-1 min-w-0 items-center justify-between gap-2 text-left">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {udfoldet ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <span className="font-medium text-sm md:text-base">{bedste.name}</span>
              <span className="text-xs text-muted-foreground">
                · {antal} konti · {aktive} aktive
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 pl-5">
              CVR {cvr}
              {info ? ` · ${kr(info.oms_12m)} / 12 mdr. samlet` : ""}
              {konti.length < antal ? ` · ${konti.length} vist` : ""}
            </div>
          </div>
          <CustomerStatusBadge type={(info?.bedste_status ?? bedste.customer_type) as any} />
        </button>
      </div>
      {udfoldet && (
        <div className="divide-y border-t">
          {konti.slice(0, vis).map((k) => rowEl(k, true, hits.has(k.id)))}
          {konti.length > vis && (
            <div className="pl-8 md:pl-12 py-2">
              <Button size="sm" variant="ghost" onClick={() => setVis((v) => v + VIS_ANTAL * 2)}>
                Vis flere ({konti.length - vis} tilbage)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type GruppeKonto = {
  company_id: string;
  name: string;
  visma_id: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  customer_type: string;
  saelger_navn: string | null;
  oms_12m: number | null;
  maa_se_salg: boolean;
};

export function useGruppeKonti(cvr: string | null | undefined) {
  const n = cvrNorm(cvr);
  return useQuery({
    enabled: !!n,
    queryKey: ["cvr-gruppe-konti", n],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("cvr_gruppe_konti", { _cvr: n });
      if (error) throw error;
      return (data ?? []) as GruppeKonto[];
    },
  });
}

/** "Samme CVR: 5 konti" med popover over de andre konti. */
export function SammeCvrLink({ cvr, companyId }: { cvr: string | null | undefined; companyId: string }) {
  const q = useGruppeKonti(cvr);
  const konti = q.data ?? [];
  if (konti.length < 2) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          <Building2 className="h-3 w-3" /> Samme CVR: {konti.length} konti
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-1 max-h-80 overflow-y-auto" align="start">
        {konti.map((k) => (
          <Link
            key={k.company_id}
            to="/virksomheder/$id"
            params={{ id: k.company_id }}
            className={`block rounded px-2 py-1.5 text-xs hover:bg-muted ${k.company_id === companyId ? "bg-muted/60" : ""}`}
          >
            <div className="font-medium">
              {k.name} {k.visma_id ? <span className="text-muted-foreground font-normal">({k.visma_id})</span> : null}
              {k.company_id === companyId && <span className="text-muted-foreground font-normal"> · denne konto</span>}
            </div>
            <div className="text-muted-foreground">
              {[k.address, [k.zip, k.city].filter(Boolean).join(" "), k.saelger_navn ?? "uden sælger"].filter(Boolean).join(" · ")}
            </div>
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** "Hele CVR: X kr. / 12 mdr. på N konti" — kun samlet tal. */
export function HeleCvrLinje({ cvr }: { cvr: string | null | undefined }) {
  const n = cvrNorm(cvr);
  const q = useQuery({
    enabled: !!n,
    queryKey: ["cvr-grupper"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("cvr_grupper");
      if (error) throw error;
      return new Map<string, CvrGruppeInfo>(((data ?? []) as CvrGruppeInfo[]).map((g) => [g.cvr, g]));
    },
  });
  const g = n ? q.data?.get(n) : undefined;
  if (!g) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Hele CVR: {kr(g.oms_12m)} / 12 mdr. på {g.antal_konti} konti
    </p>
  );
}

export type CvrPenhedRow = {
  p_number: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  ansatte: number | null;
  ansatte_interval: string | null;
  status: "direkte" | "indirekte" | "ikke";
  location_id: string | null;
  visma_delivery_no: string | null;
  company_id: string | null;
  company_name: string | null;
  customer_type: string | null;
  saelger_navn: string | null;
  oms_12m: number | null;
  via_company_id: string | null;
  via_company_name: string | null;
  note: string | null;
};

/** Koncernlinje + alle CVR'ets P-enheder med status på tværs af konti. */
export function CvrPenhedOversigt({
  cvr,
  afdelingNr,
  companyId,
  refreshKey,
}: {
  cvr: string;
  afdelingNr: number;
  companyId: string;
  refreshKey?: unknown;
}) {
  const g = useQuery({
    queryKey: ["cvr-grupper"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("cvr_grupper");
      if (error) throw error;
      return new Map<string, CvrGruppeInfo>(((data ?? []) as CvrGruppeInfo[]).map((x) => [x.cvr, x]));
    },
  });
  const q = useQuery({
    queryKey: ["cvr-penhed-oversigt", cvr, afdelingNr, refreshKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("cvr_penhed_oversigt", { _cvr: cvr, _afdeling_nr: afdelingNr });
      if (error) throw error;
      return (data ?? []) as CvrPenhedRow[];
    },
  });
  const konti = useGruppeKonti(cvr);
  const rows = q.data ?? [];
  if (!rows.length) return null;
  const n = cvrNorm(cvr);
  const info = n ? g.data?.get(n) : undefined;
  const direkte = rows.filter((r) => r.status === "direkte").length;
  const indirekte = rows.filter((r) => r.status === "indirekte").length;
  const ansatte = rows.reduce((s, r) => s + (r.ansatte ?? 0), 0);
  const navn = (konti.data ?? []).find((k) => k.company_id === companyId)?.name ?? "CVR";
  const oms = info?.oms_12m ?? (konti.data ?? []).reduce((s, k) => s + (k.oms_12m ?? 0), 0);
  const orden = { direkte: 1, indirekte: 2, ikke: 3 } as const;
  const sorted = [...rows].sort((a, b) => orden[a.status] - orden[b.status] || (b.ansatte ?? -1) - (a.ansatte ?? -1));
  return (
    <div className="mb-3 space-y-2">
      <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
        <span className="font-medium">{navn} i alt:</span> {kr(oms)} / 12 mdr. · {direkte + indirekte} af {rows.length} P-enheder dækket
        {indirekte ? ` (${direkte} direkte / ${indirekte} via forhandler)` : ""} · {ansatte.toLocaleString("da-DK")} ansatte i alt
      </div>
      <ul className="divide-y text-sm">
        {sorted.map((r) => (
          <li key={r.p_number} className="py-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="font-medium">{r.address ?? "Ukendt adresse"}</span>
              <span className="text-xs text-muted-foreground">
                {[[r.zip, r.city].filter(Boolean).join(" "), `P-nr. ${r.p_number}`, `${r.ansatte ?? r.ansatte_interval ?? "–"} ansatte`].join(" · ")}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {r.status === "direkte" && r.company_id ? (
                <>
                  <span className="text-foreground">Direkte kunde</span> · kundenr. {r.visma_delivery_no ?? "–"} ·{" "}
                  {r.company_id === companyId ? (
                    "egen konto"
                  ) : (
                    <>
                      anden konto:{" "}
                      <Link to="/virksomheder/$id" params={{ id: r.company_id }} className="text-primary hover:underline">
                        {r.company_name}
                      </Link>
                    </>
                  )}
                  {r.customer_type ? ` · ${STATUS[r.customer_type] ?? r.customer_type}` : ""}
                  {` · ${r.saelger_navn ?? "uden sælger"}`}
                  {r.oms_12m != null ? ` · ${kr(r.oms_12m)} / 12 mdr.` : ""}
                </>
              ) : r.status === "indirekte" && r.via_company_id ? (
                <>
                  <span className="text-foreground">Leveres via </span>
                  <Link to="/virksomheder/$id" params={{ id: r.via_company_id }} className="text-primary hover:underline">
                    {r.via_company_name}
                  </Link>
                  {r.note ? ` · ${r.note}` : ""}
                </>
              ) : (
                <span>Ikke dækket — se handlinger under "P-enheder vi ikke er hos"</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS: Record<string, string> = {
  aktiv_kunde: "Aktiv",
  sovende_kunde: "Sovende",
  servicekunde: "Servicekunde",
  tidligere_kunde: "Tidligere kunde",
  nyt_emne: "Nyt emne",
};
