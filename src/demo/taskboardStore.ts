import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Task } from "./taskboardTypes";

type UiState = {
  virtualize: boolean;
  useBig: boolean;
  showLab: boolean;
  debounceMs: number;
  minChars: number;
  maxSelected: number;

  setVirtualize: (v: boolean | ((prev: boolean) => boolean)) => void;
  setUseBig: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShowLab: (v: boolean | ((prev: boolean) => boolean)) => void;
  setDebounceMs: (n: number) => void;
  setMinChars: (n: number) => void;
  setMaxSelected: (n: number) => void;
};

type TaskState = {
  tasks: Task[];

  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  resetTasks: (tasks: Task[]) => void;
};

export type TaskboardStore = UiState & TaskState;

export const useTaskboardStore = create<TaskboardStore>()(
  persist(
    (set, get) => ({
      virtualize: true,
      useBig: false,
      showLab: false,
      debounceMs: 250,
      minChars: 2,
      maxSelected: 5,

      setVirtualize: (v) =>
        set((s) => ({ virtualize: typeof v === "function" ? v(s.virtualize) : v })),

      setUseBig: (v) =>
        set((s) => ({ useBig: typeof v === "function" ? v(s.useBig) : v })),

      setShowLab: (v) =>
        set((s) => ({ showLab: typeof v === "function" ? v(s.showLab) : v })),

      setDebounceMs: (n) => set({ debounceMs: n }),
      setMinChars: (n) => set({ minChars: n }),
      setMaxSelected: (n) => set({ maxSelected: n }),

      // ---- tasks ----
      tasks: [],

      setTasks: (tasks) => set({ tasks }),

      addTask: (task) =>
        set((s) => ({
          tasks: [
            {
              ...task,
              createdAt: task.createdAt ?? new Date().toISOString(),
              updatedAt: task.updatedAt ?? new Date().toISOString(),
            },
            ...s.tasks,
          ],
        })),

      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, ...patch, updatedAt: new Date().toISOString() }
              : t
          ),
        })),


      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      resetTasks: (tasks) => set({ tasks }),
    }),
    {
      name: "entity-picker-lab:store",
      // optional: only persist what matters
      partialize: (s) => ({
        tasks: s.tasks,
        virtualize: s.virtualize,
        useBig: s.useBig,
        showLab: s.showLab,
        debounceMs: s.debounceMs,
        minChars: s.minChars,
        maxSelected: s.maxSelected,
      }),
    }
  )
);
