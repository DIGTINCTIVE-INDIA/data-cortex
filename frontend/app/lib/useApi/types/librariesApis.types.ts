export type AllLibrariesResponse = {
  category: LibraryItems[];
  workstream: LibraryItems[];
  impactedDownstream: LibraryItems[];
  dataSource: LibraryItems[];
};

/** One data source on the DQ Checks Library board, aggregated server-side. */
export type DqCheckSource = {
  id: number;
  name: string;
  checks: number;
  active: number;
  failed: number;
  lastRun: string | null;
  workstreams: string[];
};

export type LibraryItems = {
  id: number;
  tagType: string;
  tagTitle: string;
  description: string;
  userId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
};

// --------------------------

export type AddMutationBody = {
  title: string;
  description?: string;
  type: string;
};
