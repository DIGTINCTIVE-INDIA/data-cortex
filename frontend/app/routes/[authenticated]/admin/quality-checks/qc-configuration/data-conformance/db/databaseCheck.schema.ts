export type DatabaseCheckFormValues = {
  checkName: string;
  workstreamId: number;
  categoryId: number;
  dataSourceId: number;
  description: string;
  sourceDbId: string;
  sourceTableName: string;
  targetConnectionId: string;
  targetTableNamePrefix: string;
  createLanding: boolean;
  landingTable: string;
  impactedDownstreamIds: number[];
};

export const databaseCheckDefaultValues: DatabaseCheckFormValues = {
  checkName: "",
  workstreamId: undefined as any,
  categoryId: undefined as any,
  dataSourceId: undefined as any,
  description: "",
  sourceDbId: "",
  sourceTableName: "",
  targetConnectionId: "",
  targetTableNamePrefix: "",
  createLanding: false,
  landingTable: "",
  impactedDownstreamIds: [],
};

export const databaseCheckValidation = {
  checkName: {
    required: "Check name is required",
    minLength: {
      value: 3,
      message: "Minimum 3 characters required",
    },
  },
  workstreamId: {
    required: "Please select a workstream",
  },
  categoryId: {
    required: "Please select a category",
  },
  dataSourceId: {
    required: "Please select a data source",
  },
  sourceDbId: {
    required: "Select source database",
  },
  sourceTableName: {
    required: "Source table is required",
  },
  targetConnectionId: {
    required: "Select target connection",
  },
  targetTableNamePrefix: {
    required: "Target prefix required",
  },
  landingTable: {
    required: "Landing table name is required",
  },
};
