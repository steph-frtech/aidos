"use server";

import {
	DEMO_EMITTED_TREE,
	hashVerdict,
	LEAK_PATH,
	LEAK_SOURCE,
	sense,
} from "@/lib/endpoint-fitness";
import type { SensorView } from "./view";

/**
 * Server Action of the /endpoints-fitness Workbench panel — the DP08 sensor
 * EMITTED_NO_HARDCODED_ENDPOINT, executable from the screen
 * (ui-completeness, CLAUDE.md §7).
 *
 * THE GESTURES:
 *   - « injecter un endpoint en dur » adds the canonical leak file
 *     (gen/app/leak.ts — https://1.2.3.4:5432) to the SANDBOX emitted tree
 *     and re-runs the sensor: it goes RED, names the file, and the
 *     BlockReason blocks the cut (the fault-injection done-criterion);
 *   - « retirer le littéral » removes it: the sensor goes GREEN again;
 *   - « mesurer le verdict » replays the scan — same tree → same verdict →
 *     same address (the reproducibility mirror, Go-parity-pinned).
 *
 * DETERMINISM-FIRST: the verdict is the PURE TS AST pass
 * (lib/endpoint-fitness, the real TypeScript compiler API — never an LLM).
 * THE WALL (CLAUDE.md §2): a sandboxed MEASURE — it WRITES NOTHING; the
 * declared rule is above-the-line (arch-fitness.json: idée → miroir → /goal).
 */
export async function senseAction(
	prev: SensorView,
	formData: FormData,
): Promise<SensorView> {
	const op = String(formData.get("op") ?? "measure");
	const injected =
		op === "inject" ? true : op === "remove" ? false : prev.injected;
	const tree = injected
		? { ...DEMO_EMITTED_TREE, [LEAK_PATH]: LEAK_SOURCE }
		: DEMO_EMITTED_TREE;
	const verdict = sense(tree);
	return {
		injected,
		state: verdict.state,
		address: hashVerdict(verdict),
		treeAddress: verdict.tree_address,
		findings: verdict.findings,
		measures: prev.measures + (op === "measure" ? 1 : 0),
	};
}
