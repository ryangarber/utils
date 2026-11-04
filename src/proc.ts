import { type SpawnOptions, spawn } from "node:child_process";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { log } from "./log.ts";
import { task } from "./task.ts";

type SpawnResult = {
	stdout: string;
	stderr: string;
	code?: number;
	signal?: NodeJS.Signals;
	error?: Error;
};

function reason({ error, code, signal }: SpawnResult) {
	return error
		? error.message
		: code
			? `exited with code ${code}`
			: `terminated by signal ${signal}`;
}

/** What `spawn` rejects with: why it failed, and everything it printed. */
export class SpawnError extends Error implements SpawnResult {
	stdout: string;
	stderr: string;
	code?: number;
	signal?: NodeJS.Signals;
	error?: Error;

	constructor(command: string, result: SpawnResult) {
		super(`${command} failed: ${reason(result)}`, { cause: result.error });
		this.name = "SpawnError";
		this.stdout = result.stdout;
		this.stderr = result.stderr;
		this.code = result.code;
		this.signal = result.signal;
		this.error = result.error;
	}
}

const quoteForCmd = (arg: string) =>
	/^[\w@%+=:,./\\-]+$/.test(arg) ? arg : `"${arg.replaceAll('"', '""')}"`;

const tail = (value: string, lines: number) =>
	value.trimEnd().split("\n").slice(-lines).join("\n");

/**
 * Runs a command to completion, collecting its output.
 *
 * - `title`: what it does, while it runs and once it ends.
 * - `errors`: on failure, whether to reject (with a `SpawnError`), resolve
 *   anyway, or exit this process with its code.
 * - `output`: whether to display stdout and stderr; `"tail"`
 *   prints only the end of stdout (more of it, if it fails), for a build step
 *   that would print pages.
 *
 * On Windows, `pnpm` and the like are `.cmd` shims that only a shell runs, so
 * a command there always runs in one, quoted for cmd.exe. A command given
 * `shell: true` is joined as it is; it quotes its own arguments.
 */
export async function proc({
	command,
	title,
	env = process.env,
	errors = "reject",
	output = true,
	...options
}: SpawnOptions & {
	command: (string | number)[];
	title?: string;
	errors?: "resolve" | "reject" | "exit";
	output?: boolean | "tail";
}): Promise<SpawnResult> {
	const [script, ...args] = command.map((arg) => arg.toString());
	const state = title
		? await task(title, {
				persistentOutput: true,
				outputBar: output === "tail" ? Infinity : 10,
			})
		: undefined;

	let child: ReturnType<typeof spawn>;
	try {
		// Node joins shell arguments unquoted; shell callers quote their own line.
		child = options.shell
			? spawn([script, ...args].join(" "), { ...options, env })
			: process.platform === "win32"
				? spawn([script, ...args].map(quoteForCmd).join(" "), {
						...options,
						env,
						shell: true,
					})
				: spawn(script, args, { ...options, env });
	} catch (error) {
		await state?.fail({ status: `${title} failed to start` });
		throw error;
	}

	const stdout = text(child.stdout ?? Readable.from([]));
	const stderr = text(child.stderr ?? Readable.from([]));
	if (output === true) {
		if (child.stdout) state?.pipe(child.stdout);
		if (child.stderr) state?.pipe(child.stderr);
	}

	// Wait for close, including after a spawn error, so both streams are drained.
	const closed = new Promise<Pick<SpawnResult, "code" | "signal" | "error">>(
		(resolve) => {
			let error: Error | undefined;
			child.on("error", (cause) => {
				error = cause;
			});
			child.once("close", (code, signal) => {
				resolve({
					code: code ?? undefined,
					signal: signal ?? undefined,
					error,
				});
			});
		},
	);
	let result: SpawnResult;
	try {
		const [status, out, err] = await Promise.all([closed, stdout, stderr]);
		result = { ...status, stdout: out, stderr: err };
	} catch (error) {
		await state?.fail({ status: `${title} failed to read output` });
		throw error;
	}

	const failed = result.code !== 0;
	const out =
		output === "tail" ? tail(result.stdout, failed ? 25 : 10) : result.stdout;
	if (output) {
		if (state && output === "tail") {
			if (out.trim()) state.update({ details: out });
			if (result.stderr.trim()) state.update({ details: result.stderr });
		} else if (!state) {
			if (out.trim()) log({ message: "stdout", details: out });
			if (result.stderr.trim())
				log({ message: "stderr", details: result.stderr });
		}
	}

	if (!failed) {
		await state?.complete({ status: `${title} succeeded` });
	} else {
		await state?.fail({ status: `${title} failed: ${reason(result)}` });
		if (errors === "reject") throw new SpawnError(script, result);
		if (errors === "exit") process.exit(result.code ?? 1);
	}
	return result;
}
