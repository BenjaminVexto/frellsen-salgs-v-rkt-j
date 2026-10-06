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
  /** Må se dækningsbidrag (admin eller profiles.maa_se_db). */
  maaSeDb: boolean;
  /** Må se analysefanen (admin eller profiles.maa_se_analyse). */
  maaSeAnalyse: boolean;
  /** Adgang til Afdelingspotentiale (admin eller profiles.maa_se_afdelingspotentiale). */
  maaSeAfdelingspotentiale: boolean;
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
  maaSeDb: false,
  maaSeAnalyse: false,
  maaSeAfdelingspotentiale: false,
};


// Delt cache: kundekortet har mange komponenter, der hver kalder useAuth().
// Uden cache hentede hver af dem rolle/profil/afdelinger to gange (~140 kald),
// som stillede sig i kø i browseren og forsinkede alt andet på siden.
let extrasCache: { userId: string; promise: Promise<any[]> } | null = null;

function fetchExtras(userId: string): Promise<any[]> {
  if (extrasCache?.userId === userId) return extrasCache.promise;
  const promise = Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).returns<{ role: AppRole }[]>(),
    supabase
      .from("profiles")
      .select("full_name, region, primary_afdeling_nr, maa_se_db, maa_se_analyse")
      .eq("id", userId)
      .maybeSingle(),
    supabase.rpc("my_afdelinger"),
    (supabase as any).rpc("har_afdelingspotentiale", { _uid: userId }),
  ]);
  extrasCache = { userId, promise };
  promise.catch(() => {
    if (extrasCache?.promise === promise) extrasCache = null;
  });
  return promise;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(EMPTY);

  useEffect(() => {
    let active = true;

    const loadExtras = async (session: Session | null) => {
      if (!session) {
        if (active) setState({ ...EMPTY, loading: false });
        return;
      }
      const [{ data: roleRows }, { data: profile }, { data: afdRows }, { data: apRet }] =
        await fetchExtras(session.user.id);
      if (!active) return;
      const roles = new Set((roleRows ?? []).map((r: { role: AppRole }) => r.role));
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
        maaSeDb: role === "admin" || (profile as any)?.maa_se_db === true,
        maaSeAnalyse: role === "admin" || (profile as any)?.maa_se_analyse === true,
        maaSeAfdelingspotentiale: role === "admin" || apRet === true,
      });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((e, session) => {
      if (e === "SIGNED_OUT" || e === "USER_UPDATED" || e === "SIGNED_IN") extrasCache = null;
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
