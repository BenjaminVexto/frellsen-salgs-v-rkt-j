import { useEffect } from "react";
import { Info } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { beskrivOrdning, type BonusOrdning } from "@/lib/bonus-ordning";

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
  db: "Provision af DB på de lokationer, du er ansvarlig for i Visma. Leje medregnes med 100 % DB; maskinbelastning trækkes fra.",
  maskiner: "Bonus pr. kaffemaskine sat ud på dine lokationer (salg eller leje): Wittenborg 500 kr., Animo 500 kr., Rex-Royal 750 kr. Tilbehør og overtagelser tæller ikke.",
  nykunde: "Største samlede DB på nye kunder i måneden giver 1.000 kr., nummer to 600 kr. Ny = ingen omsætning de foregående 24 måneder.",
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
          <SheetDescription>Bonus opgøres pr. hel måned ud fra fakturaer og maskinregistret i Visma. Visma er altid grundlaget.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6 text-sm">
          {ordning && (
            <section className="space-y-2">
              <h3 className="font-semibold">Din bonusordning</h3>
              <p>{beskrivOrdning(ordning)}</p>
            </section>
          )}
          <section id="bonusregel-db" className="space-y-2 scroll-mt-4">
            <h3 className="font-semibold">DB-provision</h3>
            <p>{dbProvisionTekst(ordning)}</p>
            {!fast && (
              <ul className="list-disc pl-5 space-y-1">
                <li>DB opgøres på de lokationer, du er ansvarlig for i Visma.</li>
                <li>Leje medregnes med 100 % DB. Maskinbelastning trækkes fra.</li>
              </ul>
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
                <p>Du får bonus for hver kaffemaskine, der sættes ud hos en kunde på en af dine lokationer – på salg eller leje (også brugte maskiner og udlån):</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Wittenborg (inkl. Gaggia G300): 500 kr.</li>
                  <li>Animo: 500 kr. (Animo OptiVend tæller med fra september 2026)</li>
                  <li>Rex-Royal: 750 kr.</li>
                </ul>
                <p>Maskinen tilhører den sælger, der står på lokationen (leveringsadressen) i Visma – uanset hvem der har forhandlet en eventuel kæde- eller koncernaftale.</p>
                <p>Udskiftning af en eksisterende maskine (gælder fra september 2026):</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Salg: Når kunden køber en ny eller nyere brugt maskine, og den gamle tages retur, giver det bonus – men ikke hvis Frellsen betaler kunden for den gamle maskine (byttehandel/tilbagekøb).</li>
                  <li>Leje: Når en lejemaskine skiftes ud, giver det kun bonus, hvis der samtidig laves en ny lejekontrakt med binding på mindst 2 år. En serviceombytning uden ny binding giver ikke bonus.</li>
                  <li>Husk: Sørg for at bindingen er registreret i Visma, når du laver en ny lejekontrakt – ellers kan maskinen ikke tælle med.</li>
                </ul>
                <p>Tæller ikke med:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Tilbehør som skabe, køleskabe, mælkemoduler og filtre.</li>
                  <li>Vandkølere og maskiner af andre mærker (fx Bonamat, Bolero, Futurmat).</li>
                  <li>Når en kunde køber en maskine, som den i forvejen har lejet hos Frellsen (overtagelse).</li>
                </ul>
              </section>
              <section id="bonusregel-nykunde" className="space-y-2 scroll-mt-4">
                <h3 className="font-semibold">Ny kunde-provision <span className="font-normal text-muted-foreground">(fra september 2026)</span></h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>En ny kunde er en kunde med omsætning i måneden og ingen omsætning hos Frellsen de foregående 24 måneder.</li>
                  <li>Offentlige udbudskunder (KPG3 40) tæller ikke med.</li>
                  <li>Den sælger, der har det største samlede DB på nye kunder i måneden, får 1.000 kr. Nummer to får 600 kr.</li>
                </ul>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
