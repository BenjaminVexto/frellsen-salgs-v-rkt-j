import { Badge } from "@/components/ui/badge";
import { udledRingelisteMaerke, type RingelisteInfo } from "@/lib/ringeliste-maerke";

/** Udledt ringeliste-mærkat — vises ved siden af kundetype-mærket. */
export function RingelisteBadge({ info, className }: { info: RingelisteInfo | null | undefined; className?: string }) {
  const m = info ? udledRingelisteMaerke(info) : null;
  if (!m) return null;
  return (
    <Badge
      variant={m.graa ? "secondary" : m.booket ? "default" : "outline"}
      title={m.tooltip || undefined}
      className={className}
    >
      {m.tekst}
    </Badge>
  );
}
