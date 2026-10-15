/** Matches check_criticality in the database -- lowercase, not the UI labels. */
export type RuleCriticality = "low" | "medium" | "high";

export type NotificationRule = {
  ruleId: string;
  name: string;
  /** qc_tags ids of type `impacted_downstream`. */
  impactedDownstream: number[];
  /** Same ids with their names. `enabled: false` = retired in Configure Libraries. */
  impactedDownstreamDetails: { id: number; title: string; enabled: boolean }[];
  criticality: RuleCriticality[];
  recipients: string[];
  enabled: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string | null;
  deactivatedAt: string | null;
};

export type NotificationRuleMutationBody = {
  name: string;
  impactedDownstreamIds: number[];
  criticality: RuleCriticality[];
  recipients: string[];
};

export type TestEmailMutationBody = {
  to: string;
};
