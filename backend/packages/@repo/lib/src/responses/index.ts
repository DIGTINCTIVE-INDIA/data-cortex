type ResponseType = "query" | "paginated" | "mutation";

interface Pagination {
	total: number;
	totalPages: number;
	currentPage: number;
	pageSize: number;
}

interface Toast {
	type: "success" | "error";
	message: string;
	showToast: boolean;
}

export type APIResponse<T> =
	| { type: "query"; success: boolean; data: T | null }
	| { type: "paginated"; success: boolean; data: { items: T[]; pagination: Pagination } }
	| { type: "mutation"; success: boolean; data: T; toast: Toast };

interface PaginatedPayload<T> {
	items: T[];
	pagination: Pagination;
}

interface MutationPayload<T> {
	data?: T;
	toast?: Partial<Toast>;
}

/**
 * This Map links the 'type' to the exact 'payload' interface.
 * This is the secret for perfect IntelliSense.
 */
interface ResponsePayloadMap<T> {
	query: T | null;
	paginated: PaginatedPayload<T>;
	mutation: MutationPayload<T>;
}

/**
 * Generates a standardized, type-safe API response for the frontend.
 * * This function supports three response patterns:
 * 1. **query**: Standard data fetching.
 * 2. **paginated**: List-based data with metadata.
 * 3. **mutation**: Data modifications that require a toast notification.
 * * @template K - The type of response: "query", "paginated", or "mutation".
 * @template T - The shape of the data being returned.
 * * @param type - The response category which determines the structure of the payload.
 * @param payload - The data and optional metadata (like pagination or toast settings).
 * * @example
 * // Query Example
 * const user = { id: 1, name: "John" };
 * jsonResponse("query", { user });
 * * @example
 * // Paginated Example
 * jsonResponse("paginated", {
 * items: [{ id: 1 }],
 * pagination: { total: 100, totalPages: 10, currentPage: 1, pageSize: 10 }
 * });
 * * @example
 * // Mutation Example
 * jsonResponse("mutation", {
 * data: { userId: 1 },
 * toast: { type: "success", message: "User updated!" }
 * });
 * * @returns A strictly typed object matching the {@link APIResponse} union.
 */
export function jsonResponse<K extends ResponseType, T>(type: K, payload: ResponsePayloadMap<T>[K]): APIResponse<T> {
	const success = true;

	switch (type) {
		case "query":
			return {
				type,
				success,
				data: payload as T | null,
			} as APIResponse<T>;

		case "paginated": {
			const p = payload as PaginatedPayload<T>;
			return {
				type,
				success,
				data: {
					items: p.items,
					pagination: p.pagination,
				},
			} as APIResponse<T>;
		}

		case "mutation": {
			const p = payload as MutationPayload<T>;

			return {
				type,
				success,
				...(p.data !== null && p.data !== undefined ? { data: p.data } : {}),

				toast: {
					type: p.toast?.type ?? "success",
					message: p.toast?.message ?? "Operation successful",
					showToast: p.toast?.showToast ?? true,
				},
			} as APIResponse<T>;
		}

		default:
			throw new Error(`Invalid Response Type`);
	}
}
