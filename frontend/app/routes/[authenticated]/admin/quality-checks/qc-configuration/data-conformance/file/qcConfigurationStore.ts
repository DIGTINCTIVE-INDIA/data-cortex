import { create } from "zustand";

type SchemaColumn = {
  columnName: string;
  columnOrder: number;
  dataType: string;
  nullable: boolean;
};

type SchemaResponse = {
  fileName: string;
  sourceFileType: string;
  sourceConnectionId: string;
  rowsScanned: number;
  columns: SchemaColumn[];
};

type QCConfigurationStore = {
  schema: SchemaResponse | null;

  configurationPayload: any;

  setSchema: (schema: SchemaResponse) => void;

  setConfigurationPayload: (payload: any) => void;

  reset: () => void;
};

export const useQCConfigurationStore = create<QCConfigurationStore>(set => ({
  schema: null,

  configurationPayload: null,

  setSchema: (schema: SchemaResponse) =>
    set({
      schema: schema,
    }),

  setConfigurationPayload: (payload: any) =>
    set({
      configurationPayload: payload,
    }),

  reset: () =>
    set({
      schema: null,
      configurationPayload: null,
    }),
}));
