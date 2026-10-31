import { isValidZone } from "./time";

type ZoneInfo = {
  id: string;
  city: string;
  region: string;
  keywords?: string;
};

const CATALOG: ZoneInfo[] = [
  { id: "UTC", city: "UTC", region: "Coordinated Universal Time", keywords: "gmt zulu universal" },
  { id: "America/New_York", city: "New York", region: "United States", keywords: "eastern edt est new york nyc" },
  { id: "America/Chicago", city: "Chicago", region: "United States", keywords: "central cdt cst" },
  { id: "America/Denver", city: "Denver", region: "United States", keywords: "mountain mdt mst" },
  { id: "America/Phoenix", city: "Phoenix", region: "United States", keywords: "arizona mountain mst no daylight" },
  { id: "America/Los_Angeles", city: "Los Angeles", region: "United States", keywords: "pacific pdt pst la" },
  { id: "America/Anchorage", city: "Anchorage", region: "United States", keywords: "alaska akdt akst" },
  { id: "Pacific/Honolulu", city: "Honolulu", region: "United States", keywords: "hawaii hst" },
  { id: "America/Toronto", city: "Toronto", region: "Canada", keywords: "eastern edt est" },
  { id: "America/Vancouver", city: "Vancouver", region: "Canada", keywords: "pacific pdt pst" },
  { id: "America/Mexico_City", city: "Mexico City", region: "Mexico", keywords: "central" },
  { id: "America/Sao_Paulo", city: "Sao Paulo", region: "Brazil", keywords: "brasilia" },
  { id: "America/Argentina/Buenos_Aires", city: "Buenos Aires", region: "Argentina", keywords: "argentina" },
  { id: "Europe/London", city: "London", region: "United Kingdom", keywords: "gmt bst uk britain" },
  { id: "Europe/Dublin", city: "Dublin", region: "Ireland", keywords: "gmt ist" },
  { id: "Europe/Lisbon", city: "Lisbon", region: "Portugal", keywords: "west wet" },
  { id: "Europe/Paris", city: "Paris", region: "France", keywords: "cet cest central european" },
  { id: "Europe/Berlin", city: "Berlin", region: "Germany", keywords: "cet cest" },
  { id: "Europe/Madrid", city: "Madrid", region: "Spain", keywords: "cet cest" },
  { id: "Europe/Rome", city: "Rome", region: "Italy", keywords: "cet cest" },
  { id: "Europe/Amsterdam", city: "Amsterdam", region: "Netherlands", keywords: "cet cest" },
  { id: "Europe/Athens", city: "Athens", region: "Greece", keywords: "eet eest" },
  { id: "Europe/Istanbul", city: "Istanbul", region: "Turkiye", keywords: "turkey" },
  { id: "Europe/Moscow", city: "Moscow", region: "Russia", keywords: "msk" },
  { id: "Africa/Cairo", city: "Cairo", region: "Egypt", keywords: "eet" },
  { id: "Africa/Lagos", city: "Lagos", region: "Nigeria", keywords: "wat" },
  { id: "Africa/Johannesburg", city: "Johannesburg", region: "South Africa", keywords: "sast" },
  { id: "Asia/Dubai", city: "Dubai", region: "United Arab Emirates", keywords: "gulf gst" },
  { id: "Asia/Karachi", city: "Karachi", region: "Pakistan", keywords: "pkt" },
  { id: "Asia/Kolkata", city: "Kolkata", region: "India", keywords: "ist india mumbai delhi" },
  { id: "Asia/Kathmandu", city: "Kathmandu", region: "Nepal", keywords: "npt" },
  { id: "Asia/Dhaka", city: "Dhaka", region: "Bangladesh", keywords: "bst" },
  { id: "Asia/Bangkok", city: "Bangkok", region: "Thailand", keywords: "ict" },
  { id: "Asia/Singapore", city: "Singapore", region: "Singapore", keywords: "sgt" },
  { id: "Asia/Hong_Kong", city: "Hong Kong", region: "Hong Kong", keywords: "hkt" },
  { id: "Asia/Shanghai", city: "Shanghai", region: "China", keywords: "cst beijing" },
  { id: "Asia/Seoul", city: "Seoul", region: "South Korea", keywords: "kst" },
  { id: "Asia/Tokyo", city: "Tokyo", region: "Japan", keywords: "jst" },
  { id: "Australia/Perth", city: "Perth", region: "Australia", keywords: "awst" },
  { id: "Australia/Adelaide", city: "Adelaide", region: "Australia", keywords: "acst acdt" },
  { id: "Australia/Brisbane", city: "Brisbane", region: "Australia", keywords: "aest" },
  { id: "Australia/Sydney", city: "Sydney", region: "Australia", keywords: "aest aedt" },
  { id: "Pacific/Auckland", city: "Auckland", region: "New Zealand", keywords: "nzst nzdt" },
];

const byId = new Map(CATALOG.map((zone) => [zone.id, zone]));

let allCache: string[] | null = null;

export function allTimeZones(): string[] {
  if (allCache) return allCache;
  const found = Intl.supportedValuesOf("timeZone");
  allCache = found.includes("UTC") ? found : ["UTC", ...found];
  return allCache;
}

export function zoneLabel(id: string): { city: string; region: string } {
  const known = byId.get(id);
  if (known) return { city: known.city, region: known.region };
  if (id === "UTC") return { city: "UTC", region: "Coordinated Universal Time" };
  const parts = id.split("/");
  const city = (parts[parts.length - 1] ?? id).replace(/_/g, " ");
  const region = (parts[0] ?? "").replace(/_/g, " ");
  return { city, region };
}

export function searchZones(query: string, limit = 30): string[] {
  const popular = CATALOG.map((zone) => zone.id).filter((id) => isValidZone(id));
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return popular;
  const scored: { id: string; score: number }[] = [];
  for (const id of allTimeZones()) {
    if (!isValidZone(id)) continue;
    const label = zoneLabel(id);
    const keywords = byId.get(id)?.keywords ?? "";
    const city = label.city.toLowerCase();
    const region = label.region.toLowerCase();
    const idText = id.toLowerCase().replace(/_/g, " ");
    const hay = `${city} ${region} ${idText} ${keywords}`;
    if (!hay.includes(q)) continue;
    let score = byId.has(id) ? 4 : 0;
    if (city === q) score += 100;
    else if (city.startsWith(q)) score += 50;
    else if (city.includes(q)) score += 20;
    if (keywords.includes(q)) score += 16;
    if (region.includes(q)) score += 6;
    if (idText.includes(q)) score += 2;
    scored.push({ id, score });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, limit).map((item) => item.id);
}
