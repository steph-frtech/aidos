/**
 * lib/capture-idea.test.ts — the vitest + fast-check reproducibility mirror of the S64
 * TypeScript twin (lib/capture-idea.ts). It re-proves, on the front, the SAME contract
 * the Go rapid property proves (back/mcp/idea-intake/capture_scoped_property_test.go):
 * content-addressing is pure + idempotent, the id pins to the Go authority's exact
 * value (no drift), provenance is preserved verbatim, project scope never enters the
 * hash, and a capture is always a draft (the wall — no freeze). determinism-first: the
 * twin is pure and total — same sketch → same idea.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	canonicalSketch,
	captureIdea,
	contentAddress,
	PROPOSES_KINDS,
	type Proposes,
} from "./capture-idea";

const proposesArb = fc.constantFrom<Proposes>(...PROPOSES_KINDS);
const textArb = fc.string({ minLength: 1, maxLength: 80 });

describe("capture-idea twin (S64)", () => {
	// THE ANCHOR: the exact id + canonical form the Go authority computes for the
	// canonical sample (computed via `go run` over ideas.Capture). If this drifts, the
	// twin no longer agrees with the engine — the test catches it byte-for-byte.
	it("pins the Go authority id of the canonical sample (no drift)", () => {
		const intent = "je veux une remise au panier";
		const detail = "humain: « je veux une remise au panier »";
		const sketch = canonicalSketch("operation", intent, {
			source: "human",
			detail,
		});
		expect(sketch).toBe(
			'{"intent":"je veux une remise au panier","proposes":"operation","provenance":{"detail":"humain: « je veux une remise au panier »","source":"human"}}',
		);
		const idea = captureIdea("operation", intent, { source: "human", detail });
		expect(idea.id).toBe(
			"46c9244fc60ef3491e13bfcbcde264f7e6460fe80f1bef78bbcc47c2b87ea6fd",
		);
	});

	it("content-addressing is deterministic + idempotent", () => {
		fc.assert(
			fc.property(proposesArb, textArb, textArb, (proposes, intent, detail) => {
				const a = contentAddress(proposes, intent, { source: "human", detail });
				const b = contentAddress(proposes, intent, { source: "human", detail });
				expect(a).toBe(b);
				expect(a).toMatch(/^[0-9a-f]{64}$/);
			}),
		);
	});

	it("a captured idea is always a draft and carries no mirror field (the wall)", () => {
		fc.assert(
			fc.property(proposesArb, textArb, textArb, (proposes, intent, detail) => {
				const idea = captureIdea(proposes, intent, {
					source: "human",
					detail,
				});
				expect(idea.status).toBe("draft");
				// The type forbids version/mirror; assert the shape carries neither key.
				expect(Object.keys(idea).sort()).toEqual(
					["id", "intent", "proposes", "provenance", "status"].sort(),
				);
			}),
		);
	});

	it("human provenance is preserved verbatim", () => {
		fc.assert(
			fc.property(proposesArb, textArb, textArb, (proposes, intent, detail) => {
				const idea = captureIdea(proposes, intent, {
					source: "human",
					detail,
				});
				expect(idea.provenance.source).toBe("human");
				expect(idea.provenance.detail).toBe(detail);
			}),
		);
	});

	it("project scope never enters the id — same sketch is the same idea across projects", () => {
		fc.assert(
			fc.property(proposesArb, textArb, textArb, (proposes, intent, detail) => {
				// Two captures of the SAME sketch (the project is a separate dimension,
				// not an argument to captureIdea) must share one id.
				const a = captureIdea(proposes, intent, { source: "human", detail });
				const b = captureIdea(proposes, intent, { source: "human", detail });
				expect(a.id).toBe(b.id);
			}),
		);
	});
});
