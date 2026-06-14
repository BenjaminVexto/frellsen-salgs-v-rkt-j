import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, FileText, Loader2, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  fetchExpiringMachines,
  type ExpiringMachineDetail,
} from "@/lib/expiring-machines";

export const Route = createFileRoute("/_authenticated/aftaler-udlober")({
  component: AftalerUdloberPage,
  head: () => ({ meta: [{ title: "Kundeaftaler udløber — Frellsen" }] }),
});

function AftalerUdloberPage() {
  const auth = useAuth();
  const userId = auth.user?.id;
  const isAdmin = auth.role === "admin";

  const query = useQuery({
    enabled: !!userId,
    queryKey: ["dashboard-expiring-machines", userId, isAdmin],
    queryFn: () => fetchExpiringMachines(userId!, isAdmin),
  });

  const groups = query.data ?? [];
  const totalMachines = groups.reduce((n, g) => n + g.machines.length, 0);

  return (
    <div className="px-3 sm:px-4 md:px-8 py-4 sm:py-6 md:py-8 max-w-4xl mx-auto pb-24 md:pb-8">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Tilbage til Mit overblik
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-md flex items-center justify-center bg-warning/15 text-warning-foreground">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">
            Nuværende kunder – aftaler udløber
          </h1>
          <p className="text-sm text-muted-foreground">
            Binding eller service efter regning inden for 90 dage
          </p>
        </div>
      </div>

      {query.isLoading ? (
        <Card className="p-6 mt-4">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </Card>
      ) : groups.length === 0 ? (
        <Card className="p-6 mt-4">
          <p className="text-sm text-muted-foreground py-4 text-center">
            Ingen kundeaftaler udløber inden for 90 dage.
          </p>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mt-4 mb-3">
            {groups.length} {groups.length === 1 ? "kunde" : "kunder"} ·{" "}
            {totalMachines} {totalMachines === 1 ? "maskine" : "maskiner"}
          </p>
          <div className="space-y-4">
            {groups.map((g) => (
              <CompanyGroup key={g.companyId} group={g} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CompanyGroup({
  group,
}: {
  group: {
    companyId: string;
    companyName: string;
    earliestDate: string;
    machines: ExpiringMachineDetail[];
  };
}) {
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <Link
          to="/virksomheder/$id"
          params={{ id: group.companyId }}
          className="font-semibold text-foreground hover:underline truncate"
        >
          {group.companyName}
        </Link>
        <span className="text-xs text-muted-foreground shrink-0">
          {group.machines.length}{" "}
          {group.machines.length === 1 ? "maskine" : "maskiner"}
        </span>
      </div>
      <ul className="divide-y border-t">
        {group.machines.map((m) => (
          <MachineRow key={`${m.locationId}-${m.serienr}`} machine={m} />
        ))}
      </ul>
    </Card>
  );
}

function MachineRow({ machine: m }: { machine: ExpiringMachineDetail }) {
  const days = Math.ceil((parseISO(m.date).getTime() - Date.now()) / 86400000);
  const tone: "destructive" | "warning" | "success" =
    days < 30 ? "destructive" : days <= 60 ? "warning" : "success";
  const toneCls =
    tone === "destructive"
      ? "bg-destructive/10 text-destructive"
      : tone === "warning"
        ? "bg-warning/15 text-warning-foreground"
        : "bg-success/10 text-success";
  const dateLabel = format(parseISO(m.date), "d. MMM yyyy", { locale: da });
  const typeLabel = m.type === "binding" ? "Binding" : "Service → efter regning";
  const addressLine = [m.locationAddress, [m.locationZip, m.locationCity].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const machineTitle = m.machineType || "Maskine";

  return (
    <li>
      <Link
        to="/virksomheder/$id"
        params={{ id: m.companyId }}
        hash={`location-${m.locationId}`}
        className="flex items-start justify-between gap-3 py-3 hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">
              {machineTitle}
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              {m.serienr}
            </Badge>
            <Badge
              variant="secondary"
              className="text-[10px]"
            >
              {typeLabel}
            </Badge>
          </div>
          {(addressLine || m.subLocation) && (
            <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {addressLine || "Lokation"}
                {m.subLocation ? ` · ${m.subLocation}` : ""}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap ${toneCls}`}
          >
            {dateLabel}
          </span>
          <ArrowRight className="hidden sm:block h-4 w-4 text-muted-foreground" />
        </div>
      </Link>
    </li>
  );
}
