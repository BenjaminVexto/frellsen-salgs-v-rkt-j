import { describe, expect, it } from "vitest";
import { loenartGrundlag, loenfilDato, loenfilRaekker, tidligLaasning } from "./bonus-afregning";

describe("bonusafregning", () => {
  it("Jes sep 2026: 1561 = DB-provision, 1563 = maskiner + ny kunde", () => {
    expect(loenartGrundlag({ db_bonus: 6575.06, samlet_bonus: 11325.06 }, null)).toEqual({ l1561: 6575.06, l1563: 4750 });
  });
  it("fast provision: alt på 1561, 0 på 1563", () => {
    expect(loenartGrundlag({ db_bonus: 0, samlet_bonus: 9000 }, 9000)).toEqual({ l1561: 9000, l1563: 0 });
  });
  it("lønfildato er første dag i måneden efter", () => {
    expect(loenfilDato("2026-09")).toBe("01-10-2026");
    expect(loenfilDato("2026-12")).toBe("01-01-2027");
  });
  it("to rækker pr. sælger, også ved 0", () => {
    const r = loenfilRaekker("2026-09", [{ loennr: "5883", loen_1561: 9000, loen_1563: 0 }]);
    expect(r.map((x) => [x.CVR, x.Name, x["Project ID"], x["Type ID"], x.Number, x.Amount])).toEqual([
      ["25340604", "Provision 1", "Provision 1", 1561, 1, 9000],
      ["25340604", "Provision 2", "Provision 2", 1563, 1, 0],
    ]);
  });
  it("advarsel før den 10. i måneden efter", () => {
    expect(tidligLaasning("2026-09", new Date("2026-10-09T12:00:00Z"))).toBe(true);
    expect(tidligLaasning("2026-09", new Date("2026-10-10T00:00:00Z"))).toBe(false);
  });
});
