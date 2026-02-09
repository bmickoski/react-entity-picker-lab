import { useDroppable } from "@dnd-kit/core";
import React from "react";

function DroppableColumnImpl(props: {
  id: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: props.id });

  return (
    <div
      ref={setNodeRef}
      className={[
        "rounded-2xl border border-white/10 bg-black/20 p-3 transition",
        isOver ? "ring-2 ring-white/20 bg-white/5" : "",
      ].join(" ")}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="font-semibold">{props.title}</div>
        <div className="text-xs text-white/50">{props.count}</div>
      </div>

      {/* Scroll viewport (Jira-like) */}
      <div
        className={[
          "grid gap-2 overflow-y-auto",
          "pr-2", // reserve space so scrollbar doesn't cover cards
          "max-h-[520px]", // tweak per layout (or use calc below)
          "scrollbar-thin", // if you have plugin; otherwise remove
        ].join(" ")}
        style={{
          scrollbarGutter: "stable", // prevents layout shift when scrollbar appears
        }}
      >
        {props.children}
      </div>
    </div>
  );
}

export const DroppableColumn = React.memo(DroppableColumnImpl);
