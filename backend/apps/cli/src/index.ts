import { Command } from "commander";

import { InitCommand } from "./commands/ping";
import { version, name, description } from "../../../package.json";

const program = new Command();

program.name(name).description(description).version(version);

program.addCommand(InitCommand.command);

program.parse(process.argv);
