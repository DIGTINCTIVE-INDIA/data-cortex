import { ENV } from "@repo/env";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import { logger } from "@repo/logger";
import type { NextFunction, Request, Response } from "express";

interface Error {
	message?: string;
	statusCode?: number;
}

/**
 * What a person is told when something unexpected happens.
 *
 * Unexpected errors used to be sent to the browser as they were, so a failed lookup showed up as
 * `Failed query: select "id", "email", ... from "users" ... params: someone@example.com` -- internal SQL and
 * an email address in a toast. The real error is logged here; the person gets a sentence and, for the
 * database cases an administrator can act on, a hint about which kind of problem it is.
 */
const NOT_SET_UP = "The application's database is not set up yet or is out of date. Please contact an administrator.";
const UNREACHABLE = "The service cannot reach its database right now. Please try again in a moment.";
const GENERIC_DB = "Something went wrong while loading your data. Please try again; if it keeps happening, contact an administrator.";
const GENERIC = "Something went wrong. Please try again; if it keeps happening, contact an administrator.";

type Failure = { statusCode: number; message: string };

const describeUnexpected = (error: unknown): Failure => {
	const e = error as { message?: string; code?: string; cause?: { code?: string; message?: string } };
	const code = String(e?.cause?.code ?? e?.code ?? "");
	const text = `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;

	// the table or column is missing: the schema was never pushed, or the database was reset
	if (code === "42P01" || code === "42703" || /relation ".+" does not exist|column ".+" does not exist/i.test(text)) {
		return { statusCode: 503, message: NOT_SET_UP };
	}

	// the database cannot be reached or refused the login
	if (/^(08|53|57P0|28)/.test(code) || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|connection terminated|timeout expired/i.test(text)) {
		return { statusCode: 503, message: UNREACHABLE };
	}

	if (/^Failed query:/i.test(String(e?.message)) || code) {
		return { statusCode: 500, message: GENERIC_DB };
	}

	return { statusCode: 500, message: GENERIC };
};

export const errorMiddleware = (error: Error, _req: Request, res: Response, _next: NextFunction) => {
	// Errors the code raised on purpose carry a message written for the reader. Anything else is a surprise.
	const expected = error instanceof ErrorResponse;
	const failure: Failure = expected
		? { statusCode: error.statusCode, message: error.message || "Internal Server Error" }
		: describeUnexpected(error);

	if (ENV.NODE_ENV === "dev" || failure.statusCode >= 500) {
		if (failure.statusCode === 404) {
			logger.warn(error);
		} else {
			logger.error(error);
		}
	}

	res.status(failure.statusCode).json({
		success: false,
		message: failure.message,
		// the original text is only handed back while developing
		...(!expected && ENV.NODE_ENV === "dev" ? { detail: String((error as Error)?.message ?? "") } : {}),
	});
	return;
};
