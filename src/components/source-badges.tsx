import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const META: Record<string, { label: string; className: string }> = {
  visma: {
    label: "Visma-kunde",
    className: "bg-primary/10 text-primary border-primary/30",
  },
  cvr: {
    label: "CVR-beriget",
    className: "bg-muted text-muted-foreground border-border",
  },
  manuel: {
    label: "Manuelt oprettet",
    className: "bg-success/10 text-success border-success/30",
  },
};

export function SourceBadges({
  sources,
  size = "default",
}: {
  sources: string[] | null | undefined;
  size?: "default" | "sm";
}) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {sources.map((s) => {
        const m = META[s] ?? { label: s, className: "" };
        return (
          <Badge
            key={s}
            variant="outline"
            className={cn(m.className, size === "sm" && "text-[10px] py-0 px-1.5")}
          >
            {m.label}
          </Badge>
        );
      })}
    </div>
  );
}
