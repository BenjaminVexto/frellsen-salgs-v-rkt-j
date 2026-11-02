import { useEffect, useState } from "react";

export type Visning = "tabel" | "graf" | "udvikling";

/** Presentation belongs to the mounted graph, never to routing or data keys. */
export function useGrafVisning(brugerId: string, grafId: string, standardSerier: string[] = []) {
  const [visning, setVisning] = useState<Visning>("tabel");
  const [skjulte, setSkjulte] = useState<string[] | null>(null);
  const noegle = `maalepunkt-visning:${brugerId}`;

  useEffect(() => {
    try {
      const valg = JSON.parse(localStorage.getItem(noegle) ?? "{}")[grafId];
      setVisning(valg === "graf" || valg === "udvikling" ? valg : "tabel");
    } catch {
      setVisning("tabel");
    }
    setSkjulte(null);
  }, [noegle, grafId]);

  const saetVisning = (valg: Visning) => {
    setVisning(valg);
    try {
      const tidligere = JSON.parse(localStorage.getItem(noegle) ?? "{}");
      localStorage.setItem(noegle, JSON.stringify({ ...tidligere, [grafId]: valg }));
    } catch {
      // Storage is optional; graph state still works when it is unavailable.
    }
  };
  const skiftSerie = (serie: string) => setSkjulte((tidligere) => {
    const valg = tidligere ?? standardSerier;
    return valg.includes(serie) ? valg.filter((s) => s !== serie) : [...valg, serie];
  });

  return { visning, saetVisning, skjultListe: skjulte ?? standardSerier, skiftSerie, nulstilSerier: () => setSkjulte([]) };
}