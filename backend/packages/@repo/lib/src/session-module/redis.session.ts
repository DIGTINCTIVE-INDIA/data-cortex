import { redisClient } from "@repo/redis";
import { constants } from "constants.js";
import { TokenModule } from "extra/token-module.js";
import { IUserSession, SessionUser } from "./index.js";

const accessTokenKey = (key: string) => `access_token:${key}`;
const refreshTokenKey = (key: string) => `refresh_token:${key}`;
const userTokensKey = (userId: string) => `session:${userId}`;

export class RedisUserSession implements IUserSession {
	async getSessionUser(token: string) {
		const session = await redisClient.get(accessTokenKey(token));
		return session ? JSON.parse(session) : null;
	}
	async startSession(payload: Omit<SessionUser, "accessToken">) {
		await this.endSession(payload.id);
		const accessToken = TokenModule.signAccessToken({
			userID: payload.id.toString(),
			email: payload.email,
		});
		const refreshToken = TokenModule.signRefreshToken({
			userID: payload.id.toString(),
			email: payload.email,
		});

		await redisClient.setex(accessTokenKey(accessToken), constants.sessionDuration, JSON.stringify({ ...payload, accessToken }));
		await redisClient.setex(refreshTokenKey(refreshToken), constants.sessionDuration, payload.id);
		await redisClient.setex(
			userTokensKey(payload.id),
			constants.sessionDuration,
			JSON.stringify({
				accessToken,
				refreshToken,
			}),
		);
		return { accessToken, refreshToken };
	}

	async checkRefreshToken(refreshToken: string) {
		const userId = await redisClient.get(refreshTokenKey(refreshToken));
		return userId ? Number(userId) : null;
	}

	async updateAccessToken(payload: Omit<SessionUser, "accessToken">) {
		let accessToken: string;
		const tokens = await this.getTokens(payload.id);
		if (tokens) {
			accessToken = tokens.accessToken;
		} else {
			return null;
		}

		await redisClient.setex(accessTokenKey(accessToken), constants.sessionDuration, JSON.stringify({ ...payload, accessToken }));
		return accessToken;
	}

	async getTokens(userId: string) {
		const tokens = await redisClient.get(userTokensKey(userId));
		return tokens ? (JSON.parse(tokens) as { refreshToken: string; accessToken: string }) : null;
	}

	async logout(accessToken: string) {
		const payload = await redisClient.get(accessTokenKey(accessToken));
		if (!payload) return;
		const user = JSON.parse(payload) as SessionUser;
		const tokens = await this.getTokens(user.id);
		if (tokens) {
			await redisClient.del(refreshTokenKey(tokens.refreshToken));
			await redisClient.del(accessTokenKey(accessToken));
			await redisClient.del(userTokensKey(user.id));
		}
	}

	async endSession(userId: string) {
		const tokens = await this.getTokens(userId);
		if (tokens) {
			await redisClient.del(refreshTokenKey(tokens.refreshToken));
			await redisClient.del(accessTokenKey(tokens.accessToken));
			await redisClient.del(userTokensKey(userId));
		}
	}
}
