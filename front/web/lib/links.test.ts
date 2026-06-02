import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Heads,
	isKnownKind,
	isPinned,
	LINK_KINDS,
	type Link,
	type Ref,
	resolve,
	validate,
} from "./links";
import {
	EXAMPLE_LINKS,
	HEADS_ABSENT_TARGET,
	HEADS_ALL_GREEN,
} from "./links-data";

/**
 * Reproducibility mirror (fast-check) for the versioned-links projection — the front twin of
 * back/kernel/links's rapid property mirror. reflects=lib/links, test_kind=property,
 * cert_language=fast-check, authority=above (the human red of KRD §41–§42). It pins that the
 * TS projection resolves EXACTLY as the Go Resolve:
 *   - green ⇔ head exists ∧ head == pinned version; missing head ⇒ absent (always red);
 *   - status ∈ {green, stale, absent}; determinism; totality (never throws);
 *   - validate accepts iff kind ∈ the six-set ∧ from/to are pinned id@version refs.
 */

const IDS = ["createOrder", "checkout-submit", "order-entity", "a", ""];
const VERS = ["v1", "v2", "v3", ""];

const arbRef: fc.Arbitrary<Ref> = fc.record({
	id: fc.constantFrom(...IDS),
	version: fc.constantFrom(...VERS),
});

const arbKind = fc.constantFrom(...LINK_KINDS, "depends_on", "uses", "");

const arbLink: fc.Arbitrary<Link> = fc.record({
	kind: arbKind,
	from: arbRef,
	to: arbRef,
});

const arbHeads: fc.Arbitrary<Heads> = fc
	.dictionary(
		fc.constantFrom("createOrder", "checkout-submit", "order-entity", "a"),
		fc.constantFrom("v1", "v2", "v3"),
	)
	.map((d) => d as Heads);

describe("links.validate — closed-kind + pinned", () => {
	it("accepts iff kind ∈ the six-set ∧ from/to are pinned id@version refs", () => {
		fc.assert(
			fc.property(arbLink, (l) => {
				const err = validate(l);
				const wantOK =
					isKnownKind(l.kind) && isPinned(l.from) && isPinned(l.to);
				expect(err === "").toBe(wantOK);
			}),
		);
	});

	it("rejects an unpinned `to` (no version) — an unpinned link is a monster", () => {
		expect(
			validate({
				kind: "mirrors",
				from: { id: "checkout-button", version: "v1" },
				to: { id: "checkout-button-fixture", version: "" },
			}),
		).not.toBe("");
	});

	it("rejects an unknown kind (closed set)", () => {
		expect(
			validate({
				kind: "depends_on",
				from: { id: "a", version: "v1" },
				to: { id: "b", version: "v1" },
			}),
		).not.toBe("");
	});
});

describe("links.resolve — staleness (green/stale/absent)", () => {
	it("is deterministic and status ∈ {green, stale, absent}", () => {
		fc.assert(
			fc.property(arbLink, arbHeads, (l, heads) => {
				const s1 = resolve(l, heads);
				const s2 = resolve(l, heads);
				expect(s1).toBe(s2);
				expect(["green", "stale", "absent"]).toContain(s1);
			}),
		);
	});

	it("green ⇔ head exists ∧ head == pinned version; missing head ⇒ absent", () => {
		fc.assert(
			fc.property(arbLink, arbHeads, (l, heads) => {
				const s = resolve(l, heads);
				if (!Object.hasOwn(heads, l.to.id)) {
					expect(s).toBe("absent");
				} else if (heads[l.to.id] === l.to.version) {
					expect(s).toBe("green");
				} else {
					expect(s).toBe("stale");
				}
			}),
		);
	});

	it("never throws (totality)", () => {
		fc.assert(
			fc.property(arbLink, arbHeads, (l, heads) => {
				expect(() => resolve(l, heads)).not.toThrow();
			}),
		);
	});
});

describe("links example graph — the done criterion", () => {
	it("renders all six KRD §41 kinds", () => {
		const kinds = new Set(EXAMPLE_LINKS.map((l) => l.kind));
		for (const k of LINK_KINDS) expect(kinds.has(k)).toBe(true);
	});

	it("the binds edge is GREEN under head-pinned heads", () => {
		const binds = EXAMPLE_LINKS.find((l) => l.kind === "binds");
		if (!binds) throw new Error("binds edge missing");
		expect(resolve(binds, HEADS_ALL_GREEN)).toBe("green");
	});

	it("the binds edge is ABSENT (red) when its target version is gone — THE done criterion", () => {
		const binds = EXAMPLE_LINKS.find((l) => l.kind === "binds");
		if (!binds) throw new Error("binds edge missing");
		expect(resolve(binds, HEADS_ABSENT_TARGET)).toBe("absent");
	});
});
