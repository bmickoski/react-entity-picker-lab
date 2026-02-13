import React, { useEffect, useMemo, useState } from "react";
import {
  EntityPicker,
  type EntityBase,
} from "../../../../components/EntityPicker";
import { EntityMultiPicker } from "../../../../components/EntityMultiPicker";
import type { Issue, IssueDraft, Sprint } from "../../domain/types";

type PersonEntity = EntityBase & { raw: object };

export const IssueSidePanel = React.memo(function IssueSidePanel(props: {
  // Draft mode
  draftIssue: IssueDraft | null;
  onUpdateDraft: (patch: Partial<IssueDraft>) => void;
  onDiscardDraft: () => void;
  onSaveDraft: () => void;
  onMoveIssue: (issueId: string, toSprintId: string | null) => void;
  isCreating?: boolean;
  sprints: Array<Sprint>;
  // Selected mode
  selectedIssue: Issue | null;
  onPatchIssue: (args: { id: string; patch: Partial<Issue> }) => void;

  // Other
  onClose: () => void;

  // People helpers
  toPersonEntity: (id: string | number) => PersonEntity;
  searchPeople: (q: string, signal?: AbortSignal) => Promise<PersonEntity[]>;
}) {
  const {
    draftIssue,
    selectedIssue,
    onClose,
    onUpdateDraft,
    onMoveIssue,
    onDiscardDraft,
    onSaveDraft,
    isCreating = false,
    onPatchIssue,
    toPersonEntity,
    searchPeople,
  } = props;

  // -----------------------------
  // Selected issue local drafts
  // -----------------------------
  const [titleDraftById, setTitleDraftById] = useState<Record<string, string>>(
    {},
  );
  const [descDraftById, setDescDraftById] = useState<Record<string, string>>(
    {},
  );

  const titleDraft = useMemo(() => {
    if (!selectedIssue) return "";
    return titleDraftById[selectedIssue.id] ?? selectedIssue.title ?? "";
  }, [titleDraftById, selectedIssue]);

  const descDraft = useMemo(() => {
    if (!selectedIssue) return "";
    return descDraftById[selectedIssue.id] ?? selectedIssue.description ?? "";
  }, [descDraftById, selectedIssue]);

  const onTitleChange = (next: string) => {
    if (!selectedIssue) return;
    setTitleDraftById((prev) => ({ ...prev, [selectedIssue.id]: next }));
  };

  const onDescChange = (next: string) => {
    if (!selectedIssue) return;
    setDescDraftById((prev) => ({ ...prev, [selectedIssue.id]: next }));
  };

  // Debounce save: title
  useEffect(() => {
    if (!selectedIssue) return;
    const local = titleDraftById[selectedIssue.id];
    if (local == null) return;

    const server = selectedIssue.title ?? "";
    if (local === server) return;

    const t = window.setTimeout(() => {
      onPatchIssue({ id: selectedIssue.id, patch: { title: local } });
    }, 600);

    return () => window.clearTimeout(t);
  }, [titleDraftById, selectedIssue, onPatchIssue]);

  // Debounce save: description
  useEffect(() => {
    if (!selectedIssue) return;
    const local = descDraftById[selectedIssue.id];
    if (local == null) return;

    const server = selectedIssue.description ?? "";
    if (local === server) return;

    const t = window.setTimeout(() => {
      onPatchIssue({ id: selectedIssue.id, patch: { description: local } });
    }, 600);

    return () => window.clearTimeout(t);
  }, [descDraftById, selectedIssue, onPatchIssue]);

  return (
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
                onChange={(e) => onUpdateDraft({ title: e.target.value })}
                placeholder="Short summary"
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/25"
              />
            </div>

            <div>
              <div className="mb-1 text-sm text-white/70">Description</div>
              <textarea
                value={draftIssue.description}
                onChange={(e) => onUpdateDraft({ description: e.target.value })}
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
                    onClick={() => onUpdateDraft({ assigneeId: null })}
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
                  value={
                    draftIssue.assigneeId == null
                      ? null
                      : toPersonEntity(draftIssue.assigneeId)
                  }
                  onChange={(p) =>
                    onUpdateDraft({ assigneeId: p ? String(p.id) : null })
                  }
                  search={searchPeople}
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
                    onClick={() => onUpdateDraft({ watcherIds: [] })}
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
                  value={(draftIssue.watcherIds ?? []).map(toPersonEntity)}
                  onChange={(next) =>
                    onUpdateDraft({ watcherIds: next.map((x) => String(x.id)) })
                  }
                  search={searchPeople}
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
                onClick={onDiscardDraft}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={onSaveDraft}
                disabled={!draftIssue.title.trim() || isCreating}
                className={[
                  "rounded-xl border border-white/15 px-3 py-2 text-sm",
                  draftIssue.title.trim()
                    ? "bg-white/10 text-white hover:bg-white/15"
                    : "cursor-not-allowed bg-white/5 text-white/40",
                ].join(" ")}
              >
                {isCreating ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </>
      ) : selectedIssue ? (
        /* --------------------- */
        /* Selected mode */
        /* --------------------- */
        <>
          <div className="text-xs text-white/50">{selectedIssue.key}</div>
          <div className="mt-1 text-xl font-semibold">Issue</div>

          <div className="mt-4 grid gap-5">
            <div>
              <div className="mb-1 text-sm text-white/70">Title</div>
              <input
                value={titleDraft}
                onChange={(e) => onTitleChange(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
              />
              <div className="mt-2 text-xs text-white/45">
                Autosaves after 600ms pause.
              </div>
            </div>

            <div>
              <div className="mb-1 text-sm text-white/70">Description</div>
              <textarea
                value={descDraft}
                onChange={(e) => onDescChange(e.target.value)}
                rows={8}
                className="w-full resize-none rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
              />
              <div className="mt-2 text-xs text-white/45">
                Autosaves after 600ms pause.
              </div>
            </div>

            <div className="grid gap-4">
              <div className="w-full">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="text-sm text-white/80">Assignee</div>

                  <button
                    type="button"
                    disabled={selectedIssue.assigneeId == null}
                    onClick={() =>
                      onPatchIssue({
                        id: selectedIssue.id,
                        patch: { assigneeId: null },
                      })
                    }
                    className={[
                      "min-w-[56px] rounded-lg px-2 py-1 text-xs",
                      selectedIssue.assigneeId == null
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
                  value={
                    selectedIssue.assigneeId == null
                      ? null
                      : toPersonEntity(selectedIssue.assigneeId)
                  }
                  onChange={(p) =>
                    onPatchIssue({
                      id: selectedIssue.id,
                      patch: { assigneeId: p ? String(p.id) : null },
                    })
                  }
                  search={searchPeople}
                  minChars={2}
                  debounceMs={250}
                />
              </div>

              <div className="w-full">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="text-sm text-white/80">Watchers</div>

                  <button
                    type="button"
                    disabled={(selectedIssue.watcherIds?.length ?? 0) === 0}
                    onClick={() =>
                      onPatchIssue({
                        id: selectedIssue.id,
                        patch: { watcherIds: [] },
                      })
                    }
                    className={[
                      "min-w-[56px] rounded-lg px-2 py-1 text-xs",
                      (selectedIssue.watcherIds?.length ?? 0) === 0
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
                  value={(selectedIssue.watcherIds ?? []).map(toPersonEntity)}
                  onChange={(next) =>
                    onPatchIssue({
                      id: selectedIssue.id,
                      patch: { watcherIds: next.map((x) => String(x.id)) },
                    })
                  }
                  search={searchPeople}
                  minChars={2}
                  debounceMs={250}
                  maxSelected={10}
                  virtualize
                />
              </div>
            </div>

            <div className="w-full">
              <div className="mb-1.5 text-sm text-white/80">Move</div>

              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={selectedIssue.sprintId == null}
                  onClick={() => onMoveIssue(selectedIssue.id, null)}
                  className={[
                    "rounded-xl border border-white/15 px-3 py-2 text-sm",
                    selectedIssue.sprintId == null
                      ? "cursor-not-allowed bg-white/5 text-white/40"
                      : "bg-white/10 text-white hover:bg-white/15",
                  ].join(" ")}
                >
                  Move to Backlog
                </button>

                <div className="grid gap-2">
                  {props.sprints.map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      disabled={selectedIssue.sprintId === sp.id}
                      onClick={() => onMoveIssue(selectedIssue.id, sp.id)}
                      className={[
                        "flex items-center justify-between rounded-xl border border-white/15 px-3 py-2 text-sm",
                        selectedIssue.sprintId === sp.id
                          ? "cursor-not-allowed bg-white/5 text-white/40"
                          : "bg-white/10 text-white hover:bg-white/15",
                      ].join(" ")}
                    >
                      <span>{sp.name}</span>
                      {sp.isActive ? (
                        <span className="text-xs text-white/60">active</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="text-white/70">
          Select an issue or create a new one.
        </div>
      )}
    </div>
  );
});
