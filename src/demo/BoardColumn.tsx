import { memo, useMemo } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Issue, IssueStatus } from "../demo/jiraStore";
import { DroppableColumn } from "../jira/DroppableColumn";

export const BoardColumn = memo(function BoardColumn(props: {
  status: IssueStatus;
  title: string;
  issues: Issue[];
  children: (issue: Issue) => React.ReactNode;
}) {
  const ids = useMemo(() => props.issues.map((x) => x.id), [props.issues]);

  return (
    <DroppableColumn
      id={`status:${props.status}`}
      title={props.title}
      count={props.issues.length}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {props.issues.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-3 text-sm text-white/40">
            No issues
          </div>
        ) : (
          props.issues.map((it) => props.children(it))
        )}
      </SortableContext>
    </DroppableColumn>
  );
});
