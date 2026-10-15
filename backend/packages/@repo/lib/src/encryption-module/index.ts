import { ENV } from "@repo/env";
import fernet from "fernet";

const { Secret, Token } = fernet;

class EncryptionModule {
	private static getSecret(): InstanceType<typeof Secret> {
		const key = ENV.ENCRYPTION_SECRET_KEY;

		if (!/^[A-Za-z0-9_-]{43}=$/.test(key)) {
			throw new Error("Invalid Fernet key format");
		}

		return new Secret(key);
	}

	static encrypt(plainText: string): string {
		if (!plainText) return "";

		const secret = this.getSecret();

		const token = new Token({
			secret,
			time: Math.floor(Date.now() / 1000),
		});

		return token.encode(plainText);
	}

	static decrypt(tokenStr: string): string {
		if (!tokenStr) return "";

		const secret = this.getSecret();

		try {
			const token = new Token({
				secret,
				token: tokenStr,
				ttl: 0,
			});

			return token.decode();
		} catch {
			throw new Error("Invalid or tampered encrypted value");
		}
	}
}

export default EncryptionModule;
