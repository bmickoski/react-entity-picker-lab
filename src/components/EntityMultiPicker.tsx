import { useEffect, useId, useMemo, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useEntityMultiPicker,
  type EntityBase,
} from "../hooks/useEntityMultiPicker";

type Props<T extends EntityBase> = {
  label?: string;
  placeholder?: string;

  allowCreate?: boolean;
  onCreate?: (label: string) => Promise<T> | T;

  value: T[];
  onChange: (next: T[]) => void;

  search: (query: string, signal?: AbortSignal) => Promise<T[]>;

  disabled?: boolean;
  debounceMs?: number;
  minChars?: number;
  maxSelected?: number;

  renderItem?: (item: T, isSelected: boolean) => React.ReactNode;

  virtualize?: boolean;
  maxListHeightPx?: number;
};

export function EntityMultiPicker<T extends EntityBase>({
  label = "Select entities",
  placeholder = "Search…",
  value,
  onChange,
  search,
  disabled = false,
  debounceMs = 250,
  minChars = 2,
  maxSelected,
  allowCreate = false,
  onCreate,
  renderItem,
  virtualize = false,
  maxListHeightPx = 240,
}: Props<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const listboxId = useId();
  const labelId = useId();

  const picker = useEntityMultiPicker<T>({
    value,
    onChange,
    search,
    disabled,
    debounceMs,
    minChars,
    maxSelected,
    allowCreate,
    onCreate,
  });

  // Track whether the last navigation was keyboard-driven
  const keyboardNavRef = useRef(false);

  const stopKeyboardMode = useCallback(() => {
    keyboardNavRef.current = false;
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === "Escape"
      ) {
        keyboardNavRef.current = true;
      }
      picker.onKeyDown(e);
    },
    [picker],
  );

  // Close on outside click
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) picker.setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [picker]);

  // Build unified options: [create?] + items
  const optionCount =
    picker.visibleItems.length + (picker.hasCreateRow ? 1 : 0);

  type Option =
    | { kind: "create"; key: string }
    | { kind: "item"; key: string; item: T; isSelected: boolean };

  const options: Option[] = useMemo(() => {
    const out: Option[] = [];
    if (picker.hasCreateRow) {
      out.push({ kind: "create", key: `create:${picker.trimmed}` });
    }
    for (const it of picker.visibleItems) {
      out.push({
        kind: "item",
        key: `item:${String(it.id)}`,
        item: it,
        isSelected: picker.selectedIds.has(String(it.id)),
      });
    }
    return out;
  }, [picker.hasCreateRow, picker.trimmed, picker.visibleItems, picker.selectedIds]);

  // Virtualizer
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: optionCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });

  // Scroll active option into view ONLY when keyboard nav is happening
  useEffect(() => {
    if (!virtualize) return;
    if (!picker.open) return;
    if (!keyboardNavRef.current) return;
    if (optionCount <= 0) return;

    const idx = Math.max(0, Math.min(picker.activeIndex, optionCount - 1));
    rowVirtualizer.scrollToIndex(idx, { align: "auto" });
  }, [virtualize, picker.open, picker.activeIndex, optionCount, rowVirtualizer]);

  // After selecting, keep focus stable and avoid “laggy” feeling
  const finalizeSelectionFocus = useCallback(() => {
    keyboardNavRef.current = false;

    // “instant” feel: force repaint on some browsers
    inputRef.current?.blur();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  return (
    <div ref={containerRef} className="w-full">
      <div id={labelId} className="mb-1.5 text-sm text-white/80">
        {label}
      </div>

      {/* Input / chips */}
      <div
        role="combobox"
        aria-expanded={picker.open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-labelledby={labelId}
        className={[
          "flex flex-wrap items-center gap-2 rounded-xl border px-2 py-2",
          "border-white/15 bg-white/5",
          disabled ? "opacity-60" : "hover:border-white/25",
        ].join(" ")}
        onMouseDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          inputRef.current?.focus();
          picker.setOpen(true);
        }}
      >
        {value.map((v) => (
          <span
            key={String(v.id)}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-sm text-white"
          >
            <span>{v.label}</span>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => picker.removeById(v.id)}
              disabled={disabled}
              aria-label={`Remove ${v.label}`}
              className={[
                "inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/15",
                "text-white/70 hover:bg-white/10 hover:text-white",
                "leading-none",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              ].join(" ")}
            >
              <span className="relative -top-px text-sm leading-none">×</span>
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          disabled={disabled || !picker.canSelectMore}
          value={picker.input}
          placeholder={value.length === 0 ? placeholder : ""}
          onFocus={() => picker.setOpen(true)}
          onChange={(e) => {
            stopKeyboardMode();
            const next = e.target.value;
            picker.setInput(next);
            picker.setOpen(true);
            if (next.trim().length < minChars) picker.resetResults();
          }}
          onKeyDown={onKeyDown}
          aria-autocomplete="list"
          aria-controls={listboxId}
          className={[
            "min-w-[140px] flex-1 bg-transparent px-2 py-1 text-sm text-white outline-none",
            "placeholder:text-white/40",
            disabled || !picker.canSelectMore ? "cursor-not-allowed opacity-60" : "",
          ].join(" ")}
        />

        <button
          type="button"
          disabled={disabled || value.length === 0}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => picker.clearAll()}
          className={[
            "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/80",
            "hover:bg-white/10 hover:text-white",
            disabled || value.length === 0
              ? "cursor-not-allowed opacity-60 hover:bg-transparent"
              : "cursor-pointer",
          ].join(" ")}
        >
          Clear
        </button>
      </div>

      {/* Dropdown */}
      {picker.open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/60 backdrop-blur">
          <div className="border-b border-white/10 px-3 py-2 text-xs text-white/70">
            {picker.statusText}
          </div>

          {/* NON-VIRTUAL LIST */}
          {!virtualize && (
            <div
              id={listboxId}
              role="listbox"
              aria-labelledby={labelId}
              className="max-h-60 overflow-auto"
              onWheel={stopKeyboardMode}
              // ✅ improvement: no onMouseMove (too chatty). Pointer move is still optional; omit if you want.
              onPointerDown={stopKeyboardMode}
            >
              {picker.hasCreateRow && (
                <div
                  role="option"
                  aria-selected={picker.activeIndex === 0}
                  aria-disabled={picker.loading}
                  onMouseEnter={() => {
                    stopKeyboardMode();
                    picker.setActiveIndex(0);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    stopKeyboardMode();
                    if (!picker.loading) {
                      picker.createAndAdd();
                      finalizeSelectionFocus();
                    }
                  }}
                  className={[
                    "border-b border-white/10 px-3 py-2 font-semibold",
                    picker.activeIndex === 0 ? "bg-white/10" : "",
                    picker.loading
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer hover:bg-white/10",
                  ].join(" ")}
                >
                  Create “{picker.trimmed}”
                </div>
              )}

              {picker.visibleItems.map((it, idx) => {
                const uiIndex = picker.hasCreateRow ? idx + 1 : idx;
                const isActive = uiIndex === picker.activeIndex;
                const isSelected = picker.selectedIds.has(String(it.id));

                return (
                  <div
                    key={String(it.id)}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => {
                      stopKeyboardMode();
                      picker.setActiveIndex(uiIndex);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      stopKeyboardMode();
                      picker.add(it);
                      finalizeSelectionFocus();
                    }}
                    className={[
                      "border-b border-white/10 px-3 py-2",
                      isActive ? "bg-white/10" : "",
                      picker.canSelectMore
                        ? "cursor-pointer hover:bg-white/10"
                        : "cursor-not-allowed opacity-60",
                    ].join(" ")}
                  >
                    {renderItem ? (
                      renderItem(it, isSelected)
                    ) : (
                      <>
                        <div className="text-sm text-white">{it.label}</div>
                        {it.subLabel && (
                          <div className="text-xs text-white/60">{it.subLabel}</div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* VIRTUALIZED LIST */}
          {virtualize && (
            <div
              ref={parentRef}
              id={listboxId}
              role="listbox"
              aria-labelledby={labelId}
              className="overflow-auto"
              style={{ maxHeight: maxListHeightPx }}
              onWheel={stopKeyboardMode}
              onPointerDown={stopKeyboardMode}
            >
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: "relative",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((vRow) => {
                  const opt = options[vRow.index];
                  const isActive = vRow.index === picker.activeIndex;

                  return (
                    <div
                      key={opt?.key ?? vRow.key}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${vRow.start}px)`,
                      }}
                      className={[
                        "border-b border-white/10 px-3 py-2",
                        isActive ? "bg-white/10" : "",
                        opt?.kind === "create" ? "font-semibold" : "",
                        opt?.kind === "create"
                          ? picker.loading
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer hover:bg-white/10"
                          : picker.canSelectMore
                            ? "cursor-pointer hover:bg-white/10"
                            : "cursor-not-allowed opacity-60",
                      ].join(" ")}
                      role="option"
                      aria-selected={isActive}
                      aria-disabled={opt?.kind === "create" ? picker.loading : undefined}
                      onMouseEnter={() => {
                        stopKeyboardMode();
                        picker.setActiveIndex(vRow.index);
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        stopKeyboardMode();
                        if (!opt) return;

                        if (opt.kind === "create") {
                          if (!picker.loading) {
                            picker.createAndAdd();
                            finalizeSelectionFocus();
                          }
                          return;
                        }

                        picker.add(opt.item);
                        finalizeSelectionFocus();
                      }}
                    >
                      {!opt ? null : opt.kind === "create" ? (
                        <span>Create “{picker.trimmed}”</span>
                      ) : renderItem ? (
                        renderItem(opt.item, opt.isSelected)
                      ) : (
                        <>
                          <div className="text-sm text-white">{opt.item.label}</div>
                          {opt.item.subLabel && (
                            <div className="text-xs text-white/60">{opt.item.subLabel}</div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { EntityBase };
