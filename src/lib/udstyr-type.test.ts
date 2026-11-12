import { describe, it, expect } from "vitest";
import { classifyWittenborg as c } from "./udstyr-type";

describe("classifyWittenborg", () => {
  it("midlertidigt udlån (Bolero hos Klostercafeen) = udlån", () =>
    expect(c({ aftale_type: "4 [Lejeaftale]", reservedele: "Midlertidig udlån" })).toBe("udlaan"));
  it("udlån er case-insensitivt", () => expect(c({ reservedele: "  MIDLERTIDIG UDL." })).toBe("udlaan"));
  it("lejeaftale + binding = leje m/binding", () =>
    expect(c({ aftale_type: "4 [Lejeaftale]", binding_ophor: "2027-01-01" })).toBe("leje_binding"));
  it("lejeaftale uden binding (u/service) = leje u/binding", () =>
    expect(c({ aftale_type: "4 [Lejeaftale]" })).toBe("leje_ub"));
  it("kun lejedato og tom aftaletype = kundeejet", () => expect(c({ aftale_type: "" })).toBe("kunde_ejet"));
  it("kode 2 uden binding = leje u/binding", () => expect(c({ aftale_type: "2 [Lejeaftale - betaler filter]" })).toBe("leje_ub"));
  it("kode 2 med binding = leje m/binding", () =>
    expect(c({ aftale_type: "2 [Lejeaftale - betaler filter]", binding_ophor: "2027-01-01" })).toBe("leje_binding"));
  it("udlån fra Reserved. efter regn.", () =>
    expect(c({ aftale_type: "4 [Lejeaftale]", reservedele: "1 [Aftale m/Alt u/b]", reservedele_efter_raw: "Midlertidig udlån" })).toBe("udlaan"));
  it("dato i Reserved. efter regn. er ikke udlån", () =>
    expect(c({ aftale_type: "4 [Lejeaftale]", reservedele_efter_raw: "2031-12 december" })).toBe("leje_ub"));
});
