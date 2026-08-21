import { Badge } from "@/components/ui/badge";
import { useAfdeling } from "@/contexts/afdeling-context";

/**
 * Diskret afdelingsnavn på kundekort og maskinkort. Ingen farvekodning —
 * kun en neutral label så det er tydeligt hvilken forretning posten hører til.
 */
export function AfdelingBadge({
  afdelingNr,
  className,
}: {
  afdelingNr: number | null | undefined;
  className?: string;
}) {
  const { navnFor, hasMultiple } = useAfdeling();
  // Brugere med præcis én afdeling ser ingen ændring i UI.
  if (afdelingNr == null || !hasMultiple) return null;

  return (
    <Badge variant="outline" className={`font-normal text-muted-foreground ${className ?? ""}`}>
      {navnFor(afdelingNr)}
    </Badge>
  );
}
