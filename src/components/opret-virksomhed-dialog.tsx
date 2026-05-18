import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { cvrLookup } from "@/lib/cvr-lookup.functions";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Link, useNavigate } from "@tanstack/react-router";

function normCvr(s: string) {
  return s.replace(/\D/g, "").slice(0, 8);
}

export function OpretVirksomhedDialog({ trigger }: { trigger: ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const lookupFn = useServerFn(cvrLookup);
  const [open, setOpen] = useState(false);

  const [cvr, setCvr] = useState("");
  const [looking, setLooking] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [existingName, setExistingName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [foundName, setFoundName] = useState<string | null>(null);
  const [adProtection, setAdProtection] = useState(false);
  const [saving, setSaving] = useState(false);

  // Felter
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [industry, setIndustry] = useState("");
  const [employees, setEmployees] = useState<string>("");
  const [companyForm, setCompanyForm] = useState("");
  const [website, setWebsite] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [directPhone, setDirectPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const lastLookupCvr = useRef<string>("");

  function reset() {
    setCvr("");
    setExistingId(null);
    setExistingName(null);
    setNotFound(false);
    setFoundName(null);
    setAdProtection(false);
    setName(""); setAddress(""); setZip(""); setCity(""); setMunicipality("");
    setIndustry(""); setEmployees(""); setCompanyForm(""); setWebsite("");
    setContactPerson(""); setContactTitle(""); setPhone(""); setDirectPhone("");
    setEmail(""); setNotes("");
    lastLookupCvr.current = "";
  }

  // Auto-lookup ved 8 cifre
  useEffect(() => {
    const c = normCvr(cvr);
    if (c.length !== 8 || c === lastLookupCvr.current) return;
    lastLookupCvr.current = c;
    (async () => {
      setLooking(true);
      setExistingId(null);
      setExistingName(null);
      setNotFound(false);
      setFoundName(null);
      setAdProtection(false);

      // 1) Dublet-check
      const { data: existing } = await supabase
        .from("companies")
        .select("id, name")
        .eq("cvr", c)
        .maybeSingle();
      if (existing) {
        setExistingId(existing.id);
        setExistingName(existing.name);
        setLooking(false);
        return;
      }

      // 2) CVR-opslag via vores server fn
      try {
        const res = await lookupFn({ data: { type: "single", cvr: c } });
        if (!res.success) {
          setNotFound(true);
          setLooking(false);
          return;
        }
        const d = res.data as any;
        setFoundName(d.name);
        setAdProtection(!!d.ad_protection);
        setName(d.name ?? "");
        setAddress(d.address ?? "");
        setZip(d.zip ?? "");
        setCity(d.city ?? "");
        setMunicipality(d.municipality ?? "");
        setIndustry(d.main_branch_text ?? "");
        setEmployees(d.employees_interval ?? "");
        setCompanyForm(d.company_form ?? "");
        setWebsite(d.website ?? "");
        setPhone(d.phone ?? "");
        setEmail(d.email ?? "");
      } catch (e: any) {
        toast.error("CVR-opslag fejlede: " + (e?.message ?? "ukendt fejl"));
        setNotFound(true);
      } finally {
        setLooking(false);
      }
    })();
  }, [cvr, lookupFn]);

  async function handleSave() {
    if (existingId) {
      toast.error("Virksomheden findes allerede — kan ikke oprette dublet");
      return;
    }
    if (!name.trim()) {
      toast.error("Navn er påkrævet");
      return;
    }
    setSaving(true);
    const empNum = (() => {
      if (!employees) return null;
      const n = parseInt(employees, 10);
      if (!isNaN(n)) return n;
      const parts = employees.split("_").map((p) => parseInt(p, 10));
      if (!isNaN(parts[0])) return parts.length > 1 && !isNaN(parts[1])
        ? Math.round((parts[0] + parts[1]) / 2)
        : parts[0];
      return null;
    })();

    const payload: any = {
      cvr: normCvr(cvr) || null,
      name: name.trim(),
      address: address.trim() || null,
      zip: zip.trim() || null,
      city: city.trim() || null,
      municipality: municipality.trim() || null,
      industry: industry.trim() || null,
      employees: empNum,
      phone: (directPhone.trim() || phone.trim()) || null,
      email: email.trim() || null,
      website: website.trim() || null,
      contact_person: contactPerson.trim() || null,
      sources: ["manuel"],
      source_created_by: auth.user?.id ?? null,
      source_updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("companies")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      setSaving(false);
      toast.error("Kunne ikke oprette virksomhed: " + error.message);
      return;
    }
    // Første note som aktivitet
    const noteText = [
      contactTitle.trim() && `Titel: ${contactTitle.trim()}`,
      companyForm.trim() && `Virksomhedsform: ${companyForm.trim()}`,
      notes.trim(),
    ].filter(Boolean).join("\n");
    if (noteText && auth.user?.id) {
      await supabase.from("activities").insert({
        company_id: data.id,
        created_by: auth.user.id,
        activity_type: "note" as any,
        note: noteText,
      } as any);
    }
    setSaving(false);
    toast.success("Virksomhed oprettet");
    setOpen(false);
    reset();
    navigate({ to: "/virksomheder/$id", params: { id: data.id } });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Opret virksomhed</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="cvr-input">CVR-nummer</Label>
            <div className="relative mt-1">
              <Input
                id="cvr-input"
                value={cvr}
                onChange={(e) => setCvr(normCvr(e.target.value))}
                placeholder="12345678"
                inputMode="numeric"
                maxLength={8}
              />
              {looking && (
                <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {looking
                ? "Henter CVR-data..."
                : "Indtast 8 cifre — vi udfylder automatisk fra CVR-registret."}
            </p>
          </div>

          {existingId && (
            <Card className="p-3 border-warning/40 bg-warning/5 flex gap-2 items-start">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                Denne virksomhed findes allerede:{" "}
                <strong>{existingName}</strong>.{" "}
                <Link
                  to="/virksomheder/$id"
                  params={{ id: existingId }}
                  className="text-primary underline"
                  onClick={() => setOpen(false)}
                >
                  Åbn eksisterende kort
                </Link>
              </div>
            </Card>
          )}

          {!existingId && foundName && (
            <Card className="p-3 border-success/40 bg-success/5 flex gap-2 items-start">
              <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-medium">✅ CVR fundet: {foundName}</span> — data udfyldt.
              </div>
            </Card>
          )}

          {!existingId && adProtection && (
            <Card className="p-3 border-warning/40 bg-warning/5 flex gap-2 items-start">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                ⚠️ Denne virksomhed har <strong>reklamebeskyttelse</strong>. Kontakt kun
                hvis du har en eksisterende relation.
              </div>
            </Card>
          )}

          {!existingId && notFound && (
            <Card className="p-3 border-warning/40 bg-warning/5 flex gap-2 items-start">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">CVR ikke fundet i registret. Udfyld manuelt.</div>
            </Card>
          )}

          {!existingId && (
            <>
              <Field label="Navn *" value={name} onChange={setName} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Postnr" value={zip} onChange={setZip} />
                <Field label="By" value={city} onChange={setCity} />
              </div>
              <Field label="Adresse" value={address} onChange={setAddress} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Kommune" value={municipality} onChange={setMunicipality} />
                <Field label="Virksomhedsform" value={companyForm} onChange={setCompanyForm} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Branche" value={industry} onChange={setIndustry} />
                <Field label="Antal ansatte (interval)" value={employees} onChange={setEmployees} />
              </div>
              <Field label="Hjemmeside" value={website} onChange={setWebsite} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="CVR-telefon" value={phone} onChange={setPhone} />
                <Field label="Email" value={email} onChange={setEmail} type="email" />
              </div>

              <div className="pt-2 border-t">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Kontaktperson</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Navn" value={contactPerson} onChange={setContactPerson} />
                  <Field label="Titel" value={contactTitle} onChange={setContactTitle} />
                </div>
                <div className="mt-2">
                  <Field
                    label="Direkte telefon (hvis forskellig fra CVR-telefon)"
                    value={directPhone}
                    onChange={setDirectPhone}
                  />
                </div>
              </div>

              <div>
                <Label>Note / første kontekst</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleSave} disabled={saving || looking}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gem virksomhed"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
    </div>
  );
}
