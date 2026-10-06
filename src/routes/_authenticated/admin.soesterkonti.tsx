import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/soesterkonti")({
  component: Side,
  head: () => ({
    meta: [
      { title: "Søsterkonti på samme adresse | Frellsen CRM" },
      { name: "description", content: "Sovende konti med en aktiv søsterkonto på samme CVR og adresse." },
      { property: "og:title", content: "Søsterkonti på samme adresse | Frellsen CRM" },
      { property: "og:description", content: "Sovende konti med en aktiv søsterkonto på samme CVR og adresse." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Side() {
  const q = useQuery({
    queryKey: ["soesterkonti"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("soesterkonti_par");
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Søsterkonti på samme adresse</h1>
          <p className="text-sm text-muted-foreground">
            Konti uden køb, som har en aktiv konto med samme CVR og adresse. De vises ikke på sovende-lister.
            Intet lægges sammen automatisk — brug dubletfunktionen, hvis to konti skal samles.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/dubletter">Til dubletter</Link>
        </Button>
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
                <th className="text-left p-2">CVR</th>
                <th className="text-left p-2">Konto uden køb</th>
                <th className="text-left p-2">Køber på konto</th>
              </tr>
            </thead>
            <tbody>
              {q.data!.map((r: any, i: number) => (
                <tr key={i} className="border-b align-top">
                  <td className="p-2">{r.afdeling_nr}</td>
                  <td className="p-2">{r.cvr}</td>
                  <td className="p-2">
                    <Link to="/virksomheder/$id" params={{ id: r.sovende_company_id }} className="font-medium hover:underline">{r.sovende_navn}</Link>
                    <div className="text-xs text-muted-foreground">{r.sovende_konto} · {r.sovende_adresse} · sidste køb {r.sovende_sidste_koeb ?? "—"}</div>
                  </td>
                  <td className="p-2">
                    <Link to="/virksomheder/$id" params={{ id: r.aktiv_company_id }} className="font-medium hover:underline">{r.aktiv_navn}</Link>
                    <div className="text-xs text-muted-foreground">{r.aktiv_konto} · {r.aktiv_adresse} · sidste køb {r.aktiv_sidste_koeb ?? "—"}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {q.data && <p className="text-xs text-muted-foreground">{q.data.length} par</p>}
      <KatalogIndstilling />
    </div>
  );
}

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

function KatalogIndstilling() {
  const [url, setUrl] = useState("");
  const [billede, setBillede] = useState("");
  useEffect(() => {
    void supabase.from("katalog_indstilling").select("katalog_url, forside_billede_url").maybeSingle().then(({ data }) => {
      setUrl(data?.katalog_url ?? "");
      setBillede(data?.forside_billede_url ?? "");
    });
  }, []);
  const gem = async () => {
    const { error } = await supabase
      .from("katalog_indstilling")
      .upsert({ id: true, katalog_url: url.trim(), forside_billede_url: billede.trim() || null, opdateret_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success("Katalog-indstilling gemt");
  };
  return (
    <Card className="p-4 space-y-3" id="katalog">
      <h2 className="font-semibold">Digitalt katalog</h2>
      <div><Label>Link til katalog</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} /></div>
      <div><Label>Forsidebillede (link)</Label><Input value={billede} onChange={(e) => setBillede(e.target.value)} /></div>
      {billede && <img src={billede} alt="Katalogforside" className="h-40 rounded border" />}
      <Button onClick={gem}>Gem</Button>
    </Card>
  );
}
