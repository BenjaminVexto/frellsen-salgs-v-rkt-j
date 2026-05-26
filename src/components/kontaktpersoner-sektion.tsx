import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { User, Plus, MapPin, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import type { Location } from "@/components/lokationer-sektion";

export type ContactRow = {
  id: string;
  company_id: string;
  location_id: string | null;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
};

export function KontaktpersonerSektion({
  companyId,
  contacts,
  locations,
  onReload,
}: {
  companyId: string;
  contacts: ContactRow[];
  locations: Location[];
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const locMap = new Map(locations.map((l) => [l.id, l]));
  const sorted = [...contacts].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.name.localeCompare(b.name, "da");
  });
  const visible = expanded ? sorted : sorted.slice(0, 3);

  const handleLocationClick = (locationId: string) => {
    const el = document.getElementById(`location-${locationId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-2", "ring-primary");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1500);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <User className="h-4 w-4" /> Kontaktpersoner
          {contacts.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              ({contacts.length})
            </span>
          )}
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Tilføj
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen kontakter registreret.</p>
      ) : (
        <>
          <ul className="divide-y">
            {visible.map((c) => {
              const loc = c.location_id ? locMap.get(c.location_id) : null;
              const locName = loc ? loc.city || loc.address || "Lokation" : null;
              const isOpen = openId === c.id;
              const summary = [c.name, c.phone].filter(Boolean).join(" · ");
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : c.id)}
                    className="w-full flex items-center justify-between gap-2 py-2.5 text-left hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="truncate text-sm">{summary}</span>
                      {c.is_primary && (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          Primær
                        </Badge>
                      )}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="pl-6 pb-3 pt-1 space-y-1 text-sm">
                      {c.title && (
                        <div className="text-muted-foreground">{c.title}</div>
                      )}
                      {locName && c.location_id && (
                        <button
                          type="button"
                          onClick={() => handleLocationClick(c.location_id!)}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          {locName}
                        </button>
                      )}
                      {c.email && (
                        <div>
                          <a
                            href={`mailto:${c.email}`}
                            className="hover:underline"
                          >
                            {c.email}
                          </a>
                        </div>
                      )}
                      <div className="pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditing(c);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Rediger
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {sorted.length > 3 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-muted-foreground"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" /> Vis færre
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Vis alle {sorted.length} kontakter
                </>
              )}
            </Button>
          )}
        </>
      )}


      <ContactDialog
        open={open}
        onOpenChange={setOpen}
        companyId={companyId}
        locations={locations}
        existing={editing}
        contacts={contacts}
        onSaved={() => {
          setOpen(false);
          setEditing(null);
          onReload();
        }}
      />
    </Card>
  );
}

function ContactDialog({
  open,
  onOpenChange,
  companyId,
  locations,
  existing,
  contacts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  locations: Location[];
  existing: ContactRow | null;
  contacts: ContactRow[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [locationId, setLocationId] = useState<string>("none");
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setTitle(existing?.title ?? "");
      setPhone(existing?.phone ?? "");
      setEmail(existing?.email ?? "");
      setLocationId(existing?.location_id ?? "none");
      setIsPrimary(existing?.is_primary ?? false);
    }
  }, [open, existing]);

  async function save() {
    if (!name.trim()) {
      toast.error("Navn er påkrævet");
      return;
    }
    setSaving(true);
    try {
      // Hvis primær: nedgrader øvrige først
      if (isPrimary) {
        await supabase
          .from("contacts")
          .update({ is_primary: false })
          .eq("company_id", companyId)
          .neq("id", existing?.id ?? "00000000-0000-0000-0000-000000000000");
      }

      const payload = {
        company_id: companyId,
        name: name.trim(),
        title: title.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        location_id: locationId === "none" ? null : locationId,
        is_primary: isPrimary,
      };

      if (existing) {
        const { error } = await supabase
          .from("contacts")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contacts").insert(payload);
        if (error) throw error;
      }
      toast.success(existing ? "Kontakt opdateret" : "Kontakt tilføjet");
      onSaved();
    } catch (e: any) {
      toast.error("Kunne ikke gemme: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) return;
    if (!confirm("Slet kontaktperson?")) return;
    setDeleting(true);
    const { error } = await supabase.from("contacts").delete().eq("id", existing.id);
    setDeleting(false);
    if (error) {
      toast.error("Sletning fejlede: " + error.message);
      return;
    }
    toast.success("Kontakt slettet");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Rediger kontaktperson" : "Tilføj kontaktperson"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Navn *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Stilling / titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1.5 block">Telefon</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Tilknyt lokation</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Vælg…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen lokation</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.city || l.address || "Lokation"}
                    {l.visma_delivery_no ? ` (lev.nr. ${l.visma_delivery_no})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            Primær kontakt for virksomheden
          </label>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {existing && (
            <Button
              variant="destructive"
              onClick={remove}
              disabled={deleting || saving}
              className="mr-auto"
            >
              {deleting ? "Sletter…" : "Slet"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Gemmer…" : "Gem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
