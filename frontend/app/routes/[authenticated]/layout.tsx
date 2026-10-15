import AuthSideBar from "@/components/layout/AuthSideBar";
import AuthTopBar from "@/components/layout/AuthTopBar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAuthStore } from "@/contexts/AuthContext";
import { can, permissionForPath } from "@/lib/permissions";
import { Navigate, Outlet, useLocation } from "react-router";

export default function AuthenticatedLayout() {
  const auth = useAuthStore(state => state.auth);
  const status = auth.status;
  const { pathname } = useLocation();

  if (status === "loading") return null;

  if (status === "unauthenticated") {
    return <Navigate to="/login" />;
  }

  // Typing a URL must not get past what the menu hides. The server refuses the data
  // either way; this stops a signed-in user landing on a page that can only fail.
  const needed = permissionForPath(pathname);
  const denied = needed !== null && !can(auth.session?.role, needed);

  return (
    <SidebarProvider defaultOpen>
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <AuthSideBar />
      </div>

      {/* Mobile / Tablet Topbar */}
      <div className="lg:hidden">
        <AuthTopBar />
      </div>

      <main className="w-full min-w-0 px-3 py-3 lg:px-2">
        <div className="mx-auto w-full max-w-[1440px] overflow-auto pt-16 lg:pt-6 px-6 pb-6">
          <div className="mx-auto space-y-8">
            {denied ? <AccessDenied /> : <Outlet />}
          </div>
        </div>
      </main>
    </SidebarProvider>
  );
}

function AccessDenied() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-semibold text-foreground">You do not have access to this page</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Your role does not include it. If you need access, ask an administrator.
      </p>
    </div>
  );
}
