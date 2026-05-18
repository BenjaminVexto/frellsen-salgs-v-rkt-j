import { Info, HelpCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type CustomerStatusKey =
  | "aktiv_kunde"
  | "sovende_kunde"
  | "tidligere_kunde"
  | "nyt_emne"
  | "ikke_tildelt";

export const CUSTOMER_STATUS_DEFS: Record<
  CustomerStatusKey,
  { label: string; emoji: string; short: string; long: string }
> = {
  aktiv_kunde: {
    label: "Aktiv kunde",
    emoji: "✅",
    short: "købt inden for 6 mdr.",
    long: "Har købt inden for de seneste 6 måneder.",
  },
  sovende_kunde: {
    label: "Sovende kunde",
    emoji: "💤",
    short: "købt for 6-18 mdr. siden",
    long: "Har købt hos Frellsen, men ikke inden for de seneste 6-18 måneder. Kender os — men er ikke i aktiv dialog.",
  },
  tidligere_kunde: {
    label: "Tidligere kunde",
    emoji: "📦",
    short: "ikke købt i 18+ mdr.",
    long: "Har købt hos Frellsen, men ikke inden for de seneste 18 måneder. Relationen er sandsynligvis kold og skal genopbygges.",
  },
  nyt_emne: {
    label: "Nyt emne",
    emoji: "🌱",
    short: "ingen købshistorik",
    long: "Ingen kendt købshistorik hos Frellsen. Potentiel ny kunde.",
  },
  ikke_tildelt: {
    label: "Ikke tildelt",
    emoji: "⚪",
    short: "endnu ikke tildelt sælger",
    long: "Virksomheden er importeret men endnu ikke tildelt en sælger eller kontaktliste.",
  },
};

export function CustomerStatusInfoIcon({ type }: { type: string }) {
  const def = CUSTOMER_STATUS_DEFS[type as CustomerStatusKey];
  if (!def) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center text-muted-foreground hover:text-foreground"
            aria-label={`Hvad betyder ${def.label}?`}
          >
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <span className="font-medium">
            {def.emoji} {def.label}
          </span>
          <br />
          {def.long}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function CustomerStatusBadge({
  type,
  variant = "secondary",
  className,
}: {
  type: string;
  variant?: "default" | "secondary" | "outline" | "destructive";
  className?: string;
}) {
  const def = CUSTOMER_STATUS_DEFS[type as CustomerStatusKey];
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={variant} className={className}>
        {def?.label ?? type}
      </Badge>
      <CustomerStatusInfoIcon type={type} />
    </span>
  );
}

export function CustomerStatusLegend({ className }: { className?: string }) {
  const items: CustomerStatusKey[] = [
    "aktiv_kunde",
    "sovende_kunde",
    "tidligere_kunde",
    "nyt_emne",
  ];
  return (
    <div
      className={
        "rounded-md border bg-muted/40 p-3 text-xs space-y-1.5 " + (className ?? "")
      }
    >
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <Info className="h-3.5 w-3.5" /> Sådan beregnes kundestatus:
      </div>
      <ul className="space-y-0.5 text-muted-foreground">
        {items.map((k) => {
          const d = CUSTOMER_STATUS_DEFS[k];
          return (
            <li key={k}>
              <span className="mr-1">{d.emoji}</span>
              <span className="text-foreground font-medium">{d.label}</span>
              {" — "}
              {d.short}
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground pt-1 border-t border-border/50">
        Baseret på "Sidste varekøb" fra Visma.
      </p>
    </div>
  );
}

export function CustomerStatusHelpButton({ label = "Kundestatus" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="h-3.5 w-3.5 mr-1" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kundestatus — definitioner</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {(
              [
                "aktiv_kunde",
                "sovende_kunde",
                "tidligere_kunde",
                "nyt_emne",
                "ikke_tildelt",
              ] as CustomerStatusKey[]
            ).map((k) => {
              const d = CUSTOMER_STATUS_DEFS[k];
              return (
                <div key={k} className="border-l-2 border-primary/40 pl-3">
                  <div className="font-medium">
                    {d.emoji} {d.label}
                  </div>
                  <p className="text-muted-foreground text-xs mt-0.5">{d.long}</p>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground pt-2 border-t">
              Statusserne beregnes automatisk ud fra "Sidste varekøb" importeret fra Visma.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
