/**
 * lib/besoin-intake.test.ts — the reproducibility mirror (vitest + fast-check) of the EL15 besoin-intake
 * capability-door TWIN (lib/besoin-intake.ts). It pins that the door's deterministic projection is a
 * pure total function of the grammar + the EL05 mapping — byte-identical to the Go MCP
 * (back/mcp/besoin-intake/main.go): the level schema, the capture tool, and the emit/no-emit decision
 * (no silent cast). reflects=mcp.besoin-intake (the twin), test_kind=property+example, liveness=live.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allLevels, type Level } from "./besoin-grammar";
import {
	allCaptureProjections,
	besoinLevelSchema,
	CAPTURE_TOOL_BY_LEVEL,
	captureProjection,
	noEmitLevels,
} from "./besoin-intake";

describe("besoinLevelSchema (the besoin_level_schema twin)", () => {
	it("returns a schema for every grammar level, with required fields + a mapping", () => {
		for (const l of allLevels()) {
			const s = besoinLevelSchema(l);
			expect(s, l).not.toBeNull();
			expect(s?.requiredFields.length, l).toBeGreaterThan(0);
			expect(s?.mapping, l).toMatch(/^(emit:|no_emit$)/);
		}
	});

	it("rejects a non-grammar level (the wall: no invented level)", () => {
		expect(besoinLevelSchema("garbage")).toBeNull();
		expect(besoinLevelSchema("")).toBeNull();
	});

	it("is deterministic: same level → byte-identical schema", () => {
		fc.assert(
			fc.property(fc.constantFrom(...allLevels()), (l: Level) => {
				expect(JSON.stringify(besoinLevelSchema(l))).toEqual(
					JSON.stringify(besoinLevelSchema(l)),
				);
			}),
		);
	});
});

describe("captureProjection (the EL05 emit/no-emit decision — no silent cast)", () => {
	it("maps each level to its declared capture tool", () => {
		for (const l of allLevels()) {
			const p = captureProjection(l);
			expect(p, l).toBeDefined();
			expect(p, l).not.toBeNull();
			expect(p?.tool, l).toEqual(CAPTURE_TOOL_BY_LEVEL[l]);
		}
	});

	it("journey and view are NoEmit (they emit no Idea — no silent cast)", () => {
		const journey = captureProjection("journey");
		const view = captureProjection("view");
		const invariant = captureProjection("invariant");
		expect(journey).not.toBeNull();
		expect(view).not.toBeNull();
		expect(invariant).not.toBeNull();
		expect(journey?.emits).toBe(false);
		expect(view?.emits).toBe(false);
		expect(invariant?.emits).toBe(false);
	});

	it("a MAPPING rung emits an Idea of its own kind (self-mapping)", () => {
		for (const l of [
			"product",
			"control",
			"action",
			"operation",
			"entity",
		] as Level[]) {
			const p = captureProjection(l);
			expect(p, l).not.toBeNull();
			expect(p?.emits, l).toBe(true);
			expect(p?.proposes, l).toEqual(l);
		}
		// a policy band emits an Idea{Proposes:policy}.
		const policy = captureProjection("policy");
		expect(policy).not.toBeNull();
		expect(policy?.proposes).toEqual("policy");
	});

	it("noEmitLevels is exactly journey, view, invariant", () => {
		expect(noEmitLevels().sort()).toEqual(["invariant", "journey", "view"]);
	});

	it("allCaptureProjections covers every grammar level (ui-completeness)", () => {
		expect(allCaptureProjections().length).toEqual(allLevels().length);
	});
});
