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

/** How long a just-moved row stays highlighted. */
const FLASH_MS = 1400;

export type DragGhostState = { x: number; y: number; label: string };

/**
 * Drag-to-reorder built on Pointer Events rather than HTML5 drag-and-drop.
 *
 * HTML5 DnD does not fire on touch screens at all. Pointer Events cover mouse, touch and pen
 * with one code path. Dragging starts from the grip handle only, so selecting text in a cell
 * never starts a drag. Keyboard users focus the handle and press the arrow keys; the up/down
 * buttons some tables show call the same `move`.
 *
 * Feedback is deliberately loud, because a table this wide hides what is happening:
 *   - while dragging, the carried row is lifted and outlined, a label follows the pointer,
 *     the cursor becomes a grabbing hand, and a thick line shows which side of the target
 *     row it will land on;
 *   - after ANY move (drag, arrow button or key) the row that moved is highlighted for a
 *     moment and scrolled into view, so the change is never missed.
 */
export function useRowReorder<T>(
  items: readonly T[],
  commit: (next: T[]) => void,
  labelOf: (item: T, index: number) => string = (_, index) => `Row ${index + 1}`,
) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [moved, setMoved] = useState<number | null>(null);
  const [ghost, setGhost] = useState<DragGhostState | null>(null);

  const rows = useRef<(HTMLElement | null)[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read from refs inside the window listeners so the effect does not need to be torn
  // down and rebuilt on every pointermove.
  const latest = useRef({ dragging, over, items, commit, labelOf });
  latest.current = { dragging, over, items, commit, labelOf };

  const setRowRef = useCallback(
    (index: number) => (element: HTMLElement | null) => {
      rows.current[index] = element;
    },
    [],
  );

  /** Lights up the row now at `index` and brings it into view. */
  const flash = useCallback((index: number) => {
    setMoved(index);

    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setMoved(null), FLASH_MS);
  }, []);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // After the re-render the row is at its new position; scroll to it then.
  useEffect(() => {
    if (moved === null) return;

    rows.current[moved]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [moved]);

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

    // The whole page says "carrying something" for the length of the drag.
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const onMove = (event: PointerEvent) => {
      // Without this a touch drag scrolls the page instead of moving the row.
      event.preventDefault();
      setOver(indexAt(event.clientY));
      setGhost(current => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
    };

    const onEnd = () => {
      const { dragging: from, over: to, items: current, commit: apply } = latest.current;

      if (from !== null && to !== null && from !== to) {
        apply(moveItem(current, from, to));
        flash(to);
      }

      setDragging(null);
      setOver(null);
      setGhost(null);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);

    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [dragging, flash]);

  /** Move one row (arrow button or key). The moved row is highlighted and scrolled into view. */
  const move = useCallback(
    (from: number, to: number) => {
      const target = Math.max(0, Math.min(items.length - 1, to));

      if (from === target) return;

      commit(moveItem(items, from, to));
      flash(target);
    },
    [commit, flash, items],
  );

  /** Tailwind classes for a reorderable row, so every table looks the same while moving. */
  const rowClass = (index: number) => {
    const classes = ["transition-[background-color,box-shadow] duration-500"];

    if (dragging === index) {
      // The row being carried: lifted, outlined and tinted -- impossible to mistake for the rest.
      classes.push("relative z-10 bg-primary/15 shadow-xl ring-2 ring-inset ring-primary");
    } else if (dragging !== null && over === index) {
      // The landing spot: a thick line on the edge the carried row will end up beside.
      classes.push(
        "bg-primary/10",
        (dragging ?? 0) < index
          ? "shadow-[inset_0_-4px_0_0_var(--color-primary)]"
          : "shadow-[inset_0_4px_0_0_var(--color-primary)]",
      );
    } else if (moved === index) {
      // Just moved (drag, arrow or key): lit for a moment.
      classes.push("bg-primary/20 ring-2 ring-inset ring-primary/60");
    }

    return classes.join(" ");
  };

  return {
    dragging,
    over,
    moved,
    ghost,
    move,
    rowClass,

    /** Spread on each reorderable row. */
    rowProps: (index: number) => ({
      ref: setRowRef(index),
      "data-dragging": dragging === index || undefined,
      "data-drop-target": (over === index && dragging !== index) || undefined,
      "data-moved": moved === index || undefined,
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
        setGhost({ x: event.clientX, y: event.clientY, label: `${index + 1} · ${latest.current.labelOf(items[index] as T, index)}` });
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
