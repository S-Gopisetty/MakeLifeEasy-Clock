import { useEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  readSaved,
  writeSaved,
  ZONE_LIMIT,
  type Saved,
} from "@/lib/meridian-state";
import {
  applyPeriodToText,
  canonicalTimeText,
  describeInstant,
  isoDateInZone,
  localZone,
  parseIsoDate,
  parseTimeInput,
  relativeOffsetLabel,
  wallTimeToInstant,
  zoneSummary,
  type ClockFace,
  type Period,
} from "@/lib/time";
import { zoneLabel } from "@/lib/zones";
import { ClockFigures, CompactTime, dstPhrase, PeriodMark } from "./bits";
import { ZoneAdd, ZoneSelect } from "./zone-field";

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto w-full max-w-lg px-4 py-6 sm:py-12">
        <div className="panel-shadow rounded-xl border border-border bg-surface p-3">{children}</div>
      </div>
    </main>
  );
}

function Skeleton({ back }: { back?: ReactNode }) {
  return (
    <Shell>
      <header className="px-1 pt-1 pb-3">
        {back ? <div className="mb-2">{back}</div> : null}
        <h1 className="text-xl font-semibold tracking-tight">Time converter</h1>
        <p className="text-sm text-muted">Local time, other zones, and daylight saving.</p>
      </header>
    </Shell>
  );
}

export function TimeConverter({ back }: { back?: ReactNode }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [home, setHome] = useState("UTC");
  const [now, setNow] = useState(() => new Date());
  const [tab, setTab] = useState<"clocks" | "convert">("clocks");
  const [overlap, setOverlap] = useState<"earlier" | "later">("earlier");

  useEffect(() => {
    const zone = localZone();
    setHome(zone);
    setSaved(readSaved(zone));
    let id = 0;
    const tick = () => setNow(new Date());
    const start = () => {
      window.clearInterval(id);
      tick();
      id = window.setInterval(tick, 1000);
    };
    const stop = () => window.clearInterval(id);
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (saved) writeSaved(saved);
  }, [saved]);

  const overlapKey = saved
    ? `${saved.sourceZone}|${saved.timeText}|${saved.period}|${saved.date}`
    : "";
  const [seenKey, setSeenKey] = useState(overlapKey);
  if (overlapKey !== seenKey) {
    setSeenKey(overlapKey);
    setOverlap("earlier");
  }

  if (!saved) return <Skeleton back={back} />;

  function patch(partial: Partial<Saved>) {
    setSaved((current) => (current ? { ...current, ...partial } : current));
  }

  function addZone(id: string): string | null {
    if (!saved) return null;
    if (id === home) return "That zone is already your local time.";
    const city = zoneLabel(id).city;
    if (saved.zones.includes(id)) return `${city} is already on the list.`;
    if (saved.zones.length >= ZONE_LIMIT) return "Remove one before adding another.";
    patch({ zones: [...saved.zones, id] });
    return null;
  }

  function removeZone(id: string) {
    if (!saved) return;
    patch({ zones: saved.zones.filter((zone) => zone !== id) });
  }

  return (
    <Shell>
      <header className="px-1 pt-1">
        {back ? <div className="mb-2">{back}</div> : null}
        <h1 className="text-xl font-semibold tracking-tight">Time converter</h1>
        <p className="text-sm text-muted">Local time, other zones, and daylight saving.</p>
      </header>
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-bg p-2" role="tablist" aria-label="Sections">
        <TabButton id="tab-clocks" controls="panel-clocks" selected={tab === "clocks"} onSelect={() => setTab("clocks")}>
          Clocks
        </TabButton>
        <TabButton id="tab-convert" controls="panel-convert" selected={tab === "convert"} onSelect={() => setTab("convert")}>
          Convert
        </TabButton>
      </div>
      <div className="pt-3">
        {tab === "clocks" ? (
          <div id="panel-clocks" role="tabpanel" aria-labelledby="tab-clocks">
            <Clocks
              now={now}
              home={home}
              zones={saved.zones}
              onAdd={addZone}
              onRemove={removeZone}
            />
          </div>
        ) : (
          <div id="panel-convert" role="tabpanel" aria-labelledby="tab-convert">
            <Convert
              now={now}
              home={home}
              saved={saved}
              overlap={overlap}
              onOverlap={setOverlap}
              onPatch={patch}
            />
          </div>
        )}
      </div>
      <p className="px-1 pt-3 text-sm text-subtle">Zones stay on this device.</p>
    </Shell>
  );
}

function TabButton({
  id,
  controls,
  selected,
  onSelect,
  children,
}: {
  id: string;
  controls: string;
  selected: boolean;
  onSelect: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="tab"
      aria-selected={selected}
      aria-controls={controls}
      className={cn(
        "press motion-colors h-11 rounded-md text-base font-medium",
        selected ? "bg-elevated text-fg" : "text-muted",
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

function Clocks({
  now,
  home,
  zones,
  onAdd,
  onRemove,
}: {
  now: Date;
  home: string;
  zones: string[];
  onAdd: (zone: string) => string | null;
  onRemove: (zone: string) => void;
}) {
  const face = describeInstant(now, home, now, home);
  const city = zoneLabel(home).city;
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg border border-border bg-elevated p-3" aria-labelledby="local-heading">
        <h2 id="local-heading" className="text-sm font-medium text-muted">
          Local
        </h2>
        <p className="mt-1 font-medium">{city}</p>
        <time dateTime={now.toISOString()} className="mt-2 block">
          <ClockFigures face={face} seconds />
        </time>
        <p className="mt-2 text-sm">{face.longDate}</p>
        <p className="text-sm text-muted">{zoneSummary(face)}</p>
        <p className="text-sm text-muted">{dstPhrase(face)}</p>
      </section>
      <ZoneAdd now={now} local={home} saved={zones} onAdd={onAdd} />
      {zones.length === 0 ? (
        <p className="rounded-lg border border-border bg-elevated px-3 py-4 text-sm text-muted">
          No other zones yet. Search for a city to pin it here.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-elevated">
          {zones.map((zone) => {
            const row = describeInstant(now, zone, now, home);
            const label = zoneLabel(zone);
            const meta = [
              row.relationDelta === 0 ? null : row.relation,
              row.abbr,
              row.observesDST ? (row.isDST ? "Daylight saving" : "Standard time") : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={zone} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{label.city}</p>
                  <p className="truncate text-sm text-muted">{meta}</p>
                </div>
                <CompactTime face={row} />
                <button
                  type="button"
                  className="press grid size-11 shrink-0 place-items-center rounded-sm text-muted hover:bg-bg hover:text-fg"
                  aria-label={`Remove ${label.city}`}
                  onClick={() => onRemove(zone)}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Convert({
  now,
  home,
  saved,
  overlap,
  onOverlap,
  onPatch,
}: {
  now: Date;
  home: string;
  saved: Saved;
  overlap: "earlier" | "later";
  onOverlap: (value: "earlier" | "later") => void;
  onPatch: (partial: Partial<Saved>) => void;
}) {
  const result = useMemo(() => {
    const parsed = parseTimeInput(saved.timeText, saved.period);
    if (!parsed) return { status: saved.timeText.trim() ? "bad-time" : "empty" } as const;
    const dateIso = saved.date || isoDateInZone(now, saved.sourceZone);
    const date = parseIsoDate(dateIso);
    if (!date) return { status: "bad-date" } as const;
    try {
      const hit = wallTimeToInstant(
        date.year,
        date.month,
        date.day,
        parsed.hour24,
        parsed.minute,
        saved.sourceZone,
        overlap,
      );
      return {
        status: "ok" as const,
        hit,
        requested: canonicalTimeText(parsed),
        localFace: describeInstant(hit.instant, home, now, home),
        sourceFace: describeInstant(hit.instant, saved.sourceZone, now, saved.sourceZone),
        dateIso,
      };
    } catch {
      return { status: "bad-zone" } as const;
    }
  }, [saved, now, home, overlap]);

  const dateValue = saved.date || isoDateInZone(now, saved.sourceZone);
  const sourceCity = zoneLabel(saved.sourceZone).city;

  function setPeriod(period: Period) {
    onPatch({
      period,
      timeText: saved.timeText.trim() ? applyPeriodToText(saved.timeText, period) : saved.timeText,
    });
  }

  const others =
    result.status === "ok"
      ? saved.zones
          .filter((zone) => zone !== home)
          .map((zone) => ({
            zone,
            face: describeInstant(result.hit.instant, zone, now, zone),
            shift: relativeOffsetLabel(result.hit.instant, saved.sourceZone, zone),
          }))
      : [];

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-4 rounded-lg border border-border bg-elevated p-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <ZoneSelect
          label="Time zone"
          value={saved.sourceZone}
          now={now}
          onChange={(sourceZone) => onPatch({ sourceZone })}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="wall-time" className="text-sm font-medium text-muted">
            Time
          </label>
          <input
            id="wall-time"
            value={saved.timeText}
            placeholder="1:00 AM"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={24}
            aria-invalid={result.status === "bad-time"}
            className="h-11 w-full rounded-sm border border-border bg-bg px-3 text-base text-fg placeholder:text-subtle"
            onChange={(event) => {
              const timeText = event.target.value;
              const parsed = parseTimeInput(timeText, saved.period);
              onPatch(parsed ? { timeText, period: parsed.period } : { timeText });
            }}
            onBlur={() => {
              const parsed = parseTimeInput(saved.timeText, saved.period);
              if (!parsed) return;
              onPatch({ timeText: canonicalTimeText(parsed), period: parsed.period });
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="AM or PM">
          <PeriodButton period="am" selected={saved.period === "am"} onSelect={setPeriod} />
          <PeriodButton period="pm" selected={saved.period === "pm"} onSelect={setPeriod} />
        </div>
        <div className="flex items-end gap-2">
          <label htmlFor="wall-date" className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="text-sm font-medium text-muted">Date in this zone</span>
            <input
              id="wall-date"
              type="date"
              value={dateValue}
              className="h-11 w-full min-w-0 rounded-sm border border-border bg-bg px-3 text-base text-fg"
              onChange={(event) => onPatch({ date: event.target.value })}
            />
          </label>
          {saved.date ? (
            <button
              type="button"
              className="press h-11 shrink-0 rounded-sm border border-border px-3 text-sm font-medium"
              onClick={() => onPatch({ date: "" })}
            >
              Today
            </button>
          ) : null}
        </div>
        <p className="text-sm text-muted">
          Type 1 AM, 1:30 PM, or 13:05. Daylight saving follows the zone on this date.
        </p>
        <button
          type="button"
          className="inline-flex h-11 items-center self-start text-sm font-medium text-accent"
          onClick={() => onPatch({ sourceZone: "UTC", timeText: "1:00 AM", period: "am", date: "" })}
        >
          Try 1:00 AM in UTC
        </button>
      </form>

      <section className="rounded-lg border border-border bg-elevated p-3" aria-live="polite">
        {result.status === "empty" ? (
          <p className="text-sm text-muted">Type a time to convert it.</p>
        ) : null}
        {result.status === "bad-time" ? (
          <p className="text-sm font-medium">Use a time like 1 AM, 1:30 PM, or 13:05.</p>
        ) : null}
        {result.status === "bad-date" || result.status === "bad-zone" ? (
          <p className="text-sm font-medium">That date or zone could not be converted.</p>
        ) : null}
        {result.status === "ok" ? (
          <Result
            home={home}
            sourceCity={sourceCity}
            sourceZone={saved.sourceZone}
            requested={result.requested}
            localFace={result.localFace}
            sourceFace={result.sourceFace}
            kind={result.hit.kind}
            overlap={overlap}
            onOverlap={onOverlap}
            shift={relativeOffsetLabel(result.hit.instant, saved.sourceZone, home)}
          />
        ) : null}
      </section>

      {others.length > 0 ? (
        <section aria-labelledby="also-heading">
          <h2 id="also-heading" className="px-1 pb-2 text-sm font-medium text-muted">
            Also in your zones
          </h2>
          <ul className="overflow-hidden rounded-lg border border-border bg-elevated">
            {others.map((item) => {
              const label = zoneLabel(item.zone);
              const meta = [item.face.relation, item.face.abbr, item.shift === "Same offset" ? null : item.shift]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={item.zone} className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{label.city}</p>
                    <p className="truncate text-sm text-muted">{meta}</p>
                  </div>
                  <CompactTime face={item.face} />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Result({
  home,
  sourceCity,
  sourceZone,
  requested,
  localFace,
  sourceFace,
  kind,
  overlap,
  onOverlap,
  shift,
}: {
  home: string;
  sourceCity: string;
  sourceZone: string;
  requested: string;
  localFace: ClockFace;
  sourceFace: ClockFace;
  kind: "exact" | "gap" | "overlap";
  overlap: "earlier" | "later";
  onOverlap: (value: "earlier" | "later") => void;
  shift: string;
}) {
  const homeCity = zoneLabel(home).city;
  const same = home === sourceZone;
  return (
    <div className="flex flex-col gap-3">
      {kind === "gap" ? (
        <p className="text-sm text-muted">
          {requested} does not occur in {sourceCity}. Clocks spring forward, so this uses {sourceFace.timeLabel}{" "}
          {sourceFace.period === "am" ? "AM" : "PM"} instead.
        </p>
      ) : null}
      {kind === "overlap" ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted">
            {requested} happens twice in {sourceCity} when daylight saving ends. Showing the{" "}
            {overlap === "earlier" ? "first" : "second"} one.
          </p>
          <button
            type="button"
            className="press h-11 rounded-sm border border-border px-3 text-sm font-medium"
            onClick={() => onOverlap(overlap === "earlier" ? "later" : "earlier")}
          >
            {overlap === "earlier" ? "Show the later time" : "Show the earlier time"}
          </button>
        </div>
      ) : null}
      <div>
        <h2 className="text-sm font-medium text-muted">Your time · {homeCity}</h2>
        {same ? <p className="mt-1 text-sm text-muted">This is your time zone.</p> : null}
        {!same ? (
          <p className="mt-1 text-sm text-muted">
            From {requested} · {sourceCity}
          </p>
        ) : null}
        <p className="mt-2 text-2xl font-medium tracking-tight">{localFace.relation}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <ClockFigures face={localFace} />
          <span className="text-xl font-medium">{localFace.abbr}</span>
        </div>
        <p className="mt-2 text-sm">{localFace.longDate}</p>
        <p className="text-sm text-muted">{zoneSummary(localFace)}</p>
        <p className="text-sm text-muted">
          {dstPhrase(localFace)}
          {same || shift === "Same offset" ? "" : ` · ${shift}`}
        </p>
      </div>
    </div>
  );
}

function PeriodButton({
  period,
  selected,
  onSelect,
}: {
  period: Period;
  selected: boolean;
  onSelect: (period: Period) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "press motion-colors flex h-11 items-center justify-center gap-2 rounded-sm font-medium",
        selected ? "bg-accent text-accent-fg" : "border border-border text-muted",
      )}
      onClick={() => onSelect(period)}
    >
      <PeriodMark period={period} />
    </button>
  );
}
