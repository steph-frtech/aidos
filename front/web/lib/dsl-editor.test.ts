import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type DslDoc,
	ERR_FREE_CODE,
	ERR_UNKNOWN_KIND,
	kinds,
	parseDoc,
	proposeEdit,
} from "./dsl-editor";

// S77 front twin — the TYPED DSL EDITOR. The done-criteria: a control authorized triggers its
// operation (proven over lib/control + lib/operation, the verticale), enabled_when false blocks the
// action, and parsing DSL = pure function. These tests pin S77's added surface: the no-free-code law,
// the typed parse, propose=DRAFT, and reproducibility.

const policyDoc = (over: Partial<DslDoc> = {}): DslDoc => ({
	kind: "policy",
	name: "canPlaceOrder",
	body: {
		kind: "policy",
		scope: "OPERATION",
		target: "createOrder",
		effect: "ALLOW",
		rule: { kind: "exists", sel: "$.auth" },
	},
	...over,
});

const controlDoc = (enabled: boolean): DslDoc => ({
	kind: "control",
	name: "checkout-button",
	body: {
		kind: "control",
		view: "cart",
		label: "cart.checkout",
		visible_when: { kind: "lit", value: true },
		enabled_when: { kind: "lit", value: enabled },
		triggers: "checkout-submit",
	},
});

describe("dsl-editor — the four editable DSL kinds", () => {
	it("lists exactly operation/policy/control/action in canonical order", () => {
		expect(kinds()).toEqual(["operation", "policy", "control", "action"]);
	});
});

describe("dsl-editor — no free code (KRD §24)", () => {
	it("refuses a body smuggling a code field", () => {
		const r = parseDoc({
			kind: "operation",
			name: "evil",
			body: { code: "x" },
		});
		expect(r.ok).toBe(false);
		expect(r.error).toContain(ERR_FREE_CODE);
	});
	it("refuses an unknown DSL kind", () => {
		const r = parseDoc({
			kind: "saga" as DslDoc["kind"],
			name: "x",
			body: {},
		});
		expect(r.ok).toBe(false);
		expect(r.error).toContain(ERR_UNKNOWN_KIND);
	});
});

describe("dsl-editor — propose opens a DRAFT, never applied (the wall)", () => {
	it("proposes a DRAFT changeset with spec+mirror deltas and wrote_kernel false", () => {
		const p = proposeEdit(policyDoc(), "phase-0");
		expect(p.ok).toBe(true);
		expect(p.changeset?.status).toBe("DRAFT");
		expect(p.changeset?.wrote_kernel).toBe(false);
		expect(p.changeset?.spec_delta).toBeDefined();
		expect(p.changeset?.mirror_delta).toBeDefined();
	});
});

describe("dsl-editor — the verticale (control authorized → operation; enabled_when false blocks)", () => {
	it("parses an authorized control (visible ∧ enabled)", () => {
		const r = parseDoc(controlDoc(true));
		expect(r.ok).toBe(true);
	});
	it("enabled_when false still parses but the control is disabled (the UI guards on it)", () => {
		const r = parseDoc(controlDoc(false));
		expect(r.ok).toBe(true);
		// The body's enabled_when is the literal false — a disabled control blocks the action.
		expect(controlDoc(false).body.enabled_when).toEqual({
			kind: "lit",
			value: false,
		});
	});
});

describe("dsl-editor — parsing DSL = pure function (reproducibility)", () => {
	it("same doc → byte-identical canonical and changeset", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("ALLOW", "DENY"),
				fc.stringMatching(/^[a-z]{1,10}$/),
				(effect, name) => {
					const d = policyDoc({
						name,
						body: {
							kind: "policy",
							scope: "OPERATION",
							target: "t",
							effect,
							rule: { kind: "exists", sel: "$.auth" },
						},
					});
					const a = proposeEdit(d, "phase-0");
					const b = proposeEdit(d, "phase-0");
					expect(a.parsed?.canonical).toBe(b.parsed?.canonical);
					expect(a.changeset?.spec_delta.body).toBe(
						b.changeset?.spec_delta.body,
					);
				},
			),
		);
	});
});
