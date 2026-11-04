import { log } from "../src/log.ts";
import { proc } from "../src/proc.ts";
import { task } from "../src/task.ts";

await proc({
	command: ["bash", "-c", "pnpm build"],
	title: "smoketesting",
	output: true,
	errors: "resolve",
});

console.log("running");

const test = await task("Running");

test.update({ status: "Updating" });
console.log("running");
await new Promise((resolve) => setTimeout(resolve, 1000));
console.log("running");
test.update({ status: "Updating", details: "Hello, \nw" });
await new Promise((resolve) => setTimeout(resolve, 1000));
test.update({ status: "Updating", details: "Hello, \nworld!" });
await new Promise((resolve) => setTimeout(resolve, 1000));
await test.complete({ status: "Completed" });

log({
	message: "stdout",
	details: "abc: abcdef\nabc: ghijkl\ndef: mnopqr",
	level: "info",
});
