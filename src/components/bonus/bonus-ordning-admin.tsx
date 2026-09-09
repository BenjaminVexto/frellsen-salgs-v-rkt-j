import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { beskrivOrdning, langDato, type BonusOrdning } from "@/lib/bonus-ordning";

type Form = Omit<BonusOrdning, "id" | "user_id" | "gyldig_til" | "created_at" | "created_by"> & {
  gyldig_fra: string;
};

const tomForm = (): Form => ({
  gyldig_fra: `${new Date().getFullYear()}-01-01`,
  db_provision_pct: 0,
  db_privat: true,
  db_offentlig: true,
  bonus_wittenborg: 500,
  bonus_animo: 500,
  bonus_rex: 750,
  maskin_privat: true,
  maskin_offentlig: true,
  maskin_salg: true,
  maskin_leje: true,
  maskin_brugt: true,
});

/** Måneden før en given 1.-i-måneden-dato. */
const sidsteDagFoer = (foersteIMaaned: string) => {
  const [y, m] = foersteIMaaned.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 0));
  return d.toISOString().slice(0, 10);
};

/** Bonusordninger for én bruger — kun admin. Ny ordning lukker den foregående. */
export function BonusOrdningAdmin({ userId }: { userId: string }) {
  const [liste, setListe] = useState<BonusOrdning[]>([]);
  const [loading, setLoading] = useState(true);
  const [opretter, setOpretter] = useState(false);
  const [gemmer, setGemmer] = useState(false);
  const [form, setForm] = useState<Form>(tomForm());
  const [maaned, setMaaned] = useState(`${new Date().getFullYear()}-01`);

  const hent = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("bonus_ordning")
      .select("*")
      .eq("user_id", userId)
      .order("gyldig_fra", { ascending: false });
    if (error) toast.error(error.message);
    setListe((data ?? []) as BonusOrdning[]);
    setLoading(false);
  };

  useEffect(() => {
    void hent();
    setOpretter(false);
    setForm(tomForm());
  }, [userId]);

  const gem = async () => {
    const fra = `${maaned}-01`;
    setGemmer(true);
    try {
      // Den hidtil løbende ordning lukkes måneden før den nye starter.
      const foregaaende = liste.find((o) => o.gyldig_fra < fra && !o.gyldig_til);
      if (foregaaende) {
        const { error } = await (supabase as any)
          .from("bonus_ordning")
          .update({ gyldig_til: sidsteDagFoer(fra) })
          .eq("id", foregaaende.id);
        if (error) throw new Error(error.message);
      }
      const { error } = await (supabase as any).from("bonus_ordning").insert({
        ...form,
        gyldig_fra: fra,
        user_id: userId,
      });
      if (error) throw new Error(error.message);
      toast.success("Bonusordning oprettet");
      setOpretter(false);
      setForm(tomForm());
      await hent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke oprette ordningen");
    } finally {
      setGemmer(false);
    }
  };

  const num = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Satserne gælder kun i deres egen periode, så en ny sats ændrer ikke måneder, der allerede er
        opgjort.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Henter…
        </div>
      ) : liste.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen bonusordninger endnu.</p>
      ) : (
        <div className="space-y-2">
          {liste.map((o) => (
            <div key={o.id} className="rounded-md border p-3 text-sm">
              <div className="font-medium">
                {langDato(o.gyldig_fra)} – {o.gyldig_til ? langDato(o.gyldig_til) : "løbende"}
              </div>
              <div className="text-xs text-muted-foreground">{beskrivOrdning(o)}</div>
            </div>
          ))}
        </div>
      )}

      {!opretter ? (
        <Button size="sm" variant="outline" onClick={() => setOpretter(true)}>
          <Plus className="h-4 w-4 mr-1" /> Ny ordning
        </Button>
      ) : (
        <div className="rounded-md border p-3 space-y-4">
          <div>
            <Label>Virkning fra måned</Label>
            <Input type="month" value={maaned} onChange={(e) => setMaaned(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">
              Den foregående ordning lukkes automatisk måneden før.
            </p>
          </div>

          <div className="space-y-2">
            <Label>DB-provision</Label>
            <div className="flex items-center gap-2">
              <Input
                className="w-24"
                value={String(form.db_provision_pct)}
                onChange={(e) => setForm({ ...form, db_provision_pct: num(e.target.value) })}
              />
              <span className="text-sm text-muted-foreground">% af dækningsbidrag</span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.db_privat}
                onCheckedChange={(v) => setForm({ ...form, db_privat: v === true })}
              />
              Private kunder
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.db_offentlig}
                onCheckedChange={(v) => setForm({ ...form, db_offentlig: v === true })}
              />
              Offentlige kunder
            </label>
          </div>

          <div className="space-y-2">
            <Label>Maskinbonus (kr. pr. maskine)</Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["bonus_wittenborg", "Wittenborg"],
                  ["bonus_animo", "Animo"],
                  ["bonus_rex", "Rex-Royal"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    value={String(form[key])}
                    onChange={(e) => setForm({ ...form, [key]: num(e.target.value) })}
                  />
                </div>
              ))}
            </div>
            {(
              [
                ["maskin_privat", "Private kunder"],
                ["maskin_offentlig", "Offentlige kunder"],
                ["maskin_salg", "Salg tæller med"],
                ["maskin_leje", "Leje/udlån tæller med"],
                ["maskin_brugt", "Brugte maskiner tæller med"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form[key]}
                  onCheckedChange={(v) => setForm({ ...form, [key]: v === true })}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={gem} disabled={gemmer}>
              {gemmer && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Opret ordning
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpretter(false)}>
              Annullér
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
