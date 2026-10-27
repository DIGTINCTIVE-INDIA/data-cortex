import { ErrorResponse } from "@repo/lib/error-handlers-module";
import { logger } from "@repo/logger";
import type { NextFunction, Request, Response } from "express";

/**
 * The engine cannot use the user session -- dc-engine acts as itself, not as a person. A shared
 * secret in a header is the minimum that stops anyone on the network from forging "this check
 * failed" and mailing your whole distribution list, or from telling the backend the engine is up.
 *
 * Read per request rather than at module load, so a deployment that has not set it still boots;
 * only the routes behind this refuse.
 */
export const engineOnly = () => (req: Request, _res: Response, next: NextFunction) => {
	const expected = process.env.DC_ENGINE_CALLBACK_SECRET;

	if (!expected) {
		logger.error("Engine callback rejected: DC_ENGINE_CALLBACK_SECRET is not set on the server");
		throw new ErrorResponse("Engine callback is not configured", 503);
	}

	const provided = req.header("x-dc-engine-secret");

	if (!provided || provided !== expected) {
		logger.warn("Engine callback rejected: bad or missing secret", { ip: req.ip });
		throw new ErrorResponse("Unauthorized", 401);
	}

	next();
};
