import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, X, FileText } from "lucide-react";

type FetchResult = { base64: string; filename: string; content_type: string };

interface Props {
  open: boolean;
  onClose: () => void;
  filename: string;
  fetcher: () => Promise<FetchResult>;
}

export function PDFViewerDialog({ open, onClose, filename, fetcher }: Props) {
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfContentType, setPdfContentType] = useState<string>("application/pdf");
  const [serverFilename, setServerFilename] = useState<string>(filename);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfBase64(null);

    fetcher()
      .then((r) => {
        if (cancelled) return;
        setPdfBase64(r.base64);
        setPdfContentType(r.content_type || "application/pdf");
        setServerFilename(r.filename || filename);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Kunne ikke hente dokument");
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDownload = async () => {
    try {
      let base64 = pdfBase64;
      let name = serverFilename;
      let contentType = pdfContentType;

      if (!base64) {
        const r = await fetcher();
        base64 = r.base64;
        name = r.filename || filename;
        contentType = r.content_type || "application/pdf";
      }

      const bytes = atob(base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name || filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // ignore
    }
  };

  const dataUrl = pdfBase64 ? `data:application/pdf;base64,${pdfBase64}` : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-4xl w-[95vw] h-[85vh] p-0 flex flex-col gap-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{serverFilename || filename}</DialogTitle>
        <DialogDescription className="sr-only">
          PDF-visning af dokumentet {serverFilename || filename} med mulighed for download.
        </DialogDescription>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm truncate">{serverFilename || filename}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1.5" /> Download
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Luk">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-muted">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Kunne ikke hente dokument. Prøv at downloade det i stedet.
              </p>
              <Button size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1.5" /> Download
              </Button>
            </div>
          ) : dataUrl ? (
            <object
              data={dataUrl}
              type="application/pdf"
              aria-label={serverFilename || filename}
              className="w-full h-full"
            >
              <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Din browser kan ikke vise PDF&apos;en direkte.
                </p>
                <Button size="sm" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-1.5" /> Download
                </Button>
              </div>
            </object>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
