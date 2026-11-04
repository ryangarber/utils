import chalk from "chalk";
import { Level } from "./level.ts";

export function log({
	message,
	details,
	level = "info",
}: {
	message?: string;
	details?: string;
	level?: Level;
}) {
	if (message !== undefined) {
		console.log(`${chalk[Level[level]]("⁝")} ${message}`);
	}

	if (details !== undefined) {
		console.log(
			details
				.split(/\r?\n/)
				.map((line, index) => `  ${index === 0 ? `›` : ` `} ${line}`)
				.join("\n"),
		);
	}
}
