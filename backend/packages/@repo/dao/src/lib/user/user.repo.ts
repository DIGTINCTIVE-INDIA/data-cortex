import { and, count, db, desc, eq, ne, usersTable } from "@repo/db";
import { IUserSession, PaginationType, Paginator } from "@repo/lib";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import type { CreateUserPayload } from "@repo/types";
import { accessCache } from "../access/access-cache.js";
import { SSORepo } from "./user.lib.js";

export class UserRepo {
	constructor(
		private ssoRepo: SSORepo,
		private userSession: IUserSession,
	) {}
	async redirect() {
		const url = await this.ssoRepo.getAuthUrl();
		return url;
	}

	/**
	 * -> exchanges code with SSO -> finds user by email
	 * -> if not found throws error -> else creates session & returns tokens + user
	 */
	async handleCallback(code: string) {
		const { account } = await this.ssoRepo.exchangeAuthCode(code);

		if (!account) {
			throw new ErrorResponse("Something went wrong from our side.", 400);
		}

		// check user email id is present in our db
		const user = await db.query.usersTable.findFirst({
			where: and(eq(usersTable.email, account.username?.toLowerCase()), eq(usersTable.enabled, true)),
		});

		if (!user) {
			throw new ErrorResponse("User not found", 404);
		}

		const session = await this.userSession.startSession({
			email: user.email,
			fullName: user.fullName,
			id: user.id,
			role: user.role,
		});

		return {
			accessToken: session.accessToken,
			refreshToken: session.refreshToken,
			user,
		};
	}

	/**
	 * -> finds user by id -> if not found returns null
	 * -> else removes sensitive fields & returns safe user
	 */
	async getUserById(userId: string) {
		const user = await db.query.usersTable.findFirst({
			where: and(eq(usersTable.id, userId), eq(usersTable.enabled, true)),
		});
		if (!user) return null;

		const { refreshToken, lastLoginAt, createdBy, deactivatedAt, ...safeUser } = user;

		return safeUser;
	}

	/**
	 * -> checks if email already exists -> if yes throws error
	 * -> else creates user with admin context -> returns sanitized user
	 */
	async createUserByAdmin(payload: CreateUserPayload, myUserId: string) {
		const existing = await db.query.usersTable.findFirst({
			where: eq(usersTable.email, payload.email.toLowerCase()),
		});

		if (existing) {
			throw new ErrorResponse("User with this email already exists", 400);
		}

		const [user] = await db
			.insert(usersTable)
			.values({
				fullName: payload.fullName,
				email: payload.email,
				role: payload.role,
				createdBy: myUserId,
				refreshToken: null,
				enabled: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();

		if (!user) {
			throw new ErrorResponse("Failed to create user", 500);
		}

		const { refreshToken, lastLoginAt, createdBy, deactivatedAt, ...safeUser } = user;

		return safeUser;
	}

	/**
	 * -> finds user by id -> if not found throws error
	 * -> checks email uniqueness if updated -> updates allowed fields -> returns sanitized user
	 */
	async updateUser(userId: string, payload: Partial<CreateUserPayload>) {
		const existingUser = await db.query.usersTable.findFirst({
			where: and(eq(usersTable.id, userId), eq(usersTable.enabled, true)),
		});

		if (!existingUser) {
			throw new ErrorResponse("User not found", 404);
		}

		if (payload.email) {
			const emailExists = await db.query.usersTable.findFirst({
				where: eq(usersTable.email, payload.email.toLowerCase()),
			});

			if (emailExists && emailExists.id !== userId) {
				throw new ErrorResponse("Email already in use", 400);
			}
		}

		const updateData: Partial<typeof usersTable.$inferInsert> = {};

		if (payload.fullName !== undefined) {
			updateData.fullName = payload.fullName;
		}

		if (payload.email !== undefined) {
			updateData.email = payload.email.toLowerCase();
		}

		if (payload.role !== undefined) {
			// A service identity has no person behind it to hold another role, and a person
			// is never turned into one -- those are created through the service-user flow.
			if (existingUser.role === "service" && payload.role !== "service") {
				throw new ErrorResponse("A service user's role cannot be changed", 400);
			}

			// Admin is a fixed role: once someone is an admin, nobody -- including that
			// admin -- can change it through the product. Admins are peers, so allowing it
			// meant any admin could demote any other, or themselves. Anyone else's role
			// can be changed by an admin, including promoting them to admin.
			// (An unchanged role in the payload is not a change and is let through.)
			if (existingUser.role === "admin" && payload.role !== "admin") {
				throw new ErrorResponse("An admin's role cannot be changed.", 403);
			}

			updateData.role = payload.role;
		}

		updateData.updatedAt = new Date();

		const [updatedUser] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, userId)).returning();

		if (!updatedUser) {
			throw new ErrorResponse("Failed to update user", 500);
		}

		// Role and email feed the access decision; do not let the cache outlive the change.
		accessCache.invalidate(userId);

		const { refreshToken, lastLoginAt, createdBy, deactivatedAt, ...safeUser } = updatedUser;

		return safeUser;
	}

	/**
	 * Refuses a change that would leave the product with no enabled admin.
	 *
	 * Authorization is read from the database on every request, so there is no token,
	 * environment variable or seed path that can promote anyone back: losing the last
	 * admin means editing the users table by hand against RDS. Admins are also full
	 * peers -- any one of them can demote or disable any other, including themselves --
	 * so this has to be checked on the way out, not left to convention.
	 */
	private async assertNotLastAdmin(user: typeof usersTable.$inferSelect, action: "demote" | "disable") {
		// Only the loss of an ENABLED admin can empty the set; a disabled admin was
		// never counted, so re-enabling or renaming one is never blocked here.
		if (user.role !== "admin" || !user.enabled) return;

		const [{ remaining }] = await db
			.select({ remaining: count() })
			.from(usersTable)
			.where(and(eq(usersTable.role, "admin"), eq(usersTable.enabled, true), ne(usersTable.id, user.id)));

		if (remaining > 0) return;

		throw new ErrorResponse(
			action === "demote"
				? "This is the only enabled admin. Promote another user to admin first, then change this role."
				: "This is the only enabled admin. Promote another user to admin first, then disable this one.",
			400,
		);
	}

	/**
	 * -> finds user by id -> if not found throws error
	 * -> soft deletes user (sets deletedAt + disables) -> returns success
	 */

	async toggleUser(userId: string) {
		const existingUser = await db.query.usersTable.findFirst({
			where: eq(usersTable.id, userId),
		});

		if (!existingUser) {
			throw new ErrorResponse("User not found", 404);
		}

		// Only the disabling direction can empty the admin set.
		if (existingUser.enabled) {
			await this.assertNotLastAdmin(existingUser, "disable");
		}

		const [updatedUser] = await db
			.update(usersTable)
			.set({
				enabled: !existingUser.enabled,
				deactivatedAt: existingUser.enabled ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(usersTable.id, userId))
			.returning();

		if (!updatedUser) {
			throw new ErrorResponse("Failed to update user status", 500);
		}

		// Disabling must cut access immediately, not when the cache entry happens to expire.
		accessCache.invalidate(userId);

		// Never return the refresh token: it is a live credential, and this response
		// goes straight to the admin's browser.
		const { refreshToken, lastLoginAt, createdBy, deactivatedAt, ...safeUser } = updatedUser;

		return safeUser;
	}

	/**
	 * -> fetches total user count (enabled and disabled alike -- the list shows both)
	 * -> retrieves paginated users list -> returns paginated response
	 */
	async listUsers({ limit = 20, page = 1 }: PaginationType) {
		const offset = (page - 1) * limit;

		// People only. A service identity is a users row, but it has no person, no
		// email anyone reads and no role to assign -- it is managed through
		// /api/service-users, which also carries its keys. Including them here put
		// rows in the list that nothing on the page could act on, and counted them
		// in the pagination total.
		const peopleOnly = ne(usersTable.role, "service");

		const [{ total }] = await db.select({ total: count() }).from(usersTable).where(peopleOnly);

		const users = await db
			.select({
				id: usersTable.id,
				fullName: usersTable.fullName,
				email: usersTable.email,
				role: usersTable.role,
				enabled: usersTable.enabled,
				deactivatedAt: usersTable.deactivatedAt,
				createdAt: usersTable.createdAt,
			})
			.from(usersTable)
			.where(peopleOnly)
			.orderBy(desc(usersTable.createdAt))
			.limit(limit)
			.offset(offset);

		return Paginator.paginate(
			{
				limit: limit.toString(),
				page: page.toString(),
			},
			users,
			total,
		);
	}
}
