import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { maskinNavn } from "@/lib/maskinliste";

type Raekke = { serienr: string; maskintype: string | null; dato: string; company_id: string; virksomhed: string; adresse: string | null; by: string | null };

/** "Reservedele overgår til betaling": maskiner hvor kunden begynder at betale for reservedele inden for 6 mdr. */
export function ReservedeleListe({ saelgerId }: { saelgerId: string | null }) {
  const q = useQuery({
    queryKey: ["reservedele-til-betaling", saelgerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("reservedele_til_betaling", { _saelger: saelgerId });
      if (error) throw error;
      return ((data ?? []) as Raekke[]).sort((a, b) => a.dato.localeCompare(b.dato));
    },
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Reservedele overgår til betaling</CardTitle>
        <p className="text-xs text-muted-foreground">Maskiner hvor reservedele ikke længere er inkluderet inden for 6 måneder — en anledning til at tale om udskiftning.</p>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Henter…</div>
        ) : q.isError ? (
          <div className="text-sm text-destructive">Kunne ikke hente listen. <button className="underline" onClick={() => q.refetch()}>Prøv igen</button></div>
        ) : !q.data?.length ? (
          <div className="text-sm text-muted-foreground">Ingen maskiner de næste 6 måneder.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground text-left">
              <tr><th className="py-1">Dato</th><th>Virksomhed</th><th>Adresse</th><th>Maskine</th><th>Serienr.</th></tr>
            </thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.serienr} className="border-t">
                  <td className="py-1 whitespace-nowrap">{new Date(r.dato + "T00:00:00").toLocaleDateString("da-DK")}</td>
                  <td><Link to="/virksomheder/$id" params={{ id: r.company_id }} className="text-primary hover:underline">{r.virksomhed}</Link></td>
                  <td>{[r.by, r.adresse].filter(Boolean).join(" · ")}</td>
                  <td>{maskinNavn(r.maskintype)}</td>
                  <td className="whitespace-nowrap">{r.serienr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
