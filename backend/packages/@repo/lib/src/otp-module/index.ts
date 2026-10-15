import { ENV } from "@repo/env";
import { logger } from "@repo/logger";
import { AdminEmailTemplate } from "@repo/mail";
import { RedisStore } from "@repo/redis";

import { HashingModule } from "../hashing-module/index.js";
import { SMTPMailService } from "../mail-module/nodemailer.js";
import { Random } from "../utils.js";

const redisOtpStore = new RedisStore<{
	email: string;
	otp: string;
	status: "pending" | "verified";
}>({
	namespace: "otp",
});
export class OTPModule {
	private static otpExpirationMs = 5 * 60 * 1000;

	static async sendMailOTP({ email }: { email: string }): Promise<void> {
		const normalizedEmail = email.trim().toLowerCase();

		// Generate OTP as a 4-digit string (preserve leading zeros)
		const otpStr = String(Random.generateNumber(4)).padStart(4, "0");
		const hash = await HashingModule.hash(otpStr);

		try {
			await redisOtpStore.set(
				normalizedEmail,
				{ email: normalizedEmail, otp: hash, status: "pending" },
				this.otpExpirationMs
			);
		} catch (err) {
			logger?.error("otp: redis write failed", { email: normalizedEmail, err });
			throw err;
		}

		// Do not leak OTP in non-test environments
		if (["test", "development"].includes(ENV.NODE_ENV)) {
			// optionally: mock mail send for tests
			logger?.info("otp: test-mode - OTP generated", { email: normalizedEmail, otp: otpStr });
			return;
		}
		const html = await AdminEmailTemplate.getOtpEmail({ otp: otpStr });
		await SMTPMailService.sendMail(
			normalizedEmail,
			`OTP for ${normalizedEmail}`,
			`Your OTP is ${otpStr}`,
			html
		);
	}

	static async verifyMailOTP(email: string, otp: string, deleteOtp = false): Promise<boolean> {
		const normalizedEmail = email.trim().toLowerCase();

		// shortcut for test/dev environments — be careful with this in real dev
		// if (["test"].includes(ENV.NODE_ENV)) return true;

		const rows = await redisOtpStore.get(normalizedEmail);
		if (!rows?.otp) return false;

		const firstOtp = rows.otp;

		const verified = await HashingModule.compare(otp, firstOtp);
		if (!verified) return false;

		if (deleteOtp) {
			await redisOtpStore.del(normalizedEmail);
		} else {
			await redisOtpStore.set(
				normalizedEmail,
				{ ...rows, status: "verified" },
				this.otpExpirationMs
			);
		}
		return true;
	}

	static async checkOTPStatus(email: string): Promise<boolean> {
		const normalizedEmail = email.trim().toLowerCase();
		const rows = await redisOtpStore.get(normalizedEmail);
		if (!rows?.otp) return false;
		return rows.status === "verified";
	}

	static async deleteOTP(email: string): Promise<boolean> {
		const normalizedEmail = email.trim().toLowerCase();
		await redisOtpStore.del(normalizedEmail);
		return true;
	}
}
