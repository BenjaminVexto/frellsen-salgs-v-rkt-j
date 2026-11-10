import { describe, expect, it } from "vitest";
import { matcherKundestatus, statusAntal } from "./status-oversigt";

const rows = [
  { customer_type: "aktiv_kunde" },
  { customer_type: "sovende_kunde" },
  { customer_type: "tidligere_kunde" },
  { customer_type: "sovende_kunde", koeber_paa_konto: "other-account" },
];
describe("statusoversigt", () => {
  it("aktive først skjuler sovende i listen, men bevarer antallet", () => {
    expect(rows.filter((r) => matcherKundestatus(r, ["aktiv_kunde"]))).toEqual([rows[0]]);
    expect(statusAntal(rows)).toEqual({ alle: 4, aktiv_kunde: 1, sovende_kunde: 1, tidligere_kunde: 1 });
  });
  it("Alle beholder alle søgeresultater", () => {
    expect(rows.filter((r) => matcherKundestatus(r, []))).toHaveLength(4);
  });
  it("sovende vises uden konti, der køber via søsterkonto", () => {
    expect(rows.filter((r) => matcherKundestatus(r, ["sovende_kunde"]))).toEqual([rows[1]]);
  });
});