import { db, eq, usersTable } from "@repo/db";
import { TokenModule } from "../extra/token-module.js";
import { IUserSession, SessionUser } from "./index.js";

export class PGUserSession implements IUserSession {
	async getSessionUser(refreshToken: string): Promise<Omit<SessionUser, "accessToken"> | null> {
		const user = await db.query.usersTable.findFirst({
			where: eq(usersTable.refreshToken, refreshToken),
		});
		if (!user) return null;

		return {
			role: user.role,
			email: user.email,
			fullName: user.fullName,
			id: user.id,
		};
	}

	async startSession(payload: Omit<SessionUser, "accessToken">): Promise<{ accessToken: string; refreshToken: string }> {
		await this.endSession(payload.id);
		const accessToken = TokenModule.signAccessToken({
			email: payload.email,
			fullName: payload.fullName,
			id: payload.id,
			role: payload.role,
		});
		const refreshToken = TokenModule.signRefreshToken({
			email: payload.email,
			fullName: payload.fullName,
			id: payload.id,
			role: payload.role,
		});
		await db
			.update(usersTable)
			// Signing in is not a profile edit, so updatedAt is deliberately left
			// alone here -- otherwise every login would look like the account was
			// modified, and "last changed" would be indistinguishable from "last seen".
			.set({ refreshToken: refreshToken, lastLoginAt: new Date(), fullName: payload.fullName })
			.where(eq(usersTable.email, payload.email));

		return { accessToken, refreshToken };
	}

	async checkRefreshToken(refreshToken: string): Promise<string | null> {
		const user = await db.query.usersTable.findFirst({
			where: eq(usersTable.refreshToken, refreshToken),
		});

		if (!user) return null;
		return user.id;
	}

	async logout(refreshToken: string): Promise<void> {
		const user = await db.query.usersTable.findFirst({
			where: eq(usersTable.refreshToken, refreshToken),
		});
		if (!user) return;

		await db
			.update(usersTable)
			.set({
				refreshToken: null,
			})
			.where(eq(usersTable.refreshToken, refreshToken));
	}

	async endSession(userId: string): Promise<void> {
		await db
			.update(usersTable)
			.set({
				refreshToken: null,
			})
			.where(eq(usersTable.id, userId));
	}
}
