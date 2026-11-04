import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { copy } from "../src/copy.ts";
import { log } from "../src/log.ts";
import { proc } from "../src/proc.ts";
import { task } from "../src/task.ts";

await proc({
	title: "TEST 1",
	command: ["bash", "-c", "pnpm build"],
	errors: "resolve",
	output: { persistentOutput: true, outputBar: 5 },
});

const test = await task("TEST 2");
test.update({ status: "TEST 2 | Updating" });
await new Promise((resolve) => setTimeout(resolve, 1000));
test.update({ details: "Hello," });
await new Promise((resolve) => setTimeout(resolve, 1000));
test.update({ details: "Hello, world!" });
await new Promise((resolve) => setTimeout(resolve, 1000));
await test.complete({ status: "Completed" });

log({
	message: "TEST 3",
	details: "abc: abcdef\nabc: ghijkl\ndef: mnopqr",
	level: "info",
});

await copy({
	source: fileURLToPath(new URL("../package.json", import.meta.url)),
	destination: join(tmpdir(), "package.json"),
	errors: "resolve",
});
