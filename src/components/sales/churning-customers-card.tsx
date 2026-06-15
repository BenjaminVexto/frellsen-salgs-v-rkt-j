import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingDown, Loader2, X, ChevronDown, ChevronUp } from "lucide-react";
import { getMyChurningCustomers } from "@/lib/sales.functions";
import { fmtKr } from "@/lib/sales-utils";
import { DismissChurnDialog } from "./dismiss-churn-dialog";
import { useViewAs } from "@/contexts/view-as-context";
import { MutationGate } from "@/components/mutation-gate";

export function ChurningCustomersCard({
  initialVisible = 2,
  teamScope = false,
}: { initialVisible?: number; teamScope?: boolean } = {}) {
  const fetchFn = useServerFn(getMyChurningCustomers);
  const { viewAsUserId } = useViewAs();
  const q = useQuery({
    queryKey: ["my-churning", viewAsUserId, teamScope],
    queryFn: () => fetchFn({ data: { viewAsUserId, teamScope } }),
  });


  const [dismiss, setDismiss] = useState<{ id: string; name: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loading = q.isLoading;
  const customers = q.data?.customers ?? [];
  const hasData = q.data?.hasData ?? false;
  const count = customers.length;
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
              Kunder på vej væk
            </h2>
            <p className="text-xs text-muted-foreground">
              {loading ? "Henter…" : `${count} ${count === 1 ? "kunde" : "kunder"}`}
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
            Ingen kunder på vej væk lige nu — godt arbejde 🌱
          </p>
        ) : (
          <div>
            {visible.map((c) => (
              <div
                key={c.company_id}
                className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
              >
                <Link
                  to="/virksomheder/$id"
                  params={{ id: c.company_id }}
                  className="min-w-0 flex-1"
                >
                  <div className="text-sm font-medium text-foreground truncate">
                    {c.company_name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    intet køb i {c.daysSinceLastPurchase} dage · før: ~{fmtKr(c.monthlyAverageRevenue)}/md
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
                      setDismiss({ id: c.company_id, name: c.company_name });
                    }}
                    aria-label="Fjern fra listen"
                  >
                    <X className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Fjern / markér</span>
                  </Button>
                </MutationGate>

              </div>
            ))}
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
