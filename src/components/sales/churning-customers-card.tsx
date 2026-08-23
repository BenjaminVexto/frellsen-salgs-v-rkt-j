import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingDown, Loader2, X, ChevronDown, ChevronUp } from "lucide-react";
import { getFaldendeKunder } from "@/lib/forbrug-signal.functions";
import { fmtKr } from "@/lib/sales-utils";
import { klasseLabel, aarsagLabel, erFaldKlasse } from "@/lib/forbrug-labels";
import { DismissChurnDialog } from "./dismiss-churn-dialog";
import { useViewAs } from "@/contexts/view-as-context";
import { useAfdeling } from "@/contexts/afdeling-context";
import { MutationGate } from "@/components/mutation-gate";

function overskrift(row: {
  klasse_primaer: string | null;
  afvigelse_pct_primaer: number | null;
  grupper_i_fald: number;
}): string {
  if (erFaldKlasse(row.klasse_primaer)) {
    const pct =
      row.afvigelse_pct_primaer != null
        ? ` (${row.afvigelse_pct_primaer > 0 ? "+" : ""}${row.afvigelse_pct_primaer.toLocaleString("da-DK")} %)`
        : "";
    return `Kaffe: ${klasseLabel(row.klasse_primaer)}${pct}`;
  }
  if (row.klasse_primaer && row.grupper_i_fald > 0) {
    return `Kaffe stabil — men ${row.grupper_i_fald} ${
      row.grupper_i_fald === 1 ? "anden gruppe falder" : "andre grupper falder"
    }`;
  }
  if (!row.klasse_primaer) {
    return `${row.grupper_i_fald} ${row.grupper_i_fald === 1 ? "produktgruppe" : "produktgrupper"} i fald`;
  }
  return klasseLabel(row.klasse_primaer);
}

export function ChurningCustomersCard({
  initialVisible = 2,
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
  const [expanded, setExpanded] = useState(false);

  const loading = q.isLoading;
  const customers = q.data?.customers ?? [];
  const hasData = q.data?.hasData ?? false;
  const count = customers.length;
  const tabtKrTotal = customers.reduce((s, c) => s + (c.tabt_kr_pr_mdr ?? 0), 0);
  const visible = expanded ? customers : customers.slice(0, initialVisible);
  const hiddenCount = Math.max(0, count - initialVisible);

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-md flex items-center justify-center bg-warning/15 text-warning-foreground">
            <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-foreground leading-tight truncate">
              Faldende forbrug
            </h2>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Henter…"
                : `${count} ${count === 1 ? "kunde" : "kunder"}${
                    tabtKrTotal > 0 ? ` · -${fmtKr(tabtKrTotal)}/md` : ""
                  }`}
            </p>
          </div>
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
            Intet faldende forbrug lige nu — godt arbejde 🌱
          </p>
        ) : (
          <div>
            {visible.map((c) => {
              const aarsag = aarsagLabel(c.aarsag_primaer);
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
                    <div className="text-xs text-foreground/80 truncate mt-0.5">{overskrift(c)}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5 tabular-nums">
                      {c.tabt_kg_pr_mdr != null
                        ? `-${c.tabt_kg_pr_mdr.toLocaleString("da-DK", { maximumFractionDigits: 1 })} kg/mdr`
                        : "—"}
                      {c.tabt_kr_pr_mdr != null ? ` · -${fmtKr(c.tabt_kr_pr_mdr)}/mdr` : ""}
                      {aarsag ? ` · ${aarsag}` : ""}
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
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 w-full flex items-center justify-center gap-1 text-xs font-medium text-primary hover:underline py-2"
              >
                {expanded ? (
                  <>Vis færre <ChevronUp className="h-3.5 w-3.5" /></>
                ) : (
                  <>Se alle {count} <ChevronDown className="h-3.5 w-3.5" /></>
                )}
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
