import { describe, expect, it } from "vitest";
import { udledKundeDb, type UdledLinje } from "./invoice-db-udledning";

const l = (beloeb: number, db: number, vg2 = "10"): UdledLinje => ({ beloeb, db, varegruppe_2: vg2 });

describe("DB-udledning fra summeringslinje", () => {
  it("leje 16/80 med DB 0 bliver 100 % når summeringen siger det", () => {
    const ls = [l(1000, 300), l(500, 0, "80")];
    expect(udledKundeDb(ls, 800)).toBe("udledt");
    expect(ls[1]).toMatchObject({ db: 500, db_kilde: "udledt_subtotal" });
  });
  it("maskinsalg 16/78 med reelt DB 0 bevares", () => {
    const ls = [l(1000, 300), l(20000, 0, "78")];
    expect(udledKundeDb(ls, 300)).toBe("db0_korrekt");
    expect(ls[1]).toMatchObject({ db: 0, db_kilde: "linje" });
  });
  it("kun 80-kandidater får DB når kun de passer", () => {
    const ls = [l(1000, 300), l(500, 0, "80"), l(20000, 0, "78")];
    expect(udledKundeDb(ls, 800)).toBe("udledt_80");
    expect(ls[1].db).toBe(500);
    expect(ls[2].db).toBe(0);
  });
  it("±1 kr. tolerance", () => expect(udledKundeDb([l(100, 0, "80")], 100.9)).toBe("udledt"));
  it("ingen passer → uafklaret og ingen ændring", () => {
    const ls = [l(1000, 300), l(500, 0, "80")];
    expect(udledKundeDb(ls, 650)).toBe("uafklaret");
    expect(ls[1]).toMatchObject({ db: 0, db_kilde: "uafklaret" });
  });
  it("uden kandidater og rest 0 → uændret", () => expect(udledKundeDb([l(100, 30)], 30)).toBe("uaendret"));
});
