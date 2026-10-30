import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { materialeForsideUrl, materialeKilde } from "@/lib/materiale-url";

export const Route = createFileRoute("/_authenticated/admin/materialer")({
  component: Side,
  head: () => ({ meta: [
    { title: "Materialer | Frellsen CRM" },
    { name: "description", content: "Materialebibliotek til afsendelse fra kundekortet." },
    { property: "og:title", content: "Materialer | Frellsen CRM" },
    { property: "og:description", content: "Materialebibliotek til afsendelse fra kundekortet." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

type Materiale = {
  id: string; titel: string; type: string; url: string | null; pdf_path: string | null; forside_billede_path: string | null;
  mailtekst: string; aktiv: boolean; sortering: number; opdateret_at: string;
};

export const BILLEDE_MAX = 300 * 1024;
export const PDF_MAX = 20 * 1024 * 1024;

function Side() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["materialer-admin"], queryFn: async () => {
    const { data, error } = await supabase.from("materialer").select("*").order("sortering").order("titel");
    if (error) throw error;
    return data as Materiale[];
  } });
  const [ret, setRet] = useState<Materiale | "ny" | null>(null);
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Materialer</h1>
        <Button onClick={() => setRet("ny")}><Plus className="h-4 w-4 mr-2" /> Nyt materiale</Button>
      </div>
      <p className="text-sm text-muted-foreground">Materialer kan sendes fra kundekortet med "Send materiale". Deaktiverede materialer kan ikke vælges, men gamle links virker stadig.</p>
      {q.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
      <div className="space-y-2">
        {q.data?.map((m) => {
          const forside = materialeForsideUrl(m);
          return (
            <Card key={m.id} className="p-3 flex items-center gap-3">
              {forside ? <img src={forside} alt="" className="h-16 w-12 object-cover rounded border" /> : <div className="h-16 w-12 rounded border bg-muted" />}
              <div className="flex-1 min-w-0">
                <div className="font-medium flex items-center gap-2">{m.titel}
                  <Badge variant="outline">{m.type === "pdf" ? "PDF" : "Link"}</Badge>
                  {!m.aktiv && <Badge variant="secondary">Deaktiveret</Badge>}
                </div>
                <a href={materialeKilde(m) ?? "#"} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline truncate block">{materialeKilde(m)}</a>
              </div>
              <Button variant="outline" size="sm" onClick={() => setRet(m)}>Ret</Button>
            </Card>
          );
        })}
      </div>
      {ret && <RetDialog m={ret === "ny" ? null : ret} onClose={() => setRet(null)} onSaved={() => { setRet(null); void qc.invalidateQueries({ queryKey: ["materialer-admin"] }); }} />}
    </div>
  );
}

function RetDialog({ m, onClose, onSaved }: { m: Materiale | null; onClose: () => void; onSaved: () => void }) {
  const [titel, setTitel] = useState(m?.titel ?? "");
  const [type, setType] = useState(m?.type ?? "link");
  const [url, setUrl] = useState(m?.url ?? "");
  const [mailtekst, setMailtekst] = useState(m?.mailtekst ?? "");
  const [aktiv, setAktiv] = useState(m?.aktiv ?? true);
  const [sortering, setSortering] = useState(String(m?.sortering ?? 0));
  const [billede, setBillede] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const vaelgBillede = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(jpeg|png)$/.test(f.type)) return toast.error("Forsidebilledet skal være jpg eller png");
    if (f.size > BILLEDE_MAX) return toast.error("Forsidebilledet må højst fylde 300 KB");
    setBillede(f);
  };
  const vaelgPdf = (f: File | undefined) => {
    if (!f) return;
    if (f.type !== "application/pdf") return toast.error("Filen skal være en PDF");
    if (f.size > PDF_MAX) return toast.error("PDF'en må højst fylde 20 MB");
    setPdf(f);
  };

  const gem = async () => {
    if (!titel.trim()) return toast.error("Skriv en titel");
    if (type === "link" && !/^https?:\/\//.test(url.trim())) return toast.error("Skriv et gyldigt link (https://…)");
    if (type === "pdf" && !pdf && !m?.pdf_path) return toast.error("Upload en PDF");
    setBusy(true);
    try {
      const id = m?.id ?? crypto.randomUUID();
      const ts = Date.now();
      let forside = m?.forside_billede_path ?? null;
      let pdfPath = m?.pdf_path ?? null;
      if (billede) {
        const p = `${id}/forside-${ts}.${billede.type === "image/png" ? "png" : "jpg"}`;
        const { error } = await supabase.storage.from("materialer").upload(p, billede, { contentType: billede.type });
        if (error) throw error;
        forside = p;
      }
      if (pdf) {
        const p = `${id}/materiale-${ts}.pdf`;
        const { error } = await supabase.storage.from("materialer").upload(p, pdf, { contentType: "application/pdf" });
        if (error) throw error;
        pdfPath = p;
      }
      const row = {
        titel: titel.trim(), type, url: type === "link" ? url.trim() : null, pdf_path: pdfPath, forside_billede_path: forside,
        mailtekst, aktiv, sortering: Number(sortering) || 0, opdateret_at: new Date().toISOString(),
      };
      const { error } = m
        ? await supabase.from("materialer").update(row).eq("id", m.id)
        : await supabase.from("materialer").insert({ id, ...row });
      if (error) throw error;
      toast.success("Materiale gemt");
      onSaved();
    } catch (e: any) {
      toast.error("Kunne ikke gemme: " + (e?.message ?? ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{m ? "Ret materiale" : "Nyt materiale"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Titel</Label><Input value={titel} onChange={(e) => setTitel(e.target.value)} /></div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={type === "link" ? "default" : "outline"} onClick={() => setType("link")}>Link</Button>
            <Button type="button" size="sm" variant={type === "pdf" ? "default" : "outline"} onClick={() => setType("pdf")}>PDF</Button>
          </div>
          {type === "link" ? (
            <div><Label>Link</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></div>
          ) : (
            <div><Label>PDF (maks. 20 MB)</Label>
              <Input type="file" accept="application/pdf" onChange={(e) => vaelgPdf(e.target.files?.[0])} />
              {m?.pdf_path && !pdf && <p className="text-xs text-muted-foreground mt-1">Nuværende PDF beholdes, hvis du ikke vælger en ny.</p>}
            </div>
          )}
          <div><Label>Forsidebillede (jpg/png, maks. 300 KB)</Label>
            <Input type="file" accept="image/jpeg,image/png" onChange={(e) => vaelgBillede(e.target.files?.[0])} />
          </div>
          <div><Label>Mailtekst</Label><Textarea rows={3} value={mailtekst} onChange={(e) => setMailtekst(e.target.value)} /></div>
          <div className="flex items-center gap-4">
            <div className="w-24"><Label>Sortering</Label><Input inputMode="numeric" value={sortering} onChange={(e) => setSortering(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm mt-5"><Switch checked={aktiv} onCheckedChange={setAktiv} /> Aktiv</label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={gem} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Gem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
