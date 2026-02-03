import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useDebouncedValue } from "./useDebouncedValue";

export type EntityBase = { id: string | number; label: string; subLabel?: string };

export type UseEntityMultiPickerArgs<T extends EntityBase> = {
  value: T[];
  onChange: (next: T[]) => void;

  search: (query: string, signal?: AbortSignal) => Promise<T[]>;

  minChars?: number;
  debounceMs?: number;
  maxSelected?: number;

  allowCreate?: boolean;
  onCreate?: (label: string) => Promise<T> | T;

  disabled?: boolean;
};

export function useEntityMultiPicker<T extends EntityBase>({
  value,
  onChange,
  search,
  minChars = 2,
  debounceMs = 250,
  maxSelected,
  allowCreate = false,
  onCreate,
  disabled = false,
}: UseEntityMultiPickerArgs<T>) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  const debounced = useDebouncedValue(input, debounceMs);

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // activeIndex is over "options" (create row + visible items)
  const [activeIndex, setActiveIndex] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  // ✅ track last query to avoid resetting activeIndex all the time
  const lastQueryRef = useRef<string>("");

  const selectedIds = useMemo(() => new Set(value.map((v) => String(v.id))), [value]);
  const canSelectMore = maxSelected == null ? true : value.length < maxSelected;

  const visibleItems = useMemo(
    () => items.filter((it) => !selectedIds.has(String(it.id))),
    [items, selectedIds]
  );

  const trimmed = input.trim();

  const alreadySelectedByLabel = useMemo(() => {
    const t = trimmed.toLowerCase();
    if (!t) return false;
    return value.some((v) => v.label.trim().toLowerCase() === t);
  }, [value, trimmed]);

  const canCreate =
    open &&
    allowCreate &&
    !!onCreate &&
    canSelectMore &&
    trimmed.length >= minChars &&
    !error &&
    !alreadySelectedByLabel &&
    visibleItems.length === 0;

  const hasCreateRow = canCreate;
  const totalOptions = visibleItems.length + (hasCreateRow ? 1 : 0);

  const resetResults = useCallback(() => {
    abortRef.current?.abort();
    setItems([]);
    setError(null);
    setLoading(false);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    if (!open) return;

    const q = debounced.trim();

    // IMPORTANT: when query becomes short, clear stale state
    if (q.length < minChars) {
      abortRef.current?.abort();
      setItems([]);
      setError(null);
      setLoading(false);
      setActiveIndex(0);
      lastQueryRef.current = q;
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const isNewQuery = q !== lastQueryRef.current;
    lastQueryRef.current = q;

    setLoading(true);
    setError(null);

    search(q, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setItems(res);

        // ✅ reset highlight only when query changes
        if (isNewQuery) setActiveIndex(0);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;

        setError("Failed to load results");
        setItems([]);
        setActiveIndex(0);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debounced, minChars, open, search]);

  function add(item: T) {
    if (!canSelectMore) return;
    if (selectedIds.has(String(item.id))) return;

    onChange([...value, item]);

    // optional: flash selected label
    setInput(item.label);
    window.setTimeout(() => setInput(""), 120);

    resetResults();
  }


  function removeById(id: string | number) {
    onChange(value.filter((v) => String(v.id) !== String(id)));
  }

  function clearAll() {
    onChange([]);
    setInput("");
    resetResults();
    setOpen(false);
  }

  async function createAndAdd() {
    if (!onCreate) return;
    if (!canSelectMore) return;

    const name = trimmed;
    if (!name) return;

    try {
      const created = await onCreate(name);
      add(created);
    } catch {
      setError("Failed to create");
    }
  }

  function getActiveOption() {
    if (hasCreateRow) {
      if (activeIndex === 0) return { type: "create" as const };
      const item = visibleItems[activeIndex - 1];
      return item ? { type: "item" as const, item } : { type: "none" as const };
    }

    const item = visibleItems[activeIndex];
    return item ? { type: "item" as const, item } : { type: "none" as const };
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (e.key === "Escape") {
      setOpen(false);
      return;
    }

    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }

    if (e.key === "Backspace" && input.trim() === "" && value.length > 0) {
      removeById(value[value.length - 1].id);
      return;
    }

    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(totalOptions - 1, 0)));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const opt = getActiveOption();

      if (opt.type === "create") {
        if (!loading) createAndAdd();
        return;
      }

      if (opt.type === "item") {
        add(opt.item);
        return;
      }
    }
  }

  const statusText = (() => {
    const q = input.trim();
    if (q.length < minChars) return `Type at least ${minChars} characters…`;
    if (!canSelectMore) return `Max selected (${maxSelected})`;
    if (loading) return "Loading…";
    if (error) return error;
    if (visibleItems.length === 0) return allowCreate ? "No results (you can create it)" : "No results";
    return `${visibleItems.length} result(s)`;
  })();

  return {
    open,
    input,
    loading,
    error,
    activeIndex,

    trimmed,
    selectedIds,
    visibleItems,
    canSelectMore,
    canCreate,
    hasCreateRow,
    statusText,

    setOpen,
    setInput,
    setActiveIndex,

    add,
    removeById,
    clearAll,
    createAndAdd,

    onKeyDown,
    resetResults,
  };
}
