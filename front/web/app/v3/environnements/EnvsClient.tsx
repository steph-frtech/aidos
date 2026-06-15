"use client";

import Link from "next/link";
import { useState } from "react";
import { sessionScreenOverrides } from "@/lib/v3/design/screen-design";
import { deployProjectStackAction } from "./deploy-actions";
import {
	type AppProjection,
	type BuilderState,
	codeDeltaFor,
	type Deployment,
	type EnvName,
	emitApp,
} from "@/lib/v2/builder";
import { envStackOf, type InstanceConfig } from "@/lib/v3/instance";
import { type StackJournalEntry, stackJournalOf } from "@/lib/v3/stack-journal";
import { useV3Session } from "../V3Session";

/**
 * /v3/environnements — LES ENVIRONNEMENTS : l'échelle (state.ladder, une DONNÉE de
 * l'état — le cliquet généralisé, paramétrable par la config d'instance ADR 0062
 * add.) lue sur la session PARTAGÉE (ADR 0060). Les boutons de barreau
 * ENVOIENT la phrase canonique au chat (send — le tour repasse par le réducteur, la
 * loi) ; le DÉPLOIEMENT RÉEL (ADR 0052) RÉUTILISE deployRealAction (/v2/builder →
 * pipeline /ai-lab), gaté sur envs.prod — le geste humain, jamais avant l'échelle.
 *
 * LE PANNEAU D'ENVIRONNEMENT (« Ouvrir l'environnement ») : six onglets — Aperçu ·
 * BDD · Télémétrie · Docs · Tickets · Stack. Tout y est DÉRIVÉ : le journal de stack
 * (stackJournalOf — la projection PURE du log, ADR 0063) et les URLs par PROJET/ENV
 * (envStackOf — le slug du projet dans chaque adresse : l'isolation rendue visible).
 * HONNÊTE : le provisionnement réel par couple projet/environnement = la piste DP.
 *
 * END-USER FRIENDLY TOTAL : copie amicale (« jamais de saut »), les hashes et fichiers
 * TOUJOURS repliés (<details>). LE MUR (§2) : un déploiement in-model est un tour de
 * chat ; le réel est une action SOUS la ligne — aucune écriture-vérité.
 */

type Strings = Record<string, string>;

/** Les libellés AMICAUX déclarés des barreaux canoniques (clé i18n). */
const DECLARED_ENV_TITLES: Record<string, string> = {
	dev: "envDevTitle",
	staging: "envStagingTitle",
	prod: "envProdTitle",
};

/** Les ONGLETS du panneau d'environnement — un jeu DÉCLARÉ et clos (jamais deviné). */
const ENV_TABS = [
	"apercu",
	"db",
	"telemetry",
	"docs",
	"tickets",
	"stack",
] as const;
type EnvTab = (typeof ENV_TABS)[number];

/** Les libellés i18n des onglets (clé déclarée par onglet). */
const ENV_TAB_LABELS: Record<EnvTab, string> = {
	apercu: "envTabApercu",
	db: "envTabDb",
	telemetry: "envTabTelemetry",
	docs: "envTabDocs",
	tickets: "envTabTickets",
	stack: "envTabStack",
};

/** Les BADGES d'action du journal de stack — couleur + libellé i18n DÉCLARÉS. */
const ACTION_BADGES: Partial<
	Record<StackJournalEntry["action"], { labelKey: string; cls: string }>
> = {
	cree: {
		labelKey: "envBadgeCree",
		cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
	},
	resolu: {
		labelKey: "envBadgeResolu",
		cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
	},
	spec: {
		labelKey: "envBadgeSpec",
		cls: "border-primary/40 bg-primary/10 text-primary",
	},
	ebauche: {
		labelKey: "envBadgeEbauche",
		cls: "border-border bg-muted/40 text-muted-foreground",
	},
	publie: {
		labelKey: "envBadgePublie",
		cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
	},
};

/**
 * CLÉ React STABLE par entrée de journal : l'identité de l'entrée + un compteur
 * d'occurrence (le journal est APPEND-ONLY — l'ordre suit le log, jamais re-trié).
 * PURE & DÉTERMINISTE : même liste → mêmes clés.
 */
function keyedEntries(
	entries: readonly StackJournalEntry[],
): { entry: StackJournalEntry; key: string }[] {
	const seen = new Map<string, number>();
	return entries.map((entry) => {
		const base = `${entry.env}-${entry.service}-${entry.action}-${entry.ref}`;
		const n = seen.get(base) ?? 0;
		seen.set(base, n + 1);
		return { entry, key: `${base}-${n}` };
	});
}

/**
 * Le TITRE d'un barreau : la paire FR déclarée pour dev/staging/prod ; un barreau
 * CUSTOM (échelle paramétrée — ex. preprod) prend son nom capitalisé. PURE & TOTALE.
 */
function envTitleOf(t: Strings, name: string): string {
	const key = DECLARED_ENV_TITLES[name];
	if (key !== undefined && t[key] !== undefined) return t[key];
	return name.charAt(0).toUpperCase() + name.slice(1);
}

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
		instanceConfig,
		projectId,
		messages,
		strings: t,
	} = useV3Session();
	// Le PANNEAU D'ENVIRONNEMENT : le barreau ouvert (null = replié) + l'onglet actif.
	const [openEnv, setOpenEnv] = useState<EnvName | null>(null);
	const [tab, setTab] = useState<EnvTab>("apercu");
	// Le DÉPLOIEMENT RÉEL (ADR 0052) : occupation + résultat (URL live / panne douce).
	const [realBusy, setRealBusy] = useState(false);
	const [realResult, setRealResult] = useState<{
		ok: boolean;
		url: string | null;
		detail: string;
	} | null>(null);

	// Le barreau SOMMET de l'échelle (prod par défaut) — le déploiement réel s'y gate :
	// le geste humain n'arrive qu'une fois l'échelle gravie jusqu'en haut (ADR 0052).
	const topEnv = state.ladder[state.ladder.length - 1];
	const topDeployed =
		topEnv !== undefined ? (state.envs[topEnv] ?? null) : null;

	// Le DELTA AU GRAIN CODE (ADR 0056 × 0058) — recalculé à CHAQUE rendu, jamais stocké.
	const codeDelta = codeDeltaFor(
		state.kernels,
		state.tree,
		codeNodes,
		codeEdges,
	);

	// Le JOURNAL DE STACK (ADR 0063) — DÉRIVÉ du log à CHAQUE rendu, jamais saisi ni stocké.
	const journal = stackJournalOf(state);

	/** Le GESTE HUMAIN (ADR 0052) : le pipeline réel /ai-lab, RÉUTILISÉ (jamais un second chemin). */
	const runRealDeploy = async () => {
		setRealBusy(true);
		try {
			// LE VRAI déploiement PAR PROJET : monte la stack docker dédiée du projet courant
			// (server + interpreter + db) derrière <slug>-dev.sagedesk.fr, depuis SES entités —
			// + les ScreenDesign capturés (Design Lab) RÉAPPLIQUÉS sur la vue (la permanence du rouge).
			const app = emitApp(state);
			const master = {
				hash: app.version,
				coords: app.entities.map((e) => ({
					kind: "section" as const,
					entity: e.name,
				})),
			};
			setRealResult(
				await deployProjectStackAction(
					projectId ?? "app",
					app.entities.map((e) => e.name),
					"dev",
					sessionScreenOverrides(master, messages),
				),
			);
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

			{/* ── l'échelle : une carte par barreau (state.ladder — le cliquet généralisé,
			    paramétrable : un barreau de plus est une DONNÉE, jamais un cas codé) ── */}
			<div className="grid gap-3 sm:grid-cols-3">
				{state.ladder.map((name) => {
					const env = state.envs[name] ?? null;
					const drift = driftOf(env, state.kernels);
					return (
						<EnvCard
							key={name}
							name={name}
							title={envTitleOf(t, name)}
							env={env}
							drift={drift}
							disabled={state.kernels.length === 0 || busy}
							onDeploy={() => void send(`déploie l'application en ${name}`)}
							opened={openEnv === name}
							onOpen={() => {
								setOpenEnv((cur) => (cur === name ? null : name));
								setTab("apercu");
							}}
							viewing={openEnv === name && tab === "apercu"}
							onView={() => {
								if (openEnv === name && tab === "apercu") {
									setOpenEnv(null);
								} else {
									setOpenEnv(name);
									setTab("apercu");
								}
							}}
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

			{/* ── le PANNEAU D'ENVIRONNEMENT pleine largeur : Aperçu · BDD · Télémétrie ·
			    Docs · Tickets · Stack — le journal DÉRIVÉ du log + les URLs par projet/env ── */}
			{openEnv !== null && (
				<EnvDetail
					name={openEnv}
					env={state.envs[openEnv] ?? null}
					state={state}
					journal={journal}
					instanceConfig={instanceConfig}
					projectSlug={projectId ?? "app"}
					tab={tab}
					onTab={setTab}
					onClose={() => setOpenEnv(null)}
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
					disabled={topDeployed === null || realBusy}
					title={topDeployed === null ? t.envRealNote : undefined}
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
	opened,
	onOpen,
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
	opened: boolean;
	onOpen: () => void;
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
			{/* · OUVRIR l'environnement : le panneau détaillé pleine largeur (Aperçu ·
			    BDD · Télémétrie · Docs · Tickets · Stack) — une lecture pure du dérivé. */}
			<button
				type="button"
				data-testid={`v3-env-open-${name}`}
				aria-pressed={opened}
				onClick={onOpen}
				className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/40 aria-pressed:border-primary/50 aria-pressed:bg-primary/10"
			>
				{t.envOpenBtn}
			</button>
			{/* · VOIR le résultat : ouvre l'onglet Aperçu de l'app telle que déployée ICI —
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
 * Le PANNEAU D'ENVIRONNEMENT (pleine largeur) : six onglets. L'Aperçu (l'app telle
 * que déployée — EnvPreview réutilisé), la BDD (le moteur ADR 0006 — Doltgres hors
 * prod, le git-for-data ; Postgres en prod — + les POINTS DE RESTAURATION dérivés),
 * la Télémétrie, les Docs et les Tickets (le journal de stack DÉRIVÉ du log —
 * stackJournalOf, jamais saisi) et la Stack (envStackOf : les URLs portent le slug du
 * PROJET — l'isolation par couple projet/environnement rendue visible). HONNÊTE : le
 * provisionnement réel par couple = la piste DP ; ici, la loi des effets, montrée.
 */
function EnvDetail({
	name,
	env,
	state,
	journal,
	instanceConfig,
	projectSlug,
	tab,
	onTab,
	onClose,
	t,
}: {
	name: EnvName;
	env: Deployment | null;
	state: BuilderState;
	journal: readonly StackJournalEntry[];
	instanceConfig: InstanceConfig;
	projectSlug: string;
	tab: EnvTab;
	onTab: (tab: EnvTab) => void;
	onClose: () => void;
	t: Strings;
}) {
	// Les entrées du journal pour CE barreau (les effets hors-env — capture/spec — suivent).
	const entriesFor = (service: StackJournalEntry["service"]) =>
		journal.filter(
			(e) => e.service === service && (e.env === name || e.env === ""),
		);
	// La stack résolue pour CE projet/environnement — chaque URL porte le slug du projet.
	const stack = envStackOf(name, instanceConfig, projectSlug);
	const urlOf = (key: string) => stack.find((s) => s.key === key)?.url ?? "";
	return (
		<section
			data-testid="v3-env-detail"
			data-env={name}
			className="w-full space-y-3 rounded-xl border border-border bg-card p-4"
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-sm font-semibold text-foreground">
					{envTitleOf(t, name)}
				</h2>
				<button
					type="button"
					onClick={onClose}
					className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40"
				>
					{t.envDetailClose}
				</button>
			</div>
			{/* · les ONGLETS — le jeu déclaré et clos (ENV_TABS) */}
			<nav className="flex flex-wrap gap-1 border-b border-border pb-2">
				{ENV_TABS.map((k) => (
					<button
						key={k}
						type="button"
						data-testid="v3-env-tab"
						data-tab={k}
						aria-pressed={tab === k}
						onClick={() => onTab(k)}
						className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
					>
						{t[ENV_TAB_LABELS[k]]}
					</button>
				))}
			</nav>
			{/* · APERÇU : l'app telle que déployée sur CE barreau (le composant réutilisé) */}
			{tab === "apercu" && (
				<EnvPreview
					name={name}
					env={env}
					state={state}
					onClose={onClose}
					t={t}
				/>
			)}
			{/* · BDD : le moteur (ADR 0006) + les points de restauration DÉRIVÉS du log */}
			{tab === "db" && (
				<div className="space-y-3">
					<p className="text-xs leading-relaxed text-muted-foreground">
						{name === "prod" ? t.envDbEnginePostgres : t.envDbEngineDoltgres}
					</p>
					<p className="font-mono text-[11px] text-muted-foreground">
						{urlOf("db")}
					</p>
					<h3 className="text-xs font-semibold text-foreground">
						{t.envDbRestoreHeading}
					</h3>
					{entriesFor("db").length === 0 ? (
						<p className="text-xs text-muted-foreground italic">
							{t.envTabEmpty}
						</p>
					) : (
						<ul className="space-y-1.5">
							{keyedEntries(entriesFor("db")).map(({ entry: e, key }) => (
								<li
									key={key}
									data-testid="v3-env-restore-point"
									className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
								>
									<span className="font-mono text-[11px] text-foreground">
										{e.ref}
									</span>
									<span className="text-xs text-muted-foreground">
										{e.detail}
									</span>
								</li>
							))}
						</ul>
					)}
					{/* · revenir dans le temps du projet = l'Historique (le rejeu, ADR 0060) */}
					<p className="text-xs">
						<Link
							href="/v3/history"
							className="font-medium text-primary hover:underline"
						>
							{t.envDbHistoryNote}
						</Link>
					</p>
				</div>
			)}
			{/* · TÉLÉMÉTRIE : les traces dérivées + l'URL par projet/env + l'observabilité */}
			{tab === "telemetry" && (
				<div className="space-y-3">
					<p className="text-xs text-muted-foreground">
						{t.envServiceUrl} :{" "}
						<span className="font-mono text-[11px] text-foreground">
							{urlOf("telemetry")}
						</span>
					</p>
					<JournalList entries={entriesFor("telemetry")} t={t} />
					<p className="text-xs">
						<Link
							href="/ops-observability"
							className="font-medium text-primary hover:underline"
						>
							{t.envTelemetryLink}
						</Link>
					</p>
				</div>
			)}
			{/* · DOCS : les pages dérivées (ébauche/publiée) + l'URL Fumadocs de CE projet/env */}
			{tab === "docs" && (
				<div className="space-y-3">
					<p className="text-xs text-muted-foreground">
						{t.envServiceUrl} :{" "}
						<span className="font-mono text-[11px] text-foreground">
							{urlOf("docs")}
						</span>
					</p>
					<JournalList entries={entriesFor("docs")} t={t} />
				</div>
			)}
			{/* · TICKETS : les entrées dérivées (créé/résolu/spec), badgées */}
			{tab === "tickets" && (
				<JournalList entries={entriesFor("tickets")} t={t} />
			)}
			{/* · STACK : les lignes envStackOf de CE projet/env (le slug dans chaque URL) */}
			{tab === "stack" && (
				<div className="space-y-3">
					<ul className="space-y-1.5">
						{stack.map((row) => (
							<li
								key={row.key}
								className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
							>
								<span className="text-xs font-medium text-foreground">
									{t[row.labelKey] ?? row.key}
								</span>
								<span className="ml-auto font-mono text-[11px] text-muted-foreground">
									{row.url === "" ? t.instStackUnprovisioned : row.url}
								</span>
								{/* · v0 HONNÊTE sous la ligne « app » : l'URL dev sert l'aperçu ÉMIS
								    du workspace (certificat par défaut possible) — les conteneurs
								    réels par projet/env arrivent avec la piste DP. */}
								{row.key === "app" && (
									<p
										data-testid="v3-env-stack-v0-note"
										className="w-full text-[11px] leading-relaxed text-muted-foreground italic"
									>
										{t.envStackV0Note}
									</p>
								)}
							</li>
						))}
					</ul>
					{/* · l'HONNÊTETÉ : le provisionnement réel par couple projet/env = la piste DP */}
					<p className="text-xs leading-relaxed text-muted-foreground italic">
						{t.envStackNote}
					</p>
				</div>
			)}
		</section>
	);
}

/** Une LISTE d'entrées du journal de stack — badge d'action déclaré + détail amical + réf mono. */
function JournalList({
	entries,
	t,
}: {
	entries: readonly StackJournalEntry[];
	t: Strings;
}) {
	if (entries.length === 0)
		return (
			<p className="text-xs text-muted-foreground italic">{t.envTabEmpty}</p>
		);
	return (
		<ul className="space-y-1.5">
			{keyedEntries(entries).map(({ entry: e, key }) => {
				const badge = ACTION_BADGES[e.action];
				return (
					<li
						key={key}
						className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
					>
						{badge !== undefined && (
							<span
								className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}
							>
								{t[badge.labelKey]}
							</span>
						)}
						<span className="text-xs text-muted-foreground">{e.detail}</span>
						<span className="ml-auto font-mono text-[10px] text-muted-foreground">
							{e.ref}
						</span>
					</li>
				);
			})}
		</ul>
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
