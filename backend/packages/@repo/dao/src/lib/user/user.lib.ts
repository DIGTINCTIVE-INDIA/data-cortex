import { ConfidentialClientApplication, type Configuration } from "@azure/msal-node";
import { ENV } from "@repo/env";

export class SSORepo {
	private msalConfig: Configuration;
	private msalClient: ConfidentialClientApplication;
	private scopes = ["openid", "profile", "offline_access"];

	constructor() {
		this.msalConfig = {
			auth: {
				clientId: ENV.AZURE_CLIENT_ID || "",
				authority: ENV.AZURE_AUTHORITY_URL || "https://login.microsoftonline.com/common",
				clientSecret: ENV.AZURE_CLIENT_SECRET || "",
			},
		};

		this.msalClient = new ConfidentialClientApplication(this.msalConfig);
	}

	public async getAuthUrl(): Promise<string> {
		const authUrl = await this.msalClient.getAuthCodeUrl({
			scopes: this.scopes,
			redirectUri: ENV.AZURE_SSO_REDIRECT_URI || "",
		});
		return authUrl;
	}

	public async exchangeAuthCode(authCode: string) {
		const tokenResponse = await this.msalClient.acquireTokenByCode({
			code: authCode,
			scopes: this.scopes,
			redirectUri: ENV.AZURE_SSO_REDIRECT_URI || "",
		});
		return tokenResponse;
	}
}
