import { describe, expect, it } from "vitest";
import { detectFileFormat, summarizeMonths } from "./invoice-parse";
import { topAfdelinger } from "./invoice-import.server";

const row = (n: number, firma = "10") => [firma, ...Array(n - 1).fill("x")];

describe("filformat", () => {
  it("17 kolonner = nyt format", () => expect(detectFileFormat([row(17), row(17)])).toBe("17"));
  it("20 kolonner = gammelt format", () => expect(detectFileFormat([row(20)])).toBe("20"));
  it("18 kolonner afvises med antal", () => expect(() => detectFileFormat([row(18)])).toThrow(/18 kolonner/));
  it("blandet 17/20 afvises", () => expect(() => detectFileFormat([row(17), row(20)])).toThrow());
  it("subtotalrækker (firma 0) tæller ikke", () => expect(detectFileFormat([row(17), row(5, "0")])).toBe("17"));
});

describe("berørte måneder", () => {
  const lines = (dates: string[], afd = 11) => dates.map((faktura_dato) => ({ afdeling_nr: afd, faktura_dato }));

  it("okt–dec 2024 berører kun de tre måneder", () => {
    const { maaneder } = summarizeMonths(lines(["2024-10-02", "2024-11-15", "2024-12-30"]));
    expect(maaneder.map((m) => m.maaned)).toEqual(["2024-10-01", "2024-11-01", "2024-12-01"]);
  });

  it("fil der starter 15/9 sletter ikke 1/9–14/9", () => {
    const { maaneder } = summarizeMonths(lines(["2026-09-15", "2026-09-20"]));
    expect(maaneder[0]).toMatchObject({ maaned: "2026-09-01", fra: "2026-09-15", til: "2026-09-20", linjer: 2 });
  });

  it("2017-linje i en 2026-fil markeres afvigende, hovedmåneder ikke", () => {
    const d = [...Array(50).fill("2026-08-10"), "2017-07-03"];
    const { maaneder } = summarizeMonths(lines(d));
    expect(maaneder.find((m) => m.maaned === "2017-07-01")?.afvigende).toBe(true);
    expect(maaneder.find((m) => m.maaned === "2026-08-01")?.afvigende).toBe(false);
  });

  it("måneder holdes adskilt pr. afdeling", () => {
    const { maaneder } = summarizeMonths([...lines(["2024-10-01"], 11), ...lines(["2024-11-01"], 21)]);
    expect(maaneder.map((m) => `${m.afdeling_nr}|${m.maaned}`)).toEqual(["11|2024-10-01", "21|2024-11-01"]);
  });

  it("top-varer genberegnes ikke for en okt–dec 2024-fil", () => {
    expect(topAfdelinger([{ afdeling_nr: 11, maaned: "2024-12-01" }], new Date("2026-10-05"))).toEqual([]);
  });
});

import { parseInvoiceJournal } from "./invoice-parse";
const linje = (dato: string, lev = "123") =>
  ["10", "11", "1", dato, lev, "V1", "Kaffe", "1", "2", "2", "1", "100", "90", "90", "30", "33", "AB"].map((v) => `"${v}"`).join(" ");
const fil = (rows: string[]) => new File([rows.join("\n")], "f.csv", { type: "text/csv" });

describe("ingen fejlrækker tilladt", () => {
  const godeRaekker = Array(999).fill(linje("20260901"));
  it("én ugyldig dato blandt 1000 afviser filen", async () => {
    await expect(parseInvoiceJournal(fil([...godeRaekker, linje("xx")]))).rejects.toThrow(/Filen afvist/);
  });
  it("én manglende Lev. kunde afviser filen", async () => {
    await expect(parseInvoiceJournal(fil([...godeRaekker, linje("20260901", "")]))).rejects.toThrow(/Filen afvist/);
  });
  it("fejlfri fil accepteres", async () => {
    const r = await parseInvoiceJournal(fil(godeRaekker));
    expect(r.rawLines.length).toBe(999);
  });
});

describe("ikke-fakturerede linjer", () => {
  const gode = Array(10).fill(linje("20260901"));
  it("fakturadato 0 og tom springes over og tælles", async () => {
    const r = await parseInvoiceJournal(fil([...gode, linje("0"), linje("")]));
    expect(r.rawLines.length).toBe(10);
    expect(r.stats.ikkeFaktureret).toBe(2);
    expect(r.stats.ikkeFaktureretEksempler[0]).toEqual({ ordre_nr: "1", varenr: "V1", beloeb: "90" });
  });
  it("anden ugyldig dato afviser stadig filen", async () => {
    await expect(parseInvoiceJournal(fil([...gode, linje("32-13-2026")]))).rejects.toThrow(/Filen afvist/);
  });
});
