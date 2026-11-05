// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_CODES, AGENT_STORAGE_KEY, erAgentCode, agentKravOpfyldt, hentAgent, gemAgent, senesteAgent, matcherAgent } from "./agent-code";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("kontaktlisteagenter", () => {
  it("tillader præcis A–H", () => {
    expect(AGENT_CODES).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    for (const code of AGENT_CODES) expect(erAgentCode(code)).toBe(true);
    for (const code of ["I", "a", "", "AB", null]) expect(erAgentCode(code)).toBe(false);
  });
  it("kræver agent for caller", () => {
    expect(agentKravOpfyldt(true, null)).toBe(false);
    expect(agentKravOpfyldt(true, "C")).toBe(true);
    expect(agentKravOpfyldt(true, "I")).toBe(false);
  });
  it("kræver ikke agent for interne brugere", () => {
    expect(agentKravOpfyldt(false, null)).toBe(true);
  });
  it("husker sidste valg og ignorerer ugyldige lagrede værdier", () => {
    gemAgent("C"); expect(hentAgent()).toBe("C");
    gemAgent("H"); expect(hentAgent()).toBe("H");
    localStorage.setItem(AGENT_STORAGE_KEY, "I"); expect(hentAgent()).toBeNull();
  });
  it("tåler browseren afviser både læsning og skrivning", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("disabled"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("disabled"); });
    expect(hentAgent()).toBeNull(); expect(() => gemAgent("A")).not.toThrow();
  });
  it("filtrerer seneste udfald frem for gamle agentregistreringer eller noter", () => {
    const records = [
      { at: "2026-11-01", udfald: "ingen_svar", agent_code: "A" },
      { at: "2026-11-03", udfald: "note", agent_code: "H" },
      { at: "2026-11-02", udfald: "ikke_interesseret", agent_code: "C" },
    ];
    expect(senesteAgent(records)).toBe("C");
    expect(matcherAgent(senesteAgent(records), "C")).toBe(true);
    expect(matcherAgent(senesteAgent(records), "A")).toBe(false);
    expect(records[0].agent_code).toBe("A");
  });
  it("historiske null og ingen udfald matcher kun Alle", () => {
    expect(senesteAgent([{ at: "2026-11-01", udfald: "ingen_svar", agent_code: null }])).toBeNull();
    expect(senesteAgent([])).toBeNull();
    expect(matcherAgent(null, "alle")).toBe(true);
    expect(matcherAgent(null, "A")).toBe(false);
  });
});