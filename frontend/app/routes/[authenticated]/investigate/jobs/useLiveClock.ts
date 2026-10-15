import { useEffect, useState } from "react";

/**
 * A once-a-second clock that only runs while something needs it.
 *
 * The page polls the server every 10 seconds, but a duration that visibly sits still for
 * 10 seconds looks frozen. So the number is counted locally between polls -- no network
 * involved, one state update a second -- and replaced by the server's real figure the
 * moment the job is seen to have finished. With nothing live, the interval is not even
 * created, so a page of finished jobs costs nothing.
 */
export function useLiveClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [active]);

  return now;
}
