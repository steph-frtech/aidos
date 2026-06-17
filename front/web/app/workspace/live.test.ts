import { describe, expect, it } from "vitest";
import { accessDecoder, resourceDecoder, workspaceDecoder } from "./live";

/**
 * /workspace live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092 batch-4A).
 *
 * It proves the TS decoders decode a SAMPLE of the Go workspace MCP tools' output (workspacesrv:
 * provisionOutput{id, project_id, root, zones, repo, limits, wrote_kernel} / canAccessOutput{allowed,
 * block_code, root} / checkResourcesOutput{killed, reason, block_code}) — the tools' CONTRACT, NOT a
 * second implementation of the sandbox logic (the Go workspace runtime is authoritative). It pins the
 * wire shapes decode faithfully (the dry-run descriptor, the SANDBOX_ESCAPE access refusal, the
 * SANDBOX_RESOURCE_LIMIT kill) and that a malformed payload deterministically falls back to the demo
 * snapshot (the decoder returns null).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM. THE WALL (§2): provisioning is a
 * dry-run value (WroteKernel always false); the truth-store is OUTSIDE every workspace root.
 */
describe("workspace live — workspaceDecoder parity", () => {
	it("decodes a Go-sample provisionOutput (the dry-run descriptor)", () => {
		const goSample = {
			ok: true,
			id: "ws-proj-a",
			project_id: "proj-a",
			root: ".aidos/workspaces/proj-a",
			zones: ["ideas", "spike", "src", "kernel/spec"],
			repo: { vcs: "git", worktree: ".aidos/workspaces/proj-a/wt" },
			limits: {
				max_memory_mb: 512,
				max_cpu_millis: 2000,
				max_wall_seconds: 60,
				max_disk_mb: 1024,
			},
			wrote_kernel: false,
		};
		const ws = workspaceDecoder(goSample);
		expect(ws).not.toBeNull();
		expect(ws?.project_id).toBe("proj-a");
		expect(ws?.zones).toHaveLength(4);
		expect(ws?.limits.max_memory_mb).toBe(512);
	});

	it("a malformed provisionOutput returns null (demo fallback)", () => {
		expect(workspaceDecoder({ ok: false, error: "no project" })).toBeNull();
		expect(
			workspaceDecoder({ ok: true, id: 1, project_id: "x", root: "y" }),
		).toBeNull();
	});
});

describe("workspace live — accessDecoder parity", () => {
	it("decodes a Go-sample SANDBOX_ESCAPE refusal", () => {
		const goSample = {
			ok: true,
			allowed: false,
			block_code: "SANDBOX_ESCAPE",
			root: ".aidos/workspaces/proj-a",
		};
		const d = accessDecoder(goSample);
		expect(d).not.toBeNull();
		expect(d?.allowed).toBe(false);
		expect(d?.blockCode).toBe("SANDBOX_ESCAPE");
	});

	it("a malformed canAccessOutput returns null (demo fallback)", () => {
		expect(accessDecoder({ ok: false })).toBeNull();
		expect(accessDecoder({ ok: true, allowed: "no" })).toBeNull();
	});
});

describe("workspace live — resourceDecoder parity", () => {
	it("decodes a Go-sample SANDBOX_RESOURCE_LIMIT kill", () => {
		const goSample = {
			ok: true,
			killed: true,
			reason: "memory",
			block_code: "SANDBOX_RESOURCE_LIMIT",
		};
		const v = resourceDecoder(goSample);
		expect(v).not.toBeNull();
		expect(v?.killed).toBe(true);
		expect(v?.reason).toBe("memory");
		expect(v?.blockCode).toBe("SANDBOX_RESOURCE_LIMIT");
	});

	it("decodes a within-budget verdict (not killed, empty reason)", () => {
		const v = resourceDecoder({ ok: true, killed: false, reason: "" });
		expect(v).not.toBeNull();
		expect(v?.killed).toBe(false);
		expect(v?.reason).toBe("");
	});

	it("a malformed checkResourcesOutput returns null (demo fallback)", () => {
		expect(resourceDecoder({ ok: false })).toBeNull();
		expect(resourceDecoder({ ok: true, killed: "maybe" })).toBeNull();
	});
});
