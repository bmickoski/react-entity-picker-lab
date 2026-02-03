import { useCallback, useEffect, useMemo, useState } from "react";
import type { Task, IssuePriority, IssueStatus } from "./taskboardTypes";

import { searchPeople, getPeopleDataset } from "./search";

import { EntityPicker, type EntityBase } from "../components/EntityPicker";
import { EntityMultiPicker } from "../components/EntityMultiPicker";
import type { Person } from "../data/mockPeople";
import { buildPersonIndex } from "../data/peopleIndex";
import { useTaskboardStore } from "./taskboardStore";
import { KanbanBoard } from "./KanbanBoard";

type PersonEntity = EntityBase & { raw: Person };

function nowIso() {
  return new Date().toISOString();
}

function makeInitialTasks(): Task[] {
  const now = nowIso();
  return [
    {
      id: "T-1001",
      title: "Add virtualization to user picker",
      description:
        "When results are huge, render only visible rows. Keep keyboard UX smooth.",
      status: "in_progress",
      priority: "high",
      labels: ["frontend", "performance"],
      assigneeId: null,
      watcherIds: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "T-1002",
      title: "Improve create-row UX",
      description:
        'Show "Create …" when no results match and minChars is satisfied.',
      status: "backlog",
      priority: "medium",
      labels: ["ux"],
      assigneeId: null,
      watcherIds: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "T-1003",
      title: "Ship Storybook catalog",
      description:
        "Document states: disabled, custom item renderer, maxSelected, big dataset.",
      status: "blocked",
      priority: "low",
      labels: ["docs"],
      assigneeId: null,
      watcherIds: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function getNextTaskId(): string {
  const KEY = "entity-picker-lab:nextTaskNumber";
  const current = Number(localStorage.getItem(KEY) ?? "1004");
  localStorage.setItem(KEY, String(current + 1));
  return `T-${current}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseLabels(raw: string): string[] {
  const parts = raw
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);

  // de-dupe (case-insensitive) while preserving casing of first occurrence
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function TaskBoard(props: {
  tasks: Task[];
  activeTask: Task | null;
  onSelectTask: (id: string) => void;
  virtualize: boolean;
  useBig: boolean;
}) {
  const tasks = props.tasks;

  const activeId = props.activeTask?.id ?? "";
  const activeTask = props.activeTask;

  const addTaskToStore = useTaskboardStore((s) => s.addTask);
  const updateTaskInStore = useTaskboardStore((s) => s.updateTask);
  const deleteTaskFromStore = useTaskboardStore((s) => s.deleteTask);
  const resetTasksInStore = useTaskboardStore((s) => s.resetTasks);

  // New task UI
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStatus, setNewStatus] = useState<IssueStatus>("backlog");
  const [newPriority, setNewPriority] = useState<IssuePriority>("medium");
  const [newLabels, setNewLabels] = useState("");

  const [undo, setUndo] = useState<{
    task: Task;
    index: number;
    prevActiveId: string | null;
  } | null>(null);

  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(t);
  }, [undo]);

  const mapPerson = useCallback((p: Person): PersonEntity => {
    return { id: p.id, label: p.fullName, subLabel: p.email, raw: p };
  }, []);

  const search = useCallback(
    async (q: string, signal?: AbortSignal): Promise<PersonEntity[]> => {
      const res = await searchPeople(q, signal, props.useBig);
      return res.map(mapPerson);
    },
    [mapPerson, props.useBig],
  );

  const personIndex = useMemo(() => {
    const data = getPeopleDataset(props.useBig);
    return buildPersonIndex(data);
  }, [props.useBig]);

  const toEntity = useCallback(
    (id: string | number): PersonEntity => {
      const p = personIndex.byId.get(String(id));
      if (p) return mapPerson(p);

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
    },
    [personIndex, mapPerson],
  );

  const assigneeEntity = useMemo<PersonEntity | null>(() => {
    const id = activeTask?.assigneeId;
    return id == null ? null : toEntity(id);
  }, [activeTask?.assigneeId, toEntity]);

  const watchersEntities = useMemo<PersonEntity[]>(() => {
    return (activeTask?.watcherIds ?? []).map(toEntity);
  }, [activeTask?.watcherIds, toEntity]);

  function updateTask(next: Partial<Task>) {
    const id = activeTask?.id;
    if (!id) return;
    updateTaskInStore(id, next);
  }

  function resetDemo() {
    const init = makeInitialTasks();
    resetTasksInStore(init);

    localStorage.setItem("entity-picker-lab:nextTaskNumber", "1004");

    setCreating(false);
    setNewTitle("");
    setNewDesc("");
    setNewStatus("backlog");
    setNewPriority("medium");
    setNewLabels("");

    if (init[0]) props.onSelectTask(init[0].id);
  }

  function addTask() {
    const title = newTitle.trim();
    if (!title) return;

    const now = nowIso();

    const task: Task = {
      id: getNextTaskId(),
      title,
      description: newDesc.trim() || "—",
      status: newStatus,
      priority: newPriority,
      labels: parseLabels(newLabels),
      assigneeId: null,
      watcherIds: [],
      createdAt: now,
      updatedAt: now,
    };

    addTaskToStore(task);
    props.onSelectTask(task.id);

    setCreating(false);
    setNewTitle("");
    setNewDesc("");
    setNewStatus("backlog");
    setNewPriority("medium");
    setNewLabels("");
  }

  function deleteTask(id: string) {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return;

    const task = tasks[idx];
    const next = tasks.filter((t) => t.id !== id);

    setUndo({
      task,
      index: idx,
      prevActiveId: props.activeTask?.id ?? null,
    });

    deleteTaskFromStore(id);

    if (props.activeTask?.id === id) {
      const fallback =
        next[idx]?.id ?? next[idx - 1]?.id ?? next[0]?.id ?? null;
      if (fallback) props.onSelectTask(fallback);
    }
  }

  function undoDelete() {
    if (!undo) return;

    // if already exists, ignore
    if (tasks.some((t) => t.id === undo.task.id)) {
      setUndo(null);
      return;
    }

    addTaskToStore(undo.task);
    props.onSelectTask(undo.task.id);
    setUndo(null);
  }

  const labelDraft = useMemo(() => {
    // show a user-editable string based on labels, not perfect but works
    return (activeTask?.labels ?? []).join(", ");
  }, [activeTask?.labels]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start">
      {/* Left rail */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm text-white/60">TaskBoard</div>
            <div className="text-lg font-semibold text-white">Assignments</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreating((v) => !v)}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              New task
            </button>

            <button
              type="button"
              onClick={resetDemo}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              Reset
            </button>
          </div>
        </div>

        {creating && (
          <div className="mb-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Task title"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40"
            />

            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Short description (optional)"
              rows={3}
              className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40"
            />

            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-white/60">
                Status
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as IssueStatus)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white outline-none"
                >
                  <option value="backlog">Backlog</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                </select>
              </label>

              <label className="text-xs text-white/60">
                Priority
                <select
                  value={newPriority}
                  onChange={(e) =>
                    setNewPriority(e.target.value as IssuePriority)
                  }
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>

            <label className="mt-2 block text-xs text-white/60">
              Labels (comma separated)
              <input
                value={newLabels}
                onChange={(e) => setNewLabels(e.target.value)}
                placeholder="frontend, ux, performance"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40"
              />
            </label>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={addTask}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {tasks.map((t) => {
            const active = t.id === activeId;

            return (
              <div
                key={t.id}
                className={[
                  "relative w-full rounded-xl border bg-black/20",
                  active
                    ? "border-white/25 bg-white/10"
                    : "border-white/10 hover:bg-white/5",
                ].join(" ")}
              >
                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => deleteTask(t.id)}
                  className="
                    absolute right-3 top-3 z-10
                    inline-flex h-8 w-8 items-center justify-center
                    rounded-lg border border-white/10 text-white/70
                    bg-black/20 hover:bg-black/60
                    hover:bg-white/10 hover:text-white
                    focus:outline-none focus:ring-2 focus:ring-white/20
                    "
                  aria-label={`Delete ${t.id}`}
                >
                  ✕
                </button>

                {/* Card content */}
                <button
                  type="button"
                  onClick={() => props.onSelectTask(t.id)}
                  className="
                    w-full rounded-lg px-3 py-3 pr-12 text-left
                    hover:bg-white/5
                    "
                >
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3 pr-8">
                    <div className="text-xs text-white/60">{t.id}</div>

                    <div className="text-xs text-white/50">
                      {t.watcherIds.length} watcher
                      {t.watcherIds.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="mt-1">
                    <div className="font-medium text-white">{t.title}</div>
                    <div className="mt-1 line-clamp-2 text-sm text-white/60">
                      {t.description}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                      {t.status?.replace("_", " ")}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                      {t.priority}
                    </span>
                    {t.labels?.slice(0, 2).map((l) => (
                      <span
                        key={l}
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5"
                      >
                        {l}
                      </span>
                    ))}
                    {t.labels?.length > 2 && (
                      <span className="text-white/40">+{t.labels?.length - 2}</span>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        {!activeTask ? (
          <div className="text-white/70">No tasks</div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm text-white/60">{activeTask.id}</div>

                <input
                  value={activeTask.title}
                  onChange={(e) => updateTask({ title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-2xl font-semibold text-white outline-none"
                />

                <textarea
                  value={activeTask.description}
                  onChange={(e) => updateTask({ description: e.target.value })}
                  rows={3}
                  className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none"
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                <div>Virtualize: {String(props.virtualize)}</div>
                <div>Dataset: {props.useBig ? "10,000" : "Small"}</div>
                <div>Persist: localStorage</div>
              </div>
            </div>

            {/* Board */}
            <div className="mt-6">
              <div className="mb-2 text-sm font-semibold text-white/90">
                Board
              </div>
              <KanbanBoard
                tasks={tasks}
                activeId={activeTask.id}
                onOpen={(id) => props.onSelectTask(id)}
              />
            </div>

            {/* Fields + pickers */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 text-sm font-semibold text-white">
                  Fields
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-white/60">
                    Status
                    <select
                      value={activeTask.status}
                      onChange={(e) =>
                        updateTask({ status: e.target.value as IssueStatus })
                      }
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white outline-none"
                    >
                      <option value="backlog">Backlog</option>
                      <option value="in_progress">In Progress</option>
                      <option value="blocked">Blocked</option>
                      <option value="done">Done</option>
                    </select>
                  </label>

                  <label className="text-xs text-white/60">
                    Priority
                    <select
                      value={activeTask.priority}
                      onChange={(e) =>
                        updateTask({ priority: e.target.value as IssuePriority })
                      }
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white outline-none"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                </div>

                <label className="mt-3 block text-xs text-white/60">
                  Labels (comma separated)
                  <input
                    defaultValue={labelDraft}
                    onBlur={(e) =>
                      updateTask({ labels: parseLabels(e.target.value) })
                    }
                    placeholder="frontend, ux, performance"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40"
                  />
                </label>

                <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-white/60">
                  <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                    <div className="text-white/50">Created</div>
                    <div className="mt-0.5">{activeTask.createdAt}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                    <div className="text-white/50">Updated</div>
                    <div className="mt-0.5">{activeTask.updatedAt}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 text-sm font-semibold text-white">
                  Assignee
                </div>

                <EntityPicker<PersonEntity>
                  label="Assign to"
                  placeholder="Search people…"
                  value={assigneeEntity}
                  onChange={(next) =>
                    updateTask({ assigneeId: next?.id ?? null })
                  }
                  search={search}
                  minChars={2}
                  debounceMs={250}
                />

                <div className="mt-3 text-xs text-white/60">
                  Tip: search “john”, “smith”, “emily”
                </div>

                <div className="mt-6 mb-3 text-sm font-semibold text-white">
                  Watchers
                </div>

                <EntityMultiPicker<PersonEntity>
                  virtualize={props.virtualize}
                  label="Add watchers"
                  placeholder="Search people…"
                  value={watchersEntities}
                  onChange={(next) =>
                    updateTask({ watcherIds: next.map((x) => x.id) })
                  }
                  search={search}
                  minChars={2}
                  debounceMs={250}
                  maxSelected={10}
                />

                <div className="mt-3 text-xs text-white/60">
                  Add watchers to show chip UX + virtualization.
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 text-sm font-semibold text-white/90">
                Task state
              </div>
              <pre className="overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/80">
                {JSON.stringify(activeTask, null, 2)}
              </pre>
            </div>
          </>
        )}
      </div>

      {/* Undo toast */}
      {undo && (
        <div className="fixed bottom-5 right-5 z-50 w-[340px] rounded-2xl border border-white/10 bg-neutral-950/80 p-4 text-sm text-white shadow-xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">Task deleted</div>
              <div className="mt-1 line-clamp-2 text-white/70">
                {undo.task.title}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setUndo(null)}
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={undoDelete}
              className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
