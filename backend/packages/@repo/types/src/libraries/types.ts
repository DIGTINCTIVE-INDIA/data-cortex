export type QCTagType = "impacted_downstream" | "workstream" | "data_source" | "category";

export type AddQcTagPayload = {
	type: QCTagType;
	title: string;
	description?: string | null | undefined;
};

export type UpdateQcTagPayload = {
	type?: QCTagType;
	title?: string;
	description?: string | null;
	enabled?: boolean;
};
