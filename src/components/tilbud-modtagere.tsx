import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Copy, Loader2, Mail, Plus, Users } from "lucide-react";
import { toast } from "sonner";
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

function statusTekst(m: Modtager): string {
  const dele: string[] = [];
  if (!m.sendt_at) dele.push("Ikke sendt");
  else if (m.antal_aabninger > 0)
    dele.push(`Åbnet ${m.antal_aabninger} ${m.antal_aabninger === 1 ? "gang" : "gange"} · seneste ${datoTid(m.seneste_aabnet_at)}`);
  else dele.push(`Sendt ${dato(m.sendt_at)}`);
  if (m.downloadet_at) dele.push(`Downloadet ${datoTid(m.downloadet_at)}`);
  return dele.join(" · ");
}

/** Modtagerlinks og åbningssporing for et PDF-tilbud. */
type Kontakt = { id: string; name: string; title: string | null; email: string | null; phone: string | null };

export function TilbudModtagere({ quoteId, companyId }: { quoteId: string; companyId: string }) {
  const qc = useQueryClient();
  const [soeg, setSoeg] = useState("");
  const [valgt, setValgt] = useState<Kontakt | null>(null);
  const [manglerEmail, setManglerEmail] = useState("");
  const [nyOpen, setNyOpen] = useState(false);
  const [nNavn, setNNavn] = useState("");
  const [nTitel, setNTitel] = useState("");
  const [nEmail, setNEmail] = useState("");
  const [nTelefon, setNTelefon] = useState("");
  const [saving, setSaving] = useState(false);
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

  const kontakterQuery = useQuery({
    queryKey: ["quote-modtagere-kontakter", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, name, title, email, phone")
        .eq("company_id", companyId)
        .order("is_primary", { ascending: false })
        .order("name");
      return (data ?? []) as Kontakt[];
    },
  });

  const mailKlarQuery = useQuery({
    queryKey: ["tilbud-mail-klar"],
    queryFn: () => mailKlarFn(),
    staleTime: 60_000,
  });
  const mailKlar = mailKlarQuery.data?.klar === true;

  async function tilfoejModtager(kontaktId: string | null, n: string, e: string) {
    setSaving(true);
    const { error } = await supabase
      .from("quote_recipients")
      .insert({ quote_id: quoteId, navn: n, email: e, contact_id: kontaktId });
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke tilføje modtager: " + error.message);
      return false;
    }
    toast.success(`Modtager ${n} tilføjet`);
    qc.invalidateQueries({ queryKey: ["quote-modtagere", quoteId] });
    return true;
  }

  async function vaelgKontakt(k: Kontakt) {
    if (k.email) {
      if (await tilfoejModtager(k.id, k.name, k.email)) setSoeg("");
      return;
    }
    setValgt(k);
    setManglerEmail("");
  }

  async function gemEmailOgTilfoej() {
    if (!valgt) return;
    const e = manglerEmail.trim();
    if (!e) {
      toast.error("Skriv kontaktpersonens e-mail");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("contacts").update({ email: e }).eq("id", valgt.id);
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke gemme e-mail: " + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["quote-modtagere-kontakter", companyId] });
    if (await tilfoejModtager(valgt.id, valgt.name, e)) {
      setValgt(null);
      setSoeg("");
    }
  }

  async function opretKontaktOgTilfoej() {
    const n = nNavn.trim();
    const e = nEmail.trim();
    if (!n || !e) {
      toast.error("Navn og e-mail er påkrævet");
      return;
    }
    setSaving(true);
    const { data: k, error } = await supabase
      .from("contacts")
      .insert({ company_id: companyId, name: n, title: nTitel.trim() || null, email: e, phone: nTelefon.trim() || null, kilde: "crm" })
      .select("id")
      .single();
    setSaving(false);
    if (error || !k) {
      toast.error("Kunne ikke oprette kontaktperson: " + (error?.message ?? "ukendt fejl"));
      return;
    }
    qc.invalidateQueries({ queryKey: ["quote-modtagere-kontakter", companyId] });
    if (await tilfoejModtager(k.id, n, e)) {
      setNyOpen(false);
      setNNavn(""); setNTitel(""); setNEmail(""); setNTelefon("");
    }
  }

  async function kopier(m: Modtager) {
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
        toast.error("Mailafsendelse er ikke sat op endnu — brug Kopiér link");
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

  const modtagere = modtagereQuery.data ?? [];
  const alleKontakter = kontakterQuery.data ?? [];
  const q = soeg.trim().toLowerCase();
  const kontakter = (q
    ? alleKontakter.filter((k) =>
        k.name.toLowerCase().includes(q) ||
        (k.title ?? "").toLowerCase().includes(q) ||
        (k.email ?? "").toLowerCase().includes(q))
    : alleKontakter
  ).slice(0, 8);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Users className="h-4 w-4" /> Modtagere
      </h3>

      {modtagere.length > 0 && (
        <div className="divide-y rounded-md border">
          {modtagere.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {m.navn} <span className="text-muted-foreground font-normal">· {m.email}</span>
                </div>
                <div className="text-xs text-muted-foreground">{statusTekst(m)}</div>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => kopier(m)}>
                <Copy className="h-3.5 w-3.5" /> Kopiér link
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={!mailKlar}
                        onClick={() => {
                          setMailTekst(MAIL_DEFAULT);
                          setMailTil(m);
                        }}
                      >
                        <Mail className="h-3.5 w-3.5" /> Send på mail
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!mailKlar && (
                    <TooltipContent>Mailafsendelse er ikke sat op endnu — brug Kopiér link</TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border p-3 space-y-2">
        {kontakter.length > 0 && (
          <Select
            value="__manuelt"
            onValueChange={(v) => {
              const k = kontakter.find((x) => x.id === v);
              if (k) {
                setNavn(k.name);
                setEmail(k.email ?? "");
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Vælg blandt virksomhedens kontakter…" />
            </SelectTrigger>
            <SelectContent>
              {kontakter.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.name} · {k.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs mb-1 block">Navn</Label>
            <Input value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="Navn" className="h-8" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">E-mail</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="navn@firma.dk"
              type="email"
              className="h-8"
            />
          </div>
        </div>
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={tilfoej} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Tilføj modtager
        </Button>
      </div>

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
    </div>
  );
}
