import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	assemble,
	assembleAll,
	assembledRefs,
	type Decl,
	declaredRefs,
	detectDrift,
	type FacetSpec,
	markerHash,
	OSI_LAYERS,
	type OSISpec,
	PROJECTIONS,
	SPEC_FACETS,
	type SpecFacet,
	serializeBody,
	sourceHash,
	TEST_KINDS,
	type TechKernel,
	type TestGroup,
	type TestKind,
	validate,
} from "./tech-spec";
import { checkoutKernel, scorerKernel } from "./tech-spec-data";

// Reproducibility mirror (∀) for the Tech-Spec TS twin (FK15 part (b)). reflects=lib/tech-spec ·
// test_kind=property · cert_language=fast-check · liveness=live. It pins the SAME invariants as the
// Go property mirror (back/runtime/generators/techspec) so the /tech-spec panel never drifts from Go.

const arbDecl = (prefix: string): fc.Arbitrary<Decl> =>
	fc.record({
		ref: fc
			.constantFrom("a", "b", "c", "d", "e")
			.map((id) => `${prefix}:${id}`),
		title: fc.constantFrom("T1", "T2", "T3"),
		body: fc.constantFrom("corps un", "corps deux"),
	});

const arbKernel: fc.Arbitrary<TechKernel> = fc
	.tuple(
		fc.boolean(),
		fc.constantFrom("K1", "K2", "K3"),
		fc.option(arbDecl("contract"), { nil: undefined }),
		fc.option(arbDecl("model"), { nil: undefined }),
		fc.uniqueArray(fc.constantFrom(...OSI_LAYERS), { selector: (l) => l }),
		fc.uniqueArray(fc.constantFrom(...SPEC_FACETS), { selector: (f) => f }),
		fc.array(arbDecl("adr"), { maxLength: 3 }),
		fc.uniqueArray(fc.constantFrom(...TEST_KINDS), { selector: (t) => t }),
	)
	.chain(
		([networked, kernelId, contract, model, layers, facets, adrs, kinds]) =>
			fc
				.tuple(
					fc.tuple(
						...layers.map(() => fc.array(arbDecl("osi"), { maxLength: 3 })),
					),
					fc.tuple(
						...layers.map(() => fc.array(arbDecl("otest"), { maxLength: 3 })),
					),
					fc.tuple(
						...facets.map(() => fc.array(arbDecl("fspec"), { maxLength: 3 })),
					),
					fc.tuple(
						...facets.map(() => fc.array(arbDecl("ftest"), { maxLength: 3 })),
					),
					fc.tuple(
						...kinds.map(() => fc.array(arbDecl("group"), { maxLength: 3 })),
					),
				)
				.map(([osiSpecs, osiTests, facetSpecs, facetTests, groupTests]) => {
					const osi: OSISpec[] = networked
						? layers.map((layer, i) => ({
								layer,
								specs: osiSpecs[i] ?? [],
								tests: osiTests[i] ?? [],
							}))
						: [];
					const facetSpecs2: FacetSpec[] = facets.map((facet, i) => ({
						facet: facet as SpecFacet,
						specs: facetSpecs[i] ?? [],
						tests: facetTests[i] ?? [],
					}));
					const testGroups: TestGroup[] = kinds.map((kind, i) => ({
						kind: kind as TestKind,
						tests: groupTests[i] ?? [],
					}));
					return {
						kernelId,
						networked,
						contract,
						model,
						osi,
						facets: facetSpecs2,
						adrs,
						testGroups,
					};
				}),
	);

// shuffle reverses every slice — a maximal input-order perturbation.
function shuffle(k: TechKernel): TechKernel {
	const rev = <T>(a: T[]): T[] => [...a].reverse();
	return {
		...k,
		osi: rev(
			(k.osi ?? []).map((o) => ({
				...o,
				specs: rev(o.specs),
				tests: rev(o.tests),
			})),
		),
		facets: rev(
			(k.facets ?? []).map((f) => ({
				...f,
				specs: rev(f.specs),
				tests: rev(f.tests),
			})),
		),
		adrs: rev(k.adrs ?? []),
		testGroups: rev(
			(k.testGroups ?? []).map((g) => ({ ...g, tests: rev(g.tests) })),
		),
	};
}

describe("tech-spec (FK15 part b)", () => {
	it("every generated kernel is valid", () => {
		fc.assert(
			fc.property(arbKernel, (k) => {
				expect(validate(k)).toBeNull();
			}),
		);
	});

	it("Prop 1 — determinism: same kernel ⇒ byte-identical projections", () => {
		fc.assert(
			fc.property(arbKernel, (k) => {
				const a = assembleAll(k);
				const b = assembleAll(k);
				expect(a).not.toBeNull();
				for (const p of PROJECTIONS) expect(a?.[p]).toBe(b?.[p]);
			}),
		);
	});

	it("Prop 2 — input-order invariance: a shuffled kernel ⇒ byte-identical files", () => {
		fc.assert(
			fc.property(arbKernel, (k) => {
				const a = assembleAll(k);
				const b = assembleAll(shuffle(k));
				for (const p of PROJECTIONS) expect(a?.[p]).toBe(b?.[p]);
			}),
		);
	});

	it("Prop 3 — zero new truth: declaredRefs === assembledRefs", () => {
		fc.assert(
			fc.property(arbKernel, (k) => {
				expect(assembledRefs(k)).toEqual(declaredRefs(k));
			}),
		);
	});

	it("Prop 4 — drift ⇔ hand-edit", () => {
		fc.assert(
			fc.property(arbKernel, (k) => {
				for (const p of PROJECTIONS) {
					const clean = assemble(k, p);
					expect(clean).not.toBeNull();
					expect(detectDrift(k, p, clean as string)).toBeNull();
					const f = clean as string;
					const i = f.indexOf("<!-- AIDOS-TECHSPEC-SOURCE-HASH:");
					const tampered = `${f.slice(0, i)}X${f.slice(i)}`;
					const d = detectDrift(k, p, tampered);
					expect(d?.kind).toBe("HAND_EDITED");
				}
			}),
		);
	});

	it("Prop 5 — serializeBody is order-independent (same logical kernel ⇒ same body)", () => {
		fc.assert(
			fc.property(arbKernel, (k) => {
				expect(serializeBody(k)).toBe(serializeBody(shuffle(k)));
				expect(sourceHash(k)).toBe(sourceHash(shuffle(k)));
			}),
		);
	});

	it("demo kernels assemble both projections with zero new truth", () => {
		for (const k of [checkoutKernel, scorerKernel]) {
			const all = assembleAll(k);
			expect(all).not.toBeNull();
			expect(assembledRefs(k)).toEqual(declaredRefs(k));
		}
		// Pure-function kernel carries NO OSI section.
		expect(
			assemble(scorerKernel, "fiche-specification-technique"),
		).not.toContain("Pile de communication (OSI)");
		// Networked kernel does carry it.
		expect(assemble(checkoutKernel, "fiche-specification-technique")).toContain(
			"Pile de communication (OSI)",
		);
	});

	it("the markers parse back", () => {
		const f = assemble(
			checkoutKernel,
			"fiche-specification-technique",
		) as string;
		expect(markerHash(f)).toBe(sourceHash(checkoutKernel));
	});
});
