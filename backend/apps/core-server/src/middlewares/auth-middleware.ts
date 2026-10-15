import { registry } from "@/container.js";
import { TokenModule } from "@repo/lib";
import type { NextFunction, Request, Response } from "express";

/**
 * Resolves a signed access token to the person it names, as they are NOW.
 *
 * The token proves who someone is. It must not decide what they may do: the role it
 * carries was true when it was signed, and it lives for a day (prod) or thirty
 * (dev). Role and enabled are read from the database instead, so demoting or
 * disabling a user takes effect on their very next request.
 */
async function authenticateToken(req: Request) {
	const accessToken = req.headers["authorization"]?.split(" ")[1];

	if (!accessToken) return { error: "access token missing" } as const;

	const payload = TokenModule.verifyAccessToken(accessToken);

	if (!payload) return { error: "invalid access token" } as const;

	const profile = await registry.accessRepo.getProfile(payload.id);

	if (!profile || !profile.enabled) return { error: "account is disabled" } as const;

	// Service identities authenticate with an API key and nothing else. A JWT naming one
	// should be impossible (they have no sign-in), so refusing it costs nothing and
	// closes the door if one is ever minted by mistake.
	if (profile.role === "service") return { error: "service users cannot use access tokens" } as const;

	return {
		user: { id: profile.id, email: profile.email, fullName: profile.fullName, role: profile.role },
	} as const;
}

export class AuthMiddlewares {
	/** Every human-facing route. API keys are deliberately NOT accepted here. */
	static async validateAccessToken(req: Request, res: Response, next: NextFunction) {
		try {
			const result = await authenticateToken(req);

			if ("error" in result) {
				res.status(401).json({ message: result.error });
				return;
			}

			req.user = result.user;
			return next();
		} catch (error) {
			next(error);
		}
	}

	/**
	 * Used on the run endpoint only: a person's token, or a service user's API key.
	 *
	 * Keeping the key off every other route is the whole access model for service
	 * users. They are not given a short list of allowed routes to enforce -- there is
	 * simply nowhere else a key authenticates.
	 */
	static async validateRunAccess(req: Request, res: Response, next: NextFunction) {
		try {
			const apiKey = req.headers["x-api-key"];

			if (typeof apiKey === "string" && apiKey.length > 0) {
				const profile = await registry.accessRepo.authenticateApiKey(apiKey);

				if (!profile) {
					res.status(401).json({ message: "invalid api key" });
					return;
				}

				req.user = { id: profile.id, email: profile.email, fullName: profile.fullName, role: profile.role };
				req.apiKeyId = profile.apiKeyId;
				return next();
			}

			const result = await authenticateToken(req);

			if ("error" in result) {
				res.status(401).json({ message: result.error });
				return;
			}

			req.user = result.user;
			return next();
		} catch (error) {
			next(error);
		}
	}
}

export function validateSession() {
	return function (_: any, __: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value;
		descriptor.value = async function (req: Request, res: Response, next: NextFunction) {
			try {
				const accessToken = req.headers["authorization"]?.split(" ")[1];
				if (!accessToken) {
					res.status(401).json({ message: "access token missing" });
					return;
				}

				const payload = await registry.sessionRepo.getSessionUser(accessToken);

				if (!payload) {
					res.status(401).json({ message: "invalid access token" });
					return;
				}
				req.user = payload;
				return originalMethod.apply(this, [req, res, next]);
			} catch (error) {
				next(error);
			}
		};
	};
}
