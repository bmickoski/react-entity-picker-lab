import React, { useMemo, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Issue } from "../../domain/types";
import { IssueCard } from "./IssueCard";

export const SortableIssue = React.memo(function SortableIssue(props: {
  issue: Issue;
  onOpenIssue: (id: string) => void;
}) {
  const { issue, onOpenIssue } = props;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: issue.id, data: { status: issue.status } });

  const style = useMemo<React.CSSProperties>(
    () => ({ transform: CSS.Transform.toString(transform), transition }),
    [transform, transition],
  );

  const onOpen = useCallback(() => onOpenIssue(issue.id), [onOpenIssue, issue.id]);

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-60" : ""}>
      <IssueCard issue={issue} onOpen={onOpen} dragHandleProps={{ listeners, attributes }} />
    </div>
  );
});
