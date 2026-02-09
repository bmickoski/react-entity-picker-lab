import React, { useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

import {
  parseDropStatus,
  normalizeOrders,
  canShowStatus,
} from "../../domain/jira.utils";
import { DroppableColumn } from "./DroppableColumn";
import type { Issue, IssueStatus } from "../../domain/types";
import { IssueCard } from "./IssueCard";
import { VirtualIssueList } from "./VirtualIssueList";

const STATUSES: Array<{ key: IssueStatus; title: string }> = [
  { key: "backlog", title: "Backlog" },
  { key: "todo", title: "To do" },
  { key: "in_progress", title: "In progress" },
  { key: "done", title: "Done" },
];

export const BoardColumns = React.memo(function BoardColumns(props: {
  view: "backlog" | "sprint";
  issues: Issue[];
  onOpenIssue: (id: string) => void;
  onBatchPatch: (changes: Array<{ id: string; patch: Partial<Issue> }>) => void;
  isSaving?: boolean;
}) {
  const { view, issues, onOpenIssue, onBatchPatch, isSaving } = props;

  const [activeId, setActiveId] = useState<string | null>(null);
  const lastOverIdRef = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const scopedIssues = useMemo(
    () => issues.slice().sort((a, b) => a.order - b.order),
    [issues],
  );

  const issuesByStatus = useMemo(() => {
    const base: Record<IssueStatus, Issue[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      done: [],
    };
    for (const it of scopedIssues) base[it.status].push(it);
    for (const k of Object.keys(base) as IssueStatus[]) {
      base[k].sort((a, b) => a.order - b.order);
    }
    return base;
  }, [scopedIssues]);

  const activeIssue = useMemo(
    () =>
      activeId ? (scopedIssues.find((x) => x.id === activeId) ?? null) : null,
    [activeId, scopedIssues],
  );

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);
    lastOverIdRef.current = id;
  };

  const onDragOver = (e: DragOverEvent) => {
    if (e.over?.id) lastOverIdRef.current = String(e.over.id);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const aId = String(e.active.id);
    const rawOverId = e.over?.id ? String(e.over.id) : null;

    setActiveId(null);

    // If the pointer left the board, sometimes `over` is null.
    // We can optionally fall back to lastOverIdRef.
    const oId = rawOverId ?? lastOverIdRef.current;
    if (!oId) return;

    const active = scopedIssues.find((x) => x.id === aId);
    if (!active) return;

    // With virtualization, the "over issue" may not be mounted -> null.
    const overIssue = scopedIssues.find((x) => x.id === oId) ?? null;

    // Determine destination status from column id or over issue status
    let toStatus = parseDropStatus(oId);
    if (!toStatus) toStatus = overIssue?.status ?? null;
    if (!toStatus) return;

    if (!canShowStatus(view, toStatus)) return;

    const fromStatus = active.status;

    const fromList = scopedIssues
      .filter((i) => i.status === fromStatus)
      .slice()
      .sort((a, b) => a.order - b.order);

    const toList = scopedIssues
      .filter((i) => i.status === toStatus)
      .slice()
      .sort((a, b) => a.order - b.order);

    // SAME COLUMN reorder
    if (fromStatus === toStatus) {
      const list = fromList;
      const oldIndex = list.findIndex((x) => x.id === aId);
      if (oldIndex < 0) return;

      // If overIssue is missing (virtualized), treat "drop on column" as move to end
      const newIndex = overIssue
        ? list.findIndex((x) => x.id === overIssue.id)
        : list.length - 1;

      if (newIndex < 0 || oldIndex === newIndex) return;

      const next = arrayMove(list, oldIndex, newIndex);
      const normalized = normalizeOrders(next);

      onBatchPatch(
        normalized.map((it) => ({ id: it.id, patch: { order: it.order } })),
      );
      return;
    }

    // CROSS COLUMN move
    const fromWithout = fromList.filter((x) => x.id !== aId);
    const moved: Issue = { ...active, status: toStatus };

    const toNext = toList.filter((x) => x.id !== aId);

    // If we’re over an issue, insert before it.
    // If we’re over the column (or virtualized row not mounted), insert at end.
    const insertAt = overIssue
      ? Math.max(
          0,
          toNext.findIndex((x) => x.id === overIssue.id),
        )
      : toNext.length;

    if (insertAt >= 0 && insertAt <= toNext.length)
      toNext.splice(insertAt, 0, moved);
    else toNext.push(moved);

    const normalizedTo = normalizeOrders(toNext);
    const normalizedFrom = normalizeOrders(fromWithout);

    onBatchPatch([
      ...normalizedTo.map((it) => ({
        id: it.id,
        patch: { status: it.status, order: it.order },
      })),
      ...normalizedFrom.map((it) => ({
        id: it.id,
        patch: { order: it.order },
      })),
    ]);
  };

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragCancel={() => {
          setActiveId(null);
          lastOverIdRef.current = null;
        }}
        onDragEnd={onDragEnd}
      >
        <div className="grid gap-4 lg:grid-cols-4">
          {STATUSES.filter((s) => canShowStatus(view, s.key)).map((col) => {
            const colIssues = issuesByStatus[col.key];
            const ids = colIssues.map((x) => x.id);

            return (
              <DroppableColumn
                key={col.key}
                id={`status:${col.key}`}
                title={col.title}
                count={colIssues.length}
              >
                <SortableContext
                  items={ids}
                  strategy={verticalListSortingStrategy}
                >
                  <VirtualIssueList
                    issues={colIssues}
                    onOpenIssue={onOpenIssue}
                    estimateSize={118}
                    overscan={10}
                    maxHeightPx={560}
                  />
                </SortableContext>
              </DroppableColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeIssue ? (
            <div className="w-[320px]">
              <IssueCard issue={activeIssue} onOpen={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {isSaving ? (
        <div className="mt-3 text-xs text-white/50">Saving…</div>
      ) : null}
    </div>
  );
});
