import { defineEnv } from "@repo/env";
import type { Transporter } from "nodemailer";
import * as nodemailer from "nodemailer";
import z from "zod";

import { logger } from "@repo/logger";

type SmtpCredentials = {
	SMTP_HOST: string;
	SMTP_PORT: string;
	SMTP_USER: string;
	SMTP_PASSWORD: string;
	SMTP_MAIL_ENCRYPTION: string;
	SENDER_MAIL: string;
	SENDER_NAME: string;
};

let cached: SmtpCredentials | null = null;

/**
 * Read SMTP config on first use, not at import time.
 *
 * This used to call defineEnv at module scope, which throws when the SMTP keys
 * are unset -- so merely importing this file took the whole server down. Mail
 * is optional, and a deployment without it should still boot and serve every
 * other route.
 */
const readCredentials = (): SmtpCredentials | null => {
	if (cached) return cached;

	try {
		cached = defineEnv({
			SMTP_HOST: z.string().min(1),
			SMTP_PORT: z.string().min(1),
			SMTP_USER: z.string().min(1),
			SMTP_PASSWORD: z.string().min(1),
			SMTP_MAIL_ENCRYPTION: z.string().default("tls"),
			SENDER_MAIL: z.string().min(1),
			SENDER_NAME: z.string().default("Data Cortex"),
		}) as SmtpCredentials;

		return cached;
	} catch {
		return null;
	}
};

class SMTPMailService {
	private static transporter: Transporter | null = null;

	/** Callers use this to skip mail cleanly rather than catching a throw. */
	static isConfigured(): boolean {
		return readCredentials() !== null;
	}

	private static initializeTransporter(credentials: SmtpCredentials) {
		if (!this.transporter) {
			const port = Number.parseInt(credentials.SMTP_PORT, 10);

			this.transporter = nodemailer.createTransport({
				host: credentials.SMTP_HOST,
				// parseInt returns NaN rather than undefined, so ?? never caught a bad
				// value here. Check it properly.
				port: Number.isFinite(port) ? port : 587,
				// Implicit TLS only on 465. Everything else (587, Mailtrap's 2525)
				// negotiates STARTTLS, which nodemailer does when secure is false.
				secure: credentials.SMTP_MAIL_ENCRYPTION === "ssl",
				auth: {
					user: credentials.SMTP_USER,
					pass: credentials.SMTP_PASSWORD,
				},
			});
		}

		return this.transporter;
	}

	/**
	 * Returns true when the message was handed to the SMTP server.
	 *
	 * Deliberately does NOT throw when mail is unconfigured: the callers are
	 * notification paths, and a missing SMTP setup must not fail the thing that
	 * triggered the notification.
	 */
	static async sendMail(to: string | string[], subject: string, text: string, html?: string): Promise<boolean> {
		const credentials = readCredentials();

		if (!credentials) {
			logger.warn("Email not sent: SMTP is not configured (SMTP_HOST/PORT/USER/PASSWORD/SENDER_MAIL)", { subject });
			return false;
		}

		const recipients = Array.isArray(to) ? to.filter(Boolean) : [to];

		if (recipients.length === 0) {
			logger.warn("Email not sent: no recipients", { subject });
			return false;
		}

		const transporter = this.initializeTransporter(credentials);

		try {
			const info = (await transporter.sendMail({
				from: `${credentials.SENDER_NAME} <${credentials.SENDER_MAIL}>`,
				to: recipients.join(", "),
				subject,
				text,
				html,
			})) as { messageId: string };

			logger.info("Email sent", { messageId: info.messageId, recipients: recipients.length, subject });

			return true;
		} catch (error) {
			logger.error("Failed to send email", { error, subject, recipients: recipients.length });
			return false;
		}
	}

	/** Proves the SMTP settings are usable without sending anything. */
	static async verify(): Promise<boolean> {
		const credentials = readCredentials();

		if (!credentials) return false;

		try {
			await this.initializeTransporter(credentials).verify();
			return true;
		} catch (error) {
			logger.error("SMTP verification failed", { error });
			return false;
		}
	}
}

export { SMTPMailService };
