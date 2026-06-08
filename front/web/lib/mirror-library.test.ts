import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	DEMO_LIBRARY,
	hasMonster,
	type Library,
	listByApp,
	scopedCompleteness,
	scopeTo,
} from "./mirror-library";

// The reproducibility mirror of S70 — it mirrors the Go property test verbatim:
// (1) the project-scoped monster detector FIRES inside the project where a monster
// is injected, and ONLY there; (2) scopeTo / scopedCompleteness are reproducible
// and never leak a sibling project.

describe("S70 — project-scoped monster detection (fault-injection)", () => {
	it("the scoped detector fires for the monstered app, not its sibling", () => {
		// app-shop is COMPLETE; app-blog carries the two injected monsters.
		expect(scopedCompleteness(DEMO_LIBRARY, "app-shop").verdict).toBe(
			"COMPLETE",
		);
		expect(hasMonster(DEMO_LIBRARY, "app-shop")).toBe(false);

		const blog = scopedCompleteness(DEMO_LIBRARY, "app-blog");
		expect(blog.verdict).toBe("RED_MONSTER");
		expect(hasMonster(DEMO_LIBRARY, "app-blog")).toBe(true);
		// no_truth_without_mirror (Blog.Post) AND no_orphan_mirror (cross-project).
		const reasons = blog.monsters.map((m) => m.reason).sort();
		expect(reasons).toContain("no_truth_without_mirror");
		expect(reasons).toContain("no_orphan_mirror");
	});

	it("scope changes the verdict — a cross-project reflect is an orphan within scope", () => {
		// the cross-project mirror is an orphan ONLY because Shop.Order is invisible
		// inside app-blog's cut.
		const blog = scopedCompleteness(DEMO_LIBRARY, "app-blog");
		const orphan = blog.monsters.find(
			(m) =>
				m.reason === "no_orphan_mirror" && m.mirrorId === "blog.cross.schema",
		);
		expect(orphan).toBeDefined();
	});
});

describe("S70 — listByApp", () => {
	it("groups mirrors by app with liveness tallies, sorted", () => {
		const apps = listByApp(DEMO_LIBRARY);
		expect(apps.map((a) => a.project)).toEqual(["app-blog", "app-shop"]);
		const shop = apps.find((a) => a.project === "app-shop");
		expect(shop?.alive).toBe(2);
		expect(shop?.dead).toBe(0);
	});
});

describe("S70 — determinism + isolation", () => {
	const projects = ["app-shop", "app-blog", "app-other"];
	const ids = ["X", "Y", "Z"];
	const kinds = ["entity", "policy", "operation", "view"];

	const libArb: fc.Arbitrary<Library> = fc.record({
		layers: fc.array(
			fc.record({
				project: fc.constantFrom(...projects),
				layer: fc.record({
					layerId: fc.constantFrom(...ids),
					version: fc.constant("v1"),
					kind: fc.constantFrom(...kinds),
				}),
			}),
			{ maxLength: 5 },
		),
		mirrors: fc.array(
			fc.record({
				project: fc.constantFrom(...projects),
				mirror: fc.record({
					mirrorId: fc.constantFrom("m1", "m2", "m3"),
					reflects: fc.record({
						layerId: fc.constantFrom(...ids),
						version: fc.constant("v1"),
					}),
					testKind: fc.constantFrom("schema", "property", "fixture", "e2e"),
					certLanguage: fc.constantFrom("zod", "rapid", "fixture", "prose"),
					authority: fc.constant("above" as const),
					liveness: fc.constant("alive" as const),
					contentHash: fc.constant("h"),
				}),
			}),
			{ maxLength: 5 },
		),
	});

	it("scopedCompleteness is reproducible (same input → same output)", () => {
		fc.assert(
			fc.property(libArb, fc.constantFrom(...projects), (lib, p) => {
				expect(scopedCompleteness(lib, p)).toEqual(scopedCompleteness(lib, p));
			}),
		);
	});

	it("scope never leaks a sibling project's rows", () => {
		fc.assert(
			fc.property(libArb, fc.constantFrom(...projects), (lib, p) => {
				const cut = scopeTo(lib, p);
				expect(cut.project).toBe(p);
				const ownLayers = new Set(
					lib.layers
						.filter((pl) => pl.project === p)
						.map(
							(pl) =>
								`${pl.layer.layerId} ${pl.layer.version} ${pl.layer.kind}`,
						),
				);
				for (const l of cut.layers) {
					expect(ownLayers.has(`${l.layerId} ${l.version} ${l.kind}`)).toBe(
						true,
					);
				}
			}),
		);
	});
});
