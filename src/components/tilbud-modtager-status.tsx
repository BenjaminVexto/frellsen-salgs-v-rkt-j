import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { TilbudSendTil } from "@/components/tilbud-send-til";
import { sendTilbudMail, tilbudMailKlar } from "@/lib/tilbud-modtagere.functions";

type Modtager = {
  id: string;
  navn: string;
  email: string;
  token: string;
  sendt_at: string | null;
  antal_aabninger: number;
  seneste_aabnet_at: string | null;
  downloadet_at: string | null;
};

const MAIL_DEFAULT = "Tak for et godt møde. Her er tilbuddet som aftalt.";

function dato(d: string | null) {
  return d ? new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : null;
}
function datoTid(d: string | null) {
  return d
    ? new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) +
        " " +
        new Date(d).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })
    : null;
}

export function modtagerStatusTekst(m: Modtager): string {
  const dele: string[] = [];
  if (!m.sendt_at) dele.push("Ikke sendt");
  else if (m.antal_aabninger > 0)
    dele.push(`Åbnet ${m.antal_aabninger} ${m.antal_aabninger === 1 ? "gang" : "gange"} · seneste ${datoTid(m.seneste_aabnet_at)}`);
  else dele.push(`Sendt ${dato(m.sendt_at)}`);
  if (m.downloadet_at) dele.push(`Downloadet ${datoTid(m.downloadet_at)}`);
  return dele.join(" · ");
}

/** Kompakt status pr. modtager + "Send til flere" / "Gensend". Bruges på tilbudsdetaljen og i Aftaler & tilbud. */
export function TilbudModtagerStatus({
  quoteId,
  companyId,
  aabnPdf,
}: {
  quoteId: string;
  companyId: string;
  /** Når sat, vises "Åbn PDF" med "Send til flere" som knap under i højre kolonne (bruges i Aftaler & tilbud). */
  aabnPdf?: () => void;
}) {
  const qc = useQueryClient();
  const [sendTilFlere, setSendTilFlere] = useState(false);
  const [mailTil, setMailTil] = useState<Modtager | null>(null);
  const [mailTekst, setMailTekst] = useState(MAIL_DEFAULT);
  const [sender, setSender] = useState(false);
  const mailKlarFn = useServerFn(tilbudMailKlar);
  const sendMailFn = useServerFn(sendTilbudMail);

  const modtagereQuery = useQuery({
    queryKey: ["quote-modtagere", quoteId],
    queryFn: async (): Promise<Modtager[]> => {
      const { data, error } = await supabase
        .from("quote_recipients")
        .select("id, navn, email, token, sendt_at, antal_aabninger, seneste_aabnet_at, downloadet_at")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Modtager[];
    },
  });

  const mailKlarQuery = useQuery({
    queryKey: ["tilbud-mail-klar"],
    queryFn: () => mailKlarFn(),
    staleTime: 60_000,
  });
  const mailKlar = mailKlarQuery.data?.klar === true;

  const modtagere = modtagereQuery.data ?? [];

  async function gensend(m: Modtager) {
    if (mailKlar) {
      setMailTekst(MAIL_DEFAULT);
      setMailTil(m);
      return;
    }
    const link = `${window.location.origin}/t/${m.token}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Kopiér linket:", link);
    }
    if (!m.sendt_at) {
      await supabase
        .from("quote_recipients")
        .update({ sendt_at: new Date().toISOString() })
        .eq("id", m.id)
        .is("sendt_at", null);
      qc.invalidateQueries({ queryKey: ["quote-modtagere", quoteId] });
    }
    toast.success(`Link til ${m.navn} kopieret`);
  }

  async function sendMail() {
    if (!mailTil) return;
    setSender(true);
    try {
      const res = await sendMailFn({
        data: { recipient_id: mailTil.id, tekst: mailTekst, origin: window.location.origin },
      });
      if (!res.ok) {
        toast.error("Mailafsendelse er ikke sat op endnu — brug Gensend til at kopiere linket");
        return;
      }
      toast.success(`Mail sendt til ${mailTil.navn}`);
      setMailTil(null);
      qc.invalidateQueries({ queryKey: ["quote-modtagere", quoteId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke sende mail");
    } finally {
      setSender(false);
    }
  }

  const modtagerliste = modtagere.map((m) => (
    <div key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium">{m.navn}</span>
        <span className="text-muted-foreground"> · {modtagerStatusTekst(m)}</span>
      </span>
      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => gensend(m)}>
        <Mail className="h-3 w-3" /> Gensend
      </Button>
    </div>
  ));

  const flereKnap = (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5 whitespace-nowrap"
      onClick={() => setSendTilFlere(true)}
    >
      <Send className="h-3.5 w-3.5" /> Send til flere
    </Button>
  );

  const dialogene = (
    <>
      <Dialog open={sendTilFlere} onOpenChange={setSendTilFlere}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send til flere</DialogTitle>
          </DialogHeader>
          {sendTilFlere && (
            <TilbudSendTil
              quoteId={quoteId}
              companyId={companyId}
              onLuk={() => {
                setSendTilFlere(false);
                qc.invalidateQueries({ queryKey: ["quote-modtagere", quoteId] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!mailTil} onOpenChange={(o) => !o && setMailTil(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send tilbud til {mailTil?.navn}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1 block">Personlig tekst</Label>
              <textarea
                className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm"
                value={mailTekst}
                onChange={(e) => setMailTekst(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Mailen indeholder en "Se tilbud"-knap med modtagerens personlige link.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMailTil(null)}>
                Annullér
              </Button>
              <Button onClick={sendMail} disabled={sender} className="gap-1.5">
                {sender ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  if (aabnPdf) {
    return (
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          {modtagerliste}
        </div>
        <div className="flex flex-col items-stretch gap-1.5 shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={aabnPdf}>
            Åbn PDF
          </Button>
          {flereKnap}
        </div>
        {dialogene}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {modtagerliste}
      <div>{flereKnap}</div>
      {dialogene}
    </div>
  );

}
