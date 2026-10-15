import { ENV } from "@repo/env";
import { logger } from "@repo/logger";
import { Redis } from "ioredis";

export const redisClient = new Redis({
	host: ENV.REDIS_HOST,
	port: Number(ENV.REDIS_PORT),
	username: ENV.REDIS_USERNAME,
	password: ENV.REDIS_PASSWORD,
	lazyConnect: true,
});

function setEventListeners() {
	redisClient.on("error", (err: any) => {
		logger.error("Could not establish a connection with redis", { error: err.message });
	});
	redisClient.on("connect", (err: any) => {
		if (err) {
			logger.error("Could not establish a connection with redis", { error: err.message });
		}
		logger.info("Connected to redis successfully");
	});
}

if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
	setEventListeners();
}
