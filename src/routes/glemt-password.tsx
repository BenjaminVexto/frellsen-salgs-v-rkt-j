import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coffee, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/glemt-password")({
  component: ForgotPasswordPage,
  head: () => ({ meta: [{ title: "Glemt adgangskode — Frellsen" }] }),
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      // Vis generisk besked uanset — undgå at lække om mail findes
      console.error(error);
    }
    setSent(true);
    toast.success("Hvis kontoen findes, har vi sendt en mail.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-primary-foreground">
          <div className="h-14 w-14 rounded-xl bg-primary-foreground/10 border border-primary-foreground/20 flex items-center justify-center mb-4">
            <Coffee className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Glemt adgangskode</h1>
        </div>
        <div className="bg-card rounded-lg shadow-xl p-6 border border-border">
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-card-foreground">
                Hvis der findes en konto med den mail, har vi sendt et link til at nulstille adgangskoden.
                Tjek din indbakke (og evt. spam).
              </p>
              <Button asChild className="w-full">
                <Link to="/login">Tilbage til login</Link>
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-6">
                Skriv din arbejdsmail. Du får et link til at vælge en ny adgangskode.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="navn@frellsen.dk"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Send nulstillingsmail
                </Button>
              </form>
              <p className="text-xs text-muted-foreground mt-6 text-center">
                <Link to="/login" className="underline">Tilbage til login</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
