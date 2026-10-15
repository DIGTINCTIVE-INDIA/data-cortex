import { HeadBucketCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { and, count, db, desc, eq, fileConnection } from "@repo/db";
import { PaginationType, Paginator } from "@repo/lib";
import EncryptionModule from "@repo/lib/encryption-module";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import type { AddFileConnectionPayload, TestConnectionResponse, UpdateFileConnectionPayload } from "@repo/types";
import { IdGenerationRepo } from "../common/id-generation.repo.js";

export class FileConnectionRepo {
	private idGenerationRepo: IdGenerationRepo;
	constructor(idGenerationRepo: IdGenerationRepo) {
		this.idGenerationRepo = idGenerationRepo;
	}

	/**
	 * -> check uniqueness
	 * -> encrypt secretAccessKey
	 * -> store connection
	 */
	async addConnection(payload: AddFileConnectionPayload, userId: string) {
		const test = await this.testConnection(payload);

		if (!test.isValid) {
			throw new ErrorResponse(test.errorMessage || "Invalid S3 connection", 400);
		}
		return await db.transaction(async (tx) => {
			const existing = await tx.query.fileConnection.findFirst({
				where: eq(fileConnection.connectionName, payload.connectionName),
			});

			if (existing) {
				throw new ErrorResponse("Connection with this name already exists", 400);
			}

			const encryptedSecret = EncryptionModule.encrypt(payload.secretAccessKey);
			const connectionId = await this.idGenerationRepo.getNextId("file_connection", tx);
			// console.log(userId);
			const [connection] = await tx
				.insert(fileConnection)
				.values({
					connectionId,
					connectionName: payload.connectionName,
					storageType: payload.storageType,
					bucketOrContainerName: payload.bucketOrContainerName,
					region: payload.region,
					accessKeyId: payload.accessKeyId,
					secretAccessKey: encryptedSecret,
					additionalParams: payload.additionalParams ?? {},
					userId,
				})
				.returning();

			if (!connection) {
				throw new ErrorResponse("Failed to create file connection", 500);
			}

			const { secretAccessKey, ...safeConnection } = connection;

			return safeConnection;
		});
	}

	/**
	 * -> update connection
	 * -> encrypt secret if updated
	 */
	async updateConnection(connectionId: string, payload: UpdateFileConnectionPayload) {
		const existing = await db.query.fileConnection.findFirst({
			where: and(eq(fileConnection.connectionId, connectionId), eq(fileConnection.enabled, true)),
		});

		if (!existing) {
			throw new ErrorResponse("Connection not found", 404);
		}

		if (payload.connectionName && payload.connectionName !== existing.connectionName) {
			const duplicate = await db.query.fileConnection.findFirst({
				where: and(eq(fileConnection.connectionName, payload.connectionName), eq(fileConnection.enabled, true)),
			});

			if (duplicate) {
				throw new ErrorResponse("Connection with this name already exists", 400);
			}
		}

		const mergedPayload: AddFileConnectionPayload = {
			connectionName: payload.connectionName ?? existing.connectionName,
			storageType: (payload.storageType ?? existing.storageType) as "s3",
			bucketOrContainerName: payload.bucketOrContainerName ?? existing.bucketOrContainerName,
			region: payload.region ?? existing.region,
			accessKeyId: payload.accessKeyId ?? existing.accessKeyId,
			secretAccessKey: payload.secretAccessKey ? payload.secretAccessKey : EncryptionModule.decrypt(existing.secretAccessKey),
			additionalParams: payload.additionalParams ?? undefined,
		};

		const test = await this.testConnection(mergedPayload);

		if (!test.isValid) {
			throw new ErrorResponse(test.errorMessage || "Invalid S3 connection", 400);
		}

		const updateData = Object.fromEntries(
			Object.entries({
				connectionName: payload.connectionName,
				storageType: payload.storageType,
				bucketOrContainerName: payload.bucketOrContainerName,
				region: payload.region,
				accessKeyId: payload.accessKeyId,
				additionalParams: payload.additionalParams,
			}).filter(([, v]) => v !== undefined),
		) as Partial<typeof fileConnection.$inferInsert>;

		if (payload.secretAccessKey !== undefined) {
			updateData.secretAccessKey = EncryptionModule.encrypt(payload.secretAccessKey);
		}

		const [updated] = await db.update(fileConnection).set(updateData).where(eq(fileConnection.connectionId, connectionId)).returning();

		if (!updated) {
			throw new ErrorResponse("Failed to update connection", 500);
		}

		const { secretAccessKey, ...safeConnection } = updated;

		return safeConnection;
	}

	/**
	 * -> delete connection
	 */
	async toggleConnection(connectionId: string) {
		const existing = await db.query.fileConnection.findFirst({
			where: eq(fileConnection.connectionId, connectionId),
		});

		if (!existing) {
			throw new ErrorResponse("Connection not found", 404);
		}

		const [updated] = await db
			.update(fileConnection)
			.set({
				enabled: !existing.enabled,
				deactivatedAt: existing.enabled ? new Date() : null,
			})
			.where(eq(fileConnection.connectionId, connectionId))
			.returning();

		return updated;
	}
	/**
	 * -> paginated list
	 */
	async listConnections({ limit = 20, page = 1 }: PaginationType) {
		const offset = (page - 1) * limit;

		const [totalResult, connections] = await Promise.all([
			db.select({ total: count() }).from(fileConnection),
			db
				.select({
					connectionId: fileConnection.connectionId,
					connectionName: fileConnection.connectionName,
					storageType: fileConnection.storageType,
					bucketOrContainerName: fileConnection.bucketOrContainerName,
					region: fileConnection.region,
					accessKeyId: fileConnection.accessKeyId,
					enabled: fileConnection.enabled,
					deactivatedAt: fileConnection.deactivatedAt,
					createdAt: fileConnection.createdAt,
					updatedAt: fileConnection.updatedAt,
				})
				.from(fileConnection)
				.orderBy(desc(fileConnection.connectionId))
				.limit(limit)
				.offset(offset),
		]);

		const total = totalResult[0]?.total ?? 0;

		return Paginator.paginate(
			{
				limit: limit.toString(),
				page: page.toString(),
			},
			connections,
			total,
		);
	}

	async testConnection(payload: AddFileConnectionPayload): Promise<TestConnectionResponse> {
		const client = new S3Client({
			region: payload.region,
			credentials: {
				accessKeyId: payload.accessKeyId,
				secretAccessKey: payload.secretAccessKey,
			},
			// endpoint: payload.endpointUrl || undefined,
			// forcePathStyle: !!payload.endpointUrl,
		});

		try {
			await client.send(
				new HeadBucketCommand({
					Bucket: payload.bucketOrContainerName,
				}),
			);

			await client.send(
				new ListObjectsV2Command({
					Bucket: payload.bucketOrContainerName,
					MaxKeys: 1,
				}),
			);

			return {
				isValid: true,
				error: null,
				errorMessage: null,
			};
		} catch (err: any) {
			let message = "Connection failed";

			if (err.name === "InvalidAccessKeyId") {
				message = "Invalid access key ID";
			} else if (err.name === "SignatureDoesNotMatch") {
				message = "Invalid secret access key";
			} else if (err.name === "NoSuchBucket") {
				message = "Bucket does not exist";
			} else if (err.$metadata?.httpStatusCode === 403) {
				message = "Access denied to bucket";
			} else if (err.$metadata?.httpStatusCode === 404) {
				message = "Bucket not found";
			}

			return {
				isValid: false,
				error: err,
				errorMessage: message,
			};
		}
	}
}
