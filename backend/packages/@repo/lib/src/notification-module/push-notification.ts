import { defineEnv } from "@repo/env";
import { logger } from "@repo/logger";
import firebaseAdmin from "firebase-admin";
import path from "path";
import z from "zod";

import { __dirname } from "../utils.js";

export type FcmPayload = {
	data?: Record<string, any> & {
		title: string;
		body?: string;
		url?: string;
	};
	token: string;
};

const credentials = defineEnv({
	FIREBASE_PROJECT_ID: z.string(),
	FIREBASE_CLIENT_EMAIL: z.string(),
	FIREBASE_PRIVATE_KEY: z.string(),
	FIREBASE_KEY_PATH: z.string().optional().default("/keys/firebase-messaging-secret.json"),
});

type InitOptions =
	| {
			type: "file";
	  }
	| {
			type: "env";
	  };

export class PushNotificationManager {
	private static initialized = false;

	static initialize(options: InitOptions) {
		if (this.initialized) return;

		try {
			let credential: firebaseAdmin.credential.Credential;

			if (options.type === "file") {
				credential = firebaseAdmin.credential.cert(
					path.join(__dirname(), credentials.FIREBASE_KEY_PATH)
				);
			} else if (options.type === "env") {
				credential = firebaseAdmin.credential.cert({
					projectId: credentials.FIREBASE_PROJECT_ID,
					clientEmail: credentials.FIREBASE_CLIENT_EMAIL,
					privateKey: credentials.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
				});
			} else {
				throw new Error("Invalid initialization options");
			}

			firebaseAdmin.initializeApp({ credential });
			this.initialized = true;
			logger.info("Firebase Admin initialized");
		} catch (error) {
			logger.error("Firebase initialization error:", error);
		}
	}

	static async sendNotification(payload: FcmPayload[]) {
		if (!this.initialized) {
			logger.warn("PushNotificationManager not initialized. Skipping notification.");
			return;
		}

		const formattedPayload = payload.map(item => {
			const data: Record<string, string> = {};

			for (const key in item.data) {
				const value = item.data[key];
				if (value !== null) {
					data[key] = typeof value === "string" ? value : String(value);
				}
			}

			return {
				data: {
					...data,
					title: item.data?.title ?? "",
					body: item.data?.body ?? "",
				},
				token: item.token,
			};
		});

		try {
			const response = await firebaseAdmin.messaging().sendEach(formattedPayload);
			logger.info("Successfully sent message:", response.responses);
		} catch (error) {
			logger.error("Error sending message:", error);
		}
	}
}
