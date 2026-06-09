import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  getCompanyRelations,
  confirmRelationSuggestion,
  rejectRelationSuggestion,
  deleteCompanyRelation,
  type RelationType,
} from "@/lib/relations.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Link2, ExternalLink, Sparkles, Plus } from "lucide-react";
import { AddRelationDialog } from "@/components/add-relation-dialog";

const TYPE_LABEL: Record<RelationType, string> = {
  forsynes_af: "Forsynes af",
  leverer_til: "Leverer til",
  maskiner_paa: "Maskiner på",
  efterfoelger: "Efterfølger",
};

const TYPE_HELP: Record<RelationType, string> = {
  forsynes_af: "Forbrugsvarer købes via denne virksomhed (kantineoperatør)",
  leverer_til: "Denne virksomhed leverer til den anden",
  maskiner_paa: "Maskiner hører til den anden konto",
  efterfoelger: "Tidligere konto (konkurs/lukket → ny konto)",
};

export function ForsyningsRelationerSektion({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getCompanyRelations);
  const confirmFn = useServerFn(confirmRelationSuggestion);
  const rejectFn = useServerFn(rejectRelationSuggestion);
  const deleteFn = useServerFn(deleteCompanyRelation);
  const [addOpen, setAddOpen] = useState(false);

  const q = useQuery({
    queryKey: ["relations", companyId],
    queryFn: () => fetchFn({ data: { companyId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["relations", companyId] });

  const confirmed = q.data?.confirmed ?? [];
  const suggestions = q.data?.suggestions ?? [];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Forsynings-relationer</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Tilføj relation
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            Forslag fra import ({suggestions.length})
          </div>
          <div className="space-y-3">
            {suggestions.map((s) => (
              <SuggestionRow
                key={s.id}
                suggestion={s}
                onConfirm={async (relationType) => {
                  try {
                    await confirmFn({ data: { suggestionId: s.id, relationType } });
                    toast.success("Relation bekræftet");
                    invalidate();
                  } catch (e: any) {
                    toast.error(e?.message ?? "Kunne ikke bekræfte");
                  }
                }}
                onReject={async () => {
                  await rejectFn({ data: { suggestionId: s.id } });
                  toast.success("Forslag afvist");
                  invalidate();
                }}
              />
            ))}
          </div>
        </div>
      )}

      {confirmed.length === 0 && suggestions.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">
          Ingen forsynings-relationer registreret. Admin kan scanne bemærkningsfelter for at finde forslag.
        </p>
      )}

      {confirmed.length > 0 && (
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-3">
            Bekræftede relationer ({confirmed.length})
          </div>
          <div className="space-y-2">
            {confirmed.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 p-3 rounded-md border border-border"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">
                    {r.direction === "out" ? TYPE_LABEL[r.relation_type] : reverseLabel(r.relation_type)}
                  </div>
                  <Link
                    to="/virksomheder/$id"
                    params={{ id: r.other_company_id }}
                    className="text-sm font-medium text-foreground hover:text-primary inline-flex items-center gap-1"
                  >
                    {r.other_company_name}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {r.other_company_city ?? ""}
                    {r.other_visma_id ? ` · Kundenr ${r.other_visma_id}` : ""}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    if (!confirm("Slet denne relation?")) return;
                    await deleteFn({ data: { relationId: r.id } });
                    toast.success("Relation slettet");
                    invalidate();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      <AddRelationDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        fromCompanyId={companyId}
        onCreated={invalidate}
      />
    </Card>
  );
}

function reverseLabel(t: RelationType): string {
  if (t === "forsynes_af") return "Leverer til";
  if (t === "leverer_til") return "Forsynes af";
  if (t === "maskiner_paa") return "Har maskiner fra";
  if (t === "efterfoelger") return "Forgænger til";
  return t;
}

function SuggestionRow({
  suggestion,
  onConfirm,
  onReject,
}: {
  suggestion: {
    id: string;
    to_visma_id: string;
    to_company_id: string | null;
    to_company_name: string | null;
    to_company_city: string | null;
    source_text: string | null;
  };
  onConfirm: (t: RelationType) => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const [type, setType] = useState<RelationType | "">("");
  const [busy, setBusy] = useState(false);
  const matched = !!suggestion.to_company_id;

  return (
    <div className="p-3 rounded-md border border-dashed border-border bg-muted/30">
      <div className="text-sm">
        Mulig relation til{" "}
        {matched ? (
          <Link
            to="/virksomheder/$id"
            params={{ id: suggestion.to_company_id! }}
            className="font-medium text-foreground hover:text-primary"
          >
            {suggestion.to_company_name}
          </Link>
        ) : (
          <span className="font-medium text-foreground">Kundenr {suggestion.to_visma_id}</span>
        )}
        {suggestion.to_company_city && (
          <span className="text-muted-foreground"> · {suggestion.to_company_city}</span>
        )}
        {!matched && (
          <span className="text-xs text-warning ml-2">(virksomhed ikke fundet i systemet)</span>
        )}
      </div>
      {suggestion.source_text && (
        <div className="text-xs text-muted-foreground mt-1 italic">
          Fundet i bemærkning: "{suggestion.source_text.slice(0, 160)}
          {suggestion.source_text.length > 160 ? "…" : ""}"
        </div>
      )}
      <div className="flex items-center gap-2 mt-3">
        <Select value={type} onValueChange={(v) => setType(v as RelationType)}>
          <SelectTrigger className="h-8 w-[220px]">
            <SelectValue placeholder="Vælg relationstype…" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TYPE_LABEL) as RelationType[]).map((t) => (
              <SelectItem key={t} value={t}>
                <div>
                  <div className="font-medium">{TYPE_LABEL[t]}</div>
                  <div className="text-xs text-muted-foreground">{TYPE_HELP[t]}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!type || busy || !matched}
          onClick={async () => {
            if (!type) return;
            setBusy(true);
            try {
              await onConfirm(type);
            } finally {
              setBusy(false);
            }
          }}
        >
          Bekræft
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onReject();
            } finally {
              setBusy(false);
            }
          }}
        >
          Afvis
        </Button>
      </div>
    </div>
  );
}
