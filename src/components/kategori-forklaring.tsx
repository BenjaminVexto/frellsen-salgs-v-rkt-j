import { useState } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FORHANDLING_HJAELP, KUNDEGRUPPE_LABEL } from "@/lib/customer-segment-mapping";

/** Forklaringer pr. kategorinavn — vises som tooltip, aldrig som ekstra linje i tabellen. */
export const KATEGORI_FORKLARING: Record<string, string> = {
  [KUNDEGRUPPE_LABEL.privat]: FORHANDLING_HJAELP,
};

/** Lille info-ikon med forklaring: hover på desktop, tryk på touch. Ingen forklaring → intet. */
export function KategoriForklaring({ label }: { label: string }) {
  const tekst = KATEGORI_FORKLARING[label];
  const [aaben, setAaben] = useState(false);
  if (!tekst) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={aaben} onOpenChange={setAaben}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Forklaring: ${label}`}
            className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); setAaben((v) => !v); }}
          >
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{tekst}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
