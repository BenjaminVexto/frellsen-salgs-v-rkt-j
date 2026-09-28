import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseSegment3 } from "@/lib/customer-segment-mapping";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Segment-badge udledt af kundesegment 3 (samme kode-parser som kategorireglen):
 * 40 → "Udbud" (lås), 45 → "Offentlig aftale", alle andre → ingen badge.
 */
export function SegmentBadge({
  segment3,
  size = "default",
  className,
}: {
  segment3: string | null | undefined;
  size?: "default" | "sm";
  className?: string;
}) {
  const { code } = parseSegment3(segment3);
  if (code !== "40" && code !== "45") return null;
  const cls = cn(
    "gap-1 font-medium bg-muted text-muted-foreground border-border",
    size === "sm" && "text-[10px] py-0 px-1.5",
    className,
  );
  if (code === "45") {
    return (
      <Badge variant="outline" className={cls}>
        Offentlig aftale
      </Badge>
    );
  }
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn(cls, "bg-secondary text-secondary-foreground cursor-help")}>
            <Lock className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
            Udbud
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Priser og sortiment følger udbudskontrakt
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
