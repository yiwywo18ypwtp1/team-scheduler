/**
 * Minimal iCalendar (RFC 5545) file with one event. Times are written in UTC
 * ("...Z"), so no VTIMEZONE block is needed and every client converts them
 * to its own timezone.
 */
export function buildIcs({
  uid,
  start,
  end,
  createdAt,
  summary,
  description,
  organizer,
}: {
  uid: string;
  start: number;
  end: number;
  createdAt: number;
  summary: string;
  description?: string;
  organizer?: { name: string; email: string };
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Team Scheduler//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatUtc(createdAt)}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    ...(organizer ? [`ORGANIZER;CN=${escapeParam(organizer.name)}:mailto:${organizer.email}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // RFC 5545: lines end with CRLF and are folded at 75 octets.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** 20261020T130000Z */
function formatUtc(instant: number): string {
  return new Date(instant).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Backslash, semicolon, comma and newlines must be escaped in TEXT values. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Parameter values with special characters are quoted; quotes themselves aren't allowed. */
function escapeParam(value: string): string {
  const clean = value.replace(/"/g, "'");
  return /[;:,]/.test(clean) ? `"${clean}"` : clean;
}

/** Splits a line into 75-octet chunks; continuation lines start with a space. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines spend one octet on the leading space.
    const limit = chunks.length === 0 ? 75 : 74;
    if (currentBytes + bytes > limit) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}
