import {
	Body,
	Container,
	Font,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import React from "react";

export default function VerifyEmailOtp({
	verificationCode = "596853",
}: {
	verificationCode: string;
}) {
	return (
		<Html>
			<Head>
				<Font
					fontFamily="Public Sans"
					fallbackFontFamily="Helvetica"
					webFont={{
						url: "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600&display=swap",
						format: "woff2",
					}}
					fontWeight={400}
					fontStyle="normal"
				/>
			</Head>{" "}
			<Body style={main}>
				<Preview>App verification</Preview>
				<Container style={container}>
					<Section style={coverSection}>
						<Section style={{ paddingInline: "35px", paddingTop: "12px" }}>
							<Img
								src={`${"https://app.com"}/logo/app-logo.png`}
								alt="App"
								// width="64"
								height="24px"
							/>
						</Section>
						<Section style={upperSection}>
							<Heading style={h1}>Verify your email address</Heading>
							<Text style={mainText}>Your One-Time Password (OTP) for logging into App is:</Text>
							<Section style={verificationSection}>
								<Text style={verifyText}>Verification code</Text>

								<Text style={codeText}>{verificationCode}</Text>
							</Section>
						</Section>
						<Hr />
						<Section style={lowerSection}>
							<Text style={cautionText}>
								This OTP is valid for 10 minutes. Please do not share this code with anyone for
								security reasons. If you did not request this, please ignore this email or contact
								our support team immediately.
							</Text>
						</Section>
					</Section>
					<Text style={footerText}>
						This message was produced and distributed by App, Ltd.{" "}
						<Link href="https://app.com" target="_blank" style={link}>
							App.com
						</Link>
						<br />
						View our{" "}
						<Link href="https://app.com/privacy-policy" target="_blank" style={link}>
							privacy policy
						</Link>
						.
					</Text>
				</Container>
			</Body>
		</Html>
	);
}

const main = {
	backgroundColor: "#fff",
	color: "#212121",
};

const container = {
	padding: "20px",
	margin: "0 auto",
	backgroundColor: "#eee",
};

const h1 = {
	color: "#333",
	fontFamily:
		"-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
	fontSize: "20px",
	fontWeight: "bold",
	marginBottom: "15px",
};

const link = {
	color: "#2754C5",
	fontFamily:
		"-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
	fontSize: "14px",
	textDecoration: "underline",
};

const text = {
	color: "#333",
	fontFamily:
		"-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
	fontSize: "14px",
	margin: "24px 0",
};

const imageSection = {
	backgroundColor: "#fff",
	display: "flex",
	padding: "20px 0",
	alignItems: "center",
	justifyContent: "center",
};

const coverSection = { backgroundColor: "#fff" };

const upperSection = { padding: "12px 35px" };

const lowerSection = { padding: "25px 35px" };

const footerText = {
	...text,
	fontSize: "12px",
	padding: "0 20px",
};

const verifyText = {
	...text,
	margin: 0,
	fontWeight: "bold",
	textAlign: "center" as const,
};

const codeText = {
	...text,
	fontWeight: "bold",
	fontSize: "36px",
	margin: "10px 0",
	textAlign: "center" as const,
};

const validityText = {
	...text,
	margin: "0px",
	textAlign: "center" as const,
};

const verificationSection = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
};

const mainText = { ...text, marginBottom: "14px" };

const cautionText = { ...text, margin: "0px" };
