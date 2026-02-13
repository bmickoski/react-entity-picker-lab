import type { Board, Issue, Sprint } from "../domain/types";
const API_BASE = import.meta.env.VITE_API_URL ?? "";
type Json = Record<string, unknown>;

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type CreateIssueInput = Omit<Issue, "id" | "key">;
export type PatchIssueInput = { id: string; patch: Partial<Issue> };
export type BatchPatchInput = Array<PatchIssueInput>;

export const jiraClient = {
  listIssues(args: { boardId: string; sprintId: string | null }) {
    const qs = new URLSearchParams({ boardId: args.boardId });
    if (args.sprintId) qs.set("sprintId", args.sprintId); // ✅ no empty string
    return http<Issue[]>(`/issues?${qs.toString()}`);
  },

  createIssue(issue: CreateIssueInput) {
    return http<Issue>(`/issues`, {
      method: "POST",
      body: JSON.stringify(issue satisfies Json),
    });
  },

  patchIssue(args: PatchIssueInput) {
    return http<Issue>(`/issues/${args.id}`, {
      method: "PATCH",
      body: JSON.stringify(args.patch satisfies Json),
    });
  },

  patchIssuesBatch(changes: BatchPatchInput) {
    return http<Issue[]>(`/issues/batch`, {
      method: "PATCH",
      body: JSON.stringify(changes satisfies unknown[]),
    });
  },

  listBoards() {
    return http<Board[]>(`/boards`);
  },
  createBoard(args: { name: string }) {
    return http<Board>(`/boards`, {
      method: "POST",
      body: JSON.stringify(args),
    });
  },
  listSprints(boardId: string) {
    return http<Sprint[]>(`/boards/${boardId}/sprints`);
  },
  setActiveSprint(boardId: string, sprintId: string) {
    return http<Sprint>(`/boards/${boardId}/active-sprint`, {
      method: "PATCH",
      body: JSON.stringify({ sprintId } satisfies Json),
    });
  },
  moveIssue(args: { id: string; sprintId: string | null }) {
    return http<Issue>(`/issues/${args.id}`, {
      method: "PATCH",
      body: JSON.stringify({ sprintId: args.sprintId } satisfies Json),
    });
  },
  createSprint(boardId: string, args: { name: string }) {
    return http<Sprint>(`/boards/${boardId}/sprints`, {
      method: "POST",
      body: JSON.stringify(args),
    });
  },
};
