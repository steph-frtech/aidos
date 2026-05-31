import { defineConfig } from "vitest/config";

// N4 unit slot (CLAUDE.md §3, frozen stack): Vitest + strict TS for the Workbench.
// Pure-logic / reproducibility mirrors live next to the code as *.test.ts and run in a
// node environment (no DOM needed for the deterministic cores).
export default defineConfig({
	test: {
		include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.ts"],
		environment: "node",
	},
});
