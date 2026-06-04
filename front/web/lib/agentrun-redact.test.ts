import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AgentRun } from "./agentrun";
import {
	containsSecret,
	REDACTED,
	redact,
	redactTranscript,
	replayId,
	replayMatches,
	secretPatternNames,
} from "./agentrun-redact";

// BA28 — the reproducibility mirror (fast-check) for REPLAY + REDACT (front twin of
// back/runtime/agentrun's Redact / RedactTranscript / Replay / ReplayMatches). The Go package
// is the content-address + redaction authority; this twin pins the SAME deterministic redaction
// (secrets never leak verbatim, idempotent) and the replay-id stability rule. Determinism-first:
// pure, total, no I/O, no Date.now(), no Math.random().

const KNOWN_SECRETS = [
	"sk-ant-0123456789abcdef", // an Anthropic-style API key
	"AKIAIOSFODNN7EXAMPLE", // an AWS access key id
	"ghp_0123456789abcdefABCDEF", // a GitHub PAT
	"-----BEGIN RSA PRIVATE KEY-----", // a private-key header
	"postgres://u:hunter2@host:5432/db", // a DB connection string with a password
];

describe("BA28 — redact (secrets never leak verbatim)", () => {
	it("never leaves a known secret verbatim, for any surrounding text", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...KNOWN_SECRETS),
				fc.string(),
				fc.string(),
				(secret, pre, post) => {
					const out = redact(pre + secret + post);
					expect(out.includes(secret)).toBe(false);
				},
			),
		);
	});

	it("is deterministic (same input ⇒ same output)", () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				expect(redact(s)).toBe(redact(s));
			}),
		);
	});

	it("is idempotent (REDACTED matches no pattern)", () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				const once = redact(s);
				expect(redact(once)).toBe(once);
			}),
		);
		// REDACTED itself is never re-scrubbed.
		expect(redact(REDACTED)).toBe(REDACTED);
	});

	it("preserves clean (no-secret) text unchanged", () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[a-z ]{0,40}$/), (clean) => {
				expect(redact(`the quick brown fox ${clean}`)).toBe(
					`the quick brown fox ${clean}`,
				);
			}),
		);
	});

	it("scrubs every concrete secret class", () => {
		for (const secret of KNOWN_SECRETS) {
			const out = redact(`prefix ${secret} suffix`);
			expect(out.includes(secret)).toBe(false);
			expect(out.includes(REDACTED)).toBe(true);
		}
	});

	it("exposes the closed secret-pattern name set", () => {
		expect(secretPatternNames()).toEqual([
			"conn_string",
			"private_key_header",
			"anthropic_key",
			"github_token",
			"aws_access_key",
		]);
	});
});

describe("BA28 — redactTranscript (the whole confined surface)", () => {
	it("scrubs the system prompt AND every turn", () => {
		fc.assert(
			fc.property(fc.constantFrom(...KNOWN_SECRETS), (secret) => {
				const out = redactTranscript({
					system: `system ${secret}`,
					turns: [`turn-a ${secret}`, "turn-b clean"],
				});
				expect(out.system.includes(secret)).toBe(false);
				for (const t of out.turns) expect(t.includes(secret)).toBe(false);
				expect(out.turns[1]).toBe("turn-b clean");
			}),
		);
	});

	it("a redacted transcript contains no secret (containsSecret false)", () => {
		fc.assert(
			fc.property(fc.constantFrom(...KNOWN_SECRETS), (secret) => {
				const out = redactTranscript({ system: secret, turns: [secret] });
				expect(containsSecret(out.system)).toBe(false);
				expect(out.turns.every((t) => !containsSecret(t))).toBe(true);
			}),
		);
	});
});

describe("BA28 — replayId / replayMatches (stable re-derivation)", () => {
	const base: AgentRun = {
		id: "ignored",
		agent: "couche:builder@v1",
		goal: "g-checkout",
		redWorkItem: "rwi:checkout",
		contextPack: "pack:checkout",
		actions: [{ type: "write", cible: "app/checkout.go", autorisee: true }],
		result: "green",
		startedAt: "2026-06-04T18:00:00Z",
		endedAt: "2026-06-04T18:05:00Z",
		impl: "impl-hash",
		seed: "seed-declared",
		providerTranscript: "tr-ref",
	};

	it("replayId is deterministic and ignores the stored id (the id is the hash)", () => {
		expect(replayId(base)).toBe(replayId({ ...base, id: "different-id" }));
	});

	it("replayMatches is true for a recorded run (the re-derivation is stable)", () => {
		expect(replayMatches(base)).toBe(true);
	});

	it("a run differing in a replay field re-derives to a DIFFERENT fingerprint", () => {
		expect(replayId({ ...base, impl: "impl-b" })).not.toBe(replayId(base));
		expect(replayId({ ...base, seed: "seed-b" })).not.toBe(replayId(base));
		expect(replayId({ ...base, providerTranscript: "tr-b" })).not.toBe(
			replayId(base),
		);
	});
});
