import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A small "i" that explains a field on hover (or keyboard focus), so the explanation does not
 * take up a line of the form. Sits inside a field's label.
 */
export function InfoHint({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label={text}
            tabIndex={0}
            className={cn(
              "ml-1 inline-flex size-3.5 cursor-help items-center justify-center rounded-full border border-current",
              "align-[-1px] text-[9px] font-semibold leading-none opacity-60 transition-opacity",
              "hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none",
              className
            )}
          />
        }>
        i
      </TooltipTrigger>

      <TooltipContent side="top">{text}</TooltipContent>
    </Tooltip>
  );
}
