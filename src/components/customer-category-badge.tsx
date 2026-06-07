import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CustomerCategoryBadge({
  category,
  size = "default",
  className,
}: {
  category: string | null | undefined;
  size?: "default" | "sm";
  className?: string;
}) {
  if (!category) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "bg-muted/50 text-foreground border-border font-normal",
        size === "sm" && "text-[10px] py-0 px-1.5",
        className,
      )}
    >
      {category}
    </Badge>
  );
}
