import type { CourseObject, Season, Term } from "./types";

// Where each season falls in a calendar year (winter = January).
const CALENDAR_ORDER: Record<Season, number> = { winter: 0, spring: 1, summer: 2, fall: 3 };

// Is the object offered in this term? Terms without a season or year
// can't be checked, so they count as offered. An object with no seasons
// (TBA) isn't offered in any term that has one.
export function isOffered(object: CourseObject, term: Pick<Term, "season" | "year">): boolean {
  const availability = object.availability;

  if (term.season && !availability.seasons.includes(term.season)) {
    return false;
  }
  if (availability.yearParity && term.year !== undefined) {
    const isOddYear = term.year % 2 === 1;
    if ((availability.yearParity === "odd") !== isOddYear) return false;
  }
  return true;
}

export interface CalendarSlot {
  season: Season;
  year: number;
}

// List `count` consecutive terms, cycling through `seasons`.
// The year goes up when a season comes earlier in the calendar than the
// one before it: Fall 2026 is followed by Spring 2027.
export function termCalendar(start: CalendarSlot, seasons: Season[], count: number): CalendarSlot[] {
  if (seasons.length === 0) throw new Error("A calendar needs at least one season.");
  const startAt = seasons.indexOf(start.season);
  if (startAt === -1) throw new Error(`Start season ${start.season} is not in the calendar.`);

  const slots: CalendarSlot[] = [];
  let year = start.year;
  for (let i = 0; i < count; i++) {
    const season = seasons[(startAt + i) % seasons.length];
    const previous = slots[slots.length - 1];
    if (previous && CALENDAR_ORDER[season] <= CALENDAR_ORDER[previous.season]) year++;
    slots.push({ season, year });
  }
  return slots;
}

export function slotLabel(slot: CalendarSlot): string {
  return `${slot.season[0].toUpperCase()}${slot.season.slice(1)} ${slot.year}`;
}
