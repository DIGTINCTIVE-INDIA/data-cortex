import { registry } from "@/container.js";
import { getCookieOptions, jsonResponse } from "@repo/lib";
import { catchAsync } from "@repo/lib/error-handlers-module";

export class SSOController {
	static getUrl = catchAsync(async (_, res) => {
		const url = await registry.userRepo.redirect();
		return res.json(jsonResponse("query", { url }));
	});

	static exchangeCode = catchAsync(async (req, res) => {
		const { code } = req.body;

		if (!code) {
			return res.status(400).json({ error: "Code is required" });
		}

		const { user, accessToken, refreshToken } = await registry.userRepo.handleCallback(code);

		res.cookie(...getCookieOptions(refreshToken));

		return res.json(
			jsonResponse("query", {
				user,
				accessToken,
			}),
		);
	});
}
