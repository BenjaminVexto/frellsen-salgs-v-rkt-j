import { Card } from "@/components/ui/card";
import type { ImportKontrakt } from "@/lib/import-kontrakter";

function Boks() {
  return <span className="mt-[3px] h-3 w-3 shrink-0 rounded-[3px] border border-muted-foreground/40" />;
}

function Liste({
  titel,
  kolonner,
  nummereret,
  startIndex,
}: {
  titel: string;
  kolonner: string[];
  nummereret: boolean;
  startIndex: number;
}) {
  if (!kolonner.length) return null;
  return (
    <div>
      <p className="text-xs font-medium mb-1.5">
        {titel} <span className="text-muted-foreground">({kolonner.length})</span>
      </p>
      <ul className="space-y-1">
        {kolonner.map((k, i) => (
          <li key={k} className="flex items-start gap-2 text-xs">
            <Boks />
            <span>
              {nummereret && (
                <span className="text-muted-foreground tabular-nums mr-1">{startIndex + i}.</span>
              )}
              {k}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ImportKolonneTjekliste({ kontrakt }: { kontrakt: ImportKontrakt }) {
  const fast = kontrakt.kolonneRaekkefoelgeBetyder;
  const total = kontrakt.paakraevede.length + kontrakt.anbefalede.length;
  if (!total) return null;

  return (
    <Card className="p-4 mt-4 space-y-3">
      <p className="text-xs font-medium">
        {fast
          ? `Præcis ${total} kolonner i fast rækkefølge — filen har ingen overskrifter`
          : `${total} kolonner bruges — ${kontrakt.paakraevede.length} påkrævede, ${kontrakt.anbefalede.length} anbefalede`}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Liste titel="Påkrævede" kolonner={kontrakt.paakraevede} nummereret={fast} startIndex={1} />
        <Liste
          titel="Anbefalede"
          kolonner={kontrakt.anbefalede}
          nummereret={fast}
          startIndex={kontrakt.paakraevede.length + 1}
        />
      </div>

      <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
        <p>
          {fast
            ? "Rækkefølgen er afgørende — flyttes en kolonne i Visma, bliver alle efterfølgende værdier læst forkert"
            : "Rækkefølgen er uden betydning — kolonnerne kobles på overskriftens navn, som skal staves præcis som ovenfor"}
        </p>
        <p>Skal køres først: {kontrakt.afhaengerAf ?? "ingen"}</p>
      </div>
    </Card>
  );
}
