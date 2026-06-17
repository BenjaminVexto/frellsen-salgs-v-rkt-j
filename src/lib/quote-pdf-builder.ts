/**
 * Server-side PDF rendering for frozen quotes.
 *
 * Designed so the pricing section is ONE self-contained block
 * (renderPricingSection). Phase 2 can wrap intro/outro pages
 * around it without touching this module's data flow.
 *
 * Data source: same payload as get_public_quote — never live products.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
  PageSizes,
} from "pdf-lib";
import { FRELLSEN_LOGO_BASE64 } from "./frellsen-logo-base64";

// ------- Types: must mirror get_public_quote payload -------

export type QuoteLineSnapshot = {
  id: string;
  varenr: string | null;
  line_type: string; // 'machine' | 'consumable' | 'accessory' | ...
  beskrivelse_snapshot: string | null;
  antal: number;
  listepris_snapshot: number | null;
  rabat_pct_snapshot: number | null;
  rabat_kr_snapshot: number | null;
  saerpris_kr_snapshot: number | null;
  nettopris_snapshot: number | null;
  nettopris_enhed_snapshot: number | null;
  er_leje: boolean;
  sort_order: number;
};

export type PublicQuotePayload = {
  quote: {
    id: string;
    quote_number: string;
    status: string;
    pricing_mode: string;
    sent_date: string | null;
    expiry_date: string | null;
    frozen_at: string | null;
    notes: string | null;
  };
  company: {
    name: string;
    address: string | null;
    zip: string | null;
    city: string | null;
    contact_person: string | null;
    cvr: string | null;
  };
  location: {
    address: string | null;
    zip: string | null;
    city: string | null;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  lines: QuoteLineSnapshot[];
};

// ------- Layout constants -------

const PAGE_W = PageSizes.A4[0];
const PAGE_H = PageSizes.A4[1];
const MARGIN_X = 40;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 60;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const COLOR_TEXT = rgb(0.1, 0.1, 0.12);
const COLOR_MUTED = rgb(0.45, 0.47, 0.52);
const COLOR_LINE = rgb(0.85, 0.86, 0.88);
const COLOR_ACCENT = rgb(0.72, 0.16, 0.18); // frellsen rød-tone
const COLOR_SAVE = rgb(0.05, 0.45, 0.25);

// ------- Helpers -------

function fmt(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("da-DK", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return String(s);
  }
}

function lineNetTotal(l: QuoteLineSnapshot): number {
  if (l.nettopris_snapshot != null && l.nettopris_enhed_snapshot != null) {
    return Number(l.nettopris_snapshot);
  }
  if (l.nettopris_enhed_snapshot != null) {
    return Number(l.nettopris_enhed_snapshot) * Number(l.antal ?? 1);
  }
  return Number(l.nettopris_snapshot ?? 0);
}
function lineListTotal(l: QuoteLineSnapshot): number {
  return Number(l.listepris_snapshot ?? 0) * Number(l.antal ?? 1);
}
function isSaerpris(l: QuoteLineSnapshot): boolean {
  return Number(l.saerpris_kr_snapshot ?? 0) > 0;
}

function bucketize(lines: QuoteLineSnapshot[]) {
  const engangskob = lines.filter(
    (l) =>
      (l.line_type === "machine" && !l.er_leje) || l.line_type === "accessory",
  );
  const leje = lines.filter((l) => l.line_type === "machine" && l.er_leje);
  const forbrug = lines.filter((l) => l.line_type === "consumable");
  return [
    { key: "engangskob", title: "Engangskøb", suffix: "", lines: engangskob },
    { key: "leje", title: "Månedlig leje", suffix: " /md", lines: leje },
    { key: "forbrug", title: "Løbende forbrug", suffix: "", lines: forbrug },
  ].filter((b) => b.lines.length > 0);
}

// ------- Encoding helpers (Helvetica can't render every glyph) -------
//
// WinAnsi (what Helvetica uses) is missing some symbols we use.
// Replace just those, keep Danish letters æøå/ÆØÅ intact (they ARE in WinAnsi).

function sanitize(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/→/g, "->")
    .replace(/∞/g, "ubegr.")
    .replace(/·/g, "·") // middle dot IS in WinAnsi, keep
    .replace(/—/g, "—") // em dash IS in WinAnsi
    .replace(/[\u200B-\u200D\uFEFF]/g, ""); // zero-width
}

function decodeBase64(b64: string): Uint8Array {
  // Workers/Node both have atob
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ------- Drawing primitives -------

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number; // cursor (top-down: decreases)
  logo: { width: number; height: number; image: any };
};

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage(PageSizes.A4);
  ctx.y = PAGE_H - MARGIN_TOP;
}

function ensure(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN_BOTTOM) newPage(ctx);
}

function textWidth(text: string, font: PDFFont, size: number): number {
  return font.widthOfTextAtSize(text, size);
}

function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    align?: "left" | "right";
    width?: number; // for right-align
  } = {},
): void {
  const size = opts.size ?? 10;
  const font = opts.bold ? ctx.bold : ctx.font;
  const color = opts.color ?? COLOR_TEXT;
  const safe = sanitize(text);
  let drawX = x;
  if (opts.align === "right" && opts.width != null) {
    drawX = x + opts.width - textWidth(safe, font, size);
  }
  ctx.page.drawText(safe, { x: drawX, y, size, font, color });
}

function drawLine(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = COLOR_LINE,
  thickness = 0.5,
): void {
  ctx.page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness,
    color,
  });
}

/** Word-wrap text to fit width, return lines. */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const safe = sanitize(text);
  if (!safe) return [];
  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (textWidth(candidate, font, size) <= maxWidth) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      // hard-break a single very long word
      if (textWidth(w, font, size) > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          if (textWidth(chunk + ch, font, size) > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        cur = chunk;
      } else {
        cur = w;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ------- Sections -------

function renderHeader(ctx: Ctx, payload: PublicQuotePayload): void {
  const { quote, company, location } = payload;
  const top = PAGE_H - MARGIN_TOP;

  // Logo (left)
  const logoH = 42;
  const logoW = (ctx.logo.width / ctx.logo.height) * logoH;
  ctx.page.drawImage(ctx.logo.image, {
    x: MARGIN_X,
    y: top - logoH,
    width: logoW,
    height: logoH,
  });

  // Tilbud meta (right)
  const rightX = PAGE_W - MARGIN_X;
  const colW = 200;
  drawText(ctx, "TILBUD", rightX - colW, top - 8, {
    size: 9,
    color: COLOR_MUTED,
    align: "right",
    width: colW,
  });
  drawText(ctx, quote.quote_number, rightX - colW, top - 28, {
    size: 18,
    bold: true,
    align: "right",
    width: colW,
  });
  drawText(
    ctx,
    `Dato: ${fmtDate(quote.sent_date)}`,
    rightX - colW,
    top - 44,
    { size: 9, color: COLOR_MUTED, align: "right", width: colW },
  );
  drawText(
    ctx,
    `Gyldig til: ${fmtDate(quote.expiry_date)}`,
    rightX - colW,
    top - 56,
    { size: 9, color: COLOR_MUTED, align: "right", width: colW },
  );

  // Divider under header
  let y = top - Math.max(logoH, 70) - 10;
  drawLine(ctx, MARGIN_X, y, PAGE_W - MARGIN_X, y, COLOR_ACCENT, 1);
  y -= 18;

  // Two columns: Tilbud til | Leveringsadresse
  const colGap = 20;
  const colWidth = (CONTENT_W - colGap) / 2;
  const leftX = MARGIN_X;
  const rightCx = MARGIN_X + colWidth + colGap;

  const blockTop = y;
  // Left: Tilbud til
  drawText(ctx, "TILBUD TIL", leftX, blockTop, {
    size: 8,
    color: COLOR_MUTED,
    bold: true,
  });
  let ly = blockTop - 14;
  drawText(ctx, company.name, leftX, ly, { size: 12, bold: true });
  ly -= 14;
  if (company.contact_person) {
    drawText(ctx, `Att: ${company.contact_person}`, leftX, ly, {
      size: 9,
      color: COLOR_MUTED,
    });
    ly -= 12;
  }
  if (company.address) {
    drawText(ctx, company.address, leftX, ly, { size: 9, color: COLOR_MUTED });
    ly -= 12;
  }
  const zipCity = [company.zip, company.city].filter(Boolean).join(" ");
  if (zipCity) {
    drawText(ctx, zipCity, leftX, ly, { size: 9, color: COLOR_MUTED });
    ly -= 12;
  }
  if (company.cvr) {
    drawText(ctx, `CVR: ${company.cvr}`, leftX, ly, {
      size: 8,
      color: COLOR_MUTED,
    });
    ly -= 12;
  }

  // Right: Leveringsadresse
  let ry = blockTop;
  if (location) {
    drawText(ctx, "LEVERINGSADRESSE", rightCx, ry, {
      size: 8,
      color: COLOR_MUTED,
      bold: true,
    });
    ry -= 14;
    if (location.contact_person) {
      drawText(ctx, location.contact_person, rightCx, ry, { size: 10 });
      ry -= 12;
    }
    if (location.address) {
      drawText(ctx, location.address, rightCx, ry, {
        size: 9,
        color: COLOR_MUTED,
      });
      ry -= 12;
    }
    const lzc = [location.zip, location.city].filter(Boolean).join(" ");
    if (lzc) {
      drawText(ctx, lzc, rightCx, ry, { size: 9, color: COLOR_MUTED });
      ry -= 12;
    }
    const contact = [location.phone, location.email]
      .filter(Boolean)
      .join(" · ");
    if (contact) {
      drawText(ctx, contact, rightCx, ry, { size: 8, color: COLOR_MUTED });
      ry -= 12;
    }
  }

  ctx.y = Math.min(ly, ry) - 18;
}

// ------- Pricing section -------
// Public entry point so fase 2 can call with a pre-existing doc/page.

const COL_QTY_W = 36;
const COL_LIST_W = 78;
const COL_RABAT_W = 76;
const COL_NET_W = 90;
const COL_DESC_W =
  CONTENT_W - COL_QTY_W - COL_LIST_W - COL_RABAT_W - COL_NET_W - 4 * 8;

function renderBucket(
  ctx: Ctx,
  bucket: ReturnType<typeof bucketize>[number],
): void {
  ensure(ctx, 90);

  // Bucket header
  drawText(ctx, bucket.title.toUpperCase(), MARGIN_X, ctx.y, {
    size: 11,
    bold: true,
    color: COLOR_ACCENT,
  });
  const countLabel = `${bucket.lines.length} ${
    bucket.lines.length === 1 ? "linje" : "linjer"
  }`;
  drawText(ctx, countLabel, MARGIN_X, ctx.y, {
    size: 8,
    color: COLOR_MUTED,
    align: "right",
    width: CONTENT_W,
  });
  ctx.y -= 8;
  drawLine(ctx, MARGIN_X, ctx.y, PAGE_W - MARGIN_X, ctx.y);
  ctx.y -= 14;

  // Column headers
  const xDesc = MARGIN_X;
  const xQty = xDesc + COL_DESC_W + 8;
  const xList = xQty + COL_QTY_W + 8;
  const xRabat = xList + COL_LIST_W + 8;
  const xNet = xRabat + COL_RABAT_W + 8;

  drawText(ctx, "BESKRIVELSE", xDesc, ctx.y, {
    size: 8,
    bold: true,
    color: COLOR_MUTED,
  });
  drawText(ctx, "ANTAL", xQty, ctx.y, {
    size: 8,
    bold: true,
    color: COLOR_MUTED,
    align: "right",
    width: COL_QTY_W,
  });
  drawText(ctx, "LISTEPRIS", xList, ctx.y, {
    size: 8,
    bold: true,
    color: COLOR_MUTED,
    align: "right",
    width: COL_LIST_W,
  });
  drawText(ctx, "RABAT", xRabat, ctx.y, {
    size: 8,
    bold: true,
    color: COLOR_MUTED,
    align: "right",
    width: COL_RABAT_W,
  });
  drawText(ctx, "NETTOPRIS", xNet, ctx.y, {
    size: 8,
    bold: true,
    color: COLOR_MUTED,
    align: "right",
    width: COL_NET_W,
  });
  ctx.y -= 6;
  drawLine(ctx, MARGIN_X, ctx.y, PAGE_W - MARGIN_X, ctx.y);
  ctx.y -= 12;

  // Rows
  let listSum = 0;
  let netSum = 0;
  let visibleSavings = 0; // savings shown to customer = only non-saerpris lines

  for (const l of bucket.lines) {
    const saer = isSaerpris(l);
    const descLines = wrap(
      l.beskrivelse_snapshot || l.varenr || "",
      ctx.bold,
      10,
      COL_DESC_W,
    );
    const varenrLine = l.varenr ? `Varenr ${l.varenr}` : "";
    const rowH = 12 + descLines.length * 12 + (varenrLine ? 11 : 0) + 6;
    ensure(ctx, rowH + 4);

    const rowTop = ctx.y;
    // Description (bold) + varenr (small muted)
    let dy = rowTop;
    for (let i = 0; i < descLines.length; i++) {
      drawText(ctx, descLines[i], xDesc, dy, { size: 10, bold: true });
      dy -= 12;
    }
    if (varenrLine) {
      drawText(ctx, varenrLine, xDesc, dy, { size: 8, color: COLOR_MUTED });
      dy -= 11;
    }

    // Numbers — right column. For saerpris: only netto.
    drawText(ctx, String(l.antal), xQty, rowTop, {
      size: 10,
      align: "right",
      width: COL_QTY_W,
    });

    if (!saer) {
      drawText(ctx, fmt(l.listepris_snapshot), xList, rowTop, {
        size: 10,
        align: "right",
        width: COL_LIST_W,
        color: COLOR_MUTED,
      });
      const pct = Number(l.rabat_pct_snapshot ?? 0);
      const kr = Number(l.rabat_kr_snapshot ?? 0);
      const rabatLabel =
        pct > 0 && kr > 0
          ? `${pct}% + ${fmt(kr)} kr`
          : pct > 0
            ? `${pct}%`
            : kr > 0
              ? `${fmt(kr)} kr`
              : "—";
      drawText(ctx, rabatLabel, xRabat, rowTop, {
        size: 10,
        align: "right",
        width: COL_RABAT_W,
        color: COLOR_MUTED,
      });
    }
    // If saerpris: leave listepris + rabat columns blank — show only nettoprisen.

    drawText(ctx, `${fmt(lineNetTotal(l))} kr`, xNet, rowTop, {
      size: 10,
      bold: true,
      align: "right",
      width: COL_NET_W,
    });

    listSum += lineListTotal(l);
    netSum += lineNetTotal(l);
    if (!saer) {
      visibleSavings += Math.max(0, lineListTotal(l) - lineNetTotal(l));
    }

    ctx.y = rowTop - (rowH - 12);
    // subtle row separator
    drawLine(ctx, MARGIN_X, ctx.y + 2, PAGE_W - MARGIN_X, ctx.y + 2);
    ctx.y -= 6;
  }

  // Total
  ensure(ctx, 36);
  ctx.y -= 4;
  drawLine(ctx, MARGIN_X, ctx.y, PAGE_W - MARGIN_X, ctx.y, COLOR_TEXT, 1);
  ctx.y -= 16;
  // Left: listepris i alt + savings (only meaningful if there are visible non-saerpris lines)
  const leftLabel = `Listepris i alt: ${fmt(listSum)} kr${
    visibleSavings > 0 ? `   ·   I sparer ${fmt(visibleSavings)} kr` : ""
  }`;
  drawText(ctx, leftLabel, MARGIN_X, ctx.y, {
    size: 9,
    color: visibleSavings > 0 ? COLOR_SAVE : COLOR_MUTED,
  });
  // Right: total
  drawText(
    ctx,
    `TOTAL${bucket.suffix.toUpperCase()}`,
    MARGIN_X,
    ctx.y + 12,
    {
      size: 8,
      color: COLOR_MUTED,
      align: "right",
      width: CONTENT_W,
    },
  );
  drawText(ctx, `${fmt(netSum)} kr${bucket.suffix}`, MARGIN_X, ctx.y - 4, {
    size: 14,
    bold: true,
    align: "right",
    width: CONTENT_W,
  });
  ctx.y -= 26;
}

export function renderPricingSection(
  ctx: Ctx,
  payload: PublicQuotePayload,
): void {
  const buckets = bucketize(payload.lines);
  if (buckets.length === 0) {
    ensure(ctx, 40);
    drawText(
      ctx,
      "Tilbuddet indeholder ingen linjer.",
      MARGIN_X,
      ctx.y,
      { size: 10, color: COLOR_MUTED },
    );
    ctx.y -= 18;
    return;
  }
  for (const b of buckets) renderBucket(ctx, b);
}

function renderNotesAndFooter(
  ctx: Ctx,
  payload: PublicQuotePayload,
): void {
  if (payload.quote.notes) {
    ensure(ctx, 60);
    drawText(ctx, "BEMÆRKNINGER", MARGIN_X, ctx.y, {
      size: 8,
      bold: true,
      color: COLOR_MUTED,
    });
    ctx.y -= 14;
    const noteLines = payload.quote.notes
      .split(/\n/)
      .flatMap((para) => {
        const wrapped = wrap(para, ctx.font, 10, CONTENT_W);
        return wrapped.length ? wrapped : [""];
      });
    for (const ln of noteLines) {
      ensure(ctx, 14);
      drawText(ctx, ln, MARGIN_X, ctx.y, { size: 10 });
      ctx.y -= 13;
    }
    ctx.y -= 10;
  }

  // Footer on every page
  const pages = ctx.doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    p.drawLine({
      start: { x: MARGIN_X, y: 42 },
      end: { x: PAGE_W - MARGIN_X, y: 42 },
      thickness: 0.5,
      color: COLOR_LINE,
    });
    const footL = `Alle priser er ekskl. moms. Tilbud gyldigt til ${fmtDate(
      payload.quote.expiry_date,
    )}.`;
    p.drawText(sanitize(footL), {
      x: MARGIN_X,
      y: 30,
      size: 8,
      font: ctx.font,
      color: COLOR_MUTED,
    });
    const right = `Frellsen Kaffe A/S · Side ${i + 1} af ${pages.length}`;
    const w = ctx.font.widthOfTextAtSize(sanitize(right), 8);
    p.drawText(sanitize(right), {
      x: PAGE_W - MARGIN_X - w,
      y: 30,
      size: 8,
      font: ctx.font,
      color: COLOR_MUTED,
    });
  }
}

// ------- Top-level builder -------

export async function buildQuotePdf(
  payload: PublicQuotePayload,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Tilbud ${payload.quote.quote_number} — ${payload.company.name}`);
  doc.setProducer("Frellsen Tilbudssystem");
  doc.setCreator("Frellsen Tilbudssystem");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = decodeBase64(FRELLSEN_LOGO_BASE64);
  const logoImg = await doc.embedPng(logoBytes);

  const page = doc.addPage(PageSizes.A4);
  const ctx: Ctx = {
    doc,
    page,
    font,
    bold,
    y: PAGE_H - MARGIN_TOP,
    logo: { width: logoImg.width, height: logoImg.height, image: logoImg },
  };

  renderHeader(ctx, payload);
  renderPricingSection(ctx, payload);
  renderNotesAndFooter(ctx, payload);

  return await doc.save();
}

export function buildPdfFilename(payload: PublicQuotePayload): string {
  const q = payload.quote.quote_number || "tilbud";
  const c = (payload.company.name || "kunde")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `Tilbud_${q}_${c}.pdf`;
}
