/**
 * The completeness law — the Workbench /mirror-health projection source (AIDOS
 * step S06, AIDOS Mirror plane).
 *
 * THE BICEPHALOUS BODY (KRD §29, §33, §34): a Mirror is the proof head of a truth
 * (a kernel layer). This module holds a PURE port of the Go completeness core
 * (back/kernel/mirror/records/records.go: NoTruthWithoutMirror / NoOrphanMirror /
 * ComputeCompleteness) plus a DECLARED demo cut, so the /mirror-health panel shows
 * exactly what the Go predicates compute. One decision, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6): computeCompleteness is a pure total function —
 * same input → same output, monster set sorted. The reproducibility mirror
 * lib/mirror-health.test.ts pins it field-for-field against the Go core's cases.
 *
 * THE WALL (CLAUDE.md §2): the panel READS a projection of mirrors ⋈ kernel and
 * computes the monster set; it writes NOTHING (mirrors is above the waterline).
 */

/** The required test_kind per kernel `kind` — READ from KRD §90, never invented. */
export const REQUIRED_TEST_KINDS: Readonly<Record<string, readonly string[]>> =
	{
		entity: ["schema"],
		policy: ["property"],
		operation: ["fixture"],
		view: ["e2e"],
		control: ["fixture"],
		action: ["fixture"],
		api: ["contract"],
		db: ["snapshot"],
		types: ["schema"],
		"ui-web": ["unit"],
		"ui-mobile": ["unit"],
	} as const;

/** cert_languages executable as a deterministic sensor (KRD §91, §805). Declared. */
const EXECUTABLE_CERT_LANGS = new Set([
	"gherkin",
	"xstate",
	"fast-check",
	"rapid",
	"zod",
	"pact",
	"type-check",
	"k6",
	"fixture",
	"snapshot",
	"unit",
]);
// "prose" is intentionally absent → not executable → does not count.

export function isExecutable(certLanguage: string): boolean {
	return EXECUTABLE_CERT_LANGS.has(certLanguage);
}

/** A content-addressed reference to a kernel layer @version (the `mirrors` link). */
export interface LayerRef {
	layerId: string;
	version: string;
}

/** The minimal read-model of a kernel layer the completeness join needs. */
export interface Layer {
	layerId: string;
	version: string;
	kind: string;
}

/** The typed Mirror record — the five KRD §34 fields + its content address. */
export interface Mirror {
	mirrorId: string;
	reflects: LayerRef;
	testKind: string;
	certLanguage: string;
	authority: "above" | "below";
	liveness: "alive" | "dead";
	contentHash: string;
}

/** A mirror counts toward completeness iff alive AND its cert_language executes. */
export function isLiving(m: Mirror): boolean {
	return m.liveness === "alive" && isExecutable(m.certLanguage);
}

export type MonsterReason = "no_truth_without_mirror" | "no_orphan_mirror";

/** One violation of the completeness law (KRD LIVRE XXII). */
export interface Monster {
	reason: MonsterReason;
	layerId?: string;
	version?: string;
	kind?: string;
	missingTestKind?: string;
	mirrorId?: string;
}

export type Verdict = "COMPLETE" | "RED_MONSTER";

export interface Completeness {
	verdict: Verdict;
	monsters: Monster[];
}

const refKey = (r: LayerRef) => `${r.layerId}@${r.version}`;

/** no_orphan_mirror: every mirror whose reflects target is absent from the cut. */
export function noOrphanMirror(mirrors: Mirror[], layers: Layer[]): Monster[] {
	const live = new Set(layers.map((l) => refKey(l)));
	const out: Monster[] = [];
	for (const m of mirrors) {
		if (!live.has(refKey(m.reflects))) {
			out.push({
				reason: "no_orphan_mirror",
				mirrorId: m.mirrorId,
				layerId: m.reflects.layerId,
				version: m.reflects.version,
			});
		}
	}
	out.sort((a, b) => (a.mirrorId ?? "").localeCompare(b.mirrorId ?? ""));
	return out;
}

/** no_truth_without_mirror: every layer lacking a living mirror of a required kind. */
export function noTruthWithoutMirror(
	mirrors: Mirror[],
	layers: Layer[],
): Monster[] {
	const living = new Map<string, Set<string>>();
	for (const m of mirrors) {
		if (!isLiving(m)) continue;
		const k = refKey(m.reflects);
		const set = living.get(k) ?? new Set<string>();
		set.add(m.testKind);
		living.set(k, set);
	}
	const out: Monster[] = [];
	for (const l of layers) {
		const present = living.get(refKey(l)) ?? new Set<string>();
		const required = REQUIRED_TEST_KINDS[l.kind] ?? [];
		if (required.length === 0) {
			if (present.size === 0) {
				out.push({
					reason: "no_truth_without_mirror",
					layerId: l.layerId,
					version: l.version,
					kind: l.kind,
				});
			}
			continue;
		}
		for (const tk of required) {
			if (!present.has(tk)) {
				out.push({
					reason: "no_truth_without_mirror",
					layerId: l.layerId,
					version: l.version,
					kind: l.kind,
					missingTestKind: tk,
				});
			}
		}
	}
	out.sort((a, b) => {
		const byLayer = (a.layerId ?? "").localeCompare(b.layerId ?? "");
		if (byLayer !== 0) return byLayer;
		return (a.missingTestKind ?? "").localeCompare(b.missingTestKind ?? "");
	});
	return out;
}

/** computeCompleteness: the whole law in one pure call. Port of Go ComputeCompleteness. */
export function computeCompleteness(
	mirrors: Mirror[],
	layers: Layer[],
): Completeness {
	const monsters = [
		...noTruthWithoutMirror(mirrors, layers),
		...noOrphanMirror(mirrors, layers),
	];
	return {
		verdict: monsters.length === 0 ? "COMPLETE" : "RED_MONSTER",
		monsters,
	};
}

// ── The declared demo cut (no clock, no rng, no I/O) ─────────────────────────

/** The kernel layers in the demo cut — the bicephalous bodies S06 inventories. */
export const DEMO_LAYERS: readonly Layer[] = [
	{ layerId: "checkout-button", version: "v1", kind: "control" },
	{ layerId: "place-order", version: "v1", kind: "operation" },
	{ layerId: "order", version: "v1", kind: "entity" },
	{ layerId: "cart-view", version: "v1", kind: "view" },
	{ layerId: "pricing-policy", version: "v1", kind: "policy" },
] as const;

/** The typed mirror inventory in the demo cut. */
export const DEMO_MIRRORS: readonly Mirror[] = [
	{
		mirrorId: "checkout-button.fixture",
		reflects: { layerId: "checkout-button", version: "v1" },
		testKind: "fixture",
		certLanguage: "fixture",
		authority: "above",
		liveness: "alive",
		contentHash: "a1c0",
	},
	{
		mirrorId: "place-order.fixture",
		reflects: { layerId: "place-order", version: "v1" },
		testKind: "fixture",
		certLanguage: "xstate",
		authority: "above",
		liveness: "alive",
		contentHash: "b2d1",
	},
	{
		mirrorId: "order.schema",
		reflects: { layerId: "order", version: "v1" },
		testKind: "schema",
		certLanguage: "zod",
		authority: "above",
		liveness: "alive",
		contentHash: "c3e2",
	},
	{
		mirrorId: "cart-view.e2e",
		reflects: { layerId: "cart-view", version: "v1" },
		testKind: "e2e",
		certLanguage: "gherkin",
		authority: "above",
		liveness: "alive",
		contentHash: "d4f3",
	},
	// pricing-policy has NO living mirror → a no_truth_without_mirror monster.
	// An orphan mirror reflecting a superseded @version → a no_orphan_mirror monster.
	{
		mirrorId: "old-pricing.property",
		reflects: { layerId: "pricing-policy", version: "v0" },
		testKind: "property",
		certLanguage: "fast-check",
		authority: "above",
		liveness: "alive",
		contentHash: "e5a4",
	},
] as const;

/** The two declared scenarios the /mirror-health control toggles between. */
export type Scenario = "monster" | "complete";

/** mirrorsFor returns the typed mirror set for a declared scenario. */
export function mirrorsFor(scenario: Scenario): Mirror[] {
	if (scenario === "complete") {
		// Add the missing pricing-policy property mirror and re-point the orphan.
		return [
			...DEMO_MIRRORS.filter((m) => m.mirrorId !== "old-pricing.property"),
			{
				mirrorId: "pricing-policy.property",
				reflects: { layerId: "pricing-policy", version: "v1" },
				testKind: "property",
				certLanguage: "fast-check",
				authority: "above",
				liveness: "alive",
				contentHash: "f6b5",
			},
		];
	}
	return [...DEMO_MIRRORS];
}

/** A read-model row for the inventory table (typed by the five §34 fields). */
export interface MirrorInventoryRow extends Mirror {
	living: boolean;
}

/** inventoryFor decorates a scenario's mirrors with their living verdict. */
export function inventoryFor(scenario: Scenario): MirrorInventoryRow[] {
	return mirrorsFor(scenario).map((m) => ({ ...m, living: isLiving(m) }));
}
