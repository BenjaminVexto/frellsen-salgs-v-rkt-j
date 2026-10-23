import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/** Renderer alle PDF-sider med pdf.js (virker på iPhone — ingen browser-plugin, ingen iframe). */
export function PdfSider({ base64 }: { base64: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fejl, setFejl] = useState(false);
  const [klar, setKlar] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = ref.current;
    if (!container) return;
    container.innerHTML = "";
    (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
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
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      }
      if (!cancelled) setKlar(true);
    })().catch((e) => {
      console.error("pdfjs render fejl:", e);
      if (!cancelled) setFejl(true);
    });
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
