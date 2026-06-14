import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Tag } from "lucide-react";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  getCompanyPricingSummary,
  type CategorySummary,
  type MatchSource,
} from "@/lib/agreement-pricing.functions";
import { CompanyPrismatrixTable } from "@/components/company-prismatrix-table";

const KAFFE = new Set(["Hele bønner", "VAC kaffe", "Instant"]);
const PCT_CATS = new Set(["Maskiner", "Tilbehør"]);

function fmtKr(n: number): string {
  return n.toLocaleString("da-DK", { maximumFractionDigits: 2 });
}
function fmtPct(n: number): string {
  return `${n.toLocaleString("da-DK", { maximumFractionDigits: 1 })}%`;
}
function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    return format(parseISO(d), "d. MMM yyyy", { locale: da });
  } catch {
    return d;
  }
}

const SOURCE_LABEL: Record<MatchSource, string> = {
  kundenr: "Kundenr-aftale",
  "kp1+kp2": "KP1+KP2 kombi",
  kp1: "KP1-gruppe",
  kp2: "KP2-gruppe",
};

function SegmentLine({
  title,
  segments,
  kind,
}: {
  title: string;
  segments: CategorySummary[];
  kind: "kr" | "pct";
}) {
  if (!segments.length) return null;
  return (
    <div className="text-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {title}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => {
          const val =
            kind === "kr"
              ? s.avg_kr != null
                ? `${fmtKr(s.avg_kr)} kr`
                : null
              : s.avg_pct != null
                ? fmtPct(s.avg_pct)
                : null;
          if (!val) return null;
          return (
            <span key={s.kategori}>
              <strong className="text-foreground">{s.kategori}:</strong>{" "}
              <span className="text-muted-foreground">{val}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function CompanyPricingSummary({ companyId }: { companyId: string }) {
  const fn = useServerFn(getCompanyPricingSummary);
  const q = useQuery({
    queryKey: ["company-pricing-summary", companyId],
    queryFn: () =>
      fn({ data: { company_id: companyId } }) as Promise<{
        vismaId: string | null;
        kp1: string | null;
        kp2: string | null;
        agreement_id: string | null;
        segments: CategorySummary[];
        rowCount: number;
        valid_from: string | null;
        valid_to: string | null;
        countsBySource: Record<MatchSource, number>;
      }>,
  });
  const [open, setOpen] = useState(false);

  if (q.isLoading || !q.data) return null;
  const d = q.data;
  if (d.rowCount === 0) return null;

  const kaffe = d.segments.filter((s) => KAFFE.has(s.kategori));
  const pct = d.segments.filter((s) => PCT_CATS.has(s.kategori));
  const ovrige = d.segments.filter(
    (s) => !KAFFE.has(s.kategori) && !PCT_CATS.has(s.kategori),
  );

  const sourceChips = (Object.keys(d.countsBySource) as MatchSource[])
    .filter((k) => d.countsBySource[k] > 0)
    .map((k) => ({ source: k, count: d.countsBySource[k] }));

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Prismatrix-rabatter</h3>
          {d.vismaId && (
            <Badge variant="outline" className="font-mono text-[10px]">
              Kundenr {d.vismaId}
            </Badge>
          )}
          {d.kp1 && (
            <Badge variant="outline" className="font-mono text-[10px]">
              KP1 {d.kp1}
            </Badge>
          )}
          {d.kp2 && (
            <Badge variant="outline" className="font-mono text-[10px]">
              KP2 {d.kp2}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className="text-xs h-7"
        >
          {open ? (
            <>
              Skjul rækker <ChevronUp className="h-3 w-3 ml-1" />
            </>
          ) : (
            <>
              Vis alle {d.rowCount} rækker <ChevronDown className="h-3 w-3 ml-1" />
            </>
          )}
        </Button>
      </div>

      {sourceChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {sourceChips.map(({ source, count }) => (
            <Badge key={source} variant="secondary" className="text-[10px] font-normal">
              {SOURCE_LABEL[source]}: {count}
            </Badge>
          ))}
        </div>
      )}

      <div className="space-y-2.5">
        <SegmentLine title="Kaffe (kr-rabat)" segments={kaffe} kind="kr" />
        <SegmentLine title="Maskiner / Tilbehør (%-rabat)" segments={pct} kind="pct" />
        {ovrige.length > 0 && (
          <SegmentLine title="Øvrige" segments={ovrige} kind="kr" />
        )}
      </div>

      {(d.valid_from || d.valid_to) && (
        <div className="text-xs text-muted-foreground mt-3 pt-3 border-t">
          Gyldig: {fmtDate(d.valid_from)} → {fmtDate(d.valid_to)}
        </div>
      )}

      {open && (
        <div className="mt-4 pt-4 border-t">
          <CompanyPrismatrixTable companyId={companyId} />
        </div>
      )}
    </Card>
  );
}
