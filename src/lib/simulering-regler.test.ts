import { describe, expect, it } from "vitest";
import { bestemSaelger, type Regel } from "./simulering-regler";

const lok = (p: Partial<{ kpg1: string; kpg2: string; kpg3: string; ansatte: number | null }> = {}) =>
  ({ kpg1: "10 [Erhverv]", kpg2: "(ingen)", kpg3: "20 [Kontor]", ansatte: 20, ...p });
const base = { nu: "anders", frellsen: false, kamLaast: false, geo: "f:ny", fri: true };
const ingenOffentlige: Regel = { id: "b", type: "udeluk", saelger: "f:ny", aktiv: true, b: { kpg3: ["40 [Offentlige Udbud]"], ansatteOver: 100 } };
const jes: Regel = { id: "a", type: "tildel", saelger: "jes", aktiv: true, b: { kpg1: ["69 [Regions aftale]"] } };

describe("simulering-regler", () => {
  it("Frellsen (199) beholder altid sin sælger, selv om en regel matcher", () => {
    expect(bestemSaelger({ ...base, frellsen: true, lok: lok({ kpg1: "69 [Regions aftale]" }), regler: [jes] }).til).toBe("anders");
  });
  it("låste KAM-kunder beholder sælger", () => {
    expect(bestemSaelger({ ...base, kamLaast: true, lok: lok({ kpg1: "69 [Regions aftale]" }), regler: [jes] }).til).toBe("anders");
  });
  it("tildel-regel vinder over geografi", () => {
    expect(bestemSaelger({ ...base, lok: lok({ kpg1: "69 [Regions aftale]" }), regler: [jes] })).toEqual({ til: "jes", aarsag: "a" });
  });
  it("uden regel-match gælder geografi", () => {
    expect(bestemSaelger({ ...base, lok: lok(), regler: [jes, ingenOffentlige] })).toEqual({ til: "f:ny", aarsag: "geo" });
  });
  it("må ikke have KPG3 40 → beholder nuværende sælger", () => {
    expect(bestemSaelger({ ...base, lok: lok({ kpg3: "40 [Offentlige Udbud]" }), regler: [ingenOffentlige] })).toEqual({ til: "anders", aarsag: "b" });
  });
  it("over 100 ansatte udelukkes, 100 ansatte gør ikke", () => {
    expect(bestemSaelger({ ...base, lok: lok({ ansatte: 101 }), regler: [ingenOffentlige] }).til).toBe("anders");
    expect(bestemSaelger({ ...base, lok: lok({ ansatte: 100 }), regler: [ingenOffentlige] }).til).toBe("f:ny");
  });
  it("ukendt antal ansatte tæller som under grænsen som standard", () => {
    expect(bestemSaelger({ ...base, lok: lok({ ansatte: null }), regler: [ingenOffentlige] }).til).toBe("f:ny");
    const over: Regel = { ...ingenOffentlige, b: { ...ingenOffentlige.b, ukendtSomOver: true } };
    expect(bestemSaelger({ ...base, lok: lok({ ansatte: null }), regler: [over] }).til).toBe("anders");
  });
  it("alternativ 'går til' sender lokationen til den valgte sælger", () => {
    const r: Regel = { ...ingenOffentlige, b: { ...ingenOffentlige.b, alternativ: "saelger", alternativSaelger: "jes" } };
    expect(bestemSaelger({ ...base, lok: lok({ ansatte: 500 }), regler: [r] }).til).toBe("jes");
  });
  it("inaktive regler ignoreres", () => {
    expect(bestemSaelger({ ...base, lok: lok({ kpg1: "69 [Regions aftale]" }), regler: [{ ...jes, aktiv: false }] }).til).toBe("f:ny");
  });
});
