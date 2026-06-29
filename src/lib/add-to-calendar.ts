// Genererer en .ics-fil (iCalendar, RFC 5545) og trigger download i browseren.
// En-vejs: brugerens egen kalender (Outlook/Google/Apple) lægger hændelsen ind
// når filen åbnes. Ingen backend, ingen OAuth, ingen sync.

export type AddToCalendarInput = {
  title: string;
  description?: string;
  /** Forfaldsdato (YYYY-MM-DD eller Date). Bliver til heldagshændelse. */
  date: string | Date;
  location?: string;
  /** Link tilbage til fx virksomhedskortet — vedhæftes beskrivelsen og URL-feltet. */
  url?: string;
  /** Stabilt UID-suffix, fx `aftale-{companyId}`. Default: tilfældigt. */
  uid?: string;
};

/** Escape iCal-tekstfelter: backslash, semikolon, komma, newline. */
function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folding pr. RFC 5545: linjer > 75 oktetter brydes med CRLF + space. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    parts.push((i === 0 ? "" : " ") + line.slice(i, i + (i === 0 ? 75 : 74)));
    i += i === 0 ? 75 : 74;
  }
  return parts.join("\r\n");
}

function toDateOnly(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function toUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs(input: AddToCalendarInput): string {
  const dtStart = toDateOnly(input.date);
  // DTEND ved heldagshændelse = dagen efter (exclusive)
  const startDate = typeof input.date === "string" ? new Date(input.date) : input.date;
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const dtEnd = toDateOnly(endDate);
  const dtStamp = toUtcStamp(new Date());
  const uid = `${input.uid ?? `evt-${Math.random().toString(36).slice(2)}-${Date.now()}`}@frellsen`;

  const descParts = [input.description?.trim(), input.url?.trim()].filter(Boolean) as string[];
  const description = descParts.join("\\n\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Frellsen Salgsoversigt//DA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    description ? `DESCRIPTION:${description}` : null,
    input.location ? `LOCATION:${escapeIcsText(input.location)}` : null,
    input.url ? `URL:${escapeIcsText(input.url)}` : null,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(input.title)}`,
    "TRIGGER:-P7D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean) as string[];

  return lines.map(foldLine).join("\r\n");
}

export function addToCalendar(input: AddToCalendarInput): void {
  const ics = buildIcs(input);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const safeName = input.title.replace(/[^\p{L}\p{N}\-_ ]/gu, "").slice(0, 60).trim() || "kalender";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
