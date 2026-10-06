import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { maskinNavn } from "@/lib/maskinliste";

export const Route = createFileRoute("/_authenticated/admin/maskiner-uden-aftale")({
  component: Side,
  head: () => ({
    meta: [
      { title: "Maskiner uden aftale og aflæsning | Frellsen CRM" },
      { name: "description", content: "Aktive maskiner uden aftale og uden tælleraflæsning — til oprydning i maskinregistret." },
      { property: "og:title", content: "Maskiner uden aftale og aflæsning | Frellsen CRM" },
      { property: "og:description", content: "Aktive maskiner uden aftale og uden tælleraflæsning — til oprydning i maskinregistret." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Side() {
  const [soeg, setSoeg] = useState("");
  const q = useQuery({
    queryKey: ["maskiner-uden-aftale"],
    queryFn: async () => {
      // Hent i bidder — svaret er ellers begrænset til 1.000 rækker.
      const alle: any[] = [];
      for (let fra = 0; ; fra += 1000) {
        const { data, error } = await (supabase as any)
          .rpc("maskiner_uden_aftale_og_aflaesning")
          .range(fra, fra + 999);
        if (error) throw error;
        alle.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return alle;
    },
  });
  const rows = useMemo(() => {
    const s = soeg.trim().toLowerCase();
    const r = q.data ?? [];
    return s ? r.filter((x) => `${x.company_navn} ${x.adresse} ${x.kundenr} ${x.maskintype} ${x.serienr} ${x.saelger_navn}`.toLowerCase().includes(s)) : r;
  }, [q.data, soeg]);
  const virksomheder = new Set(rows.map((r) => r.company_id)).size;
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      <div>
        <h1 className="text-xl font-semibold">Maskiner uden aftale og aflæsning</h1>
        <p className="text-sm text-muted-foreground">
          Aktive maskiner på en lokation, som hverken har en aftale (udlånstype, serviceaftale eller gratis udlån) eller en tælleraflæsning i Visma. Ryd op i maskinregistret, før maskinlisten sendes til kunder.
        </p>
      </div>
      <Input placeholder="Søg på virksomhed, adresse, kundenr., maskine, serienr. eller sælger…" value={soeg} onChange={(e) => setSoeg(e.target.value)} className="max-w-md" />
      <Card className="p-0 overflow-x-auto">
        {q.isLoading ? (
          <div className="p-6 flex justify-center items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Henter maskiner…</div>
        ) : q.error ? (
          <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Ingen maskiner fundet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left p-2">Afd.</th>
                <th className="text-left p-2">Virksomhed</th>
                <th className="text-left p-2">Adresse · kundenr.</th>
                <th className="text-left p-2">Sælger</th>
                <th className="text-left p-2">Maskine</th>
                <th className="text-left p-2">Serienr.</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 1000).map((r) => (
                <tr key={r.unit_id} className="border-b align-top">
                  <td className="p-2">{r.afdeling_nr}</td>
                  <td className="p-2"><Link to="/virksomheder/$id" params={{ id: r.company_id }} className="hover:underline font-medium">{r.company_navn}</Link></td>
                  <td className="p-2">{r.adresse || "—"}<div className="text-xs text-muted-foreground">Kundenr. {r.kundenr ?? "—"}</div></td>
                  <td className="p-2">{r.saelger_navn || "—"}</td>
                  <td className="p-2">{maskinNavn(r.maskintype)}</td>
                  <td className="p-2">{r.serienr || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {q.data && <p className="text-xs text-muted-foreground">{rows.length} maskiner hos {virksomheder} virksomheder{rows.length > 1000 ? " · viser de første 1.000 — brug søgningen" : ""}</p>}
    </div>
  );
}
