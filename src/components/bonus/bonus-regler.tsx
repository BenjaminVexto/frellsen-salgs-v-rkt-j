import { useEffect } from "react";
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
  maskiner: "500 kr. pr. Wittenborg/Animo og 750 kr. pr. Rex-Royal sat ud på salg eller leje. Udskiftning tæller kun ved salg uden tilbagekøb eller ny lejekontrakt med min. 2 års binding.",
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
                <p>Du får bonus for hver kaffemaskine, der sættes ud på en af dine lokationer – på salg eller leje:</p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["Wittenborg / Gaggia G300", "500 kr."],
                      ["Animo (inkl. OptiVend fra sep. 2026)", "500 kr."],
                      ["Rex-Royal", "750 kr."],
                    ] as const
                  ).map(([navn, sats]) => (
                    <div key={navn} className="rounded-md border bg-muted/40 px-2 py-2 text-xs leading-snug text-center">
                      <span className="block font-medium">{navn}</span>
                      <span className="block tabular-nums">{sats}</span>
                    </div>
                  ))}
                </div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Maskinen tilhører sælgeren på lokationen – også ved kæde- og koncernaftaler.</li>
                  <li>
                    <span className="font-semibold">Udskiftning:</span> Salg giver bonus, medmindre Frellsen betaler for den gamle maskine. Leje giver kun bonus ved ny lejekontrakt med min. 2 års binding.
                  </li>
                  <li>
                    <span className="font-semibold">Tæller ikke:</span> tilbehør, vandkølere, andre mærker og maskiner, kunden overtager efter leje.
                  </li>
                </ul>
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
