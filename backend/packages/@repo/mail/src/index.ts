import { render } from "@react-email/render";
import VerifyEmailOtp from "./emails/admin/OtpEmail.js";
export class AdminEmailTemplate {
	static getOtpEmail = async (props: { otp: string }) => {
		return await render(
			VerifyEmailOtp({
				verificationCode: props.otp,
			})
		);
	};
}
