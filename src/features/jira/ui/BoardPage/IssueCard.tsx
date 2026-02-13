import React from "react";
import type { Issue } from "../../domain/types";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";

export const IssueCard = React.memo(function IssueCard(props: {
  issue: Issue;
  onOpen: () => void;
  dragHandleProps?: {
    listeners: DraggableSyntheticListeners;
    attributes: DraggableAttributes;
  };
}) {
  const { issue, dragHandleProps } = props;

  return (
    <div className="w-full rounded-xl border border-white/10 bg-black/30 p-3 hover:bg-white/5 hover:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={props.onOpen}
          className="min-w-0 flex-1 text-left overflow-x-hidden"
        >
          <div className="text-xs text-white/50 truncate">{issue.key}</div>
          <div className="mt-1 font-medium text-white leading-snug truncate">
            {issue.title}
          </div>
        </button>

        {dragHandleProps ? (
          <button
            type="button"
            aria-label="Drag issue"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-white/70 hover:bg-white/10 hover:text-white"
            onClick={(e) => e.preventDefault()}
            onPointerDown={(e) => e.stopPropagation()}
            {...dragHandleProps.attributes}
            {...dragHandleProps.listeners}
          >
            <span className="text-base leading-none">⋮⋮</span>
          </button>
        ) : null}
      </div>
    </div>
  );
});
