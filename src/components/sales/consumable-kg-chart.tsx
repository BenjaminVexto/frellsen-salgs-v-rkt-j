import { Card } from "@/components/ui/card";
import { fmtKg, isConsumableGroup, type SalesMonthlyRow } from "@/lib/sales-utils";

function serie(rows: SalesMonthlyRow[], months: number) {
  const out: { period: string; label: string; kg: number }[] = [];
  const now = new Date();
  // Kun hele måneder — den igangværende måned indgår ikke.
  for (let i = months; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    out.push({
      period,
      label: d.toLocaleDateString("da-DK", { month: "short" }),
      kg: 0,
    });
  }
  const idx = new Map(out.map((o, i) => [o.period, i]));
  for (const r of rows) {
    if (!isConsumableGroup(r.product_group_1)) continue;
    const i = idx.get(r.period);
    if (i != null) out[i].kg += Number(r.weight_kg) || 0;
  }
  return out;
}

export function ConsumableKgChart({
  rows,
  months = 18,
}: {
  rows: SalesMonthlyRow[];
  months?: number;
}) {
  const data = serie(rows, months);
  const max = Math.max(1, ...data.map((d) => d.kg));

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">Kg forbrugsvarer pr. måned</h3>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">
        Seneste {months} hele måneder. Tomme måneder er normalt hos kunder, der bestiller i partier.
      </p>
      <div className="flex gap-1.5 h-36">
        {data.map((d) => (
          <div key={d.period} className="flex-1 flex flex-col items-center gap-1 h-full">
            <div className="flex-1 w-full flex items-end min-h-0">
              <div
                className="w-full bg-primary/60 rounded-t"
                style={{ height: `${(d.kg / max) * 100}%`, minHeight: d.kg > 0 ? 2 : 0 }}
                title={`${d.label}: ${fmtKg(d.kg, 1)}`}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Den igangværende måned indgår ikke.
      </p>
    </Card>
  );
}
