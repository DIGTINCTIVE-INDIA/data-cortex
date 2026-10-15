import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  parseSchemaFile,
  SchemaFileError,
  type ParsedSchemaRow,
} from "@/lib/schemaFile/parseSchemaFile";
import { Alert01Icon, CheckmarkCircle02Icon, CloudUploadIcon, File02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type Props = {
  onParsed: (rows: ParsedSchemaRow[], fileName: string) => void;
  /** Shown instead of the empty state once a file has been accepted. */
  loadedFileName?: string | null;
  loadedRowCount?: number;
  disabled?: boolean;
  /**
   * Shrinks the control to a single row.
   *
   * Once the columns are loaded the page is about configuring them, and a large
   * drop zone still shouting "drop your schema file here" reads as an unfinished
   * step rather than a done one. It stays clickable so the file can be replaced.
   */
  compact?: boolean;
};

const ACCEPT = ".csv,.tsv,.xlsx,.xlsm,.xls,.json";

/**
 * Takes the declared schema of the source as an uploaded file.
 *
 * Deliberately never reads the live database or the real data file: the point of a
 * quality check is to catch the source drifting from what was agreed, which is
 * impossible if the expectation is derived from the source itself.
 */
export function SchemaFileDrop({ onParsed, loadedFileName, loadedRowCount, disabled, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;

    setIsParsing(true);
    setError(null);
    setWarnings([]);

    try {
      const { rows, warnings: notes } = await parseSchemaFile(file);
      setWarnings(notes);
      onParsed(rows, file.name);
    } catch (cause) {
      // A SchemaFileError already names the row and the problem; anything else is a
      // genuine surprise and should not be dressed up as a validation message.
      setError(
        cause instanceof SchemaFileError
          ? cause.message
          : `Could not read "${file.name}". ${(cause as Error)?.message ?? "Unknown error"}`
      );
    } finally {
      setIsParsing(false);

      // Allow re-selecting the same filename after a correction.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const hasFile = Boolean(loadedFileName);

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={event => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={event => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={event => {
          event.preventDefault();
          setIsDragging(false);
          if (!disabled) void handleFile(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex cursor-pointer rounded-2xl border-2 border-dashed transition-colors",
          compact
            ? "items-center gap-3 px-4 py-2.5 text-left"
            : "flex-col items-center justify-center gap-3 px-6 py-10 text-center",
          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          disabled && "pointer-events-none opacity-50",
          error && "border-destructive/60"
        )}>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl",
            compact ? "size-8" : "size-12",
            hasFile && !error ? "bg-green-600/10 text-green-600" : "bg-primary/10 text-primary"
          )}>
          <HugeiconsIcon icon={hasFile && !error ? CheckmarkCircle02Icon : CloudUploadIcon} size={compact ? 16 : 22} />
        </div>

        {isParsing ? (
          <p className="text-sm text-muted-foreground">Reading schema file…</p>
        ) : hasFile && !error ? (
          <div className={cn(compact ? "flex min-w-0 flex-1 items-center gap-2" : "contents")}>
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
              <HugeiconsIcon icon={File02Icon} size={16} className="shrink-0" />
              <span className="truncate">{loadedFileName}</span>
            </p>
            <p className={cn("text-xs text-muted-foreground", compact && "shrink-0")}>
              {loadedRowCount} column{loadedRowCount === 1 ? "" : "s"} loaded{compact ? "" : " · drop another file to replace"}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">Drop your schema file here, or click to browse</p>
            <p className="text-xs text-muted-foreground">
              CSV, Excel or JSON — one row per column, with <span className="font-medium">column name</span>,{" "}
              <span className="font-medium">column order</span> and <span className="font-medium">data type</span>
            </p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={event => void handleFile(event.target.files?.[0])}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <HugeiconsIcon icon={Alert01Icon} size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!error && warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-500">
          <p className="mb-1 font-medium">Interpreted some values:</p>
          <ul className="list-inside list-disc space-y-0.5 text-xs">
            {warnings.map(warning => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div
        className={cn(
          "flex items-center justify-between gap-3 text-xs text-muted-foreground",
          compact && "hidden"
        )}>
        <span>The schema is what the source is expected to look like — it is never read from the source itself.</span>
        <Button
          type="button"
          variant="ghost"
          className="h-8 shrink-0 text-xs"
          disabled={disabled}
          onClick={() => downloadTemplate()}>
          Download template
        </Button>
      </div>
    </div>
  );
}

/** A correct example beats a paragraph describing the format. */
function downloadTemplate() {
  const csv = [
    "column name,column order,data type",
    "customer_id,1,integer",
    "full_name,2,varchar",
    "email,3,string",
    "created_at,4,datetime",
    "is_active,5,boolean",
  ].join("\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = "schema-template.csv";
  link.click();

  URL.revokeObjectURL(url);
}
