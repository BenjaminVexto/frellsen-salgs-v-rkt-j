import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

export type PlaceringInfo = { placering: string | null; af: string | null; at: string | null; kilde: string };

/** Henter "Placering i bygningen" for en række serienumre. */
export async function hentPlaceringer(serienumre: string[]): Promise<Map<string, PlaceringInfo>> {
  const m = new Map<string, PlaceringInfo>();
  const sb = supabase as any;
  const rows: any[] = [];
  for (let i = 0; i < serienumre.length; i += 200) {
    const { data } = await sb
      .from("maskine_placering")
      .select("serienr, placering, kilde, opdateret_af, opdateret_at")
      .in("serienr", serienumre.slice(i, i + 200));
    rows.push(...(data ?? []));
  }
  const ids = Array.from(new Set(rows.map((r) => r.opdateret_af).filter(Boolean)));
  const navne = new Map<string, string>();
  if (ids.length) {
    const { data } = await sb.from("profiles").select("id, full_name").in("id", ids);
    for (const p of data ?? []) navne.set(p.id, p.full_name);
  }
  for (const r of rows)
    m.set(String(r.serienr), {
      placering: r.placering,
      kilde: r.kilde,
      at: r.opdateret_at,
      af: r.opdateret_af ? navne.get(r.opdateret_af) ?? null : r.kilde === "visma" ? "Visma" : null,
    });
  return m;
}

export function PlaceringFelt({
  serienr,
  info,
  onSaved,
}: {
  serienr: string;
  info?: PlaceringInfo;
  onSaved: (ny: string | null) => void;
}) {
  const [redigerer, setRedigerer] = useState(false);
  const [tekst, setTekst] = useState(info?.placering ?? "");
  const [gemmer, setGemmer] = useState(false);

  const gem = async () => {
    setGemmer(true);
    const { error } = await (supabase as any).rpc("saet_maskine_placering", { _serienr: serienr, _placering: tekst });
    setGemmer(false);
    if (error) return toast.error("Kunne ikke gemme placering: " + error.message);
    setRedigerer(false);
    onSaved(tekst.trim() || null);
  };

  if (redigerer)
    return (
      <div className="flex items-center gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
        <Input
          autoFocus
          value={tekst}
          maxLength={120}
          placeholder="Fx Stuen, kantine"
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") gem();
            if (e.key === "Escape") setRedigerer(false);
          }}
          className="h-7 text-xs max-w-[16rem]"
        />
        <Button size="sm" className="h-7 text-xs" onClick={gem} disabled={gemmer}>Gem</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRedigerer(false)}>Annullér</Button>
      </div>
    );

  return (
    <div className="mt-0.5 text-[11px] flex items-center gap-1.5 flex-wrap">
      <span>Placering i bygningen:</span>
      <span className={info?.placering ? "text-foreground" : ""}>{info?.placering ?? "—"}</span>
      <button
        type="button"
        className="inline-flex items-center gap-0.5 text-primary hover:underline"
        onClick={(e) => {
          e.stopPropagation();
          setTekst(info?.placering ?? "");
          setRedigerer(true);
        }}
      >
        <Pencil className="h-3 w-3" /> {info?.placering ? "Ret" : "Tilføj"}
      </button>
      {info?.at && info.placering && (
        <span className="text-muted-foreground">
          · {info.af ?? "ukendt"}, {new Date(info.at).toLocaleDateString("da-DK")}
        </span>
      )}
    </div>
  );
}
