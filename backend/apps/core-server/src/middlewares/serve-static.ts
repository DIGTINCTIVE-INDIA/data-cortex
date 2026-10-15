import {
	static as expressStatic,
	type NextFunction,
	type Request,
	type Response,
	Router,
} from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = "./frontend";

const reactDistPath = path.resolve(__dirname, distPath);

export const serveStatic = () => {
	const router = Router();
	router.use(expressStatic(reactDistPath));
	router.get("/*splat", (req: Request, res: Response, next: NextFunction) => {
		const accept = req.headers.accept || "";
		if (accept.includes("text/html")) {
			return res.sendFile(path.join(reactDistPath, "index.html"));
		}
		return next();
	});

	return router;
};
