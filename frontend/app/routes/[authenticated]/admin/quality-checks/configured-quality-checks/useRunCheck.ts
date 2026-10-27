import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useApi } from "@/lib/useApi";

export type RunCheckSource = "db" | "file" | "custom-sql";

type RunCheckResult = {
  runId: string;
  state: string;
  duplicate: boolean;
  /** True when the engine was unavailable and the backend is holding the run. */
  held?: boolean;
};

/**
 * One token per page load, used to de-duplicate runs.
 *
 * Module scope is deliberate: it is created once when the bundle first evaluates and
 * survives client-side navigation, but a browser refresh re-evaluates the module and
 * produces a new token. That is the intended behaviour -- double-clicking Run (or
 * clicking it again after coming back to the list) is the same run, while an explicit
 * refresh lets the operator deliberately start a fresh one.
 */
const PAGE_TOKEN =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Runs started during this page session, keyed by config id.
 *
 * Module scope deliberately matches PAGE_TOKEN's lifetime: both reset on refresh. That
 * keeps the button's "Queued" state and the de-duplication window in agreement, and lets
 * the state survive a card remounting when the list refetches.
 */
/** How long the button keeps showing "Queued" before returning to "Run". */
export const QUEUED_VISIBLE_MS = 5_000;

// startedAt drives that countdown. Stored here rather than in the component so the
// remaining time is correct when a card remounts mid-window after a refetch, instead
// of restarting the full 10s.
const startedRuns = new Map<string, { runId: string; startedAt: number }>();

export function startedRunFor(configId: string) {
  return startedRuns.get(configId) ?? null;
}

// The map is module state, so writing to it does not re-render anything on its own.
// The card needs to light up the moment its own Run button fires, which is a different
// component, so interested components subscribe here.
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(listener => listener());
}

export function rememberStartedRun(configId: string, runId: string) {
  startedRuns.set(configId, { runId, startedAt: Date.now() });
  notify();
}

/**
 * Whether this check has a run that was started in this page session and is still
 * inside the queued window.
 *
 * This is what makes the whole card read as live, not just the button: the run is the
 * card's state for those few seconds, and lighting only the control you pressed tells
 * you nothing you did not already know.
 */
export function useRunIsLive(configId: string) {
  const remaining = () => {
    const run = startedRuns.get(configId);
    return run ? QUEUED_VISIBLE_MS - (Date.now() - run.startedAt) : -1;
  };

  const [live, setLive] = useState(() => remaining() > 0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      const left = remaining();

      setLive(left > 0);

      clearTimeout(timer);
      // Fires once, when this run's window closes -- no interval, no polling.
      if (left > 0) timer = setTimeout(() => setLive(false), left);
    };

    sync();
    listeners.add(sync);

    return () => {
      listeners.delete(sync);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId]);

  return live;
}

/**
 * Scoped per check, so running DBC0001 does not suppress a run of DBC0002 that happens
 * to be clicked in the same page session.
 */
function idempotencyKeyFor(configId: string) {
  return `${PAGE_TOKEN}:${configId}`;
}

/**
 * Fires a configured check and reports what actually happened.
 *
 * The engine queues the run and answers in milliseconds with a run id -- a 202 means
 * "accepted", never "passed". The toast is the only feedback the operator gets, so it
 * carries the run id; without it the button just flickers and a queued run is
 * indistinguishable from a silent failure.
 */
export function useRunCheck() {
  const { mutateAsync, isPending } = useApi("POST /api/qc-configuration/run");

  const runCheck = async (configId: string, source: RunCheckSource) => {
    const toastId = toast.loading(`Starting ${configId}…`);

    try {
      const response = (await mutateAsync({
        configId,
        source,
        idempotencyKey: idempotencyKeyFor(configId),
      })) as { data?: RunCheckResult } | undefined;

      const result = response?.data;

      if (result?.held) {
        // The engine is not available, so the backend kept the run. It is not lost and not an
        // error: it goes to the engine by itself as soon as the engine is back.
        toast.info(`${configId} is held`, {
          id: toastId,
          description: "The engine is not available right now. The check will start by itself when it is back.",
          duration: 10000,
        });
      } else if (result?.duplicate) {
        // The engine recognised the key and handed back the original run rather than
        // starting a second one. Saying "queued" here would be a lie.
        toast.info(`${configId} is already running`, {
          id: toastId,
          description: result.runId
            ? `Run id: ${result.runId}. You can start another run in a few seconds.`
            : "You can start another run in a few seconds.",
          duration: 8000,
        });
      } else {
        toast.success(`${configId} queued`, {
          id: toastId,
          description: result?.runId ? `Run id: ${result.runId}` : "The check engine accepted the run.",
          duration: 8000,
        });
      }

      return result ?? null;
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (error as { message?: string })?.message ??
        "Unknown error";

      toast.error(`Could not start ${configId}`, {
        id: toastId,
        description: message,
        duration: 10000,
      });

      return null;
    }
  };

  return { runCheck, isRunPending: isPending };
}
