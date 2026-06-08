/**
 * behavior-expander — the S76 front twin of back/kernel/behavior (record.go). It does NOT re-implement
 * the catalogue or the expansion (the single-function law, §24.6): it IMPORTS the ONE `expand` from
 * lib/compound and the byte-twin content address `expansionId` from lib/behavior, and adds ONLY the
 * S76 concerns CE04 doesn't expose:
 *
 *   - the behavior RECORD — ownable (owner), versioned (>= 1), taggable (free tags), localizable
 *     (per-locale labels, FR required — ADR 0011 bilingue par défaut) — with `validateRecord` + the
 *     content-addressed `recordId` ;
 *   - `propose` — run the ONE `expand` and wrap its dry-run into a DRAFT changeset (spec_delta +
 *     mirror_delta, project-scoped). It NEVER applies (status is always DRAFT, no applied_at) — the
 *     wall (CLAUDE.md §2). "L'expansion est un ChangeSet proposé, jamais une vérité appliquée."
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): validateRecord / recordId / propose are PURE — same input →
 * byte-identical output. behavior-expander.test.ts pins it (Vitest + fast-check).
 */

import { createHash } from "node:crypto";
import { type Expansion, expand } from "./behavior";
import {
	type Attachment,
	BEHAVIOR_CATALOGUE,
	type BehaviorKind,
	expand as ce04Expand,
} from "./compound";

export type Kind = BehaviorKind;
export type { Expansion } from "./behavior";
export { expand, expansionId } from "./behavior";
export type { Attachment } from "./compound";

/** catalogue — the declared behavior kinds in canonical order (one source — no fork). PURE. */
export function catalogue(): Kind[] {
	return [...BEHAVIOR_CATALOGUE];
}

function isKind(s: string): s is Kind {
	return (BEHAVIOR_CATALOGUE as string[]).includes(s);
}

/**
 * Record — a behavior-macro catalogue entry the user OWNS, VERSIONS, TAGS and LOCALISES. The
 * EXPANSION it implies is still computed by the ONE expand (a Record never carries its own expansion).
 */
export interface BehaviorRecord {
	kind: Kind;
	owner: string;
	version: number;
	tags?: string[];
	labels: Record<string, string>;
}

/** validateRecord — the four §24.6 clauses + the kind being in the catalogue. Returns a message or null. */
export function validateRecord(r: BehaviorRecord): string | null {
	if (!isKind(r.kind))
		return `behavior: kind is not in the declared catalogue (§24.6): "${r.kind}"`;
	if (!r.owner)
		return "behavior: record has no owner (a behavior is ownable, §24.6)";
	if (!Number.isInteger(r.version) || r.version < 1)
		return "behavior: record version must be >= 1 (versioned, §24.6)";
	if (!r.labels?.fr)
		return "behavior: record has no FR label (localizable, bilingue par défaut, ADR 0011)";
	return null;
}

// canonicalEncode re-encodes a JSON value with object keys sorted recursively, arrays in order, no
// whitespace (the same scheme lib/behavior uses) — so recordId is a stable content address.
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

function dedupSortTags(tags?: string[]): string[] {
	return [...new Set(tags ?? [])].sort();
}

/** recordId — content-address a record over its identity (kind+owner+version+canonical tags+labels). PURE. */
export function recordId(r: BehaviorRecord): string {
	const body = {
		kind: r.kind,
		owner: r.owner,
		version: r.version,
		tags: dedupSortTags(r.tags),
		labels: r.labels,
	};
	return createHash("sha256")
		.update(Buffer.from(canonicalEncode(body), "utf8"))
		.digest("hex");
}

/** A minimal ChangeSet shape (mirrors Go changeset.ChangeSet, the fields the screen reads). */
export interface ChangeSetView {
	label: string;
	status: "DRAFT";
	parent_phase: string;
	spec_delta: { kind: string; target: string; body: string };
	mirror_delta: { kind: string; target: string };
}

export interface Proposal {
	ok: boolean;
	error?: string;
	expansion?: Expansion;
	changeset?: ChangeSetView;
	record_id?: string;
}

/**
 * propose — validate the record, run the ONE expand, and wrap its dry-run into a `proposed` (DRAFT)
 * ChangeSet carrying the canonical expansion as a project-scoped spec_delta + a mirror_delta
 * (completeness law). It NEVER applies (status is always DRAFT, no applied_at) — the wall. A reject
 * discards this DRAFT; the kernel is never touched. Mirrors Go behavior.Propose.
 */
export function propose(
	r: BehaviorRecord,
	entity: string,
	parentPhase: string,
	existing?: Attachment["existing"],
): Proposal {
	const cause = validateRecord(r);
	if (cause) return { ok: false, error: cause };
	if (!entity)
		return { ok: false, error: "behavior: attachment has no entity name" };
	const e = expand({ behavior: r.kind, entity, existing });
	const target = `behavior-expansion@${entity}`;
	return {
		ok: true,
		record_id: recordId(r),
		expansion: e,
		changeset: {
			label: `behavior: propose ${r.kind} expansion on ${entity} (v${r.version}, ${recordId(r).slice(0, 8)})`,
			status: "DRAFT",
			parent_phase: parentPhase,
			spec_delta: { kind: "add", target, body: e.expansionId },
			mirror_delta: { kind: "add", target: `${target}#mirror` },
		},
	};
}

// re-export the raw CE04 expander for callers that want pieces without the content address.
export { ce04Expand };

/** A canonical demo record — ownable on Order, the §24.6 owner-scoping boilerplate. */
export const DEMO_RECORD: BehaviorRecord = {
	kind: "ownable",
	owner: "alice",
	version: 1,
	tags: ["scoping", "security"],
	labels: { fr: "propriété", en: "ownership" },
};
