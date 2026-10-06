import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/view-as-context";
import { useAfdeling } from "@/contexts/afdeling-context";
import { cn } from "@/lib/utils";

function omDage(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * "Send digitalt katalog": gemmer kontakten på lokationen, opretter aktiviteten
 * "Katalog sendt" med opfølgning om 7 dage og lægger mailen i kø.
 * Selve afsendelsen sker, når mail-domænet (mail.frellsen.dk) er verificeret.
 */
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
  const { user, role } = useAuth() as any;
  const { isImpersonating } = useViewAs();
  const { stampAfdelingNr } = useAfdeling();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [navn, setNavn] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return toast.error("Skriv en gyldig e-mailadresse");
    if (!user?.id) return;
    if (isImpersonating) return toast.error("Read-only — du ser som en anden sælger");
    setBusy(true);
    try {
      let lid = locationId ?? null;
      if (!lid) {
        const { data } = await supabase
          .from("locations")
          .select("id")
          .eq("company_id", companyId)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        lid = data?.id ?? null;
      }
      const { data: ind } = await supabase.from("katalog_indstilling").select("katalog_url").maybeSingle();
      const url = ind?.katalog_url;
      if (!url) throw new Error("Katalog-link er ikke sat op (Admin → Katalog)");

      // Kontakt: opdatér eksisterende med samme e-mail, ellers opret.
      let kq = supabase.from("contacts").select("id").eq("company_id", companyId).ilike("email", e).limit(1);
      kq = lid ? kq.eq("location_id", lid) : kq.is("location_id", null);
      const { data: eks } = await kq;
      if (eks?.[0]) {
        if (navn.trim()) await supabase.from("contacts").update({ name: navn.trim() }).eq("id", eks[0].id);
      } else {
        await supabase.from("contacts").insert({ company_id: companyId, location_id: lid, name: navn.trim() || e, email: e });
      }

      const { data: akt, error: aErr } = await supabase
        .from("activities")
        .insert({
          company_id: companyId,
          location_id: lid,
          created_by: user.id,
          activity_type: "email",
          note: `Katalog sendt til ${navn.trim() ? `${navn.trim()} <${e}>` : e}`,
          next_action: "Følg op på tilsendt katalog",
          next_followup_date: omDage(7),
          ...(stampAfdelingNr != null ? { afdeling_nr: stampAfdelingNr } : {}),
        })
        .select("id")
        .single();
      if (aErr) throw aErr;

      const { error: uErr } = await supabase.from("katalog_udsendelser").insert({
        company_id: companyId,
        location_id: lid,
        activity_id: akt.id,
        modtager_email: e,
        modtager_navn: navn.trim() || null,
        katalog_url: url,
        sendt_af: user.id,
      });
      if (uErr) throw uErr;

      toast.success("Katalog registreret – opfølgning lagt om 7 dage", {
        description: "Mailen sendes, når Frellsens mail-domæne er aktiveret.",
      });
      setOpen(false);
      setEmail("");
      setNavn("");
      onSaved?.();
    } catch (err: any) {
      toast.error("Kunne ikke sende katalog: " + (err?.message ?? ""));
    } finally {
      setBusy(false);
    }
  };

  // Parkeret: kun admin ser knappen, indtil mails kan sendes (kundens mail må ikke indsamles uden katalog).
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
        <BookOpen className="h-4 w-4 mr-2" /> Send digitalt katalog
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send digitalt katalog</DialogTitle>
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
            <p className="text-xs text-muted-foreground">Vi sender kataloget og følger op med et opkald eller en mail.</p>
          </div>
          <DialogFooter>
            <Button onClick={send} disabled={busy} className="w-full">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
