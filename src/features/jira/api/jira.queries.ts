import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { jiraClient } from "./jira.client";
import type { Board, Issue, Sprint } from "../domain/types";

type IssueChange = { id: string; patch: Partial<Issue> };
type CreateIssueInput = Omit<Issue, "id" | "key">;

// ----------------------------
// Query keys
// ----------------------------
export const jiraKeys = {
  issues: (boardId: string, sprintId: string | null) =>
    ["issues", boardId, sprintId] as const,
  boards: ["boards"] as const,
  sprints: (boardId: string) => ["sprints", boardId] as const,
};

// ----------------------------
// Queries
// ----------------------------
export function useIssues(boardId: string, sprintId: string | null) {
  return useQuery({
    queryKey: jiraKeys.issues(boardId, sprintId),
    queryFn: () => jiraClient.listIssues({ boardId, sprintId }),
    enabled: !!boardId,
  });
}

// ----------------------------
// Mutations
// ----------------------------

// Batch patch is perfect for DnD.
// We do optimistic cache update, then just invalidate to refetch canonical list.
export function useBatchPatchIssues(boardId: string, sprintId: string | null) {
  const qc = useQueryClient();

  return useMutation<Issue[], Error, IssueChange[], { prev: Issue[] }>({
    mutationFn: (changes) => jiraClient.patchIssuesBatch(changes),

    onMutate: async (changes) => {
      const key = jiraKeys.issues(boardId, sprintId);
      await qc.cancelQueries({ queryKey: key });

      const prev = qc.getQueryData<Issue[]>(key) ?? [];

      const byId = new Map(changes.map((c) => [c.id, c.patch]));
      const next = prev.map((it) => {
        const patch = byId.get(it.id);
        return patch ? { ...it, ...patch } : it;
      });

      qc.setQueryData<Issue[]>(key, next);
      return { prev };
    },

    onError: (_err, _changes, ctx) => {
      const key = jiraKeys.issues(boardId, sprintId);
      if (ctx?.prev) qc.setQueryData<Issue[]>(key, ctx.prev);
    },

    onSettled: () => {
      const key = jiraKeys.issues(boardId, sprintId);
      qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function usePatchIssue(boardId: string, sprintId: string | null) {
  const qc = useQueryClient();

  return useMutation<
    Issue,
    Error,
    { id: string; patch: Partial<Issue> },
    { prev: Issue[] }
  >({
    mutationFn: (args) => jiraClient.patchIssue(args),

    onMutate: async ({ id, patch }) => {
      const key = jiraKeys.issues(boardId, sprintId);
      await qc.cancelQueries({ queryKey: key });

      const prev = qc.getQueryData<Issue[]>(key) ?? [];
      qc.setQueryData<Issue[]>(
        key,
        prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      );

      return { prev };
    },

    onError: (_err, _vars, ctx) => {
      const key = jiraKeys.issues(boardId, sprintId);
      if (ctx?.prev) qc.setQueryData<Issue[]>(key, ctx.prev);
    },

    onSuccess: (updated) => {
      const key = jiraKeys.issues(boardId, sprintId);
      const prev = qc.getQueryData<Issue[]>(key) ?? [];
      qc.setQueryData<Issue[]>(
        key,
        prev.map((it) => (it.id === updated.id ? updated : it)),
      );
    },

    onSettled: () => {
      const key = jiraKeys.issues(boardId, sprintId);
      qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useCreateIssue(boardId: string, sprintId: string | null) {
  const qc = useQueryClient();

  return useMutation<
    Issue,
    Error,
    CreateIssueInput,
    { prev: Issue[]; tempId: string }
  >({
    mutationFn: (issue) => jiraClient.createIssue(issue),

    onMutate: async (issue) => {
      const key = jiraKeys.issues(boardId, sprintId);
      await qc.cancelQueries({ queryKey: key });

      const prev = qc.getQueryData<Issue[]>(key) ?? [];

      // optimistic item so UI updates instantly
      const tempId = `tmp_${crypto.randomUUID()}`;
      const optimistic: Issue = {
        ...issue,
        id: tempId,
        key: "TMP",
      };

      qc.setQueryData<Issue[]>(key, [...prev, optimistic]);

      return { prev, tempId };
    },

    onError: (_err, _vars, ctx) => {
      const key = jiraKeys.issues(boardId, sprintId);
      if (ctx?.prev) qc.setQueryData<Issue[]>(key, ctx.prev);
    },

    onSuccess: (created, _vars, ctx) => {
      const key = jiraKeys.issues(boardId, sprintId);
      const prev = qc.getQueryData<Issue[]>(key) ?? [];

      // replace temp with server result
      qc.setQueryData<Issue[]>(
        key,
        prev.map((it) => (it.id === ctx?.tempId ? created : it)),
      );
    },

    onSettled: () => {
      const key = jiraKeys.issues(boardId, sprintId);
      qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useBoards() {
  return useQuery({
    queryKey: jiraKeys.boards,
    queryFn: () => jiraClient.listBoards(),
  });
}

export function useSprints(boardId: string) {
  return useQuery({
    queryKey: jiraKeys.sprints(boardId),
    queryFn: () => jiraClient.listSprints(boardId),
    enabled: !!boardId,
  });
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation<Board, Error, { name: string }>({
    mutationFn: (args) => jiraClient.createBoard(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jiraKeys.boards });
    },
  });
}

export function useMoveIssue(boardId: string, sprintId: string | null) {
  const qc = useQueryClient();

  return useMutation<
    Issue,
    Error,
    { id: string; toSprintId: string | null },
    { prev: Issue[] }
  >({
    mutationFn: ({ id, toSprintId }) =>
      jiraClient.moveIssue({ id, sprintId: toSprintId }),

    onMutate: async ({ id, toSprintId }) => {
      const key = jiraKeys.issues(boardId, sprintId);
      await qc.cancelQueries({ queryKey: key });

      const prev = qc.getQueryData<Issue[]>(key) ?? [];

      // Optimistic update:
      // If moving out of the current list, remove it.
      // If moving within current scope, patch sprintId.
      const next = prev
        .map((it) => (it.id === id ? { ...it, sprintId: toSprintId } : it))
        .filter((it) => {
          // keep only issues that match the current route scope
          const wantSprint = sprintId ?? null;
          const itSprint = it.sprintId ?? null;
          return itSprint === wantSprint;
        });

      qc.setQueryData<Issue[]>(key, next);
      return { prev };
    },

    onError: (_err, _vars, ctx) => {
      const key = jiraKeys.issues(boardId, sprintId);
      if (ctx?.prev) qc.setQueryData<Issue[]>(key, ctx.prev);
    },

    onSettled: () => {
      // current list
      qc.invalidateQueries({ queryKey: jiraKeys.issues(boardId, sprintId) });

      // also invalidate BOTH backlog and sprint list because move crosses scopes
      qc.invalidateQueries({ queryKey: ["issues", boardId] });
    },
  });
}

export function useCreateSprint(boardId: string) {
  const qc = useQueryClient();
  return useMutation<Sprint, Error, { name: string }>({
    mutationFn: (args) => jiraClient.createSprint(boardId, args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jiraKeys.sprints(boardId) });
    },
  });
}

export function useSetActiveSprint(boardId: string) {
  const qc = useQueryClient();
  return useMutation<Sprint, Error, { sprintId: string }>({
    mutationFn: (args) => jiraClient.setActiveSprint(boardId, args.sprintId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jiraKeys.sprints(boardId) });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["issues", boardId] });
    },
  });
}
