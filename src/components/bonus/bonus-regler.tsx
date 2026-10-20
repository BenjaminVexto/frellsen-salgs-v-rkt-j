import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Info } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { type BonusOrdning } from "@/lib/bonus-ordning";

export type ReglerAfsnit = "top" | "db" | "maskiner" | "nykunde";

const tal = (n: number, dec = 0) =>
  Number(n).toLocaleString("da-DK", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** DB-provisionen i én sætning ud fra ordningen. */
export function dbProvisionTekst(o: BonusOrdning | null | undefined): string {
  if (!o) return "Der er ingen bonusordning registreret for dig.";
  if (o.flatrate != null) return `Du er på fast månedlig provision på ${tal(Number(o.flatrate))} kr.`;
  const pct = Number(o.db_provision_pct) || 0;
  if (pct <= 0) return "Din ordning giver ingen DB-provision.";
  let s = `${pct.toLocaleString("da-DK", { maximumFractionDigits: 2 })} % af DB på dine kunder`;
  if (o.db_fradrag != null && Number(o.db_fradrag) > 0) s += `, minus ${tal(Number(o.db_fradrag))} kr. pr. måned`;
  if (o.db_bund != null && Number(o.db_bund) > 0) s += ` – mindst ${tal(Number(o.db_bund))} kr. pr. måned`;
  return s + ".";
}

const RESUME: Record<"db" | "maskiner" | "nykunde", string> = {
  db: "Provision af DB på dine lokationer i Visma. Leje tæller med 100 % DB; maskinbelastning trækkes fra.",
  maskiner: "Bonus når du vinder en ny aftale via en maskine: fuld bonus for en ny maskine, 250 kr. for en brugt. Samme maskine hos samme kunde giver kun bonus én gang.",
  nykunde: "Største DB på nye kunder i måneden giver 1.000 kr., nummer to 600 kr.",
};

export function ReglerInfo({ afsnit, onAabn }: { afsnit: "db" | "maskiner" | "nykunde"; onAabn: (a: ReglerAfsnit) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Regler" className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground">
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-left text-sm font-normal space-y-2">
        <p>{RESUME[afsnit]}</p>
        <Button variant="link" className="h-auto p-0" onClick={() => onAabn(afsnit)}>Se alle regler</Button>
      </PopoverContent>
    </Popover>
  );
}

export function BonusRegler({ open, afsnit, ordning, onOpenChange }: { open: boolean; afsnit: ReglerAfsnit; ordning: BonusOrdning | null | undefined; onOpenChange: (o: boolean) => void }) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => document.getElementById(`bonusregel-${afsnit}`)?.scrollIntoView({ block: "start" }), 150);
    return () => clearTimeout(t);
  }, [open, afsnit]);
  const fast = ordning?.flatrate != null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader id="bonusregel-top" className="text-left">
          <SheetTitle>Sådan beregnes din bonus</SheetTitle>
          <SheetDescription>Bonus opgøres pr. måned ud fra fakturaer og maskinregistret i Visma.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6 text-sm">
          <section id="bonusregel-db" className="space-y-2 scroll-mt-4">
            <h3 className="font-semibold">DB-provision</h3>
            <p>{dbProvisionTekst(ordning)}</p>
            {!fast && (
              <p>DB tæller på de lokationer, du står på i Visma. Leje tæller med 100 % DB, og maskinbelastning trækkes fra.</p>
            )}
          </section>
          {fast ? (
            <p id="bonusregel-maskiner" className="text-muted-foreground">
              <span id="bonusregel-nykunde" />Maskinbonus og ny kunde-provision gælder ikke ved fast provision.
            </p>
          ) : (
            <>
              <section id="bonusregel-maskiner" className="space-y-2 scroll-mt-4">
                <h3 className="font-semibold">Maskinbonus</h3>
                <MaskinbonusRegler />
              </section>
              <section id="bonusregel-nykunde" className="space-y-2 scroll-mt-4">
                <h3 className="font-semibold">Ny kunde-provision <span className="font-normal text-muted-foreground">(fra sep. 2026)</span></h3>
                <p>Største DB på nye kunder i måneden: <span className="font-semibold">1.000 kr.</span> · Nummer to: <span className="font-semibold">600 kr.</span></p>
                <p>En ny kunde har ikke haft omsætning hos Frellsen de seneste 24 måneder. Offentlige udbudskunder tæller ikke med.</p>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const MASKINBONUS_PUNKTER = [
  "Ny maskine på salg eller leje: fuld bonus efter maskintype.",
  "Brugt maskine på salg eller leje: 250 kr., uanset model.",
  "Bonus gives for Wittenborg, Animo (bønne), Kalerm, Rex og espressomaskiner, der kører på Frellsens hele bønner eller VAC og har maskinservicekontrakt.",
  "Ingen bonus for instantmaskiner (inkl. OptiVend), friskvand, fritstående friskbryg, brygindsatser, fødevareautomater og udlånsmaskiner. Andre maskintyper giver kun bonus, hvis Benjamin har godkendt det, før aftalen indgås.",
  "Samme maskine hos samme kunde giver kun bonus én gang — også hvis en lejemaskine bliver solgt.",
  "Ombytning inden for 24 måneder, reklamationer og tekniske ombytninger giver ikke bonus. Det gør tilbagekøb heller ikke, hvor Frellsen betaler for den gamle maskine.",
  "Opgradering efter 24 måneder til en anden/større model på en ny aftale med mindst 2 års binding kan give bonus efter godkendelse.",
  "Bonus følger lokationen — ikke hvem der forhandlede aftalen.",
];

/** Fast regeltekst for maskinbonus (besluttet 20/10-2026). */
export function MaskinbonusRegler() {
  return (
    <>
      <p className="font-medium">Maskinbonus — sådan virker det</p>
      <p>Du får maskinbonus, når du vinder en ny aftale med kunden via en maskine.</p>
      <ul className="list-disc pl-5 space-y-1">
        {MASKINBONUS_PUNKTER.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </>
  );
}

export function MaskinbonusBoks() {
  const [aaben, setAaben] = useState(false);
  return (
    <Collapsible open={aaben} onOpenChange={setAaben} className="rounded-md border">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full min-h-11 items-center justify-between px-3 py-2 text-sm font-medium">
          Sådan beregnes maskinbonus
          <ChevronDown className={`h-4 w-4 transition-transform ${aaben ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-3 pb-3 text-sm">
        <MaskinbonusRegler />
      </CollapsibleContent>
    </Collapsible>
  );
}
