import { isValidZone, type Period } from "./time";

export type Saved = {
  zones: string[];
  sourceZone: string;
  timeText: string;
  period: Period;
  date: string;
};

const KEY = "time-converter-v1";
const SEED = ["America/New_York", "Europe/London", "Asia/Tokyo", "Australia/Sydney"];

export const ZONE_LIMIT = 16;

export function defaultSaved(local: string): Saved {
  return {
    zones: SEED.filter((zone) => zone !== local && isValidZone(zone)),
    sourceZone: "UTC",
    timeText: "1:00 AM",
    period: "am",
    date: "",
  };
}

export function readSaved(local: string): Saved {
  const fallback = defaultSaved(local);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<Saved>;
    const incoming = Array.isArray(data.zones) ? data.zones : fallback.zones;
    const zones: string[] = [];
    for (const zone of incoming) {
      if (typeof zone !== "string" || zone === local || !isValidZone(zone) || zones.includes(zone)) continue;
      zones.push(zone);
      if (zones.length >= ZONE_LIMIT) break;
    }
    return {
      zones,
      sourceZone:
        typeof data.sourceZone === "string" && isValidZone(data.sourceZone) ? data.sourceZone : "UTC",
      timeText: typeof data.timeText === "string" ? data.timeText.slice(0, 24) : fallback.timeText,
      period: data.period === "pm" ? "pm" : "am",
      date: typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : "",
    };
  } catch {
    return fallback;
  }
}

export function writeSaved(saved: Saved) {
  localStorage.setItem(KEY, JSON.stringify(saved));
}
