/**
 * Behavior content-addressing — the S67 thin layer over the ONE TS behavior expander (CE04, in
 * lib/compound.ts, the twin of Go's back/kernel/behavior — KRD §24.6). S67 does NOT redeclare the
 * catalogue or re-implement the expansion (that would be a second implementation — the very thing
 * the single-function law forbids). It IMPORTS CE04's published `expand` + `BEHAVIOR_CATALOGUE`, and
 * adds ONLY the concern S67 needs that CE04 doesn't expose: the content-addressed `expansionId`,
 * byte-identical to Go's behavior.expansionID.
 *
 * THE SINGLE EXPANDER. Pieces come from CE04's `expand`. S67 never forks the catalogue; it re-derives
 * only the nil-group distinction (a Go nil slice marshals as `null`, a CE04 empty array as `[]`) so
 * the SHA-256 content address matches the Go golden — pinned by lib/behavior.test.ts.
 *
 * THE WALL (CLAUDE.md §2). Every expansion is a DRY-RUN VALUE: wroteKernel is ALWAYS false. Freezing
 * goes via the wall (idée → miroir → /goal), never from here.
 */

import { createHash } from "node:crypto";
import {
	type Attachment,
	BEHAVIOR_CATALOGUE,
	type BehaviorKind,
	type Expansion as CE04Expansion,
	expand as ce04Expand,
} from "./compound";

/** Kind / Attachment re-export CE04's published types (one source — no fork). */
export type Kind = BehaviorKind;
export type { Attachment } from "./compound";

/** Expansion is CE04's expansion PLUS the content-addressed expansionId (S67's added concern). */
export interface Expansion extends CE04Expansion {
	expansionId: string;
}

/** catalogue returns CE04's declared kinds in canonical order (one source). PURE. */
export function catalogue(): Kind[] {
	return [...BEHAVIOR_CATALOGUE];
}

export function isKind(s: string): s is Kind {
	return (BEHAVIOR_CATALOGUE as string[]).includes(s);
}

// The declared groups whose Go catalogue entry is a NIL slice (marshals as `null`, not `[]`). For
// these, an EMPTY emitted group is content-addressed as `null` to match Go byte-for-byte; ownable
// (relations + policies present) never hits this. This mirrors behavior.go's catalogueExpansion.
const NIL_GROUPS: Record<Kind, { relations: boolean; policies: boolean }> = {
	ownable: { relations: false, policies: false },
	"soft-deletable": { relations: true, policies: false },
	auditable: { relations: true, policies: true },
};

/**
 * expand is the S67 expander: it runs the ONE CE04 `expand` (the single TS catalogue/idempotence)
 * and stamps the content-addressed expansionId. PURE, DRY-RUN. Throws on an unknown behavior or an
 * entity-less attachment (the honesty rule) — mirroring Go's typed errors.
 */
export function expand(a: Attachment): Expansion {
	if (!a.entity) throw new Error("behavior: attachment has no entity name");
	if (!isKind(a.behavior)) {
		throw new Error(
			`behavior: kind is not in the declared catalogue (§24.6): "${a.behavior}"`,
		);
	}
	const base = ce04Expand(a); // the ONE expander — pieces + idempotence from CE04.
	return { ...base, expansionId: expansionId(base) };
}

// --- content address (byte-twin of behavior.expansionID over records.Canonicalize/Hash) ---

// canonicalEncode re-encodes a JSON value with object keys sorted recursively, arrays in order, no
// whitespace — and leaves `null` as `null` so a nil Go slice and a TS null match.
function canonicalEncode(v: unknown): string {
	if (v === null || v === undefined) return "null";
	if (Array.isArray(v)) return `[${v.map(canonicalEncode).join(",")}]`;
	if (typeof v === "object") {
		const obj = v as Record<string, unknown>;
		return `{${Object.keys(obj)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonicalEncode(obj[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(v);
}

/**
 * expansionId content-addresses an expansion over its semantic body (the five kinds + behavior +
 * entity), EXCLUDING pieceCount/wroteKernel/expansionId — byte-identical to Go's expansionID (a nil
 * group is emitted as `null`). Same body ⇒ same id.
 */
export function expansionId(e: CE04Expansion): string {
	const nil = NIL_GROUPS[e.behavior];
	const groupOrNull = <T>(emitted: T[], isNil: boolean): T[] | null =>
		isNil && emitted.length === 0 ? null : emitted;

	const body = {
		behavior: e.behavior,
		entity: e.entity,
		attributes: e.attributes,
		relations: groupOrNull(e.relations, nil.relations),
		operations: e.operations,
		policies: groupOrNull(e.policies, nil.policies),
		fixtures: e.fixtures,
	};
	return createHash("sha256")
		.update(Buffer.from(canonicalEncode(body), "utf8"))
		.digest("hex");
}

/** pieceCount totals the source pieces (CE04 already computes it; re-derive for the Expansion). */
export function pieceCount(e: Expansion): number {
	return (
		e.attributes.length +
		e.relations.length +
		e.operations.length +
		e.policies.length +
		e.fixtures.length
	);
}

/** sortedNames returns every emitted piece name in one stable, sorted list. PURE. */
export function sortedNames(e: Expansion): string[] {
	const out: string[] = [];
	for (const x of e.attributes) out.push(`attr:${x.name}`);
	for (const x of e.relations) out.push(`rel:${x.name}`);
	for (const x of e.operations) out.push(`op:${x.name}`);
	for (const x of e.policies) out.push(`pol:${x.name}`);
	for (const x of e.fixtures) out.push(`fix:${x.name}`);
	return out.sort();
}
