import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatAnsatte, logPenhed } from "@/components/penhed-daekning";

type Pen = {
  p_number: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  ansatte_praecis: number | null;
  ansatte_interval: string | null;
};

/**
 * Manuel kobling/afkobling af en adresse (alle konti på adressen) til en P-enhed.
 * Afkobling gemmes som kilde='afvist', så den automatiske matchning ikke kobler igen.
 */
export function AdressePenhedKobling({
  pnr,
  pnrAdresse,
  locs,
  linkInfo,
  afdelingNr,
  penListe,
  zip,
  onChanged,
}: {
  pnr: string | null;
  pnrAdresse?: string | null;
  linkInfo: Record<string, { kilde: string; af: string | null }>;
  locs: { id: string; visma_delivery_no: string | null }[];
  afdelingNr: number | null | undefined;
  penListe: Pen[];
  zip: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [bekraeft, setBekraeft] = useState<{ id: string; visma_delivery_no: string | null } | null>(null);
  if (afdelingNr == null) return null;

  async function kobl(p: Pen) {
    setBusy(true);
    setOpen(false);
    const { data: u } = await supabase.auth.getUser();
    const nu = new Date().toISOString();
    const { error } = await (supabase as any).from("location_pnr_link").upsert(
      locs.map((l) => ({
        p_nummer: p.p_number,
        afdeling_nr: afdelingNr,
        visma_delivery_no: l.visma_delivery_no,
        location_id: l.id,
        kilde: "manuel",
        oprettet_af: u.user?.id,
        oprettet_dato: nu,
      })),
      { onConflict: "p_nummer,location_id" },
    );
    if (!error) await Promise.all(locs.map((l) => logPenhed(p.p_number, "kobl", l.id)));
    setBusy(false);
    if (error) return toast.error("Kunne ikke koble: " + error.message);
    toast.success(`Koblet til P-nr. ${p.p_number}`);
    onChanged();
  }

  async function fjern(loc: { id: string; visma_delivery_no: string | null }) {
    if (!pnr) return;
    setBekraeft(null);
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    // Kun den ene konto fravælges; øvrige konti på P-enheden røres ikke.
    const { error } = await (supabase as any)
      .from("location_pnr_link")
      .update({ kilde: "afvist", oprettet_af: u.user?.id, oprettet_dato: new Date().toISOString() })
      .eq("p_nummer", pnr)
      .eq("location_id", loc.id);
    if (!error) await logPenhed(pnr, "fjern_kobling", loc.id);
    setBusy(false);
    if (error) return toast.error("Kunne ikke fjerne kobling: " + error.message);
    toast.success(`Kobling fjernet for kundenr. ${loc.visma_delivery_no ?? ""} – kobles ikke automatisk igen`);
    onChanged();
  }

  if (busy) {
    return (
      <div className="px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Gemmer…
      </div>
    );
  }

  if (pnr) {
    return (
      <>
        <ul className="px-3 py-1 text-xs text-muted-foreground space-y-0.5">
          {locs.map((l) => {
            const info = linkInfo[l.id];
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-x-1.5">
                <span>Kundenr. {l.visma_delivery_no ?? "–"}</span>
                <span>·</span>
                <span>{info?.kilde === "manuel" ? `koblet manuelt${info.af ? ` af ${info.af}` : ""}` : "koblet automatisk"}</span>
                <span>·</span>
                <button type="button" className="hover:text-foreground hover:underline" onClick={() => setBekraeft(l)}>
                  Fjern kobling
                </button>
              </li>
            );
          })}
        </ul>
        <AlertDialog open={!!bekraeft} onOpenChange={(o) => !o && setBekraeft(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Fjern kobling for kundenr. {bekraeft?.visma_delivery_no ?? "–"} til P-enhed {pnrAdresse ?? pnr}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Kun denne konto kobles fra og bliver ikke koblet automatisk igen. Andre konti på P-enheden beholder deres kobling.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annullér</AlertDialogCancel>
              <AlertDialogAction onClick={() => bekraeft && fjern(bekraeft)}>Fjern kobling</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  const sorteret = [...penListe].sort(
    (a, b) => Number(b.zip === zip) - Number(a.zip === zip) || (a.address ?? "").localeCompare(b.address ?? "", "da"),
  );
  return (
    <div className="px-3 py-1.5 text-xs">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="text-primary hover:underline" disabled={!penListe.length}>
            {penListe.length ? "Kobl til P-enhed" : "Ingen P-enheder på CVR at koble til"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-1 max-h-72 overflow-y-auto" align="start">
          {sorteret.map((p) => (
            <button
              key={p.p_number}
              type="button"
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
              onClick={() => kobl(p)}
            >
              <div>{p.address ?? "Ukendt adresse"}</div>
              <div className="text-muted-foreground">
                {[[p.zip, p.city].filter(Boolean).join(" "), `P-nr. ${p.p_number}`, `${formatAnsatte(p)} ansatte`].join(" · ")}
              </div>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
