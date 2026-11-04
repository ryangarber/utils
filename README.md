# @ryangarber/utils

Logging, task progress, and child processes for scripts.

```ts
import { log, proc, task } from "@ryangarber/utils";

await proc({ command: ["pnpm", "build"], title: "Building", output: "tail" });

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
ignored. `pipe(readable)` displays streamed output without ending the shared
writer when an individual input stream closes.

`proc()` captures stdout/stderr and returns `{ stdout, stderr, code, signal,
error }`. A title enables live task progress. Its options are:

- `errors: "reject"` (default): throw `SpawnError`, including captured output.
- `errors: "resolve"`: return the failed result.
- `errors: "exit"`: finish rendering, then exit with the child code (or 1).
- `output: true` (default): stream output into the task; without a title, print it
  after the process closes.
- `output: false`: capture output without displaying it.
- `output: "tail"`: display the last 10 stdout lines on success or 25 on failure,
  plus all stderr, after the process closes. The returned output stays complete.

Command arguments run directly by default. With `shell: true`, the caller quotes
shell arguments. On Windows, commands use a shell to support `.cmd` shims.
