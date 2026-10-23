import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { PDFViewerDialog } from "@/components/pdf-viewer-dialog";
import { TilbudModtagerStatus } from "@/components/tilbud-modtager-status";
import { hentTilbudPdf } from "@/lib/tilbud-pdf.functions";

type Q = {
  id: string;
  quote_number: string | null;
  sent_date: string | null;
  estimated_value: number | null;
  status: string;
  pdf_path: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  kladde: "Kladde", sendt: "Sendt", under_opfølgning: "Sendt", accepteret: "Accepteret", afvist: "Afvist", udløbet: "Udløbet",
};
const AABEN = new Set(["sendt", "under_opfølgning"]);
/** Åbne tilbud (sendt, under opfølgning) øverst; ellers bevares rækkefølgen (nyeste først). */
export function sorterTilbud<T extends { status: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(AABEN.has(b.status)) - Number(AABEN.has(a.status)));
}

const dkk = (v: number | null) => (v == null ? "—" : `${Math.round(v).toLocaleString("da-DK")} kr.`);
const dato = (d: string | null) => (d ? new Date(d).toLocaleDateString("da-DK") : "—");

export function TilbudSektion({ companyId, reloadKey }: { companyId: string; reloadKey: number }) {
  const [rows, setRows] = useState<Q[]>([]);

  useEffect(() => {
    supabase
      .from("quotes")
      .select("id, quote_number, sent_date, estimated_value, status, pdf_path")
      .eq("company_id", companyId)
      .order("sent_date", { ascending: false, nullsFirst: false })
      .then(({ data }) => setRows(sorterTilbud((data as Q[]) ?? [])));
  }, [companyId, reloadKey]);

  const hentPdf = useServerFn(hentTilbudPdf);
  const [vis, setVis] = useState<Q | null>(null);

  return (
    <Card className="p-5 mt-4">
      <h2 className="font-semibold flex items-center gap-2 mb-3"><FileText className="h-4 w-4" /> Tilbud</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Ingen tilbud</p> : <div className="divide-y">
        {rows.map((q) => (
          <div key={q.id} className="py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-medium">Tilbud {q.quote_number ?? "—"}</span>
                <span className="text-muted-foreground"> · {STATUS_LABEL[q.status] ?? q.status} · {dato(q.sent_date)} · Årsværdi {dkk(q.estimated_value)}</span>
              </div>
              {q.pdf_path && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setVis(q)}>Åbn PDF</Button>
                </div>
              )}
            </div>
            {q.pdf_path && (
              <div className="mt-1">
                <TilbudModtagerStatus quoteId={q.id} companyId={companyId} />
              </div>
            )}
          </div>
        ))}
      </div>}
      {vis && (
        <PDFViewerDialog
          open={!!vis}
          onClose={() => setVis(null)}
          filename={`Tilbud ${vis.quote_number ?? ""}.pdf`}
          fetcher={() => hentPdf({ data: { quote_id: vis.id } })}
        />
      )}
    </Card>
  );
}
