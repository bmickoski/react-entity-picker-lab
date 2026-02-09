import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Issue } from "../../domain/types";
import { SortableIssue } from "./SortableIssue";

export function VirtualIssueList(props: {
  issues: Issue[];
  onOpenIssue: (id: string) => void;

  // tuning
  estimateSize?: number; // px
  overscan?: number;
  maxHeightPx?: number; // scroll container height
}) {
  const {
    issues,
    onOpenIssue,
    estimateSize = 118,
    overscan = 8,
    maxHeightPx = 560,
  } = props;

  const parentRef = useRef<HTMLDivElement | null>(null);

  // keep ids stable
  const ids = useMemo(() => issues.map((x) => x.id), [issues]);

  const rowVirtualizer = useVirtualizer({
    count: issues.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  if (issues.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-3 text-sm text-white/40">
        No issues
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="overflow-auto pr-1"
      style={{ maxHeight: maxHeightPx }}
    >
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((vRow) => {
          const it = issues[vRow.index];
          if (!it) return null;

          return (
            <div
              key={it.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vRow.start}px)`,
                paddingBottom: 8,
              }}
            >
              <SortableIssue issue={it} onOpen={() => onOpenIssue(it.id)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { Issue };
