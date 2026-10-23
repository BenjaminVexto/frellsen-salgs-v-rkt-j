/**
 * Åbningslinjen på salgsmulighedskortet (Tilbud sendt).
 * Ren funktion så reglerne kan testes ét sted.
 */

export type ModtagerSporing = {
  sendt_at: string | null;
  antal_aabninger: number;
  foerst_aabnet_at: string | null;
  seneste_aabnet_at: string | null;
};

export type AabningLinje = { text: string; tone: "rod" | "neutral" };

const DAG_MS = 24 * 60 * 60 * 1000;

function kortDato(d: string) {
  return new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

/**
 * Regler:
 * - Ingen åbning 3 dage efter sendt -> rød "Tilbud ikke åbnet"
 * - 2+ åbninger inden for 48 timer  -> "Åbnet X gange · seneste [dato]"
 * - Ellers                          -> "Åbnet [dato]" / "Ikke åbnet"
 * - Ingen modtagere endnu           -> null (ingen linje)
 */
export function tilbudAabningLinje(
  modtagere: ModtagerSporing[],
  sentDate: string | null,
  now: Date = new Date(),
): AabningLinje | null {
  if (modtagere.length === 0) return null;

  const aabninger = modtagere.reduce((s, m) => s + (m.antal_aabninger ?? 0), 0);
  const seneste =
    modtagere
      .map((m) => m.seneste_aabnet_at)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null;
  const foerste =
    modtagere
      .map((m) => m.foerst_aabnet_at)
      .filter((d): d is string => !!d)
      .sort()
      .at(0) ?? null;

  if (aabninger === 0) {
    const sendt =
      modtagere
        .map((m) => m.sendt_at)
        .filter((d): d is string => !!d)
        .sort()
        .at(0) ?? sentDate;
    if (sendt && now.getTime() - new Date(sendt).getTime() > 3 * DAG_MS) {
      return { text: "Tilbud ikke åbnet", tone: "rod" };
    }
    return { text: "Ikke åbnet", tone: "neutral" };
  }

  if (
    aabninger >= 2 &&
    foerste &&
    seneste &&
    new Date(seneste).getTime() - new Date(foerste).getTime() <= 2 * DAG_MS
  ) {
    return { text: `Åbnet ${aabninger} gange · seneste ${kortDato(seneste)}`, tone: "neutral" };
  }

  return { text: `Åbnet ${kortDato(seneste!)}`, tone: "neutral" };
}
