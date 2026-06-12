import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coffee, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({ meta: [{ title: "Nulstil adgangskode — Frellsen" }] }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase parser tokens fra URL-hash automatisk og udsender PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
        setHasRecovery(true);
        setReady(true);
      }
    });
    // Hvis siden loades uden hash, tjek eksisterende session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasRecovery(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

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
      toast.error("Kunne ikke nulstille adgangskode", { description: error.message });
      return;
    }
    toast.success("Adgangskoden er nulstillet.");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-primary-foreground">
          <div className="h-14 w-14 rounded-xl bg-primary-foreground/10 border border-primary-foreground/20 flex items-center justify-center mb-4">
            <Coffee className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Vælg ny adgangskode</h1>
        </div>
        <div className="bg-card rounded-lg shadow-xl p-6 border border-border">
          {!ready ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !hasRecovery ? (
            <div className="space-y-4">
              <p className="text-sm text-card-foreground">
                Linket er ugyldigt eller udløbet. Bed om et nyt nulstillingslink.
              </p>
              <Button asChild className="w-full">
                <Link to="/glemt-password">Send nyt link</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Vælg en ny adgangskode på mindst 8 tegn.
              </p>
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
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Gem ny adgangskode
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
