import { ENV } from "@repo/env";
import { logger } from "@repo/logger";
import type { UploadedFile } from "express-fileupload";
import fs from "fs";
import path from "path";

import { Random } from "../utils.js";

export class FileBasedBucket {
	static async upload(file: UploadedFile, subpath?: string) {
		const fileName = Random.generateString(4, "hex") + path.extname(file.name);
		const filePath = path.join(process.cwd(), "storage", subpath ?? "", fileName);
		await FileBasedBucket.createDirectoryIfNotExists(`storage/${subpath ?? ""}`);
		await file.mv(filePath);
		const publicUrl = FileBasedBucket.getPublicUrl(`${subpath ?? ""}/${fileName}`);
		return publicUrl;
	}
	static deleteFile(url: string) {
		const filePath = FileBasedBucket.getPath(url);
		try {
			fs.unlinkSync(filePath);
		} catch (error) {
			logger.error("Error deleting file:", error);
		}
	}

	static getPath(url: string) {
		const path = url.replace(`${ENV.SERVER_URL}/files/`, `${process.cwd()}/storage/`);
		return path;
	}

	static getPublicUrl(key: string) {
		return path.join(ENV.SERVER_URL, "/files", key);
	}

	static async createDirectoryIfNotExists(path: string) {
		return await new Promise<boolean>((resolve, reject) => {
			if (fs.existsSync(path)) {
				resolve(true);
			} else {
				fs.mkdir(path, { recursive: true }, err => {
					if (err) {
						reject(err);
					}
					resolve(true);
				});
			}
		});
	}
}
