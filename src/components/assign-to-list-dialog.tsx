import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useViewAs } from "@/contexts/view-as-context";

type Seller = { id: string; full_name: string; region: string | null };
type ListOpt = { id: string; name: string };
type CompanyRegion = { id: string; municipality: string | null };

export function AssignToListDialog({
  open,
  onOpenChange,
  companies,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companies: CompanyRegion[];
  onAssigned: () => void;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [existingId, setExistingId] = useState<string>("");
  const [lists, setLists] = useState<ListOpt[]>([]);

  const [sellerMode, setSellerMode] = useState<"specific" | "geo">("specific");
  const [sellerId, setSellerId] = useState<string>("");
  const [sellers, setSellers] = useState<Seller[]>([]);

  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);
  const { isImpersonating, viewAsName } = useViewAs();

  useEffect(() => {
    if (open && isImpersonating) {
      toast.error(`Read-only — du ser som ${viewAsName ?? "en anden sælger"}. Tildelinger ikke tilladt.`);
      onOpenChange(false);
    }
  }, [open, isImpersonating, viewAsName, onOpenChange]);


  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "saelger");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, region")
          .in("id", ids)
          .eq("is_active", true);
        setSellers(profs ?? []);
      }
      const { data: ls } = await supabase
        .from("contact_lists")
        .select("id, name")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      setLists(ls ?? []);
    })();
  }, [open]);

  const reset = () => {
    setMode("new");
    setName("");
    setDescription("");
    setExistingId("");
    setSellerMode("specific");
    setSellerId("");
    setPurpose("");
  };

  const save = async () => {
    if (isImpersonating) {
      toast.error("Read-only — handling ikke tilladt");
      return;
    }
    if (mode === "new" && !name.trim()) {
      toast.error("Listenavn er påkrævet");
      return;
    }
    if (mode === "existing" && !existingId) {
      toast.error("Vælg en eksisterende liste");
      return;
    }
    if (sellerMode === "specific" && !sellerId) {
      toast.error("Vælg en sælger");
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();

    let listId = existingId;
    let listName = lists.find((l) => l.id === existingId)?.name ?? "";

    if (mode === "new") {
      const { data: list, error } = await supabase
        .from("contact_lists")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          purpose: purpose.trim() || null,
          created_by: userRes.user?.id,
        } as any)
        .select("id, name")
        .single();
      if (error || !list) {
        toast.error(error?.message ?? "Fejl ved oprettelse af liste");
        setSaving(false);
        return;
      }
      listId = list.id;
      listName = list.name;
    } else if (purpose.trim()) {
      // Update purpose on existing list
      await supabase
        .from("contact_lists")
        .update({ purpose: purpose.trim() } as any)
        .eq("id", listId);
    }

    // Build seller assignment per company
    const regionMap = new Map<string, string>(); // region -> sellerId
    sellers.forEach((s) => {
      if (s.region) regionMap.set(s.region.toLowerCase(), s.id);
    });

    const rows = companies.map((c) => {
      let assigned: string | null = null;
      if (sellerMode === "specific") {
        assigned = sellerId;
      } else {
        const mun = (c.municipality ?? "").toLowerCase();
        assigned = regionMap.get(mun) ?? null;
      }
      return {
        contact_list_id: listId,
        company_id: c.id,
        assigned_to: assigned,
        status: "ny" as const,
      };
    });

    // Insert in chunks to avoid payload limits
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("contact_list_assignments")
        .insert(chunk);
      if (error) {
        toast.error("Fejl ved tildeling: " + error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    toast.success(
      `${rows.length} virksomheder tilføjet til listen "${listName}"`,
      {
        action: {
          label: "Gå til listen",
          onClick: () =>
            navigate({ to: "/kontaktlister/$id", params: { id: listId } }),
        },
        duration: 10000,
      },
    );
    reset();
    onOpenChange(false);
    onAssigned();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Tildel {companies.length} virksomheder til kontaktliste
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Liste */}
          <div className="space-y-2">
            <Label>Kontaktliste</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as "new" | "existing")}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="new" /> Opret ny liste
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="existing" /> Vælg eksisterende
              </label>
            </RadioGroup>
            {mode === "new" ? (
              <div className="space-y-2 pl-1">
                <Input
                  placeholder="Listenavn *"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Textarea
                  placeholder="Beskrivelse (valgfri)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
            ) : (
              <Select value={existingId} onValueChange={setExistingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vælg liste…" />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Sælger */}
          <div className="space-y-2">
            <Label>Ansvarlig sælger</Label>
            <RadioGroup
              value={sellerMode}
              onValueChange={(v) => setSellerMode(v as "specific" | "geo")}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="specific" /> Specifik sælger
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="geo" /> Fordel geografisk
              </label>
            </RadioGroup>
            {sellerMode === "specific" ? (
              <Select value={sellerId} onValueChange={setSellerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vælg sælger…" />
                </SelectTrigger>
                <SelectContent>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name || "Uden navn"}
                      {s.region ? ` · ${s.region}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground pl-1">
                Hver virksomhed tildeles den sælger hvis region matcher
                virksomhedens kommune. Virksomheder uden match forbliver
                utildelt.
              </p>
            )}
          </div>

          {/* Purpose */}
          <div className="space-y-2">
            <Label>Formål / instruktion til sælger</Label>
            <Textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              placeholder="Fx: Tidligere kunder uden maskine — fokus på at afdække om de vil have en kaffemaskinløsning igen"
            />
            <p className="text-xs text-muted-foreground">
              Vises øverst på kontaktlisten som en note fra admin.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "new" ? "Opret liste og tildel " : "Tildel "}
            {companies.length} virksomheder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
