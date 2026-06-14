"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	addSecretReferenceAction,
	rotateSecretReferenceAction,
} from "./actions";
import type { AppOpsSecretsView } from "./view";

/**
 * SecretsPanel renders the DP32 « Secrets (par projet) » section of /app-ops — the
 * secret-store cockpit of an emitted app, branching S91 onto the provisioning. It is
 * ACTION-CAPABLE (the ui-completeness gesture, CLAUDE.md §7): every op the step develops has
 * a control bound to it, reachable AND executable from the screen.
 *
 *  - AJOUTER une RÉFÉRENCE (data-testid="secret-add") : adds a secret reference (name + scope
 *    project) ⇒ a row appears (data-testid="secret-row" data-name data-project) showing the
 *    EMITTED reference `${VAR}` (data-testid="secret-reference") — NEVER a value in the clear ;
 *  - FAIRE TOURNER (data-testid="secret-rotate") ⇒ data-testid="secret-rotated" : the old
 *    value is invalidated (the fingerprint moves), a recorded decision (§9) ;
 *  - indicateurs : « la valeur n'est jamais affichée » (data-testid="secret-value-hidden"
 *    data-shown="false"), « isolation par projet » (data-testid="secret-project-isolated"),
 *    « .env.example = références seules » (data-testid="envexample-refs-only").
 *
 * THE SOURCE is the PURE twin lib/secret-boot (the twin of the Go MergeBootEnv / RotateSecret
 * / ScanBootEmission). DETERMINISM-FIRST (§6/§8): the twin is authoritative; the panel only
 * displays its deterministic output — the engraved merge order, the references-only scan, the
 * rotation fingerprint.
 *
 * THE WALL (§2): below-the-line. A secret lives in the store (chiffré, scopé project_id),
 * NEVER the truth-store / git / emitted source. The panel renders only the REFERENCE `${VAR}`
 * and the content-address fingerprint — there is NO value-egress surface. Themed on ADR 0010
 * tokens; strings via next-intl (ADR 0011, FR first).
 */
export function SecretsPanel({
	activeProjectId,
	initial,
}: {
	activeProjectId: string | null;
	initial: AppOpsSecretsView;
}) {
	const t = useTranslations("appOps");
	const [view, setView] = useState<AppOpsSecretsView>(initial);
	const [name, setName] = useState("APP_SECRET_DATABASE_URL");
	const [pending, startTransition] = useTransition();

	function add() {
		const key = name.trim();
		if (!key) return;
		startTransition(async () => {
			const v = await addSecretReferenceAction(activeProjectId, key, view.rows);
			setView(v);
		});
	}

	function rotate(secretName: string) {
		startTransition(async () => {
			const v = await rotateSecretReferenceAction(
				activeProjectId,
				secretName,
				view.rows,
			);
			setView(v);
		});
	}

	return (
		<section data-testid="app-ops-secrets" className="space-y-6">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{t("secretsHeading")}
				</h2>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t("secretsIntro")}
				</p>
			</header>

			{/* the three always-present indicators: value-hidden + project isolation + refs-only */}
			<div className="flex flex-wrap gap-3">
				<span
					data-testid="secret-value-hidden"
					data-shown="false"
					className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
				>
					<span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
					{t("valueHidden")}
				</span>
				<span
					data-testid="secret-project-isolated"
					data-project={view.projectId}
					className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
				>
					<span
						aria-hidden
						className="h-2 w-2 rounded-full bg-muted-foreground"
					/>
					{t("secretProjectIsolated", { project: view.projectId })}
				</span>
				<span
					data-testid="envexample-refs-only"
					data-ok={view.refsOnly ? "true" : "false"}
					className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
						view.refsOnly
							? "border-primary/40 bg-primary/10 text-primary"
							: "border-destructive/40 bg-destructive/10 text-destructive"
					}`}
				>
					<span
						aria-hidden
						className={`h-2 w-2 rounded-full ${
							view.refsOnly ? "bg-primary" : "bg-destructive"
						}`}
					/>
					{view.refsOnly ? t("refsOnlyOk") : t("refsOnlyFail")}
				</span>
			</div>

			{/* the engraved boot merge order — references → store → overrides (legible, not a black box) */}
			<div
				data-testid="secret-merge-order"
				className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-4 text-xs"
			>
				<span className="font-medium text-muted-foreground">
					{t("mergeOrderLabel")}
				</span>
				{view.mergeOrder.map((layer, i) => (
					<span key={layer} className="inline-flex items-center gap-2">
						{i > 0 ? (
							<span aria-hidden className="text-muted-foreground">
								→
							</span>
						) : null}
						<span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[0.65rem] text-foreground">
							{layer}
						</span>
					</span>
				))}
			</div>

			{/* the typed refusal surfaced verbatim (rotate-absent / empty-name / …) */}
			{view.error ? (
				<div
					data-testid="secret-error"
					data-code={view.error.code}
					className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
				>
					<span className="font-mono text-xs font-semibold">
						{view.error.code}
					</span>{" "}
					— {view.error.message}
				</div>
			) : null}

			{/* the gesture: AJOUTER une référence (name only — NEVER a value field) */}
			<div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-5">
				<label className="flex flex-col gap-1.5 text-xs">
					<span className="font-medium text-muted-foreground">
						{t("secretNameLabel")}
					</span>
					<input
						data-testid="secret-name-input"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="APP_SECRET_DATABASE_URL"
						className="w-72 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					/>
				</label>
				<button
					type="button"
					data-testid="secret-add"
					disabled={pending || !name.trim()}
					onClick={add}
					className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
				>
					{pending ? t("secretAdding") : t("secretAdd")}
				</button>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("secretValueNote")}
				</p>
			</div>

			{/* the append-only list of secret references (most-recent first) */}
			<div className="space-y-3">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{t("secretListHeading")}
				</h3>
				<ul
					data-testid="secret-list"
					data-count={view.rows.length}
					className="space-y-2"
				>
					{view.rows.length === 0 ? (
						<li
							data-testid="secret-list-empty"
							className="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground"
						>
							{t("secretListEmpty")}
						</li>
					) : (
						view.rows.map((r) => (
							<li
								key={r.seq}
								data-testid="secret-row"
								data-name={r.name}
								data-project={r.projectId}
								className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-xs"
							>
								<span className="font-mono text-foreground" title={r.name}>
									{r.name}
								</span>
								{/* the EMITTED reference `${VAR}` — NEVER the value */}
								<span
									data-testid="secret-reference"
									className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground"
								>
									{r.reference}
								</span>
								<span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">
									{r.projectId}
								</span>
								{/* the store fingerprint — proves a value exists/moved, never the value */}
								<span
									className="truncate font-mono text-[0.6rem] text-muted-foreground"
									title={r.fingerprint}
								>
									fp:{r.fingerprint.slice(0, 8)}…
								</span>
								{r.rotated ? (
									<span
										data-testid="secret-rotated"
										data-name={r.name}
										className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[0.6rem] font-medium text-primary"
									>
										{t("secretRotatedBadge")}
									</span>
								) : null}
								<button
									type="button"
									data-testid="secret-rotate"
									data-name={r.name}
									disabled={pending}
									onClick={() => rotate(r.name)}
									className="ml-auto inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-[0.7rem] font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
								>
									{t("secretRotate")}
								</button>
							</li>
						))
					)}
				</ul>
			</div>
		</section>
	);
}
