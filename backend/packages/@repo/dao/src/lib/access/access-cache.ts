import type { UserRoleEnum } from "@repo/db";

export type AccessProfile = {
	id: string;
	email: string;
	fullName: string;
	role: UserRoleEnum;
	enabled: boolean;
};

/** A profile resolved from an API key also says which key it was. */
export type KeyedProfile = AccessProfile & { apiKeyId: string };

/** Backstop only. Role and enabled changes invalidate directly, see UserRepo. */
const TTL_MS = 30_000;

/**
 * In-process cache of who each user is, keyed by id.
 *
 * Module scope rather than a field on a repo because two classes need it: AccessRepo
 * reads it on every request, and UserRepo must drop an entry the moment a role or
 * the enabled flag changes. Sharing a Map through a module avoids wiring one repo
 * into the other.
 *
 * Exact for a single instance. A second instance would only learn of a change when
 * its entry expires, which is what the 30s TTL bounds.
 */
const entries = new Map<string, { at: number; profile: AccessProfile | null }>();

export const accessCache = {
	/** `undefined` = not cached or expired. `null` is a cached "no such user". */
	get(userId: string): AccessProfile | null | undefined {
		const entry = entries.get(userId);

		if (!entry) return undefined;

		if (Date.now() - entry.at > TTL_MS) {
			entries.delete(userId);
			return undefined;
		}

		return entry.profile;
	},

	set(userId: string, profile: AccessProfile | null) {
		entries.set(userId, { at: Date.now(), profile });
	},

	invalidate(userId: string) {
		entries.delete(userId);
	},
};
