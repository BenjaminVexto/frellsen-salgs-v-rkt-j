import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OauthAuthorizationDetails = {
  client?: { name?: string | null; client_uri?: string | null } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
} | null;

type SupabaseOauth = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: OauthAuthorizationDetails; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};

function oauth(): SupabaseOauth {
  return (supabase.auth as unknown as { oauth: SupabaseOauth }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/login", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-sm">
        Kunne ikke indlæse forespørgslen: {String((error as Error)?.message ?? error)}
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "en ekstern app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Autorisationsserveren returnerede ingen redirect.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-6 space-y-4">
        <h1 className="text-xl font-semibold text-card-foreground">
          Giv {clientName} adgang til din konto
        </h1>
        <p className="text-sm text-muted-foreground">
          {clientName} vil kunne bruge Frellsen Salgsoversigt som dig via
          agent-integrationen (MCP). Du kan altid tilbagekalde adgangen igen.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-50"
          >
            Afvis
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50"
          >
            Godkend
          </button>
        </div>
      </div>
    </main>
  );
}
