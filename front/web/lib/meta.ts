// Determinism-first twin of back/hooks/sessionstart/selftest.Run (KRD §70). This is a
// PURE function of the harness scenario — no clock, no rng, no I/O — so /meta can
// re-run the meta-meta self-test on a selected scenario and render the EXACT verdict
// the Go runner computes. The three guarantees (sensors fire, wall holds, fitness
// unchanged) and the three BlockReason codes mirror the Go package; fast-check
// (lib/meta.test.ts) pins the twin's invariants against the Go fixtures.
//
// READ-ONLY on the fitness (the wall, CLAUDE.md §2): the twin only reads the rows it
// is given and content-hashes them; it never authors the fitness, the sensors, or the
// wall — it PROBES the scenario, exactly like the Go self-test.

export type Verdict = "green" | "red";

export const PROTECTED_SCHEMAS = ["kernel", "mirrors", "fitness"] as const;
export type ProtectedSchema = (typeof PROTECTED_SCHEMAS)[number];

export type SelfTestCode = "MUTED_SENSOR" | "WALL_BREACHED" | "FITNESS_MUTATED";

export interface BlockReason {
	code: SelfTestCode;
	severity: "blocking";
	explanation: string;
	howToFix: string[];
}

export interface SensorProbe {
	sensorId: string;
	injectedFault: string;
	fired: boolean;
}

export interface WallAttempt {
	schema: ProtectedSchema;
	attemptedWrite: string;
	refused: boolean;
}

export interface FitnessProbe {
	baselineHash: string;
	currentHash: string;
	unchanged: boolean;
}

export interface SelfTestReport {
	sensorsChecked: SensorProbe[];
	wallProbe: { attempts: WallAttempt[] };
	fitnessProbe: FitnessProbe;
	verdict: Verdict;
	at: string;
}

// A Harness scenario: the per-faculty inputs the twin probes (mirrors the Go fakeHarness).
export interface Harness {
	sensors: string[];
	mutedSensors: string[];
	breachedSchemas: ProtectedSchema[];
	fitnessRows: string; // the canonical fitness body (string form, hashed)
	baselineHash: string;
}

export const CANONICAL_SENSORS = [
	"gofmt",
	"vet",
	"lint",
	"archtest",
	"affected",
] as const;

// fauxHash is a deterministic content-hash twin used ONLY for the UI re-run preview.
// It is NOT the SHA-256 the Go side uses; it is a stable string function so the panel
// can show "baseline == current" vs "mutated" deterministically without crypto in the
// browser. The Go runner is authoritative for the real hash.
export function fauxHash(rows: string): string {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < rows.length; i++) {
		h ^= rows.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return `fnv1a-${h.toString(16).padStart(8, "0")}`;
}

function allSensorsFired(report: SelfTestReport): boolean {
	if (report.sensorsChecked.length === 0) return false;
	return report.sensorsChecked.every((s) => s.fired);
}

function allRefused(attempts: WallAttempt[]): boolean {
	if (attempts.length === 0) return false;
	return attempts.every((a) => a.refused);
}

function join(xs: string[]): string {
	return xs.join(", ");
}

function mutedSensorBlockReason(report: SelfTestReport): BlockReason {
	const muted = report.sensorsChecked
		.filter((s) => !s.fired)
		.map((s) => s.sensorId);
	const explanation =
		muted.length === 0
			? "Self-test méta-méta (KRD §70) : l'inventaire des capteurs est vide — on ne peut pas prouver que les capteurs se déclenchent."
			: `Self-test méta-méta (KRD §70) : un garde-fou a été RETIRÉ — capteur(s) muet(s) : ${join(muted)}. La boucle méta peut AJOUTER un garde-fou, jamais en RETIRER un.`;
	return {
		code: "MUTED_SENSOR",
		severity: "blocking",
		explanation,
		howToFix: [
			"revive_sensor : réparez ou re-câblez le capteur muet — il doit virer au rouge sur sa faute injectée.",
			"add_never_remove : restaurez le garde-fou retiré (KRD §70).",
			"rerun /self-test : rejouez le self-test.",
		],
	};
}

function wallBreachedBlockReason(report: SelfTestReport): BlockReason {
	const breached = report.wallProbe.attempts
		.filter((a) => !a.refused)
		.map((a) => a.schema);
	return {
		code: "WALL_BREACHED",
		severity: "blocking",
		explanation: `Self-test méta-méta (KRD §70) : le MUR ne tient plus — une écriture de l'agent au-dessus de la ligne (${join(breached)}) a été ACCEPTÉE.`,
		howToFix: [
			"restore_grants : ré-appliquez les GRANTs du mur (S04).",
			"check_pretooluse : vérifiez que le hook PreToolUse refuse l'écriture above-the-line.",
			"rerun /self-test : rejouez le self-test.",
		],
	};
}

function fitnessMutatedBlockReason(report: SelfTestReport): BlockReason {
	return {
		code: "FITNESS_MUTATED",
		severity: "blocking",
		explanation: `Self-test méta-méta (KRD §70, le péché cardinal) : la FITNESS a été MODIFIÉE — le hash recalculé (${report.fitnessProbe.currentHash}) diffère de la baseline gravée (${report.fitnessProbe.baselineHash}). Le NIVEAU 3 est INVIOLABLE.`,
		howToFix: [
			"revert_fitness : restaurez le schéma fitness à sa baseline gravée (KRD §70).",
			"trace_the_edit : retrouvez le ChangeSet qui a touché la fitness (décision humaine enregistrée).",
			"rerun /self-test : rejouez le self-test.",
		],
	};
}

// run is the byte-faithful twin of selftest.Run: a pure function of (harness, at) that
// computes the three guarantees and returns a green report or a red report + BlockReason.
export function run(
	h: Harness,
	at: string,
): { report: SelfTestReport; block: BlockReason | null } {
	const sensors: SensorProbe[] = h.sensors.map((id) => ({
		sensorId: id,
		injectedFault: `redden ${id}: forbidden import injected`,
		fired: !h.mutedSensors.includes(id),
	}));
	sensors.sort((a, b) =>
		a.sensorId < b.sensorId ? -1 : a.sensorId > b.sensorId ? 1 : 0,
	);

	const attempts: WallAttempt[] = PROTECTED_SCHEMAS.map((schema) => ({
		schema,
		attemptedWrite: `INSERT into ${schema}.* as aidos_agent`,
		refused: !h.breachedSchemas.includes(schema),
	}));

	const currentHash = fauxHash(h.fitnessRows);
	const fitnessProbe: FitnessProbe = {
		baselineHash: h.baselineHash,
		currentHash,
		unchanged: currentHash === h.baselineHash,
	};

	const report: SelfTestReport = {
		sensorsChecked: sensors,
		wallProbe: { attempts },
		fitnessProbe,
		verdict: "green",
		at,
	};

	if (!allSensorsFired(report)) {
		report.verdict = "red";
		return { report, block: mutedSensorBlockReason(report) };
	}
	if (!allRefused(attempts)) {
		report.verdict = "red";
		return { report, block: wallBreachedBlockReason(report) };
	}
	if (!fitnessProbe.unchanged) {
		report.verdict = "red";
		return { report, block: fitnessMutatedBlockReason(report) };
	}
	report.verdict = "green";
	return { report, block: null };
}

export function sensorsFired(report: SelfTestReport): number {
	return report.sensorsChecked.filter((s) => s.fired).length;
}
