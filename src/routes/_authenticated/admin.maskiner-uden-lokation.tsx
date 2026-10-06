import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/maskiner-uden-lokation")({
  component: Side,
  head: () => ({
    meta: [
      { title: "Maskiner uden lokation | Frellsen CRM" },
      { name: "description", content: "Aktive maskiner hvis leveringsnummer ikke findes som lokation." },
      { property: "og:title", content: "Maskiner uden lokation | Frellsen CRM" },
      { property: "og:description", content: "Aktive maskiner hvis leveringsnummer ikke findes som lokation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Side() {
  const q = useQuery({
    queryKey: ["maskiner-uden-lokation"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("maskiner_uden_lokation");
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      <div>
        <h1 className="text-xl font-semibold">Maskiner uden lokation</h1>
        <p className="text-sm text-muted-foreground">
          Aktive maskiner, hvor leveringsnummeret ikke findes som lokation i afdelingen. De tælles hos virksomhedens sælger, indtil de kobles.
        </p>
      </div>
      <Card className="p-0 overflow-x-auto">
        {q.isLoading ? (
          <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : q.error ? (
          <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left p-2">Afd.</th>
                <th className="text-left p-2">Virksomhed</th>
                <th className="text-left p-2">Sælger</th>
                <th className="text-left p-2">Maskine</th>
                <th className="text-left p-2">Serienr.</th>
                <th className="text-left p-2">Lev. kund / Fakt. kunde</th>
                <th className="text-left p-2">Navn / adresse på maskinen</th>
              </tr>
            </thead>
            <tbody>
              {q.data!.map((r: any) => (
                <tr key={r.machine_id} className="border-b align-top">
                  <td className="p-2">{r.afdeling_nr}</td>
                  <td className="p-2">
                    {r.company_id ? (
                      <Link to="/virksomheder/$id" params={{ id: r.company_id }} className="hover:underline font-medium">{r.company_navn}</Link>
                    ) : <span className="text-muted-foreground">Ikke fundet</span>}
                  </td>
                  <td className="p-2">{r.saelger_navn ?? "—"}</td>
                  <td className="p-2">{r.beskrivelse ?? r.varenr ?? "—"}{r.udlanstype ? <div className="text-xs text-muted-foreground">{r.udlanstype}</div> : null}</td>
                  <td className="p-2">{r.serienr ?? "—"}</td>
                  <td className="p-2">{r.lev_kundenr ?? "—"} / {r.fak_kundenr ?? "—"}</td>
                  <td className="p-2">{r.navn ?? "—"}{r.adresse ? <div className="text-xs text-muted-foreground">{r.adresse}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {q.data && <p className="text-xs text-muted-foreground">{q.data.length} maskiner</p>}
    </div>
  );
}
