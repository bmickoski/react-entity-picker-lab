import { useCallback, useMemo, useState } from "react";
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
import { useJiraStore, type IssueStatus, type Issue } from "./jiraStore";
import { buildPersonIndex } from "../data/peopleIndex";
import { DroppableColumn } from "../jira/DroppableColumn";

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
  // Stable step spacing (easy re-normalize, avoids float drift)
  return list.map((it, idx) => ({ ...it, order: (idx + 1) * 1000 }));
}

export function BoardPage() {
  const navigate = useNavigate();
  const params = useParams<{ boardId: string; sprintId?: string }>();

  const boardId = params.boardId ?? "";
  const sprintId = params.sprintId ?? null;
  const view: "backlog" | "sprint" = sprintId ? "sprint" : "backlog";

  // --- Store reads ---
  const issues = useJiraStore((s) => s.issues);
  const sprints = useJiraStore((s) => s.sprints);

  const selectedIssueId = useJiraStore((s) => s.selectedIssueId);
  const draftIssue = useJiraStore((s) => s.draftIssue);

  const openIssue = useJiraStore((s) => s.openIssue);
  const closeIssue = useJiraStore((s) => s.closeIssue);

  const openNewIssue = useJiraStore((s) => s.openNewIssue);
  const updateDraft = useJiraStore((s) => s.updateDraft);
  const discardDraft = useJiraStore((s) => s.discardDraft);
  const saveDraft = useJiraStore((s) => s.saveDraft);

  const updateIssue = useJiraStore((s) => s.updateIssue);
  const applyIssueChanges = useJiraStore((s) => s.applyIssueChanges);

  // --- DnD state ---
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // --- Derived ---
  const activeSprint = useMemo(
    () => sprints.find((sp) => sp.boardId === boardId && sp.isActive) ?? null,
    [sprints, boardId],
  );

  const scopedIssues = useMemo(() => {
    return issues
      .filter(
        (i) =>
          i.boardId === boardId &&
          (view === "backlog" ? i.sprintId == null : i.sprintId === sprintId),
      )
      .slice()
      .sort((a, b) => a.order - b.order);
  }, [issues, boardId, sprintId, view]);

  const selectedIssue = useMemo(
    () =>
      selectedIssueId
        ? (issues.find((x) => x.id === selectedIssueId) ?? null)
        : null,
    [issues, selectedIssueId],
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

  const canShowStatus = (s: IssueStatus) =>
    view === "backlog" ? s === "backlog" : s !== "backlog";

  // --- People (rehydration) ---
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

  // --- Header actions ---
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

  // --- DnD handlers (IMPORTANT: no list projection during drag) ---
  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const aId = String(e.active.id);
    const oId = e.over?.id ? String(e.over.id) : null;

    setActiveId(null);
    if (!oId) return;

    const active = scopedIssues.find((x) => x.id === aId);
    if (!active) return;

    // target status can be column OR issue
    let targetStatus = parseDropStatus(oId);
    const overIssue = scopedIssues.find((x) => x.id === oId) ?? null;
    if (!targetStatus) targetStatus = overIssue?.status ?? null;
    if (!targetStatus) return;

    // view guards
    if (!canShowStatus(targetStatus)) return;

    const from = active.status;
    const to = targetStatus;

    const fromList = issuesByStatus[from].slice();
    const toList = issuesByStatus[to].slice();

    // remove active from lists
    const fromWithout = fromList.filter((x) => x.id !== aId);
    let toNext = toList.filter((x) => x.id !== aId);

    // moved issue (status changes when crossing columns)
    const moved: Issue = { ...active, status: to };

    // insert into target
    if (overIssue && overIssue.status === to) {
      const overIdx = toNext.findIndex((x) => x.id === overIssue.id);
      const insertAt = overIdx < 0 ? toNext.length : overIdx;
      toNext.splice(insertAt, 0, moved);
    } else {
      toNext.push(moved);
    }

    // same-column reorder
    if (from === to && overIssue) {
      const oldIndex = toNext.findIndex((x) => x.id === aId);
      const newIndex = toNext.findIndex((x) => x.id === overIssue.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        toNext = arrayMove(toNext, oldIndex, newIndex);
      }
    }

    const normalizedTo = normalizeOrders(toNext);
    const normalizedFrom = from === to ? [] : normalizeOrders(fromWithout);

    const changes: Array<{ id: string; patch: Partial<Issue> }> = [];

    for (const it of normalizedTo) {
      changes.push({
        id: it.id,
        patch: { status: it.status, order: it.order },
      });
    }
    for (const it of normalizedFrom) {
      changes.push({ id: it.id, patch: { order: it.order } });
    }

    applyIssueChanges(changes);
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
              {view === "sprint" && activeSprint ? (
                <span className="ml-2 text-white/40">
                  • {activeSprint.name}
                </span>
              ) : null}
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

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragCancel={() => setActiveId(null)}
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

              {/* Smooth drag without mutating lists during drag */}
              <DragOverlay>
                {activeIssue ? (
                  <div className="w-[320px]">
                    <IssueCard issue={activeIssue} onOpen={() => {}} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          {/* Right panel: Draft OR Details */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 overflow-visible">
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

                  {/* Assignee + Watchers */}
                  <div className="grid gap-4">
                    {/* Assignee */}
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

                    {/* Watchers */}
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
                      onClick={saveDraft}
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
                    onChange={(e) =>
                      updateIssue(selectedIssue.id, {
                        description: e.target.value,
                      })
                    }
                    rows={8}
                    className="w-full resize-none rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                  />
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
