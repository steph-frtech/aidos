import { createHash } from "node:crypto";

/**
 * lib/erasure.ts — the S116 GDPR EXPORT & ERASURE layer, the pure TS twin of
 * back/runtime/erasure (the Go authority). It mirrors, deterministically and
 * client-side-mirrorably, the mechanical reconciliation of the REAL tension
 * "append-only truth-store vs the right to erasure" (ROADMAP-app-builder S116).
 *
 * THE RESOLUTION — CRYPTO-SHREDDING + TOMBSTONE. Every PII field lives encrypted at rest under
 * a per-subject key (PiiCipher = ciphertext + key id, never plaintext). Erasure shreds the KEY
 * and overwrites the ciphertext with a fixed TOMBSTONE marker; the append-only ROW and its
 * structural projection survive verbatim. The PHASE HASH is computed over the STRUCTURAL
 * digest (shape + non-PII columns + PII tombstone MARKERS), which is INVARIANT under shredding —
 * so "the phase hash stays valid after erasure" is mechanically true. The erasure is a RECORDED
 * decision (§9), content-addressed (SHA-256 over canonical JSON, byte-identical to the Go
 * records.Hash).
 *
 * TWO PLANS: PlanAccount (hard delete of an AIDOS account + all its projects' data, beyond the
 * S53 soft-delete) and PlanApp (the data-subject rights of the EMITTED app's end-users — the
 * S103 "tout PII oubliable" made concrete).
 *
 * THE WALL (CLAUDE.md §2): this twin WRITES NOTHING. Every function returns a VALUE; landing the
 * tombstoned rows is a below-the-line archive write. The PII never enters the kernel.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): selection is a pure scoped query; export, shredding, the
 * phase digest, and the decision id are pure, total functions — same input ⇒ byte-identical
 * output (lib/erasure.test.ts pins it with fast-check, anchored on the Go fixtures).
 */

export type Plan = "account" | "app";
export const PLANS: Plan[] = ["account", "app"];
export function isPlan(p: string): p is Plan {
	return (PLANS as string[]).includes(p);
}

/** The fixed marker that overwrites a shredded PII ciphertext (PII-free, deterministic). */
export const TOMBSTONE = "☠shredded☠";

export interface PiiCipher {
	path: string;
	ciphertext: string;
	keyId: string;
	/** plaintext drives export; never persisted; absent on a shredded cell. */
	plaintext?: string;
}

export function isShredded(c: PiiCipher): boolean {
	return c.keyId === "" && c.ciphertext === TOMBSTONE;
}

export interface Cell {
	plan: Plan;
	subject: string;
	project: string;
	app?: string;
	rowId: string;
	structure: string;
	pii: PiiCipher[];
}

export interface Scope {
	plan: Plan;
	subject: string;
	project?: string;
	app?: string;
}

function matches(s: Scope, c: Cell): boolean {
	if (c.plan !== s.plan || c.subject !== s.subject) return false;
	if (s.project && c.project !== s.project) return false;
	if (s.app && (c.app ?? "") !== s.app) return false;
	return true;
}

/**
 * Select — the DETERMINISTIC SCOPED QUERY: every cell in scope, in canonical order
 * (project, app, row id). The single selection path export and erasure share.
 */
export function select(scope: Scope, cells: Cell[]): Cell[] {
	return cells
		.filter((c) => matches(scope, c))
		.sort((a, b) => {
			if (a.project !== b.project) return a.project < b.project ? -1 : 1;
			const aa = a.app ?? "";
			const bb = b.app ?? "";
			if (aa !== bb) return aa < bb ? -1 : 1;
			return a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0;
		});
}

export function selectAccount(account: string, cells: Cell[]): Cell[] {
	return select({ plan: "account", subject: account }, cells);
}

export function selectApp(app: string, subject: string, cells: Cell[]): Cell[] {
	return select({ plan: "app", subject, app }, cells);
}

// ── Export (GDPR Art. 20) ────────────────────────────────────────────────────────────────

export interface ExportField {
	path: string;
	value: string;
}
export interface ExportRow {
	project?: string;
	app?: string;
	rowId: string;
	fields: ExportField[];
}

/**
 * Export — render EVERY PII field of the subject in plaintext, in canonical order
 * ("un export rend toutes les données d'une personne"). A shredded cell exports nothing
 * (irrecoverable, honestly reflected).
 */
export function exportData(scope: Scope, cells: Cell[]): ExportRow[] {
	return select(scope, cells).map((c) => {
		const fields = c.pii
			.filter((p) => !isShredded(p))
			.map((p) => ({ path: p.path, value: p.plaintext ?? "" }))
			.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
		const row: ExportRow = { rowId: c.rowId, fields };
		if (c.project) row.project = c.project;
		if (c.app) row.app = c.app;
		return row;
	});
}

// ── Erasure (GDPR Art. 17 — crypto-shred + tombstone) ────────────────────────────────────

export interface Tombstoned {
	rowId: string;
	cell: Cell;
}

export interface ErasureDecision {
	id: string;
	plan: Plan;
	subject: string;
	scope: Scope;
	keyIds: string[];
	rowIds: string[];
	whenRef: string;
}

export interface ErasureResult {
	decision: ErasureDecision;
	tombstoned: Tombstoned[];
}

function shredCell(c: Cell): Cell {
	return {
		...c,
		pii: c.pii.map((p) => ({ path: p.path, ciphertext: TOMBSTONE, keyId: "" })),
	};
}

/**
 * decisionId content-addresses the decision via SHA-256 over CANONICAL JSON — byte-identical
 * to the Go authority. The Go path emits the body then runs records.Canonicalize, which sorts
 * the object keys LEXICOGRAPHICALLY; we emit that exact canonical form (app, key_ids, plan,
 * project, row_ids, subject, when_ref) so Go and TS produce the same id (the twin guarantee,
 * cross-checked in CI; see the e2e + the property mirror).
 */
function decisionId(d: Omit<ErasureDecision, "id">): string {
	const body = JSON.stringify({
		app: d.scope.app ?? "",
		key_ids: d.keyIds,
		plan: d.plan,
		project: d.scope.project ?? "",
		row_ids: d.rowIds,
		subject: d.subject,
		when_ref: d.whenRef,
	});
	return createHash("sha256").update(body).digest("hex");
}

/**
 * Erase — crypto-shred + tombstone the scoped PII (key destroyed, ciphertext → TOMBSTONE),
 * PRESERVING the append-only structure, and return the RECORDED ErasureDecision + the
 * tombstoned cells. Pure and total: same (scope, cells, whenRef) ⇒ byte-identical result.
 * Writes NO truth (a VALUE).
 */
export function erase(
	scope: Scope,
	cells: Cell[],
	whenRef = "",
): ErasureResult {
	const sel = select(scope, cells);
	const tombstoned: Tombstoned[] = [];
	const keySet = new Set<string>();
	const rowIds: string[] = [];
	for (const c of sel) {
		for (const p of c.pii) if (p.keyId) keySet.add(p.keyId);
		tombstoned.push({ rowId: c.rowId, cell: shredCell(c) });
		rowIds.push(c.rowId);
	}
	const keyIds = [...keySet].sort();
	rowIds.sort();
	const base = {
		plan: scope.plan,
		subject: scope.subject,
		scope,
		keyIds,
		rowIds,
		whenRef,
	};
	return { decision: { ...base, id: decisionId(base) }, tombstoned };
}

/** applyErasure — the post-erasure store: the scoped selection shredded in place, order kept. */
export function applyErasure(scope: Scope, cells: Cell[]): Cell[] {
	const res = erase(scope, cells);
	const shredded = new Map(res.tombstoned.map((t) => [t.rowId, t.cell]));
	return cells.map((c) => shredded.get(c.rowId) ?? c);
}

// ── Append-only / phase-hash preservation ────────────────────────────────────────────────

/**
 * phaseDigest — the STRUCTURAL projection a phase hash is computed over: shape + non-PII
 * columns + PII tombstone MARKERS (never the value/ciphertext). INVARIANT under shredding,
 * so phaseHash(cells) === phaseHash(eraseAll(cells)). Byte-identical to the Go PhaseDigest.
 */
export function phaseHash(cells: Cell[]): string {
	const sorted = [...cells].sort((a, b) =>
		a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0,
	);
	let s = "";
	for (const c of sorted) {
		s += `${c.rowId}|${c.structure}|`;
		const paths = c.pii.map((p) => p.path).sort();
		for (const p of paths) s += `pii:${p};`;
		s += "\n";
	}
	return createHash("sha256").update(s).digest("hex");
}

/**
 * piiVisible — does ANY query still return the subject's PII, under ANY scope (cross-project,
 * cross-plan)? After applyErasure it MUST be false for the erased subject.
 */
export function piiVisible(subject: string, cells: Cell[]): boolean {
	return cells.some(
		(c) =>
			c.subject === subject &&
			c.pii.some((p) => !isShredded(p) && (p.plaintext ?? "") !== ""),
	);
}
