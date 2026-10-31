import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ClockFace, Period } from "@/lib/time";

export function PeriodMark({ period, large = false }: { period: Period; large?: boolean }) {
  const Icon = period === "am" ? Sun : Moon;
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", large ? "text-xl" : "text-sm")}>
      <Icon aria-hidden="true" className={large ? "size-8" : "size-4"} strokeWidth={1.75} />
      <span>{period === "am" ? "AM" : "PM"}</span>
    </span>
  );
}

export function ClockFigures({ face, seconds = false }: { face: ClockFace; seconds?: boolean }) {
  return (
    <div className="flex w-fit flex-wrap items-baseline gap-x-2 gap-y-1 text-fg">
      <span className="text-clock tabular-nums">{face.timeLabel}</span>
      {seconds ? (
        <span className="text-xl tabular-nums text-muted">:{String(face.second).padStart(2, "0")}</span>
      ) : null}
      <span className="text-accent">
        <PeriodMark period={face.period} large />
      </span>
    </div>
  );
}

export function CompactTime({ face }: { face: ClockFace }) {
  return (
    <p className="flex shrink-0 items-baseline gap-1.5 tabular-nums text-lg text-fg">
      <span>{face.timeLabel}</span>
      <span className="text-accent">
        <PeriodMark period={face.period} />
      </span>
    </p>
  );
}

export function dstPhrase(face: ClockFace): string {
  if (!face.observesDST) return "No daylight saving";
  return face.isDST ? "Daylight saving" : "Standard time";
}
