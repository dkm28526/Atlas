/**
 * Date helpers.
 *
 * Everything in the planner moves ISO `yyyy-mm-dd` strings around and treats
 * them as calendar dates with no timezone. Parsing goes through UTC so a
 * traveller in Auckland and one in Los Angeles get the same itinerary.
 */

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** Inclusive day count: the same date start and end is one day. */
export function dayCount(startISO: string, endISO: string): number {
  const ms = parseISO(endISO).getTime() - parseISO(startISO).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

export function isValidISO(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(parseISO(iso).getTime());
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatShort(iso: string): string {
  const d = parseISO(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatRange(startISO: string, endISO: string): string {
  return `${formatShort(startISO)} – ${formatShort(endISO)}`;
}

/** Today in ISO form, used only to seed the form's defaults. */
export function todayISO(): string {
  return toISO(new Date());
}
