import { logger } from "@repo/logger";
import axios from "axios";

type AuthorizationURLParams = {
	authorizationURL: string;
	clientID: string;
	redirectURI: string;
	scopes: string[];
	state: string;
	aud?: string;
	code_challenge?: string;
	code_challenge_method?: string;
	offline_access?: boolean;
};

type AccessTokenParams = {
	tokenURL: string;
	clientID: string;
	clientSecret: string;
	redirectURI: string;
	code: string;
	code_verifier?: string;
};

type ProfileRouteParams = {
	profileRoute: string;
	accessToken: string;
};

export class OauthClient {
	static getAuthorizationUrl(params: AuthorizationURLParams) {
		// constructing authorization url
		const url = new URL(params.authorizationURL);
		// adding our client id
		url.searchParams.append("client_id", params.clientID);
		// adding the endpoint to redirect after user gives consent
		url.searchParams.append("redirect_uri", params.redirectURI);
		// choosing the response type (code here which we'll use to redeem an accessToken)
		url.searchParams.append("response_type", "code");
		// required for twitter, just a random string (will be needed when redeeming accessToken from code)
		if (params.code_challenge) {
			url.searchParams.append("code_challenge", params.code_challenge);
		}
		if (params.code_challenge_method) {
			url.searchParams.append("code_challenge_method", params.code_challenge_method);
		}
		if (params.offline_access) {
			url.searchParams.append("access_type", "offline");
			url.searchParams.append("prompt", "consent");
		}
		// adding scopes which specify what are we asking from user
		if (params.scopes) {
			url.searchParams.append("scope", params.scopes.join(" "));
		}
		// just a random value on state
		url.searchParams.append("state", params.state);

		// not important, sometimes necessary, takes baseUrl
		if (params.aud) {
			url.searchParams.append("aud", params.aud);
		}
		return url.toString();
	}

	static async getAccessToken(params: AccessTokenParams, options?: { authInBody?: boolean }) {
		try {
			const body = new URLSearchParams();
			body.append("grant_type", "authorization_code");
			body.append("code", params.code);
			body.append("redirect_uri", params.redirectURI);
			if (params.code_verifier) {
				body.append("code_verifier", params.code_verifier);
			}
			if (options?.authInBody) {
				body.append("client_id", params.clientID);
				body.append("client_secret", params.clientSecret);
			}

			const { data } = await axios.post<
				Record<"access_token" | "refresh_token" | "scope" | "id_token", string>
			>(params.tokenURL, body, {
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				auth: {
					username: params.clientID,
					password: params.clientSecret,
				},
			});
			return data;
		} catch (error: any) {
			if (error?.response?.data) {
				logger.error(Error(JSON.stringify(error?.response?.data, null, 2)));
			} else logger.error(error);
			return;
		}
	}
	//
	static async getUserInfo(params: ProfileRouteParams) {
		const { data } = await axios.get(params.profileRoute, {
			headers: {
				Authorization: `Bearer ${params.accessToken}`,
			},
		});
		return data;
	}
}
