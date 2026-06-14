import { useEffect, useState } from "react";
import { useViewAs } from "@/contexts/view-as-context";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  searchCompaniesForRelation,
  createManualRelation,
  type RelationType,
  type CompanySearchResult,
} from "@/lib/relations.functions";
import { toast } from "sonner";
import { Loader2, Search, Check } from "lucide-react";

const TYPE_LABEL: Record<RelationType, string> = {
  forsynes_af: "Forsynes af (kantineoperatør leverer forbrugsvarer hertil)",
  leverer_til: "Leverer til (denne virksomhed forsyner en anden)",
  maskiner_paa: "Maskiner på (maskiner hører til en anden konto)",
  efterfoelger: "Efterfølger (tidligere konto → ny konto)",
};

export function AddRelationDialog({
  open,
  onOpenChange,
  fromCompanyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fromCompanyId: string;
  onCreated?: () => void;
}) {
  const qc = useQueryClient();
  const searchFn = useServerFn(searchCompaniesForRelation);
  const createFn = useServerFn(createManualRelation);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<CompanySearchResult | null>(null);
  const [type, setType] = useState<RelationType | "">("");
  const [saving, setSaving] = useState(false);
  const { isImpersonating, viewAsName } = useViewAs();

  useEffect(() => {
    if (open && isImpersonating) {
      toast.error(`Read-only — du ser som ${viewAsName ?? "en anden sælger"}. Relationer kan ikke oprettes.`);
      onOpenChange(false);
    }
  }, [open, isImpersonating, viewAsName, onOpenChange]);

  const reset = () => {
    setQuery("");
    setResults([]);
    setPicked(null);
    setType("");
  };

  async function runSearch() {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await searchFn({ data: { query, excludeCompanyId: fromCompanyId } });
      setResults(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Søgning fejlede");
    } finally {
      setSearching(false);
    }
  }

  async function save() {
    if (!picked || !type) return;
    if (isImpersonating) {
      toast.error("Read-only — handling ikke tilladt");
      return;
    }
    setSaving(true);
    try {
      await createFn({
        data: { fromCompanyId, toCompanyId: picked.id, relationType: type },
      });
      toast.success("Relation oprettet");
      qc.invalidateQueries({ queryKey: ["relations", fromCompanyId] });
      onCreated?.();
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke oprette relation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Tilføj forsynings-relation</DialogTitle>
          <DialogDescription>
            Søg den anden virksomhed på navn, CVR, kundenr eller leveringsnr.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Fx Serwiz, 3003707, 12345678..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={runSearch} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="max-h-64 overflow-auto border border-border rounded-md divide-y divide-border">
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
            <p className="text-sm text-muted-foreground">Ingen resultater — prøv et andet søgeord.</p>
          )}

          {picked && (
            <div className="pt-2">
              <label className="text-sm font-medium block mb-1">Relationstype</label>
              <Select value={type} onValueChange={(v) => setType(v as RelationType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Vælg relationstype…" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABEL) as RelationType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Annullér
          </Button>
          <Button onClick={save} disabled={!picked || !type || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Opret relation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
