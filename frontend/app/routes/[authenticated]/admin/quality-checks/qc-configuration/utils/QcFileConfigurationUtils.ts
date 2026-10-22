import type { LibraryItems } from "@/lib/useApi/types/librariesApis.types";
import type { FileBasedCheckFormValues, FileTypeOption } from "../data-conformance/file/context/QcFIleConfProvider";

export class QcFileConfigurationUtils {
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
    const extension = selectedFileType?.extension || sourceFileType;
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

    return {
      ...data,
      sourceConnectionId: data.sourceConnectionId,
      sourceFilePath: data.sourceFilePath,
      landingTable: data.createLanding ? data.landingTable : undefined,
      description: data.description?.trim() || undefined,
      impactedDownstreamIds: selectedDownstreams,
    };
  }
}
