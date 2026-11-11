"use client";

import type { ReactNode } from "react";
import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";

/** Wraps a set of lanes. Works with a mouse and with touch (press and hold a card on a phone). */
export function DragArea({ onDrop, children }: { onDrop: (taskId: string, laneId: string) => void; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  return (
    <DndContext
      id="barrett-dnd"
      sensors={sensors}
      onDragEnd={(e) => {
        if (e.over) onDrop(String(e.active.id), String(e.over.id));
      }}
    >
      {children}
    </DndContext>
  );
}

export function Lane({ id, className = "", children }: { id: string; className?: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`col ${className} ${isOver ? "over" : ""}`}>
      {children}
    </div>
  );
}

export function Draggable({ id, className = "", children }: { id: string; className?: string; children: ReactNode }) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article ref={setNodeRef} style={style} className={`card ${className} ${isDragging ? "dragging" : ""}`} {...listeners}>
      {children}
    </article>
  );
}
