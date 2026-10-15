type PageQuery = { page?: string; limit?: string };

export class Paginator {
	static getPage(query: PageQuery = { page: "1", limit: "10" }) {
		const page = parseInt(query.page ?? "1", 10);
		const limit = parseInt(query.limit ?? "20", 10);
		const offset = (page - 1) * limit;
		return { page, limit, offset };
	}

	static async getTotalCount(
		promise: Promise<
			Array<{
				count: number;
			}>
		>
	) {
		const result = await promise;
		return result[0]?.count || 0;
	}

	static paginate<T>(query: PageQuery = { page: "1", limit: "10" }, rows: T[], total: number) {
		const { page, limit } = Paginator.getPage(query);
		const totalPages = Math.ceil(total / limit);
		return {
			data: rows,
			pagination: {
				total,
				totalPages,
				currentPage: page,
				pageSize: limit,
			},
		};
	}
}
