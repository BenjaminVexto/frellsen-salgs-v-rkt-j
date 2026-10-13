import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type TmBruger = { user_id: string; navn: string | null };

export function useTmBrugere() {
  const [brugere, setBrugere] = useState<TmBruger[]>([]);
  useEffect(() => {
    (supabase as any).rpc("telemarketing_brugere").then(({ data }: any) => setBrugere(data ?? []));
  }, []);
  return brugere;
}

/** Vælg en eller flere telemarketing-brugere ("Ringes af"). */
export function RingerVaelger({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const brugere = useTmBrugere();
  return (
    <div>
      <Label>Ringes af (telemarketing)</Label>
      {brugere.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-1">
          Ingen telemarketing-brugere endnu – opret dem i Brugerstyring.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3 mt-1">
          {brugere.map((b) => (
            <label key={b.user_id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={value.includes(b.user_id)}
                onCheckedChange={(c) =>
                  onChange(c ? [...value, b.user_id] : value.filter((x) => x !== b.user_id))
                }
              />
              {b.navn || "Uden navn"}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
