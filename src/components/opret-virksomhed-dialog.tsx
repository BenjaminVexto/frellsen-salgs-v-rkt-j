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
import { AlertTriangle, CheckCircle2, Loader2, Search, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { cvrLookup, type CvrCompany } from "@/lib/cvr-lookup.functions";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Link, useNavigate } from "@tanstack/react-router";

function normCvr(s: string) {
  return s.replace(/\D/g, "").slice(0, 8);
}

type Step = "search" | "form";

export function OpretVirksomhedDialog({ trigger }: { trigger: ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const lookupFn = useServerFn(cvrLookup);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("search");

  // Søgning
  const [searchName, setSearchName] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CvrCompany[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [existingByCvr, setExistingByCvr] = useState<Record<string, { id: string; name: string }>>({});

  // CVR-direkte
  const [showCvrField, setShowCvrField] = useState(false);
  const [cvrDirect, setCvrDirect] = useState("");
  const [cvrLooking, setCvrLooking] = useState(false);

  // Form (step 2)
  const [selectedFromCvr, setSelectedFromCvr] = useState(false);
  const [cvr, setCvr] = useState("");
  const [adProtection, setAdProtection] = useState(false);
  const [foundName, setFoundName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [industry, setIndustry] = useState("");
  const [employees, setEmployees] = useState("");
  const [companyForm, setCompanyForm] = useState("");
  const [website, setWebsite] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [directPhone, setDirectPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  function resetAll() {
    setStep("search");
    setSearchName(""); setSearchLocation("");
    setResults([]); setSearchDone(false); setExistingByCvr({});
    setShowCvrField(false); setCvrDirect(""); setCvrLooking(false);
    setSelectedFromCvr(false); setCvr(""); setAdProtection(false); setFoundName(null);
    setName(""); setAddress(""); setZip(""); setCity(""); setMunicipality("");
    setIndustry(""); setEmployees(""); setCompanyForm(""); setWebsite("");
    setContactPerson(""); setContactTitle(""); setPhone(""); setDirectPhone("");
    setEmail(""); setNotes("");
  }

  // Debounced søgning
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  useEffect(() => {
    if (step !== "search") return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const navn = searchName.trim();
    if (navn.length < 2) {
      setResults([]); setSearchDone(false); setSearching(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const mySeq = ++searchSeq.current;
      setSearching(true);
      try {
        const res = await lookupFn({
          data: {
            type: "search",
            name: navn,
            location: searchLocation.trim() || undefined,
            size: 10,
          },
        });
        if (mySeq !== searchSeq.current) return;
        if (!res.success) {
          setResults([]); setSearchDone(true);
        } else {
          const arr = (Array.isArray(res.data) ? res.data : [res.data]) as CvrCompany[];
          setResults(arr);
          setSearchDone(true);
          // Tjek hvilke der allerede findes
          const cvrs = arr.map((c) => c.cvr).filter(Boolean);
          if (cvrs.length) {
            const { data: existing } = await supabase
              .from("companies")
              .select("id, name, cvr")
              .in("cvr", cvrs);
            const map: Record<string, { id: string; name: string }> = {};
            (existing ?? []).forEach((e: any) => {
              if (e.cvr) map[e.cvr] = { id: e.id, name: e.name };
            });
            if (mySeq === searchSeq.current) setExistingByCvr(map);
          } else {
            setExistingByCvr({});
          }
        }
      } catch (e: any) {
        if (mySeq === searchSeq.current) {
          toast.error("CVR-søgning fejlede: " + (e?.message ?? "ukendt fejl"));
          setResults([]); setSearchDone(true);
        }
      } finally {
        if (mySeq === searchSeq.current) setSearching(false);
      }
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchName, searchLocation, step, lookupFn]);

  function applyCvrCompany(d: CvrCompany) {
    setSelectedFromCvr(true);
    setCvr(d.cvr ?? "");
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
    setStep("form");
  }

  function pickResult(c: CvrCompany) {
    const existing = existingByCvr[c.cvr];
    if (existing) {
      toast.error("Virksomheden findes allerede");
      return;
    }
    applyCvrCompany(c);
  }

  function startManual() {
    setSelectedFromCvr(false);
    setCvr("");
    setFoundName(null);
    setAdProtection(false);
    setStep("form");
  }

  // Direkte CVR-opslag
  const lastDirectCvr = useRef("");
  useEffect(() => {
    const c = normCvr(cvrDirect);
    if (c.length !== 8 || c === lastDirectCvr.current) return;
    lastDirectCvr.current = c;
    (async () => {
      setCvrLooking(true);
      const { data: existing } = await supabase
        .from("companies")
        .select("id, name")
        .eq("cvr", c)
        .maybeSingle();
      if (existing) {
        toast.error(`Virksomheden findes allerede: ${existing.name}`);
        setCvrLooking(false);
        return;
      }
      try {
        const res = await lookupFn({ data: { type: "single", cvr: c } });
        if (!res.success) {
          toast.error("CVR ikke fundet i registret");
        } else {
          applyCvrCompany(res.data as CvrCompany);
        }
      } catch (e: any) {
        toast.error("CVR-opslag fejlede: " + (e?.message ?? "ukendt"));
      } finally {
        setCvrLooking(false);
      }
    })();
  }, [cvrDirect, lookupFn]);

  async function handleSave() {
    if (!name.trim()) { toast.error("Navn er påkrævet"); return; }
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
    const sources = selectedFromCvr ? ["cvr", "manuel"] : ["manuel"];
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
      sources,
      source_created_by: auth.user?.id ?? null,
      source_updated_at: new Date().toISOString(),
      assigned_to: auth.user?.id ?? null,
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
    resetAll();
    navigate({ to: "/virksomheder/$id", params: { id: data.id } });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetAll(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "search" ? "Find virksomhed i CVR" : "Opret virksomhed"}
          </DialogTitle>
        </DialogHeader>

        {step === "search" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tast virksomhedens navn — tilføj by eller postnummer for at finde den hurtigere
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  autoFocus
                  className="pl-9 h-12"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="Virksomhedsnavn..."
                />
              </div>
              <Input
                className="h-12"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                placeholder="By eller postnummer"
              />
            </div>

            {searching && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Søger i CVR-registret...
              </div>
            )}

            {!searching && searchDone && results.length === 0 && (
              <Card className="p-4 space-y-3">
                <p className="text-sm">
                  Ingen virksomheder fundet — prøv et andet søgeord eller opret manuelt uden CVR-opslag
                </p>
                <Button variant="outline" onClick={startManual}>Opret manuelt</Button>
              </Card>
            )}

            {results.length > 0 && (
              <div className="space-y-2">
                {results.map((c) => {
                  const existing = existingByCvr[c.cvr];
                  return (
                    <button
                      key={c.cvr}
                      type="button"
                      onClick={() => pickResult(c)}
                      className="w-full text-left min-h-[60px] p-3 rounded-md border border-border hover:bg-accent/40 transition-colors disabled:opacity-60"
                      disabled={!!existing}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{c.name}</span>
                            {existing && (
                              <span className="text-xs px-2 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">
                                Allerede i systemet
                              </span>
                            )}
                            {c.ad_protection && (
                              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                Reklamebeskyttet
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {[c.address, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                          </div>
                          {c.main_branch_text && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {c.main_branch_text}
                              {c.employees_interval ? ` · ${c.employees_interval} ansatte` : ""}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">CVR {c.cvr}</div>
                      </div>
                      {existing && (
                        <div className="mt-2">
                          <Link
                            to="/virksomheder/$id"
                            params={{ id: existing.id }}
                            className="text-primary text-sm underline"
                            onClick={() => setOpen(false)}
                          >
                            Gå til virksomhedskortet
                          </Link>
                        </div>
                      )}
                    </button>
                  );
                })}
                {results.length === 10 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    Viser de 10 bedste resultater. Tilføj by eller postnummer for at finde den rigtige hurtigere.
                  </p>
                )}
              </div>
            )}

            <div className="pt-2 border-t space-y-2">
              {!showCvrField ? (
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => setShowCvrField(true)}
                >
                  Kender du CVR-nummeret? Tast det direkte her
                </button>
              ) : (
                <div>
                  <Label htmlFor="cvr-direct">CVR-nummer</Label>
                  <div className="relative mt-1">
                    <Input
                      id="cvr-direct"
                      value={cvrDirect}
                      onChange={(e) => setCvrDirect(normCvr(e.target.value))}
                      placeholder="12345678"
                      inputMode="numeric"
                      maxLength={8}
                      className="h-12"
                    />
                    {cvrLooking && (
                      <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    )}
                  </div>
                </div>
              )}
              <div>
                <Button variant="ghost" size="sm" onClick={startManual}>
                  Opret uden CVR-opslag
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "form" && (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" onClick={() => setStep("search")} className="-ml-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Tilbage til søgning
            </Button>

            {selectedFromCvr && foundName && (
              <Card className="p-3 border-success/40 bg-success/5 flex gap-2 items-start">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                <div className="text-sm">
                  ✅ <strong>{foundName}</strong> — data hentet fra CVR
                </div>
              </Card>
            )}

            {adProtection && (
              <Card className="p-3 border-warning/40 bg-warning/5 flex gap-2 items-start">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="text-sm">
                  ⚠️ Denne virksomhed har <strong>reklamebeskyttelse</strong>. Kontakt kun
                  hvis du har en eksisterende relation.
                </div>
              </Card>
            )}

            {!selectedFromCvr && (
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
                <Field label="CVR-nummer (valgfrit)" value={cvr} onChange={(v) => setCvr(normCvr(v))} />
              </>
            )}

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
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gem virksomhed"}
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
