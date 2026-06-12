"use client";

import { useState } from "react";
import { deployRealAction } from "@/app/v2/builder/actions";
import {
	type AppProjection,
	type BuilderState,
	codeDeltaFor,
	type Deployment,
	ENV_LADDER,
	type EnvName,
	emitApp,
} from "@/lib/v2/builder";
import { useV3Session } from "../V3Session";

/**
 * /v3/environnements — LES ENVIRONNEMENTS : l'échelle (ENV_LADDER, une donnée — le
 * cliquet généralisé) lue sur la session PARTAGÉE (ADR 0060). Les boutons de barreau
 * ENVOIENT la phrase canonique au chat (send — le tour repasse par le réducteur, la
 * loi) ; le DÉPLOIEMENT RÉEL (ADR 0052) RÉUTILISE deployRealAction (/v2/builder →
 * pipeline /ai-lab), gaté sur envs.prod — le geste humain, jamais avant l'échelle.
 *
 * END-USER FRIENDLY TOTAL : copie amicale (« jamais de saut »), les hashes et fichiers
 * TOUJOURS repliés (<details>). LE MUR (§2) : un déploiement in-model est un tour de
 * chat ; le réel est une action SOUS la ligne — aucune écriture-vérité.
 */

type Strings = Record<string, string>;

/** L'ÉCART d'un barreau — la dérive vs les kernels courants, CALCULÉE à chaque rendu. */
function driftOf(
	env: Deployment | null,
	kernels: readonly { readonly version: string }[],
): number {
	if (env === null) return kernels.length;
	return kernels.filter((k) => !env.kernelVersions.includes(k.version)).length;
}

/**
 * L'APP TELLE QUE DÉPLOYÉE sur un barreau — la projection RECONSTRUITE depuis les
 * versions de kernels EMBARQUÉES par le déploiement (Deployment.kernelVersions),
 * jamais depuis les kernels courants : on filtre l'état puis on RÉUTILISE emitApp
 * (le même émetteur déterministe — jamais un second chemin). Pure : même
 * déploiement → même app, même version.
 */
function projectionAt(state: BuilderState, env: Deployment): AppProjection {
	const embedded = new Set(env.kernelVersions);
	return emitApp({
		...state,
		kernels: state.kernels.filter((k) => embedded.has(k.version)),
	});
}

export function EnvsClient() {
	const {
		state,
		send,
		busy,
		codeNodes,
		codeEdges,
		strings: t,
	} = useV3Session();
	// L'APERÇU « Voir le résultat » : le barreau ouvert (null = replié) — un toggle.
	const [previewEnv, setPreviewEnv] = useState<EnvName | null>(null);
	// Le DÉPLOIEMENT RÉEL (ADR 0052) : occupation + résultat (URL live / panne douce).
	const [realBusy, setRealBusy] = useState(false);
	const [realResult, setRealResult] = useState<{
		ok: boolean;
		url: string | null;
		detail: string;
	} | null>(null);

	// Les libellés par BARREAU — l'échelle est une DONNÉE : un barreau de plus ici n'est
	// qu'une entrée de libellé, jamais un cas codé.
	const envTitle: Record<EnvName, string> = {
		dev: t.envDevTitle,
		staging: t.envStagingTitle,
		prod: t.envProdTitle,
	};

	// Le DELTA AU GRAIN CODE (ADR 0056 × 0058) — recalculé à CHAQUE rendu, jamais stocké.
	const codeDelta = codeDeltaFor(
		state.kernels,
		state.tree,
		codeNodes,
		codeEdges,
	);

	/** Le GESTE HUMAIN (ADR 0052) : le pipeline réel /ai-lab, RÉUTILISÉ (jamais un second chemin). */
	const runRealDeploy = async () => {
		setRealBusy(true);
		try {
			setRealResult(await deployRealAction());
		} catch {
			setRealResult({ ok: false, url: null, detail: "action indisponible" });
		} finally {
			setRealBusy(false);
		}
	};

	return (
		<div data-testid="v3-envs" className="mx-auto w-full max-w-3xl space-y-6">
			<header className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t.envsTitle}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t.envsIntro}
				</p>
			</header>

			{/* ── l'échelle : une carte par barreau (ENV_LADDER — le cliquet généralisé) ── */}
			<div className="grid gap-3 sm:grid-cols-3">
				{ENV_LADDER.map((name) => {
					const env = state.envs[name];
					const drift = driftOf(env, state.kernels);
					return (
						<EnvCard
							key={name}
							name={name}
							title={envTitle[name]}
							env={env}
							drift={drift}
							disabled={state.kernels.length === 0 || busy}
							onDeploy={() => void send(`déploie l'application en ${name}`)}
							viewing={previewEnv === name}
							onView={() =>
								setPreviewEnv((cur) => (cur === name ? null : name))
							}
							t={t}
						/>
					);
				})}
			</div>
			{state.kernels.length === 0 && (
				<p className="text-xs leading-relaxed text-muted-foreground italic">
					{t.envNoVersionHint}
				</p>
			)}

			{/* ── l'APERÇU : l'app TELLE QUE DÉPLOYÉE sur le barreau choisi (versions embarquées) ── */}
			{previewEnv !== null && (
				<EnvPreview
					name={previewEnv}
					env={state.envs[previewEnv]}
					state={state}
					onClose={() => setPreviewEnv(null)}
					t={t}
				/>
			)}

			{/* ── le DÉPLOIEMENT RÉEL (ADR 0052) — gaté sur l'échelle gravie jusqu'en prod ── */}
			<section className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
				<h2 className="text-sm font-semibold text-foreground">
					{t.envRealTitle}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t.envRealNote}
				</p>
				<button
					type="button"
					data-testid="v3-deploy-real"
					disabled={state.envs.prod === null || realBusy}
					title={state.envs.prod === null ? t.envRealNote : undefined}
					onClick={runRealDeploy}
					className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{realBusy ? t.envRealBusy : t.envRealBtn}
				</button>
				{realResult !== null &&
					(realResult.ok && realResult.url !== null ? (
						<p className="text-xs text-foreground">
							{t.envRealUrl} :{" "}
							<a
								href={realResult.url}
								target="_blank"
								rel="noreferrer"
								className="font-medium text-primary hover:underline"
							>
								{realResult.url}
							</a>
						</p>
					) : (
						<p className="text-xs text-destructive">
							{t.envRealFailed} : {realResult.detail}
						</p>
					))}
			</section>

			{/* ── le DELTA AU GRAIN CODE (ADR 0056 × 0058) — « quelles fonctions exactes » ── */}
			<section
				data-testid="v3-code-delta"
				className="space-y-3 rounded-xl border border-border bg-card p-4"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t.envDeltaTitle}
				</h2>
				{codeDelta.length === 0 ||
				codeDelta.every((d) => d.anchors.length === 0) ? (
					<p className="text-xs text-muted-foreground italic">
						{t.envDeltaEmpty}
					</p>
				) : (
					<ul className="space-y-3">
						{codeDelta.map((d) => (
							<li key={d.kernelVersion} className="space-y-1.5">
								<div className="flex flex-wrap items-center gap-1.5">
									{d.anchors.map((a) => (
										<span
											key={a.nodeId}
											className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground"
										>
											{a.name}
										</span>
									))}
									<span className="ml-auto rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
										{t.envDeltaWave.replace("%n%", String(d.waveSize))}
									</span>
								</div>
								{/* · le détail technique (hash de version, fichiers) — toujours replié */}
								<details
									data-testid="v3-details"
									className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
								>
									<summary className="cursor-pointer text-xs font-medium text-muted-foreground">
										{t.detailsLabel}
									</summary>
									<div className="mt-2 space-y-1">
										<p className="font-mono text-[11px] text-muted-foreground">
											{d.kernelVersion}
										</p>
										<ul className="space-y-1">
											{d.anchors.map((a) => (
												<li
													key={a.nodeId}
													className="font-mono text-[11px] text-muted-foreground"
												>
													{a.name} — {a.file}
												</li>
											))}
										</ul>
									</div>
								</details>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}

/**
 * Une carte de BARREAU : la version posée (ou « jamais déployé »), le badge d'écart
 * (data-drift — vert à 0, ambre sinon) et le bouton qui ENVOIE la phrase canonique au
 * chat — le geste reste un tour de chat (la source unique de vérité), jamais un écrit
 * direct de l'écran (le mur, §2).
 */
function EnvCard({
	name,
	title,
	env,
	drift,
	disabled,
	onDeploy,
	viewing,
	onView,
	t,
}: {
	name: EnvName;
	title: string;
	env: Deployment | null;
	drift: number;
	disabled: boolean;
	onDeploy: () => void;
	viewing: boolean;
	onView: () => void;
	t: Strings;
}) {
	return (
		<div
			data-testid={`v3-env-${name}`}
			className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-xs font-semibold text-foreground">{title}</span>
				<span
					data-drift={drift}
					className={[
						"ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium",
						drift === 0
							? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
							: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
					].join(" ")}
				>
					{drift === 0
						? t.envUpToDate
						: t.envDrift.replace("%n%", String(drift))}
				</span>
			</div>
			{env === null ? (
				<p className="text-xs text-muted-foreground italic">{t.envNever}</p>
			) : (
				<>
					<p className="font-mono text-[11px] text-foreground">{env.version}</p>
					<p className="text-[10px] text-muted-foreground">
						{t.envKernelsLabel} : {env.kernelVersions.length}
					</p>
				</>
			)}
			<button
				type="button"
				data-testid={`v3-env-deploy-${name}`}
				disabled={disabled}
				onClick={onDeploy}
				className="mt-auto rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{t.envDeployBtn.replace("%env%", name)}
			</button>
			{/* · VOIR le résultat : ouvre l'aperçu de l'app telle que déployée ICI —
			    une lecture pure (toujours cliquable : le jamais-déployé a son état vide). */}
			<button
				type="button"
				data-testid={`v3-env-view-${name}`}
				aria-pressed={viewing}
				onClick={onView}
				className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/40 aria-pressed:border-primary/50 aria-pressed:bg-primary/10"
			>
				{t.envViewBtn}
			</button>
		</div>
	);
}

/**
 * L'APERÇU « VOIR le résultat » : l'app TELLE QUE DÉPLOYÉE sur le barreau — une
 * vitrine simulée (un onglet de navigation par route, une carte par entité)
 * RECONSTRUITE des seules versions de kernels embarquées par le déploiement, jamais
 * des kernels courants (projectionAt × emitApp — déterminisme-first). Le barreau
 * jamais déployé a son état vide amical ; la PROD ajoute le lien vers l'app réelle
 * (le pipeline réel ADR 0052). Les hashes restent repliés (<details>).
 */
function EnvPreview({
	name,
	env,
	state,
	onClose,
	t,
}: {
	name: EnvName;
	env: Deployment | null;
	state: BuilderState;
	onClose: () => void;
	t: Strings;
}) {
	const app = env === null ? null : projectionAt(state, env);
	return (
		<section
			data-testid="v3-env-preview"
			className="space-y-3 rounded-xl border border-border bg-card p-4"
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-sm font-semibold text-foreground">
					{t.envPreviewTitle.replace("%env%", name)}
				</h2>
				{/* · la PUCE DE VERSION : la version posée par le déploiement (content-adressée) */}
				{env !== null && (
					<span
						title={t.envPreviewVersionLabel}
						className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
					>
						{env.version}
					</span>
				)}
				<button
					type="button"
					onClick={onClose}
					className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40"
				>
					{t.envPreviewClose}
				</button>
			</div>
			{app === null ? (
				<p className="text-xs leading-relaxed text-muted-foreground italic">
					{t.envPreviewEmpty}
				</p>
			) : (
				<>
					{/* · la FENÊTRE SIMULÉE : la vitrine amicale de l'app émise sur ce barreau */}
					<div className="overflow-hidden rounded-lg border border-border">
						<div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
							<span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
							<span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
							<span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
							<span className="ml-2 truncate font-mono text-[10px] text-muted-foreground">
								app.{name} · {app.version}
							</span>
						</div>
						{app.routes.length === 0 ? (
							<p className="bg-background p-3 text-xs text-muted-foreground italic">
								{t.envPreviewNoData}
							</p>
						) : (
							<>
								{/* un ONGLET par route émise (la première active, purement visuelle) */}
								<nav
									aria-label={t.envPreviewPagesLabel}
									className="flex flex-wrap gap-1 border-b border-border bg-background px-3 py-2"
								>
									{app.routes.map((route, i) => (
										<span
											key={route}
											className={[
												"rounded-md px-2 py-0.5 text-[11px] font-medium capitalize",
												i === 0
													? "bg-primary text-primary-foreground"
													: "text-muted-foreground",
											].join(" ")}
										>
											{route.slice(1)}
										</span>
									))}
								</nav>
								{/* une CARTE par entité embarquée (le contenu simulé, jamais inventé) */}
								<div className="grid gap-2 bg-background p-3 sm:grid-cols-2">
									{app.entities.map((e) => (
										<div
											key={e.version}
											className="space-y-1.5 rounded-md border border-border bg-card p-3"
										>
											<p className="text-xs font-medium text-foreground capitalize">
												{e.name}
											</p>
											<div className="h-2 w-3/4 rounded bg-muted" />
											<div className="h-2 w-1/2 rounded bg-muted" />
										</div>
									))}
								</div>
							</>
						)}
					</div>
					{/* · la PROD pointe vers l'app réelle (le pipeline réel ADR 0052) */}
					{name === "prod" && (
						<p className="text-xs text-foreground">
							{t.envPreviewRealApp} :{" "}
							<a
								href="https://alphashop.sagedesk.fr"
								target="_blank"
								rel="noreferrer"
								className="font-medium text-primary hover:underline"
							>
								alphashop.sagedesk.fr
							</a>{" "}
							<span className="text-muted-foreground">
								({t.envPreviewRealPipeline})
							</span>
						</p>
					)}
					{/* · le détail technique (versions embarquées) — toujours replié */}
					<details
						data-testid="v3-details"
						className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
					>
						<summary className="cursor-pointer text-xs font-medium text-muted-foreground">
							{t.detailsLabel}
						</summary>
						<ul className="mt-2 space-y-1">
							{app.entities.map((e) => (
								<li
									key={e.version}
									className="font-mono text-[11px] text-muted-foreground"
								>
									{e.name} — {e.version}
								</li>
							))}
						</ul>
					</details>
				</>
			)}
		</section>
	);
}
