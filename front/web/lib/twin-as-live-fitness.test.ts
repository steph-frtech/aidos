import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	DEMO_GREEN_PANELS,
	DEMO_RED_PANELS,
	DEMO_TWIN_NAMES,
	GREEN_FRONTIER_PATH,
	GREEN_FRONTIER_SOURCE,
	GREEN_TYPEONLY_PATH,
	GREEN_TYPEONLY_SOURCE,
	hashVerdict,
	parseImports,
	REASONS,
	RED_PANEL_PATH,
	RED_PANEL_SOURCE,
	RULE,
	scanPanel,
	sense,
	twinNamesFromLibDir,
} from "./twin-as-live-fitness";

// The front/web root (this file lives in front/web/lib/).
const WEB_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * Reproducibility mirror (vitest + fast-check): reflects=T5-cliquet-no-twin-as-live,
 * test_kind=property, cert_language=vitest, liveness=live.
 *
 * T5 — the cliquet anti-retour (ADR 0092). A panel
 * (app/<route>/*.tsx | actions.ts, or a components/*Panel a panel pulls) must
 * NOT produce displayed data via a twin-LOGIQUE lib (a `lib/<x>.ts` re-impl of
 * the Go, recognised by its `lib/<x>-data.ts` demo sibling) OUTSIDE the
 * demo-fallback frontier (readVia / callGateway / decodeVia → source:"demo").
 * The check is the REAL TypeScript compiler API AST pass — never an LLM judge,
 * never an ad-hoc prose check. The rule WELDS each cutover flip: a future step
 * cannot silently re-make a TS twin its live source again.
 *
 * Laws (the T5 done-criteria):
 *   L1 (RED) fault-injection — a panel value-importing a twin's LOGIC with NO
 *      demo-fallback frontier reds the sensor, naming the file + the twin;
 *   L2 (GREEN) the frontier path — a panel value-importing a twin only to build
 *      a demo fallback, ALSO importing readVia/Source from gateway-sdk, passes;
 *   L3 (GREEN) the type-only path — a panel importing a twin's TYPES only passes;
 *   L4 load-bearing — NEUTRALISING the rule (dropping the no-frontier gate) lets
 *      the RED case pass: the guard is the only thing standing between the twin
 *      and a live read (a dead guard would be a monster, §5);
 *   L5 determinism — same (panels, twins) → same verdict → same address, ∀;
 *   L6 closed reasons + the deterministic twin set from the lib listing.
 */

// ── L1 — the RED fault-injection (a twin read AS the live path) ──────────────
describe("T5 L1 — RED: a twin read as the live path reds the cliquet", () => {
	it("the injected twin-as-live panel reds the sensor, naming file + twin", () => {
		const v = sense(DEMO_RED_PANELS, DEMO_TWIN_NAMES);
		expect(v.state).toBe("red");
		const f = v.findings.find((x) => x.file === RED_PANEL_PATH);
		expect(f).toBeDefined();
		expect(f?.twin).toBe("@/lib/adoption");
		expect(f?.reason).toBe("twin_value_import_without_frontier");
	});

	it("scanPanel on the RED source alone yields exactly one finding", () => {
		const findings = scanPanel(
			RED_PANEL_PATH,
			RED_PANEL_SOURCE,
			DEMO_TWIN_NAMES,
		);
		expect(findings).toHaveLength(1);
		expect(findings[0].twin).toBe("@/lib/adoption");
	});
});

// ── L2 — the GREEN demo-fallback frontier (readVia + source:"demo") ──────────
describe("T5 L2 — GREEN: a twin behind the demo-fallback frontier passes", () => {
	it("a panel that value-imports the twin but ALSO imports readVia passes", () => {
		const findings = scanPanel(
			GREEN_FRONTIER_PATH,
			GREEN_FRONTIER_SOURCE,
			DEMO_TWIN_NAMES,
		);
		expect(findings).toHaveLength(0);
	});

	it("parseImports sees the value twin import AND the frontier", () => {
		const p = parseImports(GREEN_FRONTIER_SOURCE, DEMO_TWIN_NAMES);
		expect(p.twinValueImports.map((t) => t.twin)).toContain(
			"@/lib/context-pack",
		);
		expect(p.hasFrontier).toBe(true);
	});
});

// ── L3 — the GREEN type-only path (no runtime logic pulled) ──────────────────
describe("T5 L3 — GREEN: a type-only twin import passes", () => {
	it("`import type { … } from @/lib/<twin>` is not a live-path read", () => {
		const findings = scanPanel(
			GREEN_TYPEONLY_PATH,
			GREEN_TYPEONLY_SOURCE,
			DEMO_TWIN_NAMES,
		);
		expect(findings).toHaveLength(0);
	});

	it("the whole GREEN sandbox is green", () => {
		const v = sense(DEMO_GREEN_PANELS, DEMO_TWIN_NAMES);
		expect(v.state).toBe("green");
		expect(v.findings).toHaveLength(0);
	});

	it("an inline `import { type X }`-only twin import is not a value import", () => {
		const src = 'import { type AdoptionPlan } from "@/lib/adoption";\n';
		const p = parseImports(src, DEMO_TWIN_NAMES);
		expect(p.twinValueImports).toHaveLength(0);
	});
});

// ── L4 — LOAD-BEARING: neutralise the rule → the RED case passes ─────────────
describe("T5 L4 — the cliquet is load-bearing (neutralised → red passes)", () => {
	// A NEUTRALISED twin (its name removed from the twin set) is exactly the
	// rule made inert for that lib: the AST pass no longer recognises
	// `@/lib/adoption` as a twin, so the twin-as-live RED panel scans GREEN.
	// This proves the no-frontier gate is the ONLY thing standing between the
	// twin and a live read — a dead guard would be a monster (§5).
	it("removing the twin from the set lets the twin-as-live panel pass", () => {
		const neutralised = DEMO_TWIN_NAMES.filter((n) => n !== "adoption");
		const findings = scanPanel(RED_PANEL_PATH, RED_PANEL_SOURCE, neutralised);
		expect(findings).toHaveLength(0); // the guard is inert ⇒ the breach slips through
	});

	// And conversely: dropping the frontier from the GREEN frontier panel
	// (the mirror of "a future step deletes the readVia") reds it — the guard
	// catches the regression.
	it("dropping the frontier import from a green panel reds it", () => {
		const withoutFrontier = GREEN_FRONTIER_SOURCE.replace(
			'import { readVia, type Source } from "@/lib/gateway-sdk";\n',
			"",
		);
		// (the resulting source no longer compiles its body, but the import-only
		// AST pass still classifies: a twin value import with NO frontier ⇒ RED.)
		const p = parseImports(withoutFrontier, DEMO_TWIN_NAMES);
		expect(p.hasFrontier).toBe(false);
		const findings = scanPanel(
			GREEN_FRONTIER_PATH,
			withoutFrontier,
			DEMO_TWIN_NAMES,
		);
		expect(findings.length).toBeGreaterThan(0);
		expect(findings[0].twin).toBe("@/lib/context-pack");
	});
});

// ── L5 — determinism (same input → same verdict → same address, ∀) ───────────
describe("T5 L5 — determinism (reproducibility mirror)", () => {
	it("same (panels, twins) → identical verdict + address", () => {
		const a = sense(DEMO_RED_PANELS, DEMO_TWIN_NAMES);
		const b = sense(DEMO_RED_PANELS, DEMO_TWIN_NAMES);
		expect(hashVerdict(a)).toBe(hashVerdict(b));
		expect(a).toEqual(b);
	});

	it("∀ a frontier-less twin value import → RED; ∀ with-frontier → GREEN", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("adoption", "context-pack"),
				fc.boolean(),
				(twin, withFrontier) => {
					const frontier = withFrontier
						? 'import { readVia } from "@/lib/gateway-sdk";\n'
						: "";
					const src =
						`import { someFn } from "@/lib/${twin}";\n` +
						frontier +
						"export const x = 1;\n";
					const findings = scanPanel("app/p/page.tsx", src, DEMO_TWIN_NAMES);
					return withFrontier
						? findings.length === 0
						: findings.length === 1 && findings[0].twin === `@/lib/${twin}`;
				},
			),
		);
	});
});

// ── L6 — closed reasons + the deterministic twin set ─────────────────────────
describe("T5 L6 — closed reasons + the deterministic twin set", () => {
	it("the rule name + closed reason set are stable", () => {
		expect(RULE).toBe("NO_TWIN_AS_LIVE_PATH");
		expect([...REASONS]).toEqual(["twin_value_import_without_frontier"]);
		const v = sense(DEMO_RED_PANELS, DEMO_TWIN_NAMES);
		for (const f of v.findings) expect(REASONS).toContain(f.reason);
	});

	it("twinNamesFromLibDir derives a twin iff <x>.ts AND <x>-data.ts both exist", () => {
		const listing = [
			"adoption.ts",
			"adoption-data.ts", // ⇒ adoption is a twin
			"context-pack.ts",
			"context-pack-data.ts", // ⇒ context-pack is a twin
			"gateway-sdk.ts", // no -data sibling ⇒ not a twin (the live door itself)
			"panelScope.ts", // no -data sibling ⇒ not a twin
			"orphan-data.ts", // a fixture with NO <x>.ts ⇒ not a twin
		];
		expect(twinNamesFromLibDir(listing)).toEqual(["adoption", "context-pack"]);
	});

	it("a non-`@/lib/<x>` or deeper import is never a twin (e.g. @/lib/sub/x)", () => {
		const src =
			'import { f } from "@/lib/adoption/deep";\n' +
			'import { g } from "@/components/Foo";\n';
		const p = parseImports(src, DEMO_TWIN_NAMES);
		expect(p.twinValueImports).toHaveLength(0);
	});
});

// ── L7 — REALITY: the cliquet fires against the actual front/web tree ────────
// This is the load-bearing proof on REAL code (§5/§8 honesty): the twin set is
// derived from the real lib/ listing, the proven cutover panels scan GREEN, and
// a real pre-cutover twin-as-live panel (AdoptionPanel) scans RED. A future step
// that re-makes a TS twin a live source — or deletes a readVia from a cutover
// panel — reds this same pass.
describe("T5 L7 — reality: the rule classifies the real tree correctly", () => {
	const realTwins = twinNamesFromLibDir(readdirSync(join(WEB_ROOT, "lib")));

	it("the real twin set is the lib/<x>.ts + lib/<x>-data.ts pairs (non-empty)", () => {
		expect(realTwins.length).toBeGreaterThan(0);
		// the live door itself is NEVER a twin (it has no -data sibling).
		expect(realTwins).not.toContain("gateway-sdk");
		// the proven cutover twins ARE in the set.
		expect(realTwins).toContain("adoption");
		expect(realTwins).toContain("context-pack");
	});

	it("the PROVEN cutover panels scan GREEN (twin behind the demo frontier)", () => {
		for (const p of [
			"app/context-pack/actions.ts",
			"app/changeset/actions.ts",
		]) {
			const src = readFileSync(join(WEB_ROOT, p), "utf8");
			expect(scanPanel(p, src, realTwins)).toHaveLength(0);
		}
	});

	it("a REAL twin-as-live panel (AdoptionPanel) scans RED on the real tree", () => {
		const p = "components/AdoptionPanel.tsx";
		const src = readFileSync(join(WEB_ROOT, p), "utf8");
		const findings = scanPanel(p, src, realTwins);
		expect(findings.length).toBeGreaterThan(0);
		expect(findings.some((f) => f.twin === "@/lib/adoption")).toBe(true);
	});
});
