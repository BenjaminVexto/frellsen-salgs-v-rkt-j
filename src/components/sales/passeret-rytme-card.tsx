import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Clock, Loader2 } from "lucide-react";
import { getPasseretRytme } from "@/lib/forbrug-signal.functions";
import { useViewAs } from "@/contexts/view-as-context";
import { useAfdeling } from "@/contexts/afdeling-context";

function intervalTekst(dage: number): string {
  if (dage >= 60) return `ca. hver ${Math.round(dage / 30)}. måned`;
  if (dage >= 21) return `ca. hver ${Math.round(dage / 7)}. uge`;
  return `ca. hver ${Math.max(1, Math.round(dage))}. dag`;
}

/** Tidlig advarsel — kræver ingen år-før-data. */
export function PasseretRytmeCard({ teamScope = false }: { teamScope?: boolean } = {}) {
  const fetchFn = useServerFn(getPasseretRytme);
  const { viewAsUserId } = useViewAs();
  const { afdelingFilter } = useAfdeling();
  const q = useQuery({
    queryKey: ["passeret-rytme", viewAsUserId, teamScope, afdelingFilter],
    queryFn: () => fetchFn({ data: { viewAsUserId, teamScope, afdelingNr: afdelingFilter } }),
  });

  const customers = (q.data?.customers ?? []).slice(0, 8);

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 mb-3">
        <div className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center bg-warning/15 text-warning-foreground">
          <Clock className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-semibold leading-tight truncate">
            Passeret deres rytme denne uge
          </h2>
          <p className="text-xs text-muted-foreground">
            Skulle have bestilt nu — endnu ikke gået stille.
          </p>
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : customers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          Ingen kunder har passeret deres rytme lige nu.
        </p>
      ) : (
        <div>
          {customers.map((c) => (
            <Link
              key={c.company_id}
              to="/virksomheder/$id"
              params={{ id: c.company_id }}
              className="block py-2 border-b border-border last:border-0 hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
            >
              <div className="text-sm font-medium truncate">
                {c.navn}
                {c.by ? <span className="text-muted-foreground font-normal"> · {c.by}</span> : null}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                {c.dage_siden_koeb != null ? `${c.dage_siden_koeb} dage siden køb` : "ukendt"}
                {c.forventet_interval_dage != null
                  ? ` · normalt ${intervalTekst(c.forventet_interval_dage)}`
                  : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
