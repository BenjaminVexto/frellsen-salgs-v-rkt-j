import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CustomerStatusBadge } from "@/components/customer-status-info";

type Sister = {
  id: string;
  name: string;
  city: string | null;
  visma_id: string | null;
  visma_delivery_id: string | null;
  customer_type: string;
  is_public: boolean | null;
};

const INITIAL_LIMIT = 8;

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
        .select("id,name,city,visma_id,visma_delivery_id,customer_type,is_public")
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

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q) ||
        (r.visma_id ?? "").toLowerCase().includes(q) ||
        (r.visma_delivery_id ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  // Sortér: aktiv kunde først, derefter sovende, tidligere, nyt_emne; selve enheden øverst
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

  if (!cvr || !cvr.trim()) return null;
  if (loading && rows === null) {
    return (
      <Card className="p-5">
        <div className="text-sm text-muted-foreground">Henter søsterselskaber…</div>
      </Card>
    );
  }
  if (!rows || rows.length <= 1) return null; // kun denne enhed — intet søsterskab

  const visible = showAll ? sorted : sorted.slice(0, INITIAL_LIMIT);
  const totalOthers = rows.length - 1;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users2 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Søsterselskaber</h3>
        </div>
        <div className="text-xs text-muted-foreground">
          Deler CVR {cvr} · {rows.length} enheder
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        {totalOthers} andre Visma-enheder deler samme CVR. Hver enhed er en selvstændig
        virksomhed med eget kundenr, lokationer og maskiner.
      </p>

      {rows.length > INITIAL_LIMIT && (
        <div className="relative mb-3">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søg i søsterselskaber (navn, by, kundenr)…"
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
                {r.is_public && (
                  <Badge
                    variant="outline"
                    className="border-primary/40 text-primary bg-primary/5 text-[10px]"
                  >
                    Offentlig
                  </Badge>
                )}
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
    </Card>
  );
}
