import { Building } from "lucide-react";
import { useAfdeling } from "@/contexts/afdeling-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Afdelingsvælger — vises KUN for brugere med adgang til mere end én afdeling.
 * Filteret er rent kosmetisk; adgangskontrollen ligger i RLS/my_afdelinger().
 */
export function AfdelingVaelger({ className }: { className?: string }) {
  const { hasMultiple, afdelinger, selected, setSelected } = useAfdeling();
  if (!hasMultiple || afdelinger.length === 0) return null;

  return (
    <div className={className}>
      <Select
        value={String(selected)}
        onValueChange={(v) => setSelected(v === "alle" ? "alle" : Number(v))}
      >
        <SelectTrigger className="h-9 w-full border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">
          <span className="flex items-center gap-2 truncate">
            <Building className="h-4 w-4 shrink-0 opacity-70" />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="alle">Alle mine afdelinger</SelectItem>
          {afdelinger.map((a) => (
            <SelectItem key={a.afdeling_nr} value={String(a.afdeling_nr)}>
              {a.afdeling_nr} — {a.navn}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
