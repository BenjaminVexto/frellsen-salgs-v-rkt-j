import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tilbud/")({
  component: TilbudOversigtPage,
});

type Tab = "kladder" | "sendte" | "udloebne" | "alle";

type QuoteRow = {
  id: string;
  quote_number: string | null;
  status: string;
  created_at: string;
  sent_date: string | null;
  expiry_date: string | null;
  frozen_at: string | null;
  estimated_value: number | null;
  created_by: string;
  company_id: string;
  companies: { id: string; name: string | null } | null;
};

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("da-DK", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}
function fmtKr(n: number | null | undefined) {
  if (n == null) return "—";
  return (
    new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(n) +
    " kr"
  );
}

function TilbudOversigtPage() {
  const auth = useAuth();
  const [rows, setRows] = useState<QuoteRow[] | null>(null);
  const [tab, setTab] = useState<Tab>("alle");
  const [q, setQ] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const seesAll = auth.role === "admin" || auth.role === "salgssupport";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let query = supabase
        .from("quotes")
        .select(
          "id, quote_number, status, created_at, sent_date, expiry_date, frozen_at, estimated_value, created_by, company_id, companies(id, name)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (!seesAll && auth.user?.id) {
        query = query.eq("created_by", auth.user.id);
      }
      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        toast.error("Kunne ikke hente tilbud: " + error.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as unknown as QuoteRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.user?.id, seesAll]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const counts = useMemo(() => {
    const all = rows ?? [];
    const kladder = all.filter((r) => r.status === "kladde").length;
    const udloebne = all.filter(
      (r) => r.status === "sendt" && r.expiry_date && r.expiry_date < today,
    ).length;
    const sendte = all.filter(
      (r) =>
        r.status === "sendt" &&
        (!r.expiry_date || r.expiry_date >= today),
    ).length;
    return { alle: all.length, kladder, sendte, udloebne };
  }, [rows, today]);

  const filtered = useMemo(() => {
    const all = rows ?? [];
    const ql = q.trim().toLowerCase();
    return all.filter((r) => {
      // status tab
      if (tab === "kladder" && r.status !== "kladde") return false;
      if (tab === "sendte") {
        if (r.status !== "sendt") return false;
        if (r.expiry_date && r.expiry_date < today) return false;
      }
      if (tab === "udloebne") {
        if (r.status !== "sendt") return false;
        if (!r.expiry_date || r.expiry_date >= today) return false;
      }
      // search
      if (ql) {
        const hay = [
          r.quote_number ?? "",
          r.companies?.name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [rows, tab, q, today]);

  function statusLabel(r: QuoteRow): { label: string; cls: string } {
    if (r.status === "kladde")
      return { label: "Kladde", cls: "bg-muted text-muted-foreground" };
    if (r.status === "sendt") {
      if (r.expiry_date && r.expiry_date < today)
        return {
          label: "Udløbet",
          cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
        };
      return {
        label: "Sendt",
        cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
      };
    }
    return { label: r.status, cls: "bg-muted text-muted-foreground" };
  }

  return (
    <div className="container mx-auto py-6 px-4 md:px-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="h-6 w-6" /> Tilbud
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rows == null
              ? "Henter…"
              : `${counts.alle} tilbud${seesAll ? "" : " (dine egne)"}`}
          </p>
        </div>
        <Button onClick={() => setPickerOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nyt tilbud
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(
          [
            ["alle", `Alle (${counts.alle})`],
            ["kladder", `Kladder (${counts.kladder})`],
            ["sendte", `Sendte (${counts.sendte})`],
            ["udloebne", `Udløbne (${counts.udloebne})`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
              tab === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="relative ml-auto w-full md:w-72">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søg tilbudsnr eller kunde…"
            className="pl-8"
          />
        </div>
      </div>

      {rows == null ? (
        <div className="py-12 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Henter tilbud…
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed rounded-lg py-12 text-center text-muted-foreground">
          Ingen tilbud matcher.
        </div>
      ) : (
        <div className="border rounded-lg divide-y bg-card">
          {filtered.map((r) => {
            const st = statusLabel(r);
            return (
              <Link
                key={r.id}
                to="/tilbud/$id"
                params={{ id: r.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="font-mono text-sm w-20 shrink-0 text-muted-foreground">
                  {r.quote_number ?? "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {r.companies?.name ?? "Ukendt kunde"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Oprettet {fmtDate(r.created_at)}
                    {r.sent_date ? ` · Sendt ${fmtDate(r.sent_date)}` : ""}
                    {r.expiry_date ? ` · Gyldig til ${fmtDate(r.expiry_date)}` : ""}
                  </div>
                </div>
                <div className="text-right text-sm w-28 shrink-0 hidden md:block">
                  {fmtKr(r.estimated_value)}
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}
                >
                  {st.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <CompanyPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
      />
    </div>
  );
}

function CompanyPickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string | null; cvr: string | null; city: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, cvr, city")
        .or(`name.ilike.%${term}%,cvr.ilike.%${term}%`)
        .order("name")
        .limit(20);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        toast.error("Søgning fejlede: " + error.message);
        return;
      }
      setResults(data ?? []);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open]);

  async function pick(companyId: string) {
    if (creating) return;
    setCreating(true);
    const { data, error } = await supabase.rpc("create_quote_draft", {
      _company_id: companyId,
      _delivery_location_id: undefined,
      _pricing_mode: "purchase",
    });
    setCreating(false);
    if (error || !data) {
      toast.error("Kunne ikke oprette tilbud: " + (error?.message ?? "ukendt"));
      return;
    }
    onOpenChange(false);
    navigate({ to: "/tilbud/$id", params: { id: data as string } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vælg kunde til nyt tilbud</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søg på navn eller CVR…"
            className="pl-8"
          />
        </div>
        <div className="max-h-80 overflow-y-auto -mx-2">
          {loading && (
            <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Søger…
            </div>
          )}
          {!loading && q.trim().length >= 2 && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Ingen virksomheder fundet.
            </div>
          )}
          {!loading && q.trim().length < 2 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Skriv mindst 2 tegn for at søge.
            </div>
          )}
          <ul className="divide-y">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => pick(c.id)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  <div className="font-medium">{c.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.cvr ? `CVR ${c.cvr}` : "—"}
                    {c.city ? ` · ${c.city}` : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {creating && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Opretter kladde…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
