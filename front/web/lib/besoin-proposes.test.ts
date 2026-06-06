/**
 * lib/besoin-proposes.test.ts — the vitest + fast-check mirror of the EL05 TypeScript twin
 * (lib/besoin-proposes.ts). It re-proves, on the front, the SAME invariants the Go rapid property
 * proves: the table is total, closed (every Emit target ∈ ideas.ProposesKinds()), alias-free,
 * NoEmit-exact, deterministic, and out-of-grammar is a hard error. determinism-first: the twin is a
 * pure total function — same Level → same Mapping.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allLevels, isLevel } from "./besoin-grammar";
import {
	emitLevels,
	LEVEL_PROPOSES_TABLE,
	type Level,
	levelToProposes,
	levelToProposesChecked,
	noEmitLevels,
	PROPOSES_KINDS,
	proposesKinds,
} from "./besoin-proposes";

describe("EL05 LevelToProposes — total over every valid Level", () => {
	it("maps every valid Level to exactly one Mapping (emit|no_emit), no empty", () => {
		for (const l of allLevels()) {
			const m = levelToProposes(l);
			expect(m.kind === "emit" || m.kind === "no_emit").toBe(true);
			if (m.kind === "emit") expect(m.proposes).toBeTruthy();
			if (m.kind === "no_emit") expect(m.proposes).toBeUndefined();
		}
	});

	it("(fast-check) is total over a sampled valid Level", () => {
		fc.assert(
			fc.property(fc.constantFrom(...allLevels()), (l) => {
				const m = levelToProposes(l);
				return m.kind === "emit" || m.kind === "no_emit";
			}),
		);
	});
});

describe("EL05 LevelToProposes — closed: every Emit target ∈ ProposesKinds()", () => {
	it("never emits a kind outside the closed set", () => {
		const closed = new Set<string>(PROPOSES_KINDS);
		for (const l of allLevels()) {
			const m = levelToProposes(l);
			if (m.kind === "emit") expect(closed.has(m.proposes!)).toBe(true);
		}
	});

	it("proposesKinds() is exactly the 6-member closed set", () => {
		expect(proposesKinds().sort()).toEqual(
			["action", "control", "entity", "operation", "policy", "product"].sort(),
		);
	});
});

describe("EL05 LevelToProposes — no silent alias", () => {
	const selfKind: Partial<Record<Level, string>> = {
		control: "control",
		action: "action",
		operation: "operation",
		entity: "entity",
		product: "product",
		policy: "policy",
	};
	it("self-maps the 5 source-kind rungs + policy band; never aliases another level", () => {
		for (const l of allLevels()) {
			const m = levelToProposes(l);
			const want = selfKind[l];
			if (want) {
				expect(m.kind).toBe("emit");
				expect(m.proposes).toBe(want);
			} else {
				// journey/view/invariant have no kind → MUST be NoEmit (no alias)
				expect(m.kind).toBe("no_emit");
			}
		}
	});

	it("forbids journey→product (journey is NoEmit, not product)", () => {
		expect(levelToProposes("journey").kind).toBe("no_emit");
		expect(levelToProposes("view").kind).toBe("no_emit");
	});
});

describe("EL05 LevelToProposes — NoEmit set is exact", () => {
	it("NoEmit = {journey, view, invariant}", () => {
		expect(noEmitLevels().sort()).toEqual(
			["invariant", "journey", "view"].sort(),
		);
		for (const l of allLevels()) {
			const isNo = levelToProposes(l).kind === "no_emit";
			const want = l === "journey" || l === "view" || l === "invariant";
			expect(isNo).toBe(want);
		}
	});

	it("emitLevels() is the complementary 6", () => {
		expect(emitLevels().sort()).toEqual(
			["action", "control", "entity", "operation", "policy", "product"].sort(),
		);
	});
});

describe("EL05 LevelToProposes — out-of-grammar is a hard error", () => {
	it("(fast-check) any non-level string fails the checked form", () => {
		fc.assert(
			fc.property(fc.string({ minLength: 1, maxLength: 14 }), (raw) => {
				if (isLevel(raw)) return true; // skip valid levels
				const r = levelToProposesChecked(raw);
				return r.ok === false && r.error === "out_of_grammar";
			}),
		);
	});

	it("named out-of-scope kernel layers are hard errors (saga/temporal/globalinvariant)", () => {
		for (const s of ["saga", "temporal", "globalinvariant"]) {
			const r = levelToProposesChecked(s);
			expect(r.ok).toBe(false);
		}
	});
});

describe("EL05 LevelToProposes — reproducible (determinism)", () => {
	it("(fast-check) same Level → same Mapping over 50 calls", () => {
		fc.assert(
			fc.property(fc.constantFrom(...allLevels()), (l) => {
				const first = JSON.stringify(levelToProposes(l));
				for (let n = 0; n < 50; n++) {
					if (JSON.stringify(levelToProposes(l)) !== first) return false;
				}
				return true;
			}),
		);
	});
});

describe("EL05 LevelToProposes — domain is exactly AllLevels()", () => {
	it("table keys ≡ allLevels(), no extra, none missing", () => {
		const keys = Object.keys(LEVEL_PROPOSES_TABLE).sort();
		expect(keys).toEqual([...allLevels()].sort());
	});
});
