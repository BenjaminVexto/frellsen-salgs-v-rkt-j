import { Card } from "@/components/ui/card";
import { Calendar, Coffee, TrendingUp, Wallet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  currentMonthStart,
  daysSince,
  filterByPeriod,
  fmtKg,
  fmtKr,
  isConsumableGroup,
  lastConsumablePurchasePeriod,
  monthsAgo,
  sumRows,
  type SalesMonthlyRow,
} from "@/lib/sales-utils";

/** Fire rene nøgletal — ingen pile, ingen procenter, ingen farve. */
export function SalesFactsStrip({
  rows,
  isAdmin,
}: {
  rows: SalesMonthlyRow[];
  isAdmin: boolean;
}) {
  const nuMdr = currentMonthStart();
  const last12 = filterByPeriod(rows, monthsAgo(12), nuMdr);
  const last12Cons = last12.filter((r) => isConsumableGroup(r.product_group_1));
  const alt = sumRows(last12);
  const cons = sumRows(last12Cons);
  const lastCons = lastConsumablePurchasePeriod(rows);

  const dg =
    isAdmin && cons.contribution != null && cons.revenue > 0
      ? cons.contribution / cons.revenue
      : null;

  return (
    <div className={`grid gap-3 ${isAdmin ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`}>
      <Fact
        icon={<TrendingUp className="h-4 w-4" />}
        label="Omsætning 12 mdr."
        value={fmtKr(alt.revenue)}
        note="Alt salg"
      />
      <Fact
        icon={<Coffee className="h-4 w-4" />}
        label="Kg forbrugsvarer 12 mdr."
        value={fmtKg(cons.weightKg)}
        note="Kaffe, te, chokolade m.m."
      />
      {isAdmin && (
        <Fact
          icon={<Wallet className="h-4 w-4" />}
          label="DG forbrugsvarer"
          value={cons.contribution != null ? fmtKr(cons.contribution) : "—"}
          note={dg != null ? `Dækningsgrad ${(dg * 100).toFixed(1).replace(".", ",")} %` : "Kun synlig for admin"}
          admin
        />
      )}
      <Fact
        icon={<Calendar className="h-4 w-4" />}
        label="Sidste forbrugskøb"
        value={lastCons ? format(parseISO(lastCons), "d. MMM yyyy", { locale: da }) : "—"}
        note={lastCons ? `for ${daysSince(lastCons)} dage siden` : "Ingen registreret"}
      />
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
  note,
  admin,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
  admin?: boolean;
}) {
  return (
    <Card className={`p-4 relative ${admin ? "border-dashed" : ""}`}>
      {admin && (
        <span className="absolute top-2 right-2 text-[10px] font-medium tracking-wider uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
          Admin
        </span>
      )}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {note && <div className="text-xs text-muted-foreground mt-1">{note}</div>}
    </Card>
  );
}
