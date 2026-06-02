import { describe, expect, it } from "vitest";
import {
	aboveWaterline,
	approve,
	type CoucheAgent,
	mayWrite,
	propose,
} from "./agentlayer";
import { applyWall } from "./agentrun";

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
