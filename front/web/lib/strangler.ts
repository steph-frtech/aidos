/**
 * The strangler-fig twin — the Workbench /strangler source (AIDOS S104, §50).
 *
 * The DECLARED projection of the Go package back/archive/strangler: the strangler-fig pattern
 * for absorbing a LEGACY system into the federation without a big-bang rewrite —
 *
 *   - carve   — draw a cell boundary around the legacy (S100 bounded context) and validate it
 *               is observable; refuse a legacy with no observed behaviour.
 *   - freeze  — auto-generate one CHARACTERIZATION mirror per observed (input → output) trace:
 *               a content-addressed fixture mirror pinning "whatever the legacy currently does"
 *               (bug-for-bug), tagged characterization so it is never confused with an intent
 *               mirror.
 *   - refactor — run the frozen characterization mirrors against the REFACTORED cell's observed
 *               behaviour; ACCEPT iff every mirror stays GREEN ∧ the published contract is
 *               honored; refuse a drift (STRANGLER_CHARACTERIZATION_DRIFT) or a broken contract
 *               (STRANGLER_PUBLISHED_CONTRACT_BROKEN).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every function is a PURE function of its input — no
 * clock, no rng, no I/O, no LLM. Characterization-mirror generation is DETERMINISTIC code
 * (observed traces → fixture mirrors), never an LLM "write some tests". The Go output is the
 * AUTHORITATIVE truth; this twin reproduces it for the screen so the panel shows a live,
 * deterministic result. The reproducibility mirror lib/strangler.test.ts (fast-check) pins
 * determinism + freeze-then-replay-is-green + any-drift-is-caught.
 *
 * READ-ONLY (the wall): /strangler CARVES, FREEZES and CHECKS; it never writes truth. The
 * StranglerCell + its characterization mirrors persist via ChangeSet (the mirrors schema is
 * above the line), never a direct write from the screen.
 */

export interface Trace {
	name: string;
	/** the input the legacy was given (an opaque value the strangler treats as a black box). */
	input: unknown;
	/** the output the legacy returned for that input. */
	output: unknown;
}

export interface Legacy {
	cell: string;
	internalNodes: string[];
	publishedContract?: string;
	observed: Trace[];
}

export interface StranglerCell {
	cell: string;
	internalNodes: string[];
	publishedContract?: string;
	observed: Trace[];
	hash: string;
}

export interface CharacterizationMirror {
	id: string;
	cell: string;
	scenario: string;
	input: unknown;
	expectedOutput: unknown;
	/** always true: this mirror was GENERATED from observed behaviour, not authored from intent. */
	characterization: true;
	/** always "fixture" — a characterization mirror is a state→output fixture. */
	testKind: "fixture";
}

export interface RefactorObservation {
	/** maps an observed scenario name to the output the REFACTORED cell returned. */
	outputs: Record<string, unknown>;
	/** whether the cell's published contract still verifies after the refactor. */
	contractHonored: boolean;
}

export interface MirrorVerdict {
	mirrorId: string;
	scenario: string;
	green: boolean;
	actualOutput?: unknown;
}

export interface BlockReason {
	code: string;
	message: string;
	howToFix: string[];
}

export interface RefactorVerdict {
	cell: string;
	mirrors: MirrorVerdict[];
	allGreen: boolean;
	contractHonored: boolean;
	accepted: boolean;
	block?: BlockReason;
}

export const CODE_NO_OBSERVED_BEHAVIOUR = "STRANGLER_NO_OBSERVED_BEHAVIOUR";
export const CODE_UNNAMED_CELL = "STRANGLER_UNNAMED_CELL";
export const CODE_CHARACTERIZATION_DRIFT = "STRANGLER_CHARACTERIZATION_DRIFT";
export const CODE_CONTRACT_BROKEN = "STRANGLER_PUBLISHED_CONTRACT_BROKEN";

/** canonical JSON: object keys sorted recursively, so byte-equality is order-insensitive. */
function canonical(v: unknown): string {
	if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
	if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
	const keys = Object.keys(v as Record<string, unknown>).sort();
	return `{${keys
		.map(
			(k) =>
				`${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`,
		)
		.join(",")}}`;
}

/** a tiny deterministic content hash (FNV-1a over the canonical bytes) — reproducible. */
function hash(v: unknown): string {
	const s = canonical(v);
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * carve draws the cell boundary around the legacy (§50): validates it is observable (≥1 trace)
 * and named, then returns a content-addressed StranglerCell with its nodes + traces sorted
 * canonically. Refuses a legacy with no observed behaviour or an unnamed cell.
 * PURE: same legacy ⇒ identical cell + hash.
 */
export function carve(l: Legacy): { cell?: StranglerCell; error?: string } {
	if (!l.cell) return { error: CODE_UNNAMED_CELL };
	if (l.observed.length === 0) return { error: CODE_NO_OBSERVED_BEHAVIOUR };
	const internalNodes = [...l.internalNodes].sort();
	const observed = [...l.observed].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	const base = {
		cell: l.cell,
		internalNodes,
		publishedContract: l.publishedContract,
		observed,
	};
	return { cell: { ...base, hash: hash(base) } };
}

/**
 * freeze auto-generates the characterization mirrors of a carved cell (§50): one fixture mirror
 * per observed trace, each content-addressed and tagged characterization. Returned sorted by
 * scenario. DETERMINISTIC code, never an LLM. Same cell ⇒ identical mirror set.
 */
export function freeze(sc: StranglerCell): CharacterizationMirror[] {
	return sc.observed
		.map((t) => {
			const body = {
				cell: sc.cell,
				scenario: t.name,
				input: t.input,
				expectedOutput: t.output,
				characterization: true,
				testKind: "fixture",
			};
			return {
				id: hash(body),
				cell: sc.cell,
				scenario: t.name,
				input: t.input,
				expectedOutput: t.output,
				characterization: true as const,
				testKind: "fixture" as const,
			};
		})
		.sort((a, b) =>
			a.scenario < b.scenario ? -1 : a.scenario > b.scenario ? 1 : 0,
		);
}

/**
 * refactor runs the frozen characterization mirrors against a refactored cell's observed
 * behaviour (§50): every mirror is GREEN iff the refactor returned the SAME output (canonical
 * byte-equal) for the frozen input, and the published contract must stay honored. A diverging
 * or missing output reddens its mirror (drift); a broken contract refuses the refactor. The
 * refactor is ACCEPTED iff every mirror stayed green AND the contract is honored.
 * PURE: same inputs ⇒ same verdict. WRITES NOTHING (the wall).
 */
export function refactor(
	sc: StranglerCell,
	mirrors: CharacterizationMirror[],
	obs: RefactorObservation,
): RefactorVerdict {
	const contractHonored = sc.publishedContract ? obs.contractHonored : true;
	let allGreen = true;
	const verdicts: MirrorVerdict[] = mirrors
		.map((m) => {
			const present = Object.hasOwn(obs.outputs, m.scenario);
			const actual = obs.outputs[m.scenario];
			const green =
				present && canonical(m.expectedOutput) === canonical(actual);
			if (!green) allGreen = false;
			return {
				mirrorId: m.id,
				scenario: m.scenario,
				green,
				...(present ? { actualOutput: actual } : {}),
			};
		})
		.sort((a, b) =>
			a.scenario < b.scenario ? -1 : a.scenario > b.scenario ? 1 : 0,
		);

	const accepted = allGreen && contractHonored;
	const v: RefactorVerdict = {
		cell: sc.cell,
		mirrors: verdicts,
		allGreen,
		contractHonored,
		accepted,
	};
	if (!accepted) {
		if (!allGreen) {
			const drifted = verdicts.filter((m) => !m.green).map((m) => m.scenario);
			v.block = {
				code: CODE_CHARACTERIZATION_DRIFT,
				message: `refactor of cell "${sc.cell}" changed observable behaviour: ${drifted.length} characterization mirror(s) went red (${drifted.join(", ")}) — a refactor must preserve behaviour exactly (§50)`,
				howToFix: [
					"restore the frozen behaviour: make the refactored cell return the SAME output for each frozen input",
					"or, if the change is INTENDED, open a new INTENT mirror through idea→mirror→/goal — never edit a characterization mirror to make it pass",
				],
			};
		} else {
			v.block = {
				code: CODE_CONTRACT_BROKEN,
				message: `refactor of cell "${sc.cell}" broke its published contract "${sc.publishedContract}" — the fig must keep honoring the contract the rest of the federation depends on`,
				howToFix: [
					"restore the published contract: the refactored cell must still satisfy the Pact contract its neighbors consume (S101)",
					"or re-negotiate the contract through the Context-Map (S101) before changing the published surface",
				],
			};
		}
	}
	return v;
}

/** The canonical S104 demo legacy: a "billing" cell carved out of a monolith, observed over
 *  three input→output traces, publishing a contract its neighbours consume. */
export const DEMO_LEGACY: Legacy = {
	cell: "billing",
	internalNodes: ["billing.invoice", "billing.tax", "billing.legacy_calc"],
	publishedContract: "billing.charge.v1",
	observed: [
		{
			name: "charge in-currency",
			input: { amount: 100, currency: "EUR" },
			output: { charged: 100, fee: 0 },
		},
		{
			name: "charge cross-currency",
			input: { amount: 100, currency: "USD" },
			output: { charged: 92, fee: 3 },
		},
		{
			name: "charge zero",
			input: { amount: 0, currency: "EUR" },
			output: { charged: 0, fee: 0 },
		},
	],
};

/** The behaviour a no-op (behaviour-preserving) refactor observes — same outputs, contract honored. */
export const DEMO_PRESERVING: RefactorObservation = {
	outputs: {
		"charge in-currency": { fee: 0, charged: 100 },
		"charge cross-currency": { fee: 3, charged: 92 },
		"charge zero": { fee: 0, charged: 0 },
	},
	contractHonored: true,
};

/** The behaviour a DRIFTING refactor observes — the cross-currency fee was dropped (a behaviour change). */
export const DEMO_DRIFTING: RefactorObservation = {
	outputs: {
		"charge in-currency": { charged: 100, fee: 0 },
		"charge cross-currency": { charged: 92, fee: 0 },
		"charge zero": { charged: 0, fee: 0 },
	},
	contractHonored: true,
};
