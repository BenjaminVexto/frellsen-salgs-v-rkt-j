import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sendKatalogMail } from "@/lib/katalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs, useEffektivRolle } from "@/contexts/view-as-context";
import { useAfdeling } from "@/contexts/afdeling-context";
import { cn } from "@/lib/utils";

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
  const sendMail = useServerFn(sendKatalogMail);
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
      const result = await sendMail({ data: {
        companyId, locationId: locationId ?? null, email: e, navn: navn.trim(), afdelingNr: stampAfdelingNr,
      } });
      if (!result.ok) throw new Error(result.error);
      toast.success("Katalog sendt – opfølgning lagt om 7 dage");
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

  // Kun admin indtil katalogafsendelsen er testet.
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
