import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coffee, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "",
  }),
  head: () => ({ meta: [{ title: "Log ind — Frellsen Salgsoversigt" }] }),
});

function safeNext(next: string): string | null {
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function LoginPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      const target = safeNext(next);
      if (target) window.location.replace(target);
      else navigate({ to: "/dashboard" });
    });
  }, [navigate, next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error("Login mislykkedes", { description: "Tjek email og adgangskode." });
      return;
    }
    const target = safeNext(next);
    if (target) window.location.replace(target);
    else navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-primary-foreground">
          <div className="h-14 w-14 rounded-xl bg-primary-foreground/10 border border-primary-foreground/20 flex items-center justify-center mb-4">
            <Coffee className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Frellsen Salgsoversigt</h1>
          <p className="text-sm text-primary-foreground/70 mt-1">Dagligt salgsværktøj</p>
        </div>

        <div className="bg-card rounded-lg shadow-xl p-6 border border-border">
          <h2 className="text-lg font-semibold mb-1 text-card-foreground">Log ind</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Brug din arbejdsmail og adgangskode.
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
            <div className="space-y-2">
              <Label htmlFor="password">Adgangskode</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Log ind
            </Button>
          </form>
          <p className="text-xs text-center mt-4">
            <Link to="/glemt-password" className="text-muted-foreground hover:text-foreground underline">
              Glemt adgangskode?
            </Link>
          </p>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Har du brug for en konto? Kontakt din administrator.
          </p>
        </div>
        <p className="text-center text-xs text-primary-foreground/60 mt-6">
          <Link to="/">Tilbage til forsiden</Link>
        </p>
      </div>
    </div>
  );
}
