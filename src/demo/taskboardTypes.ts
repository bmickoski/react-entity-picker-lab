export type IssueStatus = "backlog" | "in_progress" | "blocked" | "done";
export type IssuePriority = "low" | "medium" | "high";

export type Task = {
  id: string;
  title: string;
  description: string;

  status: IssueStatus;
  priority: IssuePriority;
  labels: string[];

  assigneeId: string | number | null;
  watcherIds: Array<string | number>;

  createdAt: string; 
  updatedAt: string; 
};
