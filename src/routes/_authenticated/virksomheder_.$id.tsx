import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CustomerStatusBadge } from "@/components/customer-status-info";
import { MentionTextarea, NoteWithMentions } from "@/components/mention-textarea";
import {
  fetchMentionableUsers,
  createMentionNotifications,
  type MentionableUser,
} from "@/lib/mentions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getCompanyDeletionStats,
  adminDeleteCompany,
} from "@/lib/admin-companies.functions";
import { getAgreementByKp1 } from "@/lib/agreements.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  User,
  CalendarIcon,
  PlusCircle,
  FileText,
  ClipboardList,
  Trash2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { SourceBadges } from "@/components/source-badges";
import { LokationerSektion, type Location, type LocationContact } from "@/components/lokationer-sektion";
import { DokumenterSektion } from "@/components/dokumenter-sektion";
import { KonkurrentaftaleSektion } from "@/components/konkurrentaftale-sektion";
import { KontaktpersonerSektion, type ContactRow } from "@/components/kontaktpersoner-sektion";
import { RegistrerAktivitetDialogV2 } from "@/components/registrer-aktivitet-dialog-v2";
import { AiBriefingSektion } from "@/components/ai-briefing-sektion";

import { getActivityType, labelFor } from "@/lib/activity-types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Target } from "lucide-react";



type ActivityType = Database["public"]["Enums"]["activity_type"];
type AssignmentStatus = Database["public"]["Enums"]["assignment_status"];

export const Route = createFileRoute("/_authenticated/virksomheder_/$id")({
  component: VirksomhedsKort,
});

const customerTypeLabel: Record<string, string> = {
  nyt_emne: "Nyt emne",
  aktiv_kunde: "Aktiv kunde",
  sovende_kunde: "Sovende kunde",
  tidligere_kunde: "Tidligere kunde",
};
const customerTypeVariant: Record<string, "default" | "secondary" | "outline"> = {
  nyt_emne: "outline",
  aktiv_kunde: "default",
  sovende_kunde: "secondary",
  tidligere_kunde: "secondary",
};

const activityTypes: { value: ActivityType; label: string }[] = [
  { value: "telefonopkald" as ActivityType, label: "Telefonopkald" },
  { value: "besøg", label: "Besøg" },
  { value: "email", label: "Email" },
  { value: "tilbud_sendt", label: "Tilbud sendt" },
  { value: "møde", label: "Møde" },
  { value: "ikke_truffet" as ActivityType, label: "Ikke truffet" },
  { value: "opfølgning_aftalt" as ActivityType, label: "Opfølgning aftalt" },
  { value: "andet" as ActivityType, label: "Andet" },
];

const assignmentStatuses: { value: AssignmentStatus; label: string }[] = [
  { value: "ny", label: "Ny" },
  { value: "skal_kontaktes", label: "Skal kontaktes" },
  { value: "kontaktet", label: "Kontaktet" },
  { value: "talt_med", label: "Talt med" },
  { value: "møde_booket", label: "Møde booket" },
  { value: "tilbud_sendt", label: "Tilbud sendt" },
  { value: "ikke_relevant", label: "Ikke relevant" },
  { value: "senere_emne", label: "Senere emne" },
  { value: "vundet", label: "Vundet" },
  { value: "tabt", label: "Tabt" },
];

const STATUS_REQUIRES_FOLLOWUP: AssignmentStatus[] = [
  "talt_med",
  "møde_booket",
  "tilbud_sendt",
];

type Company = Database["public"]["Tables"]["companies"]["Row"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Activity = Database["public"]["Tables"]["activities"]["Row"];
type Assignment = Database["public"]["Tables"]["contact_list_assignments"]["Row"];
type Opportunity = Database["public"]["Tables"]["sales_opportunities"]["Row"];

type TabKey = "oversigt" | "aktivitet" | "lokationer" | "relationer" | "aftaler";


const firstFilled = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

function VirksomhedsKort() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const canWriteDocs = role === "admin" || role === "salgssupport";
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [assignedSellerName, setAssignedSellerName] = useState<string | null>(null);
  const [locationReloadKey, setLocationReloadKey] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);
  const [presetLocationId, setPresetLocationId] = useState<string | null>(null);
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("oversigt");
  const [vismaExpanded, setVismaExpanded] = useState(() => {
    try {
      return localStorage.getItem("visma_data_expanded") === "true";
    } catch {
      return false;
    }
  });
  const toggleVisma = () => {
    const next = !vismaExpanded;
    setVismaExpanded(next);
    try {
      localStorage.setItem("visma_data_expanded", String(next));
    } catch {}
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStats, setDeleteStats] = useState<{
    activities: number;
    opportunities: number;
    quotes: number;
    assignments: number;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fetchDeleteStats = useServerFn(getCompanyDeletionStats);
  const deleteCompanyFn = useServerFn(adminDeleteCompany);

  async function openDeleteDialog() {
    setDeleteStats(null);
    setDeleteOpen(true);
    try {
      const stats = await fetchDeleteStats({ data: { company_id: id } });
      setDeleteStats(stats);
    } catch (e: any) {
      toast.error("Kunne ikke hente statistik: " + e.message);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteCompanyFn({ data: { company_id: id } });
      toast.success("Virksomhed slettet");
      setDeleteOpen(false);
      navigate({ to: "/virksomheder" });
    } catch (e: any) {
      toast.error("Sletning fejlede: " + e.message);
    } finally {
      setDeleting(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: c },
      { data: ct },
      { data: a },
      { data: asg },
      { data: locs },
      { data: opps },
      { count: dcount },
    ] = await Promise.all([
      supabase.from("companies").select("*").eq("id", id).maybeSingle(),
      supabase.from("contacts").select("*").eq("company_id", id).order("is_primary", { ascending: false }),
      supabase.from("activities").select("*").eq("company_id", id).order("created_at", { ascending: false }),
      supabase.from("contact_list_assignments").select("*").eq("company_id", id),
      (supabase as any)
        .from("locations")
        .select("*")
        .eq("company_id", id)
        .order("is_primary", { ascending: false })
        .order("city", { ascending: true }),
      supabase
        .from("sales_opportunities")
        .select("*")
        .eq("company_id", id)
        .not("status", "in", "(vundet,tabt)")
        .order("created_at", { ascending: false }),
      supabase
        .from("company_documents")
        .select("id", { count: "exact", head: true })
        .eq("company_id", id),
    ]);
    setCompany(c ?? null);
    setContacts(ct ?? []);
    setActivities(a ?? []);
    setAssignments(asg ?? []);
    setLocations(((locs ?? []) as Location[]));
    setOpportunities((opps ?? []) as Opportunity[]);
    setDocCount(dcount ?? 0);

    // Hent navnet på den tildelte sælger (companies.assigned_to)
    const assignedId = (c as any)?.assigned_to as string | null | undefined;
    if (assignedId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", assignedId)
        .maybeSingle();
      setAssignedSellerName(prof?.full_name ?? "Ukendt sælger");
    } else {
      setAssignedSellerName(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Sync tab with URL hash on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (["oversigt", "aktivitet", "lokationer", "relationer", "aftaler"].includes(hash)) {
      setTab(hash as TabKey);
    }
  }, []);



  // Scroll to a specific activity if URL has #activity-<id>
  useEffect(() => {
    if (loading) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (!hash.startsWith("#activity-")) return;
    const id = hash.slice(1);
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "rounded");
        setTimeout(
          () => el.classList.remove("ring-2", "ring-primary", "rounded"),
          2500,
        );
      }
    });
  }, [loading, activities.length]);

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Indlæser…</div>;
  }
  if (!company) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground mb-4">Virksomhed ikke fundet eller ingen adgang.</p>
        <Button variant="outline" onClick={() => navigate({ to: "/virksomheder" })}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-6 max-w-[1600px] mx-auto pb-24 md:pb-6">
      <div className="mb-4">
        <Link
          to="/virksomheder"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Alle virksomheder
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_300px] gap-6">
        {/* VENSTRE — Stamdata */}
        <Card className="p-5 h-fit">
          <div className="flex items-start justify-between mb-3">
            <div className="bg-muted rounded-md p-2">
              <Building2 className="h-5 w-5" />
            </div>
            <CustomerStatusBadge
              type={company.customer_type}
              variant={(customerTypeVariant[company.customer_type] as any) ?? "outline"}
            />

          </div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h1 className="text-xl font-semibold leading-tight">{company.name}</h1>
          </div>
          <SourceBadges sources={(company as any).sources} />
          {(company as any).is_public && (
            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5 mt-2">
              Offentlig institution
            </Badge>
          )}
          {company.cvr ? (
            <p className="text-xs text-muted-foreground mb-4 mt-1">CVR {company.cvr}</p>
          ) : (company as any).is_public ? (
            <div className="mt-2 mb-4 space-y-1 text-xs text-muted-foreground">
              {(company as any).ean_number && <div>EAN {(company as any).ean_number}</div>}
              {(company as any).parent_cvr && (
                <div>Overordnet organisation · CVR {(company as any).parent_cvr}</div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2 mb-4">
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/40">
                {(company as any).ean_number ? "Ingen CVR (EAN registreret)" : "Mangler CVR"}
              </Badge>
              {!(company as any).ean_number && (
                <AddCvrInline companyId={company.id} onAdded={(v) => setCompany({ ...company, cvr: v })} />
              )}
            </div>
          )}

          {/* Tildelt sælger — fremhævet */}
          <div className="mb-4 rounded-md border bg-muted/40 px-3 py-2 flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
                Tildelt sælger
              </div>
              <div className="text-sm font-medium truncate mt-0.5">
                {assignedSellerName ?? (
                  <span className="text-muted-foreground italic font-normal">
                    Ikke tildelt
                  </span>
                )}
              </div>
            </div>
          </div>


          <div className="space-y-3 text-sm">
            {(() => {
              const primary = locations.find((l) => l.is_primary) ?? locations[0];
              const addr = firstFilled(primary?.address, company.address);
              const zip = firstFilled(primary?.zip, company.zip);
              const city = firstFilled(primary?.city, company.city);
              if (!addr && !zip && !city && !company.municipality) return null;
              return (
                <Row icon={<MapPin className="h-4 w-4" />}>
                  {addr && <div>{addr}</div>}
                  <div className="text-muted-foreground">
                    {[zip, city].filter(Boolean).join(" ")}
                  </div>
                  {company.municipality && (
                    <div className="text-xs text-muted-foreground">{company.municipality} Kommune</div>
                  )}
                </Row>
              );
            })()}
            {company.phone && (
              <Row icon={<Phone className="h-4 w-4" />}>
                <a href={`tel:${company.phone}`} className="hover:underline">{company.phone}</a>
              </Row>
            )}
            {company.email && (
              <Row icon={<Mail className="h-4 w-4" />}>
                <a href={`mailto:${company.email}`} className="hover:underline break-all">{company.email}</a>
              </Row>
            )}
            {company.website && (
              <Row icon={<Globe className="h-4 w-4" />}>
                <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`} target="_blank" rel="noreferrer" className="hover:underline break-all">
                  {company.website}
                </a>
              </Row>
            )}
          </div>

          <div className="border-t mt-4 pt-4 space-y-2 text-sm">
            {company.industry && <KV label="Branche" value={company.industry} />}
            {company.employees != null && <KV label="Medarbejdere" value={String(company.employees)} />}
            {company.turnover_12m != null && (
              <KV label="Omsætning (12 mdr.)" value={`${Number(company.turnover_12m).toLocaleString("da-DK")} kr.`} />
            )}
            {(company as any).ean_number && company.cvr && <KV label="EAN-nummer" value={(company as any).ean_number} />}
            {(company as any).parent_cvr && company.cvr && <KV label="Overordnet CVR" value={(company as any).parent_cvr} />}
            {company.source && <KV label="Kilde" value={company.source} />}
          </div>

          <AgreementCardSection segment1={(company as any).customer_segment_1 ?? null} />

          {((company as any).created_in_visma ||
            company.last_purchase_date ||
            (company as any).customer_segment_1 ||
            (company as any).customer_segment_2 ||
            (company as any).customer_segment_3 ||
            company.visma_id ||
            (company as any).visma_delivery_id ||
            (company as any).contact_person ||
            (company as any).visma_notes ||
            (company as any).main_branch_text ||
            (company as any).main_branch_code ||
            (company as any).bi_branch_1_code) && (
            <div className="border-t mt-4 pt-4 text-sm">
              <button
                type="button"
                onClick={toggleVisma}
                className="w-full flex items-center justify-between cursor-pointer text-left mb-2"
              >
                <h3 className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                  Visma-data
                </h3>
                <span className="text-xs text-muted-foreground">{vismaExpanded ? "∨" : "›"}</span>
              </button>
              {vismaExpanded && (
                <div className="space-y-2">
                  {(company as any).created_in_visma && (
                    <KV
                      label="Oprettet i Visma"
                      value={format(new Date((company as any).created_in_visma), "d. MMM yyyy", { locale: da })}
                    />
                  )}
                  {company.last_purchase_date && (
                    <KV
                      label="Sidste varekøb"
                      value={format(new Date(company.last_purchase_date), "d. MMM yyyy", { locale: da })}
                    />
                  )}
                  {(company as any).customer_segment_1 && (
                    <KV label="Kundesegment 1" value={(company as any).customer_segment_1} />
                  )}
                  {(company as any).customer_segment_2 && (
                    <KV label="Kundesegment 2" value={(company as any).customer_segment_2} />
                  )}
                  {(company as any).customer_segment_3 && (
                    <KV label="Kundesegment 3" value={(company as any).customer_segment_3} />
                  )}
                  {((company as any).main_branch_text || (company as any).main_branch_code) && (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Hovedbranche</span>
                      <span className="text-right">
                        <span className="font-medium block">
                          {(company as any).main_branch_text || (company as any).main_branch_code}
                        </span>
                        {(company as any).main_branch_text && (company as any).main_branch_code && (
                          <span className="text-muted-foreground text-xs block">
                            {(company as any).main_branch_code}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {(company as any).bi_branch_1_code && (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Bibranche</span>
                      <span className="font-medium text-right">
                        {(company as any).bi_branch_1_code}
                      </span>
                    </div>
                  )}
                  {company.visma_id && <KV label="Visma kundenr." value={company.visma_id} />}
                  {(company as any).visma_delivery_id && (
                    <KV label="Visma lev.nr." value={(company as any).visma_delivery_id} />
                  )}
                  {(company as any).contact_person && (
                    <KV label="Kontaktperson" value={(company as any).contact_person} />
                  )}
                  {(company as any).visma_notes && (
                    <div className="pt-1">
                      <div className="text-muted-foreground text-xs mb-1">Bemærkninger (Visma)</div>
                      <div className="whitespace-pre-line text-sm bg-muted/40 rounded-md px-2 py-1.5">
                        {(company as any).visma_notes}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </Card>

        {/* MIDTEN — Faner */}
        <div className="space-y-4 min-w-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList className="bg-transparent p-0 h-auto border-b w-full justify-start rounded-none overflow-x-auto scrollbar-hide flex-nowrap">
              {[
                { v: "oversigt", label: "Oversigt" },
                { v: "aktivitet", label: "Aktivitet" },
                { v: "lokationer", label: "Lokationer" },
                { v: "relationer", label: "Relationer" },
                { v: "aftaler", label: "Aftaler" },
              ].map((t) => (
                <TabsTrigger
                  key={t.v}
                  value={t.v}
                  className="flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-4 py-2"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* FANE: Oversigt */}
            <TabsContent value="oversigt" className="space-y-4 mt-4">
              <AiBriefingSektion companyId={company.id} />

              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" /> Seneste aktiviteter
                  </h2>
                  {activities.length > 3 && (
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => setTab("aktivitet")}
                    >
                      Se alle ({activities.length}) →
                    </button>
                  )}
                </div>
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen aktiviteter endnu.</p>
                ) : (
                  <div className="space-y-3">
                    {activities.slice(0, 3).map((a) => (
                      <ActivityRow key={a.id} a={a} locations={locations} />
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4" /> Åbne salgsmuligheder
                  </h2>
                  {opportunities.length > 3 && (
                    <Link
                      to="/salgsmuligheder"
                      className="text-xs text-primary hover:underline"
                    >
                      Se alle →
                    </Link>
                  )}
                </div>
                {opportunities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen åbne salgsmuligheder.</p>
                ) : (
                  <div className="space-y-2">
                    {opportunities.slice(0, 3).map((o) => (
                      <div
                        key={o.id}
                        className="flex items-center justify-between text-sm border-b last:border-0 py-2"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{o.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {o.status}
                            {o.expected_close_date &&
                              ` · lukker ${format(new Date(o.expected_close_date), "d. MMM yyyy", { locale: da })}`}
                          </div>
                        </div>
                        {o.estimated_value != null && (
                          <span className="text-sm font-medium shrink-0 ml-3">
                            {Number(o.estimated_value).toLocaleString("da-DK")} kr.
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

            </TabsContent>


            {/* FANE: Aktivitet */}
            <TabsContent value="aktivitet" className="mt-4">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" /> Aktivitetslog
                  </h2>
                  <Button size="sm" onClick={() => { setPresetLocationId(null); setActivityOpen(true); }}>
                    <PlusCircle className="h-4 w-4 mr-1.5" /> Registrér aktivitet
                  </Button>
                </div>
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen aktiviteter endnu.</p>
                ) : (
                  <div className="space-y-4">
                    {activities.map((a) => (
                      <ActivityRow key={a.id} a={a} locations={locations} />
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* FANE: Lokationer */}
            <TabsContent value="lokationer" className="space-y-4 mt-4">
              <LokationerSektion
                companyId={company.id}
                isAdmin={isAdmin}
                reloadKey={locationReloadKey}
                companyFallbackAddress={company.address}
                companyFallbackZip={company.zip}
                companyFallbackCity={company.city}
                contactsByLocation={(() => {
                  const m = new Map<string, LocationContact[]>();
                  for (const c of contacts as ContactRow[]) {
                    if (!c.location_id) continue;
                    const arr = m.get(c.location_id) ?? [];
                    arr.push({ id: c.id, name: c.name, phone: c.phone, email: c.email });
                    m.set(c.location_id, arr);
                  }
                  return m;
                })()}
                onRegisterActivity={(locationId) => {
                  setPresetLocationId(locationId);
                  setActivityOpen(true);
                }}
              />

            </TabsContent>

            {/* FANE: Relationer */}
            <TabsContent value="relationer" className="space-y-4 mt-4">
              <KontaktpersonerSektion
                companyId={company.id}
                contacts={contacts as ContactRow[]}
                locations={locations}
                onReload={load}
              />
            </TabsContent>

            {/* FANE: Dokumenter */}
            <TabsContent value="aftaler" className="space-y-6 mt-4">
              <DokumenterSektion companyId={company.id} canWrite={canWriteDocs} />
              <div className="border-t border-border" />
              <KonkurrentaftaleSektion companyId={company.id} />
            </TabsContent>

          </Tabs>
        </div>




        {/* HØJRE — Handlingspanel */}
        <Card className="p-5 h-fit lg:sticky lg:top-6">
          <h2 className="font-semibold mb-4">Handlinger</h2>
          <div className="space-y-2">
            <Button className="w-full justify-start" onClick={() => { setPresetLocationId(null); setActivityOpen(true); }}>
              <PlusCircle className="h-4 w-4 mr-2" /> Registrér aktivitet
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setOpportunityOpen(true)}>
              <PlusCircle className="h-4 w-4 mr-2" /> Opret salgsmulighed
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setQuoteOpen(true)}>
              <FileText className="h-4 w-4 mr-2" /> Registrér tilbud
            </Button>
            {isAdmin && (
              <div className="pt-4 mt-2 border-t">
                <Button
                  variant="destructive"
                  className="w-full justify-start"
                  onClick={openDeleteDialog}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Slet virksomhed
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      <RegistrerAktivitetDialog
        open={activityOpen}
        onOpenChange={(v) => { setActivityOpen(v); if (!v) setPresetLocationId(null); }}
        companyId={company.id}
        userId={user?.id ?? ""}
        assignments={assignments}
        locations={locations}
        presetLocationId={presetLocationId}
        onSaved={() => { load(); setLocationReloadKey((k) => k + 1); }}
      />
      <OpretSalgsmulighedDialog
        open={opportunityOpen}
        onOpenChange={setOpportunityOpen}
        companyId={company.id}
        userId={user?.id ?? ""}
        onSaved={load}
      />
      <RegistrerTilbudDialog
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        companyId={company.id}
        userId={user?.id ?? ""}
        onSaved={load}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet virksomhed?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Er du sikker? Dette sletter virksomheden og al tilknyttet data permanent.
                  Dette kan ikke fortrydes.
                </p>
                {deleteStats === null ? (
                  <p className="text-xs text-muted-foreground">Henter statistik…</p>
                ) : (
                  (deleteStats.activities > 0 || deleteStats.opportunities > 0) && (
                    <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                      <strong>Advarsel:</strong> Denne virksomhed har{" "}
                      {deleteStats.activities} aktiviteter og {deleteStats.opportunities}{" "}
                      salgsmuligheder som også vil blive slettet
                      {deleteStats.quotes > 0 && <>, samt {deleteStats.quotes} tilbud</>}.
                    </div>
                  )
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Sletter…" : "Slet permanent"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActivityRow({ a, locations }: { a: Activity; locations: Location[] }) {
  const loc = (a as any).location_id
    ? locations.find((l) => l.id === (a as any).location_id)
    : null;
  return (
    <div
      id={`activity-${a.id}`}
      className="border-l-2 border-primary/30 pl-3 scroll-mt-24 transition-shadow"
    >
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {(() => {
            const def = getActivityType(a.activity_type as any);
            if (def) {
              const Icon = def.Icon;
              return (
                <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full", def.bg, def.color)}>
                  <Icon className="h-3.5 w-3.5" />
                  {def.label}
                </span>
              );
            }
            return (
              <Badge variant="outline" className="capitalize">
                {labelFor(a.activity_type)}
              </Badge>
            );
          })()}
          {loc && (
            <Badge variant="secondary" className="text-xs gap-1">
              <MapPin className="h-3 w-3" />
              {loc.city || loc.address || "Lokation"}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {format(new Date(a.created_at), "d. MMM yyyy HH:mm", { locale: da })}
        </span>
      </div>
      {a.note && <NoteWithMentions text={a.note} />}
      {(a.next_action || a.next_followup_date) && (
        <div className="mt-2 text-xs bg-muted/50 rounded px-2 py-1.5">
          <span className="font-medium">Næste: </span>
          {a.next_action}
          {a.next_followup_date && (
            <span className="text-muted-foreground">
              {" — "}
              {format(new Date(a.next_followup_date), "d. MMM yyyy", { locale: da })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {

  return (
    <div className="flex gap-2">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function DatoVælger({
  value,
  onChange,
  placeholder = "Vælg dato",
}: {
  value?: Date;
  onChange: (d?: Date) => void;
  placeholder?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "d. MMMM yyyy", { locale: da }) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
          locale={da}
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

function RegistrerAktivitetDialog({
  open,
  onOpenChange,
  companyId,
  userId,
  assignments,
  locations,
  presetLocationId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  userId: string;
  assignments: Assignment[];
  locations: Location[];
  presetLocationId: string | null;
  onSaved: () => void;
}) {
  const [type, setType] = useState<ActivityType | "">("");
  const [note, setNote] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextDate, setNextDate] = useState<Date | undefined>();
  const [updateStatus, setUpdateStatus] = useState<AssignmentStatus | "">("");
  const [assignmentId, setAssignmentId] = useState<string>(assignments[0]?.id ?? "");
  const [locationId, setLocationId] = useState<string>("__general");
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<MentionableUser[]>([]);

  useEffect(() => {
    if (open) {
      setType("");
      setNote("");
      setNextAction("");
      setNextDate(undefined);
      setUpdateStatus("");
      setAssignmentId(assignments[0]?.id ?? "");
      setLocationId(presetLocationId ?? "__general");
      fetchMentionableUsers(userId).then(setUsers);
    }
  }, [open, assignments, userId, presetLocationId]);

  const requiresFollowup =
    updateStatus !== "" && STATUS_REQUIRES_FOLLOWUP.includes(updateStatus as AssignmentStatus);

  async function save() {
    if (!type) {
      toast.error("Vælg en aktivitetstype");
      return;
    }
    if (requiresFollowup && (!nextAction.trim() || !nextDate)) {
      toast.error("Status kræver både næste handling og opfølgningsdato");
      return;
    }
    setSaving(true);
    const trimmedNote = note.trim();
    const { data: inserted, error } = await supabase
      .from("activities")
      .insert({
        company_id: companyId,
        created_by: userId,
        activity_type: type as ActivityType,
        note: trimmedNote || null,
        next_action: nextAction.trim() || null,
        next_followup_date: nextDate ? format(nextDate, "yyyy-MM-dd") : null,
        contact_list_assignment_id: assignmentId || null,
        location_id: locationId === "__general" ? null : locationId,
      } as any)
      .select("id")
      .single();
    if (error) {
      toast.error("Kunne ikke gemme aktivitet: " + error.message);
      setSaving(false);
      return;
    }
    // @mentions → notifikationer
    if (trimmedNote) {
      const n = await createMentionNotifications({
        note: trimmedNote,
        users,
        senderId: userId,
        companyId,
        activityId: inserted?.id ?? null,
      });
      if (n > 0) {
        toast.success(
          n === 1
            ? "1 kollega notificeret"
            : `${n} kolleger notificeret`,
        );
      }
    }
    if (updateStatus && assignmentId) {
      const { error: e2 } = await supabase
        .from("contact_list_assignments")
        .update({
          status: updateStatus as AssignmentStatus,
          next_action_note: nextAction.trim() || null,
          next_followup_date: nextDate ? format(nextDate, "yyyy-MM-dd") : null,
        })
        .eq("id", assignmentId);
      if (e2) toast.error("Aktivitet gemt, men status kunne ikke opdateres: " + e2.message);
    }
    toast.success("Aktivitet gemt");
    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrér aktivitet</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">Aktivitetstype *</Label>
            <Select value={type} onValueChange={(v) => setType(v as ActivityType)}>
              <SelectTrigger><SelectValue placeholder="Vælg type" /></SelectTrigger>
              <SelectContent>
                {activityTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {locations.length > 0 && (
            <div>
              <Label className="mb-1.5 block">Hvilken lokation gælder dette?</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__general">Hele virksomheden (generelt)</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.city || l.address || "Lokation"}
                      {l.is_primary ? " (primær)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="mb-1.5 block">
              Note <span className="text-xs text-muted-foreground font-normal">— skriv @ for at tagge en kollega</span>
            </Label>
            <MentionTextarea
              value={note}
              onChange={setNote}
              users={users}
              rows={3}
              placeholder="Hvad skete der? Tag kolleger med @Fornavn"
            />
          </div>
          {assignments.length > 0 && (
            <div>
              <Label className="mb-1.5 block">Opdater status (valgfri)</Label>
              <Select value={updateStatus} onValueChange={(v) => setUpdateStatus(v as AssignmentStatus)}>
                <SelectTrigger><SelectValue placeholder="Ingen ændring" /></SelectTrigger>
                <SelectContent>
                  {assignmentStatuses.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="mb-1.5 block">
              Næste handling {requiresFollowup && <span className="text-destructive">*</span>}
            </Label>
            <Input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="Fx: ring tilbage med tilbud"
            />
          </div>
          <div>
            <Label className="mb-1.5 block">
              Næste opfølgningsdato {requiresFollowup && <span className="text-destructive">*</span>}
            </Label>
            <DatoVælger value={nextDate} onChange={setNextDate} />
          </div>
          {requiresFollowup && (
            <p className="text-xs text-muted-foreground">
              Statussen kræver, at både næste handling og opfølgningsdato udfyldes.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annullér</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Gemmer…" : "Gem aktivitet"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpretSalgsmulighedDialog({
  open,
  onOpenChange,
  companyId,
  userId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  userId: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [closeDate, setCloseDate] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setName(""); setValue(""); setCloseDate(undefined); }
  }, [open]);

  async function save() {
    if (!name.trim()) { toast.error("Angiv et navn"); return; }
    setSaving(true);
    const { error } = await supabase.from("sales_opportunities").insert({
      company_id: companyId,
      assigned_to: userId,
      name: name.trim(),
      estimated_value: value ? Number(value) : null,
      expected_close_date: closeDate ? format(closeDate, "yyyy-MM-dd") : null,
    });
    setSaving(false);
    if (error) { toast.error("Fejl: " + error.message); return; }
    toast.success("Salgsmulighed oprettet");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Opret salgsmulighed</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">Navn *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fx: Espressomaskine til kantine" />
          </div>
          <div>
            <Label className="mb-1.5 block">Forventet værdi (kr.)</Label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Forventet lukkedato</Label>
            <DatoVælger value={closeDate} onChange={setCloseDate} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annullér</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Gemmer…" : "Opret"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegistrerTilbudDialog({
  open,
  onOpenChange,
  companyId,
  userId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  userId: string;
  onSaved: () => void;
}) {
  const [number, setNumber] = useState("");
  const [value, setValue] = useState("");
  const [sent, setSent] = useState<Date | undefined>(new Date());
  const [expiry, setExpiry] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setNumber(""); setValue(""); setSent(new Date()); setExpiry(undefined); setNotes(""); }
  }, [open]);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("quotes").insert({
      company_id: companyId,
      created_by: userId,
      quote_number: number.trim() || null,
      estimated_value: value ? Number(value) : null,
      sent_date: sent ? format(sent, "yyyy-MM-dd") : null,
      expiry_date: expiry ? format(expiry, "yyyy-MM-dd") : null,
      notes: notes.trim() || null,
      status: "sendt",
    });
    setSaving(false);
    if (error) { toast.error("Fejl: " + error.message); return; }
    toast.success("Tilbud registreret");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrér tilbud</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">Tilbudsnummer</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Fx: T-2026-0123" />
          </div>
          <div>
            <Label className="mb-1.5 block">Værdi (kr.)</Label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Sendt</Label>
              <DatoVælger value={sent} onChange={setSent} />
            </div>
            <div>
              <Label className="mb-1.5 block">Udløber</Label>
              <DatoVælger value={expiry} onChange={setExpiry} />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Noter</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annullér</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Gemmer…" : "Gem tilbud"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddCvrInline({ companyId, onAdded }: { companyId: string; onAdded: (cvr: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  if (!open) {
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>
        Tilføj CVR
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 8))}
        placeholder="8 cifre"
        className="h-7 w-28 text-xs"
      />
      <Button
        size="sm"
        className="h-7 text-xs"
        disabled={value.length !== 8 || saving}
        onClick={async () => {
          setSaving(true);
          const { error } = await supabase
            .from("companies")
            .update({ cvr: value })
            .eq("id", companyId);
          setSaving(false);
          if (error) {
            toast.error(error.message.includes("unique") ? "CVR findes allerede" : "Kunne ikke gemme CVR");
            return;
          }
          toast.success("CVR tilføjet");
          onAdded(value);
          setOpen(false);
        }}
      >
        Gem
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
        Annullér
      </Button>
    </div>
  );
}
