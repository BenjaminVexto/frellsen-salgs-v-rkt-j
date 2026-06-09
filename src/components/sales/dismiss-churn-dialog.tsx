import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Search, Check } from "lucide-react";
import {
  dismissChurningCustomer,
  listCompetitorsForSelect,
} from "@/lib/sales.functions";
import {
  searchCompaniesForRelation,
  createManualRelation,
  getCompanyRelations,
  type CompanySearchResult,
} from "@/lib/relations.functions";

type Reason =
  | "lost_competitor"
  | "lost_tender"
  | "closed"
  | "paused"
  | "supplied_via";

export function DismissChurnDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  companyName: string;
}) {
  const [reason, setReason] = useState<Reason>("lost_competitor");
  const [competitorId, setCompetitorId] = useState<string>("");
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [snoozeDays, setSnoozeDays] = useState<string>("30");

  // supplied_via state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<CompanySearchResult | null>(null);

  const qc = useQueryClient();

  const listFn = useServerFn(listCompetitorsForSelect);
  const competitorsQ = useQuery({
    queryKey: ["competitors-select"],
    queryFn: () => listFn({}),
    enabled: open,
  });

  // Existing forsynes_af relations — to avoid creating a duplicate
  const relationsFn = useServerFn(getCompanyRelations);
  const relationsQ = useQuery({
    queryKey: ["relations", companyId],
    queryFn: () => relationsFn({ data: { companyId } }),
    enabled: open,
  });
  const existingSuppliedVia = ((relationsQ.data?.confirmed ?? []) as any[]).filter(
    (r) => r.direction === "out" && r.relation_type === "forsynes_af",
  );

  const searchFn = useServerFn(searchCompaniesForRelation);
  const createRelFn = useServerFn(createManualRelation);
  const dismissFn = useServerFn(dismissChurningCustomer);

  async function runSearch() {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await searchFn({ data: { query, excludeCompanyId: companyId } });
      setResults(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Søgning fejlede");
    } finally {
      setSearching(false);
    }
  }

  const reset = () => {
    setReason("lost_competitor");
    setCompetitorId("");
    setExpectedDate("");
    setSnoozeDays("30");
    setQuery("");
    setResults([]);
    setPicked(null);
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (reason === "supplied_via") {
        // If an existing forsynes_af relation already exists, no need to create
        // another — the churning exclusion already applies. Just acknowledge.
        if (!picked && existingSuppliedVia.length > 0) {
          return { ok: true, existed: true as const };
        }
        if (!picked) throw new Error("Vælg den virksomhed der køber for kunden");
        // Avoid duplicate when user happens to pick same target as an existing one
        const dupe = existingSuppliedVia.some((r) => r.other_company_id === picked.id);
        if (!dupe) {
          await createRelFn({
            data: {
              fromCompanyId: companyId,
              toCompanyId: picked.id,
              relationType: "forsynes_af",
            },
          });
        }
        return { ok: true };
      }
      await dismissFn({
        data: {
          company_id: companyId,
          reason,
          competitor_id:
            reason === "lost_competitor" || reason === "lost_tender"
              ? competitorId || null
              : null,
          expected_date:
            (reason === "lost_competitor" || reason === "lost_tender") && expectedDate
              ? expectedDate
              : null,
          snooze_days: reason === "paused" ? Number(snoozeDays) : null,
        },
      });
      return { ok: true };
    },
    onSuccess: () => {
      toast.success("Kunden er fjernet fra listen");
      qc.invalidateQueries({ queryKey: ["my-churning"] });
      qc.invalidateQueries({ queryKey: ["relations", companyId] });
      onOpenChange(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunne ikke gemme"),
  });

  const needsCompetitor =
    reason === "lost_competitor" || reason === "lost_tender";
  const canSubmit =
    reason === "supplied_via"
      ? !!picked || existingSuppliedVia.length > 0
      : !needsCompetitor || !!competitorId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fjern fra "Kunder på vej væk"</DialogTitle>
          <DialogDescription>
            Hvorfor køber <span className="font-medium">{companyName}</span> ikke længere?
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={reason} onValueChange={(v) => setReason(v as Reason)} className="gap-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <RadioGroupItem value="lost_competitor" className="mt-0.5" />
            <div className="text-sm">Tabt til konkurrent</div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <RadioGroupItem value="lost_tender" className="mt-0.5" />
            <div className="text-sm">Tabt udbud</div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <RadioGroupItem value="closed" className="mt-0.5" />
            <div className="text-sm">Kunde ophørt / lukket</div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <RadioGroupItem value="paused" className="mt-0.5" />
            <div className="text-sm">Midlertidig pause (skjul fra min liste)</div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <RadioGroupItem value="supplied_via" className="mt-0.5" />
            <div className="text-sm">
              Køber via anden konto (kantineoperatør / forsynings-relation)
            </div>
          </label>
        </RadioGroup>

        {needsCompetitor && (
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Konkurrent</Label>
              <Select value={competitorId} onValueChange={setCompetitorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vælg konkurrent…" />
                </SelectTrigger>
                <SelectContent>
                  {(competitorsQ.data?.competitors ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                {reason === "lost_tender" ? "Genudbud-dato (valgfri)" : "Udløbsdato (valgfri)"}
              </Label>
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
          </div>
        )}

        {reason === "paused" && (
          <div className="pt-2">
            <Label className="text-xs">Skjul i</Label>
            <Select value={snoozeDays} onValueChange={setSnoozeDays}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 dage</SelectItem>
                <SelectItem value="60">60 dage</SelectItem>
                <SelectItem value="90">90 dage</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {reason === "supplied_via" && (
          <div className="space-y-3 pt-2">
            {existingSuppliedVia.length > 0 ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="font-medium mb-1">Allerede registreret:</div>
                <ul className="space-y-0.5">
                  {existingSuppliedVia.map((r) => (
                    <li key={r.id}>
                      Forsynes af <span className="font-medium">{r.other_company_name}</span>
                    </li>
                  ))}
                </ul>
                <div className="text-xs text-muted-foreground mt-2">
                  Klik "Gem og fjern" — kunden vil ikke længere vises på listen.
                </div>
              </div>
            ) : (
              <>
                <Label className="text-xs">
                  Søg den virksomhed der køber forbrugsvarerne (navn, CVR, kundenr, lev.nr.)
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Fx Serwiz, 3003707, 12345678…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        runSearch();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={runSearch}
                    disabled={searching}
                  >
                    {searching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {results.length > 0 && (
                  <div className="max-h-56 overflow-auto border border-border rounded-md divide-y divide-border">
                    {results.map((r) => {
                      const active = picked?.id === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setPicked(r)}
                          className={`w-full text-left p-2 text-sm hover:bg-muted/50 flex items-start gap-2 ${
                            active ? "bg-primary/10" : ""
                          }`}
                        >
                          {active ? (
                            <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                          ) : (
                            <div className="w-4 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-foreground">{r.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {[
                                r.city,
                                r.cvr ? `CVR ${r.cvr}` : null,
                                r.visma_id ? `Kundenr ${r.visma_id}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                            {r.match_via === "delivery_no" && r.via_location_label && (
                              <div className="text-xs text-primary mt-0.5">
                                Matchet via leveringsnr: {r.via_location_label}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Ingen resultater — prøv et andet søgeord.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!canSubmit || mut.isPending}
          >
            {mut.isPending ? "Gemmer…" : "Gem og fjern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
