import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { getMyNewActivitiesList } from "@/lib/sales.functions";
import { labelFor, getActivityType } from "@/lib/activity-types";
import { useViewAs } from "@/contexts/view-as-context";

export function MonthActivitiesDialog({
  open,
  onOpenChange,
  teamScope,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamScope: boolean;
}) {
  const listFn = useServerFn(getMyNewActivitiesList);
  const { viewAsUserId } = useViewAs();
  const [seller, setSeller] = useState<string>("all");

  const q = useQuery({
    queryKey: ["my-month-activities-list", viewAsUserId, teamScope],
    queryFn: () => listFn({ data: { viewAsUserId, teamScope } }),
    enabled: open,
  });

  const rows = q.data?.rows ?? [];

  const sellers = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.created_by) map.set(r.created_by, r.created_by_name || "Ukendt sælger");
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "da"));
  }, [rows]);

  const filtered = useMemo(
    () => (seller === "all" ? rows : rows.filter((r) => r.created_by === seller)),
    [rows, seller],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Aktiviteter denne måned</DialogTitle>
          <DialogDescription>
            {filtered.length} {filtered.length === 1 ? "aktivitet" : "aktiviteter"}
            {seller !== "all" ? " for valgt sælger" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Select value={seller} onValueChange={setSeller}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Alle sælgere" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle sælgere ({rows.length})</SelectItem>
              {sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({rows.filter((r) => r.created_by === s.id).length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-y-auto -mx-2 px-2 divide-y">
          {q.isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!q.isLoading && filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Ingen aktiviteter i denne måned
            </div>
          )}
          {filtered.map((r) => {
            const def = getActivityType(r.activity_type);
            const Icon = def?.Icon;
            return (
              <div key={r.id} className="py-3 flex gap-3">
                <div
                  className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${def?.bg ?? "bg-muted"}`}
                >
                  {Icon ? <Icon className={`h-4 w-4 ${def?.color ?? ""}`} /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium">{labelFor(r.activity_type)}</span>
                    <span className="text-muted-foreground">·</span>
                    <Link
                      to="/virksomheder/$id"
                      params={{ id: r.company_id }}
                      className="text-primary hover:underline truncate"
                      onClick={() => onOpenChange(false)}
                    >
                      {r.company_name ?? "Ukendt virksomhed"}
                    </Link>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(r.created_at).toLocaleString("da-DK", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {r.created_by_name ? ` · ${r.created_by_name}` : ""}
                  </div>
                  {r.note && (
                    <div className="text-xs mt-1 line-clamp-2 text-foreground/80">{r.note}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
