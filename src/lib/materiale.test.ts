import { describe, expect, it } from "vitest";
import { materialeMailHtml } from "./mail-html";
import { materialeKilde, standardMailtekst } from "./materiale-url";

describe("materialeafsendelse", () => {
  it("ét valg forudfylder materialets tekst, flere giver fælles tekst", () => {
    expect(standardMailtekst([{ mailtekst: "Her er kataloget." }])).toBe("Her er kataloget.");
    expect(standardMailtekst([{ mailtekst: "A" }, { mailtekst: "B" }])).toBe("Her er materialerne, som aftalt.");
  });
  it("én mail har ét sporet link og en Se-knap pr. materiale", () => {
    const html = materialeMailHtml({ navn: "", tekst: "Hej", sellerName: "S", materialer: [
      { titel: "Kaffekatalog", link: "https://frellsen.lovable.app/k/1", billede: null },
      { titel: "ESG-rapport 2026", link: "https://frellsen.lovable.app/k/2", billede: null },
    ] });
    expect(html.match(/>Se</g)).toHaveLength(2);
    expect(html).toContain("/k/1");
    expect(html).toContain("/k/2");
  });
  it("PDF-materialer peger på filadressen, links på deres url", () => {
    expect(materialeKilde({ id: "x", type: "pdf", url: null })).toBe("https://frellsen.lovable.app/m/x/pdf");
    expect(materialeKilde({ id: "x", type: "link", url: "https://a.dk" })).toBe("https://a.dk");
  });
});
