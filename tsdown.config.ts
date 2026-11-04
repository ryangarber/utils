import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	outDir: "./dist",
	platform: "node",
	format: "esm",
	dts: true,
	sourcemap: true,
	minify: true,
	deps: {
		neverBundle: true,
	},
});
