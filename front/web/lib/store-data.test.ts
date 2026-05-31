import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hash, shortHash } from "./store-data";

/**
 * Reproducibility mirror (determinism-first) for the Workbench content-address
 * hashing. The /store panel computes a content address in TypeScript; the Go
 * Archive store (back/archive/contentstore/store.go, func Hash) computes it in
 * Go. They MUST be byte-identical or a UI Put would land under a different
 * address than the Go store — so the cross-impl equivalence is pinned here with
 * KNOWN VECTORS computed from the canonical SHA-256 of the UTF-8 bytes (the same
 * value `printf '%s' <s> | sha256sum` and `contentstore.Hash([]byte(s))` yield).
 *
 * These vectors were verified against the real Go algorithm:
 *   "hello" → 2cf24dba…  "v1" → 3bfc2695…  "v2" → fb04dcb6…
 *   ""      → e3b0c442…  "héllo" → 3c48591d…  (multi-byte UTF-8 proves encoding)
 */

// hash() must equal the canonical SHA-256 hex of the UTF-8 bytes — these are
// the exact digests produced by Go's contentstore.Hash([]byte(s)).
const GO_VECTORS: Record<string, string> = {
	hello: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
	v1: "3bfc269594ef649228e9a74bab00f042efc91d5acc6fbee31a382e80d42388fe",
	v2: "fb04dcb6970e4c3d1873de51fd5a50d7bb46b3383113602665c350ec40b5f990",
	"": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
	// Multi-byte UTF-8: pins that TS Buffer.from(s,"utf8") matches Go []byte(s).
	héllo: "3c48591d8d098a4538f5e013dfcf406e948eac4d3277b10bf614e295d6068179",
};

describe("store-data hash() — reproducibility mirror", () => {
	it("equals the canonical Go contentstore.Hash for known vectors", () => {
		for (const [input, want] of Object.entries(GO_VECTORS)) {
			expect(hash(input), `hash(${JSON.stringify(input)})`).toBe(want);
		}
	});

	it("is deterministic — same input yields the same digest, no hidden state", () => {
		const inputs = [
			"hello",
			"v1",
			"v2",
			"",
			"héllo",
			"a longer body\nwith newline",
		];
		for (const input of inputs) {
			expect(hash(input)).toBe(hash(input));
		}
	});

	it("matches an independent SHA-256 over the same UTF-8 bytes", () => {
		// Independent re-derivation (not the same call path as hash()) to prove
		// the algorithm/encoding, not just self-consistency.
		const inputs = ["hello", "v1", "v2", "", "héllo", '{"k":"v"}'];
		for (const input of inputs) {
			const independent = createHash("sha256")
				.update(Buffer.from(input, "utf8"))
				.digest("hex");
			expect(hash(input)).toBe(independent);
		}
	});

	it("produces 64-hex-char digests and distinct addresses for distinct inputs", () => {
		const h1 = hash("v1");
		const h2 = hash("v2");
		expect(h1).toMatch(/^[0-9a-f]{64}$/);
		expect(h2).toMatch(/^[0-9a-f]{64}$/);
		expect(h1).not.toBe(h2);
	});
});

describe("store-data shortHash() — reproducibility mirror", () => {
	it("deterministically trims to the first 12 hex chars", () => {
		const full = hash("hello");
		expect(shortHash(full)).toBe(full.slice(0, 12));
		expect(shortHash(full)).toBe("2cf24dba5fb0");
		// Pure function of its input: repeated calls agree.
		expect(shortHash(full)).toBe(shortHash(full));
	});
});
