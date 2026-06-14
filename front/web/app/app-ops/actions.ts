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
import type { AppOpsBackupsView, BackupRow } from "./view";

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
