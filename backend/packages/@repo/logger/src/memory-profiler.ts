import { logger } from "./logger.js";

export class MemoryProfiler {
	private startUsage: number | null = null;
	private lastUsage: number | null = null;
	private startTime: number | null = null;
	private lastTime: number | null = null;
	private state: "off" | "on" = "on";

	setState(state: "on" | "off") {
		this.state = state;
	}

	start(): void {
		const usage = process.memoryUsage().heapUsed;
		const now = Date.now();

		this.startUsage = usage;
		this.lastUsage = usage;
		this.startTime = now;
		this.lastTime = now;

		if (this.state === "off") return;

		logger.info("Profiler started", {
			logType: "steps",
			heap: this.formatMB(usage),
		});
	}

	at(label = ""): void {
		if (!this.startUsage || !this.startTime) {
			throw new Error("Profiler not started. Call .start() first.");
		}

		const usage = process.memoryUsage().heapUsed;
		const now = Date.now();

		const deltaFromStart = usage - this.startUsage;
		const deltaFromLast = usage - (this.lastUsage ?? usage);

		const timeFromStart = now - this.startTime;
		const timeFromLast = now - (this.lastTime ?? now);

		if (this.state === "on") {
			logger.info("Profiler checkpoint", {
				logType: "steps",
				label,
				sinceStartMB: this.formatMB(deltaFromStart),
				sinceLastMB: this.formatMB(deltaFromLast),
				sinceStartMS: timeFromStart,
				sinceLastMS: timeFromLast,
				currentHeap: this.formatMB(usage),
			});
		}

		this.lastUsage = usage;
		this.lastTime = now;
	}

	private formatMB(bytes: number): number {
		return Number((bytes / 1024 / 1024).toFixed(2));
	}
}
