import { static as expressStatic, Router } from "express";

export function createFilesRouter(): Router {
	const router = Router();

	router.get("/*splat", expressStatic("storage"));

	return router;
}
