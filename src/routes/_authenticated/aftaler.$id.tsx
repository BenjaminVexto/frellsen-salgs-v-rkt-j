import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  FileText,
  Pencil,
  AlertTriangle,
  Upload,
  Loader2,
  Building2,
  Download,
  Search,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  getAgreement,
  listAgreementCompanies,
  downloadAgreementDocument,
  uploadAgreementDocument,
} from "@/lib/agreements.functions";
import { PDFViewerDialog } from "@/components/pdf-viewer-dialog";
import { PrismatrixTable } from "@/components/prismatrix-table";

export const Route = createFileRoute("/_authenticated/aftaler/$id")({
  component: AgreementDetail,
});

type Agreement = {
  id: string;
  name: string;
  kp1_code: string | null;
  kp2_code: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_public_sector: boolean;
  governing_party_name: string | null;
  governing_party_company_id: string | null;
  notes: string | null;
  document_path: string | null;
  document_filename: string | null;
};

type Company = {
  id: string;
  name: string;
  city: string | null;
  zip: string | null;
  assigned_to: string | null;
  customer_segment_1: string | null;
  customer_segment_2: string | null;
  last_purchase_date: string | null;
  seller_name: string | null;
};

function AgreementDetail() {
  const { id } = Route.useParams();
  const auth = useAuth();
  const isAdmin = auth.role === "admin";

  const getFn = useServerFn(getAgreement);
  const listFn = useServerFn(listAgreementCompanies);

  const agreementQ = useQuery({
    queryKey: ["agreement", id],
    queryFn: () => getFn({ data: { id } }) as Promise<Agreement>,
  });
  const companiesQ = useQuery({
    queryKey: ["agreement-companies", id],
    queryFn: () => listFn({ data: { id } }) as Promise<Company[]>,
  });

  if (agreementQ.isLoading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (agreementQ.error || !agreementQ.data) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Link to="/aftaler" className="text-sm text-muted-foreground hover:underline">
          ← Alle aftaler
        </Link>
        <p className="mt-6 text-destructive">
          {agreementQ.error instanceof Error
            ? agreementQ.error.message
            : "Aftale ikke fundet"}
        </p>
      </div>
    );
  }

  const a = agreementQ.data;
  const companyCount = companiesQ.data?.length ?? 0;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-6xl mx-auto pb-24 md:pb-8">
      <Link
        to="/aftaler"
        className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Alle aftaler
      </Link>

      <Card className="p-5 md:p-6 mb-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-semibold truncate">{a.name}</h1>
              <div className="text-sm text-muted-foreground">
                Samarbejdsaftale ·{" "}
                {a.is_public_sector ? "Offentlig" : "Privat"}
              </div>
            </div>
          </div>
          {isAdmin && (
            <Button asChild variant="outline" size="sm">
              <Link to="/aftaler">
                <Pencil className="h-4 w-4 mr-1.5" /> Rediger
              </Link>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          <StatBox label="KP1" value={a.kp1_code ?? "—"} />
          <StatBox label="KP2" value={a.kp2_code ?? "—"} />
          <StatBox
            label="Virksomheder"
            value={companiesQ.isLoading ? "…" : String(companyCount)}
          />
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          <div>
            <strong className="text-foreground">Gyldig:</strong>{" "}
            {a.valid_from
              ? format(parseISO(a.valid_from), "d. MMM yyyy", { locale: da })
              : "—"}{" "}
            →{" "}
            {a.valid_to
              ? format(parseISO(a.valid_to), "d. MMM yyyy", { locale: da })
              : "(ingen udløb)"}
          </div>
          {a.governing_party_name && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              <span>
                <strong className="text-foreground">Styrende part:</strong>{" "}
                {a.governing_party_company_id ? (
                  <Link
                    to="/virksomheder/$id"
                    params={{ id: a.governing_party_company_id }}
                    className="underline inline-flex items-center gap-0.5"
                  >
                    {a.governing_party_name}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  a.governing_party_name
                )}
              </span>
            </div>
          )}
          {a.notes && (
            <p className="whitespace-pre-line pt-2 border-t mt-2 text-sm">
              {a.notes}
            </p>
          )}
        </div>
      </Card>

      {a.is_public_sector && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning-foreground shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold mb-0.5">Offentlig indkøbsaftale</div>
            <div className="text-muted-foreground">
              Kunder på denne aftale må kun bestille varer der er inkluderet i
              aftaledokumentet. Vejled kunden om hvad der er med.
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="document">
        <TabsList>
          <TabsTrigger value="document">Aftaledokument</TabsTrigger>
          <TabsTrigger value="companies">
            Virksomheder {companyCount > 0 && `(${companyCount})`}
          </TabsTrigger>
          {a.kp2_code && (
            <TabsTrigger value="prismatrix">Prismatrix</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="document" className="mt-4">
          <DocumentTab agreement={a} isAdmin={isAdmin} onChanged={() => agreementQ.refetch()} />
        </TabsContent>

        <TabsContent value="companies" className="mt-4">
          <CompaniesTab
            companies={companiesQ.data ?? []}
            loading={companiesQ.isLoading}
            agreementName={a.name}
          />
        </TabsContent>

        {a.kp2_code && (
          <TabsContent value="prismatrix" className="mt-4">
            <PrismatrixTable kp2={a.kp2_code} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-semibold text-sm truncate">{value}</div>
    </div>
  );
}

function DocumentTab({
  agreement,
  isAdmin,
  onChanged,
}: {
  agreement: Agreement;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const downloadFn = useServerFn(downloadAgreementDocument);
  const uploadFn = useServerFn(uploadAgreementDocument);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!agreement.document_path) {
      setBlobUrl(null);
      return;
    }
    let revoked: string | null = null;
    setLoadingUrl(true);
    downloadFn({ data: { agreement_id: agreement.id } })
      .then((r: { base64: string; content_type: string }) => {
        const bytes = atob(r.base64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const blob = new Blob([arr], { type: r.content_type });
        const url = URL.createObjectURL(blob);
        revoked = url;
        setBlobUrl(url);
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Kunne ikke hente dokument"),
      )
      .finally(() => setLoadingUrl(false));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [agreement.id, agreement.document_path, downloadFn]);

  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Kun PDF-filer er tilladt");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Filen er for stor (max 10 MB)");
      return;
    }
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      await uploadFn({
        data: {
          agreement_id: agreement.id,
          filename: file.name,
          file_base64: base64,
        },
      });
      toast.success("Aftaledokument uploadet");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fejlede");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (!agreement.document_path) {
    if (!isAdmin) {
      return (
        <Card className="p-8 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">Intet aftaledokument</h3>
          <p className="text-sm text-muted-foreground">
            Kontakt din administrator.
          </p>
        </Card>
      );
    }
    return (
      <Card className="p-8 text-center">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold mb-1">Ingen aftaledokument</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload PDF-aftalen så sælgere kan vejlede kunder korrekt.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Upload aftaledokument
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-3 md:p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="text-sm">
          <div className="font-medium truncate">
            {agreement.document_filename ?? "Aftaledokument"}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewerOpen(true)}>
            <ExternalLink className="h-4 w-4 mr-1.5" /> Åbn
          </Button>
          {isAdmin && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1.5" />
                )}
                Skift dokument
              </Button>
            </>
          )}
        </div>
      </div>
      {loadingUrl ? (
        <div className="h-[70vh] flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : blobUrl ? (
        <iframe
          src={blobUrl}
          title={agreement.document_filename ?? "Aftaledokument"}
          className="w-full h-[70vh] rounded border bg-muted"
        />
      ) : (
        <p className="text-sm text-muted-foreground p-6 text-center">
          Kunne ikke indlæse dokument.
        </p>
      )}
      <PDFViewerDialog
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        filename={agreement.document_filename ?? "Aftaledokument"}
        fetcher={async () => {
          const r = await downloadFn({ data: { agreement_id: agreement.id } });
          return r as { base64: string; filename: string; content_type: string };
        }}
      />
    </Card>
  );
}

function CompaniesTab({
  companies,
  loading,
  agreementName,
}: {
  companies: Company[];
  loading: boolean;
  agreementName: string;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        (c.city ?? "").toLowerCase().includes(s),
    );
  }, [companies, q]);

  const exportCsv = () => {
    const header = ["Virksomhed", "By", "Postnr", "Sælger", "Seneste køb", "Underaftale"];
    const lines = filtered.map((c) => {
      const sub =
        c.customer_segment_2 && c.customer_segment_2 !== c.customer_segment_1
          ? c.customer_segment_2
          : "";
      return [
        c.name,
        c.city ?? "",
        c.zip ?? "",
        c.seller_name ?? "",
        c.last_purchase_date ?? "",
        sub,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";");
    });
    const csv = "\uFEFF" + [header.join(";"), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aftale-${agreementName.replace(/[^\w-]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="text-sm font-medium">
          {filtered.length} {filtered.length === 1 ? "virksomhed" : "virksomheder"} på aftalen
        </div>
        <div className="flex gap-2 flex-1 sm:flex-none sm:min-w-[300px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrér på navn eller by"
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {companies.length === 0
            ? "Ingen virksomheder matcher denne aftales KP1-kode endnu."
            : "Ingen virksomheder matcher søgningen."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Virksomhed</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Sælger</TableHead>
                <TableHead>Seneste køb</TableHead>
                <TableHead>Underaftale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const sub =
                  c.customer_segment_2 &&
                  c.customer_segment_2 !== c.customer_segment_1
                    ? c.customer_segment_2
                    : null;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/virksomheder/$id"
                        params={{ id: c.id }}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.city ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.seller_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.last_purchase_date
                        ? format(parseISO(c.last_purchase_date), "d. MMM yyyy", {
                            locale: da,
                          })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {sub ? (
                        <Badge variant="secondary" className="font-normal">
                          {sub}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

// Silence unused import warning in some builds.
