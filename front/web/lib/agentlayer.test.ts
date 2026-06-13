import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	AGENT_DETERMINISM_GAP_REASON,
	type AgentAction,
	type AgentImplementation,
	aboveWaterline,
	approve,
	arbitrate,
	arbitrateGated,
	assembleSystemPrompt,
	type Budgets,
	CODE_AGENT_IDENTITY_UNVERIFIED,
	type CoucheAgent,
	checkBudget,
	checkLlmIsolation,
	costAware,
	DEFAULT_ARCH_FITNESS_POLICY,
	deriveSeed,
	effectiveTokensCap,
	egressAllowed,
	egressDecision,
	execAllowed,
	execDecision,
	type GateActionInput,
	gateAction,
	type HarnessCostBudget,
	type HookVerdict,
	hooksSatisfied,
	type IdentityVerdict,
	type ImportGraph,
	implContentHash,
	implEgressAllowed,
	implExecAllowed,
	isKnownModel,
	isKnownProvider,
	LLM_SDK_IMPORT_OUTSIDE_PROVIDER,
	mayWrite,
	mintToken,
	mintTokenFor,
	PRECEDENCE_AXES,
	type ProviderCfg,
	pathAllowed,
	project,
	propose,
	type RunMeter,
	resolveHooks,
	resolveSkills,
	resolveTools,
	seedFor,
	skillAllowed,
	TOOL_CODEGEN,
	TOOL_DIFF,
	TOOL_FORMAT,
	TOOL_SEARCH,
	TOOL_VALIDATE,
	tally,
	toolAllowed,
	validateImpl,
	validateKnobs,
	verifyToken,
	wallForbiddenPaths,
} from "./agentlayer";
import {
	AGENTLOOP_SCENARIOS,
	type AgentloopScenario,
	agentloopWroteNoTruth,
	applyWall,
	checkGeneratedEgress,
	checkGeneratedWrite,
	type DriveInputTs,
	drive,
	driveAgentloop,
	fakeGenerateAction,
	grantWouldDeny,
	hardStop,
	isClosed,
	POSTGRES_AGENT_ROLE,
	postCheck,
	type ScriptedTurnTs,
	type SensorStateTs,
} from "./agentrun";

// Reproducibility mirror for the pure agent-layer twin (S52). It mirrors the Go
// property test verdict-for-verdict: mayWrite denies above the waterline for any role;
// propose never admits; approve never admits the proposing agent itself.

const bddWriter: CoucheAgent = {
	kind: "agent",
	spec: {
		id: "bdd-writer",
		nom: "bdd-writer",
		role: "bdd-writer",
		objectif: "propose red scenarios",
		modele: "claude-opus-4-8",
		provider: "anthropic",
		peutProposerVerite: true,
		peutModifierNoyau: false,
		peutModifierMiroir: true,
		peutModifierFitness: false,
		zonesLecture: ["kernel", "ideas"],
		zonesEcriture: ["ideas"],
		stopConditions: ["red set still red"],
		temperature: 0.2,
		maxTurns: 40,
		seed: "",
		allowedNetworkHosts: [],
		allowedExec: [],
		resourceLimits: {
			maxMemoryMb: 2048,
			maxCpuMillis: 4000,
			maxWallSeconds: 600,
		},
		maxConcurrency: 1,
	},
	skills: [],
	mcp: [],
	hooks: [],
	approvers: ["product_owner"],
	domain: "checkout",
	scopeRegion: "EU",
};

describe("mayWrite (the wall)", () => {
	it("denies any write above the waterline with AGENT_WRITE_ABOVE_WATERLINE", () => {
		for (const tgt of [
			"kernel",
			"kernel.truth",
			"mirrors.mirror",
			"fitness.grammar",
			"back/kernel/x.go",
			"back/migrations/y.sql",
		]) {
			const d = mayWrite(bddWriter.spec, tgt);
			expect(d.allowed).toBe(false);
			expect(d.blockReason?.code).toBe("AGENT_WRITE_ABOVE_WATERLINE");
		}
	});

	it("allows below-the-line writes", () => {
		for (const tgt of [
			"runtime.agent_run",
			"ideas",
			"brain",
			"front/web/app/x",
		]) {
			expect(mayWrite(bddWriter.spec, tgt).allowed).toBe(true);
		}
	});

	it("is deterministic (same input → same verdict)", () => {
		expect(mayWrite(bddWriter.spec, "kernel.truth")).toEqual(
			mayWrite(bddWriter.spec, "kernel.truth"),
		);
	});
});

describe("aboveWaterline predicate", () => {
	it("matches schemas and on-disk truth paths", () => {
		expect(aboveWaterline("kernel")).toBe(true);
		expect(aboveWaterline("mirrors.x")).toBe(true);
		expect(aboveWaterline("runtime.agent_run")).toBe(false);
		expect(aboveWaterline("ideas")).toBe(false);
	});
});

describe("propose (it proposes, it never declares)", () => {
	it("always yields proposed (never admitted) + a human authority", () => {
		const p = propose(bddWriter, "checkout charges tax on EU orders");
		expect(p.status).toBe("proposed");
		expect(p.requiresAuthority).toEqual(["product_owner"]);
		expect(p.route).toEqual(["idea", "mirror", "goal", "approbation"]);
	});
});

describe("approve (an agent is never an authority)", () => {
	const p = propose(bddWriter, "scenario");
	it("blocks a self-approve attempt; the proposal stays proposed", () => {
		const d = approve(bddWriter, p, "bdd-writer");
		expect(d.status).toBe("proposed");
		expect(d.blockReason?.code).toBe("AGENT_WRITE_ABOVE_WATERLINE");
	});
	it("admits only a HUMAN approver in the graph", () => {
		expect(approve(bddWriter, p, "product_owner").status).toBe("admitted");
	});
});

describe("applyWall (runtime action stamping)", () => {
	it("refuses an above-waterline write, allows below + non-write", () => {
		expect(
			applyWall({ type: "write", cible: "kernel.truth" }, bddWriter.spec)
				.autorisee,
		).toBe(false);
		expect(
			applyWall({ type: "write", cible: "ideas" }, bddWriter.spec).autorisee,
		).toBe(true);
		expect(
			applyWall({ type: "read", cible: "kernel.truth" }, bddWriter.spec)
				.autorisee,
		).toBe(true);
	});
});

// ── BA01 — GOVERNED BEHAVIOUR KNOBS (reproducibility mirror) ─────────────────────
describe("knobs — empty allow-lists are max confinement (fail-closed)", () => {
	it("denies all egress when allowedNetworkHosts is empty", () => {
		expect(egressAllowed(bddWriter.spec, "api.anthropic.com")).toBe(false);
		expect(egressAllowed(bddWriter.spec, "evil.example.com")).toBe(false);
	});
	it("denies all subprocess when allowedExec is empty", () => {
		expect(execAllowed(bddWriter.spec, "go")).toBe(false);
		expect(execAllowed(bddWriter.spec, "rm")).toBe(false);
	});
	it("allows exactly the declared host/exec, nothing else", () => {
		const spec = {
			...bddWriter.spec,
			allowedNetworkHosts: ["api.anthropic.com"],
			allowedExec: ["go"],
		};
		expect(egressAllowed(spec, "api.anthropic.com")).toBe(true);
		expect(egressAllowed(spec, "data.exfil.io")).toBe(false);
		expect(execAllowed(spec, "go")).toBe(true);
		expect(execAllowed(spec, "curl")).toBe(false);
	});
});

describe("deriveSeed — deterministic, never an RNG", () => {
	it("same triple ⇒ same seed", () => {
		expect(deriveSeed("impl", "pack", "item")).toBe(
			deriveSeed("impl", "pack", "item"),
		);
	});
	it("depends on each of (impl, pack, item)", () => {
		const base = deriveSeed("impl", "pack", "item");
		expect(deriveSeed("impl2", "pack", "item")).not.toBe(base);
		expect(deriveSeed("impl", "pack2", "item")).not.toBe(base);
		expect(deriveSeed("impl", "pack", "item2")).not.toBe(base);
	});
	it("seedFor prefers the pinned seed, else derives", () => {
		expect(seedFor({ ...bddWriter.spec, seed: "pinned" }, "i", "p", "x")).toBe(
			"pinned",
		);
		expect(seedFor(bddWriter.spec, "i", "p", "x")).toBe(
			deriveSeed("i", "p", "x"),
		);
	});
});

describe("validateKnobs — fail-closed range guard", () => {
	it("accepts in-range knobs", () => {
		expect(validateKnobs(bddWriter.spec)).toBeNull();
	});
	it("rejects out-of-range knobs", () => {
		expect(
			validateKnobs({ ...bddWriter.spec, temperature: -0.1 }),
		).not.toBeNull();
		expect(
			validateKnobs({ ...bddWriter.spec, temperature: 2.5 }),
		).not.toBeNull();
		expect(validateKnobs({ ...bddWriter.spec, maxTurns: -1 })).not.toBeNull();
		expect(
			validateKnobs({ ...bddWriter.spec, maxConcurrency: -1 }),
		).not.toBeNull();
	});
});

// ── BA02 — AgentImplementation projection twin ──────────────────────────────────
const goldenImpl: AgentImplementation = {
	layerRef: "bdd-writer@abc123",
	role: "bdd-writer",
	objectif: "propose red scenarios",
	stopConditions: ["red set still red"],
	provider: "anthropic",
	model: "claude-opus-4-8",
	temperature: 0,
	maxTurns: 120,
	seed: "",
	tools: [{ server: "store", tool: "read" }],
	skills: ["tdd"],
	hooks: [{ phase: "PreToolUse", hook: "pretooluse", mandatory: true }],
	allowedPaths: ["front/web", "back/gen"],
	forbiddenPaths: wallForbiddenPaths(),
	allowedNetworkHosts: [],
	allowedExec: [],
	resourceLimits: {
		maxMemoryMb: 2048,
		maxCpuMillis: 2000,
		maxWallSeconds: 900,
	},
	maxConcurrency: 1,
};

describe("validateImpl — the projection shape + wall guard (fail-closed)", () => {
	it("accepts a well-formed projection", () => {
		expect(validateImpl(goldenImpl)).toBeNull();
	});
	it("rejects an empty layerRef (a projection points back to its SOURCE)", () => {
		expect(validateImpl({ ...goldenImpl, layerRef: "" })).not.toBeNull();
	});
	it("rejects an out-of-range temperature", () => {
		expect(validateImpl({ ...goldenImpl, temperature: 2.5 })).not.toBeNull();
	});
	it("rejects an allowed path above the waterline (the wall)", () => {
		expect(
			validateImpl({ ...goldenImpl, allowedPaths: ["back/kernel/x"] }),
		).not.toBeNull();
	});
	it("rejects a projection missing a wall zone in forbiddenPaths", () => {
		expect(
			validateImpl({ ...goldenImpl, forbiddenPaths: ["kernel"] }),
		).not.toBeNull();
	});
	it("is deterministic — same input, same verdict", () => {
		expect(validateImpl(goldenImpl)).toBe(validateImpl(goldenImpl));
	});
});

describe("AgentImplementation is NOT a layer (carries no truth)", () => {
	it("has no version field and no mirror field", () => {
		expect(Object.keys(goldenImpl)).not.toContain("version");
		expect(Object.keys(goldenImpl)).not.toContain("mirror");
	});
});

describe("projection confinement — empty allow-lists deny all (fail-closed)", () => {
	it("denies all egress / exec by default", () => {
		expect(implEgressAllowed(goldenImpl, "api.anthropic.com")).toBe(false);
		expect(implExecAllowed(goldenImpl, "git")).toBe(false);
	});
	it("allows only declared hosts / commands", () => {
		const open = {
			...goldenImpl,
			allowedNetworkHosts: ["api.anthropic.com"],
			allowedExec: ["git"],
		};
		expect(implEgressAllowed(open, "api.anthropic.com")).toBe(true);
		expect(implEgressAllowed(open, "evil.example.com")).toBe(false);
		expect(implExecAllowed(open, "git")).toBe(true);
		expect(implExecAllowed(open, "rm")).toBe(false);
	});
});

// ── BA03 — the DETERMINISTIC EMITTER project() (the reproducibility mirror) ───────
// Mirrors back/runtime/agentimpl/project.go verdict-for-verdict.

const validCfg: ProviderCfg = {
	provider: "anthropic",
	model: "claude-opus-4-8",
	endpoint: "https://api.example.test/v1",
	apiKey: "sk-resolved-secret",
};

describe("project — the deterministic emitter (BA03)", () => {
	it("projects a valid layer to a wall-holding AgentImplementation", () => {
		const r = project(bddWriter, validCfg, "pack-1");
		expect(r.error).toBeUndefined();
		expect(r.impl).toBeDefined();
		expect(validateImpl(r.impl as AgentImplementation)).toBeNull();
	});

	it("is byte-stable — same (layer, cfg, pack) ⇒ identical content-hash", () => {
		const a = project(bddWriter, validCfg, "pack-1")
			.impl as AgentImplementation;
		const b = project(bddWriter, validCfg, "pack-1")
			.impl as AgentImplementation;
		expect(implContentHash(a)).toBe(implContentHash(b));
	});

	it("cfg carries NO behaviour knob — endpoint/key never change the projection", () => {
		const base = project(bddWriter, validCfg, "pack-1")
			.impl as AgentImplementation;
		const perturbed = project(
			bddWriter,
			{ ...validCfg, endpoint: "https://OTHER/v2", apiKey: "sk-different" },
			"pack-1",
		).impl as AgentImplementation;
		expect(implContentHash(base)).toBe(implContentHash(perturbed));
	});

	it("the behaviour knobs come UNIQUELY from the layer", () => {
		const impl = project(bddWriter, validCfg, "pack-1")
			.impl as AgentImplementation;
		expect(impl.temperature).toBe(bddWriter.spec.temperature);
		expect(impl.maxTurns).toBe(bddWriter.spec.maxTurns);
		expect(impl.seed).toBe(bddWriter.spec.seed);
		expect(impl.model).toBe(bddWriter.spec.modele);
		expect(impl.provider).toBe(bddWriter.spec.provider);
	});

	it("the projection never carries the resolved secret (endpoint/key absent)", () => {
		const impl = project(bddWriter, validCfg, "pack-1")
			.impl as AgentImplementation;
		expect(JSON.stringify(impl)).not.toContain("sk-resolved-secret");
		expect(JSON.stringify(impl)).not.toContain("api.example.test");
	});

	it("refuses an invalid layer (peut_modifier_noyau true — the wall)", () => {
		const bad = {
			...bddWriter,
			spec: { ...bddWriter.spec, peutModifierNoyau: true as unknown as false },
		};
		expect(project(bad, validCfg, "p").error).toBeDefined();
	});

	it("refuses cfg.model != Spec.modele", () => {
		expect(
			project(bddWriter, { ...validCfg, model: "claude-opus-4-8-MUTATED" }, "p")
				.error,
		).toBeDefined();
	});

	it("refuses an unknown provider", () => {
		const bad = {
			...bddWriter,
			spec: {
				...bddWriter.spec,
				provider: "megacorp" as unknown as "anthropic",
			},
		};
		expect(
			project(
				bad,
				{ ...validCfg, provider: "megacorp" as unknown as "anthropic" },
				"p",
			).error,
		).toBeDefined();
	});

	it("refuses an unknown model (closed per-provider set)", () => {
		const bad = {
			...bddWriter,
			spec: { ...bddWriter.spec, modele: "claude-opus-RETIRED" },
		};
		expect(
			project(bad, { ...validCfg, model: "claude-opus-RETIRED" }, "p").error,
		).toBeDefined();
	});
});

// ── BA18 — AGENT IDENTITY/AUTH toward MCP servers (the reproducibility mirror) ────
describe("capability token — owner_agent is proven, not chain-declared (BA18)", () => {
	const implFor = (layerRef: string): AgentImplementation => ({
		...goldenImpl,
		layerRef,
	});

	it("REPRODUCIBILITY — same identity ⇒ same token (no clock/rng/I/O)", () => {
		fc.assert(
			fc.property(fc.string(), (ref) => {
				expect(mintToken(implFor(ref))).toBe(mintToken(implFor(ref)));
			}),
		);
	});

	it("ACCEPTS a call whose token binds the process to EXACTLY that CoucheAgent@version", () => {
		const impl = implFor("agent:builder@v1");
		const v: IdentityVerdict = verifyToken(mintToken(impl), impl.layerRef);
		expect(v.verified).toBe(true);
		expect(v.reason).toBeUndefined();
	});

	it("REFUSES a token minted for ANOTHER identity (no forgeable owner_agent)", () => {
		fc.assert(
			fc.property(fc.string(), fc.string(), (mine, other) => {
				fc.pre(mine !== other);
				const stolen = mintToken(implFor(other));
				const v = verifyToken(stolen, mine);
				expect(v.verified).toBe(false);
				expect(v.reason?.code).toBe(CODE_AGENT_IDENTITY_UNVERIFIED);
				expect((v.reason?.howToFix ?? []).length).toBeGreaterThan(0);
			}),
		);
	});

	it("REFUSES an empty token fail-closed", () => {
		const v = verifyToken("", "agent:builder@v1");
		expect(v.verified).toBe(false);
		expect(v.reason?.code).toBe(CODE_AGENT_IDENTITY_UNVERIFIED);
	});

	it("REFUSES a malformed (non-content-hash) token", () => {
		const v = verifyToken("not-a-real-hash", "agent:builder@v1");
		expect(v.verified).toBe(false);
		expect(v.reason?.code).toBe(CODE_AGENT_IDENTITY_UNVERIFIED);
	});

	it("the loop presents what the server expects — round-trip verifies", () => {
		fc.assert(
			fc.property(fc.string(), (ref) => {
				expect(mintToken(implFor(ref))).toBe(mintTokenFor(ref));
			}),
		);
	});

	it("binds @version — a different version mints a different token", () => {
		expect(mintToken(implFor("agent:builder@v1"))).not.toBe(
			mintToken(implFor("agent:builder@v2")),
		);
	});
});

// ── BA04 — the DETERMINISTIC SystemPrompt assembly (the reproducibility mirror) ───
describe("assembleSystemPrompt — pure template over declared fields (BA04)", () => {
	const implOf = (): AgentImplementation =>
		project(bddWriter, validCfg, "pack-1").impl as AgentImplementation;

	it("is deterministic — same projection → same prompt", () => {
		const impl = implOf();
		expect(assembleSystemPrompt(impl)).toBe(assembleSystemPrompt(impl));
	});

	it("carries the wall verbatim (defence in depth, level 3)", () => {
		const p = assembleSystemPrompt(implOf());
		for (const w of wallForbiddenPaths()) expect(p).toContain(w);
		expect(p).toContain("kernel");
		expect(p).toContain("mirrors");
	});

	it("renders the declared role/objectif/stopConditions/allowedPaths verbatim", () => {
		const impl = implOf();
		const p = assembleSystemPrompt(impl);
		expect(p).toContain(impl.role);
		expect(p).toContain(impl.objectif);
		for (const s of impl.stopConditions) expect(p).toContain(s);
		for (const a of impl.allowedPaths) expect(p).toContain(a);
		for (const f of impl.forbiddenPaths) expect(p).toContain(f);
	});

	it("changing a declared field changes the prompt", () => {
		const impl = implOf();
		const base = assembleSystemPrompt(impl);
		expect(assembleSystemPrompt({ ...impl, role: `${impl.role}-X` })).not.toBe(
			base,
		);
		expect(
			assembleSystemPrompt({ ...impl, objectif: `${impl.objectif} EXTRA` }),
		).not.toBe(base);
		expect(
			assembleSystemPrompt({
				...impl,
				allowedPaths: [...impl.allowedPaths, "NEW/zone"],
			}),
		).not.toBe(base);
		expect(
			assembleSystemPrompt({
				...impl,
				stopConditions: [...impl.stopConditions, "a-new-stop"],
			}),
		).not.toBe(base);
	});

	it("no out-of-layer field leaks — perturbing knobs/bindings leaves the prompt unchanged", () => {
		const impl = implOf();
		const base = assembleSystemPrompt(impl);
		const perturbed: AgentImplementation = {
			...impl,
			seed: "a-different-seed",
			maxConcurrency: impl.maxConcurrency + 7,
			maxTurns: impl.maxTurns + 13,
			temperature: 1.7,
			model: "claude-haiku-4-5",
			layerRef: "agentlayer:OTHER",
			tools: [{ server: "leak", tool: "leak" }],
			skills: ["leaked-skill"],
			hooks: [{ phase: "Stop", hook: "leak", mandatory: true }],
			allowedNetworkHosts: ["leak.example.com"],
			allowedExec: ["leak-cmd"],
			resourceLimits: { ...impl.resourceLimits, maxMemoryMb: 99999 },
		};
		expect(assembleSystemPrompt(perturbed)).toBe(base);
	});

	it("is total — empty stopConditions/allowedPaths render a stable marker", () => {
		const impl: AgentImplementation = {
			...implOf(),
			stopConditions: [],
			allowedPaths: [],
		};
		const p = assembleSystemPrompt(impl);
		expect(p).toContain("- (aucun)");
		// still byte-stable
		expect(p).toBe(assembleSystemPrompt(impl));
	});
});

describe("closed provider/model sets (BA03)", () => {
	it("isKnownProvider is closed", () => {
		expect(isKnownProvider("anthropic")).toBe(true);
		expect(isKnownProvider("megacorp")).toBe(false);
	});
	it("isKnownModel is closed per provider, fail-closed", () => {
		expect(isKnownModel("anthropic", "claude-opus-4-8")).toBe(true);
		expect(isKnownModel("anthropic", "gpt-5")).toBe(false);
		expect(isKnownModel("openai", "gpt-5")).toBe(true);
	});
});

// ── BA05 — binding resolution: governance NARROWS, never WIDENS ───────────────────
describe("binding resolution (BA05) — the capability surface is a provable subset", () => {
	it("resolveTools ⊆ enabled bindings: a disabled binding never appears", () => {
		const tools = resolveTools([
			{ server: "store", tool: "read", enabled: true },
			{ server: "store", tool: "write", enabled: false }, // disabled — must not surface
			{ server: "memory", tool: "query", enabled: true },
		]);
		expect(tools).toEqual([
			{ server: "memory", tool: "query" },
			{ server: "store", tool: "read" },
		]);
		// no disabled binding leaked
		expect(tools).not.toContainEqual({ server: "store", tool: "write" });
	});

	it("resolveTools is deterministic + order-independent (reproducibility mirror)", () => {
		const a = [
			{ server: "memory", tool: "query", enabled: true },
			{ server: "store", tool: "read", enabled: true },
			{ server: "context", tool: "list", enabled: false },
		];
		const out = resolveTools(a);
		expect(resolveTools(a)).toEqual(out); // same input ⇒ same output
		expect(resolveTools([...a].reverse())).toEqual(out); // order-independent
	});

	it("resolveSkills ⊆ enabled skills", () => {
		const skills = resolveSkills([
			{ skillName: "tdd", enabled: true },
			{ skillName: "grill", enabled: false },
			{ skillName: "context", enabled: true },
		]);
		expect(skills).toEqual(["context", "tdd"]);
		expect(skills).not.toContain("grill");
	});

	it("resolveHooks preserves Mandatory — a mandatory hook always survives", () => {
		const hooks = resolveHooks([
			{ phase: "Stop", hook: "completeness", mandatory: false },
			{ phase: "PreToolUse", hook: "wall", mandatory: true },
		]);
		// the mandatory wall hook survives, with its flag intact
		expect(hooks).toContainEqual({
			phase: "PreToolUse",
			hook: "wall",
			mandatory: true,
		});
		// deterministic + order-independent
		expect(resolveHooks([...hooks].reverse())).toEqual(hooks);
	});

	it("project() resolves the same surface as the standalone resolvers (one resolution)", () => {
		const layer: CoucheAgent = {
			kind: "agent",
			spec: {
				id: "id-ba05",
				nom: "ba05",
				role: "executor",
				objectif: "code",
				modele: "claude-opus-4-8",
				provider: "anthropic",
				peutProposerVerite: true,
				peutModifierNoyau: false,
				peutModifierMiroir: false,
				peutModifierFitness: false,
				zonesLecture: [],
				zonesEcriture: ["front/web"],
				stopConditions: ["red set still red"],
				temperature: 0,
				maxTurns: 10,
				seed: "",
				allowedNetworkHosts: [],
				allowedExec: [],
				resourceLimits: { maxMemoryMb: 0, maxCpuMillis: 0, maxWallSeconds: 0 },
				maxConcurrency: 1,
			},
			skills: [
				{ skillName: "tdd", enabled: true },
				{ skillName: "grill", enabled: false },
			],
			mcp: [
				{ server: "store", tool: "read", enabled: true },
				{ server: "store", tool: "write", enabled: false },
			],
			hooks: [{ phase: "PreToolUse", hook: "wall", mandatory: true }],
			approvers: ["human"],
			domain: "d",
			scopeRegion: "r",
		};
		const r = project(
			layer,
			{ provider: "anthropic", model: "claude-opus-4-8" },
			"pack",
		);
		expect(r.impl).toBeDefined();
		const impl = r.impl as AgentImplementation;
		expect(impl.tools).toEqual(resolveTools(layer.mcp));
		expect(impl.skills).toEqual(resolveSkills(layer.skills));
		expect(impl.hooks).toEqual(resolveHooks(layer.hooks));
		// the surface narrowed: only the enabled tool/skill survived
		expect(impl.tools).toEqual([{ server: "store", tool: "read" }]);
		expect(impl.skills).toEqual(["tdd"]);
		expect(impl.hooks).toContainEqual({
			phase: "PreToolUse",
			hook: "wall",
			mandatory: true,
		});
	});

	// ── BA14 — checkLlmIsolation: the arch-fitness invariant "one single LLM function" ──────
	describe("checkLlmIsolation (the one-LLM-function arch invariant, BA14)", () => {
		const policy = DEFAULT_ARCH_FITNESS_POLICY;

		const cleanGraph: ImportGraph = {
			packages: [
				{
					importPath:
						"github.com/steph-frtech/aidos/back/runtime/agentloop/provider",
					imports: ["context", "github.com/anthropics/anthropic-sdk-go"],
				},
				{
					importPath: "github.com/steph-frtech/aidos/back/runtime/agentimpl",
					imports: ["github.com/steph-frtech/aidos/back/runtime/blockreason"],
				},
			],
		};

		it("a clean graph has NO violation (only provider imports the SDK)", () => {
			expect(checkLlmIsolation(cleanGraph, policy)).toEqual([]);
		});

		it("FAULT INJECTION: a second LLM-SDK import flips the rule red", () => {
			const g: ImportGraph = {
				packages: [
					cleanGraph.packages[0],
					{
						importPath: "github.com/steph-frtech/aidos/back/runtime/agentimpl",
						imports: ["github.com/openai/openai-go"],
					},
				],
			};
			const v = checkLlmIsolation(g, policy);
			expect(v).toHaveLength(1);
			expect(v[0].package).toBe(
				"github.com/steph-frtech/aidos/back/runtime/agentimpl",
			);
			expect(v[0].import).toBe("github.com/openai/openai-go");
			expect(v[0].blockReason.code).toBe(LLM_SDK_IMPORT_OUTSIDE_PROVIDER);
			expect(v[0].blockReason.howToFix.length).toBeGreaterThan(0);
		});

		it("the provider package (and sub-packages) may import the SDK", () => {
			const g: ImportGraph = {
				packages: [
					{
						importPath:
							"github.com/steph-frtech/aidos/back/runtime/agentloop/provider/internal",
						imports: ["google.golang.org/genai"],
					},
				],
			};
			expect(checkLlmIsolation(g, policy)).toEqual([]);
		});

		it("is reproducible — same (graph, policy) ⇒ same violations (fast-check)", () => {
			const pkgs = [
				"mod/a",
				"mod/b",
				"github.com/steph-frtech/aidos/back/runtime/agentloop/provider",
			];
			const imps = [
				"context",
				"github.com/openai/openai-go",
				"google.golang.org/genai",
				"mod/x",
			];
			fc.assert(
				fc.property(
					fc.array(
						fc.record({
							importPath: fc.constantFrom(...pkgs),
							imports: fc.array(fc.constantFrom(...imps), { maxLength: 4 }),
						}),
						{ maxLength: 5 },
					),
					(packages) => {
						const g: ImportGraph = { packages };
						const a = checkLlmIsolation(g, policy);
						const b = checkLlmIsolation(g, policy);
						expect(a).toEqual(b);
						// soundness: every reported import is an SDK import from a non-provider pkg.
						for (const viol of a) {
							expect(
								policy.llmSdkPrefixes.some(
									(p) => viol.import === p || viol.import.startsWith(`${p}/`),
								),
							).toBe(true);
							expect(
								viol.package.startsWith(
									"github.com/steph-frtech/aidos/back/runtime/agentloop/provider",
								),
							).toBe(false);
						}
					},
				),
			);
		});
	});
});

// ── BA07 — the CAPACITY-axis enforcer toolAllowed (the reproducibility mirror) ────
// Mirrors back/runtime/agentimpl/enforce.go verdict-for-verdict: allowed IFF
// (server, tool) ∈ impl.tools; default-deny on the unknown with AGENT_TOOL_NOT_BOUND.
describe("toolAllowed — the capability axis (BA07)", () => {
	it("allows a bound (server, tool) with no BlockReason", () => {
		const d = toolAllowed(goldenImpl, "store", "read");
		expect(d.allowed).toBe(true);
		expect(d.blockReason).toBeUndefined();
	});

	it("denies an unbound tool with AGENT_TOOL_NOT_BOUND + a non-empty how_to_fix", () => {
		const d = toolAllowed(goldenImpl, "changeset", "approve");
		expect(d.allowed).toBe(false);
		expect(d.blockReason?.code).toBe("AGENT_TOOL_NOT_BOUND");
		expect((d.blockReason?.howToFix.length ?? 0) >= 1).toBe(true);
	});

	it("denies the right server but wrong tool (the pair must match)", () => {
		expect(toolAllowed(goldenImpl, "store", "write").allowed).toBe(false);
	});

	it("default-denies every tool when no bindings are resolved", () => {
		const empty: AgentImplementation = { ...goldenImpl, tools: [] };
		const d = toolAllowed(empty, "store", "read");
		expect(d.allowed).toBe(false);
		expect(d.blockReason?.code).toBe("AGENT_TOOL_NOT_BOUND");
	});

	it("is deterministic — same input ⇒ same verdict", () => {
		const a = toolAllowed(goldenImpl, "changeset", "approve");
		const b = toolAllowed(goldenImpl, "changeset", "approve");
		expect(a.allowed).toBe(b.allowed);
		expect(a.blockReason?.code).toBe(b.blockReason?.code);
	});
});

// ── BA08 — the SKILL-axis enforcer skillAllowed (the reproducibility mirror) ──────
// Mirrors back/runtime/agentimpl/enforce.go verdict-for-verdict: allowed IFF
// skill ∈ impl.skills; default-deny on the unknown with AGENT_SKILL_NOT_BOUND.
describe("skillAllowed — the skill axis (BA08)", () => {
	it("allows a bound skill with no BlockReason", () => {
		// goldenImpl carries skills: ["tdd"].
		const d = skillAllowed(goldenImpl, "tdd");
		expect(d.allowed).toBe(true);
		expect(d.blockReason).toBeUndefined();
	});

	it("denies an unbound skill with AGENT_SKILL_NOT_BOUND + a non-empty how_to_fix", () => {
		const d = skillAllowed(goldenImpl, "evolve");
		expect(d.allowed).toBe(false);
		expect(d.blockReason?.code).toBe("AGENT_SKILL_NOT_BOUND");
		expect((d.blockReason?.howToFix.length ?? 0) >= 1).toBe(true);
	});

	it("default-denies every skill when no skills are resolved", () => {
		const empty: AgentImplementation = { ...goldenImpl, skills: [] };
		const d = skillAllowed(empty, "tdd");
		expect(d.allowed).toBe(false);
		expect(d.blockReason?.code).toBe("AGENT_SKILL_NOT_BOUND");
	});

	it("matches the skill name exactly (a near-miss is denied)", () => {
		expect(skillAllowed(goldenImpl, "tdd ").allowed).toBe(false);
	});

	it("is deterministic — same input ⇒ same verdict", () => {
		const a = skillAllowed(goldenImpl, "evolve");
		const b = skillAllowed(goldenImpl, "evolve");
		expect(a.allowed).toBe(b.allowed);
		expect(a.blockReason?.code).toBe(b.blockReason?.code);
	});
});

describe("pathAllowed / egressDecision / execDecision — the confinement axis (BA09)", () => {
	it("allows a path under AllowedPaths and outside ForbiddenPaths, no BlockReason", () => {
		// goldenImpl carries allowedPaths: ["front/web", "back/gen"].
		const d = pathAllowed(goldenImpl, "front/web/app/page.tsx");
		expect(d.allowed).toBe(true);
		expect(d.blockReason).toBeUndefined();
	});

	it("denies a path outside AllowedPaths with AGENT_PATH_NOT_ALLOWED + a non-empty how_to_fix", () => {
		const d = pathAllowed(goldenImpl, "back/runtime/secret.go");
		expect(d.allowed).toBe(false);
		expect(d.blockReason?.code).toBe("AGENT_PATH_NOT_ALLOWED");
		expect((d.blockReason?.howToFix.length ?? 0) >= 1).toBe(true);
	});

	it("default-denies every path when no AllowedPaths are declared (max confinement)", () => {
		const empty: AgentImplementation = { ...goldenImpl, allowedPaths: [] };
		const d = pathAllowed(empty, "front/web/app/page.tsx");
		expect(d.allowed).toBe(false);
		expect(d.blockReason?.code).toBe("AGENT_PATH_NOT_ALLOWED");
	});

	it("is DISTINCT from the zone deny-list — a path under a ForbiddenPaths prefix is denied even when allowed", () => {
		const impl: AgentImplementation = {
			...goldenImpl,
			allowedPaths: ["front/web"],
			forbiddenPaths: [...wallForbiddenPaths(), "front/web/messages/"],
		};
		// Confinement denies the forbidden-overlap path (it is NOT above the waterline).
		expect(aboveWaterline("front/web/messages/fr.json")).toBe(false);
		expect(pathAllowed(impl, "front/web/messages/fr.json").allowed).toBe(false);
		expect(pathAllowed(impl, "front/web/app/page.tsx").allowed).toBe(true);
	});

	it("egress/exec are fail-closed allow-lists carrying their S13 codes; deterministic", () => {
		// goldenImpl carries empty allowedNetworkHosts/allowedExec ⇒ deny all.
		const noEgress = egressDecision(goldenImpl, "api.anthropic.com");
		expect(noEgress.allowed).toBe(false);
		expect(noEgress.blockReason?.code).toBe("AGENT_EGRESS_NOT_ALLOWED");
		const noExec = execDecision(goldenImpl, "go");
		expect(noExec.allowed).toBe(false);
		expect(noExec.blockReason?.code).toBe("AGENT_EXEC_NOT_ALLOWED");
		// declared hosts/cmds pass:
		const withHost: AgentImplementation = {
			...goldenImpl,
			allowedNetworkHosts: ["api.anthropic.com"],
			allowedExec: ["go"],
		};
		expect(egressDecision(withHost, "api.anthropic.com").allowed).toBe(true);
		expect(execDecision(withHost, "go").allowed).toBe(true);
		// deterministic:
		expect(egressDecision(goldenImpl, "x").blockReason?.code).toBe(
			egressDecision(goldenImpl, "x").blockReason?.code,
		);
	});
});

describe("hooksSatisfied — the mandatory-hook turn-acceptance gate (BA10)", () => {
	// goldenImpl carries one mandatory hook: { PreToolUse, pretooluse, mandatory:true }.
	const greenVerdict: HookVerdict[] = [
		{ phase: "PreToolUse", hook: "pretooluse", ran: true, green: true },
	];

	it("accepts (null) when every mandatory hook ran AND is green", () => {
		expect(hooksSatisfied(goldenImpl, greenVerdict)).toBeNull();
	});

	it("blocks with AGENT_MANDATORY_HOOK_SKIPPED when a mandatory hook never ran", () => {
		// No verdict for the mandatory hook ⇒ skipped.
		const br = hooksSatisfied(goldenImpl, []);
		expect(br).not.toBeNull();
		expect(br?.code).toBe("AGENT_MANDATORY_HOOK_SKIPPED");
		expect((br?.howToFix.length ?? 0) >= 1).toBe(true);
	});

	it("blocks with AGENT_MANDATORY_HOOK_RED when a mandatory hook ran but is NOT green (presence ≠ green)", () => {
		const red: HookVerdict[] = [
			{ phase: "PreToolUse", hook: "pretooluse", ran: true, green: false },
		];
		const br = hooksSatisfied(goldenImpl, red);
		expect(br?.code).toBe("AGENT_MANDATORY_HOOK_RED");
	});

	it("never blocks on a non-mandatory (advisory) hook, even if red", () => {
		const advisory: AgentImplementation = {
			...goldenImpl,
			hooks: [{ phase: "PostToolUse", hook: "sensors", mandatory: false }],
		};
		const red: HookVerdict[] = [
			{ phase: "PostToolUse", hook: "sensors", ran: true, green: false },
		];
		expect(hooksSatisfied(advisory, red)).toBeNull();
		expect(hooksSatisfied(advisory, [])).toBeNull();
	});

	it("is deterministic — same (impl, verdicts) → same verdict (fault-injection flips it)", () => {
		// Fault-injection: a green baseline reddened by removing the verdict flips to a block.
		expect(hooksSatisfied(goldenImpl, greenVerdict)).toBeNull();
		const a = hooksSatisfied(goldenImpl, []);
		const b = hooksSatisfied(goldenImpl, []);
		expect(a?.code).toBe(b?.code);
		expect(a?.code).toBe("AGENT_MANDATORY_HOOK_SKIPPED");
	});
});

// BA11 — the per-run cost counter + budget gate twin (RunMeter + checkBudget). It
// mirrors the Go property mirror: monotone meter, min() is authoritative, the verdict
// flips at the effective cap (boundary), fail-closed per-axis, cost-aware, wall-clock
// deadline, AGENT_BUDGET_EXCEEDED on a breach.
describe("BA11 — RunMeter + checkBudget (the per-run budget gate)", () => {
	const zero: RunMeter = {
		tokens: 0,
		turns: 0,
		ciMinutes: 0,
		wallClockSecs: 0,
	};

	it("tally is monotone — no axis ever decreases", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						tokens: fc.integer({ min: 0, max: 1000 }),
						turns: fc.integer({ min: 0, max: 5 }),
						ciMinutes: fc.integer({ min: 0, max: 50 }),
						wallClockSecs: fc.integer({ min: 0, max: 600 }),
					}),
					{ minLength: 1, maxLength: 8 },
				),
				(deltas) => {
					let m = zero;
					for (const d of deltas) {
						const before = m;
						m = tally(m, d);
						expect(m.tokens).toBeGreaterThanOrEqual(before.tokens);
						expect(m.turns).toBeGreaterThanOrEqual(before.turns);
						expect(m.ciMinutes).toBeGreaterThanOrEqual(before.ciMinutes);
						expect(m.wallClockSecs).toBeGreaterThanOrEqual(
							before.wallClockSecs,
						);
					}
				},
			),
		);
	});

	it("min() is authoritative — the verdict flips at min(S29, S51) on the tokens axis", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 100000 }),
				fc.integer({ min: 0, max: 100000 }),
				(s29, s51) => {
					const eff = Math.min(s29, s51);
					expect(
						effectiveTokensCap(
							{ cellRef: "c", maxCiMinutes: 1e9, maxLlmTokensPerGoal: s51 },
							{ timeSeconds: 1e9, turns: 1e9, tokens: s29 },
						),
					).toBe(eff);
					const b: Budgets = { timeSeconds: 1e9, turns: 1e9, tokens: s29 };
					const h: HarnessCostBudget = {
						cellRef: "c",
						maxCiMinutes: 1e9,
						maxLlmTokensPerGoal: s51,
					};
					// At the effective cap: within budget.
					expect(
						checkBudget({ ...zero, tokens: eff }, h, b, 0).withinBudget,
					).toBe(true);
					// One past: breached on tokens.
					const v = checkBudget({ ...zero, tokens: eff + 1 }, h, b, 0);
					expect(v.withinBudget).toBe(false);
					expect(v.breachedAxis).toBe("tokens");
					expect(v.blockReason?.code).toBe("AGENT_BUDGET_EXCEEDED");
				},
			),
		);
	});

	it("fail-closed — over on ANY axis breaches; within IFF within on every axis", () => {
		fc.assert(
			fc.property(
				fc.record({
					tokens: fc.integer({ min: 0, max: 200000 }),
					turns: fc.integer({ min: 0, max: 2000 }),
					ciMinutes: fc.integer({ min: 0, max: 20000 }),
					wallClockSecs: fc.integer({ min: 0, max: 200000 }),
				}),
				fc.record({
					s29Tokens: fc.integer({ min: 0, max: 100000 }),
					s51Tokens: fc.integer({ min: 0, max: 100000 }),
					turns: fc.integer({ min: 0, max: 1000 }),
					ci: fc.integer({ min: 0, max: 10000 }),
					time: fc.integer({ min: 0, max: 100000 }),
				}),
				(m, caps) => {
					const b: Budgets = {
						timeSeconds: caps.time,
						turns: caps.turns,
						tokens: caps.s29Tokens,
					};
					const h: HarnessCostBudget = {
						cellRef: "c",
						maxCiMinutes: caps.ci,
						maxLlmTokensPerGoal: caps.s51Tokens,
					};
					const effTok = Math.min(caps.s29Tokens, caps.s51Tokens);
					const over =
						m.tokens > effTok ||
						m.turns > caps.turns ||
						m.ciMinutes > caps.ci ||
						m.wallClockSecs > caps.time;
					expect(checkBudget(m, h, b, 0).withinBudget).toBe(!over);
				},
			),
		);
	});

	it("cost-aware — cost = tokens × rate, monotone non-decreasing in tokens", () => {
		fc.assert(
			fc.property(
				fc.float({ min: 0, max: 1, noNaN: true }),
				fc.integer({ min: 0, max: 1000000 }),
				fc.integer({ min: 0, max: 1000000 }),
				(rate, a, extra) => {
					const c1 = costAware({ ...zero, tokens: a }, rate);
					const c2 = costAware({ ...zero, tokens: a + extra }, rate);
					expect(c2).toBeGreaterThanOrEqual(c1);
				},
			),
		);
	});

	it("wall-clock deadline — exceeding the deadline breaches even with zero tokens", () => {
		const b: Budgets = { timeSeconds: 100, turns: 1e9, tokens: 1e9 };
		const h: HarnessCostBudget = {
			cellRef: "c",
			maxCiMinutes: 1e9,
			maxLlmTokensPerGoal: 1e9,
		};
		const v = checkBudget({ ...zero, tokens: 0, wallClockSecs: 101 }, h, b, 0);
		expect(v.withinBudget).toBe(false);
		expect(v.breachedAxis).toBe("wall_clock");
	});

	it("is deterministic — same inputs → same verdict", () => {
		const b: Budgets = { timeSeconds: 100, turns: 10, tokens: 1000 };
		const h: HarnessCostBudget = {
			cellRef: "c",
			maxCiMinutes: 50,
			maxLlmTokensPerGoal: 800,
		};
		const m: RunMeter = {
			tokens: 900,
			turns: 3,
			ciMinutes: 10,
			wallClockSecs: 20,
		};
		const v1 = checkBudget(m, h, b, 0.0001);
		const v2 = checkBudget(m, h, b, 0.0001);
		expect(v1).toEqual(v2);
		expect(v1.breachedAxis).toBe("tokens"); // 900 > min(1000,800)=800
	});
});

// ── BA12 — the determinism-first ARBITER twin (arbitrate + arbitrateGated) ─────────────
// The intent is classified from the action STRUCTURE (tool + args), NEVER from the label;
// re-labelling cannot change the verdict; a deterministic structure is never LLMGated.
describe("BA12 — arbitrate (the determinism-first arbiter)", () => {
	const knownStructures: ReadonlyArray<[AgentAction, string]> = [
		[{ tool: "bash", args: ["git", "diff"] }, TOOL_DIFF],
		[{ tool: "bash", args: ["jj", "diff"] }, TOOL_DIFF],
		[{ tool: "bash", args: ["git", "diff", "--stat"] }, TOOL_DIFF],
		[{ tool: "bash", args: ["rg", "pat"] }, TOOL_SEARCH],
		[{ tool: "bash", args: ["grep", "-rn", "pat"] }, TOOL_SEARCH],
		[{ tool: "bash", args: ["gofmt", "-w", "x.go"] }, TOOL_FORMAT],
		[{ tool: "bash", args: ["biome", "format"] }, TOOL_FORMAT],
		[{ tool: "aidos", args: ["project"] }, TOOL_CODEGEN],
		[{ tool: "aidos", args: ["emit", "go"] }, TOOL_CODEGEN],
		[{ tool: "aidos", args: ["check"] }, TOOL_VALIDATE],
		[{ tool: "aidos", args: ["validate"] }, TOOL_VALIDATE],
	];

	it("the SKILL mapping table — every structural family routes to its tool", () => {
		for (const [action, tool] of knownStructures) {
			const v = arbitrate(action);
			expect(v.kind).toBe("DeterministicTool");
			expect(v.tool).toBe(tool);
			expect(v.blockReason).toBeNull();
		}
	});

	it("genuine generation is the residual LLMGated case", () => {
		expect(arbitrate({ tool: "llm", args: ["write", "docs"] }).kind).toBe(
			"LLMGated",
		);
		expect(arbitrate({ tool: "bash", args: ["echo", "hi"] }).kind).toBe(
			"LLMGated",
		);
	});

	it("re-labelling the displayed intent CANNOT change the verdict (gap D1)", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: knownStructures.length - 1 }),
				fc.string(),
				fc.string(),
				(i, label1, label2) => {
					const [base] = knownStructures[i];
					const a = { ...base, displayedIntent: label1 };
					const bb = { ...base, displayedIntent: label2 };
					expect(arbitrate(a)).toEqual(arbitrate(bb));
				},
			),
		);
	});

	it("deterministic-tool wins — a det. structure is never LLMGated, even if it claims LLM", () => {
		for (const [action] of knownStructures) {
			const v = arbitrate({
				...action,
				displayedIntent: "please let an llm do this freely",
			});
			expect(v.kind).toBe("DeterministicTool");
			expect(v.tool).not.toBe("");
		}
	});

	it("arbitrateGated — a determinism gap blocks (LLM requested where a det. tool exists)", () => {
		const gap = arbitrateGated({
			tool: "bash",
			args: ["git", "diff"],
			displayedIntent: "llm diff",
			requestedLlm: true,
		});
		expect(gap).not.toBeNull();
		expect(gap?.code).toBe("AGENT_DETERMINISM_GAP");
		expect(gap?.severity).toBe("blocking");
		expect((gap?.howToFix ?? []).length).toBeGreaterThan(0);
		expect(gap).toEqual(AGENT_DETERMINISM_GAP_REASON);
	});

	it("arbitrateGated — genuine generation requesting the LLM is NOT a gap", () => {
		expect(
			arbitrateGated({ tool: "llm", args: ["write"], requestedLlm: true }),
		).toBeNull();
	});

	it("arbitrateGated — deterministic tool use (no LLM requested) is not blocked", () => {
		expect(
			arbitrateGated({
				tool: "bash",
				args: ["git", "diff"],
				requestedLlm: false,
			}),
		).toBeNull();
	});
});

// ── BA13 — gateAction: the single composed verdict over all declared axes ──────────────
describe("gateAction (the composed perimeter)", () => {
	const permissiveImpl = (): AgentImplementation => ({
		layerRef: "couche-agent@deadbeef",
		role: "coder",
		objectif: "make red green",
		stopConditions: [],
		provider: "anthropic",
		model: "claude-opus-4-8",
		temperature: 0,
		maxTurns: 10,
		seed: "s",
		tools: [{ server: "store", tool: "read" }],
		skills: ["tdd"],
		hooks: [],
		allowedPaths: ["app/"],
		forbiddenPaths: wallForbiddenPaths(),
		allowedNetworkHosts: [],
		allowedExec: [],
		resourceLimits: { maxMemoryMb: 0, maxCpuMillis: 0, maxWallSeconds: 0 },
		maxConcurrency: 0,
	});
	const okMeter: RunMeter = {
		tokens: 10,
		turns: 1,
		ciMinutes: 0,
		wallClockSecs: 1,
	};
	const h: HarnessCostBudget = {
		cellRef: "c",
		maxCiMinutes: 100,
		maxLlmTokensPerGoal: 1000,
	};
	const b: Budgets = { timeSeconds: 100, turns: 100, tokens: 1000 };
	const happy = (): GateActionInput => ({
		target: "app/main.go",
		server: "store",
		tool: "read",
		skill: "tdd",
		agentAction: { tool: "bash", args: ["rg", "x"] },
	});

	it("allows the happy path (every applicable axis passes)", () => {
		const d = gateAction(permissiveImpl(), happy(), okMeter, h, b, 0.001, []);
		expect(d.allowed).toBe(true);
		expect(d.blockReason).toBeNull();
	});

	it("each axis violation returns the correct BlockReason from the SAME gate", () => {
		const cases: Array<{
			name: string;
			mut: (impl: AgentImplementation, a: GateActionInput, m: RunMeter) => void;
			code: string;
			axis: string;
		}> = [
			{
				name: "determinism gap",
				mut: (_i, a) => {
					a.agentAction = {
						tool: "bash",
						args: ["git", "diff"],
						requestedLlm: true,
					};
				},
				code: "AGENT_DETERMINISM_GAP",
				axis: "determinism",
			},
			{
				name: "zone above waterline",
				mut: (i, a) => {
					i.allowedPaths = ["back/"];
					a.target = "back/kernel/truth.go";
				},
				code: "AGENT_WRITE_ABOVE_WATERLINE",
				axis: "zone",
			},
			{
				name: "path outside allow-list",
				mut: (_i, a) => {
					a.target = "etc/passwd";
				},
				code: "AGENT_PATH_NOT_ALLOWED",
				axis: "path",
			},
			{
				name: "egress undeclared",
				mut: (_i, a) => {
					a.host = "evil.example.com";
				},
				code: "AGENT_EGRESS_NOT_ALLOWED",
				axis: "egress",
			},
			{
				name: "exec undeclared",
				mut: (_i, a) => {
					a.exec = "rm -rf /";
				},
				code: "AGENT_EXEC_NOT_ALLOWED",
				axis: "exec",
			},
			{
				name: "capacity unbound tool",
				mut: (_i, a) => {
					a.tool = "delete";
				},
				code: "AGENT_TOOL_NOT_BOUND",
				axis: "capacity",
			},
			{
				name: "skill unbound",
				mut: (_i, a) => {
					a.skill = "evolve";
				},
				code: "AGENT_SKILL_NOT_BOUND",
				axis: "skill",
			},
			{
				name: "budget exceeded",
				mut: (_i, _a, m) => {
					m.tokens = 100000;
				},
				code: "AGENT_BUDGET_EXCEEDED",
				axis: "budget",
			},
			{
				name: "mandatory hook skipped",
				mut: (i) => {
					i.hooks = [{ phase: "PreToolUse", hook: "wall", mandatory: true }];
				},
				code: "AGENT_MANDATORY_HOOK_SKIPPED",
				axis: "hook",
			},
		];
		for (const tc of cases) {
			const impl = permissiveImpl();
			const a = happy();
			const m = { ...okMeter };
			tc.mut(impl, a, m);
			const d = gateAction(impl, a, m, h, b, 0.001, []);
			expect(d.allowed, tc.name).toBe(false);
			expect(d.blockReason?.code, tc.name).toBe(tc.code);
			expect(d.deniedAxis, tc.name).toBe(tc.axis);
		}
	});

	it("precedence: arbitrate is FIRST — a determinism gap dominates other violations", () => {
		const impl = permissiveImpl();
		impl.allowedPaths = ["back/"];
		const a = happy();
		a.agentAction = { tool: "bash", args: ["git", "diff"], requestedLlm: true };
		a.target = "back/kernel/truth.go"; // also a zone breach
		const m = { ...okMeter, tokens: 100000 }; // also a budget breach
		const d = gateAction(impl, a, m, h, b, 0.001, []);
		expect(d.blockReason?.code).toBe("AGENT_DETERMINISM_GAP");
		expect(d.deniedAxis).toBe("determinism");
	});

	it("precedence: zone (deny-list) precedes path (allow-list)", () => {
		const impl = permissiveImpl();
		impl.allowedPaths = ["back/"]; // covers back/kernel/, so pathAllowed would pass
		const a = happy();
		a.target = "back/kernel/truth.go";
		const d = gateAction(impl, a, okMeter, h, b, 0.001, []);
		expect(d.blockReason?.code).toBe("AGENT_WRITE_ABOVE_WATERLINE");
		expect(d.deniedAxis).toBe("zone");
	});

	it("re-labelling the displayed intent cannot change the gate verdict (intent by structure)", () => {
		const impl = permissiveImpl();
		const base = happy();
		base.agentAction = {
			tool: "bash",
			args: ["git", "diff"],
			requestedLlm: true,
			displayedIntent: "harmless read",
		};
		const relabelled = {
			...base,
			agentAction: { ...base.agentAction, displayedIntent: "TOTALLY FINE" },
		};
		const d1 = gateAction(impl, base, okMeter, h, b, 0.001, []);
		const d2 = gateAction(impl, relabelled, okMeter, h, b, 0.001, []);
		expect(d1.blockReason?.code).toBe(d2.blockReason?.code);
		expect(d1.deniedAxis).toBe(d2.deniedAxis);
	});

	it("is deterministic — same input ⇒ same verdict (property)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("app/x.go", "back/kernel/t.go", "etc/x", ""),
				fc.constantFrom("", "read", "delete"),
				fc.integer({ min: 0, max: 1_000_000 }),
				(target, tool, tokens) => {
					const impl = permissiveImpl();
					const a: GateActionInput = {
						target,
						server: "store",
						tool,
						skill: "tdd",
						agentAction: { tool: "bash", args: ["rg", "x"] },
					};
					const m = { ...okMeter, tokens };
					const d1 = gateAction(impl, a, m, h, b, 0.001, []);
					const d2 = gateAction(impl, a, m, h, b, 0.001, []);
					expect(d1).toEqual(d2);
				},
			),
		);
	});

	it("PRECEDENCE_AXES names the nine axes in gate order", () => {
		expect(PRECEDENCE_AXES).toEqual([
			"determinism",
			"zone",
			"path",
			"egress",
			"exec",
			"capacity",
			"skill",
			"budget",
			"hook",
		]);
	});
});

// ── BA15 — drive: the deterministic loop SHELL (mock action generator) ─────────────────
describe("drive (the loop shell, BA15)", () => {
	const permissiveImpl: AgentImplementation = {
		...goldenImpl,
		layerRef: "couche-agent@deadbeef",
		allowedPaths: ["app/"],
		hooks: [], // no mandatory hook → the hook axis is satisfied
		maxTurns: 64,
	};

	const writeTurn = (target: string, flip: string): ScriptedTurnTs => ({
		action: {
			target,
			agentAction: { tool: "write", args: [target] },
		},
		body: { type: "write", cible: target },
		cost: { tokens: 10, turns: 1, ciMinutes: 0, wallClockSecs: 1 },
		effects: [{ mirror: flip, state: "green" as SensorStateTs }],
	});

	const baseInput = (turns: ScriptedTurnTs[]): DriveInputTs => ({
		impl: permissiveImpl,
		goal: {
			id: "goal-ba15",
			redSet: ["mirror.a", "mirror.b"],
			budgets: { timeSeconds: 10000, turns: 10000, tokens: 1000000 },
		},
		redWorkItem: "item-1",
		contextPack: "pack-1",
		sensors: { "mirror.a": "red", "mirror.b": "red" },
		priorGreen: "intact",
		mutation: 1,
		mutationFloor: 0,
		monsters: [],
		harnessBudget: {
			cellRef: "cell-ba15",
			maxCiMinutes: 10000,
			maxLlmTokensPerGoal: 1000000,
		},
		ratePerToken: 0.000001,
		hookVerdicts: [],
		turns,
		startedAt: "2026-06-03T00:00:00Z",
		endedAt: "2026-06-03T00:05:00Z",
	});

	it("KEYSTONE — an above-the-line write is autorisee:false; result is COMPUTED by isClosed", () => {
		const run = drive(
			baseInput([
				writeTurn("back/kernel/expr.go", "mirror.a"), // refused — effect never lands
				writeTurn("app/a.go", "mirror.a"),
				writeTurn("app/b.go", "mirror.b"),
			]),
		);
		expect(run.actions).toHaveLength(3);
		expect(run.actions[0].autorisee).toBe(false);
		expect(run.actions[0].raisonBlocage?.code).toBe(
			"AGENT_WRITE_ABOVE_WATERLINE",
		);
		expect(run.actions[1].autorisee).toBe(true);
		expect(run.actions[2].autorisee).toBe(true);
		// COMPUTED green: both mirrors flipped by the LEGAL writes (the refused effect
		// never landed) — never self-reported by the mock.
		expect(run.result).toBe("green");
	});

	it("a refused write's effect never lands — the goal stays red", () => {
		const run = drive(
			baseInput([
				writeTurn("back/kernel/expr.go", "mirror.a"), // refused → mirror.a stays red
				writeTurn("app/b.go", "mirror.b"),
			]),
		);
		expect(run.result).toBe("still_red");
		expect(run.actions[0].autorisee).toBe(false);
	});

	it("happy path — both legal writes flip the mirrors → green", () => {
		const run = drive(
			baseInput([
				writeTurn("app/a.go", "mirror.a"),
				writeTurn("app/b.go", "mirror.b"),
			]),
		);
		expect(run.result).toBe("green");
		expect(run.actions.every((a) => a.autorisee)).toBe(true);
	});

	it("an over-budget run is abandoned with AGENT_BUDGET_EXCEEDED", () => {
		const in_ = baseInput([
			writeTurn("app/a.go", "mirror.a"),
			writeTurn("app/b.go", "mirror.b"),
		]);
		in_.goal.budgets = { timeSeconds: 10000, turns: 10000, tokens: 15 };
		const run = drive(in_);
		expect(run.result).toBe("abandoned");
		const last = run.actions[run.actions.length - 1];
		expect(last.autorisee).toBe(false);
		expect(last.raisonBlocage?.code).toBe("AGENT_BUDGET_EXCEEDED");
	});

	it("is reproducible — same input ⇒ same run (fast-check)", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						target: fc.constantFrom(
							"app/a.go",
							"app/b.go",
							"back/kernel/x.go",
							"back/migrations/m.sql",
						),
						flip: fc.constantFrom("mirror.a", "mirror.b"),
						tok: fc.integer({ min: 0, max: 50 }),
					}),
					{ maxLength: 6 },
				),
				(spec) => {
					const turns: ScriptedTurnTs[] = spec.map((s) => ({
						action: {
							target: s.target,
							agentAction: { tool: "write", args: [s.target] },
						},
						body: { type: "write", cible: s.target },
						cost: { tokens: s.tok, turns: 1, ciMinutes: 0, wallClockSecs: 0 },
						effects: [{ mirror: s.flip, state: "green" as SensorStateTs }],
					}));
					const in_ = baseInput(turns);
					expect(drive(in_)).toEqual(drive(in_));
				},
			),
		);
	});

	it("the wall holds — no above-the-line write is ever allowed (fast-check soundness)", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.constantFrom(
						"app/a.go",
						"back/kernel/x.go",
						"back/migrations/m.sql",
						"app/b.go",
					),
					{ maxLength: 6 },
				),
				(targets) => {
					const turns: ScriptedTurnTs[] = targets.map((t) =>
						writeTurn(t, "mirror.a"),
					);
					const run = drive(baseInput(turns));
					for (const a of run.actions) {
						if (
							a.autorisee &&
							(a.cible.startsWith("back/kernel/") ||
								a.cible.startsWith("back/migrations/"))
						) {
							throw new Error(`above-the-line write allowed: ${a.cible}`);
						}
					}
				},
			),
		);
	});

	it("isClosed is the non-gameable stop (red set→green ∧ prior intact ∧ mut≥floor ∧ no monster)", () => {
		const g = {
			id: "g",
			redSet: ["m1"],
			budgets: { timeSeconds: 1, turns: 1, tokens: 1 },
		};
		expect(
			isClosed(g, {
				sensors: { m1: "green" },
				priorGreen: "intact",
				mutation: 1,
				mutationFloor: 0,
				monsters: [],
			}),
		).toBe(true);
		expect(
			isClosed(g, {
				sensors: { m1: "red" },
				priorGreen: "intact",
				mutation: 1,
				mutationFloor: 0,
				monsters: [],
			}),
		).toBe(false);
		expect(
			isClosed(g, {
				sensors: { m1: "green" },
				priorGreen: "broken",
				mutation: 1,
				mutationFloor: 0,
				monsters: [],
			}),
		).toBe(false);
	});

	// ── BA16 — the deterministic POST-CHECK of EVERY action ──────────────────────────
	describe("postCheck (the deterministic re-check, BA16)", () => {
		it("the judge, not the claim — a code flip the sensor disagrees with is REJECTED", () => {
			const lying = writeTurn("app/a.go", "mirror.a");
			lying.observed = [{ mirror: "mirror.a", state: "red" }]; // sensor still red
			expect(postCheck(lying, { "mirror.a": "red" }).accepted).toBe(false);
			// the same claim, confirmed by the sensor, is ACCEPTED
			expect(postCheck(lying, { "mirror.a": "green" }).accepted).toBe(true);
		});

		it("a propose with a sensor flip is rejected (a hypothesis is not a truth)", () => {
			const bad: ScriptedTurnTs = {
				action: { agentAction: { tool: "propose", args: ["idea"] } },
				body: { type: "propose", cible: "idea" },
				cost: { tokens: 1, turns: 1, ciMinutes: 0, wallClockSecs: 0 },
				effects: [{ mirror: "mirror.a", state: "green" }],
			};
			expect(postCheck(bad, {}).accepted).toBe(false);
			expect(postCheck(bad, {}).blockReason?.code).toBe(
				"AGENT_POSTCHECK_FAILED",
			);
		});

		it("a read with a side effect is rejected; a clean read is accepted", () => {
			const dirty: ScriptedTurnTs = {
				action: { agentAction: { tool: "read", args: ["app/a.go"] } },
				body: { type: "read", cible: "app/a.go" },
				cost: { tokens: 1, turns: 1, ciMinutes: 0, wallClockSecs: 0 },
				effects: [{ mirror: "mirror.a", state: "green" }],
			};
			expect(postCheck(dirty, {}).accepted).toBe(false);
			expect(postCheck({ ...dirty, effects: [] }, {}).accepted).toBe(true);
		});

		it("an unknown nature is a determinism gap — REJECTED with AGENT_POSTCHECK_FAILED", () => {
			const weird = writeTurn("app/a.go", "mirror.a");
			// biome-ignore lint/suspicious/noExplicitAny: testing an out-of-enum nature
			(weird.body as any).type = "nudge";
			const res = postCheck(weird, { "mirror.a": "green" });
			expect(res.accepted).toBe(false);
			expect(res.kind).toBe("");
			expect(res.blockReason?.code).toBe("AGENT_POSTCHECK_FAILED");
		});

		it("drive — a claimed-only flip the mirror disagrees with does NOT close the goal", () => {
			const claim = (target: string, flip: string): ScriptedTurnTs => ({
				...writeTurn(target, flip),
				observed: [{ mirror: flip, state: "red" }], // the sensor disagrees
			});
			const run = drive(
				baseInput([
					claim("app/a.go", "mirror.a"),
					claim("app/b.go", "mirror.b"),
				]),
			);
			expect(run.result).toBe("still_red");
			for (const a of run.actions) {
				expect(a.autorisee).toBe(false);
				expect(a.raisonBlocage?.code).toBe("AGENT_POSTCHECK_FAILED");
			}
		});

		it("drive — the result is INVARIANT to claimed confidence (confirmed ⇒ green)", () => {
			const confirmed = drive(
				baseInput([
					writeTurn("app/a.go", "mirror.a"),
					writeTurn("app/b.go", "mirror.b"),
				]),
			);
			expect(confirmed.result).toBe("green");
		});
	});
});

// ── BA17 — sandbox binding + the gated LLM exception (front twin) ──────────────────────
describe("BA17 — sandbox defense in depth + the gated LLM exception", () => {
	const sandboxImpl: AgentImplementation = {
		...goldenImpl,
		allowedPaths: ["apps/demo/"],
		forbiddenPaths: wallForbiddenPaths(),
		allowedNetworkHosts: ["api.anthropic.com"],
		allowedExec: ["go"],
	};

	it("a generated write inside the app tree is allowed", () => {
		const v = checkGeneratedWrite(sandboxImpl, "apps/demo/src/main.go");
		expect(v.allowed).toBe(true);
		expect(v.deniedLevels).toHaveLength(0);
	});

	it("a generated write to a truth zone is refused at all THREE levels", () => {
		const v = checkGeneratedWrite(sandboxImpl, "back/kernel/truth.go");
		expect(v.allowed).toBe(false);
		expect(v.deniedLevels.length).toBeGreaterThanOrEqual(3);
		expect(grantWouldDeny("back/kernel/truth.go")).toBe(true);
	});

	it("a generated egress to an undeclared host is refused at boundary AND gate", () => {
		const v = checkGeneratedEgress(sandboxImpl, "evil.example.com");
		expect(v.allowed).toBe(false);
		expect(v.deniedLevels.length).toBeGreaterThanOrEqual(2);
	});

	it("the declared egress host is reachable", () => {
		expect(checkGeneratedEgress(sandboxImpl, "api.anthropic.com").allowed).toBe(
			true,
		);
	});

	it("the sandbox runs under the aidos_agent Postgres role", () => {
		expect(POSTGRES_AGENT_ROLE).toBe("aidos_agent");
	});

	it("hardStop is monotone: stop iff (cap>0 ∧ emitted>=cap)", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 2000 }),
				fc.integer({ min: 0, max: 1000 }),
				(emitted, cap) => {
					expect(hardStop(emitted, cap)).toBe(cap > 0 && emitted >= cap);
				},
			),
		);
	});

	it("the gated LLM fake is deterministic (same transcript ⇒ same reply)", () => {
		const replies = ["action-1", "action-2"];
		const tr = { system: "s", turns: [] as string[] };
		const a = fakeGenerateAction(replies, tr, 0);
		const b = fakeGenerateAction(replies, tr, 0);
		expect(a.text).toBe(b.text);
		expect(a.text).toBe("action-1");
	});

	it("the gated LLM fake hard-stops streaming at the token cap", () => {
		const out = fakeGenerateAction(
			["a b c d e f g h"],
			{ system: "", turns: [] },
			5,
		);
		expect(out.tokens).toBeLessThanOrEqual(5);
		expect(out.truncated).toBe(true);
	});

	it("checkGeneratedWrite is deterministic for any target", () => {
		fc.assert(
			fc.property(fc.string(), (target) => {
				const a = checkGeneratedWrite(sandboxImpl, target);
				const b = checkGeneratedWrite(sandboxImpl, target);
				expect(a.allowed).toBe(b.allowed);
				expect(a.deniedLevels).toEqual(b.deniedLevels);
			}),
		);
	});
});

// ── BA19 — the agentloop MCP capability door (front twin: driveAgentloop) ─────────
//
// The Run controls drive the deterministic scenario through the transport-boundary
// capacity gate. These are the reproducibility + wall mirrors for the front twin:
// same input ⇒ same { refused, run }; a bound tool drives green; an unbound tool is
// refused at the boundary (AGENT_TOOL_NOT_BOUND) with NO run; no scenario writes truth.

const builderImpl: AgentImplementation = {
	layerRef: "agentlayer:builder@v1",
	role: "builder",
	objectif: "drive a red work item to green in the app tree",
	stopConditions: ["red set still red"],
	provider: "anthropic",
	model: "claude-opus-4-8",
	temperature: 0,
	maxTurns: 80,
	seed: "",
	tools: [{ server: "mirror-runner", tool: "run_mirror" }],
	skills: ["tdd"],
	hooks: [{ phase: "PreToolUse", hook: "pretooluse (wall)", mandatory: true }],
	allowedPaths: ["app"],
	forbiddenPaths: wallForbiddenPaths(),
	allowedNetworkHosts: [],
	allowedExec: ["go"],
	resourceLimits: {
		maxMemoryMb: 4096,
		maxCpuMillis: 8000,
		maxWallSeconds: 1800,
	},
	maxConcurrency: 1,
};
const boundTarget = { server: "mirror-runner", tool: "run_mirror" };

describe("driveAgentloop — the agentloop MCP Run control (BA19)", () => {
	it("a bound tool drives the happy scenario to green, no truth written", () => {
		const r = driveAgentloop(
			builderImpl,
			"happy",
			"redset:checkout#1",
			boundTarget,
		);
		expect(r.refused).toBe(false);
		expect(r.run?.result).toBe("green");
		expect(r.run?.redWorkItem).toBe("redset:checkout#1");
		expect(r.run && agentloopWroteNoTruth(r.run)).toBe(true);
		for (const a of r.run?.actions ?? []) expect(a.autorisee).toBe(true);
	});

	it("a kernel-write turn is refused IN PLACE with AGENT_WRITE_ABOVE_WATERLINE, no truth lands", () => {
		const r = driveAgentloop(
			builderImpl,
			"kernel-write",
			"redset:checkout#1",
			boundTarget,
		);
		expect(r.refused).toBe(false);
		const refused = r.run?.actions.find((a) => !a.autorisee);
		expect(refused?.raisonBlocage?.code).toBe("AGENT_WRITE_ABOVE_WATERLINE");
		expect(r.run && agentloopWroteNoTruth(r.run)).toBe(true);
	});

	it("the over-budget scenario abandons, no truth written", () => {
		const r = driveAgentloop(
			builderImpl,
			"over-budget",
			"redset:checkout#1",
			boundTarget,
		);
		expect(r.refused).toBe(false);
		expect(r.run?.result).toBe("abandoned");
		expect(r.run && agentloopWroteNoTruth(r.run)).toBe(true);
	});

	it("an UNBOUND tool is refused at the transport boundary with AGENT_TOOL_NOT_BOUND and NO run", () => {
		const r = driveAgentloop(builderImpl, "happy", "redset:checkout#1", {
			server: "some-other-server",
			tool: "some_other_tool",
		});
		expect(r.refused).toBe(true);
		expect(r.run).toBeUndefined();
		expect(r.blockReason?.code).toBe("AGENT_TOOL_NOT_BOUND");
	});

	it("is reproducible: same input ⇒ same { refused, run } over every scenario", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...AGENTLOOP_SCENARIOS),
				(sc: AgentloopScenario) => {
					const a = driveAgentloop(
						builderImpl,
						sc,
						"redset:checkout#1",
						boundTarget,
					);
					const b = driveAgentloop(
						builderImpl,
						sc,
						"redset:checkout#1",
						boundTarget,
					);
					expect(JSON.stringify(a)).toBe(JSON.stringify(b));
				},
			),
		);
	});

	it("never writes truth across every scenario (the wall)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...AGENTLOOP_SCENARIOS),
				(sc: AgentloopScenario) => {
					const r = driveAgentloop(
						builderImpl,
						sc,
						"redset:checkout#1",
						boundTarget,
					);
					if (r.run) expect(agentloopWroteNoTruth(r.run)).toBe(true);
				},
			),
		);
	});
});
