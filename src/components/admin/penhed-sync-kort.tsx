import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import {
  queuePenhedSync,
  getPenhedSyncStatus,
} from "@/lib/cvr-penhed-sync.functions";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  processing: "secondary",
  done: "default",
  failed: "destructive",
};

export function PenhedSyncKort() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getPenhedSyncStatus);
  const queueFn = useServerFn(queuePenhedSync);
  const [queueing, setQueueing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["penhed-sync-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 15000,
  });

  const mutation = useMutation({
    mutationFn: () => queueFn(),
    onMutate: () => setQueueing(true),
    onSettled: () => setQueueing(false),
    onSuccess: (res: any) => {
      toast.success(
        `${res.jobs} job(s) oprettet for ${res.cvrs} CVR-numre`,
      );
      qc.invalidateQueries({ queryKey: ["penhed-sync-status"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunne ikke lægge i kø"),
  });

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="font-semibold">CVR-produktionsenheder</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Synkronisér P-enheder for aktive og sovende erhvervskunder
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={queueing}
        >
          {queueing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Synkronisér CVR P-enheder
        </Button>
      </div>

      {isLoading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {([
              ["Afventer", data?.pending ?? 0],
              ["Kører", data?.processing ?? 0],
              ["Færdige", data?.done ?? 0],
              ["Fejlet", data?.failed ?? 0],
              ["P-enheder", data?.synced ?? 0],
            ] as [string, number][]).map(([label, val]) => (
              <div key={label} className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-lg font-semibold">{val}</div>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {(data?.latest ?? []).map((j) => (
              <div
                key={j.id}
                className="flex items-center justify-between gap-2 text-xs border-b last:border-0 py-1.5"
              >
                <span className="text-muted-foreground">
                  {new Date(j.created_at).toLocaleString("da-DK")}
                </span>
                <span>{j.cvr_count} CVR</span>
                <span>{j.synced_count} P-enh.</span>
                <Badge variant={STATUS_VARIANT[j.status] ?? "outline"}>
                  {j.status}
                </Badge>
              </div>
            ))}
            {!data?.latest?.length && (
              <p className="text-xs text-muted-foreground">Ingen jobs endnu.</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
