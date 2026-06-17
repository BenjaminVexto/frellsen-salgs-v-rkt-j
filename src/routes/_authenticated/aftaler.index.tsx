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
  FileX2,
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

  type Row = {
    kind: "agreement" | "kp2" | "kp1";
    key: string;
    name: string;
    kp_label: string | null;
    count: number;
    count_label: string;
    fra: string | null;
    til: string | null;
    has_doc: boolean;
    aftale_type: AgreementType;
    aftale_type_manuel: boolean;
    agreement: Agreement | null;
    onOpen: () => void;
  };

  const allRows: Row[] = useMemo(() => {
    const fromAgreements: Row[] = rows.map((a) => ({
      kind: "agreement",
      key: `a:${a.id}`,
      name: a.name,
      kp_label: a.kp2_code
        ? `KP2 ${a.kp2_code}`
        : a.kp1_code
          ? `KP1 ${a.kp1_code}`
          : null,
      count: a.company_count,
      count_label: "virks.",
      fra: a.valid_from,
      til: a.valid_to,
      has_doc: !!a.document_path,
      aftale_type: a.aftale_type,
      aftale_type_manuel: a.aftale_type_manuel,
      agreement: a,
      onOpen: () => navigate({ to: "/aftaler/$id", params: { id: a.id } }),
    }));
    const agreementKp2s = new Set(
      rows.map((r) => r.kp2_code?.trim()).filter(Boolean) as string[],
    );
    const agreementKp1s = new Set(
      rows.map((r) => r.kp1_code?.trim()).filter(Boolean) as string[],
    );
    const fromKp2: Row[] = kp2Groups
      .filter((g) => !agreementKp2s.has(g.code))
      .map((g) => ({
        kind: "kp2",
        key: `kp2:${g.code}`,
        name: g.label,
        kp_label: `KP2 ${g.code}`,
        count: g.count,
        count_label: "linjer",
        fra: g.fra,
        til: g.til,
        has_doc: false,
        aftale_type: deriveAgreementTypeFromName(g.label),
        aftale_type_manuel: false,
        agreement: null,
        onOpen: () =>
          navigate({ to: "/aftaler/kp2/$code", params: { code: g.code } }),
      }));
    const fromKp1: Row[] = kp1Groups
      .filter((g) => !agreementKp1s.has(g.code))
      .map((g) => ({
        kind: "kp1",
        key: `kp1:${g.code}`,
        name: g.label,
        kp_label: `KP1 ${g.code}`,
        count: g.count,
        count_label: "linjer",
        fra: g.fra,
        til: g.til,
        has_doc: false,
        aftale_type: deriveAgreementTypeFromName(g.label),
        aftale_type_manuel: false,
        agreement: null,
        onOpen: () =>
          navigate({ to: "/aftaler/kp1/$code", params: { code: g.code } }),
      }));
    return [...fromAgreements, ...fromKp2, ...fromKp1].sort((a, b) =>
      a.name.localeCompare(b.name, "da", { sensitivity: "base" }),
    );
  }, [rows, kp2Groups, kp1Groups, navigate]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (typeFilter !== "all" && r.aftale_type !== typeFilter) return false;
      if (onlyMissingDoc && r.has_doc) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.kp_label ?? "").toLowerCase().includes(q)
      );
    });
  }, [allRows, search, typeFilter, onlyMissingDoc]);

  const totalCount = allRows.length;
  const missingDocCount = allRows.filter((r) => !r.has_doc).length;

  const typeCounts = useMemo(() => {
    const base: Record<TypeFilter, number> = {
      all: allRows.length,
      offentlig: 0,
      erhverv: 0,
      ski: 0,
    };
    for (const r of allRows) {
      if (r.aftale_type === "offentlig" || r.aftale_type === "erhverv" || r.aftale_type === "ski") {
        base[r.aftale_type] += 1;
      }
    }
    return base;
  }, [allRows]);

  const groupedByType = useMemo(() => {
    const order: AgreementType[] = ["offentlig", "erhverv", "ski", "ukendt"];
    const groups: { type: AgreementType; rows: Row[] }[] = [];
    for (const t of order) {
      const items = filteredRows.filter((r) => r.aftale_type === t);
      if (items.length) groups.push({ type: t, rows: items });
    }
    return groups;
  }, [filteredRows]);

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
            {totalCount} prisaftaler · {missingDocCount} mangler dokument
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

      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søg på aftalenavn eller kode"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <Checkbox
            checked={onlyMissingDoc}
            onCheckedChange={(v) => setOnlyMissingDoc(v === true)}
          />
          <FileWarning className="h-4 w-4 text-yellow-600" />
          Mangler dokument
        </label>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TYPE_TABS.map((t) => (
          <Button
            key={t.value}
            variant={typeFilter === t.value ? "default" : "outline"}
            size="sm"
            onClick={() => setTypeFilter(t.value)}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-70">
              {typeCounts[t.value] ?? 0}
            </span>
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : totalCount === 0 ? (
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
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Ingen aftaler matcher filtreringen.
        </p>
      ) : (
        <div className="space-y-6">
          {groupedByType.map((group) => (
            <div key={group.type}>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {TYPE_LABEL[group.type]}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {group.rows.length}
                </span>
              </div>
              <Card className="overflow-hidden p-0">
                <ul className="divide-y divide-border/60">
                  {group.rows.map((r) => {
                    const status = getStatus(r.til);
                    return (
                      <li
                        key={r.key}
                        role="button"
                        tabIndex={0}
                        onClick={r.onOpen}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") r.onOpen();
                        }}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm"
                      >
                        {r.has_doc ? (
                          <FileCheck2
                            className="h-4 w-4 text-green-700 shrink-0"
                            aria-label="Aftaledokument uploadet"
                          />
                        ) : (
                          <FileX2
                            className="h-4 w-4 text-yellow-600 shrink-0"
                            aria-label="Mangler aftaledokument"
                          />
                        )}
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${status.color}`}
                          title={status.label}
                          aria-label={status.label}
                        />
                        <span className="flex-1 truncate font-medium">
                          {r.name}
                          {r.aftale_type_manuel && (
                            <span
                              className="ml-1 text-[10px] opacity-50"
                              title="Type sat manuelt"
                            >
                              ·m
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
                          <strong className="text-foreground">{r.count}</strong>{" "}
                          {r.count_label}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:inline">
                          {r.fra
                            ? format(parseISO(r.fra), "d/M yy", { locale: da })
                            : "—"}{" "}
                          →{" "}
                          {r.til
                            ? format(parseISO(r.til), "d/M yy", { locale: da })
                            : "∞"}
                        </span>
                        {r.kp_label && (
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] text-muted-foreground shrink-0"
                          >
                            {r.kp_label}
                          </Badge>
                        )}
                        {isAdmin && r.agreement && (
                          <div
                            className="flex items-center gap-1 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Select
                              value={r.aftale_type}
                              onValueChange={async (v) => {
                                try {
                                  await setTypeFn({
                                    data: {
                                      id: r.agreement!.id,
                                      aftale_type: v as AgreementType,
                                    },
                                  });
                                  toast.success("Type opdateret");
                                  await load();
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error
                                      ? e.message
                                      : "Kunne ikke opdatere",
                                  );
                                }
                              }}
                            >
                              <SelectTrigger className="h-7 w-[110px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(TYPE_LABEL) as AgreementType[]).map(
                                  (t) => (
                                    <SelectItem
                                      key={t}
                                      value={t}
                                      className="text-xs"
                                    >
                                      {TYPE_LABEL[t]}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(r.agreement);
                                setEditOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(r.agreement);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          ))}
        </div>
      )}

      {customerSpecificCount > 0 && typeFilter === "all" && !search.trim() && !onlyMissingDoc && (
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
                  <FileWarning className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
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
