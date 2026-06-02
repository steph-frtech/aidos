/**
 * Reproducibility mirror (∀) for the SemanticDiff projection (lib/semantic-diff.ts), the TS twin of
 * back/runtime/semanticdiff's rapid property test. fast-check is the frozen front invariant slot
 * (ADR 0003). It pins KRD §44.1: determinism, totality, identity⇒none, scope-only⇒rescope,
 * weight-only⇒reweight, enabled_when change⇒override, and the three done criteria on the canonical
 * examples — so the screen classifies exactly as the Go Classify / `aidos diff`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Artifact,
	type Body,
	type ChangeType,
	classify,
	LANDED_TYPES,
} from "./semantic-diff";
import { EXAMPLES } from "./semantic-diff-data";

const VALID: ReadonlySet<ChangeType> = new Set<ChangeType>([
	...LANDED_TYPES,
	"none",
	"unclassifiable",
]);

const arbBody: fc.Arbitrary<Body | null> = fc.option(
	fc.dictionary(
		fc.constantFrom(
			"kind",
			"name",
			"scope",
			"weight",
			"enabled_when",
			"allow",
			"foo",
			"deny_after",
		),
		fc.oneof(
			fc.constantFrom(
				"alpha",
				"beta",
				"cosmetic",
				"load-bearing",
				"active",
				"deprecated",
			),
			fc.boolean(),
		),
	),
	{ nil: null },
);

const arbArtifact: fc.Arbitrary<Artifact> = fc.record({
	version: fc.string({ maxLength: 8 }),
	body: arbBody,
});

describe("semantic-diff classify — reproducibility mirror (S21)", () => {
	it("is deterministic and total (change_type always a declared verdict)", () => {
		fc.assert(
			fc.property(arbArtifact, arbArtifact, (old, next) => {
				const a = classify(old, next);
				const b = classify(old, next);
				expect(a).toEqual(b);
				expect(VALID.has(a.changeType)).toBe(true);
				if (a.changeType === "unclassifiable") {
					expect(a.openQuestion.length).toBeGreaterThan(0);
				}
			}),
		);
	});

	it("identity ⇒ none", () => {
		fc.assert(
			fc.property(
				arbArtifact.filter((a) => a.body !== null),
				(a) => {
					expect(classify(a, a).changeType).toBe("none");
				},
			),
		);
	});

	it("a scope-only delta ⇒ rescope (never override)", () => {
		fc.assert(
			fc.property(fc.string({ minLength: 1, maxLength: 6 }), (name) => {
				const old: Artifact = {
					version: "v1",
					body: { kind: "truth", name, scope: { cells: ["EU"] } },
				};
				const next: Artifact = {
					version: "v2",
					body: { kind: "truth", name, scope: { cells: ["EU", "US"] } },
				};
				expect(classify(old, next).changeType).toBe("rescope");
			}),
		);
	});

	it("a weight-only delta ⇒ reweight (never override)", () => {
		fc.assert(
			fc.property(fc.string({ minLength: 1, maxLength: 6 }), (child) => {
				const common = {
					kind: "link",
					link_kind: "composes",
					parent: { id: "p", version: "v1" },
					child: { id: child, version: "v1" },
				};
				const old: Artifact = {
					version: "v1",
					body: { ...common, weight: "cosmetic" },
				};
				const next: Artifact = {
					version: "v2",
					body: { ...common, weight: "load-bearing" },
				};
				expect(classify(old, next).changeType).toBe("reweight");
			}),
		);
	});

	it("an enabled_when change ⇒ override", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1 }),
				fc.string({ minLength: 1 }),
				(a, b) => {
					fc.pre(a !== b);
					const old: Artifact = {
						version: "v1",
						body: { kind: "control", name: "checkout-button", enabled_when: a },
					};
					const next: Artifact = {
						version: "v2",
						body: { kind: "control", name: "checkout-button", enabled_when: b },
					};
					expect(classify(old, next).changeType).toBe("override");
				},
			),
		);
	});

	it("the three canonical done criteria classify correctly", () => {
		const byId = Object.fromEntries(EXAMPLES.map((e) => [e.id, e]));
		expect(
			classify(byId["checkout-button"].old, byId["checkout-button"].next)
				.changeType,
		).toBe("override");
		expect(
			classify(byId["refund-policy"].old, byId["refund-policy"].next)
				.changeType,
		).toBe("rescope");
		expect(
			classify(byId["help-link"].old, byId["help-link"].next).changeType,
		).toBe("reweight");
		// a scope change is NOT an override
		expect(
			classify(byId["refund-policy"].old, byId["refund-policy"].next)
				.changeType,
		).not.toBe("override");
	});
});
