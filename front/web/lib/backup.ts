/**
 * The backup twin — the Workbench /app-ops source (AIDOS step DP31, piste DP, EPIC G).
 *
 * The PURE projection of the Go package back/runtime/backup (backup.go): the SAME
 * deterministic DATA-backup of an emitted app — its named bind volumes (${APP_DATA_PATH})
 * AND its datastore (a Postgres dump / a Doltgres snapshot, non-prod) — planned + realised
 * as an ASYNC, SCHEDULED job on an INJECTED clock, producing a content-addressed RESTORABLE
 * artefact scoped to a project_id, restored round-trip WITHOUT LOSS, with a fail-closed
 * NO-SECRET-IN-CLEAR gate (S91 ScanEmission) and per-project ISOLATION (DP15).
 *
 * DISTINCT FROM THE ROLLBACK (DP28). The backup protects the DATA; the rollback-by-phase
 * re-emits the CODE. This twin never touches a phase/changeset — it snapshots + restores
 * bytes.
 *
 * THE DONE-CRITERIA (DP31), each DETERMINISTIC and reproduced byte-for-byte from the Go:
 *   - PLANNED: realizeBackup ticks the scheduler on an INJECTED clock (the `now` arg —
 *     never Date.now): before the echeance it fires nothing; at/after it mints a RESTORABLE
 *     artefact and dispatches a "backup taken" notification through the outbox idempotency
 *     key (a replay never doubles the event);
 *   - ROUND-TRIP: restoreBackup(artifact) reconstructs the EXACT projectState that was
 *     backed up (stateEqual ⇒ no loss) AND records the restoration as an append-only,
 *     content-addressed restoreDecision;
 *   - NO-SECRET-IN-CLEAR: the artefact carries NO secret in the clear — the S91
 *     secret-store scan is the GATE; a leaking state makes realizeBackup FAIL CLOSED
 *     (no leaking artefact is ever minted), a clean state scans green;
 *   - ISOLATION: an artefact's storageKey is namespaced by the DP15 per-project isolation
 *     token, so a backup of project A is INACCESSIBLE from project B (accessArtifact
 *     refuses cross-project);
 *   - REPRODUCIBILITY: same state + same clock ⇒ byte-identical artefact (the same content
 *     address), always.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no real clock
 * (it is INJECTED via `now`), no rng, no I/O, no LLM. The content address is records.Hash
 * over records.Canonicalize, byte-equal to the Go; the isolation token is the SAME
 * datafragments.IsolationToken motif; the scan REUSES the S91 secret-store twin (never a
 * forked scanner). The Go output is the AUTHORITATIVE truth; this twin reproduces it.
 *
 * THE WALL (CLAUDE.md §2): below-the-line. A backup is operational material (bytes), not a
 * truth; a restoration is a RECORDED decision (§9), never a truth edit. This twin writes
 * NOTHING — it projects, plans, restores and scans as VALUES.
 */

import { createHash } from "node:crypto";
import { scanEmission } from "./secret-store";

// ── The closed engine set (mirrors the Go EngineKind) ───────────────────────────

/** The CLOSED datastore engines a backup dumps — postgres (prod) | doltgres (non-prod). */
export const ENGINE_KINDS = ["postgres", "doltgres"] as const;
export type EngineKind = (typeof ENGINE_KINDS)[number];

/** isKnownEngine reports whether e is in the closed engine set (fail-closed, never guessed). */
export function isKnownEngine(e: string): e is EngineKind {
	return (ENGINE_KINDS as readonly string[]).includes(e);
}

// ── The data model (mirrors the Go structs) ─────────────────────────────────────

/** VolumeSnapshot — one named bind volume captured at backup time (name + raw bytes). */
export interface VolumeSnapshot {
	name: string;
	/** The captured bytes, as a UTF-8 string (the twin's scannable view of the volume). */
	bytes: string;
}

/** DatastoreDump — the captured datastore: the engine + the dump/snapshot rows. */
export interface DatastoreDump {
	engine: EngineKind;
	rows: string;
}

/** ProjectState — the deterministic, project-scoped SELECTION of data to back up. */
export interface ProjectState {
	projectId: string;
	volumes: VolumeSnapshot[];
	datastore: DatastoreDump;
}

/** BackupArtifact — the RESTORABLE, content-addressed product of a backup. */
export interface BackupArtifact {
	projectId: string;
	/** The project-namespaced object-storage address ("<token>/backups/<content-address>"). */
	storageKey: string;
	/** The S02 content address of the canonical body — restorable + reproducible. */
	contentAddress: string;
	volumes: VolumeSnapshot[];
	datastore: DatastoreDump;
}

/** RestoreDecision — the append-only RECORD of a restoration (§9, never a truth edit). */
export interface RestoreDecision {
	projectId: string;
	/** The content address of the artefact restored from. */
	artifactAddress: string;
	/** The content address of THIS decision (deterministic ⇒ idempotent append). */
	address: string;
}

/** A dispatched outbox event — the deterministic "backup taken" notification trace. */
export interface DispatchEvent {
	/** The idempotency key (content-addressed effect id) — a replay collides with it. */
	id: string;
	kind: string;
	target: string;
}

/** BackupResult — the outcome of realizeBackup. */
export interface BackupResult {
	/** whether the scheduled backup FIRED at the injected clock. */
	fired: boolean;
	/** the produced artefact (undefined before the echeance / on a refusal). */
	artifact?: BackupArtifact;
	/** the deterministic dispatch trace (empty before the echeance). */
	events: DispatchEvent[];
}

/** A typed refusal cause (mirrors the Go sentinels). */
export type BackupErrorCode =
	| "no-project"
	| "unknown-engine"
	| "secret-in-clear"
	| "cross-project";

/** A typed error result (the twin never throws on a domain refusal — it returns a value). */
export interface BackupError {
	code: BackupErrorCode;
	message: string;
}

/** isBackupError narrows a refusal from a value union. */
export function isBackupError(v: unknown): v is BackupError {
	return (
		typeof v === "object" &&
		v !== null &&
		"code" in v &&
		"message" in v &&
		!("contentAddress" in v)
	);
}

// ── Canonicalisation + content address (byte-equal to the Go records.*) ──────────

/**
 * canonicalize sorts object keys recursively and drops insignificant whitespace —
 * byte-identical to the Go records.Canonicalize, so the content address below matches the
 * Go records.Hash(Canonicalize(body)).
 */
function canonicalize(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(canonicalize).join(",")}]`;
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
	return `{${parts.join(",")}}`;
}

/** hash is the SHA-256 hex of bytes — byte-equal to the Go records.Hash. */
function hash(bytes: string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 * isolationToken derives the deterministic per-project 12-hex token — the SAME motif as the
 * Go datafragments.IsolationToken ("datafragments/v1:" + projectID, records.Hash, first 12
 * hex). Project A and project B never collide; the same project always maps to the same
 * token (reproducible isolation).
 */
export function isolationToken(projectId: string): string {
	const h = hash(`datafragments/v1:${projectId}`);
	return h.length >= 12 ? h.slice(0, 12) : h;
}

/**
 * canonicalBody returns the canonical bytes the content address hashes over — the project
 * id + the captured state. The volume order is semantic (kept as-is); canonicalize sorts
 * object keys so an incidental field-order never leaks into the address. Byte-equal to the
 * Go canonicalBody.
 */
function canonicalBody(state: ProjectState): string {
	return canonicalize({
		project_id: state.projectId,
		volumes: state.volumes.map((v) => ({ name: v.name, bytes: v.bytes })),
		datastore: { engine: state.datastore.engine, rows: state.datastore.rows },
	});
}

// ── The scheduler (pure on the injected clock) ──────────────────────────────────

/**
 * The DECLARED echeance of the backup schedule — a CONSTANT (the schedule is code,
 * declared above the line). It matches the Go scheduleAt so the twin and the Go fire on the
 * same injected clock. The reproducibility mirror pins same-clock ⇒ same firing.
 */
export const BACKUP_SCHEDULE_AT = "2026-06-08T09:00:00Z";

/** due reports whether the echeance has arrived relative to now (now ≥ echeance). */
export function due(echeance: string, now: string): boolean {
	const et = Date.parse(echeance);
	const nt = Date.parse(now);
	if (Number.isNaN(et) || Number.isNaN(nt)) return false;
	return nt >= et;
}

/**
 * effectId is the CONTENT-ADDRESSED idempotency key of the "backup taken" effect — the
 * SHA-256 of its canonical body, byte-equal to the Go operation.EffectID. The payload is
 * the artefact's content address (NOT a clock read), so the id is stable across replays —
 * a replay never doubles the event.
 */
function effectId(projectId: string, contentAddress: string): string {
	const body = {
		kind: "notification",
		target: `backup-channel:${projectId}`,
		payload: { artifact: contentAddress },
	};
	return hash(canonicalize(body));
}

// ── The S91 no-secret gate (reuses the secret-store twin) ────────────────────────

/**
 * serializeForScan renders the artefact's payload bytes as a single string the S91 scanner
 * reads (the no-secret gate). DETERMINISTIC: every volume's bytes + the datastore rows laid
 * out line by line, byte-equal to the Go SerializeForScan — a clear secret anywhere in the
 * payload lands on a scannable line.
 */
export function serializeForScan(artifact: BackupArtifact): string {
	const parts: string[] = [];
	for (const v of artifact.volumes) {
		parts.push(v.name);
		parts.push(v.bytes);
	}
	parts.push(artifact.datastore.rows);
	return `${parts.join("\n")}\n`;
}

/**
 * isClean reports whether an artefact carries NO secret in the clear — the boolean the
 * gate and the Workbench read. It REUSES the S91 secret-store scanEmission (never a forked
 * scanner). knownValues lets a caller assert the strongest check (the literal plaintext).
 */
export function artifactIsClean(
	artifact: BackupArtifact,
	knownValues: string[] = [],
): boolean {
	return scanEmission(serializeForScan(artifact), knownValues).length === 0;
}

// ── mint / realise / restore / access (mirrors the Go) ───────────────────────────

/**
 * mintArtifact builds the content-addressed, project-namespaced artefact from a state.
 * PURE: the content address is hash(canonicalBody), the storageKey namespaces it under the
 * DP15 isolation token. Same state ⇒ same address; distinct projects (even with identical
 * bytes) ⇒ distinct keys (isolation). Mirrors the Go mintArtifact.
 */
export function mintArtifact(state: ProjectState): BackupArtifact {
	const addr = hash(canonicalBody(state));
	const token = isolationToken(state.projectId);
	return {
		projectId: state.projectId,
		storageKey: `${token}/backups/${addr}`,
		contentAddress: addr,
		volumes: state.volumes.map((v) => ({ name: v.name, bytes: v.bytes })),
		datastore: { engine: state.datastore.engine, rows: state.datastore.rows },
	};
}

/**
 * realizeBackup plans + realises a project's backup as a SCHEDULED async job on an INJECTED
 * clock (`now`). It:
 *   1. validates the state (a pinned project_id, a known engine);
 *   2. mints the candidate artefact deterministically;
 *   3. gates it through the S91 no-secret scan FIRST — a leaking state FAILS CLOSED
 *      ({code:"secret-in-clear"}) and mints NOTHING;
 *   4. ticks the cron echeance on the injected clock: before the echeance fires nothing
 *      (fired=false, no artefact, no event); at/after it returns the artefact + the
 *      deterministic dispatch trace (the "backup taken" notification, idempotent id).
 *
 * Same (state, now) ⇒ same result. Mirrors the Go RealizeBackup (fail-closed gate first).
 *
 * @param knownValues optional project secret VALUES the gate searches verbatim (strongest
 *   check). The gate ALSO runs the declared gitleaks-style rules over every byte.
 */
export function realizeBackup(
	state: ProjectState,
	now: string,
	knownValues: string[] = [],
): BackupResult | BackupError {
	if (!state.projectId) {
		return {
			code: "no-project",
			message:
				"le backup ne fixe aucun project_id (scope d'isolation non défini)",
		};
	}
	if (!isKnownEngine(state.datastore.engine)) {
		return {
			code: "unknown-engine",
			message: `moteur de datastore inconnu : ${state.datastore.engine} (attendu postgres|doltgres)`,
		};
	}

	const artifact = mintArtifact(state);

	// THE S91 GATE (fail-closed). Scan the artefact's serialized bytes; a non-clean scan
	// refuses the backup (no leaking artefact is ever returned).
	if (!artifactIsClean(artifact, knownValues)) {
		return {
			code: "secret-in-clear",
			message:
				"backup refusé — un secret en clair a été trouvé dans l'état (S91 ScanEmission)",
		};
	}

	// Tick the cron echeance on the injected clock (the schedule is code, never time.Now).
	const fired = due(BACKUP_SCHEDULE_AT, now);
	if (!fired) {
		return { fired: false, events: [] };
	}

	// At/after the echeance: commit the artefact + the deterministic dispatch trace. The
	// effect id is the content-addressed idempotency key — a replay collides with it.
	const event: DispatchEvent = {
		id: effectId(state.projectId, artifact.contentAddress),
		kind: "notification",
		target: `backup-channel:${state.projectId}`,
	};
	return { fired: true, artifact, events: [event] };
}

/**
 * restoreBackup round-trips an artefact back into the EXACT projectState it captured (no
 * loss) AND records the restoration as an append-only, content-addressed restoreDecision.
 * PURE: the restored state is a copy of the artefact's payload; the decision address is a
 * deterministic hash of (project, artefact address). A restore changes no truth — it is a
 * recorded decision (§9). Mirrors the Go RestoreBackup.
 */
export function restoreBackup(
	artifact: BackupArtifact,
): { state: ProjectState; decision: RestoreDecision } | BackupError {
	if (!artifact.projectId) {
		return {
			code: "no-project",
			message: "l'artefact ne fixe aucun project_id",
		};
	}
	if (!isKnownEngine(artifact.datastore.engine)) {
		return {
			code: "unknown-engine",
			message: `moteur de datastore inconnu : ${artifact.datastore.engine}`,
		};
	}
	const state: ProjectState = {
		projectId: artifact.projectId,
		volumes: artifact.volumes.map((v) => ({ name: v.name, bytes: v.bytes })),
		datastore: {
			engine: artifact.datastore.engine,
			rows: artifact.datastore.rows,
		},
	};
	const decisionAddr = hash(
		`backup/restore/v1:${artifact.projectId}:${artifact.contentAddress}`,
	);
	const decision: RestoreDecision = {
		projectId: artifact.projectId,
		artifactAddress: artifact.contentAddress,
		address: decisionAddr,
	};
	return { state, decision };
}

/**
 * accessArtifact is the deterministic project-scope membership check (the wall §2 / S55
 * isolation): it returns null iff projectId OWNS the artefact, else a cross-project
 * refusal. The owning project is the one whose DP15 isolation token namespaces the
 * artefact's storageKey — a backup of project A is inaccessible from project B. Never an
 * LLM, never a guess. Mirrors the Go AccessArtifact (defence in depth: project_id + token).
 */
export function accessArtifact(
	artifact: BackupArtifact,
	projectId: string,
): BackupError | null {
	if (!projectId) {
		return {
			code: "no-project",
			message: "aucun project_id fourni pour l'accès",
		};
	}
	if (artifact.projectId !== projectId) {
		return {
			code: "cross-project",
			message: `accès inter-projet refusé — artefact détenu par ${artifact.projectId}, accédé depuis ${projectId}`,
		};
	}
	const wantPrefix = `${isolationToken(projectId)}/backups/`;
	if (!artifact.storageKey.startsWith(wantPrefix)) {
		return {
			code: "cross-project",
			message: `clé de stockage ${artifact.storageKey} non namespacée par le projet ${projectId}`,
		};
	}
	return null;
}

/**
 * stateEqual reports whether two project states are byte-equal (the round-trip mirror: a
 * restored state must equal the backed-up state — no loss). It compares the canonical
 * bodies, so an incidental field-order never produces a false inequality. Mirrors the Go
 * StateEqual.
 */
export function stateEqual(a: ProjectState, b: ProjectState): boolean {
	return canonicalBody(a) === canonicalBody(b);
}

// ── The demo fixtures the /app-ops panel drives ─────────────────────────────────

/**
 * demoState builds the canonical, secret-FREE demo project state for a project — two named
 * bind volumes (under ${APP_DATA_PATH}) + a Postgres datastore dump. It is the deterministic
 * input the panel backs up + restores (so the screen exercises a real round-trip, never a
 * stub). NO secret in the clear (the S91 gate scans it green).
 */
export function demoState(projectId: string): ProjectState {
	const pid = projectId || "demo-project";
	return {
		projectId: pid,
		volumes: [
			{
				name: "app-data",
				bytes: `# ${pid} uploads\norder-2026-001.pdf\ninvoice-2026-002.pdf\n`,
			},
			{
				name: "app-cache",
				bytes: `sessions=42\ncached_at=2026-06-08T08:59:00Z\n`,
			},
		],
		datastore: {
			engine: "postgres",
			rows: "id,total,status\n1,4200,paid\n2,1990,pending\n",
		},
	};
}

/**
 * demoLeakingState is the demo state with a CLEAR secret injected into a volume — the
 * panel's no-secret indicator uses the clean demoState (green); this fixture proves the
 * fail-closed gate refuses a leaking state (used by the twin tests, not the happy path).
 */
export function demoLeakingState(projectId: string): ProjectState {
	const s = demoState(projectId);
	return {
		...s,
		datastore: {
			...s.datastore,
			rows: `${s.datastore.rows}DATABASE_URL=postgres://u:supersecretpw@db:5432/app\n`,
		},
	};
}
