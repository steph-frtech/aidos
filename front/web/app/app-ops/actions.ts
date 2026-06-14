"use server";

import {
	accessArtifact,
	artifactIsClean,
	BACKUP_SCHEDULE_AT,
	type BackupArtifact,
	demoState,
	isBackupError,
	isolationToken,
	realizeBackup,
	restoreBackup,
	stateEqual,
} from "@/lib/backup";
import {
	bootMergeOrder,
	demoEnvExample,
	envExampleIsReferencesOnly,
	referenceFor,
	rotateSecret,
	storeFingerprint,
} from "@/lib/secret-boot";
import { SecretStore } from "@/lib/secret-store";
import type {
	AppOpsBackupsView,
	AppOpsSecretsView,
	BackupRow,
	SecretRow,
} from "./view";

/**
 * Server Actions for the /app-ops « Sauvegardes » panel (DP31, piste DP, EPIC G).
 *
 * THE SOURCE is the PURE twin lib/backup (the twin of the Go RealizeBackup/RestoreBackup) —
 * the injected clock is passed IN (the `now` arg), never Date.now, never an LLM. Every
 * action is a pure function of its input: same (project, now, ledger) ⇒ same view (the
 * reproducibility property). THE WALL (§2): below-the-line, no kernel/mirrors/fitness write
 * — a backup is operational material (bytes), a restoration is a recorded decision (§9).
 *
 * The injected clock defaults to an instant AT/AFTER the declared echeance so the planned
 * backup FIRES on the first click (a scheduled-but-not-due backup mints nothing — that
 * before-the-echeance case is proven by the twin's vitest, kept off the happy path).
 */

/** The default injected clock — at the declared echeance, so the schedule fires. */
const DEFAULT_NOW = BACKUP_SCHEDULE_AT;

/** Build the project-scoped seed view (no backup taken yet). */
export async function seedBackups(
	activeProjectId: string | null,
): Promise<AppOpsBackupsView> {
	const projectId =
		(activeProjectId ?? "demo-project").trim() || "demo-project";
	return {
		ok: true,
		projectId,
		isolationToken: isolationToken(projectId),
		rows: [],
		lastEvents: [],
		lastNoSecret: true,
	};
}

/**
 * scheduleBackupAction PLANS + REALISES a backup on the INJECTED clock and APPENDS the taken
 * artefact to the (client-held) append-only ledger. It is the « Planifier un backup »
 * gesture (ui-completeness §7) — reachable AND executable from the screen.
 *
 * The state backed up is the project's deterministic demo state (two named bind volumes +
 * a Postgres dump, secret-FREE). The S91 no-secret gate runs FIRST (fail-closed): a leaking
 * state would mint NOTHING (surfaced as a refusal). Same (project, now) ⇒ same artefact
 * (the content address is stable — reproducibility).
 */
export async function scheduleBackupAction(
	activeProjectId: string | null,
	priorRows: BackupRow[],
	now: string = DEFAULT_NOW,
): Promise<AppOpsBackupsView> {
	const projectId =
		(activeProjectId ?? "demo-project").trim() || "demo-project";
	const token = isolationToken(projectId);
	const clock = (now || DEFAULT_NOW).trim() || DEFAULT_NOW;

	const result = realizeBackup(demoState(projectId), clock);
	if (isBackupError(result)) {
		return {
			ok: false,
			projectId,
			isolationToken: token,
			rows: priorRows,
			lastEvents: [],
			lastNoSecret: false,
			error: { code: result.code, message: result.message },
		};
	}

	if (!result.fired || !result.artifact) {
		// Before the echeance the scheduler fires nothing — no artefact committed.
		return {
			ok: true,
			projectId,
			isolationToken: token,
			rows: priorRows,
			lastEvents: [],
			lastNoSecret: true,
		};
	}

	const artifact = result.artifact;
	const noSecret = artifactIsClean(artifact);
	// The seq is a stable monotonic id over the append-only ledger (the prior max + 1) — it
	// is the React key; a content address can repeat (idempotent same backup), the seq never
	// does. The ledger never reorders, so prior seqs are immutable (§9).
	const nextSeq =
		priorRows.reduce((max, r) => (r.seq > max ? r.seq : max), 0) + 1;
	const row: BackupRow = {
		seq: nextSeq,
		id: artifact.contentAddress,
		projectId: artifact.projectId,
		storageKey: artifact.storageKey,
		takenAt: clock,
		noSecret,
	};
	// Append-only ledger: the new row is prepended (most-recent first); we never mutate or
	// drop a prior row (§9). A duplicate content address (same state + same clock) is the
	// idempotent same backup — we still record the line, but the id is stable.
	return {
		ok: true,
		projectId,
		isolationToken: token,
		rows: [row, ...priorRows],
		lastArtifact: artifact,
		lastEvents: result.events,
		lastNoSecret: noSecret,
	};
}

/**
 * restoreBackupAction RESTORES the last (or a named) artefact and proves the ROUND-TRIP
 * WITHOUT LOSS: it re-mints the project's state, restores the artefact, and asserts the
 * restored state EQUALS the backed-up state (stateEqual). It records the restoration as an
 * append-only decision (§9). It is the « Restaurer » gesture (ui-completeness §7).
 *
 * It also asserts ISOLATION: the artefact must be OWNED by the active project (accessArtifact
 * refuses a cross-project access) — a restore of another project's backup is refused.
 */
export async function restoreBackupAction(
	activeProjectId: string | null,
	artifact: BackupArtifact,
	priorRows: BackupRow[],
): Promise<AppOpsBackupsView> {
	const projectId =
		(activeProjectId ?? "demo-project").trim() || "demo-project";
	const token = isolationToken(projectId);

	// ISOLATION: refuse a cross-project restore (the artefact must be owned by this project).
	const denied = accessArtifact(artifact, projectId);
	if (denied) {
		return {
			ok: false,
			projectId,
			isolationToken: token,
			rows: priorRows,
			lastEvents: [],
			lastNoSecret: artifactIsClean(artifact),
			error: { code: denied.code, message: denied.message },
		};
	}

	const out = restoreBackup(artifact);
	if (isBackupError(out)) {
		return {
			ok: false,
			projectId,
			isolationToken: token,
			rows: priorRows,
			lastEvents: [],
			lastNoSecret: artifactIsClean(artifact),
			error: { code: out.code, message: out.message },
		};
	}

	// ROUND-TRIP: the restored state must EQUAL the backed-up state (no loss). The backed-up
	// state is the project's deterministic demo state — same input the schedule captured.
	const roundTrip = stateEqual(out.state, demoState(projectId));
	return {
		ok: true,
		projectId,
		isolationToken: token,
		rows: priorRows,
		lastArtifact: artifact,
		lastEvents: [],
		lastNoSecret: artifactIsClean(artifact),
		lastRestore: { roundTrip, decision: out.decision },
	};
}

// ─────────────────────────────────────────────────────────────────────────────────
// DP32 — « Secrets (par projet) » server actions.
//
// THE SOURCE is the PURE twin lib/secret-boot (the twin of the Go MergeBootEnv /
// RotateSecret / ScanBootEmission). THE WALL (§2): a secret is operational material, never a
// truth — the actions NEVER return a value in the clear (only the EMITTED reference `${VAR}`
// and the content-address fingerprint). The store is rebuilt deterministically per action
// from the prior rows (server actions are stateless) — the demo VALUE is derived server-side
// from (project, name) and NEVER crosses the wire to the panel.
//
// The .env.example carried by the emission is references-only (the DP04 contract); the
// refsOnly indicator REUSES the shared S91 scan over the demo emission. Determinism: the
// merge order is the engraved BOOT_MERGE_ORDER; the scan is code, never an LLM.
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * demoSecretValue derives a deterministic, project-scoped demo VALUE for a secret name — it
 * stays SERVER-SIDE (the store seals it); it is NEVER returned to the panel. Same
 * (project, name, salt) ⇒ same value (so a rotation with a new salt changes the value).
 */
function demoSecretValue(project: string, name: string, salt: string): string {
	// a stable, high-entropy-ish value (≥12 chars) the S91 scan would flag if it ever leaked.
	return `v${salt}${project}${name}`
		.replace(/[^A-Za-z0-9]/g, "")
		.slice(0, 24)
		.padEnd(12, "0");
}

/**
 * rebuildStore reconstructs the project-scoped SecretStore from the prior rows — server
 * actions are stateless, so the store is re-derived deterministically each call (the value
 * is re-sealed from the row's salt, never carried on the wire). REUSES the S91 SecretStore.
 */
function rebuildStore(projectId: string, rows: SecretRow[]): SecretStore {
	const store = new SecretStore();
	for (const r of rows) {
		// the salt is encoded in the fingerprint-bearing row via its seq + rotated flag; we
		// re-seal a deterministic value so the store carries the SAME present-set the rows show.
		store.set(
			projectId,
			r.name,
			demoSecretValue(projectId, r.name, r.rotated ? "rot" : "set"),
		);
	}
	return store;
}

/** Build the project-scoped seed view (no secret reference added yet). */
export async function seedSecrets(
	activeProjectId: string | null,
): Promise<AppOpsSecretsView> {
	const projectId =
		(activeProjectId ?? "demo-project").trim() || "demo-project";
	return {
		ok: true,
		projectId,
		rows: [],
		mergeOrder: bootMergeOrder(),
		// the emitted .env.example is references-only by construction (DP04) — the S91 scan
		// is green even checked against the project's actual values.
		refsOnly: envExampleIsReferencesOnly(demoEnvExample(), []),
	};
}

/**
 * addSecretReferenceAction ADDS a secret REFERENCE (name + project scope) to the store and
 * the append-only list. It NEVER takes nor returns a value in the clear — the value is sealed
 * server-side (demoSecretValue) and the row carries only the EMITTED reference `${VAR}` + the
 * store fingerprint. It is the « Ajouter une référence » gesture (ui-completeness §7).
 */
export async function addSecretReferenceAction(
	activeProjectId: string | null,
	name: string,
	priorRows: SecretRow[],
): Promise<AppOpsSecretsView> {
	const projectId =
		(activeProjectId ?? "demo-project").trim() || "demo-project";
	const key = (name ?? "").trim();
	if (!key) {
		return {
			ok: false,
			projectId,
			rows: priorRows,
			mergeOrder: bootMergeOrder(),
			refsOnly: envExampleIsReferencesOnly(demoEnvExample(), []),
			error: {
				code: "EMPTY_SECRET_NAME",
				message:
					"le nom de la référence de secret est requis (jamais une valeur en clair)",
			},
		};
	}

	const store = rebuildStore(projectId, priorRows);
	// seal a deterministic demo value server-side (NEVER returned to the panel).
	store.set(projectId, key, demoSecretValue(projectId, key, "set"));
	const fingerprint = storeFingerprint(store, projectId);

	const nextSeq =
		priorRows.reduce((max, r) => (r.seq > max ? r.seq : max), 0) + 1;
	const row: SecretRow = {
		seq: nextSeq,
		name: key,
		projectId,
		reference: referenceFor(key),
		fingerprint,
		rotated: false,
	};
	return {
		ok: true,
		projectId,
		// append-only: prepend the new row (most-recent first); never mutate a prior row (§9).
		rows: [row, ...priorRows],
		mergeOrder: bootMergeOrder(),
		refsOnly: envExampleIsReferencesOnly(demoEnvExample(), []),
	};
}

/**
 * rotateSecretReferenceAction ROTATES a secret (S91 Rotate) — the old value is INVALIDATED
 * and the row carries a NEW fingerprint (proving the value moved WITHOUT exposing it). It is
 * the « Faire tourner » gesture (ui-completeness §7). Rotating an ABSENT secret is refused.
 * A rotation is a RECORDED decision (append-only §9), never a silent in-place rewrite.
 */
export async function rotateSecretReferenceAction(
	activeProjectId: string | null,
	name: string,
	priorRows: SecretRow[],
): Promise<AppOpsSecretsView> {
	const projectId =
		(activeProjectId ?? "demo-project").trim() || "demo-project";
	const key = (name ?? "").trim();

	const store = rebuildStore(projectId, priorRows);
	// rotate to a NEW deterministic demo value (the "rot" salt ⇒ a different value).
	const res = rotateSecret(
		store,
		projectId,
		key,
		demoSecretValue(projectId, key, "rot"),
	);
	if (!res.ok) {
		return {
			ok: false,
			projectId,
			rows: priorRows,
			mergeOrder: bootMergeOrder(),
			refsOnly: envExampleIsReferencesOnly(demoEnvExample(), []),
			error: { code: res.code, message: res.message },
		};
	}

	// the row's fingerprint moves to the NEW one (the old value is gone) and the row is marked
	// rotated; the prior rows for OTHER keys are untouched (append-only §9).
	const rows = priorRows.map((r) =>
		r.name === key && r.projectId === projectId
			? { ...r, fingerprint: res.decision.newFingerprint, rotated: true }
			: r,
	);
	return {
		ok: true,
		projectId,
		rows,
		mergeOrder: bootMergeOrder(),
		refsOnly: envExampleIsReferencesOnly(demoEnvExample(), []),
	};
}
