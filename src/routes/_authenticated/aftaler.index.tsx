import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  FileText,
  FileCheck2,
  FileWarning,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, differenceInDays } from "date-fns";
import { da } from "date-fns/locale";
import {
  listAgreements,
  createAgreement,
  updateAgreement,
  deleteAgreement,
  setAgreementType,
  deriveAgreementTypeFromName,
  type AgreementType,
} from "@/lib/agreements.functions";
import { listPricingKp2Groups } from "@/lib/agreement-pricing.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/aftaler/")({
  component: AftalerPage,
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
  company_count: number;
  aftale_type: AgreementType;
  aftale_type_manuel: boolean;
};

type TypeFilter = "all" | "offentlig" | "erhverv" | "ski";

const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "offentlig", label: "Offentlige" },
  { value: "erhverv", label: "Erhverv" },
  { value: "ski", label: "SKI" },
];

const TYPE_LABEL: Record<AgreementType, string> = {
  offentlig: "Offentlig",
  erhverv: "Erhverv",
  ski: "SKI",
  ukendt: "Ukendt",
};

function getStatus(validTo: string | null): {
  color: string;
  label: string;
} {
  if (!validTo) return { color: "bg-muted-foreground/40", label: "Ingen udløb" };
  const days = differenceInDays(parseISO(validTo), new Date());
  if (days < 0) return { color: "bg-destructive", label: "Udløbet" };
  if (days <= 30) return { color: "bg-yellow-500", label: "Udløber snart" };
  return { color: "bg-green-600", label: "Gyldig" };
}

function AftalerPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const isAdmin = auth.role === "admin";
  const listFn = useServerFn(listAgreements);
  const deleteFn = useServerFn(deleteAgreement);
  const listKp2Fn = useServerFn(listPricingKp2Groups);

  type PriceGroup = {
    code: string;
    label: string;
    raw: string;
    count: number;
    fra: string | null;
    til: string | null;
    agreement: { id: string } | null;
  };

  const [rows, setRows] = useState<Agreement[]>([]);
  const [kp2Groups, setKp2Groups] = useState<PriceGroup[]>([]);
  const [kp1Groups, setKp1Groups] = useState<PriceGroup[]>([]);
  const [customerSpecificCount, setCustomerSpecificCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [onlyMissingDoc, setOnlyMissingDoc] = useState(false);
  const setTypeFn = useServerFn(setAgreementType);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Agreement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agreement | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [data, groups] = await Promise.all([
        listFn() as Promise<Agreement[]>,
        listKp2Fn() as Promise<{
          kp2: PriceGroup[];
          kp1: PriceGroup[];
          customerSpecificCount: number;
          generalCount: number;
        }>,
      ]);
      setRows(data);
      setKp2Groups(groups.kp2);
      setKp1Groups(groups.kp1);
      setCustomerSpecificCount(groups.customerSpecificCount);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke hente aftaler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.aftale_type !== typeFilter) return false;
      if (onlyMissingDoc && r.document_path) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.kp1_code ?? "").toLowerCase().includes(q) ||
        (r.kp2_code ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter, onlyMissingDoc]);

  // Kun de KP2-grupper der ikke allerede er repræsenteret af en aftale
  const orphanKp2 = useMemo(() => {
    const agreementKp2s = new Set(
      rows
        .map((r) => (r.kp2_code ? String(r.kp2_code).trim() : null))
        .filter(Boolean) as string[],
    );
    const q = search.trim().toLowerCase();
    return kp2Groups
      .filter((g) => !agreementKp2s.has(g.code))
      .map((g) => ({ ...g, aftale_type: deriveAgreementTypeFromName(g.label) }))
      .filter((g) => {
        if (typeFilter !== "all" && g.aftale_type !== typeFilter) return false;
        // orphan-grupper har aldrig dokument
        if (!q) return true;
        return (
          g.code.includes(q) ||
          g.label.toLowerCase().includes(q) ||
          g.raw.toLowerCase().includes(q)
        );
      });
  }, [kp2Groups, rows, search, typeFilter]);

  const orphanKp1 = useMemo(() => {
    const agreementKp1s = new Set(
      rows
        .map((r) => (r.kp1_code ? String(r.kp1_code).trim() : null))
        .filter(Boolean) as string[],
    );
    const q = search.trim().toLowerCase();
    return kp1Groups
      .filter((g) => !agreementKp1s.has(g.code))
      .filter((g) => {
        if (filter !== "all") return false;
        if (!q) return true;
        return (
          g.code.includes(q) ||
          g.label.toLowerCase().includes(q) ||
          g.raw.toLowerCase().includes(q)
        );
      });
  }, [kp1Groups, rows, search, filter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFn({ data: { id: deleteTarget.id } });
      toast.success("Aftalen er slettet.");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke slette");
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> Aftaler
          </h1>
          <p className="text-sm text-muted-foreground">
            Samarbejdsaftaler med kunder
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => {
              setEditing(null);
              setEditOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Ny aftale
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søg på aftalenavn eller kode"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(["all", "public", "private"] as Filter[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Alle" : f === "public" ? "Offentlige" : "Private"}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-4">
            Ingen aftaler oprettet endnu. Opret den første samarbejdsaftale for at
            tilknytte virksomheder automatisk via Visma-koder.
          </p>
          {isAdmin && (
            <Button
              onClick={() => {
                setEditing(null);
                setEditOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Opret første aftale
            </Button>
          )}
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Ingen aftaler matcher søgningen.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a) => {
            const status = getStatus(a.valid_to);
            return (
              <Card
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate({ to: "/aftaler/$id", params: { id: a.id } })}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    navigate({ to: "/aftaler/$id", params: { id: a.id } });
                }}
                className="relative p-4 pl-5 cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
              >
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1.5 ${status.color}`}
                  aria-label={status.label}
                />
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold truncate">{a.name}</h3>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(a);
                        setEditOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  {a.kp1_code && <span>KP1: {a.kp1_code}</span>}
                  {a.kp1_code && a.kp2_code && <span> · </span>}
                  {a.kp2_code && <span>KP2: {a.kp2_code}</span>}
                  {!a.kp1_code && !a.kp2_code && <span>Ingen KP-koder</span>}
                </div>
                <div className="text-sm mb-1">
                  <strong>{a.company_count}</strong> virksomheder
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  Gyldig:{" "}
                  {a.valid_from
                    ? format(parseISO(a.valid_from), "d. MMM yyyy", { locale: da })
                    : "—"}{" "}
                  →{" "}
                  {a.valid_to
                    ? format(parseISO(a.valid_to), "d. MMM yyyy", { locale: da })
                    : "∞"}
                </div>
                {a.is_public_sector && (
                  <Badge variant="secondary" className="gap-1 mb-2">
                    <AlertTriangle className="h-3 w-3" /> Offentlig aftale
                  </Badge>
                )}
                {a.governing_party_name && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <Building2 className="h-3 w-3 flex-shrink-0" />
                    Styrende part:{" "}
                    {a.governing_party_company_id ? (
                      <Link
                        to="/virksomheder/$id"
                        params={{ id: a.governing_party_company_id }}
                        className="underline truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.governing_party_name}
                      </Link>
                    ) : (
                      <span className="truncate">{a.governing_party_name}</span>
                    )}
                  </div>
                )}
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute bottom-2 right-2 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(a);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {orphanKp2.length > 0 && (
        <div className="mt-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Prismatrix uden aftaledokument
            </h2>
            <span className="text-xs text-muted-foreground">
              {orphanKp2.length} kundeprisgruppe{orphanKp2.length === 1 ? "" : "r"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {orphanKp2.map((g) => (
              <Card
                key={g.code}
                role="button"
                tabIndex={0}
                onClick={() =>
                  navigate({ to: "/aftaler/kp2/$code", params: { code: g.code } })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    navigate({ to: "/aftaler/kp2/$code", params: { code: g.code } });
                }}
                className="relative p-4 pl-5 cursor-pointer hover:shadow-md transition-shadow overflow-hidden border-dashed"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-muted-foreground/30" />
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold truncate">{g.label}</h3>
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                    KP2 {g.code}
                  </Badge>
                </div>
                <div className="text-sm mb-1">
                  <strong>{g.count}</strong> prislinjer
                </div>
                <div className="text-xs text-muted-foreground">
                  Gyldig:{" "}
                  {g.fra
                    ? format(parseISO(g.fra), "d. MMM yyyy", { locale: da })
                    : "—"}{" "}
                  →{" "}
                  {g.til
                    ? format(parseISO(g.til), "d. MMM yyyy", { locale: da })
                    : "∞"}
                </div>
                <div className="text-xs text-muted-foreground mt-2 italic">
                  Intet aftaledokument oprettet endnu.
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {orphanKp1.length > 0 && (
        <div className="mt-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              KP1-gruppe-aftaler (uden KP2)
            </h2>
            <span className="text-xs text-muted-foreground">
              {orphanKp1.length} kundeprisgruppe{orphanKp1.length === 1 ? "" : "r"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {orphanKp1.map((g) => (
              <Card
                key={g.code}
                role="button"
                tabIndex={0}
                onClick={() =>
                  navigate({ to: "/aftaler/kp1/$code", params: { code: g.code } })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    navigate({ to: "/aftaler/kp1/$code", params: { code: g.code } });
                }}
                className="relative p-4 pl-5 cursor-pointer hover:shadow-md transition-shadow overflow-hidden border-dashed"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-muted-foreground/30" />
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold truncate">{g.label}</h3>
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                    KP1 {g.code}
                  </Badge>
                </div>
                <div className="text-sm mb-1">
                  <strong>{g.count}</strong> prislinjer
                </div>
                <div className="text-xs text-muted-foreground">
                  Gyldig:{" "}
                  {g.fra
                    ? format(parseISO(g.fra), "d. MMM yyyy", { locale: da })
                    : "—"}{" "}
                  →{" "}
                  {g.til
                    ? format(parseISO(g.til), "d. MMM yyyy", { locale: da })
                    : "∞"}
                </div>
                <div className="text-xs text-muted-foreground mt-2 italic">
                  Intet aftaledokument oprettet endnu.
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {customerSpecificCount > 0 && filter === "all" && !search.trim() && (
        <div className="mt-8">
          <Card className="p-4 flex items-center gap-3 bg-muted/30">
            <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 text-sm">
              <strong>{customerSpecificCount}</strong> kunder har egne pris-aftaler
              (kundespecifikke prismatrix-linjer).{" "}
              <span className="text-muted-foreground">
                Vises på det enkelte virksomhedskort, ikke som selvstændig aftale.
              </span>
            </div>
            <Link
              to="/virksomheder"
              className="text-sm underline whitespace-nowrap"
            >
              Søg virksomhed →
            </Link>
          </Card>
        </div>
      )}


      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        agreement={editing}
        onSaved={load}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet aftale?</AlertDialogTitle>
            <AlertDialogDescription>
              Aftalen "{deleteTarget?.name}" slettes permanent inkl. evt. dokument.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annullér</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Slet</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditDialog({
  open,
  onOpenChange,
  agreement,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  agreement: Agreement | null;
  onSaved: () => void | Promise<void>;
}) {
  const createFn = useServerFn(createAgreement);
  const updateFn = useServerFn(updateAgreement);

  const [name, setName] = useState("");
  const [kp1, setKp1] = useState("");
  const [kp2, setKp2] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [governingName, setGoverningName] = useState("");
  const [governingId, setGoverningId] = useState<string | null>(null);
  const [companySearch, setCompanySearch] = useState("");
  const [companyHits, setCompanyHits] = useState<
    { id: string; name: string }[]
  >([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (agreement) {
      setName(agreement.name);
      setKp1(agreement.kp1_code ?? "");
      setKp2(agreement.kp2_code ?? "");
      setValidFrom(agreement.valid_from ?? "");
      setValidTo(agreement.valid_to ?? "");
      setIsPublic(agreement.is_public_sector);
      setGoverningName(agreement.governing_party_name ?? "");
      setGoverningId(agreement.governing_party_company_id ?? null);
      setNotes(agreement.notes ?? "");
    } else {
      setName("");
      setKp1("");
      setKp2("");
      setValidFrom("");
      setValidTo("");
      setIsPublic(false);
      setGoverningName("");
      setGoverningId(null);
      setNotes("");
    }
    setCompanySearch("");
    setCompanyHits([]);
  }, [open, agreement]);

  // Søg virksomheder
  useEffect(() => {
    const q = companySearch.trim();
    if (q.length < 2) {
      setCompanyHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .ilike("name", `%${q}%`)
        .limit(8);
      setCompanyHits((data ?? []) as { id: string; name: string }[]);
    }, 250);
    return () => clearTimeout(t);
  }, [companySearch]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Navn er påkrævet");
      return;
    }
    setBusy(true);
    const payload = {
      name: name.trim(),
      kp1_code: kp1.trim() || null,
      kp2_code: kp2.trim() || null,
      valid_from: validFrom || null,
      valid_to: validTo || null,
      is_public_sector: isPublic,
      governing_party_name: governingName.trim() || null,
      governing_party_company_id: governingId,
      notes: notes.trim() || null,
    };
    try {
      if (agreement) {
        await updateFn({ data: { id: agreement.id, ...payload } });
        toast.success("Aftalen er opdateret.");
      } else {
        await createFn({ data: payload });
        toast.success(
          "Aftalen er oprettet. Virksomheder tilknyttes automatisk via KP-koder.",
        );
      }
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke gemme");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{agreement ? "Rediger aftale" : "Ny aftale"}</DialogTitle>
          <DialogDescription>
            Aftaledokument uploades på selve aftalesiden efter oprettelse.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Navn *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>KP1-kode</Label>
              <Input
                value={kp1}
                onChange={(e) => setKp1(e.target.value)}
                placeholder="fx 112"
              />
            </div>
            <div>
              <Label>KP2-kode</Label>
              <Input
                value={kp2}
                onChange={(e) => setKp2(e.target.value)}
                placeholder="fx 67"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Gyldig fra</Label>
              <Input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div>
              <Label>Gyldig til</Label>
              <Input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-start gap-2 pt-1">
            <Checkbox
              id="is-public"
              checked={isPublic}
              onCheckedChange={(c) => setIsPublic(c === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="is-public" className="cursor-pointer">
                Offentlig aftale
              </Label>
              {isPublic && (
                <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-start gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  Kunder på denne aftale kan kun bestille varer inkluderet i
                  aftalen.
                </p>
              )}
            </div>
          </div>
          <div>
            <Label>Styrende part (navn)</Label>
            <Input
              value={governingName}
              onChange={(e) => {
                setGoverningName(e.target.value);
                setGoverningId(null);
              }}
              placeholder="fx Techno Danmark A/S eller SKI"
            />
          </div>
          <div>
            <Label>Tilknyt virksomhed i systemet (valgfri)</Label>
            <Input
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              placeholder="Søg virksomhed…"
            />
            {governingId && (
              <p className="text-xs text-green-600 mt-1">
                ✓ Tilknyttet: {governingName}
              </p>
            )}
            {companyHits.length > 0 && (
              <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                {companyHits.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                    onClick={() => {
                      setGoverningId(c.id);
                      setGoverningName(c.name);
                      setCompanySearch("");
                      setCompanyHits([]);
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label>Noter</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={5000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Gem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
