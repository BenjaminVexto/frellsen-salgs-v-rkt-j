import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/postnumre")({
  component: AdminPostnumrePage,
  head: () => ({
    meta: [
      { title: "Postnumre og regioner — Frellsen" },
      {
        name: "description",
        content:
          "Vedligehold intervallerne der oversætter postnumre til regioner i analysen.",
      },
      { property: "og:title", content: "Postnumre og regioner — Frellsen" },
      {
        property: "og:description",
        content: "Vedligehold postnummer-intervaller og regioner.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = {
  postnr_fra: number;
  postnr_til: number;
  region: string;
};

function AdminPostnumrePage() {
  const auth = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [gemmer, setGemmer] = useState<number | null>(null);
  const [nyFra, setNyFra] = useState("");
  const [nyTil, setNyTil] = useState("");
  const [nyRegion, setNyRegion] = useState("");

  const hent = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("postnummer_region")
      .select("postnr_fra, postnr_til, region")
      .order("postnr_fra");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    if (auth.role === "admin") void hent();
  }, [auth.role]);

  if (auth.loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Indlæser…
      </div>
    );
  }
  if (auth.role !== "admin") return <Navigate to="/dashboard" />;

  const gem = async (r: Row) => {
    if (!(r.postnr_til >= r.postnr_fra) || !r.region.trim()) {
      toast.error("Til-postnummer skal være større end fra, og region må ikke være tom.");
      return;
    }
    setGemmer(r.postnr_fra);
    const { error } = await supabase
      .from("postnummer_region")
      .update({ postnr_til: r.postnr_til, region: r.region.trim() })
      .eq("postnr_fra", r.postnr_fra);
    setGemmer(null);
    if (error) toast.error(error.message);
    else toast.success("Gemt");
  };

  const slet = async (postnr_fra: number) => {
    const { error } = await supabase
      .from("postnummer_region")
      .delete()
      .eq("postnr_fra", postnr_fra);
    if (error) toast.error(error.message);
    else {
      toast.success("Rækken er slettet");
      void hent();
    }
  };

  const tilfoej = async () => {
    const fra = Number(nyFra);
    const til = Number(nyTil);
    if (!Number.isFinite(fra) || !Number.isFinite(til) || til < fra || !nyRegion.trim()) {
      toast.error("Udfyld gyldigt interval og en region.");
      return;
    }
    const { error } = await supabase
      .from("postnummer_region")
      .insert({ postnr_fra: fra, postnr_til: til, region: nyRegion.trim() });
    if (error) toast.error(error.message);
    else {
      setNyFra("");
      setNyTil("");
      setNyRegion("");
      toast.success("Interval tilføjet");
      void hent();
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Postnumre og regioner</h1>
        <p className="text-sm text-muted-foreground">
          Intervallerne bruges til opdeling på region i analysen. Postnumre uden for
          intervallerne vises som “Ukendt”.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-medium">Tilføj interval</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Fra postnummer</Label>
            <Input
              value={nyFra}
              onChange={(e) => setNyFra(e.target.value)}
              className="h-9 w-[140px]"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Til postnummer</Label>
            <Input
              value={nyTil}
              onChange={(e) => setNyTil(e.target.value)}
              className="h-9 w-[140px]"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Region</Label>
            <Input
              value={nyRegion}
              onChange={(e) => setNyRegion(e.target.value)}
              className="h-9 w-[200px]"
            />
          </div>
          <Button size="sm" onClick={tilfoej}>
            <Plus className="h-4 w-4 mr-1" /> Tilføj
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Indlæser…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Fra</th>
                  <th className="px-3 py-2 text-left">Til</th>
                  <th className="px-3 py-2 text-left">Region</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.postnr_fra} className="border-t border-border">
                    <td className="px-3 py-2 tabular-nums">{r.postnr_fra}</td>
                    <td className="px-3 py-2">
                      <Input
                        value={String(r.postnr_til)}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, postnr_til: Number(e.target.value) || 0 } : x,
                            ),
                          )
                        }
                        className="h-8 w-[110px]"
                        inputMode="numeric"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={r.region}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, region: e.target.value } : x)),
                          )
                        }
                        className="h-8 w-[200px]"
                      />
                    </td>
                    <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => gem(r)}
                        disabled={gemmer === r.postnr_fra}
                      >
                        {gemmer === r.postnr_fra ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => slet(r.postnr_fra)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">
                      Ingen intervaller endnu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
