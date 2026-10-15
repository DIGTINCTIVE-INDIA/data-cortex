import type { RegisterOptions } from "react-hook-form";

export type CustomSqlCheckFormValues = {
  checkName: string;
  checkDescription: string;

  categoryId: number;
  workstreamId: number;
  dataSourceId: number;
  impactedDownstreamId: number[];

  sourceConnectionId: string;
  targetConnectionId: string;

  targetTablePrefix: string;
  sqlQuery: string;
  criticality: string;
  errorMessage: string;
};

export const customSqlCheckDefaultValues: CustomSqlCheckFormValues = {
  checkName: "",
  checkDescription: "",

  categoryId: undefined as any,
  workstreamId: undefined as any,
  dataSourceId: undefined as any,
  impactedDownstreamId: [],

  sourceConnectionId: "",
  targetConnectionId: "",

  targetTablePrefix: "",
  sqlQuery: "",
  criticality: "",
  errorMessage: "",
};

export const customSqlCheckValidation = {
  checkName: {
    required: "Check name is required",
    minLength: {
      value: 3,
      message: "Minimum 3 characters required",
    },
  } satisfies RegisterOptions<CustomSqlCheckFormValues, "checkName">,

  workstreamId: {
    required: "Please select a workstream",
  } satisfies RegisterOptions<CustomSqlCheckFormValues, "workstreamId">,

  categoryId: {
    required: "Please select a check category",
  } satisfies RegisterOptions<CustomSqlCheckFormValues, "categoryId">,

  dataSourceId: {
    required: "Please select a data source",
  } satisfies RegisterOptions<CustomSqlCheckFormValues, "dataSourceId">,

  impactedDownstreamIds: {
    validate: value => {
      if (!value || value.length === 0) {
        return "Please select at least one impacted downstream";
      }

      return true;
    },
  } satisfies RegisterOptions<CustomSqlCheckFormValues, "impactedDownstreamId">,

  sourceConnectionId: {
    required: "Please select a source database connection",
  } satisfies RegisterOptions<CustomSqlCheckFormValues, "sourceConnectionId">,

  targetConnectionId: {
    required: "Please select a target database connection",
  } satisfies RegisterOptions<CustomSqlCheckFormValues, "targetConnectionId">,

  targetTablePrefix: {
    required: "Target table prefix is required",
  } satisfies RegisterOptions<CustomSqlCheckFormValues, "targetTablePrefix">,

  sqlQuery: {
    required: "SQL query is required",
    maxLength: {
      value: 5000,
      message: "Maximum 5000 characters allowed",
    },
    validate: value => {
      const trimmed = value.trim().toLowerCase();

      if (!trimmed.startsWith("select")) {
        return "Only SELECT queries are allowed";
      }

      return true;
    },
  } satisfies RegisterOptions<CustomSqlCheckFormValues, "sqlQuery">,

  criticality: {
    required: "Please select criticality",
  } satisfies RegisterOptions<CustomSqlCheckFormValues, "criticality">,

  errorMessage: {
    // Required: error_message is NOT NULL in the database and the API now
    // rejects a create without it. Catching it here means the user is told
    // in the form rather than by a failed save.
    required: "Error message is required",
    validate: value => {
      if (!value?.trim()) return "Error message is required";
      if (value.trim().length < 3) return "Minimum 3 characters required";
      if (value.trim().length > 255) return "Maximum 255 characters allowed";
      return true;
    },
  } satisfies RegisterOptions<CustomSqlCheckFormValues, "errorMessage">,
};
