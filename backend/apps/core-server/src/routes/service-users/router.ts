import { onlyAdmin } from "@/middlewares/role-middleware.js";
import { Router } from "express";

import { ServiceUsersController } from "./service-users.controller.js";

/** Admin only, end to end. Mounted behind the normal access-token check. */
export function createServiceUsersRouter() {
	const router = Router();

	router.use(onlyAdmin());

	router.get("/", ServiceUsersController.list);
	router.post("/", ServiceUsersController.create);
	router.post("/:id/keys", ServiceUsersController.createKey);
	router.delete("/keys/:keyId", ServiceUsersController.revokeKey);

	return router;
}
