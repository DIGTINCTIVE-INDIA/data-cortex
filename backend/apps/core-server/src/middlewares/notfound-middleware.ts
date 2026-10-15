import { ErrorResponse } from "@repo/lib/error-handlers-module";
import type { NextFunction, Request, Response } from "express";
export function notFoundMiddleware(req: Request, res: Response, next: NextFunction) {
	res.status(404);
	return next(new ErrorResponse(`Route doesn't exist for ${req.method}: ${req.originalUrl}`, 404));
}
