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
import { MapPin, Plus, ChevronDown } from "lucide-react";
import { toast } from "sonner";

export type Location = {
  id: string;
  company_id: string;
  visma_delivery_no: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  is_primary: boolean;
  created_at: string;
};

export type LocationContact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export function LokationerSektion({
  companyId,
  isAdmin,
  onRegisterActivity,
  reloadKey,
  contactsByLocation,
}: {
  companyId: string;
  isAdmin: boolean;
  onRegisterActivity: (locationId: string) => void;
  reloadKey?: number;
  contactsByLocation?: Map<string, LocationContact[]>;
}) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    const { data } = await (supabase as any)
      .from("locations")
      .select("*")
      .eq("company_id", companyId)
      .order("is_primary", { ascending: false })
      .order("city", { ascending: true });
    setLocations(((data ?? []) as Location[]));
  };

  useEffect(() => {
    load();
  }, [companyId, reloadKey]);

  if (locations.length === 0) {
    if (!isAdmin) return null;
    // Admin: vis kun "Tilføj lokation"-knap, ikke hele sektionen
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Tilføj lokation
        </Button>
        <AddLocationDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          companyId={companyId}
          hasPrimary={false}
          onSaved={() => {
            setAddOpen(false);
            load();
          }}
        />
      </>
    );
  }

  const primary = locations.find((l) => l.is_primary);
  const others = locations.filter((l) => !l.is_primary);
  const visibleOthers = expanded ? others : others.slice(0, 3);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Lokationer
          <span className="text-xs text-muted-foreground font-normal">
            ({locations.length})
          </span>
        </h2>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Tilføj lokation
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {primary && (
          <LokationRow
            location={primary}
            isPrimary
            contacts={contactsByLocation?.get(primary.id) ?? []}
            onRegister={() => onRegisterActivity(primary.id)}
          />
        )}
        {visibleOthers.map((l) => (
          <LokationRow
            key={l.id}
            location={l}
            contacts={contactsByLocation?.get(l.id) ?? []}
            onRegister={() => onRegisterActivity(l.id)}
          />
        ))}
        {others.length > 3 && !expanded && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setExpanded(true)}
          >
            <ChevronDown className="h-4 w-4 mr-1" />
            Vis alle {locations.length} lokationer
          </Button>
        )}
      </div>


      {isAdmin && (
        <AddLocationDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          companyId={companyId}
          hasPrimary={!!primary}
          onSaved={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}
    </Card>
  );
}

function LokationRow({
  location,
  isPrimary,
  onRegister,
  contacts = [],
}: {
  location: Location;
  isPrimary?: boolean;
  onRegister: () => void;
  contacts?: LocationContact[];
}) {
  const cityLine = [location.zip, location.city].filter(Boolean).join(" ");
  return (
    <div id={`location-${location.id}`} className="border rounded-md p-3 scroll-mt-20">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 font-medium">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          {location.city || location.address || "Lokation"}
          {isPrimary && (
            <Badge variant="secondary" className="text-xs">
              Primær
            </Badge>
          )}
        </div>
      </div>
      <div className="text-sm text-muted-foreground space-y-0.5 pl-6">
        {location.address && (
          <div>
            {location.address}
            {cityLine ? `, ${cityLine}` : ""}
          </div>
        )}
        {!location.address && cityLine && <div>{cityLine}</div>}
        {contacts.length > 0 ? (
          contacts.map((c) => (
            <div key={c.id} className="text-foreground">
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                <span className="font-medium">{c.name}</span>
                {c.phone && <span className="text-muted-foreground">· {c.phone}</span>}
              </span>
              {c.email && (
                <div className="pl-4 text-muted-foreground">{c.email}</div>
              )}
            </div>
          ))
        ) : (
          (location.contact_person || location.phone) && (
            <div>
              {[location.contact_person, location.phone].filter(Boolean).join(" · ")}
            </div>
          )
        )}
        {contacts.length === 0 && location.email && <div>{location.email}</div>}
        {location.visma_delivery_no && (
          <div className="text-xs">Lev.nr. {location.visma_delivery_no}</div>
        )}
      </div>
      <div className="pl-6 mt-2">
        <Button size="sm" variant="outline" onClick={onRegister}>
          Registrér aktivitet her
        </Button>
      </div>
    </div>
  );
}

function AddLocationDialog({
  open,
  onOpenChange,
  companyId,
  hasPrimary,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  hasPrimary: boolean;
  onSaved: () => void;
}) {
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [deliveryNo, setDeliveryNo] = useState("");
  const [isPrimary, setIsPrimary] = useState(!hasPrimary);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAddress("");
      setZip("");
      setCity("");
      setPhone("");
      setEmail("");
      setContact("");
      setDeliveryNo("");
      setIsPrimary(!hasPrimary);
    }
  }, [open, hasPrimary]);

  async function save() {
    setSaving(true);
    // If marked primary, demote others first
    if (isPrimary && hasPrimary) {
      await (supabase as any)
        .from("locations")
        .update({ is_primary: false })
        .eq("company_id", companyId);
    }
    const { error } = await (supabase as any).from("locations").insert({
      company_id: companyId,
      address: address.trim() || null,
      zip: zip.trim() || null,
      city: city.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      contact_person: contact.trim() || null,
      visma_delivery_no: deliveryNo.trim() || null,
      is_primary: isPrimary,
    });
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke gemme: " + error.message);
      return;
    }
    toast.success("Lokation tilføjet");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tilføj lokation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Adresse</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="mb-1.5 block">Postnr.</Label>
              <Input value={zip} onChange={(e) => setZip(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block">By</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Kontaktperson</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} />
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
            <Label className="mb-1.5 block">Visma lev.nr.</Label>
            <Input
              value={deliveryNo}
              onChange={(e) => setDeliveryNo(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            Markér som primær lokation
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Gemmer…" : "Gem lokation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
