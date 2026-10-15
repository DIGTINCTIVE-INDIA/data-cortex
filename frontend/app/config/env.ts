class ENV {
  static ENV = import.meta.env.VITE_ENV as "prod" | "uat" | "staging" | "dev" | "local";
  /**
   * The API address. A page opened from another machine (http://<your-ip>:5173) must not call
   * "localhost:3000" -- that would be the visitor's own computer -- so when the configured
   * address is local and the page is not, the page uses its own origin. The dev server forwards
   * /api to the backend (see vite.config.ts).
   */
  static BACKEND_URL = (() => {
    const configured: string = import.meta.env.VITE_BACKEND_URL ?? "";
    if (typeof window === "undefined") return configured;

    const local = (host: string) => host === "localhost" || host === "127.0.0.1";

    try {
      return local(new URL(configured).hostname) && !local(window.location.hostname) ? "" : configured;
    } catch {
      return configured;
    }
  })();
}

export default ENV;
