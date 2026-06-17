import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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

type QuoteLine = {
  id: string;
  quote_id: string;
  varenr: string;
  line_type: "machine" | "accessory" | "consumable";
  beskrivelse_snapshot: string | null;
  antal: number;
  listepris_snapshot: number;
  rabat_pct_snapshot: number;
  rabat_kr_snapshot: number;
  nettopris_snapshot: number;
  er_leje: boolean;
  sort_order: number;
};

type Floor = { rabat_pct: number; rabat_kr: number; kilde: string } | null;

// ---------- helpers ----------

function formatKr(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  });
}

function calcNetto(list: number, pct: number, kr: number) {
  const afterPct = list * (1 - (pct || 0) / 100);
  return Math.max(0, afterPct - (kr || 0));
}

// ---------- page ----------

function TilbudBygger() {
  const { id: quoteId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Quote
  const quoteQuery = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: async (): Promise<Quote> => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, company_id, quote_number, status, pricing_mode, delivery_location_id, frozen_at")
        .eq("id", quoteId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const companyId = quoteQuery.data?.company_id;

  // Company + locations
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

  // Auto-set delivery location to primary if only one and none selected yet
  useEffect(() => {
    const q = quoteQuery.data;
    const locs = locationsQuery.data ?? [];
    if (!q || q.delivery_location_id || locs.length === 0) return;
    const primary = locs.find((l) => l.is_primary) ?? locs[0];
    if (!primary || locs.length > 1) return; // only auto-set if there's exactly one obvious choice
    supabase
      .from("quotes")
      .update({ delivery_location_id: primary.id })
      .eq("id", q.id)
      .then(() => qc.invalidateQueries({ queryKey: ["quote", quoteId] }));
  }, [quoteQuery.data, locationsQuery.data, qc, quoteId]);

  // Floor probe — vi tester på en kendt testvare (instant kaffe 60810) for at vise
  // om kunden overhovedet har aftale-regler i prismatrixen.
  const floorProbeQuery = useQuery({
    enabled: !!companyId,
    queryKey: ["floor-probe", companyId],
    queryFn: async () => {
      // Prøv et par varenumre fra forskellige grupper
      const probes = ["60810", "61160", "1930"];
      for (const v of probes) {
        const { data } = await supabase.rpc("get_quote_floor_discount", {
          p_company_id: companyId!,
          p_varenr: v,
        });
        if (data && data.length > 0) return data[0] as { rabat_pct: number; rabat_kr: number; kilde: string };
      }
      return null;
    },
  });

  // Machine catalog
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

  // Lines
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
            {isFrozen && <Badge variant="destructive">Frosset</Badge>}
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
                onAdded={() => qc.invalidateQueries({ queryKey: ["quote-lines", quoteId] })}
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
                          onChanged={() => qc.invalidateQueries({ queryKey: ["quote-lines", quoteId] })}
                        />
                      ))}
                  </div>
                )}
              </div>
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

function StepCard({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center">
          {step}
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
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

      // Hent rabat-gulv
      const { data: floorRes } = await supabase.rpc("get_quote_floor_discount", {
        p_company_id: companyId,
        p_varenr: m.varenr,
      });
      const floor: Floor = (floorRes && (floorRes as any[]).length > 0)
        ? (floorRes as any[])[0]
        : null;

      const rabatPct = Number(floor?.rabat_pct ?? 0);
      const rabatKr = Number(floor?.rabat_kr ?? 0);
      const netto = calcNetto(listepris, rabatPct, rabatKr);

      const { error } = await supabase.from("quote_lines").insert({
        quote_id: quote.id,
        varenr: m.varenr,
        line_type: "machine",
        beskrivelse_snapshot: m.beskrivelse,
        antal: 1,
        listepris_snapshot: listepris,
        rabat_pct_snapshot: rabatPct,
        rabat_kr_snapshot: rabatKr,
        nettopris_snapshot: netto,
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
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Star className="h-3 w-3" /> Favoritter
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {favoritter.map((m) => (
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
  const [saving, setSaving] = useState(false);

  // Hent gulv for netop denne varenr (cached per line)
  const floorQuery = useQuery({
    queryKey: ["floor", companyId, line.varenr],
    queryFn: async (): Promise<Floor> => {
      const { data, error } = await supabase.rpc("get_quote_floor_discount", {
        p_company_id: companyId,
        p_varenr: line.varenr,
      });
      if (error) throw error;
      return (data && (data as any[]).length > 0) ? (data as any[])[0] : null;
    },
  });

  const floor = floorQuery.data ?? null;
  const floorPct = Number(floor?.rabat_pct ?? 0);
  const floorKr = Number(floor?.rabat_kr ?? 0);

  // Visuel netto-preview
  const previewNetto = useMemo(
    () => calcNetto(Number(line.listepris_snapshot), Number(pct), Number(kr)),
    [line.listepris_snapshot, pct, kr],
  );

  async function save() {
    const pctNum = Number(pct) || 0;
    const krNum = Number(kr) || 0;
    const antalNum = Math.max(1, Number(antal) || 1);

    // Håndhæv gulv
    if (floor) {
      if (pctNum < floorPct) {
        toast.error(`Aftale-gulv: min. ${floorPct}% — kan kun gå højere`);
        setPct(String(floorPct));
        return;
      }
      if (krNum < floorKr) {
        toast.error(`Aftale-gulv: min. ${formatKr(floorKr)} — kan kun gå højere`);
        setKr(String(floorKr));
        return;
      }
    }

    setSaving(true);
    const netto = calcNetto(Number(line.listepris_snapshot), pctNum, krNum) * antalNum;
    const { error } = await supabase
      .from("quote_lines")
      .update({
        antal: antalNum,
        rabat_pct_snapshot: pctNum,
        rabat_kr_snapshot: krNum,
        nettopris_snapshot: netto,
      })
      .eq("id", line.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Linje opdateret");
    onChanged();
  }

  async function remove() {
    if (!confirm("Slet denne linje?")) return;
    const { error } = await supabase.from("quote_lines").delete().eq("id", line.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }

  return (
    <div className="border rounded-md p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="font-medium truncate">
            {line.beskrivelse_snapshot ?? line.varenr}
          </div>
          <div className="text-xs text-muted-foreground">
            {line.varenr} · {line.er_leje ? "Månedlig leje" : "Engangskøb"} · Liste {formatKr(line.listepris_snapshot)}
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
            disabled={disabled}
          />
          <FloorHint loading={floorQuery.isLoading} floor={floor} kind="kr" />
        </div>
        <div>
          <Label className="text-xs">Netto/stk</Label>
          <div className="h-9 px-3 flex items-center rounded-md border bg-muted/40 text-sm">
            {formatKr(previewNetto)}
          </div>
        </div>
        <div>
          <Button onClick={save} disabled={disabled || saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gem"}
          </Button>
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
  if (!v || v <= 0) return (
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

// ---------- cart ----------

function CartSidebar({
  lines,
  pricingMode,
}: {
  lines: QuoteLine[];
  pricingMode: "purchase" | "lease" | "both";
}) {
  const kob = lines.filter((l) => !l.er_leje);
  const leje = lines.filter((l) => l.er_leje);

  const kobTotal = kob.reduce((s, l) => s + Number(l.nettopris_snapshot ?? 0), 0);
  const lejeTotal = leje.reduce((s, l) => s + Number(l.nettopris_snapshot ?? 0), 0);

  return (
    <Card className="p-5 h-fit lg:sticky lg:top-6">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Receipt className="h-4 w-4" /> Kurv
      </h3>

      {pricingMode !== "lease" && (
        <CartSection
          title="Engangskøb"
          icon={<Receipt className="h-3.5 w-3.5" />}
          lines={kob}
          total={kobTotal}
          suffix=""
        />
      )}
      {pricingMode !== "purchase" && (
        <CartSection
          title="Månedlig leje"
          icon={<Calendar className="h-3.5 w-3.5" />}
          lines={leje}
          total={lejeTotal}
          suffix="/md"
        />
      )}

      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground">Ingen linjer endnu.</p>
      )}

      <p className="text-[11px] text-muted-foreground mt-4">
        Engangskøb og månedlig leje summes adskilt. Aldrig blandet.
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
