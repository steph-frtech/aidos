import { describe, expect, it } from "vitest";
import { attachDecoder, checkDecoder } from "./live";

/**
 * /app-auth live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092 batch-4A).
 *
 * It proves the TS decoders decode a SAMPLE of the Go app-auth MCP tools' output (appauthsrv:
 * checkOutput{allowed, role, required} / attachOutput{target, macro, expansion_id, pieces, policies,
 * landed, wrote_kernel}) — the tools' CONTRACT, NOT a second implementation of the auth logic (the Go
 * appauth runtime is authoritative; check_access is a PURE role→operation lookup, never an LLM). It
 * pins the wire shapes decode faithfully and that a malformed / honesty-error payload deterministically
 * falls back to the demo snapshot (the decoder returns null).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM. THE WALL (§2): attach lands via an
 * APPROVED ChangeSet (WroteKernel always false).
 */
describe("app-auth live — checkDecoder parity", () => {
	it("decodes a Go-sample checkOutput (a denied viewer manageRoles)", () => {
		const goSample = {
			ok: true,
			allowed: false,
			role: "viewer",
			operation: "manageRoles",
			required: "admin",
		};
		const d = checkDecoder(goSample);
		expect(d).not.toBeNull();
		expect(d?.allowed).toBe(false);
		expect(d?.role).toBe("viewer");
		expect(d?.required).toBe("admin");
	});

	it("an honesty-error / malformed checkOutput returns null (demo fallback)", () => {
		expect(checkDecoder({ ok: false, error: "unknown role" })).toBeNull();
		expect(checkDecoder({ ok: true, allowed: "no" })).toBeNull();
		expect(
			checkDecoder({
				ok: true,
				allowed: true,
				role: "ghost",
				required: "admin",
			}),
		).toBeNull();
	});
});

describe("app-auth live — attachDecoder parity", () => {
	it("decodes a Go-sample attachOutput (the preview pieces + the role-authz band)", () => {
		const goSample = {
			ok: true,
			macro: "app-auth",
			target: "shop-app",
			expansion_id: "abc123def456",
			pieces: ["Role", "Session", "User", "authz-login", "login", "logout"],
			policies: [
				{
					name: "authz-login",
					scope: "OPERATION",
					operation: "login",
					min_role: "viewer",
					effect: "ALLOW",
				},
			],
			wrote_kernel: false,
			landed: false,
		};
		const a = attachDecoder(goSample);
		expect(a).not.toBeNull();
		expect(a?.target).toBe("shop-app");
		expect(a?.expansionId).toBe("abc123def456");
		expect(a?.pieces).toContain("User");
		expect(a?.policies).toHaveLength(1);
		expect(a?.policies[0]?.min_role).toBe("viewer");
		expect(a?.wroteKernel).toBe(false);
	});

	it("a malformed attachOutput returns null (demo fallback)", () => {
		expect(attachDecoder({ ok: false, error: "empty target" })).toBeNull();
		expect(attachDecoder({ ok: true, target: 42 })).toBeNull();
		expect(
			attachDecoder({
				ok: true,
				target: "x",
				pieces: ["a"],
				policies: [{ name: "bad" }],
			}),
		).toBeNull();
	});
});
