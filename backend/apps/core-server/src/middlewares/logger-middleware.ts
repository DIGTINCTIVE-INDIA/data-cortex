import { logger } from "@repo/logger";
import type { Request, Response } from "express";
import morgan from "morgan";

const jsonFormat = (tokens: morgan.TokenIndexer, req: Request, res: Response) => {
	const method = tokens.method(req, res) || "-";
	const url = tokens.url(req, res) || "-";
	const status = Number(tokens.status(req, res) || 0);
	const responseTime = tokens["response-time"](req, res) ?? "-";
	const ip =
		(req.ip as string) || (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress;
	const user = req.user ? { id: req.user.id, email: req.user.email } : null;

	return JSON.stringify({
		method,
		url,
		status,
		responseTimeMs: responseTime,
		user,
		ip,
		ts: new Date().toISOString(),
	});
};

const safeLog = (
	level: "info" | "warn" | "error",
	message: string,
	meta?: Record<string, unknown>
) => {
	const lg = logger;
	if (typeof lg.log === "function") {
		lg.log({ level, message, msg: message, ...meta });
		return;
	}
	const fn = lg[level];
	if (typeof fn === "function") {
		fn(message, meta);
		return;
	}
	// fallback
	if (level && console[level]) {
		console[level]?.(message, meta ?? {});
	} else console.warn(message, meta ?? {});
};

const loggerStream = {
	write: (message: string) => {
		const trimmed = message.trim();
		if (!trimmed) return;
		try {
			const meta = JSON.parse(trimmed) as {
				method: string;
				url: string;
				status: number;
				responseTimeMs: string | number;
				user?: { id: string; email: string } | null;
				ip?: string;
				ts?: string;
			};
			const level = meta.status >= 500 ? "error" : meta.status >= 400 ? "warn" : "info";
			safeLog(level, "http_request", {
				...meta,
				logType: "routeInfo",
			});
		} catch (err) {
			console.error(err);
			safeLog("info", "http_request_parse_error", { raw: trimmed, logType: "routeInfo" });
		}
	},
};

const loggerMiddleware = morgan(jsonFormat as any, {
	skip: (req: Request) => {
		return (
			req.path === "/health" || req.path.startsWith("/static") || req.path.startsWith("/_next")
		);
	},
	stream: loggerStream,
});

export { loggerMiddleware };
