import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Leaf, Check } from "lucide-react";
import { getTeSortimentKunde, teTypeLabel } from "@/lib/te-sortiment.functions";

function maaned(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("da-DK", { month: "short", year: "numeric" });
}

function kgTekst(kg: number | null | undefined): string {
  const n = Number(kg ?? 0);
  return `${n.toLocaleString("da-DK", { maximumFractionDigits: 1 })} kg`;
}

export function TeSortimentSektion({
  companyId,
  afdelingNr,
}: {
  companyId: string;
  afdelingNr: number | null | undefined;
}) {
  const hent = useServerFn(getTeSortimentKunde);
  const enabled = afdelingNr === 21;

  const { data, isLoading } = useQuery({
    queryKey: ["te-sortiment", companyId],
    queryFn: () => hent({ data: { companyId } }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  if (!enabled) return null;
  if (isLoading) {
    return (
      <Card className="p-5">
        <h2 className="font-semibold flex items-center gap-2">
          <Leaf className="h-4 w-4" /> Te-sortiment
        </h2>
        <p className="text-sm text-muted-foreground mt-2">Beregner …</p>
      </Card>
    );
  }
  if (!data?.vises) return null;

  const linjer = data.linjer ?? [];
  const foerer = linjer.filter((l) => l.foerer);
  const mangler = linjer.filter((l) => !l.foerer);
  const ukendt = data.ukendt_linjer ?? 0;

  return (
    <Card className="p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-1">
        <Leaf className="h-4 w-4" />
        Te-sortiment: {foerer.length} af {linjer.length} tetyper
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Sammenlignet med {data.kunder_i_alt ?? 0} butikker i samme kundeprisgruppe, seneste 12 mdr.
      </p>

      <div className="space-y-2">
        {linjer.map((l) => (
          <div key={l.te_type} className="rounded-md border border-border p-3">
            {l.foerer ? (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-muted-foreground" />
                  {teTypeLabel(l.te_type)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {l.varenumre} {l.varenumre === 1 ? "varenummer" : "varenumre"} ·{" "}
                  {kgTekst(l.kg)} · sidste køb {maaned(l.sidste_koeb)}
                </span>
              </div>
            ) : (
              <>
                <div className="text-sm font-medium">
                  Fører ikke: {teTypeLabel(l.te_type)}
                  {l.pct !== null && l.pct !== undefined && (
                    <span className="font-normal text-muted-foreground">
                      {" "}({Math.round(Number(l.pct))} % af sammenlignelige butikker)
                    </span>
                  )}
                </div>
                {l.varer.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {l.varer.map((v) => (
                      <li key={v.varenr} className="text-xs text-muted-foreground">
                        <span className="font-mono">{v.varenr}</span> · {v.beskrivelse ?? "—"}{" "}
                        <span className="text-muted-foreground/80">
                          ({v.kunder} {v.kunder === 1 ? "butik køber" : "butikker køber"} varen)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {mangler.length === 0 && (
        <p className="text-sm text-muted-foreground mt-3">
          Butikken fører alle tetyper, som mindst 10 % af sammenlignelige butikker køber.
        </p>
      )}

      {ukendt > 0 && (
        <p className="text-xs text-muted-foreground/80 mt-3">
          {ukendt} {ukendt === 1 ? "linje kan" : "linjer kan"} ikke typebestemmes —{" "}
          <Link to="/admin/tilbudskatalog" className="underline hover:text-muted-foreground">
            sæt tetype i Tilbudskataloget
          </Link>
        </p>
      )}
    </Card>
  );
}
