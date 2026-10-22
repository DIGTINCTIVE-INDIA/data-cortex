import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckmarkCircle02Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  QUEUED_VISIBLE_MS,
  rememberStartedRun,
  startedRunFor,
  useRunCheck,
  type RunCheckSource,
} from "../useRunCheck";

type Props = {
  configId: string;
  source: RunCheckSource;
  enabled: boolean;
};

/**
 * Run control for a single configured check.
 *
 * The engine run is asynchronous, so a button that springs straight back to "Run" reads
 * as "nothing happened". It stays queued for QUEUED_VISIBLE_MS instead, then returns to
 * "Run" -- long enough to confirm the click landed, short enough that the row does not
 * look stuck for the rest of the page session.
 *
 * The run id lives in the button's tooltip, not on its face. Rendering it beneath changed
 * the row's height; rendering it inside changed the button's width, which pushed the View
 * and Edit controls beside it. The button is a fixed width so every state occupies exactly
 * the same space.
 */
export function RunCheckButton({ configId, source, enabled }: Props) {
  const { runCheck, isRunPending } = useRunCheck();

  // Seeded from module state so the queued look survives the list re-rendering or the
  // card remounting after a refetch.
  const [startedRun, setStartedRun] = useState(() => startedRunFor(configId));

  // Elapsed, not a fresh 10s: a remount halfway through the window must finish the
  // window, not restart it.
  const [isQueued, setIsQueued] = useState(() => {
    const run = startedRunFor(configId);
    return run ? Date.now() - run.startedAt < QUEUED_VISIBLE_MS : false;
  });

  useEffect(() => {
    if (!startedRun || !isQueued) return;

    const remaining = QUEUED_VISIBLE_MS - (Date.now() - startedRun.startedAt);

    if (remaining <= 0) {
      setIsQueued(false);
      return;
    }

    const timer = setTimeout(() => setIsQueued(false), remaining);

    return () => clearTimeout(timer);
  }, [startedRun, isQueued]);

  const handleClick = async () => {
    const result = await runCheck(configId, source);

    if (result?.runId) {
      rememberStartedRun(configId, result.runId);
      setStartedRun(startedRunFor(configId));
      setIsQueued(true);
    }
  };

  const showQueued = Boolean(startedRun) && isQueued && !isRunPending;

  return (
    <Button
      requires="run"
      variant={showQueued ? "outline" : "primary"}
      className={cn(
        // Fixed width, not auto: "Run", "Starting" and "Queued" are different
        // lengths, and this button is the first item in a flex row ahead of View,
        // Edit and the enable toggle -- so any growth shoved all of them sideways
        // mid-click.
        //
        // Kept narrow (92px): the labels are short and the type is small, so "Run",
        // "Starting" and "Queued" all fit with room, and the button no longer dominates
        // the card. Fixed, not auto, so a state change never shifts its neighbours.
        "h-8 w-[92px] justify-center rounded-lg px-3 text-xs transition-colors",
        showQueued && "border-green-600/40 text-green-700 hover:bg-green-600/5 dark:text-green-500"
      )}
      isLoading={isRunPending}
      // Locked for the 5 seconds the engine treats a repeat as the same run, so a double
      // click cannot ask for a second one; after that the same check runs again.
      disabled={!enabled || showQueued}
      onClick={handleClick}
      title={startedRun ? `Run id: ${startedRun.runId}` : undefined}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isRunPending ? "pending" : showQueued ? "queued" : "idle"}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.15 }}
          className="inline-flex items-center gap-1.5">
          <HugeiconsIcon icon={showQueued ? CheckmarkCircle02Icon : PlayIcon} size={14} />

          {isRunPending ? (
            "Starting"
          ) : showQueued ? (
            <span className="inline-flex items-center gap-1.5">
              Queued
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-green-500" />
              </span>
            </span>
          ) : (
            "Run"
          )}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}
