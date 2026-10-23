import { describe, it, expect } from "vitest";
import { byggKoe, ingenSvarIRaekke, statusTekst, udfaldStatistik, iStatusGruppe, standardRang, ringIgenIDag, VALGBARE_UDFALD } from "./telemarketing";

const nu = new Date("2026-10-13T12:00:00Z");

describe("telemarketing-kø", () => {
  it("forfalden 'ring igen' kommer før nye", () => {
    const rows = [
      { company_id: "ny", status: "ny", opkald: [] },
      { company_id: "igen", status: "ring_igen", opkald: [{ at: "2026-10-10T09:00:00Z", udfald: "ring_igen" as const, ring_igen_at: "2026-10-13T08:00:00Z" }] },
    ];
    expect(byggKoe(rows, nu).map((r) => r.company_id)).toEqual(["igen", "ny"]);
  });
  it("'ring igen' i fremtiden er ikke i køen", () => {
    const rows = [{ company_id: "senere", status: "ring_igen", opkald: [{ at: "2026-10-10T09:00:00Z", udfald: "ring_igen" as const, ring_igen_at: "2026-10-20T08:00:00Z" }] }];
    expect(byggKoe(rows, nu)).toEqual([]);
  });
  it("3 x ingen svar i træk tælles", () => {
    const o = (at: string, udfald: any) => ({ at, udfald, ring_igen_at: null });
    expect(ingenSvarIRaekke([o("1", "ingen_svar"), o("2", "ingen_svar"), o("3", "ingen_svar")])).toBe(3);
    expect(ingenSvarIRaekke([o("1", "ingen_svar"), o("2", "ring_igen"), o("3", "ingen_svar")])).toBe(1);
  });
});

describe("udfald og statistik", () => {
  it("admin og sælger kan vælge en fri note i den fælles registrering", () => {
    expect(VALGBARE_UDFALD).toContain("note");
  });
  it("viser årsag ved Ikke interesseret", () => {
    expect(statusTekst("ikke_interesseret", "har_leverandoer")).toBe("Ikke interesseret · Har leverandør");
  });
  it("succes = møde + tilbud, succesrate = succes / opnået; ingen svar er ikke opnået", () => {
    const s = udfaldStatistik([
      { company_id: "a", udfald: "ikke_interesseret", user_id: "admin" },
      { company_id: "b", udfald: "moede_booket", user_id: "tm" },
      { company_id: "c", udfald: "tilbud_oensket", user_id: "s" },
      { company_id: "d", udfald: "ingen_svar", user_id: "tm" },
    ]);
    expect(s.opnaaet).toBe(3);
    expect(s.succes).toBe(2);
    expect(s.succesrate).toBeCloseTo(2 / 3);
    expect(s.ringet).toBe(4);
  });
});

describe("bureau-overblik", () => {
  it("fri note tæller ikke som opkald og bryder ikke 'ingen svar' i træk", () => {
    const s = udfaldStatistik([{ company_id: "a", udfald: "note", user_id: "tm" }, { company_id: "b", udfald: "ingen_svar", user_id: "tm" }]);
    expect(s.opkald).toBe(1);
    expect(s.ringet).toBe(1);
    const o = (at: string, udfald: any) => ({ at, udfald, ring_igen_at: null });
    expect(ingenSvarIRaekke([o("1", "ingen_svar"), o("2", "note"), o("3", "ingen_svar")])).toBe(2);
  });
  it("Afsluttet = ikke interesseret, ønsker ikke kontakt, forkert nummer; Succes = møde, tilbud", () => {
    expect(["ikke_interesseret", "oensker_ikke_kontakt", "forkert_nummer"].every((s) => iStatusGruppe(s, "afsluttet"))).toBe(true);
    expect(iStatusGruppe("møde_booket", "succes") && iStatusGruppe("tilbud_oensket", "succes")).toBe(true);
    expect(iStatusGruppe("ring_igen", "afsluttet")).toBe(false);
  });
  it("standardsortering: forfalden ring igen før Ny før resten", () => {
    const igen = { status: "ring_igen", opkald: [{ at: "2026-10-13T09:00:00Z", udfald: "ring_igen" as const, ring_igen_at: "2026-10-13T10:00:00Z" }] };
    expect(standardRang(igen, nu)[0]).toBe(0);
    expect(standardRang({ status: "ny", opkald: [] }, nu)[0]).toBe(1);
    expect(standardRang({ status: "forsoegt", opkald: [] }, nu)[0]).toBe(3);
  });
  it("ring igen senere i dag vises under 'Ring igen i dag', i morgen gør ikke", () => {
    expect(ringIgenIDag("2026-10-13T15:00:00", new Date("2026-10-13T12:00:00"))).toBe(true);
    expect(ringIgenIDag("2026-10-14T09:00:00", new Date("2026-10-13T12:00:00"))).toBe(false);
  });
});
