# @ryangarber/utils

Logging, task progress, and child processes for scripts.

```ts
import { log, proc, task } from "@ryangarber/utils";

await proc({
	command: ["pnpm", "build"],
	title: "Building",
	output: { outputBar: 5, persistentOutput: true },
});

const progress = await task("Preparing");
progress.update({ status: "Copying", details: "config.json" });
await progress.complete({ status: "Prepared" });

log({ message: "Ready", details: "Build and preparation finished." });
```

Always await `complete()` or `fail()` before starting another task list. These
promises include the final render and restoration of stdout/stderr. Each `task()`
owns an independent Listr renderer; use these wrappers sequentially. For concurrent
tasks, use a single `Listr` list (also exported by this package).

`fail({ status, details })` displays a failed task without rejecting or exiting.
The first call to `complete()` or `fail()` finalizes the task; later updates are
ignored. `pipe(readable)` appends streamed output to the shared line buffer;
closing one input stream leaves other inputs active.
Details updates replace the previous details. Streamed chunks append to the
current output, joining partial lines. `outputBar` (or `bottomBar`) limits the
number of newline-delimited lines displayed and retained after completion;
`persistentOutput: false` removes output when the task finishes.
In noninteractive logs, only the final persistent output is printed.

`proc()` captures stdout/stderr and returns `{ stdout, stderr, code, signal,
error }`. Its options are:

- `errors: "reject"` (default): throw `SpawnError`, including captured output.
- `errors: "resolve"`: return the failed result.
- `errors: "exit"`: finish rendering, then exit with the child code (or 1).
- `output: { outputBar: 10, persistentOutput: true }` (default): stream stdout
  and stderr into a shared rolling window. The returned output stays complete.
- `output: null`: capture output without displaying it.

Command arguments run directly by default. With `shell: true`, the caller quotes
shell arguments. On Windows, commands use a shell to support `.cmd` shims.
