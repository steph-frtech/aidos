import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitCompose, filterByProfile, isProfileBlock } from "./stack-emit";
import {
	exampleManifest,
	PROFILES,
	type Profile,
	type StackManifest,
	serviceInProfile,
} from "./stack-manifest";

/**
 * DP11 profile-filter mirror (vitest + fast-check): reflects=DP11-profile-filter,
 * test_kind=property, cert_language=vitest, liveness=live.
 *
 * The TS twin of the authoritative Go ∀ mirror
 * (back/runtime/composeemit/filterbyprofile_property_test.go): the PURE
 * include/exclude over the CLOSED SPEC-stack-2026 profile set DP03's Emit
 * composes on. Each service carries one+ profile in the closed set; the
 * selection includes/excludes services, BYTE-IDENTICAL per selection.
 *
 * Laws (the DP11 done-criteria, twin side):
 *   L1 same manifest + same selection → compose byte-identical (×2 + ×100);
 *   L2 a profile outside the closed set → UNKNOWN_PROFILE (never coerced);
 *   L3 the cross non-prod × prod → DOLTGRES_NOT_ALLOWED_IN_PROD (DP06 delegated);
 *   L4 `full` = the deterministic UNION (every service, never a subset);
 *   L5 the filter is a CLOSED-SET filter (core always kept, narrowing exact).
 *
 * THE WALL (§2): the profiles are DECLARED above the line in the stack_manifest
 * source; the SELECTION is applied below the line at emission — the filter reads
 * the AST and returns a narrowed AST, it writes no truth.
 */

// A richer-than-Example manifest: a core server + a core datastore + one
// service per non-core profile, so include/exclude is observable (the Example
// is all-core and would filter to itself under every selection).
function richManifest(): StackManifest {
	const base: StackManifest = exampleManifest();
	const nonCore: Profile[] = PROFILES.filter(
		(p) => p !== "core" && p !== "full",
	);
	let port = 9000;
	const extra = nonCore.map((p) => ({
		name: `svc-${p}`.replace(/[^a-z0-9-]/g, "-"),
		role: "connector",
		internal_port: port++,
		profile: p,
	}));
	return { ...base, services: [...base.services, ...extra] };
}

describe("DP11 — the deterministic profile filter (include/exclude on the closed set)", () => {
	const closed = PROFILES.filter((p) => p !== "full") as Profile[];

	it("L1 — same manifest + same selection → compose byte-identical (×2)", async () => {
		const m = richManifest();
		for (const profile of PROFILES) {
			const a = filterByProfile(m, profile, "dev");
			const b = filterByProfile(m, profile, "dev");
			expect(isProfileBlock(a)).toBe(false);
			expect(isProfileBlock(b)).toBe(false);
			if (isProfileBlock(a) || isProfileBlock(b)) continue;
			const ea = await emitCompose(a);
			const eb = await emitCompose(b);
			if ("refusal" in ea || "refusal" in eb) {
				throw new Error("a profile-filtered manifest must still emit");
			}
			expect(ea.outputHash).toBe(eb.outputHash);
			expect(ea.yaml).toBe(eb.yaml);
		}
	});

	it("L1 — reproducibility ×100: same selection → byte-identical compose", () => {
		fc.assert(
			fc.property(fc.constantFrom(...PROFILES), (profile) => {
				const m = richManifest();
				const a = filterByProfile(m, profile, "dev");
				const b = filterByProfile(m, profile, "dev");
				if (isProfileBlock(a) || isProfileBlock(b)) return false;
				return JSON.stringify(a) === JSON.stringify(b);
			}),
			{ numRuns: 100 },
		);
	});

	it("L2 — a profile outside the closed set → UNKNOWN_PROFILE (never coerced to full)", () => {
		fc.assert(
			fc.property(
				fc.string().filter((s) => !(PROFILES as readonly string[]).includes(s)),
				(bogus) => {
					const r = filterByProfile(richManifest(), bogus, "dev");
					return isProfileBlock(r) && r.block.code === "UNKNOWN_PROFILE";
				},
			),
			{ numRuns: 100 },
		);
		// the literal nearest-miss the e2e exercises is also refused.
		const r = filterByProfile(richManifest(), "observabilty", "dev");
		expect(isProfileBlock(r) && r.block.code).toBe("UNKNOWN_PROFILE");
	});

	it("L3 — the cross non-prod × prod → DOLTGRES_NOT_ALLOWED_IN_PROD (DP06 delegated)", () => {
		const r = filterByProfile(richManifest(), "non-prod", "prod");
		expect(isProfileBlock(r)).toBe(true);
		if (isProfileBlock(r)) {
			expect(r.block.code).toBe("DOLTGRES_NOT_ALLOWED_IN_PROD");
		}
		// non-prod against any non-prod env passes (the gate is keyed on prod).
		for (const env of ["staging", "dev", "local", "future_cloud"]) {
			expect(
				isProfileBlock(filterByProfile(richManifest(), "non-prod", env)),
			).toBe(false);
		}
		// any other profile against prod passes (only non-prod carries Doltgres).
		for (const profile of closed.filter((p) => p !== "non-prod")) {
			expect(
				isProfileBlock(filterByProfile(richManifest(), profile, "prod")),
			).toBe(false);
		}
	});

	it("L4 — `full` is the deterministic UNION (every service, byte-identical to unfiltered)", async () => {
		const m = richManifest();
		const full = filterByProfile(m, "full", "prod");
		expect(isProfileBlock(full)).toBe(false);
		if (isProfileBlock(full)) return;
		expect(full.services.length).toBe(m.services.length);
		// byte-identical to the un-filtered emission (full = identity on services).
		const emittedFull = await emitCompose(full);
		const emittedRaw = await emitCompose(m);
		if ("refusal" in emittedFull || "refusal" in emittedRaw) {
			throw new Error("full and unfiltered must both emit");
		}
		expect(emittedFull.outputHash).toBe(emittedRaw.outputHash);
		// full is the superset: every closed-set selection is a subset of full.
		for (const profile of closed) {
			const sub = filterByProfile(m, profile, "dev");
			if (isProfileBlock(sub)) continue;
			expect(sub.services.length).toBeLessThanOrEqual(full.services.length);
		}
	});

	it("L5 — core always kept; the kept set is EXACTLY {svc | serviceInProfile(svc, sel)}", () => {
		const m = richManifest();
		const coreCount = m.services.filter((s) => s.profile === "core").length;
		for (const profile of closed) {
			const r = filterByProfile(m, profile, "dev");
			if (isProfileBlock(r)) continue;
			// every kept service satisfies the pure predicate; declared order kept.
			for (const svc of r.services) {
				expect(serviceInProfile(svc, profile)).toBe(true);
			}
			// every core service is kept, under every selection (core always runs).
			expect(r.services.filter((s) => s.profile === "core").length).toBe(
				coreCount,
			);
			// the kept set is EXACTLY the closed filter (Go Law 5): a non-core
			// service is kept iff serviceInProfile holds — i.e. selection==core
			// (every service belongs to core) OR its declared profile == selection.
			const keptNames = new Set(r.services.map((s) => s.name));
			for (const svc of m.services) {
				if (svc.profile === "core") continue;
				const want = profile === "core" || svc.profile === profile;
				expect(
					keptNames.has(svc.name),
					`selection=${profile} svc=${svc.name} declaredProfile=${svc.profile}`,
				).toBe(want);
			}
		}
	});

	it("L6 — a NON-CORE selection keeps strictly fewer than `full` (the e2e contrast)", () => {
		const m = richManifest();
		const full = filterByProfile(m, "full", "dev");
		const git = filterByProfile(m, "git", "dev");
		expect(isProfileBlock(full)).toBe(false);
		expect(isProfileBlock(git)).toBe(false);
		if (isProfileBlock(full) || isProfileBlock(git)) return;
		// `git` keeps core (3) + svc-git (1) = 4; `full` keeps all (10).
		expect(git.services.length).toBeLessThan(full.services.length);
		// the core server survives every selection (so the compose stays valid).
		expect(git.services.some((s) => s.role === "server")).toBe(true);
	});
});
