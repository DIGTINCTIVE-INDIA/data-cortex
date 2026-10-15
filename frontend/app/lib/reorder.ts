import { useCallback, useEffect, useRef, useState } from "react";

/** Moves one item, returning a new array. Out-of-range targets are clamped. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items];

  const target = Math.max(0, Math.min(items.length - 1, to));
  const next = [...items];
  const [moved] = next.splice(from, 1);

  next.splice(target, 0, moved as T);

  return next;
}

/**
 * Drag-to-reorder built on Pointer Events rather than HTML5 drag-and-drop.
 *
 * HTML5 DnD does not fire on touch screens at all, which is why this used to need
 * visible up/down buttons beside every row as a fallback. Pointer Events cover mouse,
 * touch and pen with one code path, so the grip handle is now the whole story: the
 * arrows are gone and nothing is lost with them.
 *
 * Dragging starts from the handle only. Making the whole row draggable meant a drag
 * began whenever someone tried to select text in a cell.
 *
 * Keyboard users get the same operation from the handle: focus it and press the arrow
 * keys. That is an accessible path, not a visible control, so it costs no layout.
 */
export function useRowReorder<T>(items: readonly T[], commit: (next: T[]) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const rows = useRef<(HTMLElement | null)[]>([]);

  // Read from refs inside the window listeners so the effect does not need to be torn
  // down and rebuilt on every pointermove.
  const latest = useRef({ dragging, over, items, commit });
  latest.current = { dragging, over, items, commit };

  const setRowRef = useCallback(
    (index: number) => (element: HTMLElement | null) => {
      rows.current[index] = element;
    },
    [],
  );

  /** Which row the pointer is currently over, by midpoint. */
  const indexAt = (y: number) => {
    const present = rows.current.filter(Boolean) as HTMLElement[];

    for (let index = 0; index < present.length; index += 1) {
      const box = present[index]!.getBoundingClientRect();

      if (y < box.top + box.height / 2) return index;
    }

    return Math.max(0, present.length - 1);
  };

  useEffect(() => {
    if (dragging === null) return;

    const onMove = (event: PointerEvent) => {
      // Without this a touch drag scrolls the page instead of moving the row.
      event.preventDefault();
      setOver(indexAt(event.clientY));
    };

    const onEnd = () => {
      const { dragging: from, over: to, items: current, commit: apply } = latest.current;

      if (from !== null && to !== null && from !== to) apply(moveItem(current, from, to));

      setDragging(null);
      setOver(null);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [dragging]);

  const move = useCallback((from: number, to: number) => commit(moveItem(items, from, to)), [commit, items]);

  return {
    dragging,
    over,
    move,

    /** Spread on each reorderable row. */
    rowProps: (index: number) => ({
      ref: setRowRef(index),
      "data-dragging": dragging === index || undefined,
      "data-drop-target": over === index && dragging !== index || undefined,
    }),

    /** Spread on the grip handle inside the row. */
    handleProps: (index: number, label: string) => ({
      role: "button" as const,
      tabIndex: 0,
      "aria-label": `Reorder ${label}. Press the up and down arrow keys to move it.`,
      // Stops the browser treating a touch-drag as a scroll gesture.
      style: { touchAction: "none" as const },
      onPointerDown: (event: React.PointerEvent) => {
        // Ignore right-click and anything that is not a primary press.
        if (event.button !== 0) return;

        event.preventDefault();
        setDragging(index);
        setOver(index);
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "ArrowUp" && index > 0) {
          event.preventDefault();
          move(index, index - 1);
        }

        if (event.key === "ArrowDown" && index < items.length - 1) {
          event.preventDefault();
          move(index, index + 1);
        }
      },
    }),
  };
}
