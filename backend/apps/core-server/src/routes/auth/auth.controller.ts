import { registry } from "@/container.js";
import { constants, jsonResponse, TokenModule } from "@repo/lib";
import { catchAsync, ErrorResponse } from "@repo/lib/error-handlers-module";

export class AuthController {
	static logout = catchAsync(async (req, res) => {
		const accessToken = req.cookies["accessToken"];

		if (accessToken) {
			await registry.sessionRepo.logout(accessToken);
		}

		res.clearCookie(constants.refreshToken.cookie);
		res.clearCookie("accessToken");

		return res.json(
			jsonResponse("mutation", {
				toast: { message: "Logged out successfully", type: "success" },
			}),
		);
	});

	static getToken = catchAsync(async (req, res) => {
		const refreshToken = req.cookies[constants.refreshToken.cookie];
		if (!refreshToken) {
			return res.status(401).json({ message: "refresh token missing" });
		}
		const userId = await registry.sessionRepo.checkRefreshToken(refreshToken);
		if (!userId) {
			throw new ErrorResponse("Invalid refresh token", 401);
		}

		const user = await registry.userRepo.getUserById(userId);
		if (!user) {
			throw new ErrorResponse("User no longer exists in the system", 401);
		}

		const accessToken = TokenModule.signAccessToken({
			email: user.email,
			fullName: user.fullName,
			id: user.id,
			role: user.role,
		});

		return res.json(
			jsonResponse("query", {
				user,
				accessToken,
			}),
		);
	});
}
