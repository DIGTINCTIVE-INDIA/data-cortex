import type { SessionUser } from "@repo/lib/session-module";

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		export interface Request {
			user: Omit<SessionUser, "accessToken">;
			/** Set only when the request authenticated with a service API key. */
			apiKeyId?: string;
		}
	}
}

declare module "http" {
	interface IncomingMessage {
		user: Omit<SessionUser, "accessToken">;
	}
}
