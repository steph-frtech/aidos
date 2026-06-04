import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type AgentRun,
	agentRunReplayCoherent,
	deriveSeed,
	runSeed,
} from "./agentrun";

// BA26 — the reproducibility mirror (fast-check) for the REPLAY-extension seed twins
// (front twin of back/runtime/agentrun's DeriveSeed / SeedFor / replay coherence). The
// Go package is the content-address authority; this twin pins the SEED-FALLBACK LOGIC, the
// additive shape, and the replay-coherence rule. Determinism-first: pure, total, no I/O.

describe("BA26 — deriveSeed (front twin of agentrun.DeriveSeed)", () => {
	it("is deterministic + total: same trio ⇒ same seed", () => {
		fc.assert(
			fc.property(fc.string(), fc.string(), fc.string(), (impl, pack, item) => {
				expect(deriveSeed(impl, pack, item)).toBe(deriveSeed(impl, pack, item));
			}),
		);
	});

	it("is non-empty for a non-empty impl", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1 }),
				fc.string(),
				fc.string(),
				(impl, pack, item) => {
					expect(deriveSeed(impl, pack, item).length).toBeGreaterThan(0);
				},
			),
		);
	});

	it("a different impl/pack/item derives a different seed (fixed examples; the FNV-1a UI twin is a 32-bit fingerprint, the Go SHA-256 is the authority)", () => {
		const base = deriveSeed("impl-7f3a", "pack-checkout", "redset:checkout");
		expect(
			deriveSeed("impl-9b21", "pack-checkout", "redset:checkout"),
		).not.toBe(base);
		expect(deriveSeed("impl-7f3a", "pack-orders", "redset:checkout")).not.toBe(
			base,
		);
		expect(deriveSeed("impl-7f3a", "pack-checkout", "redset:orders")).not.toBe(
			base,
		);
	});
});

describe("BA26 — seedFor (declared-wins, derive-as-fallback)", () => {
	it("returns the declared seed verbatim when present, else the derived one", () => {
		fc.assert(
			fc.property(
				fc.string(),
				fc.string({ minLength: 1 }),
				fc.string(),
				fc.string(),
				(declared, impl, pack, item) => {
					const got = runSeed(declared, impl, pack, item);
					if (declared.trim() !== "") {
						expect(got).toBe(declared);
					} else {
						expect(got).toBe(deriveSeed(impl, pack, item));
					}
				},
			),
		);
	});

	it("a new run always carries a non-empty seed (declared or derived)", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1 }),
				fc.string(),
				fc.string(),
				(impl, pack, item) => {
					expect(runSeed("", impl, pack, item).length).toBeGreaterThan(0);
				},
			),
		);
	});
});

describe("BA26 — replay coherence (front twin of the migration CHECK)", () => {
	const base: AgentRun = {
		id: "",
		agent: "agent@v1",
		goal: "g",
		redWorkItem: "rwi",
		contextPack: "pack",
		actions: [],
		result: "still_red",
		startedAt: "2026-06-04T18:00:00Z",
		endedAt: "2026-06-04T18:05:00Z",
	};

	it("a legacy seedless run is coherent", () => {
		expect(agentRunReplayCoherent(base)).toBe(true);
	});

	it("a transcript without impl+seed is INCOHERENT", () => {
		expect(agentRunReplayCoherent({ ...base, providerTranscript: "tr" })).toBe(
			false,
		);
		expect(
			agentRunReplayCoherent({
				...base,
				providerTranscript: "tr",
				impl: "impl-hash",
			}),
		).toBe(false);
	});

	it("a transcript WITH impl+seed is coherent", () => {
		expect(
			agentRunReplayCoherent({
				...base,
				impl: "impl-hash",
				seed: "seed-hash",
				providerTranscript: "tr",
			}),
		).toBe(true);
	});

	it("a run may carry impl+seed without a transcript (a recorded-but-not-yet-replayed run)", () => {
		expect(
			agentRunReplayCoherent({ ...base, impl: "impl-hash", seed: "seed-hash" }),
		).toBe(true);
	});
});
