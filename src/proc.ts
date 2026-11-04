import { type SpawnOptions, spawn } from "node:child_process";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { defaultTaskOptions, type TaskOptions, task } from "./task.ts";

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

/**
 * Runs a command to completion, collecting its output.
 *
 * - `title`: what it does, while it runs and once it ends.
 * - `errors`: on failure, whether to reject (with a `SpawnError`), resolve
 *   anyway, or exit this process with its code.
 * - `output`: task renderer options, or `null` to capture without displaying.
 *
 * On Windows, `pnpm` and the like are `.cmd` shims that only a shell runs, so
 * a command there always runs in one, quoted for cmd.exe. A command given
 * `shell: true` is joined as it is; it quotes its own arguments.
 */
export async function proc({
	command,
	title,
	output = defaultTaskOptions,
	errors = "reject",
	env = process.env,
	...options
}: SpawnOptions & {
	command: (string | number)[];
	title?: string;
	output?: TaskOptions | null;
	errors?: "resolve" | "reject" | "exit";
}): Promise<SpawnResult> {
	const [script, ...args] = command.map((arg) => arg.toString());
	const state = output ? await task(title ?? "Running", output) : undefined;

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
	if (child.stdout) state?.pipe(child.stdout);
	if (child.stderr) state?.pipe(child.stderr);

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

	if (!failed) {
		await state?.complete();
	} else {
		await state?.fail({ status: `${title} (${reason(result)})` });
		if (errors === "reject") throw new SpawnError(script, result);
		if (errors === "exit") process.exit(result.code ?? 1);
	}
	return result;
}
