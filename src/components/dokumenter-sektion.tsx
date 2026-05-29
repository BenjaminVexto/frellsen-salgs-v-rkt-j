import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Upload, ExternalLink, Download, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  uploadCompanyDocument,
  deleteCompanyDocument,
  getDocumentSignedUrl,
  downloadCompanyDocument,
} from "@/lib/admin-companies.functions";

type DocType = "aftale" | "kontrakt" | "tilbud" | "maskine" | "andet";

const TYPE_LABEL: Record<DocType, string> = {
  aftale: "Aftale",
  kontrakt: "Kontrakt",
  tilbud: "Tilbud",
  maskine: "Maskine",
  andet: "Andet",
};

type Doc = {
  id: string;
  filename: string;
  document_type: DocType;
  expires_at: string | null;
  notes: string | null;
  uploaded_by: string;
  file_size_bytes: number | null;
  created_at: string;
};

export function DokumenterSektion({
  companyId,
  canWrite,
}: {
  companyId: string;
  canWrite: boolean;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploaderNames, setUploaderNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const uploadFn = useServerFn(uploadCompanyDocument);
  const deleteFn = useServerFn(deleteCompanyDocument);
  const downloadDocFn = useServerFn(downloadCompanyDocument);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("company_documents")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Doc[];
    setDocs(rows);
    const uploaderIds = [...new Set(rows.map((d) => d.uploaded_by))];
    if (uploaderIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", uploaderIds);
      const m: Record<string, string> = {};
      for (const p of profs ?? []) m[p.id] = p.full_name || "";
      setUploaderNames(m);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fetchAsBlobUrl = async (id: string) => {
    const result = await downloadDocFn({ data: { document_id: id } });
    const bytes = atob(result.base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: result.content_type });
    return { blobUrl: URL.createObjectURL(blob), filename: result.filename };
  };

  const handleOpen = async (id: string) => {
    setOpeningId(id);
    try {
      const { blobUrl } = await fetchAsBlobUrl(id);
      window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke åbne dokument");
    } finally {
      setOpeningId(null);
    }
  };

  const handleDownload = async (id: string, filename: string) => {
    setDownloadingId(id);
    try {
      const { blobUrl, filename: srvName } = await fetchAsBlobUrl(id);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename || srvName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke downloade dokument");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteFn({ data: { document_id: deleteId } });
      toast.success("Dokument slettet");
      setDeleteId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke slette");
    }
  };

  // Hide section entirely if no docs and no write access
  if (!canWrite && !loading && docs.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" /> Dokumenter
        </h2>
        {canWrite && (
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Upload dokument
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen dokumenter uploadet.</p>
      ) : (
        <ul className="space-y-3">
          {docs.map((d) => {
            const expiresSoon =
              d.expires_at &&
              differenceInDays(parseISO(d.expires_at), new Date()) <= 90 &&
              differenceInDays(parseISO(d.expires_at), new Date()) >= 0;
            const expired =
              d.expires_at && differenceInDays(parseISO(d.expires_at), new Date()) < 0;
            return (
              <li
                key={d.id}
                className="border rounded-md p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{d.filename}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span>{TYPE_LABEL[d.document_type]}</span>
                    {d.expires_at && (
                      <span
                        className={
                          expired || expiresSoon
                            ? "text-destructive font-medium flex items-center gap-1"
                            : ""
                        }
                      >
                        {(expired || expiresSoon) && <AlertTriangle className="h-3 w-3" />}
                        Udløber {format(parseISO(d.expires_at), "d. MMM yyyy", { locale: da })}
                      </span>
                    )}
                    <span>
                      Uploadet af {uploaderNames[d.uploaded_by] || "—"} ·{" "}
                      {format(parseISO(d.created_at), "d. MMM yyyy", { locale: da })}
                    </span>
                  </div>
                  {d.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{d.notes}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => handleOpen(d.id)} disabled={openingId === d.id}>
                    {openingId === d.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    )}
                    Åbn
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(d.id, d.filename)}
                    disabled={downloadingId === d.id}
                  >
                    {downloadingId === d.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5 mr-1" />
                    )}
                    Download
                  </Button>
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(d.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={async (payload) => {
          await uploadFn({ data: { company_id: companyId, ...payload } });
          await load();
        }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet dokument?</AlertDialogTitle>
            <AlertDialogDescription>
              Dokumentet fjernes permanent fra både databasen og filarkivet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annullér</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Slet</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Card>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUpload: (payload: {
    filename: string;
    document_type: DocType;
    expires_at: string | null;
    notes: string | null;
    file_base64: string;
    file_size_bytes: number;
  }) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [filename, setFilename] = useState("");
  const [docType, setDocType] = useState<DocType>("aftale");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setFilename("");
    setDocType("aftale");
    setExpiresAt("");
    setNotes("");
  };

  const handleFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Kun PDF-filer er tilladt");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Filen er for stor (max 10 MB)");
      return;
    }
    setFile(f);
    if (!filename) setFilename(f.name);
  };

  const submit = async () => {
    if (!file) {
      toast.error("Vælg en PDF-fil");
      return;
    }
    if (!filename.trim()) {
      toast.error("Angiv et dokumentnavn");
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      // Convert to base64 in chunks to avoid stack overflow
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const file_base64 = btoa(binary);

      await onUpload({
        filename: filename.trim(),
        document_type: docType,
        expires_at: expiresAt || null,
        notes: notes.trim() || null,
        file_base64,
        file_size_bytes: file.size,
      });
      toast.success("Dokument uploaded");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload mislykkedes");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload dokument</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>PDF-fil (max 10 MB)</Label>
            <Input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <Label>Dokumentnavn</Label>
            <Input value={filename} onChange={(e) => setFilename(e.target.value)} />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aftale">Aftale</SelectItem>
                <SelectItem value="kontrakt">Kontrakt</SelectItem>
                <SelectItem value="tilbud">Tilbud</SelectItem>
                <SelectItem value="maskine">Maskine</SelectItem>
                <SelectItem value="andet">Andet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Udløbsdato (valgfri)</Label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div>
            <Label>Interne noter (valgfri)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
