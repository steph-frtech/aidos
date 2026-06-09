import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	applyErasure,
	type Cell,
	erase,
	exportData,
	isShredded,
	PLANS,
	type Plan,
	phaseHash,
	piiVisible,
	type Scope,
	select,
	TOMBSTONE,
} from "./erasure";

/**
 * lib/erasure.test.ts — the S116 reproducibility mirror (∀, fast-check). Same input ⇒
 * byte-identical output; selection is a deterministic scoped query; AFTER erasure no query
 * returns the PII (cross-project, cross-plan); the phase hash is invariant under erasure; a
 * non-erased subject never loses PII. Anchored on the same canonical fixture as the Go
 * authority (back/runtime/erasure).
 */

function sampleStore(): Cell[] {
	return [
		{
			plan: "account",
			subject: "acct-1",
			project: "p1",
			rowId: "a-1",
			structure: "users/shape",
			pii: [
				{
					path: "email",
					ciphertext: "enc",
					keyId: "k-acct-1",
					plaintext: "alice@ex.com",
				},
				{
					path: "name",
					ciphertext: "enc",
					keyId: "k-acct-1",
					plaintext: "Alice",
				},
			],
		},
		{
			plan: "account",
			subject: "acct-1",
			project: "p2",
			rowId: "a-2",
			structure: "profile/shape",
			pii: [
				{
					path: "phone",
					ciphertext: "enc",
					keyId: "k-acct-1",
					plaintext: "555",
				},
			],
		},
		{
			plan: "account",
			subject: "acct-2",
			project: "p9",
			rowId: "a-9",
			structure: "users/shape",
			pii: [
				{
					path: "email",
					ciphertext: "enc",
					keyId: "k-acct-2",
					plaintext: "bob@ex.com",
				},
			],
		},
		{
			plan: "app",
			subject: "u-7",
			app: "shop",
			project: "p1",
			rowId: "s-7",
			structure: "customer/shape",
			pii: [
				{
					path: "email",
					ciphertext: "enc",
					keyId: "k-u-7",
					plaintext: "carol@ex.com",
				},
				{
					path: "address",
					ciphertext: "enc",
					keyId: "k-u-7",
					plaintext: "1 St",
				},
			],
		},
		{
			plan: "app",
			subject: "u-8",
			app: "shop",
			project: "p1",
			rowId: "s-8",
			structure: "customer/shape",
			pii: [
				{
					path: "email",
					ciphertext: "enc",
					keyId: "k-u-8",
					plaintext: "dave@ex.com",
				},
			],
		},
	];
}

describe("S116 — export (GDPR Art. 20)", () => {
	it("renders ALL of a person's data (account plan)", () => {
		const rows = exportData(
			{ plan: "account", subject: "acct-1" },
			sampleStore(),
		);
		expect(rows).toHaveLength(2);
		const paths = rows
			.flatMap((r) => r.fields.map((f) => `${f.path}=${f.value}`))
			.sort();
		expect(paths).toEqual(["email=alice@ex.com", "name=Alice", "phone=555"]);
	});

	it("renders an emitted-app end-user's data (app plan)", () => {
		const rows = exportData(
			{ plan: "app", subject: "u-7", app: "shop" },
			sampleStore(),
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].fields).toHaveLength(2);
	});
});

describe("S116 — erasure (crypto-shred + tombstone)", () => {
	it("shreds the PII, preserves append-only, keeps the phase hash valid, records a decision", () => {
		const store = sampleStore();
		const before = phaseHash(store);
		const res = erase(
			{ plan: "account", subject: "acct-1" },
			store,
			"phase-ref-42",
		);
		const post = applyErasure({ plan: "account", subject: "acct-1" }, store);

		// phase hash invariant — append-only / DAG integrity preserved
		expect(phaseHash(post)).toBe(before);
		// every selected cell shredded; row count preserved (nothing destroyed)
		for (const t of res.tombstoned)
			for (const p of t.cell.pii) expect(isShredded(p)).toBe(true);
		expect(post).toHaveLength(store.length);
		expect(res.tombstoned[0].cell.pii[0].ciphertext).toBe(TOMBSTONE);

		// erased subject irrecoverable; other subjects untouched (cross-plan)
		expect(piiVisible("acct-1", post)).toBe(false);
		expect(piiVisible("acct-2", post)).toBe(true);
		expect(piiVisible("u-7", post)).toBe(true);
		// recorded, content-addressed decision (§9)
		expect(res.decision.id).toMatch(/^[0-9a-f]{64}$/);
		expect(res.decision.keyIds).toEqual(["k-acct-1"]);
	});

	it("an app-user erasure is scoped to one subject (no cross-plan / cross-subject leak)", () => {
		const post = applyErasure(
			{ plan: "app", subject: "u-7", app: "shop" },
			sampleStore(),
		);
		expect(piiVisible("u-7", post)).toBe(false);
		expect(piiVisible("u-8", post)).toBe(true);
		expect(piiVisible("acct-1", post)).toBe(true);
	});
});

const arbCells = fc
	.array(
		fc.record({
			plan: fc.constantFrom<Plan>(...PLANS),
			subject: fc.constantFrom("s1", "s2", "s3"),
			project: fc.constantFrom("p1", "p2"),
			app: fc.constantFrom("app1", "app2", ""),
			structure: fc.constant("shape"),
			pii: fc.array(
				fc.record({
					path: fc.constantFrom("f0", "f1", "f2"),
					ciphertext: fc.constant("enc"),
					keyId: fc.constant("k"),
					plaintext: fc.constantFrom("v0", "v1", "v2"),
				}),
				{ maxLength: 3 },
			),
		}),
		{ maxLength: 12 },
	)
	// RowID is a STABLE append-only id — "never reused, never deleted" (back/runtime/erasure
	// Cell.RowID) — hence GLOBALLY UNIQUE. The Go authority's genCells assigns r0,r1,… by index;
	// mirror that here. An un-indexed arbitrary could collide two cells on one rowId, an INVALID
	// (unreachable) store state that ApplyErasure's rowId-keyed map — byte-identical in Go —
	// is not required to represent. The twin stays faithful to the authority.
	.map((cells) => cells.map((c, i) => ({ ...c, rowId: `r${i}` })));

describe("S116 — reproducibility & determinism (∀)", () => {
	it("erase is reproducible: same input ⇒ byte-identical result", () => {
		fc.assert(
			fc.property(
				arbCells,
				fc.constantFrom<Plan>(...PLANS),
				fc.constantFrom("s1", "s2", "s3"),
				(cells, plan, subj) => {
					const scope: Scope = { plan, subject: subj };
					expect(JSON.stringify(erase(scope, cells, "ref"))).toBe(
						JSON.stringify(erase(scope, cells, "ref")),
					);
				},
			),
		);
	});

	it("after FULL erasure, no query returns the subject's PII (cross-project & cross-plan)", () => {
		fc.assert(
			fc.property(
				arbCells,
				fc.constantFrom("s1", "s2", "s3"),
				(cells, subj) => {
					let post: Cell[] = cells;
					for (const plan of PLANS)
						post = applyErasure({ plan, subject: subj }, post);
					expect(piiVisible(subj, post)).toBe(false);
					for (const plan of PLANS)
						for (const r of exportData({ plan, subject: subj }, post))
							expect(r.fields).toHaveLength(0);
				},
			),
		);
	});

	it("the phase hash is invariant under erasure (append-only preserved)", () => {
		fc.assert(
			fc.property(
				arbCells,
				fc.constantFrom("s1", "s2", "s3"),
				(cells, subj) => {
					const before = phaseHash(cells);
					let post: Cell[] = cells;
					for (const plan of PLANS)
						post = applyErasure({ plan, subject: subj }, post);
					expect(phaseHash(post)).toBe(before);
					expect(post).toHaveLength(cells.length);
				},
			),
		);
	});

	it("select reach equals erase reach (export completeness = erasure reach)", () => {
		fc.assert(
			fc.property(
				arbCells,
				fc.constantFrom<Plan>(...PLANS),
				fc.constantFrom("s1", "s2", "s3"),
				(cells, plan, subj) => {
					const scope: Scope = { plan, subject: subj };
					expect(select(scope, cells).length).toBe(
						erase(scope, cells).tombstoned.length,
					);
				},
			),
		);
	});
});
