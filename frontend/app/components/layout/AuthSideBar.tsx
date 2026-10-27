import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { useAuthStore } from "@/contexts/AuthContext";
import { can, permissionForPath } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router";

import { useApi } from "@/lib/useApi";
import { toast } from "sonner";
import {
  AlertIcon,
  ChartIcon,
  ClipboardIcon,
  DatabaseIcon,
  FileIcon,
  HomeIcon,
  Key01Icon,
  Task01Icon,
  LayersIcon,
  MenuIcon,
  MoonIcon,
  NotificationIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

/* ===============================
   SIDEBAR CONFIG
================================ */

/**
 * What each role sees, by section. An item shows when the role has its permission (see
 * lib/permissions.ts) and a section shows only when at least one of its items does --
 * so the headings need no per-role logic of their own.
 *
 *   analyst   Analytics (including the QC Report), Investigate (alerts, jobs, Database Explorer),
 *             Checks (library, configured checks -- they can run them)
 *   engineer  the above + QC Configuration, Connections, Email Notifications
 *   admin     everything, and the only role that ever sees the "Admin" heading
 *             (Users & Access, Libraries)
 *
 * "Admin" used to hold the check pages as well, so an analyst saw an "Admin" section
 * containing pages they were allowed to open. It now holds only what is admin-only.
 */
const sections = [
  {
    title: "Analytics",
    items: [
      { title: "Dashboard", path: "/analytics/dashboard", icon: HomeIcon },
      { title: "Analyze Workstream", path: "/analytics/analyze-workstream", icon: UserGroupIcon },
      { title: "QC Report", path: "/admin/reports/qc-summary-report", icon: FileIcon },
    ],
  },
  {
    title: "Investigate",
    items: [
      { title: "QC Alerts", path: "/investigate/qc-alerts", icon: AlertIcon },
      { title: "Jobs", path: "/investigate/jobs", icon: Task01Icon },
      { title: "Database Explorer", path: "/investigate/database-explorer", icon: SearchIcon },
    ],
  },
  {
    title: "Checks",
    items: [
      { title: "DQ Checks Library", path: "/admin/quality-checks/dq-checks-lib", icon: ChartIcon },
      { title: "Configured Checks", path: "/admin/quality-checks/configured-quality-checks", icon: ClipboardIcon },
      { title: "QC Configuration", path: "/admin/quality-checks/qc-configuration", icon: SettingsIcon },
      { title: "Connections", path: "/admin/connections/db-connections", icon: DatabaseIcon },
      { title: "Email Notifications", path: "/admin/connections/email-notifications", icon: NotificationIcon },
    ],
  },
  {
    title: "Admin",
    items: [
      // People and service identities share this page; it has a tab for each.
      { title: "Users & Access", path: "/admin/user-management", icon: UserIcon },
      { title: "Libraries", path: "/admin/configure-libraries", icon: LayersIcon },
    ],
  },
];

/* ===============================
   MAIN SIDEBAR
================================ */

const THEMES = [
  { key: "blue", bg: "bg-primary" },

  { key: "orange", bg: "bg-[var(--warning)]" },
  { key: "purple", bg: "bg-[var(--purple)]" },

  { key: "emerald", bg: "bg-[var(--success)]" },
  { key: "rose", bg: "bg-[var(--error)]" },

  { key: "amber", bg: "bg-[var(--amber)]" },
  { key: "brick", bg: "bg-red-700" },
  { key: "rust", bg: "bg-orange-800" },

  { key: "cyan", bg: "bg-[var(--info)]" },
  { key: "indigo", bg: "bg-[var(--indigo)]" },
];

export function AuthSideBar() {
  const logout = useAuthStore(state => state.logout);
  const { mutateAsync, isPending: isLoggingOut } = useApi("POST /api/auth/logout");

  const handleLogout = async () => {
    try {
      await mutateAsync({});
    } catch {
      // Still sign out locally -- the user asked to leave. But say so, because
      // the server-side session (and its refresh token) may still be alive.
      toast.error("Signed out on this device. The server session may still be active.");
    }

    logout();
  };
  const { state, setOpen } = useSidebar();
  const isCollapsed = state === "collapsed";

  // What a page needs comes from one place (lib/permissions), so the menu, the route
  // guard and the buttons cannot disagree. A page with no entry there needs only "view".
  const role = useAuthStore(state => state.auth.session?.role);
  const session = useAuthStore(state => state.auth.session);

  const visibleSections = sections
    .map(section => ({
      ...section,
      items: section.items.filter(item => can(role, permissionForPath(item.path) ?? "view")),
    }))
    .filter(section => section.items.length > 0);

  type Mode = "light" | "dark";
  type Theme = "blue" | "orange" | "purple" | "emerald" | "rose" | "amber" | "brick" | "rust" | "cyan" | "indigo";

  const [mode, setMode] = useState<Mode>("light");
  const [theme, setTheme] = useState<Theme>("blue");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setSettingsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    const saved = localStorage.getItem("theme") as any;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = saved || (prefersDark ? "dark" : "light");

    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggleMode = () => {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    localStorage.setItem("mode", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const changeTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  useEffect(() => {
    const savedMode = localStorage.getItem("mode") as Mode;
    const savedTheme = localStorage.getItem("theme") as Theme;

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    const initialMode = savedMode || (prefersDark ? "dark" : "light");
    const initialTheme = savedTheme || "blue";

    setMode(initialMode);
    setTheme(initialTheme);

    document.documentElement.classList.toggle("dark", initialMode === "dark");
    document.documentElement.setAttribute("data-theme", initialTheme);
  }, []);

  return (
    <div
      className="relative"
      onClick={() => isCollapsed && setOpen(true)} // click anywhere to open
    >
      <Sidebar collapsible="icon">
        {/* ================= HEADER ================= */}
        <SidebarHeader>
          <div className="flex items-center justify-between py-4 px-3">
            {/* LOGO */}
            <div className="relative group flex items-center gap-3">
              <div
                className={cn(
                  "size-10 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground font-semibold",
                  isCollapsed && "size-8 -ml-1.5"
                )}>
                DC
              </div>

              {/* Toggle on hover (collapsed) */}
              {isCollapsed && (
                <div
                  className="absolute inset-0 flex items-center justify-center -ml-2 bg-white opacity-0 transition-opacity hover:opacity-100 dark:bg-black cursor-pointer"
                  onClick={e => {
                    e.stopPropagation();
                    setOpen(true);
                  }}>
                  <HugeiconsIcon icon={MenuIcon} size={18} />
                </div>
              )}

              {!isCollapsed && <span className="text-lg font-semibold text-foreground">DataCortex</span>}
            </div>

            {/* Toggle when expanded */}
            {!isCollapsed && (
              <button onClick={() => setOpen(false)}>
                <HugeiconsIcon icon={MenuIcon} size={18} />
              </button>
            )}
          </div>
        </SidebarHeader>

        {/* ================= CONTENT ================= */}
        <SidebarContent className={cn("px-2 space-y-4", isCollapsed && "space-y-0")}>
          {visibleSections.map(section => (
            <div key={section.title}>
              {!isCollapsed && <div className="px-2 text-xs uppercase text-muted-foreground mb-1">{section.title}</div>}

              <div className="space-y-1">
                {section.items.map(item => (
                  <NavLink key={item.path} to={item.path}>
                    {({ isActive }) => (
                      // Static on purpose. Items used to animate their layout and scale up on
                      // hover, so the whole list shifted under the pointer as it moved.
                      <div
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}>
                        <HugeiconsIcon icon={item.icon} size={20} />
                        {!isCollapsed && <span className="text-sm font-medium truncate">{item.title}</span>}
                      </div>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </SidebarContent>

        {/* ================= FOOTER (SETTINGS DROPDOWN) ================= */}
        <SidebarFooter className="relative mx-2 border-t border-border/60 px-0 pb-4 pt-3">
          {/* Opens on click and closes on an outside click or Escape. It used to open
              and close as the pointer crossed it, so brushing past the corner made the
              panel flicker in and out. */}
          <div ref={accountRef} className="relative">
            {/* One control for "me and my settings": who is signed in, and (on hover) the
                appearance and account options. It used to be two separate things --
                a Settings row and, briefly, a user card -- for what is one place. */}
            <div
              role="button"
              tabIndex={0}
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
              onClick={e => {
                e.stopPropagation();
                setSettingsOpen(open => !open);
              }}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSettingsOpen(open => !open);
                }
              }}
              className={cn(
                "cursor-pointer rounded-2xl p-3 ring-1 transition-colors",
                // A resting surface of its own, softly tinted toward the theme colour, so it reads as
                // one object distinct from the nav above it; a stronger tint while its panel is open.
                settingsOpen
                  ? "bg-primary/15 ring-primary/40"
                  : "bg-gradient-to-br from-primary/10 via-muted/50 to-muted/30 ring-border/60 hover:ring-primary/30"
              )}
              title={session ? `${session.fullName} · ${session.email} · ${session.role}` : "Account"}>
              {/* Row 1: avatar, name, role badge, and the settings icon at the far right. */}
              <div className="flex items-center gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground shadow-sm">
                  {session ? (
                    session.fullName
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map(part => part[0]!.toUpperCase())
                      .join("")
                  ) : (
                    <HugeiconsIcon icon={SettingsIcon} size={16} />
                  )}
                </div>

                {!isCollapsed && session && (
                  <>
                    <p className="min-w-0 truncate text-sm font-semibold text-foreground">{session.fullName}</p>

                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        // The same colours the Users page uses for each role.
                        session.role === "admin" && "bg-primary/15 text-primary",
                        session.role === "engineer" && "bg-[var(--purple)]/15 text-[var(--purple)]",
                        session.role === "analyst" && "bg-[var(--teal)]/15 text-[var(--teal)]",
                        session.role === "service" && "bg-muted text-muted-foreground"
                      )}>
                      {session.role}
                    </span>

                    <HugeiconsIcon icon={SettingsIcon} size={16} className="ml-auto shrink-0 text-muted-foreground" />
                  </>
                )}
              </div>

              {/* Row 2: the email, on its own line at the full width of the card -- not
                  indented past the avatar -- so a long address has room and nothing
                  above it has to share its width. */}
              {!isCollapsed && session && (
                <p className="mt-2 truncate border-t border-border/50 pt-2 text-xs text-muted-foreground">{session.email}</p>
              )}
            </div>

            {/* Floating Panel */}
            <AnimatePresence>
              {settingsOpen && (
                <motion.div
                  // Fade only: sliding and scaling made the panel look like it was
                  // arriving from somewhere, which read as the sidebar moving.
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className={cn(
                    "absolute bottom-0 left-full ml-3 w-56 z-50",

                    // surface
                    "bg-card/95 backdrop-blur-xl",

                    // depth (no harsh border)
                    "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]",

                    // shape
                    "rounded-2xl",

                    // subtle outline
                    "ring-1 ring-border/60",

                    // spacing
                    "p-2 space-y-2"
                  )}>
                  {/* ================= APPEARANCE ================= */}
                  <div className="px-2 pt-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Appearance
                  </div>

                  {/* MODE TOGGLE */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      toggleMode();
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition",
                      "hover:bg-muted"
                    )}>
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={mode === "light" ? SunIcon : MoonIcon} size={18} />
                      <span>{mode === "light" ? "Light Mode" : "Dark Mode"}</span>
                    </div>

                    <div className="text-xs text-muted-foreground">{mode === "light" ? "On" : "Off"}</div>
                  </button>

                  {/* THEME COLORS */}
                  <div className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Theme
                  </div>

                  <div className="grid grid-cols-5 gap-2 px-2 pb-1">
                    {THEMES.map(t => (
                      <button
                        key={t.key}
                        onClick={e => {
                          e.stopPropagation();
                          changeTheme(t.key as Theme);
                        }}
                        className={cn(
                          "relative size-7 rounded-full",

                          t.bg,

                          // subtle border
                          "ring-1 ring-border",

                          // hover
                          "hover:scale-105",

                          // active
                          theme === t.key && "ring-2 ring-ring"
                        )}>

                      </button>
                    ))}
                  </div>

                  {/* DIVIDER */}
                  <div className="h-px bg-border/60 my-1" />

                  {/* ================= ACCOUNT ================= */}
                  <div className="px-2 pt-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Account
                  </div>

                  {/* LOGOUT */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleLogout();
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition",
                      "hover:bg-muted",
                      "text-destructive hover:text-destructive"
                    )}>
                    <HugeiconsIcon icon={UserIcon} size={18} />
                    Logout
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </SidebarFooter>
      </Sidebar>
    </div>
  );
}

export default AuthSideBar;
