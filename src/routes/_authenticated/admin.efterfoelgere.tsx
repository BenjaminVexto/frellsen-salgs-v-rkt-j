import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAfdeling } from "@/contexts/afdeling-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/efterfoelgere")({
  component: EfterfoelgereSide,
  head: () => ({
    meta: [
      { title: "Mulige efterfølgere | Frellsen CRM" },
      { name: "description", content: "Forslag til kundekonti, der fortsætter på en ny Visma-konto med samme CVR." },
      { property: "og:title", content: "Mulige efterfølgere" },
      { property: "og:description", content: "Forslag til kundekonti, der fortsætter på en ny Visma-konto med samme CVR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Forslag = {
  fra_id: string; fra_navn: string; fra_visma: string | null; fra_sidste: string; fra_snit: number;
  til_id: string; til_navn: string; til_visma: string | null; til_foerste: string; til_snit: number;
  cvr: string; segment: string;
};

const kr = (v: number) => new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(v) + " kr./md";
const mdr = (d: string) => new Date(d).toLocaleDateString("da-DK", { month: "short", year: "numeric" });

function EfterfoelgereSide() {
  const { afdelinger, labelFor } = useAfdeling();
  const [afd, setAfd] = useState<string>("11");
  const [arbejder, setArbejder] = useState<string | null>(null);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["efterfoelger-forslag", afd],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("efterfoelger_forslag", { _afdeling_nr: afd === "alle" ? null : Number(afd) });
      if (error) throw error;
      return (data ?? []) as Forslag[];
    },
  });

  const godkend = async (f: Forslag) => {
    setArbejder(f.fra_id + f.til_id);
    const { error } = await (supabase as any).rpc("efterfoelger_saet", { _fra: f.fra_id, _til: f.til_id });
    setArbejder(null);
    if (error) return toast.error(error.message);
    toast.success(`${f.fra_navn} efterfølges nu af ${f.til_navn}`);
    qc.invalidateQueries({ queryKey: ["efterfoelger-forslag"] });
  };
  const afvis = async (f: Forslag) => {
    setArbejder(f.fra_id + f.til_id);
    const { error } = await (supabase as any).from("efterfoelger_forslag_afvist").insert({ fra_company_id: f.fra_id, til_company_id: f.til_id });
    setArbejder(null);
    if (error) return toast.error(error.message);
    toast.success("Forslaget er afvist og vises ikke igen");
    qc.invalidateQueries({ queryKey: ["efterfoelger-forslag"] });
  };

  return (
    <div className="px-4 md:px-6 py-6 max-w-[1400px] mx-auto space-y-4">
      <Link to="/admin/dubletter" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center">
        <ArrowLeft className="h-4 w-4 mr-1" /> Dubletter
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mulige efterfølgere</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Konti med mindst 3.000 kr./md i forbrugsvarer (snit 6 mdr. før sidste køb), der er stoppet, mens en anden konto med samme CVR og
            kundeprisgruppe 1 fik første køb inden for ±2 måneder med 40–250 % af omsætningen. Intet kobles automatisk.
          </p>
        </div>
        <Select value={afd} onValueChange={setAfd}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle afdelinger</SelectItem>
            {afdelinger.map((a: any) => {
              const nr = String(typeof a === "object" ? a.nr ?? a.afdeling_nr : a);
              return <SelectItem key={nr} value={nr}>{labelFor(Number(nr))}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>
      <Card className="overflow-x-auto">
        {q.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />Beregner forslag…</p>
        ) : q.error ? (
          <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p>
        ) : !(q.data ?? []).length ? (
          <p className="p-4 text-sm text-muted-foreground">Ingen forslag.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="p-2">Gammel konto</th><th className="p-2">Sidste køb</th><th className="p-2 text-right">Snit</th>
                <th className="p-2"></th>
                <th className="p-2">Ny konto</th><th className="p-2">Første køb</th><th className="p-2 text-right">Snit</th>
                <th className="p-2">CVR</th><th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((f) => (
                <tr key={f.fra_id + f.til_id} className="border-b last:border-0">
                  <td className="p-2"><Link to="/virksomheder/$id" params={{ id: f.fra_id }} className="font-medium hover:underline">{f.fra_navn}</Link><div className="text-xs text-muted-foreground">{f.fra_visma}</div></td>
                  <td className="p-2 whitespace-nowrap">{mdr(f.fra_sidste)}</td>
                  <td className="p-2 text-right whitespace-nowrap">{kr(Number(f.fra_snit))}</td>
                  <td className="p-2"><ArrowRight className="h-4 w-4 text-muted-foreground" /></td>
                  <td className="p-2"><Link to="/virksomheder/$id" params={{ id: f.til_id }} className="font-medium hover:underline">{f.til_navn}</Link><div className="text-xs text-muted-foreground">{f.til_visma}</div></td>
                  <td className="p-2 whitespace-nowrap">{mdr(f.til_foerste)}</td>
                  <td className="p-2 text-right whitespace-nowrap">{kr(Number(f.til_snit))}</td>
                  <td className="p-2 text-xs text-muted-foreground">{f.cvr}<div>{f.segment}</div></td>
                  <td className="p-2 whitespace-nowrap text-right space-x-1">
                    <Button size="sm" disabled={!!arbejder} onClick={() => godkend(f)}><Check className="h-4 w-4 mr-1" />Godkend</Button>
                    <Button size="sm" variant="outline" disabled={!!arbejder} onClick={() => afvis(f)}><X className="h-4 w-4 mr-1" />Afvis</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
