import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/useAuth";

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

  const value = useMemo<ViewAsContextValue>(() => {
    const impersonating = isAdmin && !!state.viewAsUserId;
    return {
      viewAsUserId: impersonating ? state.viewAsUserId : null,
      viewAsName: impersonating ? state.viewAsName : null,
      isAdmin,
      isImpersonating: impersonating,
      effectiveUserId: impersonating ? state.viewAsUserId : realUserId,
      realUserId,
      setViewAs,
      clearViewAs,
    };
  }, [isAdmin, realUserId, state, setViewAs, clearViewAs]);

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
