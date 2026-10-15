import { UserRoleEnum } from "@repo/db";
import { defineEnv, ENV } from "@repo/env";
import jwt from "jsonwebtoken";
import z from "zod";

export type AuthTokenPayload = {
	id: string;
	email: string;
	fullName: string;
	role: UserRoleEnum;
};

const credentials = defineEnv({
	ACCESS_TOKEN_SECRET: z.string(),
	REFRESH_TOKEN_SECRET: z.string(),
});
const accessTokenSecret = credentials.ACCESS_TOKEN_SECRET;
const refreshTokenSecret = credentials.REFRESH_TOKEN_SECRET;

export class TokenModule {
	static signRefreshToken(payload: AuthTokenPayload) {
		return jwt.sign(payload, refreshTokenSecret, { expiresIn: "365d" });
	}
	static verifyRefreshToken(refreshToken: string) {
		try {
			const payload = jwt.verify(refreshToken, refreshTokenSecret) as AuthTokenPayload;
			return payload;
		} catch (error) {
			console.error(error);
			return null;
		}
	}
	static signAccessToken(payload: AuthTokenPayload) {
		const expiration = ENV.NODE_ENV === "dev" ? "30d" : "1d";
		return jwt.sign(payload, accessTokenSecret, { expiresIn: expiration });
	}
	static verifyAccessToken(accessToken: string) {
		try {
			const payload = jwt.verify(accessToken, accessTokenSecret) as AuthTokenPayload;
			return payload;
		} catch (error) {
			console.error(error);
			return null;
		}
	}
}
