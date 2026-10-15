import { logger } from "@repo/logger";

class MockMailService {
	static sendMail({ text, to }: { to: string; text: string }) {
		logger.info(`Email sent: ${to} ${text}`);
	}
}
export { MockMailService };
