import type { Stats } from "node:fs";
import { copyFile, cp, mkdir, stat } from "node:fs/promises";
import { defaultTaskOptions, type TaskOptions, task } from "./task.ts";

export async function copy({
	paths,
	title,
	output = defaultTaskOptions,
	errors = "reject",
}: {
	paths: { source: string; destination: string }[];
	title?: string;
	output?: TaskOptions | null;
	errors?: "resolve" | "reject" | "exit";
}) {
	const state = output ? await task(title ?? "Copying", output) : undefined;

	let details = "";
	try {
		for (const { source, destination } of paths) {
			const sourceStats = await stat(source);
			let destinationStats: Stats | undefined;
			try {
				destinationStats = await stat(destination);
			} catch {}
			details += `${!destinationStats ? "creating" : "replacing"} ${sourceStats.isDirectory() ? "directory" : "file"}: ${source} -> ${destination}\n`;
			state?.update({ details });
			if (sourceStats.isDirectory()) {
				await mkdir(destination, { recursive: true });
				await cp(source, destination, { recursive: true, force: true });
			} else {
				await copyFile(source, destination);
			}
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
