import type { ColorName } from "chalk";

export type Level = "info" | "warning" | "error";
export const Level = {
	info: "blueBright",
	warning: "yellowBright",
	error: "redBright",
} satisfies Record<Level, ColorName>;
