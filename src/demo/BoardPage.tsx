import React, { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { IssueCard } from "./IssueCard";

import type { EntityBase } from "../components/EntityPicker";
import { EntityPicker } from "../components/EntityPicker";
import { EntityMultiPicker } from "../components/EntityMultiPicker";
import type { Person } from "../data/mockPeople";
import { getPeopleDataset, searchPeople } from "../demo/search";
import { buildPersonIndex } from "../data/peopleIndex";

import { DroppableColumn } from "../jira/DroppableColumn";

import { useIssues, useBatchPatchIssues } from "../api/jira.queries";

// Types
import type { IssueStatus, Issue } from "../api/jira.types";

// UI store (Zustand) is now UI-only (selected/draft actions)
import { useJiraStore } from "./jiraStore";

type PersonEntity = EntityBase & { raw: Person };

const STATUSES: Array<{ key: IssueStatus; title: string }> = [
  { key: "backlog", title: "Backlog" },
  { key: "todo", title: "To do" },
  { key: "in_progress", title: "In progress" },
  { key: "done", title: "Done" },
];

function SortableIssue(props: { issue: Issue; onOpen: () => void }) {
  const { issue } = props;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: issue.id,
    data: { status: issue.status },
  });

  const style = useMemo<React.CSSProperties>(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [transform, transition],
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-60" : ""}
    >
      <IssueCard
        issue={issue}
        onOpen={props.onOpen}
        dragHandleProps={{ listeners, attributes }}
      />
    </div>
  );
}

function parseDropStatus(id: string | null): IssueStatus | null {
  if (!id) return null;
  return id.startsWith("status:")
    ? (id.replace("status:", "") as IssueStatus)
    : null;
}

function normalizeOrders(list: Issue[]) {
  return list.slice().map((it, idx) => ({ ...it, order: (idx + 1) * 1000 }));
}

export function BoardPage() {
  const navigate = useNavigate();
  const params = useParams<{ boardId: string; sprintId?: string }>();

  const boardId = params.boardId ?? "";
  const sprintId = params.sprintId ?? null;

  const view: "backlog" | "sprint" = sprintId ? "sprint" : "backlog";

  // -----------------------
  // Server state (Query)
  // -----------------------
  const {
    data: issues = [],
    isLoading: issuesLoading,
    isError: issuesError,
    error: issuesErrorObj,
  } = useIssues(boardId, sprintId);

  const batchPatch = useBatchPatchIssues(boardId, sprintId);

  // -----------------------
  // UI state (Zustand)
  // -----------------------
  const selectedIssueId = useJiraStore((s) => s.selectedIssueId);
  const draftIssue = useJiraStore((s) => s.draftIssue);

  const openIssue = useJiraStore((s) => s.openIssue);
  const closeIssue = useJiraStore((s) => s.closeIssue);

  const openNewIssue = useJiraStore((s) => s.openNewIssue);
  const updateDraft = useJiraStore((s) => s.updateDraft);
  const discardDraft = useJiraStore((s) => s.discardDraft);
  // const saveDraft = useJiraStore((s) => s.saveDraft);

  const sprints = useJiraStore((s) => s.sprints);
  const activeSprint = useMemo(
    () => sprints.find((sp) => sp.boardId === boardId && sp.isActive) ?? null,
    [sprints, boardId],
  );

  // -----------------------
  // DnD sensors + overlay
  // -----------------------
  const [activeId, setActiveId] = useState<string | null>(null);

  const lastOverIdRef = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // -----------------------
  // Derived
  // -----------------------
  const scopedIssues = useMemo(() => {
    return issues.slice().sort((a, b) => a.order - b.order);
  }, [issues]);

  const selectedIssue = useMemo(() => {
    if (!selectedIssueId) return null;
    return scopedIssues.find((x) => x.id === selectedIssueId) ?? null;
  }, [scopedIssues, selectedIssueId]);

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

  const canShowStatus = (s: IssueStatus) =>
    view === "backlog" ? s === "backlog" : s !== "backlog";

  // -----------------------
  // People (rehydration)
  // -----------------------
  const useBig = true;
  const personIndex = useMemo(() => {
    const data = getPeopleDataset(useBig);
    return buildPersonIndex(data);
  }, [useBig]);

  const toPersonEntity = useCallback(
    (id: string | number): PersonEntity => {
      const p = personIndex.byId.get(String(id));
      if (!p) {
        return {
          id,
          label: `User ${String(id)}`,
          subLabel: undefined,
          raw: {
            id: Number(id),
            fullName: `User ${String(id)}`,
            email: undefined,
          },
        };
      }
      return { id: p.id, label: p.fullName, subLabel: p.email, raw: p };
    },
    [personIndex],
  );

  const draftWatchersEntities = useMemo(
    () => (draftIssue?.watcherIds ?? []).map(toPersonEntity),
    [draftIssue?.watcherIds, toPersonEntity],
  );

  const draftAssigneeEntity = useMemo(() => {
    const id = draftIssue?.assigneeId;
    return id == null ? null : toPersonEntity(id);
  }, [draftIssue?.assigneeId, toPersonEntity]);

  const mapPerson = (p: Person): PersonEntity => ({
    id: p.id,
    label: p.fullName,
    subLabel: p.email,
    raw: p,
  });

  const search = async (
    q: string,
    signal?: AbortSignal,
  ): Promise<PersonEntity[]> => {
    const res = await searchPeople(q, signal, true);
    return res.map(mapPerson);
  };

  // -----------------------
  // Header actions
  // -----------------------
  function onBack() {
    navigate("/boards");
  }

  function onBacklog() {
    navigate(`/boards/${boardId}/backlog`);
  }

  function onSprint() {
    if (activeSprint) navigate(`/boards/${boardId}/sprints/${activeSprint.id}`);
    else navigate(`/boards/${boardId}/backlog`);
  }

  function onNewIssue() {
    const seedStatus: IssueStatus = view === "backlog" ? "backlog" : "todo";
    openNewIssue({ boardId, sprintId, status: seedStatus });
  }

  // -----------------------
  // DnD handlers
  // -----------------------
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
    const oId = e.over?.id ? String(e.over.id) : null;

    setActiveId(null);
    if (!oId) return;

    const active = scopedIssues.find((x) => x.id === aId);
    if (!active) return;

    // destination status: column id OR issue id
    const overIssue = scopedIssues.find((x) => x.id === oId) ?? null;

    let toStatus = parseDropStatus(oId);
    if (!toStatus) toStatus = overIssue?.status ?? null;
    if (!toStatus) return;

    if (!canShowStatus(toStatus)) return;

    const fromStatus = active.status;

    // column lists (already scoped by query)
    const fromList = scopedIssues
      .filter((i) => i.status === fromStatus)
      .slice()
      .sort((a, b) => a.order - b.order);

    const toList = scopedIssues
      .filter((i) => i.status === toStatus)
      .slice()
      .sort((a, b) => a.order - b.order);

    // SAME COLUMN: pure reorder
    if (fromStatus === toStatus) {
      if (!overIssue) return;

      const list = scopedIssues
        .filter((i) => i.status === fromStatus)
        .slice()
        .sort((a, b) => a.order - b.order);

      const oldIndex = list.findIndex((x) => x.id === aId);
      const newIndex = list.findIndex((x) => x.id === overIssue.id);

      // If we can’t resolve indexes or nothing moved → bail
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

      const next = arrayMove(list, oldIndex, newIndex);
      const normalized = normalizeOrders(next);

      const changes = normalized.map((it) => ({
        id: it.id,
        patch: { order: it.order },
      }));

      batchPatch.mutate(changes);
      return;
    }

    // CROSS COLUMN: remove + insert
    const fromWithout = fromList.filter((x) => x.id !== aId);
    const moved: Issue = { ...active, status: toStatus };

    const toNext = toList.filter((x) => x.id !== aId);

    const insertAt = overIssue
      ? Math.max(
          0,
          toNext.findIndex((x) => x.id === overIssue.id),
        )
      : toNext.length;

    if (insertAt >= 0 && insertAt <= toNext.length) {
      toNext.splice(insertAt, 0, moved);
    } else {
      toNext.push(moved);
    }

    const normalizedTo = normalizeOrders(toNext);
    const normalizedFrom = normalizeOrders(fromWithout);

    const changes: Array<{ id: string; patch: Partial<Issue> }> = [
      ...normalizedTo.map((it) => ({
        id: it.id,
        patch: { status: it.status, order: it.order },
      })),
      ...normalizedFrom.map((it) => ({
        id: it.id,
        patch: { order: it.order },
      })),
    ];

    batchPatch.mutate(changes);
  };

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-white">
      <div className="w-full px-6 py-8 2xl:px-10">
        {/* Top bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-white/50">{boardId}</div>
            <div className="text-3xl font-semibold tracking-tight">Board</div>
            <div className="mt-1 text-sm text-white/60">
              View: {view === "backlog" ? "Backlog" : "Sprint board"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              ← Boards
            </button>

            <button
              type="button"
              onClick={onBacklog}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              Backlog
            </button>

            <button
              type="button"
              onClick={onSprint}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              Sprint
            </button>

            <button
              type="button"
              onClick={onNewIssue}
              className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            >
              + New issue
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_420px] lg:items-start">
          {/* Board columns */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 text-sm text-white/60">
              {view === "backlog" ? "Backlog" : "Sprint board"}
            </div>

            {issuesLoading ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                Loading issues…
              </div>
            ) : issuesError ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                Failed to load issues:{" "}
                {String((issuesErrorObj as Error)?.message ?? "")}
              </div>
            ) : (
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
                  {STATUSES.filter((s) => canShowStatus(s.key)).map((col) => {
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
                          {colIssues.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-white/10 p-3 text-sm text-white/40">
                              No issues
                            </div>
                          ) : (
                            colIssues.map((it) => (
                              <SortableIssue
                                key={it.id}
                                issue={it}
                                onOpen={() => openIssue(it.id)}
                              />
                            ))
                          )}
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
            )}

            {batchPatch.isPending ? (
              <div className="mt-3 text-xs text-white/50">Saving…</div>
            ) : null}
          </div>

          {/* Right panel: Draft OR Details */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 overflow-visible">
            {/* keep your right panel exactly as you had it */}
            {/* ... unchanged ... */}
            {draftIssue ? (
              <>
                <div className="text-xs text-white/50">New issue</div>
                <div className="mt-1 text-xl font-semibold">Draft</div>

                <div className="mt-4 grid gap-5">
                  <div>
                    <div className="mb-1 text-sm text-white/70">Title *</div>
                    <input
                      value={draftIssue.title}
                      onChange={(e) => updateDraft({ title: e.target.value })}
                      placeholder="Short summary"
                      className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/25"
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-sm text-white/70">
                      Description
                    </div>
                    <textarea
                      value={draftIssue.description}
                      onChange={(e) =>
                        updateDraft({ description: e.target.value })
                      }
                      placeholder="Details (optional)"
                      rows={6}
                      className="w-full resize-none rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/25"
                    />
                  </div>

                  <div className="grid gap-4">
                    <div className="w-full">
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="text-sm text-white/80">Assignee</div>

                        <button
                          type="button"
                          disabled={draftIssue.assigneeId == null}
                          onClick={() => updateDraft({ assigneeId: null })}
                          className={[
                            "min-w-[56px] rounded-lg px-2 py-1 text-xs",
                            draftIssue.assigneeId == null
                              ? "cursor-not-allowed text-white/30"
                              : "text-white/60 hover:bg-white/10 hover:text-white",
                          ].join(" ")}
                        >
                          Clear
                        </button>
                      </div>

                      <EntityPicker<PersonEntity>
                        hideClearButton
                        label=""
                        placeholder="Search people…"
                        value={draftAssigneeEntity}
                        onChange={(p) =>
                          updateDraft({ assigneeId: p?.id ?? null })
                        }
                        search={search}
                        minChars={2}
                        debounceMs={250}
                      />
                    </div>

                    <div className="w-full">
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="text-sm text-white/80">Watchers</div>

                        <button
                          type="button"
                          disabled={(draftIssue.watcherIds?.length ?? 0) === 0}
                          onClick={() => updateDraft({ watcherIds: [] })}
                          className={[
                            "min-w-[56px] rounded-lg px-2 py-1 text-xs",
                            (draftIssue.watcherIds?.length ?? 0) === 0
                              ? "cursor-not-allowed text-white/30"
                              : "text-white/60 hover:bg-white/10 hover:text-white",
                          ].join(" ")}
                        >
                          Clear
                        </button>
                      </div>

                      <EntityMultiPicker<PersonEntity>
                        hideClearButton
                        label=""
                        placeholder="Search people…"
                        value={draftWatchersEntities}
                        onChange={(next) =>
                          updateDraft({ watcherIds: next.map((x) => x.id) })
                        }
                        search={search}
                        minChars={2}
                        debounceMs={250}
                        maxSelected={10}
                        virtualize
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={discardDraft}
                      className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      // onClick={saveDraft}
                      disabled={!draftIssue.title.trim()}
                      className={[
                        "rounded-xl border border-white/15 px-3 py-2 text-sm",
                        draftIssue.title.trim()
                          ? "bg-white/10 text-white hover:bg-white/15"
                          : "cursor-not-allowed bg-white/5 text-white/40",
                      ].join(" ")}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </>
            ) : selectedIssue ? (
              <>
                <div className="text-xs text-white/50">{selectedIssue.key}</div>
                <div className="mt-1 text-xl font-semibold">
                  {selectedIssue.title}
                </div>

                <div className="mt-4">
                  <div className="mb-1 text-sm text-white/70">Description</div>
                  <textarea
                    value={selectedIssue.description}
                    onChange={() => {}}
                    rows={8}
                    className="w-full resize-none rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                  />
                  <div className="mt-2 text-xs text-white/45">
                    (PR3) Save description to API with debounced mutation.
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeIssue}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <div className="text-white/70">
                Select an issue or create a new one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
