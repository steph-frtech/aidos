/**
 * connector-audit — the PURE TS twin of back/runtime/connectorenforce/connectoraudit
 * (DP22, piste DP, EPIC E), itself chaining through the GV03 Merkle math of
 * back/runtime/agentrun/ledger.go.
 *
 * DP22 closes the OWASP-AAI09 « Untraceability & Repudiation » gap for connector EFFECTS:
 * every ENFORCED connector action (the DP21 connectorenforce verdict — a read, an RW write
 * approved, an RW write refused, an egress refused, an ai→datastore attempt refused) produces
 * ONE entry of a tamper-evident Merkle ledger. Alter / delete / reorder ANY past entry changes
 * the tip root ⇒ Verify().ok=false with a TamperKind. The ledger is the SOURCE of audit:
 *
 *	« chaque action de connecteur ⇒ une entrée vérifiable ; toute altération ⇒ Verify rouge. »
 *
 * The authoritative engine is the Go package (runtime/connectorenforce/connectoraudit, which
 * reuses agentrun.ContentHash + agentrun.ChainRoot — the GV03 Merkle math, NOT a fork). This
 * twin lets the Workbench RE-RENDER the per-connector audit timeline + RE-RUN the integrity
 * Verify from the screen, entry-for-entry with the Go ledger.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): deriveConnectorBOM, auditConnectorAction, buildLedger,
 * root and verify are PURE, TOTAL functions of their inputs — no I/O, no clock, no rng, no
 * Date.now(). The chain is folded by HASH (the S02 content-address scheme), NEVER by timestamp.
 * Same enforced action ⇒ same BOM (drift-free — the BOM is DERIVED from the recorded fields,
 * never a parallel claim); same ordered actions ⇒ same tip root (reproducibility); any tamper ⇒
 * a red verify (tamper-evidence). The chain decides, never an LLM (the reproducibility mirror
 * lib/connector-audit.test.ts pins it).
 *
 * THE WALL (CLAUDE.md §2): the ledger is a BELOW-the-line audit artefact — it carries NO version
 * and NO mirror field of its own (a LedgerEntry is not a layer/truth), and writes NO
 * Kernel/mirrors/fitness truth. OTel (DP17) also traces these actions for exploitation
 * observability, but OTel writes no truth — the ledger here is the audit source, the OTel span
 * a derived projection. This twin consults NO truth-store.
 */

import {
	type ConnectorAction,
	type EnforceCode,
	enforceConnectorAction,
} from "./connector-enforce";
import type { ConnectorSource } from "./connector-source";

/**
 * GENESIS_ROOT — the empty-ledger root, the SAME genesis the GV03 chain folds FROM. A stable
 * constant (never a hash of nothing); the first entry chains from here.
 */
export const GENESIS_ROOT = "genesis";

/**
 * TamperKind names HOW a connector-action ledger failed verification — the SAME five actionable
 * kinds the GV03 chain reports (re-exported semantics, never a forked vocabulary):
 *  - none        — the ledger verifies (every row's index, entry-hash and root recompute exactly).
 *  - index       — a row's index is not its position (a reordering/insertion/deletion artefact).
 *  - entry_hash  — a row's BOM was ALTERED (its recomputed entry-hash differs).
 *  - prior_root  — a row does not chain from the prior row's root (a deletion/reordering).
 *  - root        — a row's stored root is not the recomputed chain root (a forged root).
 */
export type TamperKind =
	| "none"
	| "index"
	| "entry_hash"
	| "prior_root"
	| "root";

/**
 * Identity is the actor a connector action is attributed to in the audit trail — WHO reached the
 * connector. A load-bearing input of the audit BOM; consulted only for its subject, never an
 * inference.
 */
export interface Identity {
	/** the stable identity of the actor (user / agent / service principal). */
	subject: string;
}

/**
 * ConnectorDecisionBOM is the Bill-Of-Materials of one ENFORCED connector action: the
 * load-bearing inputs an auditor must reproduce the decision from — the connector @version (DP20
 * content-id), its declared scope (RO/RW), the trust-plane, the identity that reached it, the op,
 * the target + egress host, and the closed result (permitted | refused + the DP21 BlockReason
 * code). It is a PROJECTION of (source, identity, action, decision) — deriveConnectorBOM reads
 * only fields already on those, so the BOM can never DRIFT from the recorded action (no parallel
 * claim). The connector twin of the Go connectoraudit.ConnectorDecisionBOM (snake_case keys to
 * match the Go canonical body byte-for-byte in semantics).
 */
export interface ConnectorDecisionBOM {
	/** the connector source's name. */
	connector: string;
	/** the DP20 content-address (ConnectorSource version / contentId). */
	connector_version: string;
	/** the declared access scope (read_only | read_write). */
	scope: string;
	/** the trust-plane (internal | external | ai | cloud). */
	classification: string;
	/** WHO reached the connector (Identity.subject). */
	identity: string;
	/** the attempted op (read | write). */
	op: string;
	/** the bound concrete system (gmail | drive | …). */
	target: string;
	/** the egress host the action reached. */
	host: string;
	/** the closed verdict — true iff the effect was admitted. */
	permitted: boolean;
	/** the DP21 refusal code on a deny; "" on an admission. */
	block_reason_code: string;
}

/**
 * LedgerEntry is one Merkle-chained connector-audit row: the Decision-BOM of an enforced action,
 * the prior chain root it chains FROM, and the new root it produces. entry_hash content-addresses
 * (index ‖ bom); root content-addresses (prior_root ‖ entry_hash) — folding the ENTIRE ordered
 * prefix into one hash, so a reorder or deletion is detectable. index is the 0-based position,
 * pinned into the address. The connector twin of the Go connectoraudit.LedgerEntry.
 */
export interface LedgerEntry {
	/** 0-based position in the append-only ledger. */
	index: number;
	/** the connector Decision-BOM recorded at this position. */
	bom: ConnectorDecisionBOM;
	/** the chain root this entry chains FROM. */
	prior_root: string;
	/** content-address of (index ‖ bom). */
	entry_hash: string;
	/** content-address of (prior_root ‖ entry_hash). */
	root: string;
}

/**
 * AuditedAction bundles the inputs of one connector action to audit: the declared source, the
 * actor identity, and the attempted runtime action. The enforcement verdict is RE-COMPUTED inside
 * auditConnectorAction via enforceConnectorAction (the single source of the verdict — the audit
 * never re-implements the wall). Pure data.
 */
export interface AuditedAction {
	source: ConnectorSource;
	identity: Identity;
	action: ConnectorAction;
}

/**
 * VerifyResult is the deterministic verdict of verify — ok, or the first tamper found, with its
 * position and the expected vs stored roots. The connector twin of the Go VerifyResult (the same
 * shape the GV03 chain reports).
 */
export interface VerifyResult {
	/** true IFF the whole chain recomputes exactly. */
	ok: boolean;
	/** how it failed ("none" when ok). */
	tamper: TamperKind;
	/** the 0-based row the tamper was found at (-1 when ok). */
	atIndex: number;
	/** the recomputed root at the failure (or the tip when ok). */
	expectedRoot: string;
	/** the stored root at the failure (or the tip when ok). */
	storedRoot: string;
}

/**
 * fnv1aHex is the tiny, dependency-free, deterministic content hash this twin folds the chain
 * with — the TS analogue of the S02 records.Hash scheme (the same one lib/connector-source uses
 * for contentId). The SCHEME (a stable content-address over a canonical body), not the digest
 * bytes, mirrors the Go agentrun.ContentHash. Pure, total.
 */
function fnv1aHex(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/**
 * contentHash content-addresses an arbitrary canonical body (an ordered-key JSON string). It is
 * the twin's reuse of the single GV03 hash primitive (agentrun.ContentHash) — there is ONE hash,
 * no parallel scheme. Pure, total.
 */
function contentHash(canonical: string): string {
	return `h_${fnv1aHex(canonical)}`;
}

/**
 * chainRoot folds the prior root with an entry hash into the new chain root — the GV03 prefix
 * fold (agentrun.ChainRoot), reused verbatim in semantics (content-address of {prior_root,
 * entry_hash}). Pure, total.
 */
function chainRoot(priorRoot: string, entryHash: string): string {
	return contentHash(
		JSON.stringify({ entry_hash: entryHash, prior_root: priorRoot }),
	);
}

/**
 * bomCanonical renders a Decision-BOM into a deterministic, key-ordered JSON string — the body
 * the per-row entry-hash content-addresses. Keys are emitted in a FIXED order so the hash is
 * byte-stable (same BOM ⇒ same string ⇒ same hash). Pure, total.
 */
function bomCanonical(index: number, bom: ConnectorDecisionBOM): string {
	// {"index", "bom":{…ordered…}} — the index is pinned INTO the address (so a reorder is caught).
	const ordered = {
		block_reason_code: bom.block_reason_code,
		classification: bom.classification,
		connector: bom.connector,
		connector_version: bom.connector_version,
		host: bom.host,
		identity: bom.identity,
		op: bom.op,
		permitted: bom.permitted,
		scope: bom.scope,
		target: bom.target,
	};
	return JSON.stringify({ bom: ordered, index });
}

/**
 * entryHash content-addresses (index ‖ bom): the per-row integrity address. It reuses the single
 * contentHash primitive (no forked hash). Pure, total.
 */
function entryHash(index: number, bom: ConnectorDecisionBOM): string {
	return contentHash(bomCanonical(index, bom));
}

/**
 * deriveConnectorBOM projects the Decision-BOM of an enforced connector action. PURE, TOTAL —
 * same (source, identity, action, code) ⇒ same BOM. It reads only fields already on the inputs,
 * so the BOM is a faithful, drift-free summary of the decision (the property mirror pins it). The
 * refusal code is the DP21 EnforceCode on a deny (null on an admission); the BOM records it
 * verbatim, never re-derives it (the verdict was DP21's, already taken).
 */
export function deriveConnectorBOM(
	source: ConnectorSource,
	identity: Identity,
	action: ConnectorAction,
	permitted: boolean,
	code: EnforceCode | null,
): ConnectorDecisionBOM {
	return {
		connector: source.name,
		// the DP20 content-id @version — the screen passes the source's contentId (its version).
		connector_version: source.version ?? "",
		scope: source.scope,
		classification: source.classification,
		identity: identity.subject,
		op: action.op,
		target: source.target,
		host: action.host,
		permitted,
		block_reason_code: permitted ? "" : (code ?? ""),
	};
}

/**
 * append adds a connector Decision-BOM to the ledger as a new chained entry, returning the GROWN
 * ledger. APPEND-ONLY: it never mutates a prior entry; it appends one row chaining from the
 * current tip root (GENESIS_ROOT for an empty ledger). The fold reuses chainRoot (the GV03 prefix
 * fold) — one Merkle implementation, no parallel hash. PURE, TOTAL, DETERMINISTIC — no clock, no
 * rng, no I/O; same (ledger, bom) ⇒ same grown ledger.
 */
export function append(
	ledger: readonly LedgerEntry[],
	bom: ConnectorDecisionBOM,
): LedgerEntry[] {
	const prior =
		ledger.length > 0 ? ledger[ledger.length - 1].root : GENESIS_ROOT;
	const index = ledger.length;
	const eh = entryHash(index, bom);
	const root = chainRoot(prior, eh);
	const entry: LedgerEntry = {
		index,
		bom,
		prior_root: prior,
		entry_hash: eh,
		root,
	};
	// copy-on-grow: never alias/mutate the caller's slice (append-only, anti-overwrite §9).
	return [...ledger, entry];
}

/**
 * auditConnectorAction is the DP22 door: it enforces the connector action (DP21
 * enforceConnectorAction — the single source of the verdict), DERIVES the load-bearing
 * Decision-BOM (drift-free), and appends it to the Merkle ledger as one verifiable entry. It
 * returns the grown ledger (verify().ok on the chain). PURE, TOTAL, DETERMINISTIC — the verdict
 * and the BOM are functions of the inputs; the chain is folded by HASH (S02), never by timestamp.
 * It writes NO truth (the ledger is below-the-line audit telemetry, §2).
 */
export function auditConnectorAction(
	ledger: readonly LedgerEntry[],
	source: ConnectorSource,
	identity: Identity,
	action: ConnectorAction,
): LedgerEntry[] {
	const decision = enforceConnectorAction(source, action);
	const bom = deriveConnectorBOM(
		source,
		identity,
		action,
		decision.admitted,
		decision.code,
	);
	return append(ledger, bom);
}

/**
 * buildLedger folds a sequence of audited connector actions into a verified Merkle ledger — the
 * convenience the audit timeline calls to materialize a ledger from recorded actions. PURE,
 * TOTAL. Each action is re-enforced (the verdict is single-sourced) and chained in order.
 */
export function buildLedger(audited: readonly AuditedAction[]): LedgerEntry[] {
	let ledger: LedgerEntry[] = [];
	for (const a of audited) {
		ledger = auditConnectorAction(ledger, a.source, a.identity, a.action);
	}
	return ledger;
}

/**
 * root returns the current tip root of the ledger — the content-address of the WHOLE ordered
 * ledger. GENESIS_ROOT for an empty ledger. PURE, TOTAL.
 */
export function root(ledger: readonly LedgerEntry[]): string {
	return ledger.length > 0 ? ledger[ledger.length - 1].root : GENESIS_ROOT;
}

/**
 * verify recomputes the Merkle chain over the connector-action ledger and reports whether it is
 * INTACT — the deterministic JUDGE of tamper-evidence. For each row it re-derives the entry-hash
 * from the BOM and the chain root from the prior root, and checks the stored index, prior_root and
 * root match. ANY alteration, deletion, reordering or insertion changes a recomputed hash and
 * verify goes red (ok=false) at the first broken row, with the matching TamperKind. PURE, TOTAL —
 * no clock, no I/O; same ledger ⇒ same verdict. An intact ledger ⇒ ok=true. The verify LOGIC
 * mirrors the GV03 chain (the same five tamper kinds), entry-for-entry with the Go
 * connectoraudit.Verify.
 */
export function verify(ledger: readonly LedgerEntry[]): VerifyResult {
	let prior = GENESIS_ROOT;
	const tip = root(ledger);
	for (let i = 0; i < ledger.length; i++) {
		const e = ledger[i];
		if (e.index !== i) {
			return {
				ok: false,
				tamper: "index",
				atIndex: i,
				expectedRoot: tip,
				storedRoot: tip,
			};
		}
		const eh = entryHash(i, e.bom);
		if (eh !== e.entry_hash) {
			return {
				ok: false,
				tamper: "entry_hash",
				atIndex: i,
				expectedRoot: tip,
				storedRoot: tip,
			};
		}
		if (e.prior_root !== prior) {
			return {
				ok: false,
				tamper: "prior_root",
				atIndex: i,
				expectedRoot: tip,
				storedRoot: tip,
			};
		}
		const r = chainRoot(prior, eh);
		if (r !== e.root) {
			return {
				ok: false,
				tamper: "root",
				atIndex: i,
				expectedRoot: r,
				storedRoot: e.root,
			};
		}
		prior = e.root;
	}
	return {
		ok: true,
		tamper: "none",
		atIndex: -1,
		expectedRoot: prior,
		storedRoot: prior,
	};
}

/**
 * tamperEntryHash returns a COPY of the ledger with one past entry's BOM altered IN PLACE (the
 * identity field flipped) but its stored hashes/roots LEFT untouched — the canonical "alter a
 * past entry" demonstration. verify() over the result goes red with TamperKind "entry_hash". PURE,
 * TOTAL — no clock, no rng; same (ledger, atIndex) ⇒ same tampered ledger. Used by the screen to
 * DEMONSTRATE tamper-evidence (it never writes truth — it returns a new array).
 */
export function tamperEntryHash(
	ledger: readonly LedgerEntry[],
	atIndex: number,
): LedgerEntry[] {
	const out = ledger.map((e) => ({ ...e, bom: { ...e.bom } }));
	if (atIndex >= 0 && atIndex < out.length) {
		// flip the recorded identity but DO NOT recompute the stored entry_hash/root: the chain
		// no longer matches the BOM ⇒ verify catches it as TamperEntryHash.
		const e = out[atIndex];
		e.bom.identity = `${e.bom.identity}-altéré`;
	}
	return out;
}
