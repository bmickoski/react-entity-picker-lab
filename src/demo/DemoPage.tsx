import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { TaskBoard } from "./TaskBoard";
import type { Task } from "./taskboardTypes";

import type { Person } from "../data/mockPeople";
import { searchPeople, getPeopleDataset } from "./search";
import { buildPersonIndex } from "../data/peopleIndex";

import { EntityPicker, type EntityBase } from "../components/EntityPicker";
import { EntityMultiPicker } from "../components/EntityMultiPicker";
import { useSearchMetrics } from "./useSearchMetrics";

import { useTaskboardStore } from "./taskboardStore";

const ACTIVE_TASK_KEY = "entity-picker-lab:activeTaskId";

type PersonEntity = EntityBase & { raw: Person };

function makeInitialTasks(): Task[] {
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function DemoPage() {
  const navigate = useNavigate();
  const params = useParams<{ taskId?: string }>();

  // ---- Zustand state ----
  const tasks = useTaskboardStore((s) => s.tasks);
  const setTasks = useTaskboardStore((s) => s.setTasks);

  const virtualize = useTaskboardStore((s) => s.virtualize);
  const useBig = useTaskboardStore((s) => s.useBig);
  const showLab = useTaskboardStore((s) => s.showLab);

  const setVirtualize = useTaskboardStore((s) => s.setVirtualize);
  const setUseBig = useTaskboardStore((s) => s.setUseBig);
  const setShowLab = useTaskboardStore((s) => s.setShowLab);

  const debounceMs = useTaskboardStore((s) => s.debounceMs);
  const minChars = useTaskboardStore((s) => s.minChars);
  const maxSelected = useTaskboardStore((s) => s.maxSelected);

  const setDebounceMs = useTaskboardStore((s) => s.setDebounceMs);
  const setMinChars = useTaskboardStore((s) => s.setMinChars);
  const setMaxSelected = useTaskboardStore((s) => s.setMaxSelected);

  useEffect(() => {
    if (tasks.length === 0) setTasks(makeInitialTasks());
  }, [tasks.length, setTasks]);

  const tasksById = useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks],
  );
  const routeTaskId = params.taskId ?? null;
  const persistedTaskId = window.localStorage.getItem(ACTIVE_TASK_KEY);

  // ✅ stable metrics API (DO NOT depend on whole object)
  const {
    metrics,
    onStart,
    onSuccess,
    onAbort,
    reset: resetMetrics,
  } = useSearchMetrics();

  // ✅ URL wins → localStorage → first task
  useEffect(() => {
    const first = tasks[0]?.id ?? null;

    if (routeTaskId && !tasksById.has(routeTaskId)) {
      const fallback =
        persistedTaskId && tasksById.has(persistedTaskId)
          ? persistedTaskId
          : first;

      if (fallback) navigate(`/tasks/${fallback}`, { replace: true });
      return;
    }

    if (!routeTaskId) {
      const chosen =
        (persistedTaskId &&
          tasksById.has(persistedTaskId) &&
          persistedTaskId) ||
        first;

      if (chosen) navigate(`/tasks/${chosen}`, { replace: true });
    }
  }, [routeTaskId, tasksById, tasks, persistedTaskId, navigate]);

  const activeTask = useMemo(() => {
    if (!routeTaskId) return null;
    return tasksById.get(routeTaskId) ?? null;
  }, [routeTaskId, tasksById]);

  useEffect(() => {
    if (routeTaskId && tasksById.has(routeTaskId)) {
      window.localStorage.setItem(ACTIVE_TASK_KEY, routeTaskId);
    }
  }, [routeTaskId, tasksById]);

  const selectTask = useCallback(
    (id: string) => navigate(`/tasks/${id}`),
    [navigate],
  );

  // ---- Lab local state (not persisted) ----
  const [labAssignee, setLabAssignee] = useState<PersonEntity | null>(null);
  const [labWatchers, setLabWatchers] = useState<PersonEntity[]>([]);
  const [labDisabled, setLabDisabled] = useState<PersonEntity[]>([]);

  const mapPerson = useCallback((p: Person): PersonEntity => {
    return { id: p.id, label: p.fullName, subLabel: p.email, raw: p };
  }, []);

  const personIndex = useMemo(() => {
    const data = getPeopleDataset(useBig);
    return buildPersonIndex(data);
  }, [useBig]);

  const search = useCallback(
    async (q: string, signal?: AbortSignal): Promise<PersonEntity[]> => {
      onStart();
      try {
        const res = await searchPeople(q, signal, useBig);
        onSuccess(res.length);
        return res.map(mapPerson);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") onAbort();
        throw e;
      }
    },
    [useBig, mapPerson, onStart, onSuccess, onAbort],
  );

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-white">
      <div className="w-full px-6 py-8 2xl:px-10">
        <header className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">
                React Entity Picker Lab
              </h1>
              <p className="mt-2 text-white/70">
                Async search • debounce • abort • keyboard • multi-select chips
                • virtualization • Zustand
              </p>
              <div className="mt-2 text-sm text-white/60">
                Try searching: “john”, “smith”, “emily”, “miller”
              </div>

              {/* Metrics + reset */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                  <div>last: {metrics.lastMs ?? "—"}ms</div>
                  <div>count: {metrics.lastCount ?? "—"}</div>
                  <div>success: {metrics.success}</div>
                  <div>aborted: {metrics.aborted}</div>
                </div>

                <button
                  type="button"
                  onClick={resetMetrics}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white"
                >
                  Reset metrics
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setVirtualize((v) => !v)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
              >
                Virtualization: {virtualize ? "ON" : "OFF"}
              </button>

              <button
                type="button"
                onClick={() => setUseBig((v) => !v)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
              >
                Dataset: {useBig ? "10,000" : "Small"}
              </button>

              <button
                type="button"
                onClick={() => setShowLab((v) => !v)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
              >
                Lab: {showLab ? "Visible" : "Hidden"}
              </button>

              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                <div>Virtualize: {String(virtualize)}</div>
                <div>Dataset: {useBig ? "10,000" : "Small"}</div>
                <div>Persist: localStorage</div>
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-6">
          <TaskBoard
            tasks={tasks}
            activeTask={activeTask}
            onSelectTask={selectTask}
            virtualize={virtualize}
            useBig={useBig}
          />

          {showLab && (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-white/60">Component Lab</div>
                  <h2 className="mt-1 text-xl font-semibold text-white">
                    Knobs + stress tests
                  </h2>
                  <p className="mt-1 text-sm text-white/70">
                    Demonstrates behavior under constraints without cluttering
                    Taskboard.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                  <div>Virtualize: {String(virtualize)}</div>
                  <div>Dataset: {useBig ? "10,000" : "Small"}</div>
                  <div>
                    Index size: {personIndex.byId.size.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Knobs */}
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm font-semibold text-white">
                    Search knobs
                  </div>

                  <label className="block text-xs text-white/60">
                    Debounce: {debounceMs}ms
                  </label>
                  <input
                    type="range"
                    min={100}
                    max={700}
                    step={25}
                    value={debounceMs}
                    onChange={(e) =>
                      setDebounceMs(clamp(Number(e.target.value), 100, 700))
                    }
                    className="mt-2 w-full accent-white"
                  />

                  <label className="mt-4 block text-xs text-white/60">
                    minChars: {minChars}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={minChars}
                    onChange={(e) =>
                      setMinChars(clamp(Number(e.target.value), 1, 5))
                    }
                    className="mt-2 w-full accent-white"
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm font-semibold text-white">
                    Multi-select knobs
                  </div>

                  <label className="block text-xs text-white/60">
                    maxSelected: {maxSelected}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={15}
                    step={1}
                    value={maxSelected}
                    onChange={(e) =>
                      setMaxSelected(clamp(Number(e.target.value), 1, 15))
                    }
                    className="mt-2 w-full accent-white"
                  />

                  <div className="mt-4 text-xs text-white/60">
                    Try maxSelected=1 to stress chip UX.
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm font-semibold text-white">
                    Quick actions
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setLabAssignee(null);
                      setLabWatchers([]);
                      setLabDisabled([]);
                      resetMetrics();
                    }}
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    Reset Lab + metrics
                  </button>

                  <div className="mt-3 text-xs text-white/60">
                    Lab state is intentionally not persisted.
                  </div>
                </div>
              </div>

              {/* Demo pickers */}
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm font-semibold text-white">
                    Create-row + maxSelected
                  </div>

                  <EntityMultiPicker<PersonEntity>
                    virtualize={virtualize}
                    allowCreate
                    onCreate={(name) => ({
                      id: `new-${Date.now()}`,
                      label: name,
                      subLabel: "created locally",
                      raw: { id: -1, fullName: name, email: undefined },
                    })}
                    label="Watchers"
                    placeholder="Search people…"
                    value={labWatchers}
                    onChange={setLabWatchers}
                    search={search}
                    minChars={minChars}
                    debounceMs={debounceMs}
                    maxSelected={maxSelected}
                  />

                  <div className="mt-3 text-xs text-white/60">
                    Type a nonsense name to trigger “Create …”.
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm font-semibold text-white">
                    Single picker
                  </div>

                  <EntityPicker<PersonEntity>
                    label="Assignee"
                    placeholder="Search people…"
                    value={labAssignee}
                    onChange={setLabAssignee}
                    search={search}
                    minChars={minChars}
                    debounceMs={debounceMs}
                  />

                  <div className="mt-3 text-xs text-white/60">
                    Keyboard: ↑ ↓ Enter Esc
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm font-semibold text-white">
                    Disabled state
                  </div>

                  <EntityMultiPicker<PersonEntity>
                    virtualize={virtualize}
                    label="Disabled"
                    placeholder="Search people…"
                    value={labDisabled}
                    onChange={setLabDisabled}
                    search={search}
                    disabled
                    minChars={minChars}
                    debounceMs={debounceMs}
                    maxSelected={maxSelected}
                  />

                  <div className="mt-3 text-xs text-white/60">
                    Should not open / accept input.
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm font-semibold text-white">
                    Custom item renderer
                  </div>

                  <EntityMultiPicker<PersonEntity>
                    virtualize={virtualize}
                    label="Custom rows"
                    placeholder="Search people…"
                    value={labWatchers}
                    onChange={setLabWatchers}
                    search={search}
                    minChars={minChars}
                    debounceMs={debounceMs}
                    maxSelected={maxSelected}
                    renderItem={(item) => (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-white">{item.label}</span>
                        <span className="text-xs text-white/60">
                          {item.subLabel}
                        </span>
                      </div>
                    )}
                  />

                  <div className="mt-3 text-xs text-white/60">
                    Shows render prop flexibility.
                  </div>
                </div>
              </div>

              {/* Inspect / debug */}
              <details className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-white/80">
                  Inspect state (debug)
                </summary>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs text-white/60">
                      Active task
                    </div>
                    <pre className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
                      {JSON.stringify(activeTask, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <div className="mb-2 text-xs text-white/60">
                      Lab selections + metrics
                    </div>
                    <pre className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
                      {JSON.stringify(
                        {
                          knobs: {
                            debounceMs,
                            minChars,
                            maxSelected,
                            virtualize,
                            useBig,
                          },
                          labAssignee: labAssignee?.label ?? null,
                          labWatchers: labWatchers.map((w) => w.label),
                          metrics,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                </div>
              </details>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
