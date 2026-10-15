import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { hentAlle } from "@/lib/hent-alle";
import { ForslagLinje, type Koblingsforslag } from "@/components/penhed-forhandler";

export const Route = createFileRoute("/_authenticated/admin/koblingsforslag")({
  component: Side,
  head: () => ({
    meta: [
      { title: "Koblingsforslag for P-enheder | Frellsen CRM" },
      { name: "description", content: "P-enheder med en næsten-ens adresse hos en kunde, som kan bekræftes eller afvises." },
      { property: "og:title", content: "Koblingsforslag for P-enheder | Frellsen CRM" },
      { property: "og:description", content: "P-enheder med en næsten-ens adresse hos en kunde, som kan bekræftes eller afvises." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SIDE = 200;

function Side() {
  const [soeg, setSoeg] = useState("");
  const [visUsikre, setVisUsikre] = useState(false);
  const [vis, setVis] = useState(SIDE);
  const q = useQuery({
    queryKey: ["penhed-koblingsforslag-alle"],
    queryFn: () =>
      hentAlle<Koblingsforslag>((f, t) =>
        (supabase as any)
          .rpc("penhed_koblingsforslag", { _cvr: null })
          .order("samme_cvr", { ascending: false })
          .order("p_nummer")
          .order("location_id")
          .range(f, t),
      ),
  });

  const grupper = useMemo(() => {
    const t = soeg.trim().toLowerCase();
    const m = new Map<string, Koblingsforslag[]>();
    for (const f of q.data ?? []) {
      if (!visUsikre && !f.samme_cvr) continue;
      if (
        t &&
        ![f.penhed_adresse, f.penhed_city, f.company_name, f.visma_delivery_no, f.cvr, f.p_nummer, f.lokation_adresse]
          .some((x) => (x ?? "").toLowerCase().includes(t))
      )
        continue;
      const k = `${f.p_nummer}|${f.afdeling_nr}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    return [...m.values()].sort(
      (a, b) => Number(b[0].samme_cvr) - Number(a[0].samme_cvr) || (b[0].ansatte ?? -1) - (a[0].ansatte ?? -1),
    );
  }, [q.data, soeg, visUsikre]);

  const total = q.data?.length ?? 0;
  const sammeCvr = (q.data ?? []).filter((f) => f.samme_cvr).length;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold">Koblingsforslag for P-enheder</h1>
        <p className="text-sm text-muted-foreground">
          P-enheder uden kobling, hvor en kundelokation har samme vej og postnummer og et husnummer inden for ±4.
          Intet kobles automatisk — bekræft eller afvis hvert forslag.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input className="max-w-xs" placeholder="Søg adresse, kunde, kundenr., CVR" value={soeg} onChange={(e) => { setSoeg(e.target.value); setVis(SIDE); }} />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={visUsikre} onChange={(e) => { setVisUsikre(e.target.checked); setVis(SIDE); }} />
          Vis også usikre (uden CVR)
        </label>
        {q.data && (
          <span className="text-sm text-muted-foreground">
            {total} forslag i alt · {sammeCvr} med samme CVR · {grupper.length} P-enheder vist
          </span>
        )}
      </div>
      <Card className="p-0 overflow-x-auto">
        {q.isLoading ? (
          <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : q.error ? (
          <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p>
        ) : grupper.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Ingen åbne forslag.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left p-2">Afd.</th>
                <th className="text-left p-2">P-enhed (CVR)</th>
                <th className="text-right p-2">Ansatte</th>
                <th className="text-left p-2">Kunde</th>
                <th className="text-left p-2">Forslag</th>
              </tr>
            </thead>
            <tbody>
              {grupper.slice(0, vis).map((g) => {
                const f = g[0];
                return (
                  <tr key={`${f.p_nummer}|${f.afdeling_nr}`} className="border-b last:border-0 align-top">
                    <td className="p-2 tabular-nums">{f.afdeling_nr}</td>
                    <td className="p-2">
                      <div>{f.penhed_adresse}</div>
                      <div className="text-xs text-muted-foreground">
                        {[f.penhed_zip, f.penhed_city].filter(Boolean).join(" ")} · P-nr. {f.p_nummer} · CVR {f.cvr}
                      </div>
                    </td>
                    <td className="p-2 text-right tabular-nums">{f.ansatte ?? "–"}</td>
                    <td className="p-2">
                      <Link to="/virksomheder/$id" params={{ id: f.company_id }} className="hover:underline">
                        {f.company_name}
                      </Link>
                      {!f.samme_cvr && <div className="text-xs text-muted-foreground">uden CVR</div>}
                    </td>
                    <td className="p-2">
                      <ForslagLinje forslag={g} onDone={() => q.refetch()} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {grupper.length > vis && (
        <Button variant="outline" size="sm" onClick={() => setVis((v) => v + SIDE)}>
          Vis flere ({grupper.length - vis} tilbage)
        </Button>
      )}
    </div>
  );
}
