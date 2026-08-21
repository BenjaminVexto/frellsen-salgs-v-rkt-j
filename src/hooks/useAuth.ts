import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "saelger" | "salgssupport";

export interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  fullName: string;
  region: string | null;
  /** Afdelinger brugeren har adgang til (my_afdelinger() — admin får alle). */
  afdelinger: number[];
  /** profiles.primary_afdeling_nr — default-valg i afdelingsvælgeren. */
  primaryAfdeling: number | null;
}

const EMPTY: AuthState = {
  loading: true,
  session: null,
  user: null,
  role: null,
  fullName: "",
  region: null,
  afdelinger: [],
  primaryAfdeling: null,
};

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(EMPTY);

  useEffect(() => {
    let active = true;

    const loadExtras = async (session: Session | null) => {
      if (!session) {
        if (active) setState({ ...EMPTY, loading: false });
        return;
      }
      const [{ data: roleRows }, { data: profile }, { data: afdRows }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .returns<{ role: AppRole }[]>(),
        supabase
          .from("profiles")
          .select("full_name, region, primary_afdeling_nr")
          .eq("id", session.user.id)
          .maybeSingle(),
        supabase.rpc("my_afdelinger"),
      ]);
      if (!active) return;
      const roles = new Set((roleRows ?? []).map((r) => r.role));
      const role: AppRole = roles.has("admin")
        ? "admin"
        : roles.has("salgssupport")
          ? "salgssupport"
          : "saelger";
      const afdelinger = Array.isArray(afdRows) ? (afdRows as number[]) : [];
      const primaryRaw = (profile as any)?.primary_afdeling_nr ?? null;
      setState({
        loading: false,
        session,
        user: session.user,
        role,
        fullName: profile?.full_name ?? "",
        region: profile?.region ?? null,
        afdelinger,
        primaryAfdeling:
          primaryRaw != null && afdelinger.includes(primaryRaw) ? primaryRaw : (afdelinger[0] ?? null),
      });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      // defer to avoid recursive supabase calls
      setTimeout(() => loadExtras(session), 0);
    });

    supabase.auth.getSession().then(({ data }) => loadExtras(data.session));

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
