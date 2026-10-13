/**
 * Henter alle rækker fra en PostgREST-forespørgsel side for side.
 * Serveren returnerer højst 1.000 rækker pr. kald uanset .limit(), så alt
 * der kan blive større end det, skal pagineres med .range().
 * Forespørgslen skal have en stabil .order(), ellers kan rækker gå tabt mellem sider.
 */
export async function hentAlle<T = any>(
  side: (fra: number, til: number) => PromiseLike<{ data: T[] | null; error: any }>,
  maks = Infinity,
  pageSize = 1000,
): Promise<T[]> {
  const ud: T[] = [];
  for (let fra = 0; fra < maks; fra += pageSize) {
    const til = Math.min(fra + pageSize, maks) - 1;
    const { data, error } = await side(fra, til);
    if (error) throw error;
    ud.push(...(data ?? []));
    if (!data || data.length < til - fra + 1) break;
  }
  return ud;
}
