import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import frellsenLogo from "@/assets/frellsen-logo.png";
import { Receipt, Calendar, Repeat } from "lucide-react";

type Line = {
  id: string;
  varenr: string | null;
  line_type: "machine" | "consumable" | "accessory" | string;
  beskrivelse_snapshot: string | null;
  antal: number;
  listepris_snapshot: number | null;
  rabat_pct_snapshot: number | null;
  rabat_kr_snapshot: number | null;
  nettopris_snapshot: number | null;
  nettopris_enhed_snapshot: number | null;
  er_leje: boolean;
  sort_order: number;
};

type PublicQuote = {
  quote: {
    id: string;
    quote_number: string;
    status: string;
    pricing_mode: string;
    sent_date: string | null;
    expiry_date: string | null;
    frozen_at: string | null;
    notes: string | null;
  };
  company: {
    name: string;
    address: string | null;
    zip: string | null;
    city: string | null;
    contact_person: string | null;
    cvr: string | null;
  };
  location: {
    address: string | null;
    zip: string | null;
    city: string | null;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  lines: Line[];
};

const publicQuoteQuery = (token: string) =>
  queryOptions({
    queryKey: ["public-quote", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_quote", { _token: token });
      if (error) throw error;
      if (!data) throw notFound();
      return data as unknown as PublicQuote;
    },
  });

export const Route = createFileRoute("/t/$token")({
  ssr: false,
  loader: async ({ params, context }) =>
    context.queryClient.ensureQueryData(publicQuoteQuery(params.token)),
  head: () => ({
    meta: [
      { title: "Tilbud — Frellsen" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PublicQuotePage,
  errorComponent: () => <NotFoundCard />,
  notFoundComponent: () => <NotFoundCard />,
});

function NotFoundCard() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="max-w-md text-center bg-card border rounded-lg p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Tilbud ikke fundet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Linket er ugyldigt, udløbet eller tilbuddet er endnu ikke afsendt.
        </p>
      </div>
    </div>
  );
}

function fmt(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("da-DK", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return s;
  }
}

function lineTotal(l: Line) {
  // Prefer line total snapshot; fall back to enhed * antal.
  if (l.nettopris_snapshot != null && l.nettopris_enhed_snapshot != null) {
    return Number(l.nettopris_snapshot);
  }
  if (l.nettopris_enhed_snapshot != null) {
    return Number(l.nettopris_enhed_snapshot) * Number(l.antal ?? 1);
  }
  return Number(l.nettopris_snapshot ?? 0);
}

function listTotal(l: Line) {
  return Number(l.listepris_snapshot ?? 0) * Number(l.antal ?? 1);
}

function PublicQuotePage() {
  const { token } = Route.useParams();
  const { data } = useSuspenseQuery(publicQuoteQuery(token));
  const { quote, company, location, lines } = data;

  const engangskob = lines.filter(
    (l) => (l.line_type === "machine" && !l.er_leje) || l.line_type === "accessory",
  );
  const leje = lines.filter((l) => l.line_type === "machine" && l.er_leje);
  const forbrug = lines.filter((l) => l.line_type === "consumable");

  const buckets = [
    { key: "engangskob", title: "Engangskøb", suffix: "", icon: <Receipt className="h-4 w-4" />, lines: engangskob },
    { key: "leje", title: "Månedlig leje", suffix: " /md", icon: <Calendar className="h-4 w-4" />, lines: leje },
    { key: "forbrug", title: "Løbende forbrug", suffix: "", icon: <Repeat className="h-4 w-4" />, lines: forbrug },
  ].filter((b) => b.lines.length > 0);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <header className="px-8 py-8 border-b bg-gradient-to-br from-background to-muted/20">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <img src={frellsenLogo} alt="Frellsen siden 1897" className="h-14 w-auto object-contain" />
              <div className="text-right text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Tilbud</div>
                <div className="text-2xl font-semibold tabular-nums">{quote.quote_number}</div>
                <div className="mt-2 text-muted-foreground">
                  Dato: <span className="text-foreground">{fmtDate(quote.sent_date)}</span>
                </div>
                <div className="text-muted-foreground">
                  Gyldig til: <span className="text-foreground">{fmtDate(quote.expiry_date)}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Tilbud til</div>
                <div className="text-lg font-semibold">{company.name}</div>
                {company.contact_person && (
                  <div className="text-sm text-muted-foreground">Att: {company.contact_person}</div>
                )}
                {(company.address || company.zip || company.city) && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {company.address}
                    {company.address ? <br /> : null}
                    {[company.zip, company.city].filter(Boolean).join(" ")}
                  </div>
                )}
                {company.cvr && (
                  <div className="text-xs text-muted-foreground mt-1">CVR: {company.cvr}</div>
                )}
              </div>
              {location && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Leveringsadresse</div>
                  {location.contact_person && (
                    <div className="text-sm">{location.contact_person}</div>
                  )}
                  <div className="text-sm text-muted-foreground">
                    {location.address}
                    {location.address ? <br /> : null}
                    {[location.zip, location.city].filter(Boolean).join(" ")}
                  </div>
                  {(location.phone || location.email) && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {[location.phone, location.email].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>

          {/* Sections */}
          <div className="divide-y">
            {buckets.length === 0 && (
              <div className="px-8 py-12 text-center text-muted-foreground text-sm">
                Tilbuddet indeholder ingen linjer.
              </div>
            )}
            {buckets.map((b) => {
              const total = b.lines.reduce((s, l) => s + lineTotal(l), 0);
              const listSum = b.lines.reduce((s, l) => s + listTotal(l), 0);
              const savings = Math.max(0, listSum - total);
              return (
                <section key={b.key} className="px-8 py-7">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                        {b.icon}
                      </span>
                      {b.title}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {b.lines.length} {b.lines.length === 1 ? "linje" : "linjer"}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                          <th className="py-2 pr-4 font-medium">Beskrivelse</th>
                          <th className="py-2 px-3 font-medium text-right w-16">Antal</th>
                          <th className="py-2 px-3 font-medium text-right w-28">Listepris</th>
                          <th className="py-2 px-3 font-medium text-right w-24">Rabat</th>
                          <th className="py-2 pl-3 font-medium text-right w-32">Nettopris</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {b.lines.map((l) => {
                          const pct = Number(l.rabat_pct_snapshot ?? 0);
                          const kr = Number(l.rabat_kr_snapshot ?? 0);
                          const rabatLabel =
                            pct > 0 && kr > 0
                              ? `${pct}% + ${fmt(kr)} kr`
                              : pct > 0
                                ? `${pct}%`
                                : kr > 0
                                  ? `${fmt(kr)} kr`
                                  : "—";
                          return (
                            <tr key={l.id} className="align-top">
                              <td className="py-3 pr-4">
                                <div className="font-medium">{l.beskrivelse_snapshot || l.varenr}</div>
                                {l.varenr && (
                                  <div className="text-xs text-muted-foreground">Varenr {l.varenr}</div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right tabular-nums">{l.antal}</td>
                              <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">
                                {fmt(l.listepris_snapshot)}
                              </td>
                              <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">
                                {rabatLabel}
                              </td>
                              <td className="py-3 pl-3 text-right tabular-nums font-semibold">
                                {fmt(lineTotal(l))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2">
                          <td colSpan={4} className="pt-4 pr-4 text-right text-sm">
                            <span className="text-muted-foreground">Listepris i alt </span>
                            <span className="tabular-nums">{fmt(listSum)} kr</span>
                            {savings > 0 && (
                              <span className="ml-3 text-emerald-700 dark:text-emerald-400">
                                · I sparer {fmt(savings)} kr
                              </span>
                            )}
                          </td>
                          <td className="pt-4 pl-3 text-right">
                            <div className="text-xs text-muted-foreground">Total{b.suffix}</div>
                            <div className="text-xl font-bold tabular-nums">
                              {fmt(total)} kr{b.suffix}
                            </div>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>

          {quote.notes && (
            <div className="px-8 py-6 border-t bg-muted/20">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Bemærkninger</div>
              <div className="text-sm whitespace-pre-wrap">{quote.notes}</div>
            </div>
          )}

          <footer className="px-8 py-6 border-t text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
            <div>Alle priser er ekskl. moms. Tilbud gyldigt til {fmtDate(quote.expiry_date)}.</div>
            <div>Frellsen Kaffe A/S</div>
          </footer>
        </div>
      </div>
    </div>
  );
}
