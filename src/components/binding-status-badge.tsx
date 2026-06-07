import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BINDING_LABEL, type BindingStatus } from "@/lib/customer-segment-mapping";

export function BindingStatusBadge({
  status,
  size = "default",
  className,
}: {
  status: string | null | undefined;
  size?: "default" | "sm";
  className?: string;
}) {
  if (!status) return null;
  const s = status as BindingStatus;
  const label = BINDING_LABEL[s];
  if (!label) return null;

  const toneClass =
    s === "offentlig_aftale"
      ? "bg-destructive/15 text-destructive border-destructive/40"
      : s === "frit_salg"
        ? "bg-success/10 text-success border-success/30"
        : "bg-muted text-muted-foreground border-border";

  return (
    <Badge
      variant="outline"
      className={cn(
        toneClass,
        "gap-1 font-medium",
        size === "sm" && "text-[10px] py-0 px-1.5",
        className,
      )}
    >
      {s === "offentlig_aftale" && (
        <AlertTriangle className={cn(size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")} />
      )}
      {label}
    </Badge>
  );
}
