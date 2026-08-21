import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AfdelingInfo = { afdeling_nr: number; navn: string };
export type AfdelingValg = number | "alle";

type Ctx = {
  loading: boolean;
  /** Afdelinger den indloggede bruger har adgang til (med navne). */
  afdelinger: AfdelingInfo[];
  /** Vælgeren vises kun når brugeren har mere end én afdeling. */
  hasMultiple: boolean;
  hasNoAccess: boolean;
  selected: AfdelingValg;
  setSelected: (v: AfdelingValg) => void;
  /**
   * Rent kosmetisk filter til dataforespørgsler. null = vis alle mine
   * afdelinger. Sikkerheden ligger i RLS/my_afdelinger() — aldrig her.
   */
  afdelingFilter: number | null;
  /** Afdeling som nye rækker skal stemples med. */
  stampAfdelingNr: number | null;
  navnFor: (nr: number | null | undefined) => string;
  labelFor: (nr: number | null | undefined) => string;
};

const AfdelingContext = createContext<Ctx | null>(null);

export function AfdelingProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [alle, setAlle] = useState<AfdelingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AfdelingValg>("alle");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("afdeling")
      .select("afdeling_nr, navn")
      .order("afdeling_nr")
      .then(({ data }) => {
        if (!active) return;
        setAlle((data ?? []) as AfdelingInfo[]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const afdelinger = useMemo(
    () => alle.filter((a) => auth.afdelinger.includes(a.afdeling_nr)),
    [alle, auth.afdelinger],
  );

  // Default = primær afdeling (kun relevant for brugere med flere adgange).
  useEffect(() => {
    if (initialized || auth.loading || !auth.afdelinger.length) return;
    const stored =
      typeof window !== "undefined" && auth.user?.id
        ? window.localStorage.getItem(`afdeling-valg-${auth.user.id}`)
        : null;
    if (stored === "alle") setSelected("alle");
    else if (stored && auth.afdelinger.includes(Number(stored))) setSelected(Number(stored));
    else if (auth.afdelinger.length > 1 && auth.primaryAfdeling != null) setSelected(auth.primaryAfdeling);
    else setSelected("alle");
    setInitialized(true);
  }, [initialized, auth.loading, auth.afdelinger, auth.primaryAfdeling, auth.user?.id]);

  const value = useMemo<Ctx>(() => {
    const navnFor = (nr: number | null | undefined) =>
      alle.find((a) => a.afdeling_nr === nr)?.navn ?? (nr != null ? String(nr) : "—");
    return {
      loading: loading || auth.loading,
      afdelinger,
      hasMultiple: auth.afdelinger.length > 1,
      hasNoAccess: !auth.loading && auth.afdelinger.length === 0,
      selected,
      setSelected: (v) => {
        setSelected(v);
        if (typeof window !== "undefined" && auth.user?.id) {
          window.localStorage.setItem(`afdeling-valg-${auth.user.id}`, String(v));
        }
      },
      afdelingFilter: typeof selected === "number" ? selected : null,
      stampAfdelingNr:
        typeof selected === "number" ? selected : (auth.primaryAfdeling ?? auth.afdelinger[0] ?? null),
      navnFor,
      labelFor: (nr) => (nr != null ? `${nr} — ${navnFor(nr)}` : "—"),
    };
  }, [alle, afdelinger, auth.afdelinger, auth.loading, auth.primaryAfdeling, auth.user?.id, loading, selected]);

  return <AfdelingContext.Provider value={value}>{children}</AfdelingContext.Provider>;
}

export function useAfdeling(): Ctx {
  const ctx = useContext(AfdelingContext);
  if (!ctx) throw new Error("useAfdeling skal bruges inden i AfdelingProvider");
  return ctx;
}
