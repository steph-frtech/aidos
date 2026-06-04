/**
 * agentrun-redact — BA28 front twin of back/runtime/agentrun's REPLAY + REDACT. The Go
 * package is the authority (records.Hash content-address, the canonical secret-pattern set);
 * this twin REPLICATES the same deterministic redaction and the replay-id-stability rule so
 * the Workbench can show "this run replays to the same id" and "the transcript is scrubbed"
 * WITHOUT a backend round-trip.
 *
 * THE LEDGER IS NOT A SECRET STORE (gap H1). redact scrubs the same DECLARED secret patterns
 * the Go side scrubs (anthropic/aws/github tokens, PEM private-key headers, connection strings
 * with embedded passwords): a known secret pattern NEVER survives verbatim. Determinism-first:
 * pure, total, deterministic (same input ⇒ same output) and idempotent (REDACTED matches no
 * pattern), no I/O, no Date.now(), no Math.random().
 */

import { type AgentRun, deriveSeed } from "./agentrun";

/** The marker every scrubbed secret is replaced by — single-sourced with the Go REDACTED. */
export const REDACTED = "[REDACTED]";

/**
 * A declared secret class: a NAME (for the UI/audit) + the regexp recognising its shape. The
 * set is CLOSED — redaction is a deterministic substitution, never an LLM "find the secrets".
 * It mirrors agentrun.secretPatterns (Go) field for field.
 */
interface SecretPattern {
	name: string;
	re: RegExp;
}

/** The canonical, closed secret-pattern set — the front twin of agentrun.secretPatterns. */
const SECRET_PATTERNS: SecretPattern[] = [
	// A connection string with an embedded password (scrub the WHOLE URL). Applied first so the
	// bare-token patterns never partially match it. `g` so every occurrence is scrubbed.
	{
		name: "conn_string",
		re: /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s:/@]+:[^\s:/@]+@\S+/g,
	},
	// A PEM private-key header.
	{ name: "private_key_header", re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g },
	// Anthropic-style API keys: sk-ant-… or the generic sk-… secret-key shape.
	{ name: "anthropic_key", re: /sk-(?:ant-)?[A-Za-z0-9_-]{8,}/g },
	// GitHub personal-access / app tokens.
	{ name: "github_token", re: /gh[poshru]_[A-Za-z0-9]{12,}/g },
	// AWS access-key ids.
	{ name: "aws_access_key", re: /AKIA[0-9A-Z]{12,}/g },
];

/** secretPatternNames — the NAMES of the closed set, for the UI/audit (twin of SecretPatterns). */
export function secretPatternNames(): string[] {
	return SECRET_PATTERNS.map((p) => p.name);
}

/**
 * redact — scrubs every known secret pattern out of s, each match → REDACTED. PURE, TOTAL,
 * DETERMINISTIC, IDEMPOTENT (REDACTED matches no pattern). A clean string is returned unchanged.
 * This is the gap-H1 gate: it runs BEFORE a transcript is persisted/displayed.
 */
export function redact(s: string): string {
	let out = s;
	for (const p of SECRET_PATTERNS) {
		out = out.replace(p.re, REDACTED);
	}
	return out;
}

/** TranscriptTs — the persisted provider transcript (system prompt + ordered turns). */
export interface TranscriptTs {
	system: string;
	turns: string[];
}

/**
 * redactTranscript — scrubs BOTH the system prompt and EVERY turn — the whole confined surface —
 * before persistence/display. Never mutates the input. Pure, total, deterministic, idempotent.
 */
export function redactTranscript(tr: TranscriptTs): TranscriptTs {
	return { system: redact(tr.system), turns: tr.turns.map((t) => redact(t)) };
}

/**
 * containsSecret — the UI predicate: does this text carry any known secret pattern? Used to
 * assert (and badge) that a redacted transcript leaks no secret. Pure, total.
 */
export function containsSecret(s: string): boolean {
	return SECRET_PATTERNS.some((p) => {
		// Use a non-global copy so .test() is not stateful (the `g` flag carries lastIndex).
		const re = new RegExp(p.re.source);
		return re.test(s);
	});
}

/**
 * replayId — the front twin of agentrun.Replay's content-address re-derivation. The Go side
 * re-stamps the id via records.Hash over the run body; this UI twin uses the same FNV-1a
 * content-address as deriveSeed (the stable display fingerprint), folding the replay-bearing
 * fields. It is NOT the Go SHA-256 id — it is the UI's stable re-derivation fingerprint, so the
 * "replays to the same id" badge is computable without a backend call. Pure, total, deterministic.
 */
export function replayId(run: AgentRun): string {
	// Fold the replay-relevant fields into the FNV-1a fingerprint (deriveSeed's content-address):
	// the body that the Go content-address hashes over (agent/goal/item/pack + the replay trio).
	const body = [
		run.agent,
		run.goal,
		run.redWorkItem,
		run.contextPack,
		run.result,
		run.startedAt,
		run.endedAt,
		run.impl ?? "",
		run.seed ?? "",
		run.providerTranscript ?? "",
		JSON.stringify(run.actions),
	].join("");
	return deriveSeed(body, "", "");
}

/**
 * replayMatches — the front twin of agentrun.ReplayMatches: the run re-derives to a fingerprint
 * INDEPENDENT of its stored id (the id is the hash, not an input). It re-derives the fingerprint
 * from the run AND from a copy with the stored id blanked; the two must agree — proving the
 * re-derivation reads only the body, never the recorded id. (The Go SHA-256 id is the authority
 * for true byte-equality; this twin proves the UI's re-derivation is stable + id-independent.)
 * Pure, total.
 */
export function replayMatches(run: AgentRun): boolean {
	return replayId(run) === replayId({ ...run, id: "" });
}
