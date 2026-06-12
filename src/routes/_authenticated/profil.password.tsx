import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profil/password")({
  component: ChangePasswordPage,
  head: () => ({ meta: [{ title: "Skift adgangskode — Frellsen" }] }),
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw1.length < 8) {
      toast.error("Adgangskoden skal være mindst 8 tegn.");
      return;
    }
    if (pw1 !== pw2) {
      toast.error("De to adgangskoder er ikke ens.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSubmitting(false);
    if (error) {
      toast.error("Kunne ikke skifte adgangskode", { description: error.message });
      return;
    }
    toast.success("Adgangskoden er ændret.");
    setPw1("");
    setPw2("");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="max-w-xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <KeyRound className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Skift adgangskode</h1>
      </div>
      <div className="bg-card border border-border rounded-lg p-6">
        <p className="text-sm text-muted-foreground mb-4">
          Vælg en ny adgangskode på mindst 8 tegn. Du forbliver logget ind på denne enhed.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pw1">Ny adgangskode</Label>
            <Input
              id="pw1"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw2">Bekræft ny adgangskode</Label>
            <Input
              id="pw2"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Skift adgangskode
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link to="/dashboard">Annullér</Link>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
