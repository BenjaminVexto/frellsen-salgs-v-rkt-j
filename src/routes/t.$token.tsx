import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  hentOffentligtTilbud,
  hentOffentligtTilbudPdf,
  sporQuoteEvent,
  type OffentligTilbudInfo,
} from "@/lib/tilbud-modtagere.functions";
import { Button } from "@/components/ui/button";
import { Download, Loader2, FileWarning } from "lucide-react";

export const Route = createFileRoute("/t/$token")({
  head: () => ({
    meta: [
      { title: "Tilbud — Frellsen Kaffe" },
      { name: "description", content: "Se dit tilbud fra Frellsen Kaffe" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OffentligTilbudSide,
});

function langDato(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
}

/** Renderer alle PDF-sider med pdf.js (virker på iPhone — ingen browser-plugin, ingen iframe). */
function PdfSider({ base64 }: { base64: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fejl, setFejl] = useState(false);
  const [klar, setKlar] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = ref.current;
    if (!container) return;
    container.innerHTML = "";
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const doc = await pdfjs.getDocument({ data: bytes }).promise;
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled) return;
        const page = await doc.getPage(i);
        const width = container.clientWidth || 800;
        const vp1 = page.getViewport({ scale: 1 });
        const scale = (width / vp1.width) * Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.className = "rounded-md border shadow-sm mb-3 bg-white block";
        container.appendChild(canvas);
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      }
      if (!cancelled) setKlar(true);
    })().catch(() => !cancelled && setFejl(true));
    return () => {
      cancelled = true;
    };
  }, [base64]);

  return (
    <div>
      {!klar && !fejl && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {fejl && (
        <p className="text-sm text-muted-foreground text-center py-8">
          PDF&apos;en kunne ikke vises her — brug Download-knappen i stedet.
        </p>
      )}
      <div ref={ref} />
    </div>
  );
}

function OffentligTilbudSide() {
  const { token } = Route.useParams();
  const hentInfo = useServerFn(hentOffentligtTilbud);
  const hentPdf = useServerFn(hentOffentligtTilbudPdf);
  const spor = useServerFn(sporQuoteEvent);
  const [pdf, setPdf] = useState<{ base64: string; filename: string } | null>(null);
  const trackedRef = useRef(false);

  const infoQuery = useQuery({
    queryKey: ["offentligt-tilbud", token],
    queryFn: async () => (await hentInfo({ data: { token } })) as OffentligTilbudInfo | null,
    staleTime: 60_000,
    retry: false,
  });

  // Spor åbning — men aldrig for en indlogget CRM-bruger (sælgeren selv m.m.)
  useEffect(() => {
    if (!infoQuery.data || trackedRef.current) return;
    trackedRef.current = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) return;
      spor({ data: { token, event: "aabnet", user_agent: navigator.userAgent } }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoQuery.data, token]);

  // Hent PDF når info er på plads
  useEffect(() => {
    if (!infoQuery.data) return;
    let cancelled = false;
    hentPdf({ data: { token } })
      .then((r) => !cancelled && setPdf(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoQuery.data, token]);

  async function download() {
    if (!pdf) return;
    const bytes = atob(pdf.base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = pdf.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) spor({ data: { token, event: "downloadet", user_agent: navigator.userAgent } }).catch(() => {});
  }

  if (infoQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const info = infoQuery.data;
  if (!info) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 px-4 text-center">
        <FileWarning className="h-10 w-10 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Linket er ikke gyldigt</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          Dette tilbudslink findes ikke eller er ikke længere aktivt. Kontakt din konsulent hos
          Frellsen Kaffe, hvis du mener, det er en fejl.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-background border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="text-lg font-bold tracking-tight">
            FRELLSEN <span className="font-normal text-muted-foreground">KAFFE</span>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={download} disabled={!pdf}>
            <Download className="h-3.5 w-3.5" /> Download
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">
            Tilbud {info.quote_number ?? ""} til {info.company_name ?? "dig"}
          </h1>
          <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
            {info.seller_name && (
              <p>
                {info.seller_name}
                {info.seller_email ? (
                  <>
                    {" · "}
                    <a href={`mailto:${info.seller_email}`} className="underline underline-offset-2">
                      {info.seller_email}
                    </a>
                  </>
                ) : null}
              </p>
            )}
            {info.expiry_date && <p>Tilbuddet er gyldigt til {langDato(info.expiry_date)}</p>}
          </div>
        </div>

        {pdf ? (
          <PdfSider base64={pdf.base64} />
        ) : (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pb-6">
          Frellsen Kaffe · Dette link er personligt og viser kun dette tilbud.
        </p>
      </main>
    </div>
  );
}
