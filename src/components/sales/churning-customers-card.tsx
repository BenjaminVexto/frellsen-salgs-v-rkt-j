import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { TrendingDown, Loader2 } from "lucide-react";
import { getMyChurningCustomers } from "@/lib/sales.functions";
import { fmtKr } from "@/lib/sales-utils";

export function ChurningCustomersCard() {
  const fetchFn = useServerFn(getMyChurningCustomers);
  const q = useQuery({ queryKey: ["my-churning"], queryFn: () => fetchFn({}) });

  const loading = q.isLoading;
  const customers = q.data?.customers ?? [];
  const hasData = q.data?.hasData ?? false;
  const count = customers.length;

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md flex items-center justify-center bg-warning/15 text-warning-foreground">
            <TrendingDown className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground leading-tight">
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
            {customers.map((c) => (
              <Link
                key={c.company_id}
                to="/virksomheder/$id"
                params={{ id: c.company_id }}
                className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {c.company_name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    intet køb i {c.daysSinceLastPurchase} dage · før: ~{fmtKr(c.monthlyAverageRevenue)}/md
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
