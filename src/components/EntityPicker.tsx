import { useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

export type EntityBase = {
  id: string | number;
  label: string;
  subLabel?: string;
};

type Props<T extends EntityBase> = {
  label?: string;
  placeholder?: string;
  value: T | null;
  onChange: (next: T | null) => void;

  search: (query: string, signal?: AbortSignal) => Promise<T[]>;

  disabled?: boolean;
  debounceMs?: number;
  minChars?: number;
};

export function EntityPicker<T extends EntityBase>({
  label = "Select entity",
  placeholder = "Search…",
  value,
  onChange,
  search,
  disabled = false,
  debounceMs = 250,
  minChars = 2,
}: Props<T>) {
  const [open, setOpen] = useState(false);

  // query only (when open)
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, debounceMs);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const displayValue = useMemo(() => {
    return open ? query : (value?.label ?? "");
  }, [open, query, value?.label]);

  function close() {
    setOpen(false);
    setQuery("");
    setItems([]);
    setError(null);
    setLoading(false);
    setActiveIndex(0);
    abortRef.current?.abort();
  }

  function select(item: T) {
    onChange(item);
    close();
  }

  function clear() {
    onChange(null);
    close();
  }

  useEffect(() => {
    if (!open) return;

    const q = debounced.trim();
    if (q.length < minChars) {
      abortRef.current?.abort();
      setItems([]);
      setError(null);
      setLoading(false);
      setActiveIndex(0);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    search(q, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setItems(res);
        setActiveIndex(0);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Failed to load results");
        setItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, debounced, minChars, search]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === "Escape") {
      close();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) select(item);
    }
  }

  return (
    <div ref={containerRef} className="w-full">
      <div className="mb-1.5 text-sm text-white/80">{label}</div>

      <div className="flex gap-2">
        <input
          disabled={disabled}
          value={displayValue}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setOpen(true);
            setQuery(e.target.value);
          }}
          onKeyDown={onKeyDown}
          className={[
            "flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none",
            "placeholder:text-white/40",
            "focus:border-white/25",
            disabled ? "cursor-not-allowed opacity-60" : "",
          ].join(" ")}
        />

        <button
          type="button"
          disabled={disabled || !value}
          onClick={clear}
          className={[
            "rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80",
            "hover:bg-white/10 hover:text-white",
            disabled || !value
              ? "cursor-not-allowed opacity-60 hover:bg-transparent"
              : "cursor-pointer",
          ].join(" ")}
        >
          Clear
        </button>
      </div>

      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/60 backdrop-blur">
          <div className="border-b border-white/10 px-3 py-2 text-xs text-white/70">
            {query.trim().length < minChars
              ? `Type at least ${minChars} characters…`
              : loading
                ? "Loading…"
                : error
                  ? error
                  : items.length === 0
                    ? "No results"
                    : `${items.length} result(s)`}
          </div>

          <div className="max-h-56 overflow-auto">
            {items.map((it, idx) => (
              <div
                key={String(it.id)}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(it);
                }}
                className={[
                  "border-b border-white/10 px-3 py-2",
                  idx === activeIndex ? "bg-white/10" : "",
                  "cursor-pointer hover:bg-white/10",
                ].join(" ")}
              >
                <div className="text-sm text-white">{it.label}</div>
                {it.subLabel && (
                  <div className="text-xs text-white/60">{it.subLabel}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
