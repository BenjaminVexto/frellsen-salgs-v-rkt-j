import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sendMaterialeMail } from "@/lib/katalog.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs, useEffektivRolle } from "@/contexts/view-as-context";
import { useAfdeling } from "@/contexts/afdeling-context";
import { cn } from "@/lib/utils";
import { standardMailtekst } from "@/lib/materiale-url";

type Mat = { id: string; titel: string; mailtekst: string };

export function KatalogKnap({
  companyId,
  locationId,
  size = "lg",
  className,
  onSaved,
}: {
  companyId: string;
  locationId?: string | null;
  size?: "lg" | "sm";
  className?: string;
  onSaved?: () => void;
}) {
  const { user } = useAuth() as any;
  const role = useEffektivRolle();
  const { isImpersonating } = useViewAs();
  const { stampAfdelingNr } = useAfdeling();
  const sendMail = useServerFn(sendMaterialeMail);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [navn, setNavn] = useState("");
  const [mats, setMats] = useState<Mat[]>([]);
  const [valgt, setValgt] = useState<string[]>([]);
  const [tekst, setTekst] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void supabase.from("materialer").select("id, titel, mailtekst").eq("aktiv", true).order("sortering").order("titel")
      .then(({ data, error }) => {
        if (error) return toast.error(error.message);
        setMats(data ?? []);
        if (data?.length === 1) { setValgt([data[0].id]); setTekst(standardMailtekst(data)); }
      });
  }, [open]);

  const skift = (id: string, on: boolean) => {
    const ny = on ? [...valgt, id] : valgt.filter((v) => v !== id);
    setValgt(ny);
    const v = mats.filter((m) => ny.includes(m.id));
    setTekst(v.length ? standardMailtekst(v) : "");
  };

  const send = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return toast.error("Skriv en gyldig e-mailadresse");
    if (!valgt.length) return toast.error("Vælg mindst ét materiale");
    if (!user?.id) return;
    if (isImpersonating) return toast.error("Read-only — du ser som en anden sælger");
    setBusy(true);
    try {
      const result = await sendMail({ data: {
        companyId, locationId: locationId ?? null, email: e, navn: navn.trim(), materialeIds: valgt, mailtekst: tekst,
        afdelingNr: stampAfdelingNr,
      } });
      if (!result.ok) throw new Error(result.error);
      toast.success("Materiale sendt – opfølgning lagt om 7 dage");
      setOpen(false);
      setEmail(""); setNavn(""); setValgt([]); setTekst("");
      onSaved?.();
    } catch (err: any) {
      toast.error("Kunne ikke sende materiale: " + (err?.message ?? ""));
    } finally {
      setBusy(false);
    }
  };

  // Kun admin indtil materialeafsendelsen er testet.
  if (role !== "admin") return null;
  const stor = size === "lg";
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={!user}
        className={cn(stor ? "h-12 w-full text-base font-semibold" : "h-9", className)}
      >
        <BookOpen className="h-4 w-4 mr-2" /> Send materiale
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send materiale</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="kat-email">E-mail</Label>
              <Input id="kat-email" type="email" inputMode="email" autoFocus value={email} onChange={(ev) => setEmail(ev.target.value)} />
            </div>
            <div>
              <Label htmlFor="kat-navn">Navn (valgfrit)</Label>
              <Input id="kat-navn" value={navn} onChange={(ev) => setNavn(ev.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Materialer</Label>
              {mats.length === 0 && <p className="text-sm text-muted-foreground">Ingen aktive materialer.</p>}
              {mats.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={valgt.includes(m.id)} onCheckedChange={(c) => skift(m.id, c === true)} />
                  {m.titel}
                </label>
              ))}
            </div>
            <div>
              <Label htmlFor="kat-tekst">Mailtekst</Label>
              <Textarea id="kat-tekst" rows={4} value={tekst} onChange={(ev) => setTekst(ev.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Vi sender materialet og følger op med et opkald eller en mail om 7 dage.</p>
          </div>
          <DialogFooter>
            <Button onClick={send} disabled={busy || !valgt.length} className="w-full">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
