/**
 * Server-only helper: synkroniserer CVR-produktionsenheder (P-enheder)
 * for en liste af CVR-numre ind i public.cvr_penheder.
 *
 * Bruges af worker-endpointet /api/public/hooks/process-penhed-sync.
 *
 * Vigtigt: CVR-API'et paginéres med from/size. Store virksomheder
 * (fx Novo Nordisk) har flere hundrede P-enheder, så vi henter i sider
 * af 200 indtil vi får færre end 200 hits — med et loft på from=2000.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CVR_PENHED_URL =
  "http://distribution.virk.dk/cvr-permanent/produktionsenhed/_search";

const CVR_CHUNK = 25;
const PAGE_SIZE = 200;
const MAX_FROM = 2000;

function pickLatest<
  T extends { periode?: { gyldigTil?: string | null; gyldigFra?: string | null } },
>(arr: T[] | undefined | null): T | null {
  if (!arr || !arr.length) return null;
  const active = arr.filter((x) => !x?.periode?.gyldigTil);
  const list = active.length ? active : arr;
  return (
    [...list].sort((a, b) => {
      const da = a?.periode?.gyldigFra ?? "";
      const db = b?.periode?.gyldigFra ?? "";
      return db.localeCompare(da);
    })[0] ?? null
  );
}

type PenhedRow = {
  p_number: string;
  cvr: string;
  name: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  branch_code: string | null;
  status: string | null;
  is_active: boolean;
  synced_at: string;
};

function mapPenhed(p: any, syncedAt: string): PenhedRow | null {
  const pNumber = p?.pNummer != null ? String(p.pNummer) : "";
  // CVR-relationen ligger i virksomhedsrelation[] / metadata, ikke som et
  // fladt virksomhedCvrNummer-felt.
  const relLatest = pickLatest<any>(p?.virksomhedsrelation);
  const cvrNum =
    p?.produktionsEnhedMetadata?.nyesteCvrNummerRelation ??
    relLatest?.cvrNummer ??
    null;
  const cvr = cvrNum != null ? String(cvrNum) : "";
  if (!pNumber || !cvr) return null;

  const addr =
    pickLatest<any>(p?.beliggenhedsadresse) ?? p?.beliggenhedsadresse?.[0] ?? null;
  const vejnavn = addr?.vejnavn ?? "";
  const husnr = addr?.husnummerFra != null ? String(addr.husnummerFra) : "";
  const bogstavFra = addr?.bogstavFra ?? "";
  const etage = addr?.etage ? `, ${addr.etage}.` : "";
  const address = vejnavn ? `${vejnavn} ${husnr}${bogstavFra}${etage}`.trim() : null;

  const navnEntry = pickLatest<any>(p?.navne) ?? p?.navne?.[p?.navne?.length - 1] ?? null;
  const branch = pickLatest<any>(p?.hovedbranche);

  return {
    p_number: pNumber,
    cvr,
    name: navnEntry?.navn ?? null,
    address,
    zip: addr?.postnummer != null ? String(addr.postnummer) : null,
    city: addr?.postdistrikt ?? null,
    branch_code:
      branch?.branchekode != null ? String(branch.branchekode) : null,
    status: p?.produktionsEnhedMetadata?.sammensatStatus ?? null,
    is_active: true,
    synced_at: syncedAt,
  };
}

export async function syncPenhederByCvrs(
  cvrs: string[],
): Promise<{ synced: number; error?: string }> {
  if (!cvrs.length) return { synced: 0 };

  const user = process.env.CVR_USERNAME;
  const pass = process.env.CVR_PASSWORD;
  if (!user || !pass) return { synced: 0, error: "CVR credentials mangler" };
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");

  const clean = Array.from(
    new Set(cvrs.map((c) => String(c ?? "").trim()).filter((c) => /^\d{8}$/.test(c))),
  );
  if (!clean.length) return { synced: 0 };

  let synced = 0;

  for (let i = 0; i < clean.length; i += CVR_CHUNK) {
    const slice = clean.slice(i, i + CVR_CHUNK);
    const cvrInts = slice.map((c) => parseInt(c, 10));
    const syncedAt = new Date().toISOString();
    const rows = new Map<string, PenhedRow>();

    for (let from = 0; from <= MAX_FROM; from += PAGE_SIZE) {
      const payload = {
        _source: [
          "VrproduktionsEnhed.pNummer",
          "VrproduktionsEnhed.virksomhedsrelation",
          "VrproduktionsEnhed.produktionsEnhedMetadata.nyesteCvrNummerRelation",
          "VrproduktionsEnhed.produktionsEnhedMetadata.sammensatStatus",
          "VrproduktionsEnhed.navne",
          "VrproduktionsEnhed.beliggenhedsadresse",
          "VrproduktionsEnhed.hovedbranche",
        ],
        query: {
          bool: {
            must: [
              {
                terms: {
                  "VrproduktionsEnhed.virksomhedsrelation.cvrNummer": cvrInts,
                },
              },
              {
                match: {
                  "VrproduktionsEnhed.produktionsEnhedMetadata.sammensatStatus":
                    "Aktiv",
                },
              },
            ],
          },
        },
        from,
        size: PAGE_SIZE,
      };

      const res = await fetch(CVR_PENHED_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return {
          synced,
          error: `CVR-API fejl ${res.status}: ${res.statusText}`,
        };
      }
      const json: any = await res.json();
      const hits: any[] = json?.hits?.hits ?? [];
      for (const hit of hits) {
        const mapped = mapPenhed(hit?._source?.VrproduktionsEnhed, syncedAt);
        if (mapped) rows.set(mapped.p_number, mapped);
      }
      if (hits.length < PAGE_SIZE) break;
    }

    const list = Array.from(rows.values());
    if (list.length) {
      const { error: upErr } = await supabaseAdmin
        .from("cvr_penheder")
        .upsert(list as any, { onConflict: "p_number", ignoreDuplicates: false });
      if (upErr) return { synced, error: `Upsert fejl: ${upErr.message}` };
      synced += list.length;
    }

    // Luk P-enheder der ikke længere returneres for disse CVR-numre.
    const seen = list.map((r) => r.p_number);
    let deactivate = supabaseAdmin
      .from("cvr_penheder")
      .update({ is_active: false, synced_at: syncedAt })
      .in("cvr", slice)
      .eq("is_active", true);
    if (seen.length) {
      deactivate = deactivate.not(
        "p_number",
        "in",
        `(${seen.map((p) => `"${p}"`).join(",")})`,
      );
    }
    const { error: deErr } = await deactivate;
    if (deErr) return { synced, error: `Deaktivering fejl: ${deErr.message}` };
  }

  return { synced };
}
