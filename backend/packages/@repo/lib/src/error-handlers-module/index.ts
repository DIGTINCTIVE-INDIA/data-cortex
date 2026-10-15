import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * @description Custom error class that extends the built-in Error class for error responses
 */
export class ErrorResponse extends Error {
	constructor(
		public message: string,
		public statusCode: number,
	) {
		super(message); // Call the parent constructor with the message

		// Set the prototype chain explicitly for older environments (optional)
		Object.setPrototypeOf(this, ErrorResponse.prototype);
	}
}

/**
 * Wraps an asynchronous Express middleware/controller to catch potential errors
 * and forward them to the global error handling middleware.
 * * @param fn - An asynchronous function (controller) that takes (req, res, next).
 * @returns A standard Express RequestHandler.
 * @example
 * router.get("/profile", catchAsync(async (req, res, next) => {
 * const user = await db.findUser(req.params.id);
 * if (!user) throw next(new Error("User not found"));
 * res.json(jsonResponse("query", { user }));
 * }));
 */

export const catchAsync = (fn: (req: Request, res: Response, next: NextFunction) => any): RequestHandler => {
	return (req, res, next) => {
		Promise.resolve(fn(req, res, next)).catch(next);
	};
};
