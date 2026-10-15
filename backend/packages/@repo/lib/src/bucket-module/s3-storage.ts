/**
 * TODO:  connect to bucket
 */
import {
	DeleteObjectCommand,
	PutObjectCommand,
	type PutObjectCommandInput,
	S3Client,
} from "@aws-sdk/client-s3";
import { defineEnv } from "@repo/env";
import z from "zod";
import { logger } from "@repo/logger";

const credentials = defineEnv({
	AWS_ACCESS_KEY_ID: z.string(),
	AWS_SECRET_ACCESS_KEY: z.string(),
	AWS_REGION: z.string().default("us-east-1"),
	AWS_BUCKET: z.string(),
	S3_ENDPOINT: z.string().optional(),
});

const s3Endpoint = credentials.S3_ENDPOINT;
const s3Client = new S3Client({
	credentials: {
		accessKeyId: credentials.AWS_ACCESS_KEY_ID,
		secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY,
	},
	region: credentials.AWS_REGION,
	endpoint: s3Endpoint,
});

const bucket = credentials.AWS_BUCKET;

export type UploadFile = {
	name: string;
	mimetype: string;
	data: Buffer;
};

export class S3Bucket {
	static async uploadFile(file: UploadFile, path: string) {
		let key = `${path}`;
		if (!key.includes(".")) {
			key += ".jpeg";
		}
		const params = {
			Bucket: bucket,
			Key: key,
			Body: file.data,
			ContentType: file.mimetype,
		} as PutObjectCommandInput;
		const command = new PutObjectCommand(params);
		await s3Client.send(command);
		const fileUrl = S3Bucket.getAwsUrl(key);
		return fileUrl;
	}

	static getAwsUrl(path: string) {
		return `https://${bucket}.s3.${credentials.AWS_REGION}.amazonaws.com/${path}`;
	}

	static getKeyFromUrl(url: string) {
		const key = url.split(`https://${bucket}.s3.${credentials.AWS_REGION}.amazonaws.com/`)[1];
		return key;
	}

	static async uploadFiles({ path, files }: { path: string; files: UploadFile[] }) {
		try {
			if (!path) throw new Error("Path must be provided.");
			if (!files) throw new Error("File must be provided.");
			// const buffers: UploadFile[] = [];
			// for (const key in file) {
			//   const item = file[key];
			//   if (Array.isArray(item)) item.forEach((e) => buffers.push(e));
			//   else buffers.push(item!);
			// }

			// let upload = [] as { url: string; type: string; name: string }[];
			const upload = await Promise.all(
				files.map(async file => {
					const key = file.name;
					const params: PutObjectCommandInput = {
						Bucket: bucket,
						Key: `${path}/${key}`,
						Body: file.data,
						ContentType: file.mimetype,
					};
					const command = new PutObjectCommand(params);
					await s3Client.send(command);
					return {
						url: S3Bucket.getAwsUrl(`${path}/${key}`),
						type: file.mimetype,
						name: file.name,
					};
				})
			);
			return upload;
			// if (upload.length > 0) return upload;
			// else throw new Error("Something went wrong.");
		} catch (error) {
			logger.error("S3 operation failed", { error });
			throw error;
		}
	}

	// ! don't use
	static async deleteFile(path: string) {
		try {
			const params = {
				Bucket: bucket,
				Key: path,
			};

			const command = new DeleteObjectCommand(params);
			await s3Client.send(command);
		} catch (error) {
			logger.error("S3 operation failed", { error });
			throw error;
		}
	}
}
