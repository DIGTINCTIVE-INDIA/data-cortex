type ServerEvent = {
	server: Array<() => void>;
	db: Array<() => void>;
	redis: Array<() => void>;
};

export class ServerEvents {
	static events: ServerEvent = {
		server: [],
		db: [],
		redis: [],
	};

	static onServerReady(fn: () => void) {
		ServerEvents.events.server.push(fn);
	}

	static emitServerReady() {
		ServerEvents.events.server.forEach(fn => fn());
	}

	static onDBReady(fn: () => void) {
		ServerEvents.events.db.push(fn);
	}

	static emitDBReady() {
		ServerEvents.events.db.forEach(fn => fn());
	}

	static onRedisReady(fn: () => void) {
		ServerEvents.events.redis.push(fn);
	}

	static emitRedisReady() {
		ServerEvents.events.redis.forEach(fn => fn());
	}
}
