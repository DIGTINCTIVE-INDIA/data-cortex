import { logger } from "@repo/logger";
import { Command } from "commander";

export class InitCommand {
	static command = new Command("ping").action(InitCommand.run.bind(InitCommand));

	private static run() {
		logger.info("pong");
	}
}
