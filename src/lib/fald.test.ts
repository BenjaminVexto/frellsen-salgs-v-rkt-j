import { describe, it, expect } from "vitest";
import { erFalder } from "./fald";

describe("erFalder (20 % og 5.000 kr.)", () => {
  it("falder ved 20 % og 5.000 kr.", () => expect(erFalder(-20, 20000, 25000, 20, 5000)).toBe(true));
  it("ikke ved 19 % fald selvom stort beløb", () => expect(erFalder(-19, 81000, 100000, 20, 5000)).toBe(false));
  it("ikke ved 50 % men kun 4.000 kr.", () => expect(erFalder(-50, 4000, 8000, 20, 5000)).toBe(false));
});
