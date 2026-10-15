import type { StaleTimeEnum } from "../types/common.types";

// StaleTimeEnum = "0" | "1" | "5" | "15"

class UseApiUtil {
  /**
   * Convert staleTime (string minutes) to milliseconds.
   * If not provided, or invalid → defaults to `0`.
   */
  static formatTimeInMs = (timeInStr: StaleTimeEnum | undefined = "0"): number => {
    if (!timeInStr) return 0;

    const minutes = Number(timeInStr);

    if (isNaN(minutes) || minutes < 0) return 0;

    return minutes * 60 * 1000;
  };
}

export default UseApiUtil;