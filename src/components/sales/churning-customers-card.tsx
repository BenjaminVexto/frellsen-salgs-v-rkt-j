import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, X, ChevronDown } from "lucide-react";
import { getFaldendeKunder } from "@/lib/forbrug-signal.functions";
import { fmtKr } from "@/lib/sales-utils";
import { aarsagLabel, erFaldKlasse } from "@/lib/forbrug-labels";
import { dageSiden, statusFraSignal } from "@/lib/kunde-status";
import { DismissChurnDialog } from "./dismiss-churn-dialog";
import { useViewAs } from "@/contexts/view-as-context";
import { useAfdeling } from "@/contexts/afdeling-context";
import { MutationGate } from "@/components/mutation-gate";

const SIDE = 20;

export function ChurningCustomersCard({
  teamScope = false,
}: { initialVisible?: number; teamScope?: boolean } = {}) {
  const fetchFn = useServerFn(getFaldendeKunder);
  const { viewAsUserId } = useViewAs();
  const { afdelingFilter } = useAfdeling();
  const q = useQuery({
    queryKey: ["faldende-kunder", viewAsUserId, teamScope, afdelingFilter],
    queryFn: () => fetchFn({ data: { viewAsUserId, teamScope, afdelingNr: afdelingFilter } }),
  });

  const [dismiss, setDismiss] = useState<{ id: string; name: string } | null>(null);
  const [limit, setLimit] = useState(SIDE);

  const loading = q.isLoading;
  const customers = q.data?.customers ?? [];
  const hasData = q.data?.hasData ?? false;
  const count = customers.length;
  const tabtKrTotal = customers.reduce((s, c) => s + (c.tabt_kr_pr_mdr ?? 0), 0);
  const visible = customers.slice(0, limit);

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 mb-3 md:mb-4">
        <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-md flex items-center justify-center bg-destructive/15 text-destructive">
          <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-semibold text-foreground leading-tight truncate">
            Dine mest kritiske kunder
          </h2>
          <p className="text-xs text-muted-foreground">
            {loading
              ? "Henter…"
              : `${count} ${count === 1 ? "kunde" : "kunder"}${
                  tabtKrTotal > 0 ? ` · -${fmtKr(tabtKrTotal)}/md` : ""
                } · sorteret efter tabte kroner`}
          </p>
        </div>
      </div>

      <div className="min-h-[60px]">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !hasData ? (
          <p className="text-sm text-muted-foreground py-2">
            Ingen salgshistorik endnu — aktiveres når data er importeret.
          </p>
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Ingen kritiske kunder lige nu — godt arbejde 🌱
          </p>
        ) : (
          <div>
            {visible.map((c) => {
              const dage = dageSiden(c.sidste_koeb_primaer);
              const status = statusFraSignal({
                harFald: erFaldKlasse(c.klasse_primaer),
                dageSidenKoeb: dage,
                forventetIntervalDage:
                  c.forventet_interval_mdr != null ? c.forventet_interval_mdr * 30.4 : null,
              });
              const aarsag = aarsagLabel(c.aarsag_primaer);
              const tabt3 = c.tabt_kr_pr_mdr != null ? c.tabt_kr_pr_mdr * 3 : null;
              return (
                <div
                  key={c.company_id}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
                >
                  <Link to="/virksomheder/$id" params={{ id: c.company_id }} className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">
                      {c.navn}
                      {c.by ? <span className="text-muted-foreground font-normal"> · {c.by}</span> : null}
                    </div>
                    <div className="text-xs mt-0.5">
                      <span
                        className={
                          status.tone === "rod"
                            ? "text-destructive font-medium"
                            : status.tone === "gul"
                              ? "text-warning-foreground font-medium"
                              : "text-muted-foreground"
                        }
                      >
                        {status.label}
                      </span>
                      {aarsag ? <span className="text-muted-foreground"> · {aarsag}</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5 tabular-nums">
                      {c.tabt_kr_pr_mdr != null ? `-${fmtKr(c.tabt_kr_pr_mdr)}/mdr` : "—"}
                      {tabt3 != null ? ` · ca. -${fmtKr(tabt3)} over 3 mdr.` : ""}
                      {dage != null ? ` · ${dage} dage siden sidste forbrugskøb` : " · intet forbrugskøb"}
                    </div>
                  </Link>
                  <MutationGate>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDismiss({ id: c.company_id, name: c.navn });
                      }}
                      aria-label="Fjern fra listen"
                    >
                      <X className="h-3.5 w-3.5 sm:mr-1" />
                      <span className="hidden sm:inline">Fjern / markér</span>
                    </Button>
                  </MutationGate>
                </div>
              );
            })}
            {count > limit && (
              <button
                type="button"
                onClick={() => setLimit((v) => v + SIDE)}
                className="mt-2 w-full flex items-center justify-center gap-1 text-xs font-medium text-primary hover:underline py-2"
              >
                Hent {Math.min(SIDE, count - limit)} flere ({limit} af {count})
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {dismiss && (
        <DismissChurnDialog
          open={!!dismiss}
          onOpenChange={(v) => !v && setDismiss(null)}
          companyId={dismiss.id}
          companyName={dismiss.name}
        />
      )}
    </Card>
  );
}
