import { describe, it, expect } from "vitest";
import { sorterTilbud } from "./tilbud-sektion";
describe("sorterTilbud", () => {
  it("åbne tilbud står øverst", () => {
    const r = sorterTilbud([{ status: "afvist" }, { status: "under_opfølgning" }, { status: "accepteret" }, { status: "sendt" }]);
    expect(r.map((x) => x.status)).toEqual(["under_opfølgning", "sendt", "afvist", "accepteret"]);
  });
});
