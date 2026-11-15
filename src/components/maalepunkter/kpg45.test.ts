import { describe, it, expect } from "vitest";
import { kpg45Raekker, filtrerUnderkategori, hovedKategori } from "./kpg45";

describe("KPG3 45-opdeling", () => {
  it("underrækker summerer til forhandlingskunder", () => {
    const [a, b] = kpg45Raekker([
      { maaned: "2025-10-01", kategori: "privat_45", vaerdi: 1040 },
      { maaned: "2025-10-01", kategori: "privat_ovrige", vaerdi: 1966 },
    ]);
    expect((a.per.get("2025-10") ?? 0) + (b.per.get("2025-10") ?? 0)).toBe(3006);
  });
  it("underkategori slår op på privat", () => expect(hovedKategori("privat_45")).toBe("privat"));
  it("detaljer filtreres pr. konto", () => {
    const rows = [{ company_id: "a" }, { company_id: "b" }];
    expect(filtrerUnderkategori(rows, "privat_45", new Set(["a"]), false).map((r) => r.company_id)).toEqual(["a"]);
    expect(filtrerUnderkategori(rows, "privat_ovrige", new Set(["a"]), false).map((r) => r.company_id)).toEqual(["b"]);
  });
  it("nye kunder følger gruppens første konto", () => {
    const rows = [
      { company_id: "b", gruppe_key: "g", oprettet: "2024-01-01" },
      { company_id: "a", gruppe_key: "g", oprettet: "2025-01-01" },
    ];
    expect(filtrerUnderkategori(rows, "privat_45", new Set(["a"]), true)).toHaveLength(0);
    expect(filtrerUnderkategori(rows, "privat_ovrige", new Set(["a"]), true)).toHaveLength(2);
  });
});
