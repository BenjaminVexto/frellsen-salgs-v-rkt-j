import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PackageSearch } from "lucide-react";
import { getSortimentDaekning } from "@/lib/sortiment.functions";

function pctTekst(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "";
  return `${Math.round(Number(pct))} %`;
}

export function SortimentDaekningSektion({
  companyId,
  afdelingNr,
}: {
  companyId: string;
  afdelingNr: number | null | undefined;
}) {
  const hent = useServerFn(getSortimentDaekning);
  const enabled = afdelingNr === 21;

  const { data, isLoading } = useQuery({
    queryKey: ["sortiment-daekning", companyId],
    queryFn: () => hent({ data: { companyId } }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  if (!enabled) return null;
  if (isLoading) {
    return (
      <Card className="p-5">
        <h2 className="font-semibold flex items-center gap-2">
          <PackageSearch className="h-4 w-4" /> Sortimentsdækning
        </h2>
        <p className="text-sm text-muted-foreground mt-2">Beregner …</p>
      </Card>
    );
  }
  if (!data?.vises) return null;

  const foerer = data.foerer ?? [];
  const mangler = data.mangler ?? [];
  const relevante = data.relevante_i_alt ?? 0;
  const foererRelevante = data.foerer_relevante ?? 0;
  const paalidelig = data.paalidelig !== false;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-semibold flex items-center gap-2">
          <PackageSearch className="h-4 w-4" />
          Sortiment: {foererRelevante} af {relevante} varegrupper
        </h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Målt mod sammenlignelige specialbutikker i samme kundeprisgruppe
        {paalidelig ? ` (${data.kunder_i_alt} butikker, seneste 12 mdr.)` : ""}.
      </p>

      {!paalidelig && (
        <p className="text-sm text-muted-foreground mb-4">
          For få sammenlignelige butikker til en pålidelig norm
        </p>
      )}

      {mangler.length > 0 && (
        <div className="space-y-4 mb-4">
          {mangler.map((g) => (
            <div key={g.gruppe} className="rounded-md border border-border p-3">
              <div className="text-sm font-medium">
                Fører ikke: {g.navn}
                {paalidelig && g.pct !== null && g.pct !== undefined && (
                  <span className="font-normal text-muted-foreground">
                    {" "}({pctTekst(g.pct)} af sammenlignelige butikker)
                  </span>
                )}
              </div>
              {paalidelig && g.varer.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {g.varer.map((v) => (
                    <li key={v.varenr} className="text-xs text-muted-foreground">
                      <span className="font-mono">{v.varenr}</span> · {v.beskrivelse ?? "—"}{" "}
                      <span className="text-muted-foreground/80">
                        ({v.kunder} {v.kunder === 1 ? "butik køber" : "butikker køber"} varen)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {foerer.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Fører i dag</p>
          <div className="flex flex-wrap gap-1.5">
            {foerer.map((g) => (
              <Badge key={g.gruppe} variant="secondary" className="text-xs font-normal">
                {g.navn}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {mangler.length === 0 && paalidelig && (
        <p className="text-sm text-muted-foreground mt-3">
          Butikken fører alle varegrupper, som mindst 25 % af sammenlignelige butikker køber.
        </p>
      )}
    </Card>
  );
}
