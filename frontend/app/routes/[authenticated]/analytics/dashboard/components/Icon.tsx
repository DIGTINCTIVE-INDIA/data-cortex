import { cn } from "@/lib/utils";

export const ExpandIcon = ({ className }: { className?: string }) => {
  return (
    <svg className={cn("size-4", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3H3v5" />
      <path d="M3 3l7 7" />
      <path d="M16 3h5v5" />
      <path d="M21 3l-7 7" />
      <path d="M8 21H3v-5" />
      <path d="M3 21l7-7" />
      <path d="M16 21h5v-5" />
      <path d="M21 21l-7-7" />
    </svg>
  );
};

export const DownloadIcon = ({ className }: { className?: string }) => {
  return (
    <svg className={cn("size-4", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
};

export const CloseIcon = ({ className }: { className?: string }) => {
  return (
    <svg className={cn("size-4", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
};
