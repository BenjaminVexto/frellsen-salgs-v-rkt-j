import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Copy, Loader2, Mail, Plus } from "lucide-react";
import { toast } from "sonner";
import { ContactDialog } from "@/components/kontaktpersoner-sektion";
import type { Location } from "@/components/lokationer-sektion";
import { sendTilbudMail, tilbudMailKlar } from "@/lib/tilbud-modtagere.functions";

const MAIL_DEFAULT = "Tak for et godt møde. Her er tilbuddet som aftalt.";

type Kontakt = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  kilde: string;
  is_primary: boolean;
};

type ModtagerRef = { contact_id: string | null; email: string };

/**
 * Trin 2 "Send til": vælg modtagere blandt virksomhedens kontaktpersoner.
 * Bruges både i upload-dialogen og som "Send til flere" på et eksisterende tilbud.
 */
export function TilbudSendTil({
  quoteId,
  companyId,
  onLuk,
}: {
  quoteId: string;
  companyId: string;
  onLuk: () => void;
}) {
  const qc = useQueryClient();
  const [valgte, setValgte] = useState<Set<string>>(new Set());
  const [emailFor, setEmailFor] = useState<Kontakt | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [nyKontakt, setNyKontakt] = useState(false);
  const [busy, setBusy] = useState(false);
  const mailKlarFn = useServerFn(tilbudMailKlar);
  const sendMailFn = useServerFn(sendTilbudMail);

  const kontakterQuery = useQuery({
    queryKey: ["tilbud-send-kontakter", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, name, title, email, phone, kilde, is_primary")
        .eq("company_id", companyId)
        .order("is_primary", { ascending: false })
        .order("name");
      return (data ?? []) as Kontakt[];
    },
  });

  const modtagereQuery = useQuery({
    queryKey: ["quote-modtagere", quoteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("quote_recipients")
        .select("contact_id, email")
        .eq("quote_id", quoteId);
      return (data ?? []) as ModtagerRef[];
    },
  });

  const locationsQuery = useQuery({
    queryKey: ["tilbud-send-lokationer", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("locations")
        .select("id, city, address, visma_delivery_no")
        .eq("company_id", companyId);
      return (data ?? []) as unknown as Location[];
    },
  });

  const mailKlarQuery = useQuery({
    queryKey: ["tilbud-mail-klar"],
    queryFn: () => mailKlarFn(),
    staleTime: 60_000,
  });
  const mailKlar = mailKlarQuery.data?.klar === true;

  const kontakter = kontakterQuery.data ?? [];
  const allerede = new Set(
    (modtagereQuery.data ?? []).map((m) => m.contact_id).filter(Boolean) as string[],
  );

  function skift(k: Kontakt) {
    if (allerede.has(k.id)) return;
    if (valgte.has(k.id)) {
      setValgte((s) => {
        const n = new Set(s);
        n.delete(k.id);
        return n;
      });
      if (emailFor?.id === k.id) setEmailFor(null);
      return;
    }
    if (!k.email) {
      setEmailFor(k);
      setEmailInput("");
      return;
    }
    setValgte((s) => new Set(s).add(k.id));
  }

  async function gemEmail() {
    if (!emailFor) return;
    const e = emailInput.trim();
    if (!e) {
      toast.error("Skriv kontaktpersonens e-mail");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("contacts").update({ email: e }).eq("id", emailFor.id);
    setBusy(false);
    if (error) {
      toast.error("Kunne ikke gemme e-mail: " + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["tilbud-send-kontakter", companyId] });
    setValgte((s) => new Set(s).add(emailFor.id));
    setEmailFor(null);
  }

  /** Opretter quote_recipients for valgte kontakter og returnerer dem med token. */
  async function opretValgte(): Promise<{ id: string; navn: string; email: string; token: string; sendt_at: string | null }[]> {
    const valgteKontakter = kontakter.filter((k) => valgte.has(k.id) && k.email);
    let nye: { id: string; navn: string; email: string; token: string; sendt_at: string | null }[] = [];
    if (valgteKontakter.length > 0) {
      const { data, error } = await supabase
        .from("quote_recipients")
        .insert(valgteKontakter.map((k) => ({ quote_id: quoteId, navn: k.name, email: k.email!, contact_id: k.id })))
        .select("id, navn, email, token, sendt_at");
      if (error) throw error;
      nye = (data ?? []) as typeof nye;
    }
    // Eksisterende modtagere for valgte kontakter (hvis man genåbner trin 2)
    const { data: eks } = await supabase
      .from("quote_recipients")
      .select("id, navn, email, token, sendt_at")
      .eq("quote_id", quoteId)
      .in("contact_id", Array.from(valgte));
    const alle = [...nye, ...((eks ?? []) as typeof nye)];
    const unik = new Map(alle.map((m) => [m.id, m]));
    return Array.from(unik.values());
  }

  async function kopierLinks() {
    if (valgte.size === 0) {
      toast.error("Vælg mindst én modtager — eller tryk Send senere");
      return;
    }
    setBusy(true);
    try {
      const modtagere = await opretValgte();
      if (modtagere.length === 0) {
        toast.error("Ingen modtagere med e-mail valgt");
        return;
      }
      const linjer = modtagere.map((m) => `${m.navn}: ${window.location.origin}/t/${m.token}`);
      try {
        await navigator.clipboard.writeText(linjer.join("\n"));
      } catch {
        window.prompt("Kopiér linkene:", linjer.join("\n"));
      }
      const nu = new Date().toISOString();
      await supabase
        .from("quote_recipients")
        .update({ sendt_at: nu })
        .in("id", modtagere.map((m) => m.id))
        .is("sendt_at", null);
      qc.invalidateQueries({ queryKey: ["quote-modtagere", quoteId] });
      toast.success(`${modtagere.length} ${modtagere.length === 1 ? "link" : "links"} kopieret`);
      onLuk();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke oprette modtagere");
    } finally {
      setBusy(false);
    }
  }

  async function sendMails() {
    if (valgte.size === 0) {
      toast.error("Vælg mindst én modtager — eller tryk Send senere");
      return;
    }
    setBusy(true);
    try {
      const modtagere = await opretValgte();
      for (const m of modtagere) {
        const res = await sendMailFn({
          data: { recipient_id: m.id, tekst: MAIL_DEFAULT, origin: window.location.origin },
        });
        if (!res.ok) throw new Error("Mailafsendelse er ikke sat op endnu");
      }
      qc.invalidateQueries({ queryKey: ["quote-modtagere", quoteId] });
      toast.success(`Mail sendt til ${modtagere.length} ${modtagere.length === 1 ? "modtager" : "modtagere"}`);
      onLuk();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke sende mail");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Vælg hvem tilbuddet skal sendes til. Hver modtager får sit eget personlige link.
      </p>

      {kontakter.length === 0 && !kontakterQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Ingen kontaktpersoner på virksomheden endnu.</p>
      ) : (
        <div className="divide-y rounded-md border max-h-72 overflow-y-auto">
          {kontakter.map((k) => {
            const erValgt = valgte.has(k.id);
            const erModtager = allerede.has(k.id);
            return (
              <div key={k.id}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-muted/60 disabled:opacity-60"
                  onClick={() => skift(k)}
                  disabled={busy || erModtager}
                >
                  <Checkbox checked={erValgt || erModtager} disabled={erModtager} className="pointer-events-none" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{k.name}</span>
                    {k.title && <span className="text-muted-foreground"> · {k.title}</span>}
                    <span className={`block text-xs ${k.email ? "text-muted-foreground" : "text-amber-600"}`}>
                      {erModtager ? `${k.email ?? ""} · allerede modtager` : (k.email ?? "E-mail mangler – klik for at tilføje")}
                    </span>
                  </span>
                </button>
                {emailFor?.id === k.id && (
                  <div className="flex items-center gap-2 px-3 pb-2 pl-10">
                    <Input
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="navn@firma.dk"
                      type="email"
                      className="h-8"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && gemEmail()}
                    />
                    <Button size="sm" className="h-8" onClick={gemEmail} disabled={busy}>
                      Gem
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setNyKontakt(true)}>
        <Plus className="h-3.5 w-3.5" /> Ny kontaktperson
      </Button>

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onLuk} disabled={busy}>
          Send senere
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="outline" className="gap-1.5" disabled={!mailKlar || busy} onClick={sendMails}>
                  <Mail className="h-4 w-4" /> Send på mail
                </Button>
              </span>
            </TooltipTrigger>
            {!mailKlar && (
              <TooltipContent>Mailafsendelse er ikke sat op endnu — brug Kopiér links</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        <Button className="gap-1.5" onClick={kopierLinks} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          Kopiér links
        </Button>
      </div>

      <ContactDialog
        open={nyKontakt}
        onOpenChange={setNyKontakt}
        companyId={companyId}
        locations={locationsQuery.data ?? []}
        existing={null}
        contacts={[]}
        onSaved={() => {
          setNyKontakt(false);
          qc.invalidateQueries({ queryKey: ["tilbud-send-kontakter", companyId] });
        }}
      />
    </div>
  );
}
