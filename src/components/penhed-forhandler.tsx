import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type Koblingsforslag = {
  p_nummer: string;
  cvr: string;
  penhed_adresse: string | null;
  penhed_zip: string | null;
  penhed_city: string | null;
  ansatte: number | null;
  afdeling_nr: number;
  location_id: string;
  visma_delivery_no: string | null;
  lokation_adresse: string | null;
  company_id: string;
  company_name: string | null;
  samme_cvr: boolean;
  husnr_afstand: number;
};

/** Åbne koblingsforslag (næsten-ens adresser). Uden cvr: alle på tværs af kunder. */
export async function hentKoblingsforslag(cvr: string | null): Promise<Koblingsforslag[]> {
  const { data, error } = await (supabase as any).rpc("penhed_koblingsforslag", { _cvr: cvr });
  if (error) throw new Error(error.message);
  return (data ?? []) as Koblingsforslag[];
}

/** Bekræft forslag → manuel kobling. */
export async function koblForslag(f: Koblingsforslag) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await (supabase as any).from("location_pnr_link").upsert(
    {
      p_nummer: f.p_nummer,
      afdeling_nr: f.afdeling_nr,
      visma_delivery_no: f.visma_delivery_no,
      location_id: f.location_id,
      kilde: "manuel",
      oprettet_af: u.user?.id,
      oprettet_dato: new Date().toISOString(),
    },
    { onConflict: "p_nummer,location_id" },
  );
  if (error) throw new Error(error.message);
  await (supabase as any)
    .from("penhed_handling_log")
    .insert({ p_nummer: f.p_nummer, handling: "kobl", location_id: f.location_id });
}

/** Afvis forslag, så det ikke vises igen. */
export async function afvisForslag(f: Koblingsforslag) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await (supabase as any)
    .from("penhed_forslag_afvist")
    .upsert({ p_nummer: f.p_nummer, location_id: f.location_id, created_by: u.user?.id }, { onConflict: "p_nummer,location_id" });
  if (error) throw new Error(error.message);
  await (supabase as any)
    .from("penhed_handling_log")
    .insert({ p_nummer: f.p_nummer, handling: "afvis_forslag", location_id: f.location_id });
}

/** "Muligt match: kundenr. 3045304 – Marmorvej 4 · Kobl / Afvis" */
export function ForslagLinje({ forslag, onDone }: { forslag: Koblingsforslag[]; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!forslag.length) return null;
  async function k(f: Koblingsforslag, fn: (f: Koblingsforslag) => Promise<void>, ok: string) {
    setBusy(f.location_id);
    try {
      await fn(f);
      toast.success(ok);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="mt-0.5 space-y-0.5">
      {forslag.map((f) => (
        <div key={f.location_id} className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-1.5">
          <span className="text-foreground">Muligt match:</span>
          <span>
            kundenr. {f.visma_delivery_no ?? "–"} – {f.lokation_adresse ?? "?"}
            {!f.samme_cvr && f.company_name ? ` (${f.company_name}, uden CVR)` : ""}
          </span>
          {busy === f.location_id ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <span>·</span>
              <button className="text-primary hover:underline" onClick={() => k(f, koblForslag, "P-enhed koblet")}>
                Kobl
              </button>
              <span>/</span>
              <button className="hover:text-foreground hover:underline" onClick={() => k(f, afvisForslag, "Forslag afvist")}>
                Afvis
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function ViaForhandler({ id, navn }: { id: string; navn: string | null }) {
  return (
    <span>
      Leveres via{" "}
      <Link to="/virksomheder/$id" params={{ id }} className="text-primary hover:underline">
        {navn ?? "forhandler"}
      </Link>
    </span>
  );
}

/** Dialog: markér P-enhed som leveret via en forhandler (virksomhed i CRM). */
export function ForhandlerDialog({
  penhed,
  afdelingNr,
  companyId,
  onClose,
  onSaved,
}: {
  penhed: { p_number: string; address: string | null; zip: string | null; city: string | null } | null;
  afdelingNr: number;
  companyId: string | null | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; city: string | null; visma_id: string | null }[]>([]);
  const [valgt, setValgt] = useState<{ id: string; name: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (penhed) {
      setQ("");
      setHits([]);
      setValgt(null);
      setNote("");
    }
  }, [penhed]);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setHits([]);
      return;
    }
    const h = setTimeout(async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name, city, visma_id")
        .ilike("name", `%${t.replace(/[%,()]/g, " ")}%`)
        .is("afloest_af_company_id" as any, null)
        .neq("id", companyId ?? "00000000-0000-0000-0000-000000000000")
        .order("name")
        .limit(20);
      setHits((data ?? []) as any);
    }, 250);
    return () => clearTimeout(h);
  }, [q, companyId]);

  async function gem() {
    if (!penhed || !valgt || !companyId) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("penhed_saet_indirekte", {
      _p_nummer: penhed.p_number,
      _afdeling_nr: afdelingNr,
      _company_id: companyId,
      _via_company_id: valgt.id,
      _note: note.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error("Kunne ikke gemme: " + error.message);
    toast.success(`Markeret som leveret via ${valgt.name}`);
    onSaved();
  }

  return (
    <Dialog open={!!penhed} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Leveres via forhandler</DialogTitle>
        </DialogHeader>
        {penhed && (
          <p className="text-sm text-muted-foreground">
            {[penhed.address, [penhed.zip, penhed.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")} · P-nr.{" "}
            {penhed.p_number}
          </p>
        )}
        <div className="space-y-1.5">
          <Label>Forhandler</Label>
          {valgt ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{valgt.name}</span>
              <button className="text-xs text-muted-foreground hover:underline" onClick={() => setValgt(null)}>
                Skift
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg virksomhed, fx Cheval Blanc" autoFocus />
              </div>
              {hits.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-md border p-1">
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted"
                      onClick={() => setValgt({ id: h.id, name: h.name })}
                    >
                      <div>{h.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[h.city, h.visma_id ? `kundenr. ${h.visma_id}` : null].filter(Boolean).join(" · ")}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Note (valgfri)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
        </div>
        <p className="text-xs text-muted-foreground">
          P-enheden tæller derefter som dækket og kommer ikke på emne- og ringelister. Forsyningsrelationen oprettes også.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annullér</Button>
          <Button onClick={gem} disabled={!valgt || busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Gem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export async function fjernIndirekte(p_nummer: string, afdelingNr: number) {
  const { error } = await (supabase as any).rpc("penhed_fjern_indirekte", { _p_nummer: p_nummer, _afdeling_nr: afdelingNr });
  if (error) throw new Error(error.message);
}
