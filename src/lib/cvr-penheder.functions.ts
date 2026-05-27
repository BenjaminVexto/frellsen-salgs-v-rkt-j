import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CVR_PENHED_URL =
  "http://distribution.virk.dk/cvr-permanent/produktionsenhed/_search";

export type CvrPenhed = {
  p_number: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  branch_code: string | null;
  status: string | null;
};

function pickLatest<T extends { periode?: { gyldigTil?: string | null; gyldigFra?: string | null } }>(
  arr: T[] | undefined | null,
): T | null {
  if (!arr || !arr.length) return null;
  const active = arr.filter((x) => !x?.periode?.gyldigTil);
  const list = active.length ? active : arr;
  return [...list].sort((a, b) => {
    const da = a?.periode?.gyldigFra ?? "";
    const db = b?.periode?.gyldigFra ?? "";
    return db.localeCompare(da);
  })[0];
}

function mapPenhed(p: any): CvrPenhed {
  const addr = pickLatest<any>(p?.beliggenhedsadresse) ?? p?.beliggenhedsadresse?.[0] ?? null;
  const vejnavn = addr?.vejnavn ?? "";
  const husnr = addr?.husnummerFra != null ? String(addr.husnummerFra) : "";
  const bogstavFra = addr?.bogstavFra ?? "";
  const etage = addr?.etage ? `, ${addr.etage}.` : "";
  const address = vejnavn ? `${vejnavn} ${husnr}${bogstavFra}${etage}`.trim() : null;
  const branch = pickLatest<any>(p?.brancheAnsvarskode);
  return {
    p_number: p?.pNummer != null ? String(p.pNummer) : "",
    address,
    zip: addr?.postnummer != null ? String(addr.postnummer) : null,
    city: addr?.postdistrikt ?? null,
    branch_code: branch?.brancheAnsvarskode != null ? String(branch.brancheAnsvarskode) : null,
    status: p?.sammensatStatus ?? null,
  };
}

const InputSchema = z.object({
  cvr: z.string().regex(/^\d{8}$/, "CVR skal være 8 cifre"),
});

export const cvrLookupPenheder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const user = process.env.CVR_USERNAME;
    const pass = process.env.CVR_PASSWORD;
    if (!user || !pass) throw new Error("CVR credentials mangler");
    const auth = Buffer.from(`${user}:${pass}`).toString("base64");

    const payload = {
      _source: [
        "VrproduktionsEnhed.pNummer",
        "VrproduktionsEnhed.beliggenhedsadresse",
        "VrproduktionsEnhed.brancheAnsvarskode",
        "VrproduktionsEnhed.sammensatStatus",
      ],
      query: {
        bool: {
          must: [
            { term: { "VrproduktionsEnhed.virksomhedCvrNummer": parseInt(data.cvr, 10) } },
            { match: { "VrproduktionsEnhed.sammensatStatus": "Aktiv" } },
          ],
        },
      },
      size: 50,
    };

    const res = await fetch(CVR_PENHED_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`CVR API fejl: ${res.status}`);
    const json: any = await res.json();
    const hits = json?.hits?.hits ?? [];
    const units: CvrPenhed[] = hits
      .map((h: any) => h?._source?.VrproduktionsEnhed)
      .filter(Boolean)
      .map(mapPenhed);
    return { units };
  });
