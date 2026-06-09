import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type CertLanguage,
	certToE,
	deprecate,
	eHistogram,
	kindToE,
	type MirrorIn,
	mirrorE,
	noLoss,
	relabel,
	type TestKind,
} from "./contracte";

// The FK16 reproducibility mirror (CLAUDE.md §6 determinism-first), twin of the Go property test.
// Same mirror ⇒ same E; same corpus ⇒ same output; the N preserved + never lost; lifecycle monotone.

const ALL_CERTS: CertLanguage[] = [
	"gherkin",
	"xstate",
	"fast-check",
	"rapid",
	"zod",
	"pact",
	"type-check",
	"k6",
	"fixture",
	"snapshot",
	"unit",
	"prose",
];
const ALL_KINDS: TestKind[] = [
	"acceptance",
	"e2e",
	"property",
	"fixture",
	"contract",
	"schema",
	"unit",
	"snapshot",
	"meter",
];
const ALL_N = ["N0", "N1", "N2", "N3", "N4", "N5"];

describe("FK16 contracte twin — E-typing parity", () => {
	it("known mappings match the declared ladder", () => {
		expect(mirrorE("acceptance", "gherkin")).toBe(3);
		expect(mirrorE("property", "rapid")).toBe(5);
		expect(mirrorE("unit", "unit")).toBe(2);
		expect(mirrorE("meter", "k6")).toBe(6);
		expect(certToE("zod")).toBe(1);
		expect(kindToE("schema")).toBe(1);
	});

	it("prose (non-executable) is always E0 regardless of kind", () => {
		fc.assert(
			fc.property(fc.constantFrom(...ALL_KINDS), (k) => {
				expect(mirrorE(k, "prose")).toBe(0);
			}),
		);
	});

	it("mirrorE is deterministic and total", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...ALL_KINDS),
				fc.constantFrom(...ALL_CERTS),
				(k, c) => {
					const a = mirrorE(k, c);
					expect(mirrorE(k, c)).toBe(a);
					expect(a).toBeGreaterThanOrEqual(0);
					expect(a).toBeLessThanOrEqual(7);
				},
			),
		);
		// total over arbitrary strings (unknown → E0).
		fc.assert(
			fc.property(fc.string(), fc.string(), (k, c) => {
				const e = mirrorE(k, c);
				expect(e).toBeGreaterThanOrEqual(0);
				expect(e).toBeLessThanOrEqual(7);
			}),
		);
	});

	it("relabel loses nothing: noLoss always holds, N preserved", () => {
		const arbMirror = fc.record({
			mirrorId: fc.string({ minLength: 1, maxLength: 5 }),
			testKind: fc.constantFrom(...ALL_KINDS),
			certLanguage: fc.constantFrom(...ALL_CERTS),
			n: fc.constantFrom(...ALL_N),
		}) as fc.Arbitrary<MirrorIn>;
		fc.assert(
			fc.property(fc.array(arbMirror, { maxLength: 10 }), (corpus) => {
				const tags = relabel(corpus);
				expect(noLoss(corpus, tags)).toBe(true);
				corpus.forEach((m, i) => {
					expect(tags[i].n).toBe(m.n);
					expect(tags[i].nLifecycle).toBe("deprecated");
				});
			}),
		);
	});

	it("deprecate is monotone + idempotent", () => {
		expect(deprecate("active")).toBe("deprecated");
		expect(deprecate("deprecated")).toBe("deprecated");
		expect(deprecate(deprecate("active"))).toBe("deprecated");
	});

	it("histogram counts every rung zero-filled", () => {
		const tags = relabel([
			{ mirrorId: "a", testKind: "property", certLanguage: "rapid", n: "N1" },
			{
				mirrorId: "b",
				testKind: "acceptance",
				certLanguage: "gherkin",
				n: "N0",
			},
		]);
		const h = eHistogram(tags);
		expect(h[5]).toBe(1);
		expect(h[3]).toBe(1);
		expect(h[7]).toBe(0);
		expect(Object.keys(h).length).toBe(8);
	});
});
