"use client";

import { AppOpsBackupsPanel } from "./AppOpsBackupsPanel";
import type { AppOpsBackupsView } from "./view";

/**
 * AppOpsScreen is the /app-ops cockpit shell (DP31, piste DP). It composes the DP31
 * « Sauvegardes » panel — the data-protection slice of an emitted app's operations: plan +
 * realise a deterministic backup of the named bind volumes (${APP_DATA_PATH}) + the
 * datastore (Postgres dump / Doltgres snapshot non-prod), list the append-only ledger,
 * restore round-trip without loss, with the S91 no-secret indicator + the per-project
 * isolation indicator.
 *
 * THE WALL (§2): the shell writes nothing — the panel is a below-the-line projection of the
 * pure twin lib/backup (the twin of the Go RealizeBackup/RestoreBackup, horloge injectée
 * côté twin).
 */
export function AppOpsScreen({
	activeProjectId,
	initialBackups,
}: {
	activeProjectId: string | null;
	initialBackups: AppOpsBackupsView;
}) {
	return (
		<div className="space-y-12">
			<AppOpsBackupsPanel
				activeProjectId={activeProjectId}
				initial={initialBackups}
			/>
		</div>
	);
}
