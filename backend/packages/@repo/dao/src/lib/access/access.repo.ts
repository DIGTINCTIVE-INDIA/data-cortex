import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { and, db, desc, eq, inArray, serviceApiKeys, usersTable } from "@repo/db";
import { ErrorResponse } from "@repo/lib/error-handlers-module";

import { accessCache, type AccessProfile, type KeyedProfile } from "./access-cache.js";

/** `dck_<10 hex prefix>_<64 hex secret>`. Hex only, so `_` can never occur inside a part. */
const KEY_PATTERN = /^dck_([0-9a-f]{10})_([0-9a-f]{64})$/;

/** A service user's address. `.invalid` is reserved (RFC 2606): it can never be a real mailbox. */
const SERVICE_EMAIL_DOMAIN = "service.datacortex.invalid";

/** Do not write last_used_at on every request -- a busy caller would turn each call into an UPDATE. */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const slugify = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);

export class AccessRepo {
	/**
	 * Who this user is RIGHT NOW.
	 *
	 * Authorisation has to follow the database, not the token. The JWT carries a
	 * role, but it is signed once and lives for a day in prod and thirty in dev, so
	 * trusting it means a demoted or disabled user keeps their old access until it
	 * expires. A short cache keeps this off the hot path; UserRepo invalidates it the
	 * moment a role or the enabled flag changes, so in practice the delay is zero.
	 */
	async getProfile(userId: string): Promise<AccessProfile | null> {
		const cached = accessCache.get(userId);

		if (cached !== undefined) return cached;

		const user = await db.query.usersTable.findFirst({
			where: eq(usersTable.id, userId),
			columns: { id: true, email: true, fullName: true, role: true, enabled: true },
		});

		const profile = user ?? null;

		accessCache.set(userId, profile);

		return profile;
	}

	/**
	 * Resolves an API key to its service user, or null.
	 *
	 * One failure answer for every reason (unknown, wrong secret, revoked, expired,
	 * user disabled): telling a caller which one it was only helps someone guessing.
	 */
	async authenticateApiKey(rawKey: string): Promise<KeyedProfile | null> {
		const match = KEY_PATTERN.exec(rawKey.trim());

		if (!match) return null;

		const [, prefix, secret] = match;

		const key = await db.query.serviceApiKeys.findFirst({
			where: eq(serviceApiKeys.keyPrefix, prefix!),
		});

		if (!key) return null;

		const expected = Buffer.from(key.keyHash, "hex");
		const actual = Buffer.from(sha256(`dck_${prefix}_${secret}`), "hex");

		// Constant-time, and length-checked first because timingSafeEqual throws on a mismatch.
		if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

		if (key.revokedAt) return null;
		if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null;

		const profile = await this.getProfile(key.userId);

		if (!profile || !profile.enabled || profile.role !== "service") return null;

		if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS) {
			// Fire and forget: a failed bookkeeping write must not fail an authenticated call.
			void db
				.update(serviceApiKeys)
				.set({ lastUsedAt: new Date() })
				.where(eq(serviceApiKeys.id, key.id))
				.catch(() => undefined);
		}

		return { ...profile, apiKeyId: key.id };
	}

	// ------------------------------------------------------------------ admin

	async createServiceUser(name: string, createdBy: string) {
		const slug = slugify(name);

		if (!slug) {
			throw new ErrorResponse("Name must contain letters or numbers", 400);
		}

		// The suffix keeps two services with the same name from colliding on the
		// unique email, without making the creator pick an address that means nothing.
		const email = `svc-${slug}-${randomBytes(2).toString("hex")}@${SERVICE_EMAIL_DOMAIN}`;

		const [user] = await db
			.insert(usersTable)
			.values({ email, fullName: name, role: "service", createdBy })
			.returning({
				id: usersTable.id,
				email: usersTable.email,
				fullName: usersTable.fullName,
				role: usersTable.role,
				enabled: usersTable.enabled,
				createdAt: usersTable.createdAt,
			});

		if (!user) {
			throw new ErrorResponse("Failed to create service user", 500);
		}

		return user;
	}

	/**
	 * Mints a key. The plaintext is returned here and nowhere else, ever: only its
	 * hash is stored, so it cannot be shown again.
	 */
	async createKey(serviceUserId: string, name: string, createdBy: string, expiresInDays?: number) {
		const owner = await db.query.usersTable.findFirst({ where: eq(usersTable.id, serviceUserId) });

		if (!owner || owner.role !== "service") {
			throw new ErrorResponse("Service user not found", 404);
		}

		const prefix = randomBytes(5).toString("hex");
		const key = `dck_${prefix}_${randomBytes(32).toString("hex")}`;

		const [row] = await db
			.insert(serviceApiKeys)
			.values({
				userId: serviceUserId,
				name,
				keyPrefix: prefix,
				keyHash: sha256(key),
				createdBy,
				expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
			})
			.returning({
				id: serviceApiKeys.id,
				name: serviceApiKeys.name,
				keyPrefix: serviceApiKeys.keyPrefix,
				createdAt: serviceApiKeys.createdAt,
				expiresAt: serviceApiKeys.expiresAt,
			});

		if (!row) {
			throw new ErrorResponse("Failed to create API key", 500);
		}

		return { ...row, key };
	}

	async revokeKey(keyId: string) {
		const [row] = await db
			.update(serviceApiKeys)
			.set({ revokedAt: new Date() })
			.where(eq(serviceApiKeys.id, keyId))
			.returning({ id: serviceApiKeys.id, userId: serviceApiKeys.userId });

		if (!row) {
			throw new ErrorResponse("API key not found", 404);
		}

		return row;
	}

	/** Every service user with their keys. Hashes are never selected. */
	async listServiceUsers() {
		const users = await db
			.select({
				id: usersTable.id,
				fullName: usersTable.fullName,
				email: usersTable.email,
				enabled: usersTable.enabled,
				createdAt: usersTable.createdAt,
			})
			.from(usersTable)
			.where(eq(usersTable.role, "service"))
			.orderBy(desc(usersTable.createdAt));

		if (users.length === 0) return [];

		const keys = await db
			.select({
				id: serviceApiKeys.id,
				userId: serviceApiKeys.userId,
				name: serviceApiKeys.name,
				keyPrefix: serviceApiKeys.keyPrefix,
				createdAt: serviceApiKeys.createdAt,
				lastUsedAt: serviceApiKeys.lastUsedAt,
				expiresAt: serviceApiKeys.expiresAt,
				revokedAt: serviceApiKeys.revokedAt,
			})
			.from(serviceApiKeys)
			.where(
				and(
					inArray(
						serviceApiKeys.userId,
						users.map(user => user.id),
					),
				),
			)
			.orderBy(desc(serviceApiKeys.createdAt));

		return users.map(user => ({ ...user, keys: keys.filter(key => key.userId === user.id) }));
	}
}
