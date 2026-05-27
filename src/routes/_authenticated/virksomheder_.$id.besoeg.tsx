import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Phone, User, FileText, PlusCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import { RegistrerAktivitetDialogV2 } from "@/components/registrer-aktivitet-dialog-v2";
import { getActivityType, labelFor } from "@/lib/activity-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/virksomheder_/$id/besoeg")({
  component: BesoegsForberedelse,
});

function BesoegsForberedelse() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [primaryLocation, setPrimaryLocation] = useState<any>(null);
  const [primaryContact, setPrimaryContact] = useState<any>(null);
  const [lastActivity, setLastActivity] = useState<any>(null);
  const [competitorAgreement, setCompetitorAgreement] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [c, locs, contacts, acts, comp, opps, docs] = await Promise.all([
        supabase.from("companies").select("*").eq("id", id).maybeSingle(),
        supabase.from("locations").select("*").eq("company_id", id).order("is_primary", { ascending: false }).limit(1),
        supabase.from("contacts").select("*").eq("company_id", id).order("is_primary", { ascending: false }).limit(1),
        supabase.from("activities").select("*").eq("company_id", id).order("created_at", { ascending: false }).limit(1),
        supabase.from("competitor_assignments").select("*, competitors(name, frellsen_counter)").eq("company_id", id).order("contract_expires_at", { ascending: false }).limit(1),
        supabase.from("sales_opportunities").select("id, name, estimated_value, status").eq("company_id", id).not("status", "in", "(vundet,tabt)"),
        supabase.from("company_documents").select("id, filename").eq("company_id", id).limit(5),
      ]);
      setCompany(c.data);
      setPrimaryLocation(locs.data?.[0] ?? null);
      setPrimaryContact(contacts.data?.[0] ?? null);
      setLastActivity(acts.data?.[0] ?? null);
      setCompetitorAgreement(comp.data?.[0] ?? null);
      setOpportunities(opps.data ?? []);
      setDocuments(docs.data ?? []);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Indlæser…</div>;
  if (!company) return <div className="p-8">Virksomhed ikke fundet.</div>;

  const lastAct = getActivityType(lastActivity?.activity_type);
  const LastIcon = lastAct?.Icon;

  return (
    <div className="px-4 py-4 max-w-2xl mx-auto pb-32 md:pb-24">
      <Link
        to="/virksomheder/$id"
        params={{ id }}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Tilbage
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold leading-tight">{company.name}</h1>
        <div className="flex gap-2 mt-2 flex-wrap">
          <Badge variant="outline">{company.customer_type?.replace("_", " ")}</Badge>
          {company.visma_id && <Badge variant="secondary">Visma-kunde</Badge>}
        </div>
      </div>

      <Card className="p-4 mb-4 space-y-3">
        {(primaryLocation?.address || company.address) && (
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-base">
              {primaryLocation?.address ?? company.address}
              <div className="text-sm text-muted-foreground">
                {primaryLocation?.zip ?? company.zip} {primaryLocation?.city ?? company.city}
              </div>
            </div>
          </div>
        )}
        {primaryContact && (
          <div className="flex items-start gap-3">
            <User className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-base">
              {primaryContact.name}
              {primaryContact.phone && (
                <a href={`tel:${primaryContact.phone}`} className="block text-primary mt-0.5">
                  {primaryContact.phone}
                </a>
              )}
            </div>
          </div>
        )}
        {company.phone && !primaryContact?.phone && (
          <div className="flex items-start gap-3">
            <Phone className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <a href={`tel:${company.phone}`} className="text-base text-primary">{company.phone}</a>
          </div>
        )}
      </Card>

      {lastActivity && (
        <Section title="Seneste aktivitet">
          <div className="flex items-center gap-2 mb-1">
            {LastIcon && lastAct && (
              <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full", lastAct.bg, lastAct.color)}>
                <LastIcon className="h-3.5 w-3.5" />
                {lastAct.label}
              </span>
            )}
            {!lastAct && <Badge variant="outline">{labelFor(lastActivity.activity_type)}</Badge>}
            <span className="text-xs text-muted-foreground">
              {format(parseISO(lastActivity.created_at), "d. MMM yyyy", { locale: da })}
            </span>
          </div>
          {lastActivity.note && <p className="text-sm">{lastActivity.note}</p>}
        </Section>
      )}

      {competitorAgreement && (
        <Section title="Konkurrentaftale">
          <div className="text-sm">
            <div className="font-medium">{competitorAgreement.competitors?.name}</div>
            {competitorAgreement.contract_expires_at && (
              <div className="text-muted-foreground">
                Udløber {format(parseISO(competitorAgreement.contract_expires_at), "d. MMM yyyy", { locale: da })}
              </div>
            )}
            {competitorAgreement.competitors?.frellsen_counter && (
              <div className="mt-2 italic text-foreground/80">💬 "{competitorAgreement.competitors.frellsen_counter}"</div>
            )}
          </div>
        </Section>
      )}

      {opportunities.length > 0 && (
        <Section title="Åbne salgsmuligheder">
          {opportunities.map((o) => (
            <div key={o.id} className="flex justify-between text-sm py-1">
              <span>{o.name}</span>
              {o.estimated_value && (
                <span className="font-medium tabular-nums">
                  {Number(o.estimated_value).toLocaleString("da-DK")} kr.
                </span>
              )}
            </div>
          ))}
        </Section>
      )}

      {documents.length > 0 && (
        <Section title="Dokumenter">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-sm py-1">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {d.filename}
            </div>
          ))}
        </Section>
      )}

      <div className="fixed bottom-16 md:bottom-6 inset-x-0 px-4 z-30" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-2xl mx-auto">
          <Button
            size="lg"
            className="w-full h-14 text-base shadow-lg"
            onClick={() => setDialogOpen(true)}
          >
            <PlusCircle className="h-5 w-5 mr-2" /> Registrér aktivitet nu
          </Button>
        </div>
      </div>

      <RegistrerAktivitetDialogV2
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        companyId={id}
        userId={user?.id ?? ""}
        presetType="besøg"
        onSaved={() => navigate({ to: "/virksomheder/$id", params: { id } })}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 mb-3">
      <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
        {title}
      </h2>
      {children}
    </Card>
  );
}
