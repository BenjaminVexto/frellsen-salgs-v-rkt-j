import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { SourceBadges } from "@/components/source-badges";
import { OpretVirksomhedDialog } from "@/components/opret-virksomhed-dialog";

export const Route = createFileRoute("/_authenticated/virksomheder")({
  component: VirksomhederListe,
});

type Row = {
  id: string;
  name: string;
  cvr: string;
  city: string | null;
  customer_type: string;
  sources: string[] | null;
};

const customerTypeLabel: Record<string, string> = {
  nyt_emne: "Nyt emne",
  aktiv_kunde: "Aktiv kunde",
  sovende_kunde: "Sovende kunde",
  tidligere_kunde: "Tidligere kunde",
};

const RECENT_KEY = "recently_imported_ids";

function VirksomhederListe() {
  const auth = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [recentIds, setRecentIds] = useState<string[] | null>(null);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  // Læs nyligt importerede fra sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RECENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { ids: string[]; at: number };
        // Udløber efter 30 min
        if (parsed.at && Date.now() - parsed.at < 30 * 60 * 1000 && Array.isArray(parsed.ids)) {
          setRecentIds(parsed.ids);
        } else {
          sessionStorage.removeItem(RECENT_KEY);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let query = supabase
        .from("companies")
        .select("id,name,cvr,city,customer_type,sources")
        .order("created_at", { ascending: false })
        .limit(500);
      if (recentIds && recentIds.length) {
        query = supabase
          .from("companies")
          .select("id,name,cvr,city,customer_type,sources")
          .in("id", recentIds)
          .order("created_at", { ascending: false });
      }
      const { data } = await query;
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [recentIds]);

  // Hent tildelte company_ids (kun nødvendigt for admin der ser "Ikke tildelt"-badge)
  useEffect(() => {
    if (auth.role !== "admin") return;
    (async () => {
      const { data } = await supabase
        .from("contact_list_assignments")
        .select("company_id")
        .limit(10000);
      const s = new Set<string>();
      (data ?? []).forEach((d: any) => s.add(d.company_id));
      setAssignedIds(s);
    })();
  }, [auth.role, rows.length]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchesQ =
        r.name.toLowerCase().includes(q.toLowerCase()) ||
        r.cvr.includes(q) ||
        (r.city ?? "").toLowerCase().includes(q.toLowerCase());
      if (!matchesQ) return false;
      if (onlyUnassigned && assignedIds.has(r.id)) return false;
      return true;
    });
  }, [rows, q, onlyUnassigned, assignedIds]);

  const clearRecent = () => {
    sessionStorage.removeItem(RECENT_KEY);
    setRecentIds(null);
  };

  const isAdmin = auth.role === "admin";

  return (
    <div className="px-4 md:px-8 py-8 max-w-6xl mx-auto pb-24 md:pb-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold">Virksomheder</h1>
        <OpretVirksomhedDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Opret virksomhed
            </Button>
          }
        />
      </div>
      {recentIds && recentIds.length > 0 && (
        <Card className="p-3 mb-4 flex items-center justify-between bg-primary/5 border-primary/30">
          <div className="text-sm">
            Viser <strong>{recentIds.length}</strong> nyligt importerede virksomheder.
          </div>
          <Button size="sm" variant="ghost" onClick={clearRecent}>
            <X className="h-4 w-4 mr-1" /> Ryd filter
          </Button>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input
          placeholder="Søg på navn, CVR eller by…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
        {isAdmin && (
          <Button
            variant={onlyUnassigned ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyUnassigned((v) => !v)}
          >
            Kun ikke tildelt
          </Button>
        )}
      </div>

      <Card className="divide-y">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Indlæser…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Ingen virksomheder fundet.</p>
        ) : (
          filtered.map((r) => {
            const unassigned = isAdmin && !assignedIds.has(r.id);
            return (
              <Link
                key={r.id}
                to="/virksomheder/$id"
                params={{ id: r.id }}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.name}</span>
                    <SourceBadges sources={r.sources} size="sm" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    CVR {r.cvr}
                    {r.city ? ` · ${r.city}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {unassigned && (
                    <Badge variant="outline" className="border-warning/40 text-warning">
                      Ikke tildelt
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    {customerTypeLabel[r.customer_type] ?? r.customer_type}
                  </Badge>
                </div>
              </Link>
            );
          })
        )}
      </Card>
    </div>
  );
}
