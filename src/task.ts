import { type Stream, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import {
	Listr,
	type ListrDefaultRenderer,
	type ListrPrimaryRendererTaskOptions,
	ListrRendererSelection,
	type ListrTaskFailure,
} from "listr2";

type Status = { status?: string; details?: string };

type Task = {
	pipe: (stream: Stream.Readable) => void;
	update: (_?: Status) => void;
	/** Resolves after the final render and stdout/stderr have been restored. */
	complete: (_?: Status) => Promise<void>;
	/** Marks the task as failed without rejecting or interrupting the process. */
	fail: (_?: Status) => Promise<void>;
};

export type TaskOptions =
	ListrPrimaryRendererTaskOptions<ListrDefaultRenderer>["rendererOptions"];

export const defaultTaskOptions: TaskOptions = {
	persistentOutput: true,
	outputBar: 10,
};

/** Await complete/fail before starting another task list. */
export async function task(
	title: string,
	options: TaskOptions = defaultTaskOptions,
): Promise<Task> {
	const context = Promise.withResolvers<Task>();

	const listr = new Listr(
		[
			{
				title,
				task: async (_, task) => {
					const completion = Promise.withResolvers<
						ListrTaskFailure | undefined
					>();
					const streams = new Map<Stream.Readable, Writable>();
					let finished = false;
					const bar = options?.bottomBar || (options?.outputBar ?? true);
					const limit = typeof bar === "number" && bar > 0 ? bar : 1;
					let lines = [""];
					let carriageReturn = false;

					const render = (final = false) => {
						if (bar === false || bar === 0) return;
						// A log cannot replace earlier snapshots. Emit only its persisted tail.
						if (listr.rendererSelection !== ListrRendererSelection.PRIMARY) {
							if (!final || !options?.persistentOutput) return;
						}
						// Listr bounds events, not lines. Publish one bounded snapshot.
						task.output = null;
						const visible = lines.at(-1) === "" ? lines.slice(0, -1) : lines;
						if (visible.length) task.output = visible.slice(-limit).join("\n");
					};

					const append = (value: string) => {
						for (const char of value) {
							if (carriageReturn && char !== "\n") lines[lines.length - 1] = "";
							carriageReturn = char === "\r";
							if (char === "\n") {
								lines.push("");
								if (lines.length > limit + 1) lines.shift();
							} else if (char !== "\r") {
								lines[lines.length - 1] += char;
							}
						}
						if (lines.at(-1) !== "" && lines.length > limit) lines.shift();
						render();
					};

					const set = ({ status, details }: Status) => {
						if (status !== undefined) task.title = status;
						if (details !== undefined) {
							lines = [""];
							carriageReturn = false;
							append(details);
						}
					};

					const finish = (failed: boolean, status: Status) => {
						if (!finished) {
							set(status);
							if (listr.rendererSelection !== ListrRendererSelection.PRIMARY)
								render(true);
							finished = true;
							completion.resolve(
								failed ? task.fail(new Error(task.title)) : undefined,
							);
						}
						return done;
					};

					context.resolve({
						pipe: (stream) => {
							if (finished || streams.has(stream)) return;
							const decoder = new StringDecoder();
							// Decode each source independently, including split UTF-8 characters.
							const writer = new Writable({
								write(chunk, _encoding, callback) {
									if (!finished) append(decoder.write(chunk));
									callback();
								},
								final(callback) {
									const rest = decoder.end();
									if (!finished && rest) append(rest);
									callback();
								},
							});
							streams.set(stream, writer);
							stream.pipe(writer);
						},
						update: (status = {}) => {
							if (!finished) set(status);
						},
						complete: (status = {}) => finish(false, status),
						fail: (status = {}) => finish(true, status),
					});

					try {
						return await completion.promise;
					} finally {
						for (const [stream, writer] of streams) {
							stream.unpipe(writer);
							writer.destroy();
						}
					}
				},
				rendererOptions: options,
			},
		],
		{
			exitOnError: false,
			rendererOptions: { showErrorMessage: false },
		},
	);

	const done = listr.run().then(() => {});
	// A renderer startup failure must reject task(), rather than leave it pending.
	void done.catch(context.reject);

	return context.promise;
}
