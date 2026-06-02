/**
 * The sensors — the Workbench /sensors projection source (AIDOS step S07).
 *
 * THE FEEDBACK WALL (CLAUDE.md §6, KRD §74: "PostToolUse = les sensors"): after
 * each agent diff below the waterline the PostToolUse Go hook
 * (back/hooks/posttooluse) resolves the CHANGED CODE set, runs the computational
 * sensor suite — gofmt, vet, lint, archtest, affected — and emits a verdict:
 * `block` on any failing check (BlockReason, code SENSOR_FAILED), `allow` on all
 * green. Every run is recorded append-only in runtime.sensor_runs.
 *
 * This module holds only the DECLARED, static description of that suite — the
 * canonical check list (field-for-field with adapters.go's CanonicalChecks), a
 * representative latest run, and a representative SENSOR_FAILED block event — so
 * the /sensors panel shows exactly what the Go hook runs and the refusal it emits.
 * One source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): a static, declared registry (no clock, no
 * rng, no I/O). It mirrors the Go suite's order and codes; the reproducibility
 * mirror lib/sensors.test.ts pins the check set, the canonical code, and the
 * pure verdict (aggregate ⇒ block iff any check failed).
 *
 * READ-ONLY: /sensors is a visualization; it projects runtime.sensor_runs, it does
 * not re-encode it. It writes no truth and exposes no capability — the sensors are
 * enforced by the harness-invoked PostToolUse hook, never from a screen.
 * ui-completeness is vacuously satisfied: there is no headless capability hidden
 * here, there is none (the rerun-on-demand MCP is OQ-S07-1, not built yet).
 */

/** The one block code the PostToolUse sensors emit (matches sensors.go). */
export const SENSOR_FAILED = "SENSOR_FAILED" as const;

/** The two verdicts — there is no third (matches sensors.go / the DB CHECK). */
export type Verdict = "allow" | "block";

/**
 * One computational sensor in the suite. `slot` is the KRD §74 role it fills
 * (typecheck/format → lint → archtest → affected); `tool` names the frozen Go
 * tool the adapter invokes (it never reimplements it).
 */
export interface Sensor {
	/** The check name, as recorded in sensor_runs (matches CanonicalChecks). */
	name: string;
	/** The KRD §74 role this check fills. */
	slot: string;
	/** The frozen Go tool the adapter invokes. */
	tool: string;
	/** One-line role in AIDOS terms (FR-first per ADR 0011). */
	role: string;
}

/**
 * The computational sensor suite, in KRD §74 order (typecheck/format → lint →
 * archtest → affected). Mirrors adapters.go `CanonicalChecks`
 * = ["gofmt","vet","lint","archtest","affected"] field-for-field.
 */
export const SENSOR_SUITE: readonly Sensor[] = [
	{
		name: "gofmt",
		slot: "typecheck / format",
		tool: "gofmt -l",
		role: "le code changé est-il au format canonique ? Une liste non vide (gofmt -l) est un échec.",
	},
	{
		name: "vet",
		slot: "typecheck",
		tool: "go vet",
		role: "vet statique sur les paquets affectés — les pièges que le compilateur tolère mais que vet refuse.",
	},
	{
		name: "lint",
		slot: "lint",
		tool: "go build",
		role: "porte Go-strict : compile les paquets affectés (go-arch-lint/depguard pour un lint riche = OQ-S07-2).",
	},
	{
		name: "archtest",
		slot: "archtest",
		tool: "boundary check (in-process)",
		role: "une projection sous la ligne ne doit jamais importer l'arbre de vérité back/kernel/** (ADR 0002/0014).",
	},
	{
		name: "affected",
		slot: "run-mirrors --affected",
		tool: "go test",
		role: "les tests / miroirs affectés (go test sur les paquets changés) — la preuve exécutable reste verte.",
	},
] as const;

/** One sensor's outcome in a recorded run (projects a sensor_check_results row). */
export interface CheckResult {
	name: string;
	pass: boolean;
	/** An errored check (crashed / missing) is a FAILURE made explicit (KRD §82). */
	errored?: boolean;
	durationMs: number;
}

/** The shared actionable-refusal shape (matches sensors.go BlockReason). */
export interface BlockReason {
	code: typeof SENSOR_FAILED;
	severity: "error";
	explanation: string;
	howToFix: readonly string[];
}

/** A recorded sensor run (projects a runtime.sensor_runs row + its children). */
export interface SensorRun {
	runId: string;
	/** The changed-code set the run scoped to (the affected packages / files). */
	target: string;
	verdict: Verdict;
	results: readonly CheckResult[];
	/** Present iff verdict === "block". */
	blockReason?: BlockReason;
}

/**
 * Aggregate — the pure heart of on_fail:block, mirroring sensors.go `Aggregate`:
 * block IFF at least one check failed, allow otherwise. A check is failing iff
 * `!pass` (an errored check has pass=false, so it counts — never silently
 * dropped). The reproducibility mirror (lib/sensors.test.ts) pins it against the
 * Go invariant: same results → same verdict, exactly the failing subset.
 */
export function aggregate(results: readonly CheckResult[]): {
	verdict: Verdict;
	failing: string[];
} {
	const failing = results.filter((r) => !r.pass).map((r) => r.name);
	return { verdict: failing.length === 0 ? "allow" : "block", failing };
}

/**
 * A representative LATEST run — all sensors green, verdict allow. Shaped like a
 * real sensor_runs projection (the panel reads the table; this is the seeded
 * sample so /sensors renders before live wiring lands, OQ-S07-3).
 */
export const SAMPLE_LATEST_RUN: SensorRun = {
	runId: "run-0007-clean",
	target: "back/hooks/posttooluse (paquet changé)",
	verdict: "allow",
	results: [
		{ name: "gofmt", pass: true, durationMs: 12 },
		{ name: "vet", pass: true, durationMs: 188 },
		{ name: "lint", pass: true, durationMs: 240 },
		{ name: "archtest", pass: true, durationMs: 3 },
		{ name: "affected", pass: true, durationMs: 1024 },
	],
} as const;

/**
 * A representative SENSOR_FAILED block event — the BlockReason the PostToolUse
 * hook returns when a sensor goes red on the changed code. Verbatim-shaped from
 * sensorFailedBlockReason in sensors.go, so the panel shows a true refusal, not an
 * invented one. The how_to_fix always names how to make the diff green again.
 */
export const SAMPLE_BLOCK_EVENT: SensorRun = {
	runId: "run-0006-affected-red",
	target: "back/hooks/posttooluse (paquet changé)",
	verdict: "block",
	results: [
		{ name: "gofmt", pass: true, durationMs: 11 },
		{ name: "vet", pass: true, durationMs: 176 },
		{ name: "lint", pass: true, durationMs: 233 },
		{ name: "archtest", pass: true, durationMs: 3 },
		{ name: "affected", pass: false, durationMs: 842 },
	],
	blockReason: {
		code: SENSOR_FAILED,
		severity: "error",
		explanation:
			"Sensor en échec sur le code changé : « affected ». L'agent ne s'auto-certifie que sur le computationnel ; le diff est bloqué tant qu'un capteur est rouge (on_fail: block, KRD §74). Sortie : go test failed: --- FAIL: TestAggregate_BlocksOnAnyFailure (0.00s).",
		howToFix: [
			"Reproduisez localement le capteur fautif sur le paquet changé (gofmt -l / go vet / go test).",
			"Inspectez le BlockReason avec `aidos explain SENSOR_FAILED` et la route Workbench /sensors.",
			"Réparez le diff (red→green) avant le prochain tool-call ; le mur de feedback tient tant que le capteur reste rouge.",
		],
	},
} as const;

/** Fresh copy of the sensor suite, in canonical order. */
export function sensorSuite(): Sensor[] {
	return SENSOR_SUITE.map((s) => ({ ...s }));
}
