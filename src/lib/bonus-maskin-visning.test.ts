import { describe, expect, it } from "vitest";
import { filtrerBonusMaskiner } from "./bonus-maskin-visning";

describe("bonus machine drilldown", () => {
  const rows = [
    { company_id: "kunde-a", bonusklasse: "animo", udeladt: false, antal: 6 },
    { company_id: "kunde-b", bonusklasse: "animo", udeladt: true, antal: 1 },
    { company_id: "kunde-c", bonusklasse: "rex", udeladt: false, antal: 1 },
  ];
  it("Animo drilldown shows only the customers behind counted Animo machines", () => {
    expect(filtrerBonusMaskiner(rows, "animo")).toEqual([rows[0]]);
  });
  it("the complete month preserves excluded machines for inspection", () => {
    expect(filtrerBonusMaskiner(rows, "alle")).toEqual(rows);
  });
});