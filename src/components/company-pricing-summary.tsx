import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Tag } from "lucide-react";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  getCompanyPricingSummary,
  type CategorySummary,
} from "@/lib/agreement-pricing.functions";

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
        kp2: string | null;
        agreement_id: string | null;
        segments: CategorySummary[];
        rowCount: number;
        valid_from: string | null;
        valid_to: string | null;
      }>,
  });

  if (q.isLoading || !q.data) return null;
  const d = q.data;
  if (!d.kp2 || d.rowCount === 0) return null;

  const kaffe = d.segments.filter((s) => KAFFE.has(s.kategori));
  const pct = d.segments.filter((s) => PCT_CATS.has(s.kategori));
  const ovrige = d.segments.filter(
    (s) => !KAFFE.has(s.kategori) && !PCT_CATS.has(s.kategori),
  );

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Prismatrix-rabatter</h3>
          <Badge variant="outline" className="font-mono text-[10px]">
            KP2 {d.kp2}
          </Badge>
        </div>
        {d.agreement_id ? (
          <Link
            to="/aftaler/$id"
            params={{ id: d.agreement_id }}
            className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
          >
            Se fuld prismatrix <ChevronRight className="h-3 w-3" />
          </Link>
        ) : (
          <Link
            to="/aftaler/kp2/$code"
            params={{ code: d.kp2 }}
            className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
          >
            Se fuld prismatrix <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>

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
    </Card>
  );
}
