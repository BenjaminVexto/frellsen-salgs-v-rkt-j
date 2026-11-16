import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, ClipboardPaste } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CvrBulkSoegningDialog } from "@/components/cvr-bulk-soegning-dialog";
import { adminIndsaetCvr } from "@/lib/kundetjek.functions";
import { parseCvrListe } from "@/lib/kundetjek";

const RESULTAT: Record<string, string> = {
  tilfoejet: "Tilføjet", kunde: "Eksisterende kunde", paa_liste: "Lå allerede på listen", ikke_fundet: "Ikke fundet", afvist: "Reklamebeskyttet, ophørt eller ønsker ikke kontakt",
};

export function TilfoejEmner({ listId, saelgerId, onDone }: { listId: string; saelgerId: string | null; onDone: () => void }) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [cvrOpen, setCvrOpen] = useState(false);
  const [tekst, setTekst] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Awaited<ReturnType<typeof adminIndsaetCvr>> | null>(null);
  const indsaet = useServerFn(adminIndsaetCvr);

  const tilfoejIds = async (ids: string[]) => {
    let tilf = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await supabase.from("contact_list_assignments").upsert(
        ids.slice(i, i + 500).map(company_id => ({ contact_list_id: listId, company_id, assigned_to: saelgerId, status: "ny" as const })),
        { onConflict: "contact_list_id,company_id", ignoreDuplicates: true },
      ).select("id");
      if (error) { toast.error("Fejl ved tilføjelse: " + error.message); return; }
      tilf += data?.length ?? 0;
    }
    toast.success(`${tilf} tilføjet, ${ids.length - tilf} lå allerede på listen`);
    onDone();
  };

  const koerCvr = async () => {
    const p = parseCvrListe(tekst);
    if (!p.cvrs.length) { toast.error("Ingen gyldige CVR-numre"); return; }
    if (p.forMange) toast.warning("Kun de første 500 CVR-numre tjekkes");
    setBusy(true);
    try {
      const r = await indsaet({ data: { list_id: listId, cvrs: p.cvrs } });
      setRes(r);
      if (r.tilfoejet) onDone();
    } catch (e: any) { toast.error(e?.message ?? "Fejl"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}><Plus className="h-4 w-4 mr-1" />Tilføj flere emner</Button>
      <Button size="sm" variant="outline" onClick={() => { setRes(null); setCvrOpen(true); }}><ClipboardPaste className="h-4 w-4 mr-1" />Indsæt CVR-numre</Button>
      {bulkOpen && (
        <CvrBulkSoegningDialog open={bulkOpen} onOpenChange={setBulkOpen} onImported={(ids) => { setBulkOpen(false); void tilfoejIds(ids); }} />
      )}
      <Dialog open={cvrOpen} onOpenChange={setCvrOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Indsæt CVR-numre</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Ét pr. linje eller kommasepareret, højst 500. Kun nye emner og ikke-kunder tilføjes.</p>
          <Textarea rows={8} value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder={"12345678\n87654321"} />
          {res && (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                <span>Tilføjet: <b>{res.tilfoejet}</b></span>
                <span>Eksisterende kunde: <b>{res.kunde}</b></span>
                <span>Lå allerede på liste: <b>{res.paa_liste}</b></span>
                <span>Ikke fundet: <b>{res.ikke_fundet}</b></span>
                {res.afvist > 0 && <span>Afvist: <b>{res.afvist}</b></span>}
              </div>
              <div className="max-h-60 overflow-y-auto border rounded divide-y">
                {res.detaljer.map(d => (
                  <div key={d.cvr} className="flex gap-2 px-2 py-1"><span className="tabular-nums w-20">{d.cvr}</span><span className="flex-1 truncate">{d.navn ?? "–"}</span><span className="text-muted-foreground">{RESULTAT[d.resultat]}</span></div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCvrOpen(false)}>Luk</Button>
            <Button onClick={() => void koerCvr()} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Slå op og tilføj</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
