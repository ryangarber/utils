import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { copy, log, proc, task } from "../src/index.ts";

const test = await task("Testing");
test.update({ status: "Testing (in progress)" });
await new Promise((resolve) => setTimeout(resolve, 1000));
test.update({ details: "Hello," });
await new Promise((resolve) => setTimeout(resolve, 1000));
test.update({ details: "Hello, world!" });
await new Promise((resolve) => setTimeout(resolve, 1000));
await test.complete({ status: "Testing" });

await proc({
	command: ["bash", "-c", "pnpm build"],
	errors: "resolve",
	output: { persistentOutput: true, outputBar: 5 },
});

await copy({
	paths: [
		{
			source: fileURLToPath(new URL("../dist", import.meta.url)),
			destination: join(tmpdir(), "utilssmoketest/dist"),
		},
		{
			source: fileURLToPath(new URL("../package.json", import.meta.url)),
			destination: join(tmpdir(), "utilssmoketest/package.json"),
		},
	],
	errors: "resolve",
});

log({
	message: "Results",
	details: JSON.stringify(
		await readdir(join(tmpdir(), "utilssmoketest/dist")),
		null,
		2,
	),
});
