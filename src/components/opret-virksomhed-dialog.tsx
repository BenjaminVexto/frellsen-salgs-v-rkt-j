import { useState, type ReactNode } from "react";
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
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Link, useNavigate } from "@tanstack/react-router";

type Step = "cvr" | "details";

type CvrLookup = {
  name?: string;
  address?: string;
  zip?: string;
  city?: string;
  industry?: string;
  employees?: number | null;
  phone?: string;
  email?: string;
};

function normCvr(s: string) {
  return s.replace(/\D/g, "").slice(0, 8);
}

async function lookupCvr(cvr: string): Promise<CvrLookup | null> {
  try {
    const res = await fetch(
      `https://cvrapi.dk/api?search=${encodeURIComponent(cvr)}&country=dk`,
      { headers: { "User-Agent": "Lovable-CRM" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.error) return null;
    const addr = [data.address].filter(Boolean).join(" ");
    return {
      name: data.name,
      address: addr || undefined,
      zip: data.zipcode ? String(data.zipcode) : undefined,
      city: data.city,
      industry: data.industrydesc,
      employees: typeof data.employees === "number" ? data.employees : null,
      phone: data.phone ? String(data.phone) : undefined,
      email: data.email,
    };
  } catch {
    return null;
  }
}

export function OpretVirksomhedDialog({ trigger }: { trigger: ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("cvr");
  const [cvr, setCvr] = useState("");
  const [looking, setLooking] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [existingName, setExistingName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  // Felter
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [industry, setIndustry] = useState("");
  const [employees, setEmployees] = useState<string>("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setStep("cvr");
    setCvr("");
    setExistingId(null);
    setExistingName(null);
    setNotFound(false);
    setName(""); setAddress(""); setZip(""); setCity(""); setIndustry("");
    setEmployees(""); setContactPerson(""); setPhone(""); setEmail(""); setNotes("");
  }

  async function handleLookup() {
    const c = normCvr(cvr);
    if (c.length !== 8) {
      toast.error("Indtast et gyldigt 8-cifret CVR-nummer");
      return;
    }
    setLooking(true);
    setExistingId(null);
    setExistingName(null);
    setNotFound(false);

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

    // 2) CVR-opslag
    const data = await lookupCvr(c);
    if (!data || !data.name) {
      setNotFound(true);
      setStep("details");
      setLooking(false);
      return;
    }
    setName(data.name ?? "");
    setAddress(data.address ?? "");
    setZip(data.zip ?? "");
    setCity(data.city ?? "");
    setIndustry(data.industry ?? "");
    setEmployees(data.employees != null ? String(data.employees) : "");
    setPhone(data.phone ?? "");
    setEmail(data.email ?? "");
    setStep("details");
    setLooking(false);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Navn er påkrævet");
      return;
    }
    setSaving(true);
    const payload: any = {
      cvr: normCvr(cvr),
      name: name.trim(),
      address: address.trim() || null,
      zip: zip.trim() || null,
      city: city.trim() || null,
      industry: industry.trim() || null,
      employees: employees ? parseInt(employees, 10) || null : null,
      phone: phone.trim() || null,
      email: email.trim() || null,
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
    // Tilføj første note som aktivitet, hvis udfyldt
    if (notes.trim() && auth.user?.id) {
      await supabase.from("activities").insert({
        company_id: data.id,
        created_by: auth.user.id,
        activity_type: "note" as any,
        note: notes.trim(),
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
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Opret virksomhed</DialogTitle>
        </DialogHeader>

        {step === "cvr" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="cvr-input">CVR-nummer</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="cvr-input"
                  value={cvr}
                  onChange={(e) => setCvr(e.target.value)}
                  placeholder="12345678"
                  inputMode="numeric"
                  maxLength={8}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLookup();
                  }}
                />
                <Button onClick={handleLookup} disabled={looking}>
                  {looking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-1" /> Slå op
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Vi slår CVR op via cvrapi.dk og udfylder navn, adresse og branche automatisk.
              </p>
            </div>

            {existingId && (
              <Card className="p-3 border-warning/40 bg-warning/5 flex gap-2 items-start">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="text-sm">
                  Denne virksomhed findes allerede i systemet:{" "}
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
          </div>
        )}

        {step === "details" && (
          <div className="space-y-3">
            {notFound && (
              <Card className="p-3 border-warning/40 bg-warning/5 flex gap-2 items-start">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="text-sm">CVR ikke fundet — udfyld manuelt</div>
              </Card>
            )}
            <Field label="Navn *" value={name} onChange={setName} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Postnr" value={zip} onChange={setZip} />
              <Field label="By" value={city} onChange={setCity} />
            </div>
            <Field label="Adresse" value={address} onChange={setAddress} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Branche" value={industry} onChange={setIndustry} />
              <Field label="Antal ansatte" value={employees} onChange={setEmployees} type="number" />
            </div>
            <Field label="Kontaktperson" value={contactPerson} onChange={setContactPerson} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Direkte telefon" value={phone} onChange={setPhone} />
              <Field label="Email" value={email} onChange={setEmail} type="email" />
            </div>
            <div>
              <Label>Noter / første kontekst</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep("cvr")}>
                Tilbage
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gem"}
              </Button>
            </div>
          </div>
        )}
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
