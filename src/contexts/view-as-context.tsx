import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEffektiveRettigheder } from "@/lib/permissions.functions";

type ViewAsState = {
  viewAsUserId: string | null;
  viewAsName: string | null;
};

type ViewAsContextValue = ViewAsState & {
  isAdmin: boolean;
  isImpersonating: boolean;
  /** The userId the UI should read data for: viewAs target if impersonating, else real user. */
  effectiveUserId: string | null;
  realUserId: string | null;
  /** Rettigheder for den EFFEKTIVE bruger — den man ser som, ikke den man er logget ind som. */
  effectiveRole: AppRole | null;
  effectiveMaaSeDb: boolean;
  effectiveMaaSeAnalyse: boolean;
  /** True mens den viste sælgers rettigheder hentes. */
  effectivePermsLoading: boolean;
  setViewAs: (id: string, name: string) => void;
  clearViewAs: () => void;
};

const STORAGE_KEY = "frellsen-view-as";

const ViewAsContext = createContext<ViewAsContextValue | null>(null);

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const isAdmin = auth.role === "admin";
  const realUserId = auth.user?.id ?? null;

  const [state, setState] = useState<ViewAsState>({ viewAsUserId: null, viewAsName: null });

  // Hydrate from sessionStorage once auth is known.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isAdmin) {
      // Non-admins can never impersonate. Clear any stale value.
      setState({ viewAsUserId: null, viewAsName: null });
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ViewAsState;
      if (parsed?.viewAsUserId && parsed?.viewAsName) setState(parsed);
    } catch {
      // ignore
    }
  }, [isAdmin]);

  const setViewAs = useCallback(
    (id: string, name: string) => {
      if (!isAdmin) return;
      const next = { viewAsUserId: id, viewAsName: name };
      setState(next);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    },
    [isAdmin],
  );

  const clearViewAs = useCallback(() => {
    setState({ viewAsUserId: null, viewAsName: null });
    if (typeof window !== "undefined") sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const impersonating = isAdmin && !!state.viewAsUserId;

  // Rettighederne for den viste sælger hentes eksplicit — auth.uid() kan ikke
  // skiftes, så visningen må styres af den effektive brugers rettigheder.
  const permsFn = useServerFn(getEffektiveRettigheder);
  const permsQ = useQuery({
    queryKey: ["effektive-rettigheder", state.viewAsUserId],
    enabled: impersonating && !!state.viewAsUserId,
    queryFn: () => permsFn({ data: { userId: state.viewAsUserId! } }),
    staleTime: 5 * 60 * 1000,
  });

  const value = useMemo<ViewAsContextValue>(() => {
    const perms = impersonating ? (permsQ.data ?? null) : null;
    return {
      viewAsUserId: impersonating ? state.viewAsUserId : null,
      viewAsName: impersonating ? state.viewAsName : null,
      isAdmin,
      isImpersonating: impersonating,
      effectiveUserId: impersonating ? state.viewAsUserId : realUserId,
      realUserId,
      effectiveRole: impersonating ? (perms?.role ?? null) : auth.role,
      // Under "Se som sælger" gælder sælgerens rettigheder — indtil de er hentet
      // antages ingen adgang, så administratorens tal aldrig blinker igennem.
      effectiveMaaSeDb: impersonating ? perms?.maaSeDb === true : auth.maaSeDb,
      effectiveMaaSeAnalyse: impersonating ? perms?.maaSeAnalyse === true : auth.maaSeAnalyse,
      effectivePermsLoading: impersonating && permsQ.isLoading,
      setViewAs,
      clearViewAs,
    };
  }, [isAdmin, realUserId, state, setViewAs, clearViewAs, impersonating, permsQ.data, permsQ.isLoading, auth.role, auth.maaSeDb, auth.maaSeAnalyse]);

  return <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
}

export function useViewAs(): ViewAsContextValue {
  const ctx = useContext(ViewAsContext);
  if (!ctx) {
    // Safe fallback if used outside provider (e.g. login page).
    return {
      viewAsUserId: null,
      viewAsName: null,
      isAdmin: false,
      isImpersonating: false,
      effectiveUserId: null,
      realUserId: null,
      setViewAs: () => {},
      clearViewAs: () => {},
    };
  }
  return ctx;
}

/** Convenience: returns true when the current user may perform write actions. */
export function useCanMutate(): boolean {
  return !useViewAs().isImpersonating;
}
