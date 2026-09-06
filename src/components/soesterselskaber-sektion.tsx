import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users2, Search, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CustomerStatusBadge } from "@/components/customer-status-info";
import { BindingStatusBadge } from "@/components/binding-status-badge";
import { getCompanySalesSummary } from "@/lib/sales.functions";
import { fmtKr } from "@/lib/sales-utils";

type Sister = {
  id: string;
  name: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  visma_id: string | null;
  visma_delivery_id: string | null;
  visma_enhed: string | null;
  customer_type: string;
  is_public: boolean | null;
  binding_status: string | null;
};

const INITIAL_LIMIT = 8;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function fmtDato(d: string | null | undefined): string {
  if (!d) return "Intet køb registreret";
  return new Date(d).toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric" });
}

export function SoesterselskaberSektion({
  companyId,
  cvr,
}: {
  companyId: string;
  cvr: string | null | undefined;
}) {
  const [rows, setRows] = useState<Sister[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const cvrClean = (cvr ?? "").trim();
    if (!cvrClean) {
      setRows([]);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(
          "id,name,address,zip,city,visma_id,visma_delivery_id,visma_enhed,customer_type,is_public,binding_status",
        )
        .eq("cvr", cvrClean)
        .order("customer_type", { ascending: true })
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        setRows([]);
      } else {
        setRows((data ?? []) as Sister[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [cvr]);

  const self = useMemo(() => (rows ?? []).find((r) => r.id === companyId) ?? null, [rows, companyId]);

  // Enheder på samme adresse (samme CVR + samme adresse + samme postnr.)
  const adresseIds = useMemo(() => {
    if (!rows || !self) return new Set<string>();
    const a = norm(self.address);
    const z = norm(self.zip);
    if (!a) return new Set<string>();
    return new Set(
      rows.filter((r) => norm(r.address) === a && norm(r.zip) === z).map((r) => r.id),
    );
  }, [rows, self]);

  const visAdressegruppe = adresseIds.size > 1;

  const fetchSummary = useServerFn(getCompanySalesSummary);
  const alleIds = useMemo(() => (rows ?? []).map((r) => r.id), [rows]);
  const salesQ = useQuery({
    queryKey: ["sister-sales", companyId, alleIds.length, alleIds.join(",").slice(0, 200)],
    queryFn: () => fetchSummary({ data: { companyIds: alleIds } }),
    enabled: alleIds.length > 0,
  });
  const summary = salesQ.data ?? {};

  const oevrige = useMemo(
    () => (rows ?? []).filter((r) => !visAdressegruppe || !adresseIds.has(r.id)),
    [rows, adresseIds, visAdressegruppe],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return oevrige;
    return oevrige.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q) ||
        (r.visma_enhed ?? "").toLowerCase().includes(q) ||
        (r.visma_id ?? "").toLowerCase().includes(q) ||
        (r.visma_delivery_id ?? "").toLowerCase().includes(q),
    );
  }, [oevrige, query]);

  const sorted = useMemo(() => {
    const rank: Record<string, number> = {
      aktiv_kunde: 0,
      sovende_kunde: 1,
      tidligere_kunde: 2,
      nyt_emne: 3,
      ikke_tildelt: 4,
    };
    return [...filtered].sort((a, b) => {
      if (a.id === companyId) return -1;
      if (b.id === companyId) return 1;
      return (rank[a.customer_type] ?? 9) - (rank[b.customer_type] ?? 9);
    });
  }, [filtered, companyId]);

  const adresseEnheder = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((r) => adresseIds.has(r.id))
      .sort((a, b) => (summary[b.id]?.revenue12m ?? 0) - (summary[a.id]?.revenue12m ?? 0));
  }, [rows, adresseIds, summary]);

  const adresseTotal = adresseEnheder.reduce((s, r) => s + (summary[r.id]?.revenue12m ?? 0), 0);

  if (!cvr || !cvr.trim()) return null;
  if (loading && rows === null) {
    return (
      <Card className="p-5">
        <div className="text-sm text-muted-foreground">Henter enheder…</div>
      </Card>
    );
  }
  if (!rows || rows.length <= 1) return null;

  const visible = showAll ? sorted : sorted.slice(0, INITIAL_LIMIT);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Users2 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Andre enheder</h3>
        </div>
        <div className="text-xs text-muted-foreground">
          Deler CVR {cvr} · {rows.length} enheder
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Enheder på samme adresse afregnes separat i Visma efter kundens ønske — de er reelt
        samme kunde fordelt på flere konti. Øvrige enheder deler blot CVR og er selvstændige
        virksomheder med eget kundenr, lokationer og maskiner.
      </p>

      {visAdressegruppe && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <h4 className="text-sm font-semibold">Enheder på denne adresse</h4>
            <span className="text-xs text-muted-foreground">
              {self?.address}
              {self?.zip ? `, ${self.zip}` : ""}
              {self?.city ? ` ${self.city}` : ""}
            </span>
          </div>

          <div className="rounded-md border bg-muted/30 px-3 py-2 mb-2 text-sm font-medium">
            Samlet på adressen: {fmtKr(adresseTotal)} fordelt på {adresseEnheder.length} konti
            <span className="ml-1 text-xs font-normal text-muted-foreground">(seneste 12 mdr.)</span>
          </div>

          <ul className="divide-y divide-border rounded-md border">
            {adresseEnheder.map((r) => {
              const isSelf = r.id === companyId;
              const kundenr = r.visma_id || r.visma_delivery_id || "—";
              const s = summary[r.id];
              const inner = (
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium truncate ${isSelf ? "" : "text-primary"}`}>
                        {r.name}
                      </span>
                      {r.visma_enhed && (
                        <Badge variant="outline" className="text-[10px]">
                          {r.visma_enhed}
                        </Badge>
                      )}
                      {isSelf && (
                        <Badge variant="secondary" className="text-[10px]">
                          Denne enhed
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Lev.nr {kundenr} · Sidste køb: {fmtDato(s?.lastPurchase)}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-medium tabular-nums">
                      {salesQ.isLoading ? "…" : fmtKr(s?.revenue12m ?? 0)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">omsætning 12 mdr.</div>
                  </div>
                </div>
              );
              return (
                <li key={r.id} className={isSelf ? "bg-muted/40" : "hover:bg-muted/30 transition-colors"}>
                  {isSelf ? (
                    inner
                  ) : (
                    <Link to="/virksomheder/$id" params={{ id: r.id }} className="block">
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {sorted.length > 0 && (
        <>
          {visAdressegruppe && (
            <h4 className="text-sm font-semibold mb-2">Øvrige enheder med samme CVR</h4>
          )}

          {oevrige.length > INITIAL_LIMIT && (
            <div className="relative mb-3">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Søg i enheder (navn, by, kundenr)…"
                className="pl-7 h-8 text-xs"
              />
            </div>
          )}

          <ul className="divide-y divide-border rounded-md border">
            {visible.map((r) => {
              const isSelf = r.id === companyId;
              const kundenr = r.visma_id || r.visma_delivery_id || "—";
              const inner = (
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium truncate ${isSelf ? "" : "text-primary"}`}>
                        {r.name}
                      </span>
                      {r.visma_enhed && (
                        <span className="text-xs text-muted-foreground">· {r.visma_enhed}</span>
                      )}
                      {isSelf && (
                        <Badge variant="secondary" className="text-[10px]">
                          Denne enhed
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Lev.nr {kundenr}
                      {r.city ? ` · ${r.city}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <BindingStatusBadge status={r.binding_status} size="sm" />
                    <CustomerStatusBadge type={r.customer_type} />
                  </div>
                </div>
              );
              return (
                <li key={r.id} className={isSelf ? "bg-muted/40" : "hover:bg-muted/30 transition-colors"}>
                  {isSelf ? (
                    inner
                  ) : (
                    <Link to="/virksomheder/$id" params={{ id: r.id }} className="block">
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>

          {!showAll && sorted.length > INITIAL_LIMIT && (
            <div className="mt-3 flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                Vis alle {sorted.length} enheder
              </Button>
            </div>
          )}
          {query && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground mt-3 text-center">Ingen match på "{query}".</p>
          )}
        </>
      )}
    </Card>
  );
}
