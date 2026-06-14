import type {
	BackupArtifact,
	DispatchEvent,
	RestoreDecision,
} from "@/lib/backup";

/**
 * View model for the /app-ops « Sauvegardes » panel (DP31, piste DP, EPIC G). Kept OUT of
 * actions.ts because a Next "use server" module may only export async functions — types and
 * the initial value live here so both the Server Action and the client panel import them.
 *
 * Every field is a deterministic VALUE produced by the pure twin lib/backup (the twin of
 * the Go RealizeBackup/RestoreBackup, horloge INJECTÉE côté twin). THE WALL (§2): a view,
 * never a truth-write.
 */

/** One append-only row of the project's backup ledger (the list of taken backups). */
export interface BackupRow {
	/** a stable monotonic sequence number, assigned at append time — the React key. A
	 * content address can repeat (the idempotent same backup), the seq never does. */
	seq: number;
	/** the artefact's content address (the restorable id). */
	id: string;
	/** the owning project (scope project_id — the isolation key). */
	projectId: string;
	/** the project-namespaced storage key ("<token>/backups/<id>"). */
	storageKey: string;
	/** the injected clock at which the backup fired (the echeance). */
	takenAt: string;
	/** whether the artefact scans clean of any secret (S91 ScanEmission). */
	noSecret: boolean;
}

/** The full /app-ops backups view for one project. */
export interface AppOpsBackupsView {
	ok: boolean;
	/** the active project the backups are scoped to (the isolation scope). */
	projectId: string;
	/** the DP15 per-project isolation token namespacing every key (the isolation proof). */
	isolationToken: string;
	/** the append-only ledger of backups taken (most-recent first). */
	rows: BackupRow[];
	/** the LAST artefact minted by a /planifier (undefined until the first schedule). */
	lastArtifact?: BackupArtifact;
	/** the deterministic dispatch trace of the last « backup taken » notification. */
	lastEvents: DispatchEvent[];
	/** whether the LAST minted artefact scans clean of any secret (the no-secret indicator). */
	lastNoSecret: boolean;
	/** the LAST restoration: the round-trip verdict + the recorded decision. */
	lastRestore?: {
		/** true iff the restored state EQUALS the backed-up state (round-trip sans perte). */
		roundTrip: boolean;
		decision: RestoreDecision;
	};
	/** a typed refusal surfaced verbatim (secret-in-clear / cross-project / …). */
	error?: { code: string; message: string };
}

/** The empty seed before any project context (the panel re-seeds on mount). */
export const APP_OPS_BACKUPS_INITIAL: AppOpsBackupsView = {
	ok: false,
	projectId: "",
	isolationToken: "",
	rows: [],
	lastEvents: [],
	lastNoSecret: true,
};
