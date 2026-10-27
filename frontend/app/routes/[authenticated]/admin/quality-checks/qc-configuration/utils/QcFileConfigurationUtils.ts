import type { LibraryItems } from "@/lib/useApi/types/librariesApis.types";
import type { FileBasedCheckFormValues, FileTypeOption } from "../data-conformance/file/context/QcFIleConfProvider";

// What a file's extension says about its type. Anything unknown leaves the type undecided.
export const FILE_TYPE_BY_EXTENSION: Record<string, "csv" | "excel" | "json"> = {
  csv: "csv",
  tsv: "csv",
  txt: "csv",
  xlsx: "excel",
  xls: "excel",
  json: "json",
};

export class QcFileConfigurationUtils {
  /** The type to save: the one chosen, else the one the file name's extension says, else csv. */
  static resolveFileType(sourceFileType: string | undefined, sourceFileName: string): "csv" | "excel" | "json" {
    if (sourceFileType === "csv" || sourceFileType === "excel" || sourceFileType === "json") return sourceFileType;

    const extension = String(sourceFileName || "").match(/\.([A-Za-z0-9]{1,8})$/)?.[1]?.toLowerCase() ?? "";

    return FILE_TYPE_BY_EXTENSION[extension] ?? "csv";
  }

  static normalizePathPart(value?: string | null) {
    return String(value || "").replace(/^\/+|\/+$/g, "");
  }

  static stripKnownFileExtension(value: string) {
    return String(value)
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.(csv|xlsx|xls|json)$/i, "");
  }

  static buildS3PickupUrl(params: {
    isAwsS3: boolean;
    selectedFileConnection?: any;
    sourceFileName: string;
    sourceFilePath: string;
    sourceFileType: FileBasedCheckFormValues["sourceFileType"];
    fileTypes: readonly FileTypeOption[];
  }) {
    const { isAwsS3, selectedFileConnection, sourceFileName, sourceFilePath, sourceFileType, fileTypes } = params;

    if (!isAwsS3 || !selectedFileConnection?.bucketOrContainerName || !sourceFileName) {
      return "";
    }

    const bucket = this.normalizePathPart(selectedFileConnection.bucketOrContainerName);
    const region = selectedFileConnection.region ? String(selectedFileConnection.region) : "";
    const cleanPath = this.normalizePathPart(sourceFilePath);
    const selectedFileType = fileTypes.find(item => item.value === sourceFileType);
    const extension = selectedFileType?.extension || sourceFileType || "csv";
    // The name is the file's exact name; only one saved without an extension gets the
    // type's, which is what the engine does too.
    const cleanName = this.normalizePathPart(sourceFileName);
    const fileName = /\.[A-Za-z0-9]{1,8}$/.test(cleanName) ? cleanName : `${cleanName}.${extension}`;
    const fullKey = [cleanPath, fileName].filter(Boolean).join("/");

    if (region) {
      return `https://${bucket}.s3.${region}.amazonaws.com/${fullKey}`;
    }

    return `https://${bucket}.s3.amazonaws.com/${fullKey}`;
  }

  static toggleDownstreamId(params: { item: LibraryItems; selectedDownstreams: number[] }) {
    const { item, selectedDownstreams } = params;
    const exists = selectedDownstreams.includes(item.id);

    if (exists) {
      return selectedDownstreams.filter(id => id !== item.id);
    }

    return [...selectedDownstreams, item.id];
  }

  static buildFileBasedCheckPayload(params: { data: FileBasedCheckFormValues; selectedDownstreams: number[] }) {
    const { data, selectedDownstreams } = params;

    const sourceFileType = this.resolveFileType(data.sourceFileType, data.sourceFileName);

    return {
      ...data,
      // Both are worked out, not asked: the type from the file name when it was left empty, and
      // where the file lives from the connection (S3 is the only storage there is).
      sourceFileType,
      fileAvailableOn: "s3" as const,
      sourceConnectionId: data.sourceConnectionId,
      sourceFilePath: data.sourceFilePath,
      // Only a csv has a delimiter, and empty means "detect it": the backend refuses an empty one.
      sourceFileDelimiter: sourceFileType === "csv" && data.sourceFileDelimiter ? data.sourceFileDelimiter : undefined,
      landingTable: data.createLanding ? data.landingTable : undefined,
      description: data.description?.trim() || undefined,
      impactedDownstreamIds: selectedDownstreams,
    };
  }
}
