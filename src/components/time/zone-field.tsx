import { useId, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/lib/cn";
import { describeInstant } from "@/lib/time";
import { searchZones, zoneLabel } from "@/lib/zones";
import { ZONE_LIMIT } from "@/lib/meridian-state";

type Row = {
  id: string;
  city: string;
  region: string;
  abbr: string;
  enabled: boolean;
  note: string | null;
};

function buildRows(query: string, now: Date, local: string, saved: string[], mode: "add" | "select"): Row[] {
  return searchZones(query).map((id) => {
    const label = zoneLabel(id);
    const face = describeInstant(now, id, now, id);
    const added = saved.includes(id);
    const isLocal = id === local;
    let note: string | null = null;
    let enabled = true;
    if (mode === "add" && isLocal) {
      note = "Local";
      enabled = false;
    } else if (mode === "add" && added) {
      note = "Added";
      enabled = false;
    } else if (mode === "add" && saved.length >= ZONE_LIMIT) {
      note = "Full";
      enabled = false;
    }
    return { id, city: label.city, region: label.region, abbr: face.abbr, enabled, note };
  });
}

function ZoneList({
  rows,
  active,
  listId,
  onSelect,
}: {
  rows: Row[];
  active: number;
  listId: string;
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="px-2 py-3 text-sm text-muted">No matching zones.</p>;
  }
  return (
    <ul id={listId} role="listbox" className="max-h-64 overflow-auto">
      {rows.map((row, index) => (
        <li key={row.id} role="presentation">
          <button
            type="button"
            role="option"
            id={`${listId}-${index}`}
            aria-selected={index === active}
            aria-disabled={!row.enabled}
            disabled={!row.enabled}
            className={cn(
              "flex h-11 w-full items-center justify-between gap-3 rounded-sm px-2 text-left",
              index === active && row.enabled ? "bg-bg" : "",
              row.enabled ? "text-fg" : "text-subtle",
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(row.id)}
          >
            <span className="min-w-0 truncate">
              <span className="font-medium">{row.city}</span>
              <span className="text-muted"> · {row.region}</span>
            </span>
            <span className="shrink-0 text-sm text-muted">{row.note ?? row.abbr}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function nextEnabled(rows: Row[], from: number, direction: 1 | -1): number {
  for (let step = 1; step <= rows.length; step += 1) {
    const index = (from + direction * step + rows.length) % rows.length;
    if (rows[index]?.enabled) return index;
  }
  return from;
}

export function ZoneSelect({
  label,
  value,
  now,
  onChange,
}: {
  label: string;
  value: string;
  now: Date;
  onChange: (zone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const labelId = useId();
  const rows = open ? buildRows(query, now, "", [], "select") : [];
  const safeActive = rows.length === 0 ? 0 : Math.min(active, rows.length - 1);
  const highlighted = rows[safeActive]?.enabled ? safeActive : rows.findIndex((row) => row.enabled);
  const current = zoneLabel(value);
  const currentFace = describeInstant(now, value, now, value);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(nextEnabled(rows, Math.max(highlighted, 0), 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(nextEnabled(rows, Math.max(highlighted, 0), -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[highlighted];
      if (row?.enabled) choose(row.id);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium text-muted">
        {label}
      </span>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setQuery("");
            setActive(0);
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className="press motion-colors flex h-11 w-full items-center justify-between gap-3 rounded-sm border border-border bg-bg px-3 text-left"
            aria-labelledby={labelId}
          >
            <span className="min-w-0 truncate font-medium">{current.city}</span>
            <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
              {currentFace.abbr.toLowerCase() === current.city.toLowerCase() ? null : (
                <span>{currentFace.abbr}</span>
              )}
              <ChevronDown aria-hidden="true" className="size-4" />
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="menu-pop panel-shadow z-30 rounded-lg border border-border bg-elevated p-3"
            style={{ width: "var(--radix-popover-trigger-width)" }}
            sideOffset={8}
            align="start"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              const input = document.getElementById(`${listId}-search`);
              input?.focus();
            }}
          >
            <input
              id={`${listId}-search`}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={rows[highlighted] ? `${listId}-${highlighted}` : undefined}
              value={query}
              placeholder="Search cities"
              className="mb-2 h-11 w-full rounded-sm border border-border bg-bg px-3 text-base text-fg placeholder:text-subtle"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
            <ZoneList rows={rows} active={Math.max(highlighted, 0)} listId={listId} onSelect={choose} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

export function ZoneAdd({
  now,
  local,
  saved,
  onAdd,
}: {
  now: Date;
  local: string;
  saved: string[];
  onAdd: (zone: string) => string | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const listId = useId();
  const inputId = useId();
  const rows = open ? buildRows(query, now, local, saved, "add") : [];
  const safeActive = rows.length === 0 ? 0 : Math.min(active, rows.length - 1);
  const highlighted = rows[safeActive]?.enabled ? safeActive : rows.findIndex((row) => row.enabled);

  function choose(id: string) {
    const message = onAdd(id);
    setNote(message);
    if (!message) {
      setQuery("");
      setOpen(false);
    }
  }

  function onAddKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) setOpen(true);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(nextEnabled(rows, Math.max(highlighted, 0), 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(nextEnabled(rows, Math.max(highlighted, 0), -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[highlighted];
      if (row?.enabled) choose(row.id);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-elevated p-3">
      <label htmlFor={inputId} className="text-sm font-medium text-muted">
        Add a zone
      </label>
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[highlighted] ? `${listId}-${highlighted}` : undefined}
        value={query}
        placeholder="Search cities"
        className="h-11 w-full rounded-sm border border-border bg-bg px-3 text-base text-fg placeholder:text-subtle"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setNote(null);
          setOpen(true);
        }}
        onKeyDown={onAddKeyDown}
      />
      {open ? <ZoneList rows={rows} active={Math.max(highlighted, 0)} listId={listId} onSelect={choose} /> : null}
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  );
}
