import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft,
  Lock,
  Search,
  Star,
  Trash2,
  Plus,
  Loader2,
  Unlock,
  Cog,
  Receipt,
  Calendar,
  Coffee,
  Wrench,
  Send,
  Repeat,
  CheckCircle2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tilbud/$id")({
  head: () => ({ meta: [{ title: "Tilbud — bygger" }] }),
  component: TilbudBygger,
});

// ---------- types ----------

type Quote = {
  id: string;
  company_id: string;
  quote_number: string | null;
  status: string;
  pricing_mode: "purchase" | "lease" | "both";
  delivery_location_id: string | null;
  frozen_at: string | null;
  expiry_date: string | null;
  sent_date: string | null;
  public_token: string | null;
  notes: string | null;
};

type Company = {
  id: string;
  name: string;
  visma_id: string | null;
  customer_segment_1: string | null;
  customer_segment_2: string | null;
};

type Location = {
  id: string;
  company_id: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  is_primary: boolean;
};

type ProductMachine = {
  varenr: string;
  beskrivelse: string | null;
  listepris: number | null;
  udlejningspris: number | null;
  kan_lejes: boolean;
  is_favorit: boolean;
};

type ProductSimple = {
  varenr: string;
  beskrivelse: string | null;
  listepris: number | null;
  is_favorit: boolean;
  kategori: string | null;
};

type LineType = "machine" | "accessory" | "consumable";

type QuoteLine = {
  id: string;
  quote_id: string;
  varenr: string;
  line_type: LineType;
  beskrivelse_snapshot: string | null;
  antal: number;
  listepris_snapshot: number;
  rabat_pct_snapshot: number;
  rabat_kr_snapshot: number;
  /** Særpris-kr pr. enhed (frosset). Skjules mod kunde, men anvendes i netto-beregning. */
  saerpris_kr_snapshot: number;
  /** Enhedsnetto (pr. stk) — listepris efter pct, kr og særpris. */
  nettopris_enhed_snapshot: number;
  /** Linjetotal — nettopris_enhed_snapshot × antal. Bruges af alle totaler. */
  nettopris_snapshot: number;
  er_leje: boolean;
  sort_order: number;
};

type Floor = {
  rabat_pct: number;
  rabat_kr: number;
  saerpris_kr: number;
  kilde: string;
  er_saerpris: boolean;
} | null;

// ---------- helpers ----------

function formatKr(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  });
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return String(d);
  }
}

/**
 * ANTAGELSE, IKKE VERIFICERET MOD VISMA.
 * A = pct af listepris, så kr/saer af rest.    (100 − 10%) − 8 = 82,00
 * B = saer/kr først, så pct af rest.           (100 − 8) − 10% = 82,80
 * Skift til "B" hvis Visma regner sådan. Bekræftes mod en faktisk
 * offentlig-kunde-faktura med BÅDE særpris OG almindelig rabat.
 */
const STACK_ORDER: "A" | "B" = "A";

/** Central netto-beregning. Eneste sted hvor STACK_ORDER er i spil. */
function calcNettoEnhed(args: {
  list: number;
  rab_pct?: number | null;
  rab_kr?: number | null;
  saer_kr?: number | null;
}): number {
  const list = Number(args.list) || 0;
  const pct = Math.max(0, Number(args.rab_pct ?? 0));
  const rab_kr = Math.max(0, Number(args.rab_kr ?? 0));
  const saer = Math.max(0, Number(args.saer_kr ?? 0));
  let net: number;
  if (STACK_ORDER === "A") {
    // pct af listepris, derefter kr + særpris fra restbeløbet
    net = list * (1 - pct / 100) - rab_kr - saer;
  } else {
    // særpris + kr først, så pct af resten
    net = (list - rab_kr - saer) * (1 - pct / 100);
  }
  return Math.max(0, net);
}

/** Bagudkompatibel: bruges hvor særpris ikke er relevant (fri rabat / floor-snap af UI). */
function calcNetto(list: number, pct: number, kr: number) {
  return calcNettoEnhed({ list, rab_pct: pct, rab_kr: kr, saer_kr: 0 });
}

async function fetchFloor(companyId: string, varenr: string): Promise<Floor> {
  const { data } = await supabase.rpc("get_quote_floor_discount", {
    p_company_id: companyId,
    p_varenr: varenr,
  });
  if (!data || (data as any[]).length === 0) return null;
  const r = (data as any[])[0];
  return {
    rabat_pct: Number(r.rabat_pct ?? 0),
    rabat_kr: Number(r.rabat_kr ?? 0),
    saerpris_kr: Number(r.saerpris_kr ?? 0),
    kilde: String(r.kilde ?? ""),
    er_saerpris: Boolean(r.er_saerpris),
  };
}

// ---------- page ----------

function TilbudBygger() {
  const { id: quoteId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const quoteQuery = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: async (): Promise<Quote> => {
      const { data, error } = await supabase
        .from("quotes")
        .select(
          "id, company_id, quote_number, status, pricing_mode, delivery_location_id, frozen_at, expiry_date, sent_date, public_token, notes",
        )
        .eq("id", quoteId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const companyId = quoteQuery.data?.company_id;

  const companyQuery = useQuery({
    enabled: !!companyId,
    queryKey: ["quote-company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, visma_id, customer_segment_1, customer_segment_2")
        .eq("id", companyId!)
        .single();
      if (error) throw error;
      return data as Company;
    },
  });

  const locationsQuery = useQuery({
    enabled: !!companyId,
    queryKey: ["quote-locations", companyId],
    queryFn: async (): Promise<Location[]> => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, company_id, address, zip, city, is_primary")
        .eq("company_id", companyId!)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  useEffect(() => {
    const q = quoteQuery.data;
    const locs = locationsQuery.data ?? [];
    if (!q || q.delivery_location_id || locs.length === 0) return;
    const primary = locs.find((l) => l.is_primary) ?? locs[0];
    if (!primary || locs.length > 1) return;
    supabase
      .from("quotes")
      .update({ delivery_location_id: primary.id })
      .eq("id", q.id)
      .then(() => qc.invalidateQueries({ queryKey: ["quote", quoteId] }));
  }, [quoteQuery.data, locationsQuery.data, qc, quoteId]);

  // Floor probe på kundeniveau
  const floorProbeQuery = useQuery({
    enabled: !!companyId,
    queryKey: ["floor-probe", companyId],
    queryFn: async () => {
      const probes = ["60810", "61160", "1930", "87003"];
      for (const v of probes) {
        const { data } = await supabase.rpc("get_quote_floor_discount", {
          p_company_id: companyId!,
          p_varenr: v,
        });
        if (data && data.length > 0)
          return data[0] as { rabat_pct: number; rabat_kr: number; kilde: string };
      }
      return null;
    },
  });

  const machinesQuery = useQuery({
    queryKey: ["quote-machines"],
    queryFn: async (): Promise<ProductMachine[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("varenr, beskrivelse, listepris, udlejningspris, kan_lejes, is_favorit")
        .eq("kategori", "maskine")
        .eq("is_tilbudsegnet", true)
        .eq("record_status", "aktiv")
        .order("is_favorit", { ascending: false })
        .order("beskrivelse", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  // Forbrugsprodukter + tilbehør
  const consumablesQuery = useQuery({
    queryKey: ["quote-consumables"],
    queryFn: async (): Promise<ProductSimple[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("varenr, beskrivelse, listepris, is_favorit, kategori")
        .in("kategori", ["kaffe", "te", "chokolade", "maelk", "tilbehoer"])
        .eq("is_tilbudsegnet", true)
        .eq("record_status", "aktiv")
        .order("is_favorit", { ascending: false })
        .order("beskrivelse", { ascending: true })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  const linesQuery = useQuery({
    queryKey: ["quote-lines", quoteId],
    queryFn: async (): Promise<QuoteLine[]> => {
      const { data, error } = await supabase
        .from("quote_lines")
        .select("*")
        .eq("quote_id", quoteId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  if (quoteQuery.isLoading || companyQuery.isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (quoteQuery.error || !quoteQuery.data || !companyQuery.data) {
    return (
      <div className="p-6">
        <p className="text-destructive">Tilbud kunne ikke hentes.</p>
      </div>
    );
  }

  const quote = quoteQuery.data;
  const company = companyQuery.data;
  const locations = locationsQuery.data ?? [];
  const machines = machinesQuery.data ?? [];
  const consumables = consumablesQuery.data ?? [];
  const lines = linesQuery.data ?? [];
  const floor = floorProbeQuery.data ?? null;

  const isFrozen = !!quote.frozen_at;

  async function setPricingMode(mode: "purchase" | "lease" | "both") {
    if (mode === quote.pricing_mode) return;
    const { error } = await supabase
      .from("quotes")
      .update({ pricing_mode: mode })
      .eq("id", quote.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["quote", quoteId] });
  }

  async function setDeliveryLocation(locId: string | null) {
    const { error } = await supabase
      .from("quotes")
      .update({ delivery_location_id: locId })
      .eq("id", quote.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["quote", quoteId] });
  }

  async function setExpiryDate(d: string) {
    const { error } = await supabase
      .from("quotes")
      .update({ expiry_date: d || null })
      .eq("id", quote.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["quote", quoteId] });
  }

  async function sendQuote() {
    if (lines.length === 0) {
      toast.error("Tilføj mindst én linje før du sender tilbuddet.");
      return;
    }
    if (!confirm("Markér tilbud som sendt? Linjerne låses og kan ikke længere ændres.")) return;
    const { data, error } = await supabase.rpc("send_quote", { _quote_id: quote.id });
    if (error) { toast.error("Kunne ikke sende: " + error.message); return; }
    toast.success("Tilbud markeret som sendt — linjer låst.");
    qc.invalidateQueries({ queryKey: ["quote", quoteId] });
    qc.invalidateQueries({ queryKey: ["quote-lines", quoteId] });
  }

  const invalidateLines = () => qc.invalidateQueries({ queryKey: ["quote-lines", quoteId] });

  return (
    <TooltipProvider>
      <div className="px-4 md:px-8 py-6 pb-24 max-w-[1600px] mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <Link
            to="/virksomheder/$id"
            params={{ id: company.id }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Tilbage til {company.name}
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              Tilbud {quote.quote_number ?? "—"}
            </Badge>
            <Badge>{quote.status}</Badge>
            {isFrozen && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" /> Frosset
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          {/* MAIN */}
          <div className="space-y-6">
            {/* TRIN 1 — KUNDE */}
            <StepCard step={1} title="Kunde">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="text-xl font-semibold">{company.name}</div>
                  <div className="text-sm text-muted-foreground">
                    Visma-nr: {company.visma_id ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Segment: {company.customer_segment_1 ?? "—"} · {company.customer_segment_2 ?? "—"}
                  </div>
                </div>
                <div>
                  {floorProbeQuery.isLoading ? (
                    <Badge variant="secondary">
                      <Loader2 className="h-3 w-3 animate-spin mr-1" /> Tjekker aftale…
                    </Badge>
                  ) : floor ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">
                      <Lock className="h-3 w-3 mr-1" /> Aftale-rabat aktiv
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <Unlock className="h-3 w-3 mr-1" /> Ingen aftale — fri rabat
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1.5 block text-xs">Leveringsadresse</Label>
                  <Select
                    value={quote.delivery_location_id ?? "_none"}
                    onValueChange={(v) => setDeliveryLocation(v === "_none" ? null : v)}
                    disabled={isFrozen}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Vælg leveringsadresse" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Ingen specifik adresse</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {[l.address, l.zip, l.city].filter(Boolean).join(", ") || "(uden adresse)"}
                          {l.is_primary ? " (primær)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </StepCard>

            {/* TRIN 2 — MASKINE */}
            <StepCard step={2} title="Vælg maskine">
              <div className="mb-4">
                <Label className="mb-1.5 block text-xs">Pris-tilbudstype</Label>
                <ToggleGroup
                  type="single"
                  value={quote.pricing_mode}
                  onValueChange={(v) => v && setPricingMode(v as any)}
                  disabled={isFrozen}
                >
                  <ToggleGroupItem value="purchase">Køb</ToggleGroupItem>
                  <ToggleGroupItem value="lease">Leje</ToggleGroupItem>
                  <ToggleGroupItem value="both">Begge</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <MachinePicker
                machines={machines}
                companyId={company.id}
                quote={quote}
                disabled={isFrozen}
                onAdded={invalidateLines}
              />

              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">Valgte maskiner</h3>
                {lines.filter((l) => l.line_type === "machine").length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen maskiner tilføjet endnu.</p>
                ) : (
                  <div className="space-y-3">
                    {lines
                      .filter((l) => l.line_type === "machine")
                      .map((line) => (
                        <LineRow
                          key={line.id}
                          line={line}
                          companyId={company.id}
                          disabled={isFrozen}
                          onChanged={invalidateLines}
                        />
                      ))}
                  </div>
                )}
              </div>
            </StepCard>

            {/* TRIN 3 — FORBRUGSPRODUKTER */}
            <StepCard step={3} title="Forbrugsprodukter" icon={<Coffee className="h-4 w-4" />}>
              <ConsumablePicker
                products={consumables.filter((p) =>
                  ["kaffe", "te", "chokolade", "maelk"].includes(p.kategori ?? ""),
                )}
                companyId={company.id}
                quoteId={quote.id}
                disabled={isFrozen}
                onAdded={invalidateLines}
              />

              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">Valgte forbrugsprodukter</h3>
                {lines.filter((l) => l.line_type === "consumable").length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen forbrugsprodukter tilføjet endnu.</p>
                ) : (
                  <div className="space-y-3">
                    {lines
                      .filter((l) => l.line_type === "consumable")
                      .map((line) => (
                        <LineRow
                          key={line.id}
                          line={line}
                          companyId={company.id}
                          disabled={isFrozen}
                          onChanged={invalidateLines}
                        />
                      ))}
                  </div>
                )}
              </div>
            </StepCard>

            {/* TILVALG / TILBEHØR */}
            <StepCard step={"+"} title="Tilvalg / tilbehør" icon={<Wrench className="h-4 w-4" />}>
              <AccessoryPicker
                products={consumables.filter((p) => p.kategori === "tilbehoer")}
                companyId={company.id}
                quoteId={quote.id}
                disabled={isFrozen}
                onAdded={invalidateLines}
              />

              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">Valgte tilvalg</h3>
                {lines.filter((l) => l.line_type === "accessory").length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen tilvalg tilføjet endnu.</p>
                ) : (
                  <div className="space-y-3">
                    {lines
                      .filter((l) => l.line_type === "accessory")
                      .map((line) => (
                        <LineRow
                          key={line.id}
                          line={line}
                          companyId={company.id}
                          disabled={isFrozen}
                          onChanged={invalidateLines}
                        />
                      ))}
                  </div>
                )}
              </div>
            </StepCard>

            {/* TRIN 4 — FÆRDIGT TILBUD */}
            <StepCard step={4} title="Færdigt tilbud" icon={<Receipt className="h-4 w-4" />}>
              <QuoteSummary
                quote={quote}
                lines={lines}
                isFrozen={isFrozen}
                onSetExpiry={setExpiryDate}
                onSend={sendQuote}
              />
            </StepCard>
          </div>

          {/* CART */}
          <CartSidebar lines={lines} pricingMode={quote.pricing_mode} />
        </div>
      </div>
    </TooltipProvider>
  );
}

// ---------- step card ----------

function StepCard({
  step,
  title,
  icon,
  children,
}: {
  step: number | string;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center">
          {step}
        </div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h2>
      </div>
      {children}
    </Card>
  );
}

// ---------- machine picker ----------

function MachinePicker({
  machines,
  companyId,
  quote,
  disabled,
  onAdded,
}: {
  machines: ProductMachine[];
  companyId: string;
  quote: Quote;
  disabled: boolean;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  const favoritter = useMemo(() => machines.filter((m) => m.is_favorit), [machines]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return [] as ProductMachine[];
    return machines
      .filter(
        (m) =>
          m.varenr.toLowerCase().includes(s) ||
          (m.beskrivelse ?? "").toLowerCase().includes(s),
      )
      .slice(0, 30);
  }, [machines, search]);

  async function addMachine(m: ProductMachine, erLeje: boolean) {
    setAdding(m.varenr + (erLeje ? "_leje" : "_kob"));
    try {
      const listepris = (erLeje ? m.udlejningspris : m.listepris) ?? 0;
      const floor = await fetchFloor(companyId, m.varenr);
      const rabatPct = Number(floor?.rabat_pct ?? 0);
      const rabatKr = Number(floor?.rabat_kr ?? 0);
      const saerKr = Number(floor?.saerpris_kr ?? 0);
      const enhed = calcNettoEnhed({ list: listepris, rab_pct: rabatPct, rab_kr: rabatKr, saer_kr: saerKr });
      const antal = 1;

      const { error } = await supabase.from("quote_lines").insert({
        quote_id: quote.id,
        varenr: m.varenr,
        line_type: "machine",
        beskrivelse_snapshot: m.beskrivelse,
        antal,
        listepris_snapshot: listepris,
        rabat_pct_snapshot: rabatPct,
        rabat_kr_snapshot: rabatKr,
        saerpris_kr_snapshot: saerKr,
        nettopris_enhed_snapshot: enhed,
        nettopris_snapshot: enhed * antal,
        er_leje: erLeje,
        sort_order: 0,
      });
      if (error) throw error;
      toast.success(`Tilføjet: ${m.beskrivelse ?? m.varenr}${erLeje ? " (leje)" : ""}`);
      onAdded();
    } catch (e: any) {
      toast.error("Fejl: " + (e?.message ?? "ukendt"));
    } finally {
      setAdding(null);
    }
  }

  const showKob = quote.pricing_mode !== "lease";
  const showLeje = quote.pricing_mode !== "purchase";

  return (
    <div className="space-y-4">
      {favoritter.length > 0 && (
        <div>
          <Label className="mb-2 flex items-center gap-1 text-xs">
            <Star className="h-3 w-3 text-yellow-500" /> Favoritter
          </Label>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {favoritter.slice(0, 6).map((m) => (
              <MachineCard
                key={m.varenr}
                m={m}
                showKob={showKob}
                showLeje={showLeje}
                disabled={disabled}
                adding={adding}
                onAdd={addMachine}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <Label className="mb-1.5 block text-xs">Søg maskine (varenr eller beskrivelse)</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Fx 67101 eller Bolero"
            disabled={disabled}
          />
        </div>
        {filtered.length > 0 && (
          <div className="mt-2 border rounded-md divide-y max-h-72 overflow-auto">
            {filtered.map((m) => (
              <div key={m.varenr} className="p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{m.beskrivelse ?? m.varenr}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.varenr} · Køb {formatKr(m.listepris)}
                    {m.kan_lejes && m.udlejningspris ? ` · Leje ${formatKr(m.udlejningspris)}/md` : ""}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {showKob && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled || adding === m.varenr + "_kob"}
                      onClick={() => addMachine(m, false)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Køb
                    </Button>
                  )}
                  {showLeje && m.kan_lejes && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled || adding === m.varenr + "_leje"}
                      onClick={() => addMachine(m, true)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Leje
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MachineCard({
  m,
  showKob,
  showLeje,
  disabled,
  adding,
  onAdd,
}: {
  m: ProductMachine;
  showKob: boolean;
  showLeje: boolean;
  disabled: boolean;
  adding: string | null;
  onAdd: (m: ProductMachine, erLeje: boolean) => void;
}) {
  return (
    <div className="border rounded-md p-3 flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <Cog className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{m.beskrivelse ?? m.varenr}</div>
          <div className="text-xs text-muted-foreground">{m.varenr}</div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Køb {formatKr(m.listepris)}
        {m.kan_lejes && m.udlejningspris ? ` · Leje ${formatKr(m.udlejningspris)}/md` : ""}
      </div>
      <div className="flex gap-1.5">
        {showKob && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={disabled || adding === m.varenr + "_kob"}
            onClick={() => onAdd(m, false)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Køb
          </Button>
        )}
        {showLeje && m.kan_lejes && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={disabled || adding === m.varenr + "_leje"}
            onClick={() => onAdd(m, true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Leje
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- shared add-line helper ----------

async function addSimpleLine(args: {
  quoteId: string;
  companyId: string;
  p: ProductSimple;
  lineType: "consumable" | "accessory";
}) {
  const { quoteId, companyId, p, lineType } = args;
  const listepris = Number(p.listepris ?? 0);
  const floor = await fetchFloor(companyId, p.varenr);
  const rabatPct = Number(floor?.rabat_pct ?? 0);
  const rabatKr = Number(floor?.rabat_kr ?? 0);
  const enhed = calcNetto(listepris, rabatPct, rabatKr);
  const antal = 1;
  const { error } = await supabase.from("quote_lines").insert({
    quote_id: quoteId,
    varenr: p.varenr,
    line_type: lineType,
    beskrivelse_snapshot: p.beskrivelse,
    antal,
    listepris_snapshot: listepris,
    rabat_pct_snapshot: rabatPct,
    rabat_kr_snapshot: rabatKr,
    nettopris_enhed_snapshot: enhed,
    nettopris_snapshot: enhed * antal,
    er_leje: false,
    sort_order: 0,
  });
  if (error) throw error;
}

// ---------- consumable picker (tabs) ----------

const CONSUMABLE_TABS: { key: string; label: string }[] = [
  { key: "kaffe", label: "Kaffe" },
  { key: "te", label: "Te" },
  { key: "chokolade", label: "Chokolade" },
  { key: "maelk", label: "Mælk" },
];

function ConsumablePicker({
  products,
  companyId,
  quoteId,
  disabled,
  onAdded,
}: {
  products: ProductSimple[];
  companyId: string;
  quoteId: string;
  disabled: boolean;
  onAdded: () => void;
}) {
  const [tab, setTab] = useState<string>("kaffe");
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        {CONSUMABLE_TABS.map((t) => (
          <TabsTrigger key={t.key} value={t.key}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {CONSUMABLE_TABS.map((t) => (
        <TabsContent key={t.key} value={t.key} className="mt-3">
          <SimpleProductPicker
            products={products.filter((p) => p.kategori === t.key)}
            companyId={companyId}
            quoteId={quoteId}
            disabled={disabled}
            onAdded={onAdded}
            lineType="consumable"
            placeholder={`Søg i ${t.label.toLowerCase()}`}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function AccessoryPicker(props: {
  products: ProductSimple[];
  companyId: string;
  quoteId: string;
  disabled: boolean;
  onAdded: () => void;
}) {
  return (
    <SimpleProductPicker
      {...props}
      lineType="accessory"
      placeholder="Søg fx serviceaftale, rensetablet, underskab"
    />
  );
}

function SimpleProductPicker({
  products,
  companyId,
  quoteId,
  disabled,
  onAdded,
  lineType,
  placeholder,
}: {
  products: ProductSimple[];
  companyId: string;
  quoteId: string;
  disabled: boolean;
  onAdded: () => void;
  lineType: "consumable" | "accessory";
  placeholder: string;
}) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  const favoritter = useMemo(() => products.filter((p) => p.is_favorit).slice(0, 12), [products]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return [] as ProductSimple[];
    return products
      .filter(
        (p) =>
          p.varenr.toLowerCase().includes(s) ||
          (p.beskrivelse ?? "").toLowerCase().includes(s),
      )
      .slice(0, 30);
  }, [products, search]);

  async function add(p: ProductSimple) {
    setAdding(p.varenr);
    try {
      await addSimpleLine({ quoteId, companyId, p, lineType });
      toast.success(`Tilføjet: ${p.beskrivelse ?? p.varenr}`);
      onAdded();
    } catch (e: any) {
      toast.error("Fejl: " + (e?.message ?? "ukendt"));
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="space-y-4">
      {favoritter.length > 0 && (
        <div>
          <Label className="mb-2 flex items-center gap-1 text-xs">
            <Star className="h-3 w-3 text-yellow-500" /> Favoritter
          </Label>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {favoritter.map((p) => (
              <SimpleProductCard
                key={p.varenr}
                p={p}
                disabled={disabled}
                adding={adding}
                onAdd={add}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <Label className="mb-1.5 block text-xs">Søg produkt</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
          />
        </div>
        {filtered.length > 0 && (
          <div className="mt-2 border rounded-md divide-y max-h-72 overflow-auto">
            {filtered.map((p) => (
              <div key={p.varenr} className="p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.beskrivelse ?? p.varenr}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.varenr} · {formatKr(p.listepris)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || adding === p.varenr}
                  onClick={() => add(p)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Tilføj
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SimpleProductCard({
  p,
  disabled,
  adding,
  onAdd,
}: {
  p: ProductSimple;
  disabled: boolean;
  adding: string | null;
  onAdd: (p: ProductSimple) => void;
}) {
  return (
    <div className="border rounded-md p-3 flex flex-col gap-1.5">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{p.beskrivelse ?? p.varenr}</div>
        <div className="text-xs text-muted-foreground">
          {p.varenr} · {formatKr(p.listepris)}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || adding === p.varenr}
        onClick={() => onAdd(p)}
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Tilføj
      </Button>
    </div>
  );
}

// ---------- line row ----------

function LineRow({
  line,
  companyId,
  disabled,
  onChanged,
}: {
  line: QuoteLine;
  companyId: string;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [pct, setPct] = useState<string>(String(line.rabat_pct_snapshot ?? 0));
  const [kr, setKr] = useState<string>(String(line.rabat_kr_snapshot ?? 0));
  const [antal, setAntal] = useState<string>(String(line.antal ?? 1));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSavedRef = useRef<string>("");

  const floorQuery = useQuery({
    queryKey: ["floor", companyId, line.varenr],
    queryFn: async (): Promise<Floor> => fetchFloor(companyId, line.varenr),
  });

  const floor = floorQuery.data ?? null;
  const floorPct = Number(floor?.rabat_pct ?? 0);
  const floorKr = Number(floor?.rabat_kr ?? 0);

  const pctNum = Math.max(0, Number(pct) || 0);
  const krNum = Math.max(0, Number(kr) || 0);
  const antalNum = Math.max(1, Number(antal) || 1);
  const enhedNetto = useMemo(
    () => calcNetto(Number(line.listepris_snapshot), pctNum, krNum),
    [line.listepris_snapshot, pctNum, krNum],
  );
  const linjeNetto = enhedNetto * antalNum;

  // Auto-persist på enhver ændring (debounced). Floor håndhæves: pct/kr snappes op til gulv.
  useEffect(() => {
    if (disabled) return;
    // Floor-snap (uden toast — det er en hint, ikke en blokade ved auto-save)
    let effPct = pctNum;
    let effKr = krNum;
    if (floor) {
      if (effPct < floorPct) effPct = floorPct;
      if (effKr < floorKr) effKr = floorKr;
    }
    const key = `${effPct}|${effKr}|${antalNum}`;
    if (key === lastSavedRef.current) return;
    const enhed = calcNetto(Number(line.listepris_snapshot), effPct, effKr);
    const total = enhed * antalNum;
    const handle = setTimeout(async () => {
      setSaveState("saving");
      const { error } = await supabase
        .from("quote_lines")
        .update({
          antal: antalNum,
          rabat_pct_snapshot: effPct,
          rabat_kr_snapshot: effKr,
          nettopris_enhed_snapshot: enhed,
          nettopris_snapshot: total,
        })
        .eq("id", line.id);
      if (error) {
        setSaveState("error");
        toast.error(error.message);
        return;
      }
      lastSavedRef.current = key;
      setSaveState("saved");
      onChanged();
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1200);
    }, 400);
    return () => clearTimeout(handle);
  }, [pctNum, krNum, antalNum, disabled, floor, floorPct, floorKr, line.id, line.listepris_snapshot, onChanged]);

  // Snap visuelt input op til gulvet når brugeren forlader feltet
  function onPctBlur() {
    if (floor && pctNum < floorPct) {
      toast.info(`Aftale-gulv: min. ${floorPct}% — sat til gulv`);
      setPct(String(floorPct));
    }
  }
  function onKrBlur() {
    if (floor && krNum < floorKr) {
      toast.info(`Aftale-gulv: min. ${formatKr(floorKr)} — sat til gulv`);
      setKr(String(floorKr));
    }
  }

  async function remove() {
    if (!confirm("Slet denne linje?")) return;
    const { error } = await supabase.from("quote_lines").delete().eq("id", line.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }

  const typeLabel =
    line.line_type === "machine"
      ? line.er_leje
        ? "Månedlig leje"
        : "Engangskøb"
      : line.line_type === "consumable"
        ? "Løbende forbrug"
        : "Tilvalg";

  return (
    <div className="border rounded-md p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="font-medium truncate">
            {line.beskrivelse_snapshot ?? line.varenr}
          </div>
          <div className="text-xs text-muted-foreground">
            {line.varenr} · {typeLabel} · Liste {formatKr(line.listepris_snapshot)}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={remove} disabled={disabled}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <div>
          <Label className="text-xs">Antal</Label>
          <Input
            type="number"
            min={1}
            value={antal}
            onChange={(e) => setAntal(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div>
          <Label className="text-xs">Rabat %</Label>
          <Input
            type="number"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            onBlur={onPctBlur}
            disabled={disabled}
          />
          <FloorHint loading={floorQuery.isLoading} floor={floor} kind="pct" />
        </div>
        <div>
          <Label className="text-xs">Rabat kr</Label>
          <Input
            type="number"
            value={kr}
            onChange={(e) => setKr(e.target.value)}
            onBlur={onKrBlur}
            disabled={disabled}
          />
          <FloorHint loading={floorQuery.isLoading} floor={floor} kind="kr" />
        </div>
        <div>
          <Label className="text-xs">Netto i alt</Label>
          <div className="h-9 px-3 flex items-center rounded-md border bg-muted/40 text-sm tabular-nums">
            {formatKr(linjeNetto)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {antalNum} × {formatKr(enhedNetto)}/stk
          </div>
        </div>
        <div className="text-xs text-muted-foreground self-center">
          {saveState === "saving" && (
            <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Gemmer…</span>
          )}
          {saveState === "saved" && <span className="text-emerald-700">Gemt</span>}
          {saveState === "error" && <span className="text-destructive">Fejl</span>}
          {saveState === "idle" && <span>&nbsp;</span>}
        </div>
      </div>
    </div>
  );
}

function FloorHint({
  loading,
  floor,
  kind,
}: {
  loading: boolean;
  floor: Floor;
  kind: "pct" | "kr";
}) {
  if (loading) {
    return <div className="text-[11px] text-muted-foreground mt-1">Tjekker aftale…</div>;
  }
  if (!floor) {
    return (
      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
        <Unlock className="h-3 w-3" /> Ingen aftale — fri rabat
      </div>
    );
  }
  const v = kind === "pct" ? Number(floor.rabat_pct) : Number(floor.rabat_kr);
  if (!v || v <= 0)
    return (
      <div className="text-[11px] text-muted-foreground mt-1">
        Ingen {kind === "pct" ? "%-" : "kr-"}gulv
      </div>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1 cursor-help">
          <Lock className="h-3 w-3" /> Gulv: {kind === "pct" ? `${v}%` : formatKr(v)}
        </div>
      </TooltipTrigger>
      <TooltipContent>Kilde: {floor.kilde}</TooltipContent>
    </Tooltip>
  );
}

// ---------- quote summary (trin 4) ----------

type Bucket = {
  key: "engangskob" | "leje" | "forbrug";
  title: string;
  icon: React.ReactNode;
  suffix: string;
  lines: QuoteLine[];
};

function bucketize(lines: QuoteLine[]): Bucket[] {
  const engangskob = lines.filter(
    (l) => (l.line_type === "machine" && !l.er_leje) || l.line_type === "accessory",
  );
  const leje = lines.filter((l) => l.line_type === "machine" && l.er_leje);
  const forbrug = lines.filter((l) => l.line_type === "consumable");
  return [
    { key: "engangskob", title: "Engangskøb", icon: <Receipt className="h-4 w-4" />, suffix: "", lines: engangskob },
    { key: "leje", title: "Månedlig leje", icon: <Calendar className="h-4 w-4" />, suffix: "/md", lines: leje },
    { key: "forbrug", title: "Løbende forbrug", icon: <Repeat className="h-4 w-4" />, suffix: "", lines: forbrug },
  ];
}

function QuoteSummary({
  quote,
  lines,
  isFrozen,
  onSetExpiry,
  onSend,
}: {
  quote: Quote;
  lines: QuoteLine[];
  isFrozen: boolean;
  onSetExpiry: (d: string) => void;
  onSend: () => void;
}) {
  const buckets = bucketize(lines);
  const defaultExpiry = useMemo(() => {
    if (quote.expiry_date) return quote.expiry_date.slice(0, 10);
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }, [quote.expiry_date]);

  const [expiry, setExpiry] = useState(defaultExpiry);
  useEffect(() => setExpiry(defaultExpiry), [defaultExpiry]);

  const publicUrl = quote.public_token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/t/${quote.public_token}`
    : null;

  function copyLink() {
    if (!publicUrl) return;
    navigator.clipboard?.writeText(publicUrl);
    toast.success("Link kopieret");
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label className="text-xs mb-1.5 block">Gyldig til</Label>
          <Input
            type="date"
            value={expiry}
            disabled={isFrozen}
            onChange={(e) => setExpiry(e.target.value)}
            onBlur={() => {
              if (expiry && expiry !== (quote.expiry_date ?? "").slice(0, 10)) {
                onSetExpiry(expiry);
              }
            }}
          />
          <div className="text-[11px] text-muted-foreground mt-1">
            Default: 30 dage frem
          </div>
        </div>
        <div>
          <Label className="text-xs mb-1.5 block">Sendt</Label>
          <div className="h-9 px-3 flex items-center rounded-md border bg-muted/40 text-sm">
            {quote.sent_date ? formatDate(quote.sent_date) : "—"}
          </div>
        </div>
        <div>
          <Label className="text-xs mb-1.5 block">Status</Label>
          <div className="h-9 px-3 flex items-center rounded-md border bg-muted/40 text-sm capitalize">
            {quote.status}
          </div>
        </div>
      </div>

      {/* Linje-tabeller pr. bucket */}
      <div className="space-y-5">
        {buckets.map((b) => (
          <BucketTable key={b.key} bucket={b} />
        ))}
      </div>

      {/* Send / link */}
      <div className="border-t pt-4 flex flex-wrap items-center gap-3">
        {!isFrozen ? (
          <Button onClick={onSend} className="gap-2">
            <Send className="h-4 w-4" /> Markér som sendt
          </Button>
        ) : (
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Sendt {formatDate(quote.sent_date)} · frosset {formatDate(quote.frozen_at)}
          </div>
        )}

        {publicUrl && (
          <div className="flex items-center gap-2 ml-auto">
            <div className="text-xs text-muted-foreground font-mono truncate max-w-[320px]">
              {publicUrl}
            </div>
            <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Kopiér link
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function BucketTable({ bucket }: { bucket: Bucket }) {
  if (bucket.lines.length === 0) {
    return (
      <div>
        <div className="text-sm font-semibold mb-2 flex items-center gap-2 text-muted-foreground">
          {bucket.icon} {bucket.title}
        </div>
        <div className="text-xs text-muted-foreground italic">Ingen linjer.</div>
      </div>
    );
  }
  const total = bucket.lines.reduce((s, l) => s + Number(l.nettopris_snapshot ?? 0), 0);
  return (
    <div>
      <div className="text-sm font-semibold mb-2 flex items-center gap-2">
        {bucket.icon} {bucket.title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b">
            <tr>
              <th className="text-left py-1.5 font-normal">Beskrivelse</th>
              <th className="text-right py-1.5 font-normal">Listepris</th>
              <th className="text-right py-1.5 font-normal">Antal</th>
              <th className="text-right py-1.5 font-normal">Rabat</th>
              <th className="text-right py-1.5 font-normal">Netto i alt</th>
            </tr>
          </thead>
          <tbody>
            {bucket.lines.map((l) => {
              const rabatTxt =
                Number(l.rabat_pct_snapshot) > 0 && Number(l.rabat_kr_snapshot) > 0
                  ? `${l.rabat_pct_snapshot}% + ${formatKr(l.rabat_kr_snapshot)}`
                  : Number(l.rabat_pct_snapshot) > 0
                    ? `${l.rabat_pct_snapshot}%`
                    : Number(l.rabat_kr_snapshot) > 0
                      ? formatKr(l.rabat_kr_snapshot)
                      : "—";
              return (
                <tr key={l.id} className="border-b last:border-b-0">
                  <td className="py-1.5">
                    <div className="font-medium">{l.beskrivelse_snapshot ?? l.varenr}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{l.varenr}</div>
                  </td>
                  <td className="text-right tabular-nums">{formatKr(l.listepris_snapshot)}</td>
                  <td className="text-right tabular-nums">{Number(l.antal)}</td>
                  <td className="text-right tabular-nums">{rabatTxt}</td>
                  <td className="text-right tabular-nums font-medium">
                    {formatKr(l.nettopris_snapshot)}{bucket.suffix}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td colSpan={4} className="py-2 text-right">Total {bucket.title.toLowerCase()}</td>
              <td className="py-2 text-right tabular-nums">{formatKr(total)}{bucket.suffix}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------- cart ----------

function CartSidebar({
  lines,
  pricingMode,
}: {
  lines: QuoteLine[];
  pricingMode: "purchase" | "lease" | "both";
}) {
  const buckets = bucketize(lines);
  const engangskob = buckets[0];
  const leje = buckets[1];
  const forbrug = buckets[2];

  return (
    <Card className="p-5 h-fit lg:sticky lg:top-6">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Receipt className="h-4 w-4" /> Kurv
      </h3>

      <CartSection
        title="Engangskøb"
        icon={<Receipt className="h-3.5 w-3.5" />}
        lines={engangskob.lines}
        total={engangskob.lines.reduce((s, l) => s + Number(l.nettopris_snapshot ?? 0), 0)}
        suffix=""
      />
      {pricingMode !== "purchase" && (
        <CartSection
          title="Månedlig leje"
          icon={<Calendar className="h-3.5 w-3.5" />}
          lines={leje.lines}
          total={leje.lines.reduce((s, l) => s + Number(l.nettopris_snapshot ?? 0), 0)}
          suffix="/md"
        />
      )}
      <CartSection
        title="Løbende forbrug"
        icon={<Repeat className="h-3.5 w-3.5" />}
        lines={forbrug.lines}
        total={forbrug.lines.reduce((s, l) => s + Number(l.nettopris_snapshot ?? 0), 0)}
        suffix=""
      />

      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground">Ingen linjer endnu.</p>
      )}

      <p className="text-[11px] text-muted-foreground mt-4">
        Engangskøb, månedlig leje og løbende forbrug summes adskilt — aldrig blandet.
      </p>
    </Card>
  );
}

function CartSection({
  title,
  icon,
  lines,
  total,
  suffix,
}: {
  title: string;
  icon: React.ReactNode;
  lines: QuoteLine[];
  total: number;
  suffix: string;
}) {
  if (lines.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
        {icon} {title}
      </div>
      <ul className="space-y-1 text-sm">
        {lines.map((l) => (
          <li key={l.id} className="flex justify-between gap-2">
            <span className="truncate">{l.beskrivelse_snapshot ?? l.varenr}</span>
            <span className="shrink-0 tabular-nums">{formatKr(l.nettopris_snapshot)}{suffix}</span>
          </li>
        ))}
      </ul>
      <div className="border-t mt-2 pt-2 flex justify-between font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatKr(total)}{suffix}</span>
      </div>
    </div>
  );
}
