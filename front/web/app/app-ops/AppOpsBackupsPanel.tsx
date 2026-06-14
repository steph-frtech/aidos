"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { restoreBackupAction, scheduleBackupAction } from "./actions";
import type { AppOpsBackupsView } from "./view";

/**
 * AppOpsBackupsPanel renders the DP31 « Sauvegardes (backups déterministes) » section of
 * /app-ops — the data-protection cockpit of an emitted app. It is ACTION-CAPABLE (the
 * ui-completeness gesture, CLAUDE.md §7): every op the step develops has a control bound to
 * it, reachable AND executable from the screen.
 *
 *  - PLANIFIER un backup (data-testid="backup-schedule") : plans + realises a backup on the
 *    INJECTED clock (côté twin) ⇒ a RESTORABLE artefact (data-testid="backup-artifact",
 *    content-addressed, scoped project_id) and the row enters the append-only ledger ;
 *  - LISTER (data-testid="backup-list", chaque data-testid="backup-row" data-project) ;
 *  - RESTAURER (data-testid="backup-restore" ⇒ data-testid="restore-done"
 *    data-roundtrip="true" : le round-trip SANS PERTE) ;
 *  - « aucun secret en clair » (data-testid="backup-no-secret" data-ok=true, S91
 *    ScanEmission) + « isolation par projet » (data-testid="backup-project-isolated").
 *
 * THE SOURCE is the PURE twin lib/backup (the twin of the Go RealizeBackup/RestoreBackup),
 * horloge INJECTÉE côté twin — jamais Date.now, jamais un LLM. DETERMINISM-FIRST (§6/§8):
 * the twin is authoritative; the panel only displays its deterministic output.
 *
 * THE WALL (§2): below-the-line. The backup protects the DATA (distinct from the
 * rollback-par-phase DP28 which re-emits the CODE) ; it writes NO truth (kernel / mirrors /
 * fitness). A restoration is a recorded decision (append-only §9). Themed on ADR 0010
 * tokens; strings via next-intl (ADR 0011, FR first).
 */
export function AppOpsBackupsPanel({
	activeProjectId,
	initial,
}: {
	activeProjectId: string | null;
	initial: AppOpsBackupsView;
}) {
	const t = useTranslations("appOps");
	const [view, setView] = useState<AppOpsBackupsView>(initial);
	const [pending, startTransition] = useTransition();

	function schedule() {
		startTransition(async () => {
			const v = await scheduleBackupAction(activeProjectId, view.rows);
			setView(v);
		});
	}

	function restore() {
		const artifact = view.lastArtifact;
		if (!artifact) return;
		startTransition(async () => {
			const v = await restoreBackupAction(activeProjectId, artifact, view.rows);
			setView(v);
		});
	}

	const restored = view.lastRestore;

	return (
		<section data-testid="app-ops-backups" className="space-y-6">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{t("backupsHeading")}
				</h2>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t("backupsIntro")}
				</p>
			</header>

			{/* the two always-present indicators: no-secret (S91) + project isolation */}
			<div className="flex flex-wrap gap-3">
				<span
					data-testid="backup-no-secret"
					data-ok={view.lastNoSecret ? "true" : "false"}
					className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
						view.lastNoSecret
							? "border-primary/40 bg-primary/10 text-primary"
							: "border-destructive/40 bg-destructive/10 text-destructive"
					}`}
				>
					<span
						aria-hidden
						className={`h-2 w-2 rounded-full ${
							view.lastNoSecret ? "bg-primary" : "bg-destructive"
						}`}
					/>
					{view.lastNoSecret ? t("noSecretOk") : t("noSecretFail")}
				</span>
				<span
					data-testid="backup-project-isolated"
					data-project={view.projectId}
					data-token={view.isolationToken}
					className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
				>
					<span
						aria-hidden
						className="h-2 w-2 rounded-full bg-muted-foreground"
					/>
					{t("projectIsolated", {
						project: view.projectId,
						token: view.isolationToken.slice(0, 8),
					})}
				</span>
			</div>

			{/* the typed refusal surfaced verbatim (secret-in-clear / cross-project / …) */}
			{view.error ? (
				<div
					data-testid="backup-error"
					data-code={view.error.code}
					className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
				>
					<span className="font-mono text-xs font-semibold">
						{view.error.code}
					</span>{" "}
					— {view.error.message}
				</div>
			) : null}

			{/* the two gestures: PLANIFIER + RESTAURER (action-capable) */}
			<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-5">
				<button
					type="button"
					data-testid="backup-schedule"
					disabled={pending}
					onClick={schedule}
					className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
				>
					{pending ? t("scheduling") : t("scheduleBackup")}
				</button>
				<button
					type="button"
					data-testid="backup-restore"
					disabled={pending || !view.lastArtifact}
					onClick={restore}
					className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
				>
					{t("restoreBackup")}
				</button>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("clockNote")}
				</p>
			</div>

			{/* the LAST minted artefact — restorable, content-addressed, scoped project_id */}
			{view.lastArtifact ? (
				<article
					data-testid="backup-artifact"
					data-id={view.lastArtifact.contentAddress}
					data-project={view.lastArtifact.projectId}
					className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-5"
				>
					<header className="flex flex-wrap items-center gap-2">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("artifactHeading")}
						</h3>
						<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium text-primary">
							{t("restorable")}
						</span>
					</header>
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
						<dt className="font-medium text-muted-foreground">
							{t("contentAddress")}
						</dt>
						<dd
							className="truncate font-mono text-foreground"
							title={view.lastArtifact.contentAddress}
						>
							{view.lastArtifact.contentAddress.slice(0, 16)}…
						</dd>
						<dt className="font-medium text-muted-foreground">
							{t("project")}
						</dt>
						<dd className="font-mono text-foreground">
							{view.lastArtifact.projectId}
						</dd>
						<dt className="font-medium text-muted-foreground">
							{t("storageKey")}
						</dt>
						<dd
							className="truncate font-mono text-muted-foreground"
							title={view.lastArtifact.storageKey}
						>
							{view.lastArtifact.storageKey}
						</dd>
						<dt className="font-medium text-muted-foreground">
							{t("volumes")}
						</dt>
						<dd className="font-mono text-foreground">
							{view.lastArtifact.volumes.map((v) => v.name).join(", ") || "—"}
						</dd>
						<dt className="font-medium text-muted-foreground">
							{t("datastore")}
						</dt>
						<dd className="font-mono text-foreground">
							{view.lastArtifact.datastore.engine}
						</dd>
					</dl>
					{view.lastEvents.length ? (
						<p
							data-testid="backup-event"
							data-id={view.lastEvents[0].id}
							className="text-[0.7rem] leading-relaxed text-muted-foreground"
						>
							{t("eventNote", { target: view.lastEvents[0].target })}
						</p>
					) : null}
				</article>
			) : null}

			{/* the round-trip verdict (after a restore) */}
			{restored ? (
				<div
					data-testid="restore-done"
					data-roundtrip={restored.roundTrip ? "true" : "false"}
					data-decision={restored.decision.address}
					className={`rounded-xl border p-4 text-sm ${
						restored.roundTrip
							? "border-primary/40 bg-primary/10 text-primary"
							: "border-destructive/40 bg-destructive/10 text-destructive"
					}`}
				>
					{restored.roundTrip ? t("roundTripOk") : t("roundTripFail")}
				</div>
			) : null}

			{/* the append-only ledger of backups taken */}
			<div className="space-y-3">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{t("ledgerHeading")}
				</h3>
				<ul
					data-testid="backup-list"
					data-count={view.rows.length}
					className="space-y-2"
				>
					{view.rows.length === 0 ? (
						<li
							data-testid="backup-list-empty"
							className="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground"
						>
							{t("ledgerEmpty")}
						</li>
					) : (
						view.rows.map((r) => (
							<li
								// the seq is the stable key — a content address can repeat (idempotent
								// same backup), the seq never does (assigned at append time).
								key={r.seq}
								data-testid="backup-row"
								data-id={r.id}
								data-project={r.projectId}
								className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-xs"
							>
								<span className="font-mono text-foreground" title={r.id}>
									{r.id.slice(0, 12)}…
								</span>
								<span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">
									{r.projectId}
								</span>
								<span className="font-mono text-muted-foreground">
									{r.takenAt}
								</span>
								<span
									className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${
										r.noSecret
											? "bg-primary/10 text-primary"
											: "bg-destructive/10 text-destructive"
									}`}
								>
									{r.noSecret ? t("clean") : t("leak")}
								</span>
							</li>
						))
					)}
				</ul>
			</div>
		</section>
	);
}
