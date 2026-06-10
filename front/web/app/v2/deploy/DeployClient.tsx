"use client";

import { useMemo, useState } from "react";
import {
	type BlockReason,
	buildDeployPlan,
	DEFAULT_RATE_LIMIT,
	type DeployPlan,
	deployGate,
	type EntityCase,
	isBlockedPlan,
	type ReDeployReport,
	reDeployStable,
} from "@/lib/v2/deploy";

/**
 * WB2-22 — l'AFFICHAGE + le DÉPLOIEMENT de l'app émise (le planificateur déterministe GATÉ), client-only.
 * On choisit une source → on DÉPLOIE (gaté : auth + rate-limit) → on voit l'URL live (Traefik), le plan de
 * conteneurisation, l'aperçu live ; on RE-PLANIFIE pour prouver la reproductibilité.
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on BASCULE l'authentification (la garde sécurité d'ADR 0052) ;
 *   - on CHOISIT une entité puis on DÉPLOIE (v2-deploy-deploy) ;
 *   - garde refusée (anonyme / quota) → le BlockReason actionnable, AUCUN plan (fail-closed) ;
 *   - garde OK → l'URL live, les services conteneurisés, l'aperçu de l'app servie ;
 *   - on RE-PLANIFIE (v2-deploy-redeploy) → la preuve reproductible (même planId/URL à chaque tour) ;
 *   - on RÉINITIALISE (v2-deploy-reset).
 * Tout délégué au twin pur lib/v2/deploy.ts (buildDeployPlan / reDeployStable / deployGate — réutilise WB2-21).
 *
 * LE MUR (§2) : déployer est une action SOUS LA LIGNE (émettre + planifier le conteneur) ; l'écran n'écrit
 * AUCUNE vérité. L'app émise et son plan sont des PROJECTIONS. Modifier une source PROPOSE → /goal (le bouton
 * de proposition déclare data-proposes).
 */

type Strings = Record<string, string>;

export function DeployClient({
	cases,
	t,
}: {
	cases: readonly EntityCase[];
	t: Strings;
}) {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [authenticated, setAuthenticated] = useState(false);
	// le nombre de déploiements déjà lancés dans la fenêtre (incrémenté à chaque déploiement autorisé).
	const [deploysInWindow, setDeploysInWindow] = useState(0);
	// vrai dès qu'on a déclenché « Déployer » (sinon l'écran reste vide).
	const [deployed, setDeployed] = useState(false);
	// vrai dès qu'on a lancé la re-planification (la preuve reproductible).
	const [reDeployed, setReDeployed] = useState(false);

	const selected = useMemo(
		() => cases.find((c) => c.id === selectedId) ?? null,
		[cases, selectedId],
	);

	// La GARDE sécurité (ADR 0052) : auth ∧ rate-limit — une fonction pure, recalculée à chaque rendu.
	const gate = useMemo(
		() =>
			deployGate({
				authenticated,
				deploysInWindow,
				rateLimitPerWindow: DEFAULT_RATE_LIMIT,
			}),
		[authenticated, deploysInWindow],
	);

	// Le PLAN (ou le BlockReason de la garde) — calculé seulement après « Déployer ».
	const result: DeployPlan | BlockReason | null = useMemo(() => {
		if (!selected || !deployed) return null;
		return buildDeployPlan(selected.entity, gate);
	}, [selected, deployed, gate]);

	const plan = result && !isBlockedPlan(result) ? result : null;
	const blocked = result && isBlockedPlan(result) ? result : null;

	const report: ReDeployReport | null = useMemo(() => {
		if (!selected || !reDeployed) return null;
		return reDeployStable(selected.entity, gate, 16);
	}, [selected, reDeployed, gate]);

	function onDeploy() {
		setDeployed(true);
		setReDeployed(false);
		// Un déploiement autorisé consomme une unité de quota (le rate-limit avance).
		if (gate.allowed) setDeploysInWindow((n) => n + 1);
	}

	return (
		<div data-testid="v2-deploy-view" className="space-y-6">
			{/* LA GARDE SÉCURITÉ (ADR 0052) — le toggle auth + le rate-limit */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-3">
				<h3 className="text-sm font-semibold text-foreground">
					{t.gateHeading}
				</h3>
				<p className="text-xs text-muted-foreground">{t.gateHint}</p>
				<div className="flex flex-wrap items-center gap-4 pt-1">
					<button
						type="button"
						data-testid="v2-deploy-auth-toggle"
						data-authenticated={authenticated ? "true" : "false"}
						onClick={() => {
							setAuthenticated((a) => !a);
							setDeployed(false);
							setReDeployed(false);
						}}
						className={[
							"inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
							authenticated
								? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
								: "border-destructive/40 bg-destructive/5 text-destructive",
						].join(" ")}
					>
						{t.authLabel}: {authenticated ? t.authYes : t.authNo}
					</button>
					<span
						data-testid="v2-deploy-rate"
						className="text-xs text-muted-foreground"
					>
						{t.rateLabel}:{" "}
						<span className="font-mono text-foreground">{deploysInWindow}</span>{" "}
						/ {t.rateLimitLabel}:{" "}
						<span className="font-mono text-foreground">
							{DEFAULT_RATE_LIMIT}
						</span>
					</span>
				</div>
			</div>

			{/* CHOISIR une entité + DÉPLOYER (l'action de l'écran) */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-3">
				<h3 className="text-sm font-semibold text-foreground">
					{t.samplesHeading}
				</h3>
				<p className="text-xs text-muted-foreground">{t.samplesHint}</p>
				<div data-testid="v2-deploy-samples" className="flex flex-col gap-2">
					{cases.map((c) => (
						<button
							key={c.id}
							type="button"
							data-testid={`v2-deploy-sample-${c.id}`}
							onClick={() => {
								setSelectedId(c.id);
								setDeployed(false);
								setReDeployed(false);
							}}
							className={[
								"rounded-lg border px-4 py-2 text-left text-sm transition-colors",
								selectedId === c.id
									? "border-primary bg-primary/10 text-primary"
									: "border-border bg-card text-foreground hover:bg-muted",
							].join(" ")}
						>
							{t[c.labelKey] ?? c.id}
						</button>
					))}
				</div>
				<div className="flex flex-wrap gap-2 pt-1">
					<button
						type="button"
						data-testid="v2-deploy-deploy"
						onClick={onDeploy}
						disabled={selected === null}
						className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{t.deployBtn}
					</button>
					<button
						type="button"
						data-testid="v2-deploy-redeploy"
						onClick={() => setReDeployed(true)}
						disabled={selected === null || plan === null}
						className="inline-flex items-center rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
					>
						{t.reDeployBtn}
					</button>
					<button
						type="button"
						data-testid="v2-deploy-reset"
						onClick={() => {
							setSelectedId(null);
							setDeployed(false);
							setReDeployed(false);
						}}
						disabled={selected === null}
						className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
					>
						{t.resetBtn}
					</button>
				</div>
			</div>

			{result === null && (
				<p
					data-testid="v2-deploy-empty"
					className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground"
				>
					{t.empty}
				</p>
			)}

			{/* GARDE REFUSÉE → le BlockReason actionnable (fail-closed, AUCUN plan) */}
			{blocked && (
				<div
					data-testid="v2-deploy-blocked"
					data-code={blocked.code}
					className="rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-4 space-y-3"
				>
					<div className="flex flex-wrap items-center gap-3">
						<span className="text-sm font-semibold text-destructive">
							🔴 {t.blockedHeading}
						</span>
						<span
							data-testid="v2-deploy-blocked-code"
							className="rounded border border-destructive/40 bg-card px-2 py-0.5 font-mono text-[11px] text-destructive"
						>
							{blocked.code}
						</span>
					</div>
					<p className="text-xs text-muted-foreground">{t.blockedHint}</p>
					<p className="text-xs leading-relaxed text-foreground">
						{blocked.explanation}
					</p>
					<div className="space-y-1">
						<p className="text-[11px] font-semibold text-foreground">
							{t.howToFix}
						</p>
						<ul className="list-disc space-y-0.5 pl-5 text-[11px] text-muted-foreground">
							{blocked.how_to_fix.map((h) => (
								<li key={h}>{h}</li>
							))}
						</ul>
					</div>
				</div>
			)}

			{/* GARDE OK → le PLAN : URL live, services, aperçu */}
			{plan && (
				<div data-testid="v2-deploy-plan" className="space-y-6">
					{/* l'EMPREINTE du plan (content-adressé) */}
					<div className="rounded-xl border border-border bg-card px-6 py-4 space-y-2">
						<h3 className="text-sm font-semibold text-foreground">
							{t.planHeading}
						</h3>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
							<span>
								{t.planIdLabel}:{" "}
								<span
									data-testid="v2-deploy-plan-id"
									className="font-mono text-foreground"
								>
									{plan.planId}
								</span>
							</span>
							<span>
								{t.appHashLabel}:{" "}
								<span className="font-mono text-foreground">
									{plan.appHash}
								</span>
							</span>
							<span>
								{t.sourceHashLabel}:{" "}
								<span className="font-mono text-foreground">
									{plan.sourceHash.slice(0, 12)}…
								</span>
							</span>
						</div>
					</div>

					{/* l'URL LIVE (Traefik) */}
					<div className="rounded-xl border border-primary/30 bg-primary/5 px-6 py-4 space-y-2">
						<h3 className="text-sm font-semibold text-foreground">
							{t.urlHeading}
						</h3>
						<p className="text-[11px] text-muted-foreground">{t.urlHint}</p>
						<a
							href={plan.route.url}
							data-testid="v2-deploy-url"
							data-host={plan.route.host}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-2 rounded-md border border-primary bg-card px-3 py-1.5 font-mono text-sm font-medium text-primary transition-colors hover:bg-primary/10"
						>
							{plan.route.url} ↗
						</a>
						<p className="text-[11px] text-muted-foreground">{t.openLive}</p>
					</div>

					{/* le PLAN de CONTENEURISATION (docker-compose) */}
					<div className="space-y-2">
						<h3 className="text-sm font-semibold text-foreground">
							{t.servicesHeading}
						</h3>
						<p className="text-[11px] text-muted-foreground">
							{t.servicesHint}
						</p>
						<div className="overflow-x-auto rounded-xl border border-border">
							<table className="w-full text-left text-xs">
								<thead className="bg-muted/50 text-muted-foreground">
									<tr>
										<th className="px-3 py-2 font-medium">{t.colService}</th>
										<th className="px-3 py-2 font-medium">{t.colImage}</th>
										<th className="px-3 py-2 font-medium">{t.colRole}</th>
									</tr>
								</thead>
								<tbody data-testid="v2-deploy-services">
									{plan.services.map((s) => (
										<tr
											key={s.name}
											data-testid={`v2-deploy-service-${s.name}`}
											className="border-t border-border"
										>
											<td className="px-3 py-2 font-mono text-foreground">
												{s.name}
											</td>
											<td className="px-3 py-2 font-mono">{s.image}</td>
											<td className="px-3 py-2">{s.role}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>

					{/* l'APERÇU LIVE de l'app servie */}
					<div className="space-y-2">
						<h3 className="text-sm font-semibold text-foreground">
							{t.previewHeading}
						</h3>
						<p className="text-[11px] text-muted-foreground">{t.previewHint}</p>
						<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
							<span>
								{t.previewTable}:{" "}
								<span className="font-mono text-foreground">
									{plan.preview.table}
								</span>
							</span>
							{plan.preview.primaryKey && (
								<span>
									{t.previewPrimaryKey}:{" "}
									<span className="font-mono text-foreground">
										{plan.preview.primaryKey}
									</span>
								</span>
							)}
						</div>
						<div className="overflow-x-auto rounded-xl border border-border">
							<table className="w-full text-left text-xs">
								<thead className="bg-muted/50 text-muted-foreground">
									<tr>
										<th className="px-3 py-2 font-medium">{t.colColumn}</th>
										<th className="px-3 py-2 font-medium">{t.colSqlType}</th>
										<th className="px-3 py-2 font-medium">{t.colTsType}</th>
										<th className="px-3 py-2 font-medium">{t.colNullable}</th>
										<th className="px-3 py-2 font-medium">{t.colPrimaryKey}</th>
									</tr>
								</thead>
								<tbody data-testid="v2-deploy-preview">
									{plan.preview.columns.map((col) => (
										<tr
											key={col.name}
											data-testid={`v2-deploy-preview-${col.name}`}
											data-nullable={col.nullable ? "true" : "false"}
											data-pk={col.primaryKey ? "true" : "false"}
											className="border-t border-border"
										>
											<td className="px-3 py-2 font-mono text-foreground">
												{col.name}
											</td>
											<td className="px-3 py-2 font-mono">{col.sqlType}</td>
											<td className="px-3 py-2 font-mono">{col.tsType}</td>
											<td className="px-3 py-2">
												{col.nullable ? t.yes : t.no}
											</td>
											<td className="px-3 py-2">
												{col.primaryKey ? "🔑" : ""}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>

					{/* la PREUVE de re-planification reproductible (l'action de re-planification) */}
					<div className="space-y-2">
						<h3 className="text-sm font-semibold text-foreground">
							{t.reDeployHeading}
						</h3>
						<p className="text-[11px] text-muted-foreground">
							{t.reDeployHint}
						</p>
						{report === null ? (
							<p
								data-testid="v2-deploy-redeploy-prompt"
								className="rounded-xl border border-dashed border-border bg-card px-4 py-3 text-xs text-muted-foreground"
							>
								{t.reDeployBtn} →
							</p>
						) : (
							<div
								data-testid="v2-deploy-redeploy-report"
								data-stable={report.stable ? "true" : "false"}
								className={[
									"rounded-xl border px-4 py-2 text-xs",
									report.stable
										? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600"
										: "border-destructive/40 bg-destructive/5 text-destructive",
								].join(" ")}
							>
								{report.stable ? "🟢" : "🔴"}{" "}
								{report.stable ? t.reDeployStable : t.reDeployDrift} —{" "}
								<span className="font-mono">{report.planId}</span> →{" "}
								<span className="font-mono">{report.url}</span> ({report.rounds}{" "}
								{t.reDeployRounds})
							</div>
						)}
					</div>
				</div>
			)}

			{/* la PROPOSITION (le mur intact) — modifier une source PROPOSE → /goal */}
			<div className="space-y-1.5">
				<button
					type="button"
					data-testid="v2-deploy-propose"
					data-proposes="goal"
					className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
				>
					{t.proposeNote.split(".")[0]} →
				</button>
				<p
					data-testid="v2-deploy-propose-note"
					className="text-[11px] leading-relaxed text-muted-foreground"
				>
					{t.proposeNote}
				</p>
			</div>
		</div>
	);
}
