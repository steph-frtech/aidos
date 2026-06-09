import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type ApprovedMirror,
	bumpHash,
	closeLoop,
	DEMO_EDGES,
	DEMO_HEADS,
	DEMO_INCIDENT_REF,
	DEMO_MIRROR,
	DEMO_TARGET,
	type Target,
	targetedWave,
	WALL_CODE,
} from "./learn";

/**
 * S107 REPRODUCIBILITY MIRROR (fast-check) — the deterministic-able capabilities the `/learn`
 * loop adds are PURE functions (CLAUDE.md §6/§8; ROADMAP §S107): the BUMP (bumpHash is a content-
 * address delta), the WAVE (targetedWave is a deterministic redwave.Impact closure), the wall
 * always holds, and nothing learns its own fitness (wroteKernel always false). It also pins the
 * §S107 done-criterion on the demo: incident → approved mirror → hash bump → targeted red wave.
 */

function genTargetAndMirror(): fc.Arbitrary<{
	target: Target;
	mirror: ApprovedMirror;
}> {
	return fc
		.record({
			kind: fc.constantFrom("operation" as const, "policy" as const),
			id: fc.stringMatching(/^[a-z]{1,6}$/),
			ver: fc.integer({ min: 1, max: 9 }),
			name: fc.stringMatching(/^[a-z]{1,8}$/),
			mid: fc.stringMatching(/^[a-z]{1,6}$/),
		})
		.map(({ kind, id, ver, name, mid }) => {
			const version = `v${ver}`;
			const target: Target = {
				kind,
				id: `tgt-${id}`,
				version,
				specBody: { kind, name },
			};
			const mirror: ApprovedMirror = {
				mirrorId: `mir-${mid}`,
				reflectsId: target.id,
				reflectsVersion: version,
			};
			return { target, mirror };
		});
}

describe("S107 learn — reproducibility mirror", () => {
	it("property 1 — bumpHash is deterministic and a fresh reflection moves the address", () => {
		fc.assert(
			fc.property(genTargetAndMirror(), ({ target, mirror }) => {
				const a = bumpHash(target, mirror);
				const b = bumpHash(target, mirror);
				expect(a).toEqual(b);
				expect(a.moved).toBe(true);
				expect(a.before).not.toBe(a.after);
			}),
		);
	});

	it("property 2 — targetedWave is deterministic (same bump+edges+heads ⇒ same wave)", () => {
		fc.assert(
			fc.property(genTargetAndMirror(), ({ target, mirror }) => {
				const bump = bumpHash(target, mirror);
				const edges = [
					{
						fromId: mirror.mirrorId,
						fromVersion: "v1",
						toId: target.id,
						toVersion: target.version,
						loadBearing: true,
						layer: "mirror" as const,
					},
				];
				const heads = { [target.id]: `${target.version}x` };
				expect(targetedWave(bump, edges, heads)).toEqual(
					targetedWave(bump, edges, heads),
				);
			}),
		);
	});

	it("property 3 — the wall always holds and the loop never writes the kernel", () => {
		fc.assert(
			fc.property(genTargetAndMirror(), ({ target, mirror }) => {
				const out = closeLoop(DEMO_INCIDENT_REF, mirror, target, [], {});
				expect(out.wallCode).toBe(WALL_CODE);
				expect(out.wroteKernel).toBe(false);
				expect(out.provenanceSource).toBe("incident");
			}),
		);
	});

	it("property 4 — the §S107 demo done-criterion: incident → approved mirror → hash bump → targeted red wave", () => {
		const out = closeLoop(
			DEMO_INCIDENT_REF,
			DEMO_MIRROR,
			DEMO_TARGET,
			DEMO_EDGES,
			DEMO_HEADS,
		);
		expect(out.bump.moved).toBe(true);
		expect(out.bump.before).not.toBe(out.bump.after);
		expect(out.wave.items.length).toBeGreaterThan(0);
		expect(out.wave.items[0].layer).toBe("mirror");
		expect(out.wallCode).toBe(WALL_CODE);
		expect(out.wroteKernel).toBe(false);
	});
});
