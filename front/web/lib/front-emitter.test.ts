/**
 * The S93 front-emitter twin reproducibility mirror (fast-check — the frozen front property
 * slot). It pins the same done-criteria as the Go rapid mirror: "même Kernel → bundle
 * byte-identique" (byte-stability, INVARIANT to input order), FN02 purity (no module-scope
 * mutable binding) and "chaque bouton porte sa fixture control-spec comme senseur". Same input
 * → same output, on every run.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type ControlModel,
	type EntityModel,
	emitBundle,
	emitFront,
	type FrontSpec,
	isBlocked,
} from "./front-emitter";

const SCALARS = ["string", "int", "decimal", "bool", "timestamptz"] as const;
const CARDS = ["1-1", "1-N", "N-N"] as const;

const ident = fc.stringMatching(/^[a-z][a-z]{0,5}$/);

const arbEntity = fc
	.record({
		name: ident,
		attributes: fc.uniqueArray(
			fc.record({
				name: ident,
				type: fc.constantFrom(...SCALARS),
				required: fc.boolean(),
			}),
			{ minLength: 1, maxLength: 3, selector: (a) => a.name },
		),
		blobs: fc.array(
			fc.constant({
				name: "file",
				allowedMime: ["image/png"],
				maxBytes: 1024,
				required: false,
			}),
			{ maxLength: 1 },
		),
		refs: fc.array(
			fc.record({
				name: fc.constant("owner"),
				target: fc.constant("Other"),
				cardinality: fc.constantFrom(...CARDS),
				required: fc.boolean(),
			}),
			{ maxLength: 1 },
		),
	})
	.map((e) => e as unknown as EntityModel);

const arbControl = fc
	.record({
		name: ident,
		view: fc.constant("main"),
		label: ident.map((n) => `btn.${n}`),
		operation: ident.map((n) => `do${n}`),
		fixtures: fc.constant([
			{ given: "ready", visible: true, enabled: true },
			{ given: "loading", visible: true, enabled: false },
		]),
	})
	.map((c) => c as unknown as ControlModel);

const arbSpec = fc
	.record({
		project: fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/),
		entities: fc.uniqueArray(arbEntity, {
			minLength: 1,
			maxLength: 3,
			selector: (e) => e.name,
		}),
		controls: fc.uniqueArray(arbControl, {
			minLength: 1,
			maxLength: 3,
			selector: (c) => c.name,
		}),
	})
	.map((s) => s as unknown as FrontSpec);

function shuffle(s: FrontSpec): FrontSpec {
	const e = [...s.entities];
	const c = [...s.controls];
	if (e.length >= 2) [e[0], e[e.length - 1]] = [e[e.length - 1], e[0]];
	if (c.length >= 2) [c[0], c[c.length - 1]] = [c[c.length - 1], c[0]];
	return { project: s.project, entities: e, controls: c };
}

describe("S93 front-emitter twin — reproducibility + sensor", () => {
	it("bundle is byte-identical, INVARIANT to input order", () => {
		fc.assert(
			fc.property(arbSpec, (spec) => {
				const a = emitBundle(spec);
				const b = emitBundle(shuffle(spec));
				expect(isBlocked(a)).toBe(false);
				expect(a).toBe(b);
			}),
		);
	});

	it("every control button carries its fixture sensor (op + each given)", () => {
		fc.assert(
			fc.property(arbSpec, (spec) => {
				const files = emitFront(spec);
				expect(isBlocked(files)).toBe(false);
				if (isBlocked(files)) return;
				const controls = files.find((f) => f.target === "front-controls");
				expect(controls).toBeDefined();
				const body = controls?.bytes ?? "";
				for (const c of spec.controls) {
					expect(body).toContain(`data-aidos-invoke="${c.operation}"`);
					expect(body).toContain(`\\"op\\":\\"${c.operation}\\"`);
					for (const f of c.fixtures)
						expect(body).toContain(`\\"given\\":\\"${f.given}\\"`);
				}
			}),
		);
	});

	it("no emitted module carries a module-scope mutable binding (FN02)", () => {
		fc.assert(
			fc.property(arbSpec, (spec) => {
				const files = emitFront(spec);
				if (isBlocked(files)) return;
				for (const f of files)
					for (const line of f.bytes.split("\n"))
						expect(line.startsWith("let ") || line.startsWith("var ")).toBe(
							false,
						);
			}),
		);
	});

	it("every entity gets exactly one form; every blob becomes a file input", () => {
		fc.assert(
			fc.property(arbSpec, (spec) => {
				const files = emitFront(spec);
				if (isBlocked(files)) return;
				const forms = files.filter((f) => f.target === "front-entity-form");
				expect(forms.length).toBe(spec.entities.length);
				for (const e of spec.entities) {
					const form = forms.find(
						(f) =>
							f.path ===
							`gen/${spec.project}/web/${e.name.toLowerCase()}.form.tsx`,
					);
					expect(form).toBeDefined();
					for (const b of e.blobs ?? [])
						expect(form?.bytes).toContain(`name="${b.name}" type="file"`);
				}
			}),
		);
	});

	it("an empty spec is refused with a typed BlockReason (the wall honesty)", () => {
		const br = emitFront({ project: "", entities: [], controls: [] });
		expect(isBlocked(br)).toBe(true);
		if (isBlocked(br)) {
			expect(br.code).toBe("OUT_OF_SCOPE");
			expect(br.how_to_fix.length).toBeGreaterThan(0);
		}
	});
});
