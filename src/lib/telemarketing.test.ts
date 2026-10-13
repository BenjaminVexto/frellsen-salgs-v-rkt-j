import { describe, it, expect } from "vitest";
import { byggKoe, ingenSvarIRaekke, statusTekst, udfaldStatistik } from "./telemarketing";

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
