import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { lokAdresse, type LokLite } from "@/lib/adresse-grupper";

function useNavne(ids: string[]) {
  return useQuery({
    queryKey: ["profil-navne", [...ids].sort()],
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return Object.fromEntries(((data ?? []) as any[]).map((p) => [p.id, p.full_name ?? "Ukendt"])) as Record<string, string>;
    },
  });
}

/** "Sælgere: Mads Lund (hovedkonto) + Anders Mohr (6), …" — tal = antal lokationer. Kun visning. */
export function SaelgereLinje({
  locations,
  hovedkontoSaelger,
  hovedkontoNavn,
}: {
  locations: LokLite[];
  hovedkontoSaelger: string | null;
  hovedkontoNavn: string | null;
}) {
  const antal = new Map<string, number>();
  for (const l of locations) if (l.saelger_user_id) antal.set(l.saelger_user_id, (antal.get(l.saelger_user_id) ?? 0) + 1);
  const andre = Array.from(antal.entries())
    .filter(([id]) => id !== hovedkontoSaelger)
    .sort((a, b) => b[1] - a[1]);
  const navneQ = useNavne(andre.map(([id]) => id));
  if (!andre.length) return null;
  const navne = navneQ.data ?? {};
  return (
    <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
      Sælgere: {hovedkontoNavn ? `${hovedkontoNavn} (hovedkonto${antal.get(hovedkontoSaelger ?? "") ? `, ${antal.get(hovedkontoSaelger!)}` : ""}) + ` : ""}
      {andre.map(([id, n]) => `${navne[id] ?? "…"} (${n})`).join(", ")}
    </p>
  );
}

/** Øverst i venstre kolonne, når brugeren er sælger på lokationer, men ikke på hovedkontoen. */
export function DineLokationer({
  locations,
  userId,
  hovedkontoSaelger,
}: {
  locations: LokLite[];
  userId: string | null;
  hovedkontoSaelger: string | null;
}) {
  const [aaben, setAaben] = useState(false);
  if (!userId || hovedkontoSaelger === userId) return null;
  const egne = locations.filter((l) => l.saelger_user_id === userId);
  if (!egne.length) return null;
  if (egne.length === 1) {
    return (
      <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm flex gap-2">
        <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <span>
          <span className="font-medium">Din lokation:</span> {lokAdresse(egne[0]) ?? "uden adresse"}
        </span>
      </div>
    );
  }
  return (
    <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <button type="button" className="w-full flex items-center justify-between gap-2 font-medium" onClick={() => setAaben((v) => !v)}>
        <span className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" /> Dine lokationer ({egne.length})
        </span>
        {aaben ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {aaben && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
          {egne.map((l) => (
            <li key={l.id}>
              {lokAdresse(l) ?? "uden adresse"}
              {l.visma_delivery_no ? ` · kundenr. ${l.visma_delivery_no}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
