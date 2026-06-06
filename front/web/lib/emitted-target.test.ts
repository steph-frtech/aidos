// emitted-target.test.ts — EL00 front mirror. Proves the TS twin is the byte-identical twin of
// the Go declared truth and that the rendered parity verdict matches the Go reflect.DeepEqual
// parity test. Determinism-first: the twin is a pure value; a fast-check property pins
// reproducibility (same input → same output).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	EMITTED_INVARIANTS,
	type EmittedTarget,
	emittedTargetEL00,
	verifyParity,
} from "./emitted-target";

// The arch-fitness.json config the Go FN04/S84 rule enforces — the SAME file, read directly.
function enforcedTarget(): EmittedTarget {
	const raw = readFileSync(
		join(
			process.cwd(),
			"..",
			"..",
			"back",
			"runtime",
			"agentloop",
			"arch-fitness.json",
		),
		"utf8",
	);
	const cfg = JSON.parse(raw);
	return cfg.emitted_target as EmittedTarget;
}

describe("EL00 — emitted-app target (ADR 0040)", () => {
	it("the TS twin equals the enforced arch-fitness.json emitted_target block (parity)", () => {
		const declared = emittedTargetEL00();
		const enforced = enforcedTarget();
		// strip the JSON-only $comment, like the Go struct ignores unknown fields
		// biome-ignore lint/performance/noDelete: test-only normalisation of the config record
		delete (enforced as unknown as Record<string, unknown>).$comment;
		const verdict = verifyParity(declared, enforced);
		expect(verdict.ok).toBe(true);
		expect(verdict.checks.every((c) => c.ok)).toBe(true);
	});

	it("carries the language-neutral FN02 invariants verbatim (no fork)", () => {
		expect(emittedTargetEL00().functional_invariants).toEqual([
			...EMITTED_INVARIANTS,
		]);
	});

	it("trenches the constructrice≠construite frontier", () => {
		const t = emittedTargetEL00();
		expect(t.constructrice.language).toBe("go");
		expect(t.constructrice.rewritten_in_ts).toBe(false);
		expect(t.constructrice.emits_go_for_user_app).toBe(false);
		expect(t.construite.backend).toBe("hono");
		expect(t.construite.frontend).toBe("hono");
		expect(t.construite.language).toBe("typescript");
		expect(t.construite.datastore_dialect).toBe("postgres");
		expect(t.construite.own_mcp).toBe(true);
		expect(t.construite.own_skills).toBe(true);
		expect(t.construite.operation_interpreter).toBe("go-service-callback");
		// above-the-wall: EL00 is ADR-only, writes no truth
		expect(t.writes_truth).toBe(false);
	});

	it("is reproducible — same (no) input → same output (determinism-first)", () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 8 }), (n) => {
				const first = emittedTargetEL00();
				for (let i = 0; i < n; i++) {
					expect(emittedTargetEL00()).toEqual(first);
				}
			}),
		);
	});

	it("detects drift — a tampered enforced config flips the verdict red", () => {
		const declared = emittedTargetEL00();
		const tampered = emittedTargetEL00();
		tampered.construite.backend = "express"; // not Hono → must fail parity
		expect(verifyParity(declared, tampered).ok).toBe(false);
	});
});
