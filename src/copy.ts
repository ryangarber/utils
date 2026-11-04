import { copyFile, cp, mkdir, stat } from "node:fs/promises";
import { defaultTaskOptions, type TaskOptions, task } from "./task.ts";

export async function copy({
	source,
	destination,
	title,
	output = defaultTaskOptions,
	errors = "reject",
}: {
	source: string;
	destination: string;
	title?: string;
	output?: TaskOptions | null;
	errors?: "resolve" | "reject" | "exit";
}) {
	const state = output ? await task(title ?? "Copying", output) : undefined;

	try {
		const stats = await stat(source);
		state?.update({
			details: `${source} -> ${destination} (${stats.isDirectory() ? "directory" : "file"})`,
		});
		if (stats.isDirectory()) {
			await mkdir(destination, { recursive: true });
			await cp(source, destination, { recursive: true, force: true });
		} else {
			await copyFile(source, destination);
		}
	} catch (error) {
		await state?.fail({
			details: error instanceof Error ? error.message : String(error),
		});
		if (errors === "reject") {
			throw error;
		} else if (errors === "exit") {
			process.exit(1);
		}
	}

	await state?.complete();
}
