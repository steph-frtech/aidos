import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	isTotal,
	LIB_SMOKES,
	mountedSmokes,
	smokeById,
	smokeRegistryHash,
} from "./lib-smoke";

/**
 * Miroir de reproductibilité (∀) pour WB2-01 — le registre déterministe des librairies V2.
 * mirror record: reflects=WB2-01-lib-smoke, test_kind=property, cert_language=fast-check,
 * liveness=live, authority=below (lecture seule, le mur intact).
 *
 * Prouve la TABLE (déterminisme-first) ; le RENDU des libs (un arbre, une machine XState, un
 * React Flow qui montent) est prouvé par l'e2e tests/e2e/v2-lib-smoke.spec.ts.
 */

describe("WB2-01 — registre des sondes de librairies (twin pur)", () => {
	it("est total : id/pkg/label non vides, id uniques", () => {
		expect(isTotal()).toBe(true);
	});

	it("déclare les six libs requises + bpmn-js différé", () => {
		const pkgs = LIB_SMOKES.map((s) => s.pkg);
		for (const required of [
			"react-arborist",
			"react-aria-components",
			"@xstate/react",
			"react-hook-form",
			"@xyflow/react",
		]) {
			expect(pkgs).toContain(required);
		}
		const bpmn = LIB_SMOKES.find((s) => s.pkg === "bpmn-js");
		expect(bpmn?.deferred).toBe(true);
	});

	it("monte cinq sondes (bpmn-js exclu car différé)", () => {
		const mounted = mountedSmokes();
		expect(mounted).toHaveLength(5);
		expect(mounted.every((s) => !s.deferred)).toBe(true);
	});

	it("lookup par id : round-trip total ∧ inconnu → undefined", () => {
		fc.assert(
			fc.property(fc.constantFrom(...LIB_SMOKES.map((s) => s.id)), (id) => {
				const found = smokeById(id);
				expect(found?.id).toBe(id);
			}),
		);
		fc.assert(
			fc.property(
				fc.string().filter((s) => !LIB_SMOKES.some((l) => l.id === s)),
				(unknown) => {
					expect(smokeById(unknown)).toBeUndefined();
				},
			),
		);
	});

	it("hash déterministe : même registre → même hash (idempotent)", () => {
		const a = smokeRegistryHash();
		const b = smokeRegistryHash();
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{8}$/);
	});
});
