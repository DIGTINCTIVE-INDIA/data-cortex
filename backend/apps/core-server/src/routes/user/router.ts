import { onlyAdmin } from "@/middlewares/role-middleware.js";
import { Router } from "express";
import { UserController } from "./user.controller.js";

export function createUserRouter() {
	const router = Router();

	router.post("/add-user", onlyAdmin(), UserController.addUser);
	router.post("/update-user", onlyAdmin(), UserController.updateUser);
	router.patch("/toggle-user", onlyAdmin(), UserController.toggleUser);
	router.get("/list-users", onlyAdmin(), UserController.listUsers);

	return router;
}
