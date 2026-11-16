import { describe, it, expect } from "vitest";
import { kanTilfoejes, parseCvrListe, erAktivCvr } from "./kundetjek";

describe("kundetjek", () => {
  it("kun ikke-kunder uden reklamebeskyttelse kan tilføjes", () => {
    expect(kanTilfoejes({ status: "ikke_kunde", reklamebeskyttet: false })).toBe(true);
    expect(kanTilfoejes({ status: "ikke_kunde", reklamebeskyttet: true })).toBe(false);
    expect(kanTilfoejes({ status: "kunde", reklamebeskyttet: false })).toBe(false);
    expect(kanTilfoejes({ status: "mulig_kunde", reklamebeskyttet: false })).toBe(false);
    expect(kanTilfoejes({ status: "paa_ringeliste", reklamebeskyttet: false })).toBe(false);
  });
  it("CVR-liste: linjer og komma, unikke, max 500", () => {
    const r = parseCvrListe("29190623\n12345678, 29190623;DK87654321 abc");
    expect(r.cvrs).toEqual(["29190623", "12345678", "87654321"]);
    expect(r.ugyldige).toEqual(["abc"]);
    const mange = Array.from({ length: 501 }, (_, i) => String(10000000 + i)).join(",");
    expect(parseCvrListe(mange).cvrs.length).toBe(500);
    expect(parseCvrListe(mange).forMange).toBe(true);
  });
  it("ophørte virksomheder er ikke aktive", () => {
    expect(erAktivCvr("NORMAL")).toBe(true);
    expect(erAktivCvr("OPHØRT")).toBe(false);
  });
});
