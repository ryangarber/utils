import type { Stream } from "node:stream";
import {
	Listr,
	type ListrDefaultRenderer,
	type ListrPrimaryRendererTaskOptions,
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

type RendererOptions =
	ListrPrimaryRendererTaskOptions<ListrDefaultRenderer>["rendererOptions"];

/** Await complete/fail before starting another task list. */
export async function task(
	title: string,
	rendererOptions: RendererOptions = { persistentOutput: true, outputBar: 10 },
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
					const stdout = task.stdout();
					const streams = new Set<Stream.Readable>();
					let finished = false;

					const set = ({ status, details }: Status) => {
						if (status !== undefined) task.title = status;
						if (details !== undefined) stdout.write(details);
					};

					const finish = (failed: boolean, status: Status) => {
						if (!finished) {
							set(status);
							finished = true;
							completion.resolve(
								failed ? task.fail(new Error(task.title)) : undefined,
							);
						}
						return done;
					};

					context.resolve({
						pipe: (stream) => {
							if (finished) return;
							streams.add(stream);
							// stdout and stderr share this writer; neither owns its lifetime.
							stream.pipe(stdout, { end: false });
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
						for (const stream of streams) stream.unpipe(stdout);
						stdout.end();
					}
				},
				rendererOptions,
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
