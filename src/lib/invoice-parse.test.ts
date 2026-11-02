import { describe, expect, it } from "vitest";
import { detectFileFormat, summarizeMonths } from "./invoice-parse";
import { topAfdelinger } from "./invoice-import.server";
import { INVOICE_FIELDS, matchInvoiceHeaders, normalizeInvoiceHeader } from "./invoice-headers";
import * as XLSX from "xlsx";

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

const headers: string[] = INVOICE_FIELDS.map((f) => f.aliases[0]);
const values = ["10", "11", "1", "20260901", "123", "V1", "Kaffe", "1", "2", "2", "1", "100", "90", "90", "30", "33", "AB"];
const csvRow = (cells: string[]) => cells.map((v) => `"${v}"`).join(" ");

describe("overskriftsbaseret fakturajournal", () => {
  it("normaliserer bindestreger, bløde bindestreger, (kr), punktummer og mellemrum", () => {
    expect(normalizeInvoiceHeader("  PRIS  efter  ra\u00adbat-.(kr) ")).toBe("pris efter rabat");
  });
  for (const field of INVOICE_FIELDS) {
    for (const alias of field.aliases) {
      it(`matcher ${alias} som ${field.label}`, () => {
        const alternative = [...headers];
        const index = INVOICE_FIELDS.findIndex((f) => f.key === field.key);
        alternative[index] = alias;
        expect(matchInvoiceHeaders(alternative)?.columns[field.key]).toBe(index);
      });
    }
  }
  it("11 matchende celler bruger ikke overskriftslogik", () => {
    expect(matchInvoiceHeaders(headers.slice(0, 11))).toBeNull();
  });
  it("12 matchende celler genkendes og afvises for alle manglende felter", () => {
    expect(() => matchInvoiceHeaders(headers.slice(0, 12))).toThrow(/Pris efter rabat, Beløb, DB, DG%, Initialer/);
  });
  it("Produktprisgruppe uden tal matcher kun med Produktprisgruppe 2", () => {
    const h = [...headers];
    h[8] = "produktprisgruppe";
    expect(matchInvoiceHeaders(h)?.columns.GROUP1).toBe(8);
    h[9] = "ukendt";
    expect(() => matchInvoiceHeaders(h)).toThrow(/Varegruppe 1, Varegruppe 2/);
  });
  for (let index = 0; index < INVOICE_FIELDS.length; index++) {
    it(`afviser filen hvis ${INVOICE_FIELDS[index].label} mangler`, async () => {
      const h = [...headers];
      h[index] = "ukendt";
      await expect(parseInvoiceJournal(fil([csvRow(h), csvRow(values)])))
        .rejects.toThrow(`Manglende felter: ${INVOICE_FIELDS[index].label}.`);
    });
  }
  it("afviser to alias-kolonner for samme felt før nogen linjer returneres", async () => {
    await expect(parseInvoiceJournal(fil([csvRow([...headers, "firm"]), csvRow([...values, "10"])])))
      .rejects.toThrow(/Dublet for Firma: kolonne 1 "firma" og kolonne 18 "firm"/);
  });
  it("tæller matchende celler fremfor unikke felter ved 12-cellereglen", () => {
    expect(() => matchInvoiceHeaders([...headers.slice(0, 11), "firm"]))
      .toThrow(/Dublet for Firma/);
  });
  it("ignorerer Navn og Kundeprisgruppe 1\/2 og parser omordnede CSV-kolonner identisk", async () => {
    const order = [13, 4, 0, 16, 1, 15, 2, 14, 3, 12, 5, 11, 6, 10, 7, 9, 8];
    const result = await parseInvoiceJournal(fil([
      csvRow(["Navn", ...order.map((i) => headers[i]), "Kundeprisgruppe 1", "Kundeprisgruppe 2"]),
      csvRow(["Testkonto", ...order.map((i) => values[i]), "KPG1", "KPG2"]),
    ]));
    const legacy = await parseInvoiceJournal(fil([csvRow(values)]));
    expect(result.rawLines).toEqual(legacy.rawLines);
    expect(result.stats.linesRead).toBe(1);
    expect(result.stats.format).toBe("headers");
    expect(result.stats.headerReport?.ignored.map((m) => m.header)).toEqual(["Navn", "Kundeprisgruppe 1", "Kundeprisgruppe 2"]);
    expect(result.stats.headerReport?.matched[0]).toEqual({ index: 1, header: "beløb", field: "Beløb" });
  });
  it("parser omordnede XLSX-kolonner med overskrifter", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...headers].reverse(), [...values].reverse()]), "Journal");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const result = await parseInvoiceJournal(new File([buffer], "journal.xlsx"));
    expect(result.rawLines).toEqual((await parseInvoiceJournal(fil([csvRow(values)]))).rawLines);
  });
  it("bevarer gammelt 20-kolonners format uden overskrifter", async () => {
    const old = [...values.slice(0, 5), "Navn", "KPG1", "KPG2", ...values.slice(5)];
    const result = await parseInvoiceJournal(fil([csvRow(old)]));
    expect(result.stats.format).toBe("20");
    expect(result.stats.headerReport).toBeNull();
    expect(result.rawLines).toEqual((await parseInvoiceJournal(fil([csvRow(values)]))).rawLines);
  });
  it("bruger samme overskriftsmap til summeringslinjer", async () => {
    const subtotal = values.map(() => "0");
    subtotal[4] = "123"; subtotal[13] = "90"; subtotal[14] = "30";
    const result = await parseInvoiceJournal(fil([
      csvRow([...headers].reverse()), csvRow([...values].reverse()), csvRow(subtotal.reverse()),
    ]));
    expect(result.stats.dbAfstemning.summeringer[0]).toMatchObject({ visma_delivery_no: "123", db_summering: 30, beloeb: 90 });
    expect(result.stats.subtotalRows).toBe(1);
  });
});

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
