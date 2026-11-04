import { spawnSync } from "node:child_process";

function run(source: string, tty = false) {
	return spawnSync(process.execPath, ["--input-type=module", "-e", source], {
		cwd: process.cwd(),
		env: { ...process.env, ...(tty ? { LISTR_FORCE_TTY: "1" } : {}) },
		encoding: "utf8",
		timeout: 10000,
	});
}

for (const tty of [false, true]) {
	describe(`task lifecycle (TTY: ${tty})`, () => {
		it("restores output before starting another list", () => {
			const result = run(
				`
				import { proc, task } from './src/index.ts';
				const write = process.stdout.write;
				await proc({ command: [process.execPath, '-e', ''], title: 'first' });
				if (process.stdout.write !== write) throw new Error('stdout still hijacked');
				const next = await task('second');
				await next.complete({ status: 'second complete' });
				console.log('AFTER');
			`,
				tty,
			);
			expect(result.error).toBeUndefined();
			expect(result.status).toBe(0);
			expect(result.stdout).toContain("second complete");
			expect(result.stdout).toContain("AFTER");
		});

		it("renders a failure without aborting or leaking a rejection", () => {
			const result = run(
				`
				import { proc, task } from './src/index.ts';
				const result = await proc({ command: [process.execPath, '-e', 'process.exit(3)'], title: 'first', errors: 'resolve' });
				if (result.code !== 3) throw new Error('lost exit code');
				const next = await task('second');
				await next.fail({ status: 'expected failure' });
				console.log('AFTER');
			`,
				tty,
			);
			expect(result.error).toBeUndefined();
			expect(result.status).toBe(0);
			expect(result.stdout + result.stderr).toContain("expected failure");
			expect(result.stdout).toContain("AFTER");
			expect(result.stderr).not.toContain("Error:");
		});
	});
}

it("keeps stderr rendering after stdout closes", () => {
	const result = run(`
		import { proc } from './src/index.ts';
		const result = await proc({
			command: [process.execPath, '-e', 'process.stdout.end("EARLY"); setTimeout(() => process.stderr.write("LATE"), 50)'],
			title: 'streams'
		});
		if (result.stdout !== 'EARLY' || result.stderr !== 'LATE') throw new Error('lost output');
	`);
	expect(result.status).toBe(0);
	expect(result.stdout).toContain("EARLY");
	expect(result.stdout).toContain("LATE");
});

for (const failure of ["exit", "missing", "signal", "invalid"]) {
	it(`cleans up and allows recovery after ${failure}`, () => {
		const commands = {
			exit: "[process.execPath, '-e', 'process.stdout.write(\"OUT\"); process.stderr.write(\"ERR\"); process.exit(4)']",
			missing: "['/nonexistent-utils-test-executable']",
			signal:
				"[process.execPath, '-e', 'process.kill(process.pid, \"SIGTERM\")']",
			invalid: "[]",
		};
		const result = run(
			`
			import { proc, task, SpawnError } from './src/index.ts';
			const write = process.stdout.write;
			let caught;
			try { await proc({ command: ${commands[failure as keyof typeof commands]}, title: 'broken' }); }
			catch (error) { caught = error; }
			if (!caught) throw new Error('expected rejection');
			if (${JSON.stringify(failure)} !== 'invalid' && !(caught instanceof SpawnError)) throw new Error('wrong error');
			if (${JSON.stringify(failure)} === 'exit' && (caught.code !== 4 || caught.stdout !== 'OUT' || caught.stderr !== 'ERR')) throw new Error('lost result');
			if (process.stdout.write !== write) throw new Error('stdout still hijacked');
			const next = await task('recovery');
			await next.complete();
			console.log('RECOVERED');
		`,
			true,
		);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("RECOVERED");
	});
}

it("flushes the failure before errors: exit terminates", () => {
	const result = run(
		`
		import { proc } from './src/index.ts';
		await proc({ command: [process.execPath, '-e', 'process.exit(7)'], title: 'exit test', errors: 'exit' });
	`,
		true,
	);
	expect(result.status).toBe(7);
	expect(result.stdout).toContain("exited with code 7");
	expect(result.stderr).not.toContain("Error:");
});

for (const titled of [false, true]) {
	for (const code of [0, 2]) {
		it(`honors output modes (title: ${titled}, code: ${code})`, () => {
			for (const output of [false, true, "tail"]) {
				const result = run(
					`
					import { proc } from './src/index.ts';
					const result = await proc({
						command: [process.execPath, '-e', 'for (let i = 0; i < 30; i++) console.log("LINE_" + i + "!"); console.error("STDERR!"); process.exit(${code})'],
						title: ${titled ? "'output test'" : "undefined"}, output: ${JSON.stringify(output)}, errors: 'resolve'
					});
					if (!result.stdout.includes('LINE_0!') || !result.stderr.includes('STDERR!')) throw new Error('lost capture');
				`,
					true,
				);
				expect(result.status, result.stderr).toBe(0);
				const visible = result.stdout + result.stderr;
				if (output === false) {
					expect(visible).not.toContain("LINE_");
					expect(visible).not.toContain("STDERR!");
				} else {
					expect(visible).toContain("LINE_29!");
					expect(visible).toContain("STDERR!");
					if (output === "tail") {
						expect(visible).not.toContain("LINE_0!");
						expect(visible).toContain(`LINE_${code === 0 ? 20 : 5}!`);
					}
				}
			}
		});
	}
}
