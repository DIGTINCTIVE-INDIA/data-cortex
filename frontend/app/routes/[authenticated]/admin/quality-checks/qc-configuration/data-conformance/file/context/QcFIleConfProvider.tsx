import { useApi } from "@/lib/useApi";
import type { ParsedSchemaRow } from "@/lib/schemaFile/parseSchemaFile";
import type { LibraryItems } from "@/lib/useApi/types/librariesApis.types";
import { createContext, useContext, useMemo, useState } from "react";
import {
  useForm,
  type Control,
  type FieldErrors,
  type UseFormHandleSubmit,
  type UseFormRegister,
  type UseFormReset,
  type UseFormSetValue,
  type UseFormWatch,
} from "react-hook-form";
import { useNavigate } from "react-router";
import { QcFileConfigurationUtils } from "../../../utils/QcFileConfigurationUtils";
import type { QcFileRowConfiguration } from "../column-mapping";
import { toast } from "sonner";
import { declaredTypeForInferred } from "@/lib/schemaFile/nativeTypes";

// S3 only: no other connector is implemented engine-side.
export type FileStorageType = "s3";

export type SourceFileType = "csv" | "excel" | "json";

export type FileBasedCheckFormValues = {
  checkName: string;
  workstreamId: number;
  categoryId: number;
  dataSourceId: number;
  description: string;
  fileAvailableOn: FileStorageType;
  sourceConnectionId: string;
  sourceFileType: SourceFileType;
  sourceFileName: string;
  sourceFilePath: string;
  targetConnectionId: string;
  targetTableNamePrefix: string;
  createLanding: boolean;
  landingTable: string;
};
export type TraditionalDataType = "string" | "integer" | "float" | "date" | "datetime" | "boolean" | "varchar";

export type SchemaColumn = {
  columnName: string;
  columnOrder: number;
  dataType: TraditionalDataType;
  nullable: boolean;
};

export type Schema = {
  fileName: string;
  sourceFileType: string;
  sourceConnectionId: string;
  rowsScanned: number;
  columns: SchemaColumn[];
};

export type FileAvailableOnOption = {
  label: string;
  value: FileStorageType;
};

export type FileTypeOption = {
  label: string;
  value: SourceFileType;
  extension: string;
};

export const fileAvailableOnOptions = [
  { label: "AWS S3", value: "s3" },
] as const satisfies readonly FileAvailableOnOption[];

export const fileTypes = [
  { label: "CSV", value: "csv", extension: "csv" },
  { label: "Excel", value: "excel", extension: "xlsx" },
  { label: "JSON", value: "json", extension: "json" },
] as const satisfies readonly FileTypeOption[];

type QCConfigurationContextType = {
  schema: Schema | null;
  setSchema: React.Dispatch<React.SetStateAction<Schema | null>>;

  /** Columns taken from the uploaded schema file -- never read from the source file. */
  uploadedColumns: ParsedSchemaRow[];
  uploadedFileName: string | null;
  onSchemaFileParsed: (rows: ParsedSchemaRow[], fileName: string) => void;

  register: UseFormRegister<FileBasedCheckFormValues>;
  handleSubmit: UseFormHandleSubmit<FileBasedCheckFormValues>;
  control: Control<FileBasedCheckFormValues>;
  watch: UseFormWatch<FileBasedCheckFormValues>;
  reset: UseFormReset<FileBasedCheckFormValues>;
  setValue: UseFormSetValue<FileBasedCheckFormValues>;
  errors: FieldErrors<FileBasedCheckFormValues>;
  isSubmitting: boolean;

  selectedDownstreams: number[];
  setSelectedDownstreams: React.Dispatch<React.SetStateAction<number[]>>;
  toggleDownstream: (item: LibraryItems) => void;

  libraries: any;
  isPending: boolean;
  activeFileConnections: any;
  activeDbConnections: any;

  workstreamItems: LibraryItems[];
  categoryItems: LibraryItems[];
  dataSourceItems: LibraryItems[];
  downstreamItems: LibraryItems[];

  createLanding: boolean;
  fileAvailableOn: FileStorageType;
  selectedSourceConnectionId: string;
  sourceFileType: SourceFileType;
  sourceFileName: string;
  sourceFilePath: string;

  isAwsS3: boolean;
  selectedFileConnection: any;
  s3PickupUrl: string;

  isGettingSchema: boolean;
  fetchSchemaFromSource: () => Promise<void>;

  onSaveConfiguration: (qcFileRows: QcFileRowConfiguration) => Promise<void>;
  onSubmit: (data: FileBasedCheckFormValues) => Promise<void>;
};

const CONFIGURED_CHECKS = "/admin/quality-checks/configured-quality-checks";

const QCConfigurationContext = createContext<QCConfigurationContextType | null>(null);

export const QcFIleConfProvider = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();

  const [selectedDownstreams, setSelectedDownstreams] = useState<number[]>([]);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [uploadedColumns, setUploadedColumns] = useState<ParsedSchemaRow[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const onSchemaFileParsed = (rows: ParsedSchemaRow[], name: string) => {
    setUploadedColumns(rows);
    setUploadedFileName(name);
  };
  const { isPending: isSubmitting, mutateAsync: createCheck } = useApi("POST /api/qc-configuration/db/create-check");
  const { mutateAsync: createFileCheck } = useApi("POST /api/qc-configuration/file-storage/create-check");

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<FileBasedCheckFormValues>({
    mode: "onChange",
    defaultValues: {
      checkName: "",
      workstreamId: undefined,
      categoryId: undefined,
      dataSourceId: undefined,
      description: "",
      fileAvailableOn: "s3",
      sourceConnectionId: "",
      sourceFileType: "csv",
      sourceFileName: "",
      sourceFilePath: "",
      targetConnectionId: "",
      targetTableNamePrefix: "",
      createLanding: false,
      landingTable: "",
    },
  });

  const { data: libraries, isPending } = useApi("GET /api/libraries/qc-tags/all");
  const { data: fileConnections } = useApi("GET /api/file-storage/connections/list?page=1&limit=500");
  const { data: dbConnections } = useApi("GET /api/db/connections/list?page=1&limit=500");
  const { mutateAsync, isPending: isGettingSchema } = useApi("POST /api/qc-configuration/file-storage/get-schema");

  const workstreamItems = libraries?.data?.workstream ?? [];
  const categoryItems = libraries?.data?.category ?? [];
  const dataSourceItems = libraries?.data?.dataSource ?? [];
  const downstreamItems = libraries?.data?.impactedDownstream ?? [];

  const createLanding = watch("createLanding");
  const fileAvailableOn = watch("fileAvailableOn");
  const selectedSourceConnectionId = watch("sourceConnectionId");
  const sourceFileType = watch("sourceFileType");
  const sourceFileName = watch("sourceFileName");
  const sourceFilePath = watch("sourceFilePath");

  const isAwsS3 = fileAvailableOn === "s3";

  const activeFileConnections = useMemo(
    () => fileConnections?.data?.items?.filter(item => item.enabled) ?? [],
    [fileConnections]
  );

  const activeDbConnections = useMemo(
    () => dbConnections?.data?.items?.filter(item => item.enabled) ?? [],
    [dbConnections]
  );

  const selectedFileConnection = useMemo(() => {
    return activeFileConnections.find(item => item.connectionId === selectedSourceConnectionId);
  }, [activeFileConnections, selectedSourceConnectionId]);

  const s3PickupUrl = useMemo(() => {
    return QcFileConfigurationUtils.buildS3PickupUrl({
      isAwsS3,
      selectedFileConnection,
      sourceFileName,
      sourceFilePath,
      sourceFileType,
      fileTypes,
    });
  }, [isAwsS3, selectedFileConnection, sourceFileName, sourceFilePath, sourceFileType]);

  /**
   * Reads the real file from the source and takes its columns, as an alternative to
   * uploading a schema file.
   *
   * The columns are a snapshot of the file as it is NOW. Checks compare future runs against
   * that snapshot, so drift after this point is what they report -- and anything already
   * wrong in the file today is baked into the "expected" schema. Uploading a schema is the
   * way to state what SHOULD be there; this is for when the file is the reference.
   */
  const fetchSchemaFromSource = async () => {
    const valid = await trigger();

    if (!valid || selectedDownstreams.length === 0) {
      toast.error("Complete the form first", {
        description: "The file is found from the connection, path, name and type above.",
      });
      return;
    }

    try {
      const payload = QcFileConfigurationUtils.buildFileBasedCheckPayload({
        data: watch(),
        selectedDownstreams,
      });

      const response = await mutateAsync(payload as never);
      const columns = response?.data?.schema?.columns as
        | { columnName: string; columnOrder: number; dataType: string }[]
        | undefined;

      if (!columns?.length) {
        toast.error("No columns came back from the file");
        return;
      }

      onSchemaFileParsed(
        columns.map(column => ({
          field: column.columnName,
          dataType: declaredTypeForInferred(column.dataType),
          columnOrder: column.columnOrder,
        })),
        `${watch("sourceFileName")} (from source)`
      );

      toast.success(`Read ${columns.length} columns from the file`);
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Could not read the file";

      toast.error("Could not fetch the schema", { description: message, duration: 10000 });
    }
  };

  const onSubmit = async (data: FileBasedCheckFormValues) => {
    // The declared schema comes from the uploaded file, never from reading the source.
    // A quality check has to be able to report that the source drifted from what was
    // agreed, which is impossible if the expectation is derived from the source itself.
    if (!uploadedColumns.length) {
      toast.error("Upload a schema file first", {
        description: "It lists the expected column name, order and data type.",
      });
      return;
    }

    setSchema({
      fileName: uploadedFileName ?? data.sourceFileName,
      sourceFileType: data.sourceFileType,
      sourceConnectionId: data.sourceConnectionId,
      rowsScanned: 0,
      columns: uploadedColumns.map(row => ({
        columnName: row.field,
        columnOrder: row.columnOrder,
        dataType: row.dataType,
        nullable: true,
      })),
    });

    navigate("/admin/quality-checks/qc-configuration/data-conformance/file/column-mapping");
  };

  const toggleDownstream = (item: LibraryItems) => {
    setSelectedDownstreams(prev =>
      QcFileConfigurationUtils.toggleDownstreamId({
        item,
        selectedDownstreams: prev,
      })
    );
  };

  const onSaveConfiguration = async (qcFileRows: QcFileRowConfiguration) => {
    try {
      const formValues = watch();

      const finalFormValues = QcFileConfigurationUtils.buildFileBasedCheckPayload({
        data: formValues,
        selectedDownstreams,
      });

      await createFileCheck({
        config: finalFormValues,

        columns: qcFileRows.map((row, index) => ({
          ...row,
          columnOrder: index + 1,
        })),
      });

      toast.success(`Field rules saved for ${formValues.checkName}`, {
        description: `${qcFileRows.length} column${qcFileRows.length === 1 ? "" : "s"} configured.`,
      });

      // Same destination as the db flow. Previously this logged to the console and
      // stayed put, so a successful save looked identical to a failed one.
      navigate(CONFIGURED_CHECKS);
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (error as { message?: string })?.message ??
        "Unknown error";

      toast.error("Could not save the check", { description: message, duration: 10000 });
    }
  };

  return (
    <QCConfigurationContext.Provider
      value={{
        schema,
        setSchema,
        isGettingSchema,
        fetchSchemaFromSource,

        uploadedColumns,
        uploadedFileName,
        onSchemaFileParsed,

        register,
        handleSubmit,
        control,
        watch,
        reset,
        setValue,
        errors,
        isSubmitting,

        selectedDownstreams,
        setSelectedDownstreams,
        toggleDownstream,

        libraries,
        isPending,
        activeFileConnections,
        activeDbConnections,

        workstreamItems,
        categoryItems,
        dataSourceItems,
        downstreamItems,

        createLanding,
        fileAvailableOn,
        selectedSourceConnectionId,
        sourceFileType,
        sourceFileName,
        sourceFilePath,

        isAwsS3,
        selectedFileConnection,
        s3PickupUrl,

        onSaveConfiguration,
        onSubmit,
      }}>
      {children}
    </QCConfigurationContext.Provider>
  );
};

export const useQcFIleConfProvider = () => {
  const context = useContext(QCConfigurationContext);

  if (!context) {
    throw new Error("useQCFileConfiguration must be used inside QCConfigurationProvider");
  }

  return context;
};
