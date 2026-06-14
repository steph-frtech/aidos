"use client";

import { useMemo, useState } from "react";
import {
	type BlockReason,
	buildDeployPlan,
	DEFAULT_RATE_LIMIT,
	type DeployPlan,
	deployGate,
	type EntityCase,
	entityToSource,
	isBlockedPlan,
	projectOf,
	type ReDeployReport,
	reDeployStable,
} from "@/lib/v2/deploy";
import { deployStackPulumi, type PulumiDeployResult } from "./actions";

/**
 * WB2-22 + item 2 (2026-06-14) — l'AFFICHAGE + le DÉPLOIEMENT de l'app émise, client-only.
 *
 * DEUX CHEMINS DE DÉPLOIEMENT, ADR 0043 amendé (Pulumi = exécution réelle par projet ; compose =
 * projection dérivable jamais exécutée) :
 *   - LE BOUTON PRIMAIRE « Déployer » (v2-deploy-pulumi-btn) lance un VRAI déploiement PULUMI PAR
 *     PROJET via la server action deployStackPulumi(project, entitiesJSON) → `aidospulumi up --project
 *     X --env dev --entities <fichier>` : la full-stack réelle de X (ses PROPRES entités, la projection
 *     pure entityToSource) montée par Pulumi à `X-dev.sagedesk.fr`. On voit l'URL live
 *     (v2-deploy-pulumi-url), les conteneurs (v2-deploy-pulumi-container), le statut.
 *   - LE PLANIFICATEUR DÉTERMINISTE GATÉ (compose, conservé — anti-overwrite §9) : on DÉPLOIE
 *     (v2-deploy-deploy, gaté auth + rate-limit) → l'URL planifiée, le plan de conteneurisation,
 *     l'aperçu live ; on RE-PLANIFIE pour prouver la reproductibilité.
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on BASCULE l'authentification (la garde sécurité d'ADR 0052) ;
 *   - on CHOISIT une entité puis on DÉPLOIE — Pulumi (réel) ou la projection compose (planifiée) ;
 *   - garde refusée (anonyme / quota) → le BlockReason actionnable, AUCUN plan (fail-closed) ;
 *   - on RE-PLANIFIE (v2-deploy-redeploy) → la preuve reproductible (même planId/URL à chaque tour) ;
 *   - on RÉINITIALISE (v2-deploy-reset).
 *
 * LE MUR (§2) : déployer est une action SOUS LA LIGNE (émettre + monter le conteneur) ; l'écran n'écrit
 * AUCUNE vérité. Les entités de X viennent de la projection PURE entityToSource ; l'app émise et son
 * plan sont des PROJECTIONS. Modifier une source PROPOSE → /goal (le bouton de proposition data-proposes).
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
	// Le DÉPLOIEMENT RÉEL PULUMI (item 2) : son occupation et son résultat (URL live / conteneurs / panne).
	const [pulumiBusy, setPulumiBusy] = useState(false);
	const [pulumiResult, setPulumiResult] = useState<PulumiDeployResult | null>(
		null,
	);

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

	// Le projet courant + ses entités (la projection PURE) — le contrat de l'exécuteur Pulumi item 2.
	const project = selected ? projectOf(selected.entity) : "";
	const liveHost = project ? `${project}-dev.sagedesk.fr` : "";

	/**
	 * Le DÉPLOIEMENT RÉEL PULUMI (item 2) — le BOUTON PRIMAIRE. Gaté par la même garde sécurité d'ADR
	 * 0052 (auth + rate-limit) ; on n'exécute QUE si la garde passe (fail-closed). On projette les
	 * entités de X (entityToSource, pure) en JSON puis on lance deployStackPulumi → `aidospulumi up`.
	 * Le mur (§2) : un geste side-effectant gaté, aucune écriture-vérité.
	 */
	async function onDeployPulumi() {
		if (!selected || !gate.allowed) return;
		setPulumiBusy(true);
		setPulumiResult(null);
		try {
			const entitiesJSON = JSON.stringify(
				[entityToSource(selected.entity)],
				null,
				2,
			);
			setPulumiResult(await deployStackPulumi(project, entitiesJSON));
			// Un déploiement réel autorisé consomme aussi une unité de quota (le rate-limit avance).
			setDeploysInWindow((n) => n + 1);
		} catch {
			setPulumiResult({
				status: "error",
				url: null,
				containers: [],
				stack: `${project}-dev`,
				detail: "action indisponible",
			});
		} finally {
			setPulumiBusy(false);
		}
	}

	/** À chaque changement de sélection/auth, on remet à zéro l'état Pulumi (plus de résultat périmé). */
	function resetTransient() {
		setDeployed(false);
		setReDeployed(false);
		setPulumiResult(null);
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
							resetTransient();
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
								resetTransient();
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
					{/* LE BOUTON PRIMAIRE — le VRAI déploiement PULUMI par projet (item 2, ADR 0043 amendé). */}
					<button
						type="button"
						data-testid="v2-deploy-pulumi-btn"
						data-project={project}
						onClick={onDeployPulumi}
						disabled={selected === null || !gate.allowed || pulumiBusy}
						title={selected === null ? undefined : t.pulumiBtnHint}
						className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{pulumiBusy ? t.pulumiBusy : t.pulumiBtn}
					</button>
					{/* LE PLANIFICATEUR DÉTERMINISTE (compose, conservé — projection dérivable, jamais exécutée). */}
					<button
						type="button"
						data-testid="v2-deploy-deploy"
						onClick={onDeploy}
						disabled={selected === null}
						className="inline-flex items-center rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
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
							resetTransient();
						}}
						disabled={selected === null}
						className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
					>
						{t.resetBtn}
					</button>
				</div>

				{/* ── LE DÉPLOIEMENT RÉEL PULUMI (item 2) : l'URL live, les conteneurs, le statut ── */}
				<div
					data-testid="v2-deploy-pulumi"
					className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3"
				>
					<h4 className="text-xs font-semibold text-foreground">
						{t.pulumiHeading}
					</h4>
					<p className="text-[11px] leading-relaxed text-muted-foreground">
						{t.pulumiHint}
					</p>
					{selected !== null && (
						<p className="text-[11px] text-muted-foreground">
							{t.pulumiTargetLabel} :{" "}
							<span
								data-testid="v2-deploy-pulumi-target"
								data-host={liveHost}
								className="font-mono text-foreground"
							>
								{liveHost}
							</span>
						</p>
					)}
					{pulumiResult !== null &&
						(pulumiResult.status === "up" ? (
							<div className="space-y-2">
								<div className="flex flex-wrap items-center gap-2">
									<span
										data-testid="v2-deploy-pulumi-status"
										data-status="up"
										className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600"
									>
										🟢 {t.pulumiUp}
									</span>
									<span className="font-mono text-[10px] text-muted-foreground">
										{pulumiResult.stack}
									</span>
								</div>
								{pulumiResult.url !== null && (
									<a
										href={pulumiResult.url}
										data-testid="v2-deploy-pulumi-url"
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-2 rounded-md border border-primary bg-card px-3 py-1.5 font-mono text-sm font-medium text-primary transition-colors hover:bg-primary/10"
									>
										{pulumiResult.url} ↗
									</a>
								)}
								{pulumiResult.containers.length > 0 && (
									<ul
										data-testid="v2-deploy-pulumi-containers"
										className="flex flex-wrap gap-1.5"
									>
										{pulumiResult.containers.map((c) => (
											<li
												key={c.name}
												data-testid="v2-deploy-pulumi-container"
												data-name={c.name}
												className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-foreground"
											>
												{c.name}
											</li>
										))}
									</ul>
								)}
							</div>
						) : (
							<div className="space-y-1">
								<span
									data-testid="v2-deploy-pulumi-status"
									data-status="error"
									className="inline-flex rounded-full border border-destructive/40 bg-destructive/5 px-2 py-0.5 text-[11px] font-medium text-destructive"
								>
									🔴 {t.pulumiError}
								</span>
								<p
									data-testid="v2-deploy-pulumi-detail"
									className="text-[11px] leading-relaxed text-muted-foreground"
								>
									{pulumiResult.detail}
								</p>
							</div>
						))}
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
