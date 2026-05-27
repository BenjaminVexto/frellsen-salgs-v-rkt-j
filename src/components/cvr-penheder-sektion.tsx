import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Search, CheckCircle2, MapPin, Loader2, Plus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { cvrLookupPenheder, type CvrPenhed } from "@/lib/cvr-penheder.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Location } from "@/components/lokationer-sektion";

function normalizeAddress(addr: string | null | undefined) {
  return (addr ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function CvrPenhederSektion({
  companyId,
  cvr,
  existingLocations,
  onAdded,
}: {
  companyId: string;
  cvr: string | null;
  existingLocations: Location[];
  onAdded: () => void;
}) {
  const [units, setUnits] = useState<CvrPenhed[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const lookup = useServerFn(cvrLookupPenheder);

  async function search() {
    if (!cvr) {
      toast.error("Virksomheden mangler CVR-nummer");
      return;
    }
    setLoading(true);
    try {
      const res = await lookup({ data: { cvr } });
      setUnits(res.units);
    } catch (e) {
      toast.error("CVR-opslag fejlede: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  const existingAddrs = new Set(
    existingLocations.map((l) => normalizeAddress(`${l.address ?? ""} ${l.zip ?? ""}`)),
  );

  async function addLocation(u: CvrPenhed) {
    setAdding(u.p_number);
    const { error } = await (supabase as any).from("locations").insert({
      company_id: companyId,
      address: u.address,
      zip: u.zip,
      city: u.city,
      is_primary: false,
    });
    setAdding(null);
    if (error) {
      toast.error("Kunne ikke tilføje: " + error.message);
      return;
    }
    toast.success("Lokation tilføjet");
    onAdded();
  }

  const matched = units?.filter((u) =>
    existingAddrs.has(normalizeAddress(`${u.address ?? ""} ${u.zip ?? ""}`)),
  );
  const newUnits = units?.filter(
    (u) => !existingAddrs.has(normalizeAddress(`${u.address ?? ""} ${u.zip ?? ""}`)),
  );

  return (
    <div className="rounded-md border p-4">
      <h3 className="font-medium text-sm mb-1">CVR P-enheder — potentiale</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Find produktionsenheder registreret på CVR-nummeret.
      </p>
      {!units && (
        <Button size="sm" variant="outline" onClick={search} disabled={loading || !cvr}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5 mr-1.5" />
          )}
          Søg CVR for flere lokationer
        </Button>
      )}
      {units && (
        <>
          <div className="mb-3 text-xs grid grid-cols-3 gap-2">
            <div className="rounded bg-muted/50 p-2">
              <div className="text-muted-foreground">Fundet</div>
              <div className="text-base font-semibold">{units.length}</div>
            </div>
            <div className="rounded bg-muted/50 p-2">
              <div className="text-muted-foreground">Vi leverer til</div>
              <div className="text-base font-semibold">{matched?.length ?? 0}</div>
            </div>
            <div className="rounded bg-muted/50 p-2">
              <div className="text-muted-foreground">Potentielle nye</div>
              <div className="text-base font-semibold text-primary">{newUnits?.length ?? 0}</div>
            </div>
          </div>
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {units.map((u) => {
              const isExisting = existingAddrs.has(
                normalizeAddress(`${u.address ?? ""} ${u.zip ?? ""}`),
              );
              return (
                <div
                  key={u.p_number}
                  className="flex items-center justify-between gap-2 text-sm border-b last:border-0 py-1.5"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {isExisting ? (
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    ) : (
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate">{u.address ?? "(uden adresse)"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[u.zip, u.city].filter(Boolean).join(" ")}
                        {isExisting && " · allerede i systemet"}
                      </div>
                    </div>
                  </div>
                  {!isExisting && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addLocation(u)}
                      disabled={adding === u.p_number}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Tilføj
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <Button size="sm" variant="ghost" className="mt-2" onClick={search} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5 mr-1.5" />
            )}
            Søg igen
          </Button>
        </>
      )}
    </div>
  );
}
