import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/virksomheder")({
  component: VirksomhederListe,
});

type Row = {
  id: string;
  name: string;
  cvr: string;
  city: string | null;
  customer_type: string;
};

const customerTypeLabel: Record<string, string> = {
  nyt_emne: "Nyt emne",
  aktiv_kunde: "Aktiv kunde",
  sovende_kunde: "Sovende kunde",
  tidligere_kunde: "Tidligere kunde",
};

function VirksomhederListe() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("id,name,cvr,city,customer_type")
        .order("name")
        .limit(200);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      r.cvr.includes(q) ||
      (r.city ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="px-4 md:px-8 py-8 max-w-6xl mx-auto pb-24 md:pb-8">
      <h1 className="text-2xl md:text-3xl font-semibold mb-6">Virksomheder</h1>
      <Input
        placeholder="Søg på navn, CVR eller by…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 max-w-md"
      />
      <Card className="divide-y">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Indlæser…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Ingen virksomheder fundet.</p>
        ) : (
          filtered.map((r) => (
            <Link
              key={r.id}
              to="/virksomheder/$id"
              params={{ id: r.id }}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  CVR {r.cvr}
                  {r.city ? ` · ${r.city}` : ""}
                </div>
              </div>
              <Badge variant="secondary">{customerTypeLabel[r.customer_type] ?? r.customer_type}</Badge>
            </Link>
          ))
        )}
      </Card>
    </div>
  );
}
