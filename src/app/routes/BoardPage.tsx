import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useBatchPatchIssues,
  useCreateIssue,
  useCreateSpringt,
  useIssues,
  useMoveIssue,
  usePatchIssue,
  useSprints,
} from "@/features/jira/api";
import { QueryState, BoardColumns, IssueSidePanel } from "@/features/jira/ui";
import type { Issue, IssueStatus } from "@/features/jira/domain";
import { nextOrderForStatus } from "@/features/jira/domain";
import { useJiraStore } from "@/features/jira/store";
import { usePeopleSearch } from "@/features/jira/people";
import { useShallow } from "zustand/shallow";

export default function BoardPage() {
  const navigate = useNavigate();
  const params = useParams<{ boardId: string; sprintId?: string }>();

  const boardId = params.boardId ?? "";
  const sprintId = params.sprintId ?? null;

  const view: "backlog" | "sprint" = sprintId ? "sprint" : "backlog";

  const {
    data: issues = [],
    isLoading: issuesLoading,
    isError: issuesError,
    error: issuesErrorObj,
  } = useIssues(boardId, sprintId);

  const {
    selectedIssueId,
    draftIssue,
    openIssue,
    closeIssue,
    openNewIssue,
    updateDraft,
    discardDraft,
    clearDraftAfterCreate,
  } = useJiraStore(
    useShallow((s) => ({
      selectedIssueId: s.selectedIssueId,
      draftIssue: s.draftIssue,
      openIssue: s.openIssue,
      closeIssue: s.closeIssue,
      openNewIssue: s.openNewIssue,
      updateDraft: s.updateDraft,
      discardDraft: s.discardDraft,
      clearDraftAfterCreate: s.clearDraftAfterCreate,
    })),
  );

  const createSprint = useCreateSpringt(boardId);
  const batchPatch = useBatchPatchIssues(boardId, sprintId);
  const patchIssue = usePatchIssue(boardId, sprintId);
  const createIssue = useCreateIssue(boardId, sprintId);
  const moveIssue = useMoveIssue(boardId, sprintId);
  const { data: sprints = [] } = useSprints(boardId);
  const activeSprint = useMemo(
    () => sprints.find((sp) => sp.boardId === boardId && sp.isActive) ?? null,
    [sprints, boardId],
  );

  const onMoveIssue = useCallback(
    (issueId: string, toSprintId: string | null) => {
      moveIssue.mutate(
        {
          id: issueId,
          toSprintId,
        },
        {
          onSuccess: () => {
            closeIssue();
          },
        },
      );
    },
    [moveIssue, closeIssue],
  );

  function onCreateSprint() {
    createSprint.mutate(
      { name: `Sprint ${sprints.length + 1}` },
      {
        onSuccess: (sp) => {
          navigate(`/boards/${boardId}/sprints/${sp.id}`);
        },
      },
    );
  }

  const scopedIssues = useMemo(() => {
    return issues.slice().sort((a, b) => a.order - b.order);
  }, [issues]);

  const selectedIssue = useMemo(() => {
    if (!selectedIssueId) return null;
    return scopedIssues.find((x) => x.id === selectedIssueId) ?? null;
  }, [scopedIssues, selectedIssueId]);

  const { toPersonEntity, search } = usePeopleSearch(true);

  const onSaveDraft = () => {
    if (!draftIssue) return;

    const title = draftIssue.title.trim();
    if (!title) return;

    createIssue.mutate(
      {
        boardId: draftIssue.boardId,
        sprintId: draftIssue.sprintId,
        status: draftIssue.status,
        order: nextOrderForStatus(scopedIssues, draftIssue.status),
        title,
        description: draftIssue.description,
        assigneeId: draftIssue.assigneeId,
        watcherIds: draftIssue.watcherIds,
      },
      {
        onSuccess: () => {
          clearDraftAfterCreate();
        },
      },
    );
  };

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

  const onBatchPatch = useCallback(
    (changes: Array<{ id: string; patch: Partial<Issue> }>) =>
      batchPatch.mutate(changes),
    [batchPatch],
  );

  const onOpenIssue = useCallback((id: string) => openIssue(id), [openIssue]);

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-white">
      <div className="w-full px-6 py-8 2xl:px-10">
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

            {!activeSprint ? (
              <button
                type="button"
                onClick={() => onCreateSprint()}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white"
              >
                + Create Sprint
              </button>
            ) : null}

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
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 text-sm text-white/60">
              {view === "backlog" ? "Backlog" : "Sprint board"}
            </div>
            <QueryState
              isLoading={issuesLoading}
              isError={issuesError}
              error={issuesErrorObj}
            >
              <BoardColumns
                view={view}
                issues={scopedIssues}
                isSaving={batchPatch.isPending}
                onOpenIssue={onOpenIssue}
                onBatchPatch={onBatchPatch}
              ></BoardColumns>
            </QueryState>
          </div>
          <IssueSidePanel
            view={view}
            activeSprint={activeSprint}
            draftIssue={draftIssue}
            selectedIssue={selectedIssue}
            isCreating={createIssue.isPending}
            sprints={sprints}
            onClose={closeIssue}
            onUpdateDraft={updateDraft}
            onDiscardDraft={discardDraft}
            onPatchIssue={(args) => patchIssue.mutate(args)}
            onSaveDraft={onSaveDraft}
            onMoveIssue={onMoveIssue}
            toPersonEntity={toPersonEntity}
            searchPeople={search}
          />
        </div>
      </div>
    </div>
  );
}
