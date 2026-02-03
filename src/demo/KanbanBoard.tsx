import type { Task, IssueStatus } from "./taskboardTypes";

const COLUMNS: Array<{ key: IssueStatus; title: string }> = [
  { key: "backlog", title: "Backlog" },
  { key: "in_progress", title: "In Progress" },
  { key: "blocked", title: "Blocked" },
  { key: "done", title: "Done" },
];

export function KanbanBoard(props: {
  tasks: Task[];
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = props.tasks.filter((t) => t.status === col.key);

        return (
          <div
            key={col.key}
            className="rounded-2xl border border-white/10 bg-black/20"
          >
            <div className="border-b border-white/10 px-4 py-3">
              <div className="text-sm font-semibold text-white">
                {col.title}
              </div>
              <div className="text-xs text-white/60">
                {items.length} issue(s)
              </div>
            </div>

            <div className="p-3 space-y-2">
              {items.map((t) => {
                const active = props.activeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => props.onOpen(t.id)}
                    className={[
                      "w-full rounded-xl border px-3 py-2 text-left",
                      "bg-black/20 hover:bg-white/5",
                      active
                        ? "border-white/25 bg-white/10"
                        : "border-white/10",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-white/60">{t.id}</div>
                      <div className="text-xs text-white/60">
                        {t.priority.toUpperCase()}
                      </div>
                    </div>

                    <div className="mt-1 font-medium text-white">{t.title}</div>

                    {t.labels.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.labels.slice(0, 3).map((l) => (
                          <span
                            key={l}
                            className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70"
                          >
                            {l}
                          </span>
                        ))}
                        {t.labels.length > 3 && (
                          <span className="text-[10px] text-white/50">
                            +{t.labels.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
