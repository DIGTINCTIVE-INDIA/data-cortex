import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { MenuIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export default function AuthTopBar() {
  const { setOpenMobile } = useSidebar();

  return (
    <header className="fixed left-0 right-0 top-0 z-40 px-3 pt-3">
      <div className="mx-auto flex h-12 max-w-[1440px] items-center justify-between rounded-2xl bg-card/90 px-3 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.35)] ring-1 ring-border/60 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Button size="icon-sm" variant="ghost" onClick={() => setOpenMobile(true)} className="rounded-xl">
            <HugeiconsIcon icon={MenuIcon} size={20} />
          </Button>

          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
              DC
            </div>

            <span className="text-sm font-semibold text-foreground">DataCortex</span>
          </div>
        </div>
      </div>
    </header>
  );
}
