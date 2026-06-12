"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
	applyIntent,
	type BuilderEvent,
	type BuilderImpact,
	type BuilderState,
	classifyIntent,
	codeDeltaFor,
	type Deployment,
	ENV_LADDER,
	type EnvName,
	emitApp,
	type IntentKind,
	initBuilderState,
	type ScreenRef,
	type Understanding,
	understand,
} from "@/lib/v2/builder";
import type { CodeEdge, CodeNode } from "@/lib/v2/code-graph";
import { nodePath, type Position, positionOf } from "@/lib/v2/composition";
import {
	buildKernelTree,
	type KernelNode,
	type TreeNode,
} from "@/lib/v2/kernel-tree";
import { deployRealAction, reformulateAction } from "./actions";

/**
 * WB2-27 — le CLIENT du IA Builder (ADR 0057) : UN chat qui fait tout, mais « tout » passe
 * par la GRAMMAIRE FERMÉE du twin pur lib/v2/builder (understand/applyIntent). Le tour est
 * ULTRA-EXPLICITE : « l'attente » (le verdict de compréhension), « les types de réponse
 * possibles » (TOUS les candidats, cliquables), « la réponse » (les événements, jeu clos) et
 * « les impacts » (la vague calculée) sont TOUJOURS visibles — l'ambiguïté est OFFERTE
 * (chips), jamais tranchée en silence.
 *
 * DÉTERMINISME-FIRST (§6/§8) : TOUT le calcul est délégué au twin pur ; ce composant n'est
 * QUE du rendu + l'état d'écran event-sourcé (tours append-only, BuilderState réduit par
 * applyIntent). Le LLM (« Reformuler avec Claude ») est l'exception gatée : sa phrase
 * repasse par le MÊME pipeline — le code a l'autorité.
 *
 * LE MUR (§2) : le chat PROPOSE — hasMirror=false, wroteKernel=false, déploiement gaté ;
 * aucune écriture kernel/mirrors/fitness.
 */

type Strings = Record<string, string>;

/** Un TOUR de chat : le message + le verdict + la réponse + la vague (append-only). */
interface Turn {
	readonly msg: string;
	readonly understanding: Understanding;
	readonly events: readonly BuilderEvent[];
	readonly impacts: readonly BuilderImpact[];
	/** La note Claude : null (rien), "rewritten" (phrase réécrite re-jugée), "failed" (panne → note neutre). */
	readonly claudeNote: "rewritten" | "failed" | null;
}

/**
 * Les amorces canoniques (prouvées par le miroir) — la grammaire FERMÉE à 9 intentions,
 * FRANÇAISE, verbatim : le CYCLE DE VIE COMPLET (capturer → greffer → promouvoir → générer
 * → déployer test → staging → prod (l'échelle) → delta → impacter/interroger → ouvrir).
 */
const SUGGESTIONS: readonly string[] = [
	"greffe pommes sous app/catalogue",
	"capture l'idée : au checkout, débiter le compte une seule fois",
	"promeus la dernière idée",
	"génère l'application",
	"déploie l'application en test",
	"déploie l'application en staging",
	"déploie l'application en prod",
	"montre le delta depuis la prod",
	"quel impact si je modifie app/paiement",
	"montre-moi l'état du projet",
	"ouvre l'écran code",
];

/** Le verbe FORT canonique par intention — le préfixe de désambiguïsation (déclaré, jamais appris). */
const FORCE_PREFIX: Record<IntentKind, string> = {
	capturer_idee: "capture l'idée : ",
	greffer: "greffe ",
	promouvoir: "promeus ",
	generer: "génère ",
	deployer: "déploie ",
	delta: "delta ",
	impacter: "impact ",
	interroger: "montre ",
	ouvrir: "ouvre ",
};

/**
 * LA DÉSAMBIGUÏSATION DÉTERMINISTE (le « trick », documenté) : le twin n'a pas de paramètre
 * kind-override — forcer une intention se fait en COMPOSANT un texte désambiguïsé qui repasse
 * par le MÊME pipeline understand/applyIntent (le code garde l'autorité, jamais un choix
 * silencieux de l'écran) :
 *   1. on RETIRE du message les mots qui accrochent une AUTRE intention sans accrocher celle
 *      choisie (mesuré mot à mot par classifyIntent — l'algorithme du twin lui-même, jamais
 *      un lexique dupliqué côté écran) ;
 *   2. on PRÉPOSE le verbe fort canonique de l'intention choisie (FORCE_PREFIX) — le payload
 *      original (libellés, chemins a/b/c) reste dans le texte.
 * PURE & DÉTERMINISTE : même (message, intention) → même texte → même tour. Si une égalité
 * persiste malgré tout, le réducteur refuse à nouveau (fail-closed) et les chips restent.
 */
function forceText(kind: IntentKind, original: string): string {
	const kept = original
		.split(/\s+/)
		.filter((w) => {
			const cands = classifyIntent(w);
			const top = cands[0];
			if (top.score === 0) return true; // mot neutre : gardé verbatim
			const mine = cands.find((c) => c.kind === kind);
			// un mot qui n'accroche QUE d'autres intentions est retiré (il créait l'égalité)
			return (mine?.score ?? 0) >= top.score;
		})
		.join(" ");
	return `${FORCE_PREFIX[kind]}${kept}`;
}

/**
 * Le badge de POSITION (jamais stocké — positionOf, ADR 0055) : racine / feuille · nN / nN.
 * JAMAIS un nom de niveau — l'arbre est illimité (§49), chaque nœud EST un kernel.
 */
function PositionBadge({ position, t }: { position: Position; t: Strings }) {
	const label = position.isRoot
		? t.posRacine
		: position.isLeaf
			? `${t.posFeuille} · n${position.depth}`
			: `n${position.depth}`;
	return (
		<span
			title={t.posDepthTitle}
			className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
		>
			{label}
		</span>
	);
}

/**
 * La liste IMBRIQUÉE de l'arbre composes (récursive, même motif que le picker /v2/idee) —
 * chaque nœud porte son chemin (data-path) et rougit quand un impact cliqué le cible
 * (data-impacted) : la preuve visible que le chat AGIT sur l'arbre.
 */
function BuilderTreeNodes({
	nodes,
	tree,
	highlighted,
	t,
}: {
	nodes: readonly TreeNode[];
	tree: readonly KernelNode[];
	highlighted: string | null;
	t: Strings;
}) {
	return (
		<ul className="space-y-1">
			{nodes.map((n) => {
				const path = nodePath(tree, n.id).join("/");
				const hit = highlighted !== null && path === highlighted;
				return (
					<li key={n.id} className={n.depth > 0 ? "pl-4" : undefined}>
						<div
							data-testid="v2-builder-tree-node"
							data-path={path}
							data-impacted={hit || undefined}
							className={[
								"flex items-center gap-2 rounded-md border px-2 py-1 text-sm",
								hit
									? "border-destructive/40 bg-destructive/10 text-destructive"
									: "border-transparent text-foreground",
							].join(" ")}
						>
							<span>{n.label}</span>
							<PositionBadge position={positionOf(tree, n.id)} t={t} />
						</div>
						{n.children.length > 0 && (
							<BuilderTreeNodes
								nodes={n.children}
								tree={tree}
								highlighted={highlighted}
								t={t}
							/>
						)}
					</li>
				);
			})}
		</ul>
	);
}

/** Les classes du badge de statut : comprise = primaire, ambigue = ambre (attendu), incomprise = neutre. */
const STATUS_CLASSES: Record<Understanding["status"], string> = {
	comprise: "border-primary/40 bg-primary/10 text-primary",
	ambigue:
		"border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
	incomprise: "border-border bg-muted text-muted-foreground",
};

/** Les 4 onglets du panneau droit — l'état VIVANT sous quatre angles (l'arbre par défaut). */
const TAB_IDS = ["arbre", "app", "envs", "journal"] as const;
type TabId = (typeof TAB_IDS)[number];

/**
 * Une carte d'ENVIRONNEMENT (test ou prod) : la version déployée (ou « jamais déployé »),
 * le nombre de kernels embarqués, le badge ÉCART (la dérive vs l'app courante — CALCULÉE à
 * chaque rendu, jamais stockée : vert 0 / ambre N) et le bouton d'action qui ENVOIE la
 * phrase canonique au chat — le geste humain reste un tour de chat (la source unique de
 * vérité), jamais un écrit direct de l'écran (le mur, §2).
 */
function EnvCard({
	testid,
	title,
	env,
	drift,
	deployTestid,
	deployLabel,
	gateNote,
	disabled,
	onDeploy,
	t,
}: {
	testid: string;
	title: string;
	env: Deployment | null;
	drift: number;
	deployTestid: string;
	deployLabel: string;
	gateNote: string | null;
	disabled: boolean;
	onDeploy: () => void;
	t: Strings;
}) {
	return (
		<div
			data-testid={testid}
			className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
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
					{t.envEcartLabel} : {drift}
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
				data-testid={deployTestid}
				disabled={disabled}
				title={disabled ? t.envNoKernelHint : t.envSendHint}
				onClick={onDeploy}
				className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{deployLabel}
			</button>
			{gateNote !== null && (
				<p className="text-[10px] leading-relaxed text-muted-foreground italic">
					{gateNote}
				</p>
			)}
		</div>
	);
}

export function BuilderClient({
	t,
	v1Screens,
	codeNodes,
	codeEdges,
}: {
	t: Strings;
	/** Les écrans V1 scannés côté serveur (app/<dir>) — injectés en DONNÉES dans le twin. */
	v1Screens: readonly ScreenRef[];
	/** Le graphe de code extrait côté serveur (le motif /v2/code) — le delta au grain code. */
	codeNodes: readonly CodeNode[];
	codeEdges: readonly CodeEdge[];
}) {
	// ── l'état d'écran event-sourcé : l'état réduit + les tours (append-only) ──────────
	const [builderState, setBuilderState] = useState<BuilderState>(() =>
		initBuilderState(v1Screens),
	);
	const [turns, setTurns] = useState<readonly Turn[]>([]);
	const [input, setInput] = useState("");
	const [highlighted, setHighlighted] = useState<string | null>(null);
	const [claudeBusy, setClaudeBusy] = useState<number | null>(null);
	const [tab, setTab] = useState<TabId>("arbre");
	// Le DÉPLOIEMENT RÉEL (ADR 0052) : le geste humain, son occupation et son résultat (URL live / panne).
	const [realBusy, setRealBusy] = useState(false);
	const [realResult, setRealResult] = useState<{
		ok: boolean;
		url: string | null;
		detail: string;
	} | null>(null);

	// La référence vers l'état courant (évite une fermeture périmée après un await Claude).
	const stateRef = useRef(builderState);

	const intentLabel: Record<IntentKind, string> = {
		capturer_idee: t.intentCapturerIdee,
		greffer: t.intentGreffer,
		promouvoir: t.intentPromouvoir,
		generer: t.intentGenerer,
		deployer: t.intentDeployer,
		delta: t.intentDelta,
		impacter: t.intentImpacter,
		interroger: t.intentInterroger,
		ouvrir: t.intentOuvrir,
	};
	const tabLabel: Record<TabId, string> = {
		arbre: t.tabArbre,
		app: t.tabApp,
		envs: t.tabEnvs,
		journal: t.tabJournal,
	};
	const statusLabel: Record<Understanding["status"], string> = {
		comprise: t.statusComprise,
		ambigue: t.statusAmbigue,
		incomprise: t.statusIncomprise,
	};

	/** UN TOUR : understand + applyIntent (le réducteur pur), puis append — jamais de mutation. */
	const send = (raw: string) => {
		const text = raw.trim();
		if (text === "") return;
		const cur = stateRef.current;
		const u = understand(cur, text);
		const r = applyIntent(cur, text);
		stateRef.current = r.state;
		setBuilderState(r.state);
		setTurns((prev) => [
			...prev,
			{
				msg: text,
				understanding: u,
				events: r.events,
				impacts: r.impacts,
				claudeNote: null,
			},
		]);
		setInput("");
	};

	/** FORCER une intention (chip cliquée) : le texte désambiguïsé repasse par le MÊME pipeline. */
	const force = (kind: IntentKind, original: string) =>
		send(forceText(kind, original));

	/** L'exception gatée : Claude reformule, puis le code re-juge (autorité déterministe). */
	const askClaude = async (turnIndex: number, original: string) => {
		setClaudeBusy(turnIndex);
		try {
			const out = await reformulateAction(original);
			setTurns((prev) =>
				prev.map((turn, i) =>
					i === turnIndex
						? { ...turn, claudeNote: out === null ? "failed" : "rewritten" }
						: turn,
				),
			);
			if (out !== null) send(out.text);
		} catch {
			setTurns((prev) =>
				prev.map((turn, i) =>
					i === turnIndex ? { ...turn, claudeNote: "failed" } : turn,
				),
			);
		} finally {
			setClaudeBusy(null);
		}
	};

	const built = buildKernelTree(builderState.tree);

	// L'APP GÉNÉRÉE — une PROJECTION pure recalculée à CHAQUE rendu (jamais stockée) :
	// même état → même version app:<hash> (le contenu décide, jamais l'horloge).
	const app = emitApp(builderState);

	// L'ÉCART d'un environnement : les kernels proposés dont la version n'est pas embarquée —
	// CALCULÉ (jamais stocké) ; aucun déploiement → tout est écart (le motif du twin, delta).
	const driftOf = (env: Deployment | null): number =>
		env === null
			? builderState.kernels.length
			: builderState.kernels.filter(
					(k) => !env.kernelVersions.includes(k.version),
				).length;

	// Les libellés par BARREAU — l'échelle est une DONNÉE (ENV_LADDER) : ajouter un barreau
	// au twin n'ajoute ici qu'une entrée de libellé, jamais un cas codé.
	const envTitle: Record<EnvName, string> = {
		test: t.envTestTitle,
		staging: t.envStagingTitle,
		prod: t.envProdTitle,
	};
	const envDeployLabel: Record<EnvName, string> = {
		test: t.deployTestBtn,
		staging: t.deployStagingBtn,
		prod: t.deployProdBtn,
	};

	// Le DELTA AU GRAIN CODE (ADR 0056 × 0058) — « quelles fonctions exactes » par kernel
	// proposé : recalculé à CHAQUE rendu sur le graphe extrait du source réel (jamais stocké).
	const codeDelta = codeDeltaFor(
		builderState.kernels,
		builderState.tree,
		codeNodes,
		codeEdges,
	);

	/** Le GESTE HUMAIN (ADR 0052) : déclencher le pipeline réel /ai-lab — server action, gatée par envs.prod. */
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
		<div className="grid gap-6 lg:grid-cols-[11fr_9fr]">
			{/* ════════════ GAUCHE — LE CHAT (l'unique porte d'entrée) ════════════ */}
			<section
				data-testid="v2-builder-chat"
				className="space-y-4 rounded-xl border border-border bg-card p-4"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t.chatHeading}
				</h2>

				{/* ── la liste des tours : message utilisateur puis carte assistant ultra-explicite ── */}
				<div className="space-y-4">
					{turns.length === 0 && (
						<p className="text-sm text-muted-foreground italic">
							{t.chatEmpty}
						</p>
					)}
					{turns.map((turn, ti) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: les tours sont APPEND-ONLY — l'index EST la position stable
							key={ti}
							className="space-y-2"
						>
							{/* la bulle utilisateur */}
							<div className="flex justify-end">
								<p className="max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
									{turn.msg}
								</p>
							</div>

							{/* la carte assistant : ATTENTE → TYPES DE RÉPONSE → RÉPONSE → IMPACTS */}
							<div className="space-y-3 rounded-xl rounded-bl-sm border border-border bg-background p-3">
								{/* · « L'ATTENTE » — le verdict understand() */}
								<div data-testid="v2-builder-attente" className="space-y-1">
									<h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
										{t.attenteHeading}
									</h3>
									<div className="flex flex-wrap items-center gap-2">
										<span
											className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASSES[turn.understanding.status]}`}
										>
											{statusLabel[turn.understanding.status]}
										</span>
										<span className="text-sm text-foreground">
											{turn.understanding.attente !== null
												? intentLabel[turn.understanding.attente]
												: t.attenteNone}
										</span>
									</div>
								</div>

								{/* · « TYPES DE RÉPONSE POSSIBLES » — TOUS les candidats score > 0, cliquables */}
								<div data-testid="v2-builder-candidates" className="space-y-1">
									<h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
										{t.candidatesHeading}
									</h3>
									{turn.understanding.candidates.filter((c) => c.score > 0)
										.length === 0 ? (
										<p className="text-xs text-muted-foreground italic">
											{t.candidatesEmpty}
										</p>
									) : (
										<div className="flex flex-wrap items-center gap-1.5">
											{turn.understanding.candidates
												.filter((c) => c.score > 0)
												.map((c) => (
													<button
														key={c.kind}
														type="button"
														data-testid="v2-builder-candidate"
														data-kind={c.kind}
														title={t.candidatesHint}
														onClick={() => force(c.kind, turn.msg)}
														className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
													>
														<span>{intentLabel[c.kind]}</span>
														<span className="rounded bg-primary/10 px-1 font-mono text-[10px] text-primary">
															{c.score}
														</span>
													</button>
												))}
										</div>
									)}
								</div>

								{/* · « RÉPONSE » — les événements du réducteur (refus en ambre : attendu, pas une panne) */}
								<div data-testid="v2-builder-events" className="space-y-1">
									<h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
										{t.eventsHeading}
									</h3>
									<ul className="space-y-1">
										{turn.events.map((e, ei) => (
											<li
												// biome-ignore lint/suspicious/noArrayIndexKey: les événements d'un tour sont positionnels (append-only)
												key={ei}
												className={[
													"flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-xs",
													e.kind === "refus"
														? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
														: "border-border bg-muted/30 text-foreground",
												].join(" ")}
											>
												<span
													className={[
														"rounded border px-1.5 py-0.5 font-mono text-[10px]",
														e.kind === "refus"
															? "border-amber-500/40 bg-amber-500/10"
															: "border-border bg-card text-muted-foreground",
													].join(" ")}
												>
													{/* un déploiement porte son BARREAU (deploiement · test|staging|prod) */}
													{e.env !== undefined
														? `${e.kind} · ${e.env}`
														: e.kind}
												</span>
												<span className="leading-relaxed">{e.detail}</span>
												{/* un écran ouvert devient une PUCE DE NAVIGATION — le chat atteint TOUT le Workbench */}
												{e.kind === "ecran_ouvert" ? (
													<Link
														href={e.ref}
														data-testid="v2-builder-open-screen"
														data-route={e.ref}
														className="ml-auto flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
													>
														<span>{t.openScreen}</span>
														<span className="font-mono text-[10px]">
															{e.ref} →
														</span>
													</Link>
												) : (
													e.ref !== "" && (
														<span className="ml-auto font-mono text-[10px] text-muted-foreground">
															{e.ref}
														</span>
													)
												)}
											</li>
										))}
									</ul>
								</div>

								{/* · « IMPACTS » — la vague calculée ; une cible composes cliquée rougit dans l'arbre */}
								<div data-testid="v2-builder-impacts" className="space-y-1">
									<h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
										{t.impactsHeading}
									</h3>
									{turn.impacts.length === 0 ? (
										<p className="text-xs text-muted-foreground italic">
											{t.impactsEmpty}
										</p>
									) : (
										<div className="flex flex-wrap gap-1.5">
											{turn.impacts.map((imp) => {
												const chip = (
													<>
														<span className="font-mono">{imp.cible}</span>
														<span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
															{imp.type}
														</span>
													</>
												);
												return imp.type === "composes" ? (
													<button
														key={`${imp.type}:${imp.cible}`}
														type="button"
														data-testid="v2-builder-impact"
														data-cible={imp.cible}
														onClick={() => setHighlighted(imp.cible)}
														className="flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/5 px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-destructive/10"
													>
														{chip}
													</button>
												) : (
													<span
														key={`${imp.type}:${imp.cible}`}
														data-testid="v2-builder-impact"
														data-cible={imp.cible}
														className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-foreground"
													>
														{chip}
													</span>
												);
											})}
										</div>
									)}
								</div>

								{/* · l'exception gatée : reformuler un tour AMBIGU avec Claude (le code re-juge) */}
								{turn.understanding.status === "ambigue" && (
									<div className="flex flex-wrap items-center gap-2">
										<button
											type="button"
											data-testid="v2-builder-claude"
											disabled={claudeBusy !== null}
											onClick={() => askClaude(ti, turn.msg)}
											className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
										>
											{claudeBusy === ti ? t.claudeBusy : t.claudeBtn}
										</button>
										{turn.claudeNote === "failed" && (
											<span className="text-xs text-muted-foreground italic">
												{t.claudeFailed}
											</span>
										)}
										{turn.claudeNote === "rewritten" && (
											<span className="text-xs text-muted-foreground">
												{t.claudeRewritten}
											</span>
										)}
									</div>
								)}
							</div>
						</div>
					))}
				</div>

				{/* ── les amorces canoniques (les 6 exemples prouvés par le miroir) ── */}
				<div className="space-y-1">
					<p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
						{t.suggestionsLabel}
					</p>
					<div className="flex flex-wrap gap-1.5">
						{SUGGESTIONS.map((s) => (
							<button
								key={s}
								type="button"
								data-testid="v2-builder-suggestion"
								onClick={() => send(s)}
								className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
							>
								{s}
							</button>
						))}
					</div>
				</div>

				{/* ── la saisie : Entrée envoie (Maj+Entrée = nouvelle ligne) ── */}
				<div className="flex items-end gap-2">
					<textarea
						data-testid="v2-builder-input"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								send(input);
							}
						}}
						placeholder={t.inputPlaceholder}
						rows={2}
						className="min-h-[3rem] flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
					/>
					<button
						type="button"
						data-testid="v2-builder-send"
						onClick={() => send(input)}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					>
						{t.send}
					</button>
				</div>
			</section>

			{/* ════════════ DROITE — L'ÉTAT VIVANT (la preuve que le chat agit) ════════════ */}
			<div className="space-y-4">
				{/* · les 4 onglets : Arbre · App générée · Environnements · Journal */}
				<div className="flex flex-wrap gap-1.5">
					{TAB_IDS.map((id) => (
						<button
							key={id}
							type="button"
							data-testid="v2-builder-tab"
							data-tab={id}
							data-active={tab === id || undefined}
							onClick={() => setTab(id)}
							className={[
								"rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
								tab === id
									? "border-primary/40 bg-primary/10 text-primary"
									: "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
							].join(" ")}
						>
							{tabLabel[id]}
						</button>
					))}
				</div>

				{/* · ARBRE — les greffes du chat y apparaissent ; une cible d'impact rougit */}
				{tab === "arbre" && (
					<section
						data-testid="v2-builder-tree"
						className="space-y-2 rounded-xl border border-border bg-card p-4"
					>
						<h2 className="text-sm font-semibold text-foreground">
							{t.treeHeading}
						</h2>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{t.treeHint}
						</p>
						{built.ok && (
							<BuilderTreeNodes
								nodes={built.roots}
								tree={builderState.tree}
								highlighted={highlighted}
								t={t}
							/>
						)}
					</section>
				)}

				{/* · APP GÉNÉRÉE — emitApp(état) : une PROJECTION pure, recalculée, jamais stockée */}
				{tab === "app" && (
					<section
						data-testid="v2-builder-app"
						className="space-y-3 rounded-xl border border-border bg-card p-4"
					>
						<h2 className="text-sm font-semibold text-foreground">
							{t.appHeading}
						</h2>
						{builderState.kernels.length === 0 ? (
							<p className="text-xs text-muted-foreground italic">
								{t.appEmpty}
							</p>
						) : (
							<>
								<span className="inline-flex rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] text-primary">
									{app.version}
								</span>
								<div className="space-y-1">
									<h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
										{t.appEntitiesHeading}
									</h3>
									<ul className="space-y-1">
										{app.entities.map((e) => (
											<li
												key={e.version}
												className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-foreground"
											>
												<span>{e.name}</span>
												<span className="ml-auto font-mono text-[10px] text-muted-foreground">
													{e.version}
												</span>
											</li>
										))}
									</ul>
								</div>
								<div className="space-y-1">
									<h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
										{t.appRoutesHeading}
									</h3>
									<ul className="flex flex-wrap gap-1.5">
										{app.routes.map((r) => (
											<li
												key={r}
												className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-foreground"
											>
												{r}
											</li>
										))}
									</ul>
								</div>
							</>
						)}
						<p className="text-[11px] leading-relaxed text-muted-foreground italic">
							{t.appProjectionNote}
						</p>
						<Link
							href="/v2/deploy"
							className="inline-block text-xs font-medium text-primary transition-colors hover:underline"
						>
							{t.appDeployLink}
						</Link>
					</section>
				)}

				{/* · ENVIRONNEMENTS — L'ÉCHELLE ENTIÈRE (ENV_LADDER, une donnée — le cliquet généralisé) ;
				      les boutons ENVOIENT la phrase canonique au chat */}
				{tab === "envs" && (
					<section
						data-testid="v2-builder-envs"
						className="space-y-3 rounded-xl border border-border bg-card p-4"
					>
						<h2 className="text-sm font-semibold text-foreground">
							{t.envsHeading}
						</h2>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{t.envSendHint}
						</p>
						{ENV_LADDER.map((name, rung) => (
							<EnvCard
								key={name}
								testid={`v2-builder-env-${name}`}
								title={envTitle[name]}
								env={builderState.envs[name]}
								drift={driftOf(builderState.envs[name])}
								deployTestid={`v2-builder-deploy-${name}`}
								deployLabel={envDeployLabel[name]}
								gateNote={rung === 0 ? null : t.envGateNote}
								disabled={builderState.kernels.length === 0}
								onDeploy={() => send(`déploie l'application en ${name}`)}
								t={t}
							/>
						))}

						{/* · DÉPLOIEMENT RÉEL (ADR 0052) — le GESTE HUMAIN (le clic) après l'échelle
						      in-model : le bouton ne s'arme que lorsque envs.prod est posé ; le pipeline
						      RÉUTILISÉ est celui du /ai-lab (deployStack — jamais un second chemin). */}
						<div
							data-testid="v2-builder-real-deploy"
							className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3"
						>
							<span className="text-xs font-semibold text-foreground">
								{t.realDeployHeading}
							</span>
							<p className="text-[10px] leading-relaxed text-muted-foreground italic">
								{t.realDeployNote}
							</p>
							<button
								type="button"
								data-testid="v2-builder-deploy-real"
								disabled={builderState.envs.prod === null || realBusy}
								title={
									builderState.envs.prod === null ? t.realDeployNote : undefined
								}
								onClick={runRealDeploy}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{realBusy ? t.realDeployBusy : t.realDeployBtn}
							</button>
							{realResult !== null &&
								(realResult.ok && realResult.url !== null ? (
									<p className="text-xs text-foreground">
										{t.realDeployUrlLabel} :{" "}
										<a
											data-testid="v2-builder-real-url"
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
										{t.realDeployFailed} : {realResult.detail}
									</p>
								))}
						</div>

						{/* · LE DELTA AU GRAIN CODE (ADR 0056 × 0058) — « quelles fonctions exactes »
						      par kernel proposé : les ancres (anchorSymbols) + la vague (impactOf),
						      recalculées sur le graphe extrait du source réel. */}
						<div
							data-testid="v2-builder-code-delta"
							className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
						>
							<span className="text-xs font-semibold text-foreground">
								{t.codeDeltaHeading}
							</span>
							{codeDelta.every((d) => d.anchors.length === 0) ? (
								<p className="text-xs text-muted-foreground italic">
									{t.codeDeltaEmpty}
								</p>
							) : (
								<ul className="space-y-2">
									{codeDelta.map((d) => (
										<li key={d.kernelVersion} className="space-y-1">
											<div className="flex flex-wrap items-center gap-2">
												<span className="font-mono text-[10px] text-muted-foreground">
													{d.kernelVersion}
												</span>
												<span className="rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-[10px] font-medium text-foreground">
													{t.codeDeltaWaveLabel} : {d.waveSize}
												</span>
											</div>
											<ul className="space-y-1">
												{d.anchors.map((a) => (
													<li key={a.nodeId}>
														<Link
															href="/v2/code"
															data-testid="v2-builder-code-anchor"
															className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground transition-colors hover:border-primary/40 hover:text-primary"
														>
															<span className="font-medium">{a.name}</span>
															<span className="font-mono text-[10px] text-muted-foreground">
																{a.file}
															</span>
															<span className="ml-auto rounded bg-primary/10 px-1 font-mono text-[10px] text-primary">
																{a.score}
															</span>
														</Link>
													</li>
												))}
											</ul>
										</li>
									))}
								</ul>
							)}
						</div>
					</section>
				)}

				{/* · JOURNAL — APPEND-ONLY (affiché du plus récent au plus ancien) */}
				{tab === "journal" && (
					<section
						data-testid="v2-builder-log"
						className="space-y-2 rounded-xl border border-border bg-card p-4"
					>
						<h2 className="text-sm font-semibold text-foreground">
							{t.logHeading}
						</h2>
						{builderState.log.length === 0 ? (
							<p className="text-xs text-muted-foreground italic">
								{t.logEmpty}
							</p>
						) : (
							<ol className="space-y-1">
								{builderState.log
									.map((e, i) => ({ e, i }))
									.reverse()
									.map(({ e, i }) => (
										<li
											// le journal est APPEND-ONLY — la position i EST la clé stable
											key={i}
											data-testid="v2-builder-log-entry"
											className="flex flex-wrap items-center gap-2 text-xs"
										>
											<span className="font-mono text-[10px] text-muted-foreground">
												#{i + 1}
											</span>
											<span
												className={[
													"rounded border px-1.5 py-0.5 font-mono text-[10px]",
													e.kind === "refus"
														? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
														: "border-border bg-muted text-muted-foreground",
												].join(" ")}
											>
												{e.env !== undefined ? `${e.kind} · ${e.env}` : e.kind}
											</span>
											<span className="text-muted-foreground">{e.detail}</span>
										</li>
									))}
							</ol>
						)}
					</section>
				)}

				{/* · les idées capturées — hasMirror=false, toujours (au-dessus du mur) */}
				<section
					data-testid="v2-builder-ideas"
					className="space-y-2 rounded-xl border border-border bg-card p-4"
				>
					<h2 className="text-sm font-semibold text-foreground">
						{t.ideasHeading}
					</h2>
					{builderState.ideas.length === 0 ? (
						<p className="text-xs text-muted-foreground italic">
							{t.ideasEmpty}
						</p>
					) : (
						<ul className="space-y-2">
							{builderState.ideas.map((idea) => (
								<li
									key={idea.id}
									data-testid="v2-builder-idea"
									className="space-y-1 rounded-md border border-border bg-muted/30 px-2.5 py-2"
								>
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-mono text-[10px] text-muted-foreground">
											{idea.id}
										</span>
										<span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
											{t.hasMirrorBadge}
										</span>
									</div>
									<p className="text-xs text-foreground">{idea.intent}</p>
									<p className="font-mono text-[10px] text-muted-foreground">
										{t.coordinateLabel} : {idea.coordinate.level} ×{" "}
										{idea.coordinate.facet} × {idea.coordinate.scale}
									</p>
								</li>
							))}
						</ul>
					)}
				</section>

				{/* · les kernels PROPOSÉS — ChangeSet DRAFT, wroteKernel=false (le mur, visible) */}
				<section
					data-testid="v2-builder-kernels"
					className="space-y-2 rounded-xl border border-border bg-card p-4"
				>
					<h2 className="text-sm font-semibold text-foreground">
						{t.kernelsHeading}
					</h2>
					{builderState.kernels.length === 0 ? (
						<p className="text-xs text-muted-foreground italic">
							{t.kernelsEmpty}
						</p>
					) : (
						<ul className="space-y-2">
							{builderState.kernels.map((k) => (
								<li
									key={k.version}
									data-testid="v2-builder-kernel"
									className="space-y-1 rounded-md border border-border bg-muted/30 px-2.5 py-2"
								>
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-mono text-[11px] text-foreground">
											{k.version}
										</span>
										<span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
											{t.draftBadge}
										</span>
									</div>
									<p className="font-mono text-[10px] text-muted-foreground">
										{t.changeSetLabel} : {k.changeSet.id}
									</p>
									<p className="text-[10px] text-muted-foreground">
										{t.wroteKernelBadge}
									</p>
								</li>
							))}
						</ul>
					)}
				</section>
			</div>
		</div>
	);
}
