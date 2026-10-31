export type Period = "am" | "pm";

export type ParsedTime = {
  hour24: number;
  minute: number;
  period: Period;
};

export type WallHit = {
  instant: Date;
  kind: "exact" | "gap" | "overlap";
};

export type ClockFace = {
  timeZone: string;
  hour24: number;
  minute: number;
  second: number;
  hour12: number;
  period: Period;
  timeLabel: string;
  relation: string;
  relationDelta: number;
  dateLabel: string;
  longDate: string;
  longName: string;
  abbr: string;
  offsetLabel: string;
  offsetMinutes: number;
  isDST: boolean;
  observesDST: boolean;
};

const civilFormatters = new Map<string, Intl.DateTimeFormat>();
const nameFormatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const standardCache = new Map<string, { jan: number; jul: number }>();

function civilFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = civilFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    civilFormatters.set(timeZone, fmt);
  }
  return fmt;
}

export type Civil = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function civilInZone(instant: Date, timeZone: string): Civil {
  const map: Record<string, string> = {};
  for (const part of civilFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  let year = Number(map.year);
  let month = Number(map.month);
  let day = Number(map.day);
  let hour = Number(map.hour);
  if (hour === 24) {
    hour = 0;
    const rolled = new Date(Date.UTC(year, month - 1, day + 1));
    year = rolled.getUTCFullYear();
    month = rolled.getUTCMonth() + 1;
    day = rolled.getUTCDate();
  }
  return {
    year,
    month,
    day,
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

export function offsetMs(instant: Date, timeZone: string): number {
  const civil = civilInZone(instant, timeZone);
  const asUtc = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
    civil.second,
  );
  // Civil time is whole seconds. Drop subseconds so they are not read as a fake offset.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function formatOffset(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "\u2212";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return mins === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${String(mins).padStart(2, "0")}`;
}

function offsetAtNoon(year: number, month: number, day: number, timeZone: string): number {
  const utc = Date.UTC(year, month - 1, day, 12, 0, 0);
  const first = offsetMs(new Date(utc), timeZone);
  return offsetMs(new Date(utc - first), timeZone);
}

function standardOffsets(year: number, timeZone: string): { jan: number; jul: number } {
  const key = `${timeZone}:${year}`;
  const cached = standardCache.get(key);
  if (cached) return cached;
  const value = {
    jan: offsetAtNoon(year, 1, 15, timeZone),
    jul: offsetAtNoon(year, 7, 15, timeZone),
  };
  standardCache.set(key, value);
  return value;
}

export function daylightStatus(
  instant: Date,
  timeZone: string,
): { isDST: boolean; observesDST: boolean } {
  const civil = civilInZone(instant, timeZone);
  const { jan, jul } = standardOffsets(civil.year, timeZone);
  if (jan === jul) return { isDST: false, observesDST: false };
  const standard = Math.min(jan, jul);
  return { isDST: offsetMs(instant, timeZone) !== standard, observesDST: true };
}

const validZones = new Map<string, boolean>();

export function isValidZone(timeZone: string): boolean {
  const cached = validZones.get(timeZone);
  if (cached !== undefined) return cached;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    validZones.set(timeZone, true);
    return true;
  } catch {
    validZones.set(timeZone, false);
    return false;
  }
}

export function localZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isValidZone(zone) ? zone : "UTC";
}

type Wall = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function sameWall(civil: Civil, wall: Wall): boolean {
  return (
    civil.year === wall.year &&
    civil.month === wall.month &&
    civil.day === wall.day &&
    civil.hour === wall.hour &&
    civil.minute === wall.minute
  );
}

function instantsForWall(wall: Wall, timeZone: string): Date[] {
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  const guess = offsetMs(new Date(wallAsUtc), timeZone);
  const candidates = new Set<number>();
  const consider = (offset: number) => {
    const ms = wallAsUtc - offset;
    candidates.add(ms);
    candidates.add(wallAsUtc - offsetMs(new Date(ms), timeZone));
  };
  consider(guess);
  for (const extra of [60, -60, 30, -30, 45, -45, 90, -90]) {
    consider(guess + extra * 60000);
  }
  const hits: Date[] = [];
  for (const ms of candidates) {
    const instant = new Date(ms);
    if (sameWall(civilInZone(instant, timeZone), wall)) hits.push(instant);
  }
  hits.sort((a, b) => a.getTime() - b.getTime());
  const unique: Date[] = [];
  for (const instant of hits) {
    if (!unique.some((item) => item.getTime() === instant.getTime())) unique.push(instant);
  }
  return unique;
}

function addMinutes(wall: Wall, minutes: number): Wall {
  const total = wall.hour * 60 + wall.minute + minutes;
  const dayDelta = Math.floor(total / 1440);
  const mins = ((total % 1440) + 1440) % 1440;
  const shifted = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + dayDelta));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: Math.floor(mins / 60),
    minute: mins % 60,
  };
}

export function wallTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
  overlap: "earlier" | "later" = "earlier",
): WallHit {
  const wall = { year, month, day, hour, minute };
  const matches = instantsForWall(wall, timeZone);
  if (matches.length >= 2) {
    const instant = overlap === "later" ? matches[matches.length - 1] : matches[0];
    return { instant: instant ?? matches[0]!, kind: "overlap" };
  }
  if (matches.length === 1) return { instant: matches[0]!, kind: "exact" };

  const { jan, jul } = standardOffsets(year, timeZone);
  const gapMinutes = Math.round(Math.abs(jan - jul) / 60000);
  const shifts = [gapMinutes, 60, 30, 45, 90, 120].filter(
    (shift, index, all) => shift > 0 && all.indexOf(shift) === index,
  );
  for (const shift of shifts) {
    const found = instantsForWall(addMinutes(wall, shift), timeZone);
    if (found[0]) return { instant: found[0], kind: "gap" };
  }

  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  return { instant: new Date(wallAsUtc - offsetMs(new Date(wallAsUtc), timeZone)), kind: "gap" };
}

export function calendarDayIndex(instant: Date, timeZone: string): number {
  const civil = civilInZone(instant, timeZone);
  return Math.floor(Date.UTC(civil.year, civil.month - 1, civil.day) / 86400000);
}

export function relationLabel(delta: number): string {
  if (delta === 0) return "Today";
  if (delta === -1) return "Yesterday";
  if (delta === 1) return "Tomorrow";
  if (delta < 0) return `${Math.abs(delta)} days ago`;
  return `In ${delta} days`;
}

function zoneName(instant: Date, timeZone: string, style: "long" | "short"): string {
  const key = `${style}:${timeZone}`;
  let fmt = nameFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: style });
    nameFormatters.set(key, fmt);
  }
  return fmt.formatToParts(instant).find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

function formatZonedDate(instant: Date, timeZone: string, variant: "long" | "short"): string {
  const key = `${variant}:${timeZone}`;
  let fmt = dateFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(
      "en-US",
      variant === "long"
        ? { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }
        : { timeZone, weekday: "short", month: "short", day: "numeric" },
    );
    dateFormatters.set(key, fmt);
  }
  return fmt.format(instant);
}

export function zoneAbbreviation(
  short: string,
  offsetLabel: string,
  timeZone: string,
  longName: string,
): string {
  if (/^[A-Za-z]{2,5}$/.test(short)) {
    if (short === "UTC" && /greenwich/i.test(longName)) return "GMT";
    return short;
  }
  if (/^GMT(?:\+0{1,2}(?::00)?)?$/.test(short)) {
    if (timeZone === "UTC" || /coordinated universal/i.test(longName)) return "UTC";
    return "GMT";
  }
  return offsetLabel;
}

export function to12(hour24: number): { hour12: number; period: Period } {
  const period: Period = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, period };
}

export function describeInstant(
  instant: Date,
  timeZone: string,
  referenceInstant: Date,
  referenceZone: string,
): ClockFace {
  const civil = civilInZone(instant, timeZone);
  const { hour12, period } = to12(civil.hour);
  const offset = offsetMs(instant, timeZone);
  const offsetLabel = formatOffset(offset);
  const short = zoneName(instant, timeZone, "short");
  const longName = zoneName(instant, timeZone, "long");
  const abbr = zoneAbbreviation(short, offsetLabel, timeZone, longName);
  const delta = calendarDayIndex(instant, timeZone) - calendarDayIndex(referenceInstant, referenceZone);
  const daylight = daylightStatus(instant, timeZone);
  return {
    timeZone,
    hour24: civil.hour,
    minute: civil.minute,
    second: civil.second,
    hour12,
    period,
    timeLabel: `${hour12}:${String(civil.minute).padStart(2, "0")}`,
    relation: relationLabel(delta),
    relationDelta: delta,
    dateLabel: formatZonedDate(instant, timeZone, "short"),
    longDate: formatZonedDate(instant, timeZone, "long"),
    longName,
    abbr,
    offsetLabel,
    offsetMinutes: Math.round(offset / 60000),
    isDST: daylight.isDST,
    observesDST: daylight.observesDST,
  };
}

export function isoDateInZone(instant: Date, timeZone: string): string {
  const civil = civilInZone(instant, timeZone);
  return `${civil.year}-${String(civil.month).padStart(2, "0")}-${String(civil.day).padStart(2, "0")}`;
}

export function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function from12(hour: number, period: Period): number {
  if (period === "am") return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

export function parseTimeInput(raw: string, fallback: Period): ParsedTime | null {
  const source = raw.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (!source) return null;
  const match = /^(\d{1,2})(?::(\d{1,2}))?\s*(am|pm|a|p)?$/.exec(source);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59 || hour > 23) return null;
  const token = match[3] === "a" ? "am" : match[3] === "p" ? "pm" : match[3];
  if (token === "am" || token === "pm") {
    if (hour < 1 || hour > 12) return null;
    return { hour24: from12(hour, token), minute, period: token };
  }
  if (hour === 0) return { hour24: 0, minute, period: "am" };
  if (hour > 12) return { hour24: hour, minute, period: "pm" };
  return { hour24: from12(hour, fallback), minute, period: fallback };
}

export function canonicalTimeText(parsed: ParsedTime): string {
  const { hour12, period } = to12(parsed.hour24);
  return `${hour12}:${String(parsed.minute).padStart(2, "0")} ${period.toUpperCase()}`;
}

export function applyPeriodToText(raw: string, period: Period): string {
  const parsed = parseTimeInput(raw, period);
  if (!parsed) return raw;
  const { hour12 } = to12(parsed.hour24);
  return `${hour12}:${String(parsed.minute).padStart(2, "0")} ${period.toUpperCase()}`;
}

export function relativeOffsetLabel(instant: Date, fromZone: string, toZone: string): string {
  const minutes = Math.round((offsetMs(instant, toZone) - offsetMs(instant, fromZone)) / 60000);
  if (minutes === 0) return "Same offset";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (mins) parts.push(`${mins} min`);
  return `${parts.join(" ")} ${minutes < 0 ? "behind" : "ahead"}`;
}

export function zoneSummary(face: ClockFace): string {
  const parts: string[] = [];
  if (face.abbr && face.abbr !== face.offsetLabel) parts.push(face.abbr);
  if (face.longName && face.longName !== face.abbr) parts.push(face.longName);
  if (face.offsetLabel && face.offsetLabel !== face.abbr) parts.push(face.offsetLabel);
  return parts.join(" · ");
}
