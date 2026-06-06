/**
 * Reproducibility mirror for the ContextCompressor twin (lib/context-compressor.ts), AIDOS step
 * HR02. fast-check (∀) — the SAME invariants the Go rapid property pins (ADR 0035):
 *   1. retrieve∘compress = identity (byte-lossless modulo whitespace) — retrieve gives back the
 *      original.
 *   2. the handle is a deterministic fixed point: compress(retrieve(handle)) reproduces the same
 *      compacted text and the same dictionary.
 *   3. determinism: same input ⇒ same compacted + same handle (a pure function, never an LLM).
 *   4. carrier facts survive retrieve∘compress on a real ContextPack (no fact lost → the agent
 *      never invents or breaches the wall).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	compress,
	deriveAction,
	gate,
	gateInvariant,
	type Handle,
	measureTokens,
	normalize,
	perRunEconomy,
	type RunPrompts,
	replayEconomy,
	retrieve,
	sameVerdict,
} from "./context-compressor";

// A small repetition-prone vocabulary so spans repeat (the shape the compressor targets).
const VOCAB = [
	"checkout",
	"promo-field",
	"applyPromo",
	"/kernel/**",
	"/mirror/**",
	"the",
	"wall",
	"red",
	"mirror",
	"goal",
	"stop",
	"condition",
	"pack_hash",
	"bounded_context",
	"allowed_paths",
	"forbidden_paths",
];
const arbPrompt = fc
	.array(fc.constantFrom(...VOCAB), { maxLength: 60 })
	.map((ws) => ws.join(" "));

const EXAMPLE_PACK = `# CONTEXT PACK — goal: checkout-apply-promo (branch: main)
You are working the red goal "checkout-apply-promo" in the bounded context "checkout".
Red mirrors (your stop condition): promo-field.fixture, applyPromo.workflow
Crossed PUBLIC contracts: checkout-api@hash, PaymentGateway@hash
allowed_paths: /src/checkout/**
forbidden_paths: /kernel/**, /mirror/**
The wall: you NEVER write /kernel/** or /mirror/**. To change a truth you open an idea,
write its mirror, open a /goal. Writing /kernel/** is refused. Writing /mirror/** is refused.
Stop condition: red_set_green AND previous_green_intact AND aggregate_complete
pack_hash: 0x9f3a-checkout-apply-promo-main`;

const CARRIER_FACTS = [
	"checkout-apply-promo",
	"promo-field.fixture",
	"applyPromo.workflow",
	"/kernel/**",
	"/mirror/**",
	"allowed_paths: /src/checkout/**",
	"checkout-api@hash",
	"red_set_green AND previous_green_intact AND aggregate_complete",
	"pack_hash: 0x9f3a-checkout-apply-promo-main",
];

function sameDict(
	a: Record<string, string>,
	b: Record<string, string>,
): boolean {
	const ak = Object.keys(a);
	if (ak.length !== Object.keys(b).length) return false;
	return ak.every((k) => a[k] === b[k]);
}

describe("ContextCompressor twin (HR02)", () => {
	it("retrieve∘compress is the identity (byte-lossless modulo whitespace)", () => {
		fc.assert(
			fc.property(arbPrompt, (prompt) => {
				const { handle } = compress(prompt);
				expect(retrieve(handle)).toBe(normalize(prompt));
			}),
		);
	});

	it("the handle is a deterministic fixed point", () => {
		fc.assert(
			fc.property(arbPrompt, (prompt) => {
				const { compacted: c1, handle: h1 } = compress(prompt);
				const { compacted: c2, handle: h2 } = compress(retrieve(h1));
				expect(c2.text).toBe(c1.text);
				expect(sameDict(h2.dictionary, h1.dictionary)).toBe(true);
			}),
		);
	});

	it("is deterministic — same input yields same compacted + handle (100×)", () => {
		const { compacted: c0, handle: h0 } = compress(EXAMPLE_PACK);
		for (let i = 0; i < 100; i++) {
			const { compacted, handle } = compress(EXAMPLE_PACK);
			expect(compacted.text).toBe(c0.text);
			expect(sameDict(handle.dictionary, h0.dictionary)).toBe(true);
		}
	});

	it("preserves every carrier fact after retrieve∘compress", () => {
		const { handle } = compress(EXAMPLE_PACK);
		const restored = retrieve(handle);
		for (const fact of CARRIER_FACTS) {
			expect(restored).toContain(fact);
		}
	});

	it("a zero handle retrieves to empty without throwing", () => {
		const zero: Handle = { text: "", dictionary: {} };
		expect(retrieve(zero)).toBe("");
	});
});

// HR03 — the gate-invariance twin (the theorem proven FROM THE SCREEN). Same invariants as
// back/runtime/headroom: the GateAction verdict is invariant to compression.
const TARGETS = ["app/main.go", "/kernel/entities.json", "/etc/passwd"];
const TOOLS = ["store/read", "evil/exfiltrate", ""];
const SKILLS = ["tdd", "forbidden-skill", ""];
const arbGatePrompt = fc
	.tuple(
		fc.constantFrom(...TARGETS),
		fc.constantFrom(...TOOLS),
		fc.constantFrom(...SKILLS),
		fc.array(fc.constantFrom(...VOCAB), { maxLength: 30 }),
	)
	.map(([target, tool, skill, filler]) => {
		let p = `# CONTEXT PACK\n${filler.join(" ")}\n## Boundaries (THE WALL)\nallowed_paths: ${target}\n`;
		if (tool !== "") p += `tool: ${tool}\n`;
		if (skill !== "") p += `skill: ${skill}\n`;
		p += `forbidden_paths: /kernel/**, /mirror/**\n${filler.join(" ")}\n`;
		return p;
	});

describe("gate-invariance twin (HR03)", () => {
	it("the gate verdict is INVARIANT to compression (the theorem)", () => {
		fc.assert(
			fc.property(arbGatePrompt, (prompt) => {
				const { original, compressed, invariant } = gateInvariant(prompt);
				expect(invariant).toBe(true);
				expect(sameVerdict(original, compressed)).toBe(true);
			}),
		);
	});

	it("the derived action is invariant under retrieve∘compress", () => {
		fc.assert(
			fc.property(arbGatePrompt, (prompt) => {
				const { handle } = compress(prompt);
				expect(deriveAction(retrieve(handle))).toEqual(deriveAction(prompt));
			}),
		);
	});

	it("the gate verdict is reproducible 100× through compression (determinism)", () => {
		const prompt = `# CONTEXT PACK\nthe wall the wall\n## Boundaries\nallowed_paths: app/main.go\ntool: store/read\nskill: tdd\nforbidden_paths: /kernel/**, /mirror/**\n`;
		const want = gateInvariant(prompt).compressed;
		for (let i = 0; i < 100; i++) {
			expect(sameVerdict(gateInvariant(prompt).compressed, want)).toBe(true);
		}
		// non-trivial: the happy-path prompt is ALLOWED.
		expect(want.allowed).toBe(true);
	});

	it("a denied action stays denied through compression (capacity axis)", () => {
		const prompt = `# CONTEXT PACK\nthe wall the wall\n## Boundaries\nallowed_paths: app/main.go\ntool: evil/exfiltrate\nforbidden_paths: /kernel/**, /mirror/**\n`;
		const { original, invariant } = gateInvariant(prompt);
		expect(invariant).toBe(true);
		expect(original.allowed).toBe(false);
		expect(original.deniedAxis).toBe("capacity");
	});

	it("the wall trips the zone axis (a /kernel/ target), invariantly", () => {
		const v = gate(deriveAction("allowed_paths: /kernel/entities.json"));
		expect(v.deniedAxis).toBe("zone");
		expect(v.blockReason).toBe("AGENT_WRITE_ABOVE_WATERLINE");
	});
});

// HR04 — the loop-economy twin (the compressor wired in front of GenerateAction). Same
// done-criterion as back/runtime/agentloop: same verdicts, tokens ↓, CheckBudget coherent, the
// cap is NEVER raised.
const REPETITIVE = (target: string) => {
	const wall = "respect the wall respect the wall respect the wall ";
	return `# CONTEXT PACK\n${wall}${wall}${wall}\n## Boundaries (THE WALL)\nallowed_paths: ${target}\nforbidden_paths: /kernel/**, /mirror/**\n${wall}${wall}${wall}\n`;
};

describe("loop-economy twin (HR04)", () => {
	it("measureTokens is pure and monotone under compression", () => {
		fc.assert(
			fc.property(arbPrompt, (prompt) => {
				const raw = measureTokens(prompt);
				expect(measureTokens(prompt)).toBe(raw); // pure
				const comp = measureTokens(compress(prompt).compacted.text);
				expect(comp).toBeLessThanOrEqual(raw); // compression only removes tokens
			}),
		);
	});

	it("replay with/without compression — same verdicts, tokens ↓, cap NEVER raised", () => {
		const prompts = [REPETITIVE("app/a.go"), REPETITIVE("app/b.go")];
		// A cap strictly between the compressed and plain costs.
		const e0 = replayEconomy(prompts, Number.MAX_SAFE_INTEGER);
		const cap = Math.floor((e0.tokensCompressed + e0.tokensPlain) / 2);
		const e = replayEconomy(prompts, cap);

		// Same verdicts (the gate is invariant), every action allowed.
		expect(e.verdictsSame).toBe(true);
		expect(e.verdicts.every((v) => v.allowed)).toBe(true);
		// Tokens measured strictly lower with compression.
		expect(e.tokensCompressed).toBeLessThan(e.tokensPlain);
		expect(e.tokensSaved).toBeGreaterThan(0);
		// CheckBudget coherent: plain breaches the cap, compressed fits under the SAME cap.
		expect(e.plainWithinCap).toBe(false);
		expect(e.compressedWithinCap).toBe(true);
		// The cap is NEVER raised.
		expect(e.capRaised).toBe(false);
		expect(e.cap).toBe(cap);
	});
});

// HR05 — the per-run economy projection the /agents « Compression / économie » section renders:
// one ReplayEconomy per recorded AgentRun (tokens before/after PER RUN), plus the aggregate. Same
// determinism + cap-never-raised guarantees as HR04, surfaced per run for the panel.
describe("per-run economy projection (HR05)", () => {
	const RUNS: RunPrompts[] = [
		{ id: "run-checkout", prompts: [REPETITIVE("app/a.go")], cap: 30 },
		{
			id: "run-promo",
			prompts: [REPETITIVE("app/b.go"), REPETITIVE("app/c.go")],
			cap: 60,
		},
	];

	it("renders tokens before/after PER run + a coherent aggregate", () => {
		const report = perRunEconomy(RUNS);
		// one economy row per run, in input order.
		expect(report.rows.map((r) => r.id)).toEqual(["run-checkout", "run-promo"]);
		for (const row of report.rows) {
			// tokens before/after measured per run; compression saves (repetitive prompts).
			expect(row.economy.tokensCompressed).toBeLessThan(
				row.economy.tokensPlain,
			);
			expect(row.economy.tokensSaved).toBeGreaterThan(0);
			// the cap is NEVER raised, per run.
			expect(row.economy.capRaised).toBe(false);
		}
		// aggregate = the summed meters across runs (the panel's total).
		const sumPlain = report.rows.reduce((s, r) => s + r.economy.tokensPlain, 0);
		const sumComp = report.rows.reduce(
			(s, r) => s + r.economy.tokensCompressed,
			0,
		);
		expect(report.totalPlain).toBe(sumPlain);
		expect(report.totalCompressed).toBe(sumComp);
		expect(report.totalSaved).toBe(sumPlain - sumComp);
		expect(report.totalSaved).toBeGreaterThan(0);
		// every run's gate verdicts are invariant to compression (no run changes behaviour).
		expect(report.allVerdictsSame).toBe(true);
	});

	it("is deterministic: same runs ⇒ same report (a pure projection, never an LLM)", () => {
		expect(perRunEconomy(RUNS)).toEqual(perRunEconomy(RUNS));
	});
});
