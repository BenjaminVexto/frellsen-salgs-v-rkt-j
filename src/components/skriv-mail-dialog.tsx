import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Mail, Sparkles, Loader2, Copy, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateMailDraft, type MailPurpose } from "@/lib/mail-draft.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/view-as-context";

type PurposeOption = {
  key: MailPurpose;
  label: string;
  description: string;
};

const PURPOSES: PurposeOption[] = [
  {
    key: "opfølgning",
    label: "Følg op / hold kontakt",
    description: "Varm opfølgning på eksisterende kunde.",
  },
  {
    key: "mersalg",
    label: "Tilbud / mersalg",
    description: "Konkret mersalgsvinkel (fx maskine uden kaffe).",
  },
  {
    key: "genvinding",
    label: "Genvinding",
    description: "Sovende eller tabt kunde — åbn dialogen igen.",
  },
  {
    key: "intro",
    label: "Intro / første kontakt",
    description: "Nyt emne — kort præsentation.",
  },
];

const MAILTO_WARN_LIMIT = 1800; // mange klienter kapper omkring 2000 tegn

export function SkrivMailDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  contactName,
  contactEmail,
  locationId,
  onLogged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  companyName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  locationId?: string | null;
  onLogged?: () => void;
}) {
  const { user } = useAuth();
  const generateFn = useServerFn(generateMailDraft);
  const { isImpersonating, viewAsName } = useViewAs();

  useEffect(() => {
    if (open && isImpersonating) {
      toast.error(`Read-only — du ser som ${viewAsName ?? "en anden sælger"}. Mail kan ikke sendes.`);
      onOpenChange(false);
    }
  }, [open, isImpersonating, viewAsName, onOpenChange]);


  const [purpose, setPurpose] = useState<MailPurpose | null>(null);
  const [generating, setGenerating] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("");

  useEffect(() => {
    if (open) {
      setPurpose(null);
      setSubject("");
      setBody("");
      setRecipient(contactEmail ?? "");
    }
  }, [open, contactEmail]);

  async function pickPurpose(p: MailPurpose) {
    setPurpose(p);
    setGenerating(true);
    try {
      const res = await generateFn({
        data: {
          company_id: companyId,
          purpose: p,
          contact_name: contactName ?? null,
          contact_email: contactEmail ?? null,
        },
      });
      setSubject(res.subject);
      setBody(res.body);
    } catch (e) {
      toast.error(
        "Kunne ikke generere udkast: " +
          (e instanceof Error ? e.message : String(e)),
      );
      setPurpose(null);
    } finally {
      setGenerating(false);
    }
  }

  async function logActivity() {
    if (!user) return;
    const note = `Mail sendt: ${subject}\n\n${body}`;
    const { error } = await supabase.from("activities").insert({
      company_id: companyId,
      created_by: user.id,
      activity_type: "email" as any,
      note,
      location_id: locationId ?? null,
    } as any);
    if (error) {
      toast.error("Kunne ikke logge aktivitet: " + error.message);
      return false;
    }
    return true;
  }

  async function openInOutlook() {
    if (!recipient.trim()) {
      toast.error("Modtager mangler");
      return;
    }
    const mailto =
      `mailto:${encodeURIComponent(recipient.trim())}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
    // Log først så vi har det selvom klienten kapper
    const ok = await logActivity();
    window.location.href = mailto;
    if (ok) {
      toast.success("Mail åbnet i Outlook og registreret på kunden");
      onLogged?.();
      onOpenChange(false);
    }
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Brødtekst kopieret");
    } catch {
      toast.error("Kunne ikke kopiere");
    }
  }

  const totalMailtoLen =
    encodeURIComponent(recipient).length +
    encodeURIComponent(subject).length +
    encodeURIComponent(body).length;
  const tooLong = totalMailtoLen > MAILTO_WARN_LIMIT;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Skriv mail til {companyName}
          </DialogTitle>
        </DialogHeader>

        {!purpose ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-2">
              Vælg formål — AI'en skriver et udkast tilpasset situationen.
            </p>
            {PURPOSES.map((p) => (
              <Card
                key={p.key}
                className="p-4 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => pickPurpose(p.key)}
              >
                <div className="font-medium text-sm">{p.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {p.description}
                </div>
              </Card>
            ))}
          </div>
        ) : generating ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">
              <Sparkles className="h-3.5 w-3.5 inline mr-1" />
              AI skriver udkast…
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block">Til</Label>
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="modtager@example.com"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Emne</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Brødtekst</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="font-sans"
              />
            </div>
            {tooLong && (
              <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  Teksten er lang ({totalMailtoLen} tegn). Nogle mailklienter
                  kan kappe den ved åbning — brug "Kopiér brødtekst" som backup.
                </div>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Når du åbner i Outlook, logges mailen automatisk på kunden. Ingen
              CC til crm@frellsen.dk — det er ikke nødvendigt.
            </div>
          </div>
        )}

        {purpose && !generating && (
          <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
            <Button variant="ghost" onClick={() => setPurpose(null)}>
              ← Vælg andet formål
            </Button>
            <Button variant="outline" onClick={copyBody}>
              <Copy className="h-4 w-4 mr-1.5" /> Kopiér brødtekst
            </Button>
            <Button onClick={openInOutlook}>
              <ExternalLink className="h-4 w-4 mr-1.5" /> Åbn i Outlook
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
