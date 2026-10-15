import { UserRoleEnum } from "@repo/db";
import { PGUserSession } from "./pg.session.js";

export type SessionUser = {
	id: string;
	email: string;
	fullName: string;
	accessToken: string;
	role: UserRoleEnum;
};

export interface IUserSession {
	getSessionUser(token: string): Promise<Omit<SessionUser, "accessToken"> | null>;
	startSession(payload: Omit<SessionUser, "accessToken">): Promise<{ accessToken: string; refreshToken: string }>;
	checkRefreshToken(refreshToken: string): Promise<string | null>;
	// getTokens(userId: string): Promise<{ accessToken: string; refreshToken: string } | null>;
	// updateAccessToken(payload: Omit<SessionUser, "accessToken">): Promise<string | null>;
	logout(accessToken: string): Promise<void>;
	endSession(userId: string): Promise<void>;
}

export const SessionFactory = (_type: "pgSession" | "redis"): IUserSession => {
	// if (type === "pgSession") {
	return new PGUserSession();
	// } else {
	// 	return new RedisUserSession();
	// }
};
