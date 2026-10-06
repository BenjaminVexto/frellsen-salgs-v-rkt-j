import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, MapPin, Search, Building2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cvrAdresseSoeg, type AdresseHit, type CrmKonto } from "@/lib/cvr-adresse.functions";

const adr = (a: { address?: string | null; zip?: string | null; city?: string | null } | null | undefined) =>
  a ? [a.address, [a.zip, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";

/** Opretter lokation under eksisterende virksomhed og kobler P-nummeret. */
export async function opretLokationMedPnr(opts: {
  companyId: string;
  afdelingNr: number | null;
  hit: Pick<AdresseHit, "p_number" | "address" | "zip" | "city">;
  userId: string;
  eksisterendeLocationId?: string;
}): Promise<string> {
  let locationId = opts.eksisterendeLocationId;
  if (locationId) {
    const { error } = await supabase
      .from("locations")
      .update({ address: opts.hit.address, zip: opts.hit.zip, city: opts.hit.city })
      .eq("id", locationId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("locations")
      .insert({
        company_id: opts.companyId,
        address: opts.hit.address,
        zip: opts.hit.zip,
        city: opts.hit.city,
        is_primary: false,
        ...(opts.afdelingNr != null ? { afdeling_nr: opts.afdelingNr } : {}),
      } as any)
      .select("id")
      .single();
    if (error) throw error;
    locationId = data.id;
  }
  if (opts.afdelingNr != null) {
    const { error } = await supabase.from("location_pnr_link").upsert(
      {
        p_nummer: opts.hit.p_number,
        afdeling_nr: opts.afdelingNr,
        location_id: locationId,
        kilde: "manuel",
        oprettet_af: opts.userId,
      } as any,
      { onConflict: "p_nummer,location_id" },
    );
    if (error) throw error;
  }
  return locationId!;
}

export function AdresseSoegning({
  onCreateNew,
  onDone,
}: {
  onCreateNew: (hit: AdresseHit) => void;
  onDone: () => void;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const soeg = useServerFn(cvrAdresseSoeg);
  const [adresse, setAdresse] = useState("");
  const [postnr, setPostnr] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<AdresseHit[] | null>(null);
  const [cvrFejl, setCvrFejl] = useState<string | null>(null);
  const [valgt, setValgt] = useState<AdresseHit | null>(null);
  const [valgtKonto, setValgtKonto] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function run() {
    if (adresse.trim().length < 2 && !/^\d{4}$/.test(postnr.trim())) {
      toast.error("Skriv gade og nr. og/eller et postnr.");
      return;
    }
    setLoading(true);
    setValgt(null);
    try {
      const r = await soeg({ data: { adresse: adresse.trim(), postnr: postnr.trim() } });
      setHits(r.hits);
      setCvrFejl(r.cvrFejl);
    } catch (e: any) {
      toast.error("Søgning fejlede: " + (e?.message ?? "ukendt"));
    } finally {
      setLoading(false);
    }
  }

  function vaelg(h: AdresseHit) {
    setValgt(h);
    setValgtKonto(h.crm[0]?.id ?? "");
  }

  async function tilfoejLokation(konto: CrmKonto) {
    if (!valgt || !auth.user?.id) return;
    setSaving(true);
    try {
      const id = await opretLokationMedPnr({
        companyId: konto.id,
        afdelingNr: konto.afdeling_nr,
        hit: valgt,
        userId: auth.user.id,
      });
      toast.success(`Lokation tilføjet under ${konto.name}`);
      onDone();
      navigate({ to: "/virksomheder/$id", params: { id: konto.id }, hash: `location-${id}` });
    } catch (e: any) {
      toast.error("Kunne ikke tilføje lokation: " + (e?.message ?? "ukendt"));
    } finally {
      setSaving(false);
    }
  }

  if (valgt) {
    const konto = valgt.crm.find((k) => k.id === valgtKonto) ?? valgt.crm[0];
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setValgt(null)}>
          ← Tilbage til resultater
        </Button>
        <Card className="p-3 text-sm space-y-1">
          <div className="font-semibold">{valgt.name ?? "P-enhed"}</div>
          <div className="text-muted-foreground">{adr(valgt)} · P-nr. {valgt.p_number}</div>
          {valgt.hoved && (
            <div className="text-xs text-muted-foreground">
              Hovedselskab: {valgt.hoved.name} (CVR {valgt.cvr}) — {adr(valgt.hoved)}
            </div>
          )}
        </Card>

        {valgt.linkedLocation && (
          <Card className="p-3 border-warning/40 bg-warning/5 text-sm space-y-2">
            <div>
              Adressen er allerede kunde hos os: <strong>{valgt.linkedLocation.company_name}</strong> —{" "}
              {[valgt.linkedLocation.address, valgt.linkedLocation.city].filter(Boolean).join(", ")}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onDone();
                navigate({
                  to: "/virksomheder/$id",
                  params: { id: valgt.linkedLocation!.company_id },
                  hash: `location-${valgt.linkedLocation!.id}`,
                });
              }}
            >
              Gå til lokationen
            </Button>
          </Card>
        )}

        {valgt.crm.length > 0 ? (
          <div className="space-y-2">
            {valgt.crm.length > 1 && (
              <div className="space-y-1">
                <div className="text-sm font-medium">CVR'et findes på flere konti — vælg hvilken:</div>
                {valgt.crm.map((k) => (
                  <label key={k.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={valgtKonto === k.id}
                      onChange={() => setValgtKonto(k.id)}
                    />
                    {k.name}{k.city ? `, ${k.city}` : ""} · {k.locations.length} lokation(er)
                  </label>
                ))}
              </div>
            )}
            <Button className="w-full h-12" disabled={saving} onClick={() => konto && tilfoejLokation(konto)}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Tilføj som ny lokation under {konto?.name}
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onCreateNew(valgt)}>
              Opret alligevel som ny virksomhed
            </Button>
          </div>
        ) : (
          <Button className="w-full h-12" onClick={() => onCreateNew(valgt)}>
            Opret ny virksomhed med denne adresse som lokation
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2">
        <Input
          autoFocus
          className="h-12"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Gade og nr., fx Vesterbrogade 12"
        />
        <Input
          className="h-12"
          value={postnr}
          inputMode="numeric"
          maxLength={4}
          onChange={(e) => setPostnr(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Postnr."
        />
        <Button className="h-12" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-1">Søg</span>
        </Button>
      </div>
      {cvrFejl && (
        <p className="text-xs text-warning">CVR-registret svarede ikke ({cvrFejl}) — viser kun vores egne P-enheder.</p>
      )}
      {hits && hits.length === 0 && (
        <p className="text-sm text-muted-foreground">Ingen aktive P-enheder fundet på adressen.</p>
      )}
      {hits?.map((h) => (
        <button
          key={h.p_number}
          type="button"
          onClick={() => vaelg(h)}
          className="w-full text-left p-3 rounded-md border border-border hover:bg-accent/40 transition-colors space-y-1"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              {h.name ?? "Uden navn"}
            </div>
            <div className="text-xs text-muted-foreground shrink-0">P-nr. {h.p_number}</div>
          </div>
          <div className="text-sm text-muted-foreground">
            {adr(h)}{h.ansatte ? ` · ${h.ansatte} ansatte` : ""}
          </div>
          <div className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Building2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              {h.hoved?.name ?? "Hovedselskab ukendt"}
              {h.cvr ? ` · CVR ${h.cvr}` : ""}
              {h.hoved ? ` · ${adr(h.hoved)}` : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {h.linkedLocation ? (
              <Badge variant="outline" className="border-success/40 text-success">
                <CheckCircle2 className="h-3 w-3 mr-1" />Kunde hos os: {h.linkedLocation.company_name}
              </Badge>
            ) : h.crm.length > 0 ? (
              <Badge variant="outline" className="border-primary/40 text-primary">
                CVR findes i CRM: {h.crm.map((k) => `${k.name} (${k.locations.length} lok.)`).join(", ")}
              </Badge>
            ) : (
              <Badge variant="outline">Ikke i CRM</Badge>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
