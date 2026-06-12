"use client";

import { useRouter } from "next/navigation";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	applyIntent,
	type BuilderState,
	emitApp,
	type ScreenRef,
} from "@/lib/v2/builder";
import type { CodeEdge, CodeNode } from "@/lib/v2/code-graph";
import { bareTree, nodePath } from "@/lib/v2/composition";
import type { InstanceConfig } from "@/lib/v3/instance";
import type { ProjectRecord } from "@/lib/v3/project";
import { replayTo, type SessionTurn, turnsOf } from "@/lib/v3/session";
import { chatTurnAction } from "./actions";
import {
	createProjectAction,
	emitWorkspaceAction,
	type ProjectSummary,
	saveProjectAction,
	setActiveProjectAction,
} from "./projects-actions";

/**
 * V3 — LA SESSION PARTAGÉE (une session, cinq lentilles ; ADR 0060) : le transcript
 * (la liste des messages) est LA SEULE source de vérité d'écran — l'état n'est jamais
 * stocké, il est REJOUÉ (turnsOf, le twin pur lib/v3/session). Chaque lentille
 * (/v3/lab, /v3/parcours, /v3/history, /v3/environnements, /v3/parametrage) lit la
 * MÊME session via useV3Session().
 *
 * DÉTERMINISME-FIRST (§6/§8) : le réducteur reste LA LOI — quand l'IA conversationnelle
 * est active, Claude PROPOSE des gestes canoniques (chatTurnAction) et chaque geste
 * repasse par understand/applyIntent (un geste invalide devient un refus doux) ; le
 * bascule « IA conversationnelle » (défaut ON) permet le mode déterministe pur.
 *
 * LE PROJET PERSISTANT (ADR 0061) : la session vit DANS un projet — le transcript
 * (+ les réponses IA, un décor) est initialisé depuis le ProjectRecord chargé côté
 * serveur (layout, cookie « aidos-v3-project ») et REJOUÉ par turnsOf : rouvrir un
 * projet fait réapparaître TOUT l'historique, partout, même état. Chaque send et
 * chaque rewindTo déclenche une sauvegarde DÉBONCÉE (800 ms) via saveProjectAction
 * (l'horloge ne vit que dans la couche impure serveur).
 *
 * LE MUR (§2) : la session PROPOSE — aucune écriture kernel/mirrors/fitness, jamais.
 */

/** Le contrat EXACT de la session partagée — ce que chaque lentille reçoit. */
export interface V3SessionValue {
	/** Le transcript — la seule source de vérité (l'état se rejoue dessus). */
	readonly messages: string[];
	/** La timeline annotée (turnsOf) : un tour par message, verdict + événements + impacts. */
	readonly turns: SessionTurn[];
	/** L'état rejoué au bout du transcript. */
	readonly state: BuilderState;
	/** Envoie un message : IA active → Claude propose des gestes (re-jugés) ; sinon direct. */
	readonly send: (text: string) => Promise<void>;
	/** Le voyage dans le temps : rejouer un préfixe (messages.slice(0, n)). */
	readonly rewindTo: (n: number) => void;
	/** La bascule « IA conversationnelle » (défaut ON). */
	readonly aiEnabled: boolean;
	readonly setAiEnabled: (b: boolean) => void;
	/** La réponse conversationnelle de Claude, par index du PREMIER tour du groupe. */
	readonly replies: Record<number, string>;
	/** Un tour IA est en cours (l'indicateur de frappe). */
	readonly busy: boolean;
	/** Le graphe de code extrait côté serveur (le motif /v2/code) — pour les lentilles. */
	readonly codeNodes: readonly CodeNode[];
	readonly codeEdges: readonly CodeEdge[];
	/** Les libellés i18n « v3 » (motif KEYS — un client ne peut pas appeler getTranslations). */
	readonly strings: Record<string, string>;
	/** Le projet actif (chargé côté serveur via le cookie) — null seulement si la création a échoué. */
	readonly projectId: string | null;
	readonly projectName: string | null;
	/** Les projets connus (résumés triés : le plus récemment sauvé d'abord). */
	readonly projects: readonly ProjectSummary[];
	/** Bascule vers un autre projet : sauve l'en-cours, pose le cookie, recharge (rejeu). */
	readonly switchProject: (id: string) => Promise<void>;
	/** Crée un projet (transcript vide) et bascule dessus — « créer une app crée un projet ». */
	readonly createProject: (name: string) => Promise<void>;
	/** L'ÉCHELLE de l'instance (ladderOf(config)) — la DONNÉE que chaque rejeu suit. */
	readonly ladder: readonly string[];
	/** La config d'instance chargée côté serveur (parse fail-closed du twin). */
	readonly instanceConfig: InstanceConfig;
}

const V3SessionContext = createContext<V3SessionValue | null>(null);

/** RÉSUME l'état pour le prompt-palette — calculé du rejeu, jamais stocké. */
function summarize(state: BuilderState): string {
	const paths = state.tree
		.map((n) => nodePath(state.tree, n.id).join("/"))
		.sort()
		.slice(0, 40);
	const envs = state.ladder
		.map((e) => `${e}=${state.envs[e]?.version ?? "vide"}`)
		.join(" · ");
	return [
		`arbre (${state.tree.length} nœuds) : ${paths.join(", ")}`,
		`idées capturées : ${state.ideas.length}`,
		`versions figées : ${state.kernels.length}`,
		`environnements : ${envs}`,
	].join(" ; ");
}

export function V3SessionProvider({
	v1Screens,
	codeNodes,
	codeEdges,
	strings,
	initialProject,
	projectList,
	ladder,
	instanceConfig,
	children,
}: {
	/** Les écrans V1 scannés côté serveur — injectés en DONNÉES dans le twin. */
	v1Screens: readonly ScreenRef[];
	codeNodes: readonly CodeNode[];
	codeEdges: readonly CodeEdge[];
	strings: Record<string, string>;
	/** Le projet actif chargé côté serveur (cookie) — la session s'initialise dessus. */
	initialProject: ProjectRecord | null;
	/** La liste des projets connus (résumés triés), lue côté serveur. */
	projectList: readonly ProjectSummary[];
	/** L'ÉCHELLE de l'instance (ladderOf(config), fail-closed) — injectée en DONNÉE. */
	ladder: readonly string[];
	/** La config d'instance (parse fail-closed du twin lib/v3/instance). */
	instanceConfig: InstanceConfig;
	children: ReactNode;
}) {
	// ROUVRIR = initialiser le transcript depuis le projet puis REJOUER (turnsOf) :
	// tout l'historique réapparaît partout — bulles, parcours, environnements, même état.
	const [messages, setMessages] = useState<string[]>(() =>
		initialProject ? [...initialProject.transcript] : [],
	);
	const [replies, setReplies] = useState<Record<number, string>>(() =>
		initialProject
			? Object.fromEntries(
					Object.entries(initialProject.replies).map(([k, v]) => [
						Number(k),
						v,
					]),
				)
			: {},
	);
	const [aiEnabled, setAiEnabled] = useState(true);
	const [busy, setBusy] = useState(false);
	const router = useRouter();
	// La référence vers le transcript courant (évite une fermeture périmée après un await).
	const messagesRef = useRef<string[]>(
		initialProject ? [...initialProject.transcript] : [],
	);
	// La référence vers les réponses courantes (la sauvegarde immédiate au changement de projet).
	const repliesRef = useRef<Record<number, string>>({});
	useEffect(() => {
		repliesRef.current = replies;
	}, [replies]);

	// L'ÉTAT et la TIMELINE sont DÉRIVÉS (recalcul pur) — jamais stockés (ADR 0060).
	// UN PROJET NEUF EST NU (bareTree — loi au miroir) : la seule racine « app »,
	// AUCUNE branche de démonstration ; l'arbre pousse par les gestes du chat.
	const { turns, state } = useMemo(
		() => turnsOf(messages, v1Screens, bareTree(), ladder),
		[messages, v1Screens, ladder],
	);

	/** APPEND-ONLY : ajoute des messages au transcript (chaque message = un tour rejoué). */
	const append = useCallback((texts: readonly string[]) => {
		messagesRef.current = [...messagesRef.current, ...texts];
		setMessages(messagesRef.current);
	}, []);

	// Le projet actif (chargé côté serveur via le cookie) — l'émission de workspace
	// et la sauvegarde débondée le ciblent toutes deux.
	const projectId = initialProject?.id ?? null;
	const projectName = initialProject?.name ?? null;

	/**
	 * Le déploiement ÉMET le workspace — l'URL <projet>-<env>.sagedesk.fr devient
	 * vivante (aperçu v0 ; conteneurs réels = piste DP). Pour chaque tour ajouté qui
	 * produit un événement « deploiement », on RECONSTRUIT l'app telle que déployée
	 * depuis les kernels EMBARQUÉS par le déploiement (jamais les courants) via
	 * emitApp — le même émetteur déterministe, jamais un second chemin — puis on émet
	 * en tir-et-oublie : une panne d'émission ne casse jamais le tour de chat. LE MUR
	 * (§2) : des fichiers d'app émise, une PROJECTION sous la ligne — jamais une vérité.
	 */
	const emitOnDeploy = useCallback(
		(prior: readonly string[], appended: readonly string[]) => {
			if (projectId === null || projectName === null) return;
			let st = replayTo(prior, prior.length, v1Screens, bareTree(), ladder);
			for (const msg of appended) {
				const r = applyIntent(st, msg);
				for (const ev of r.events) {
					if (ev.kind !== "deploiement" || ev.env === undefined) continue;
					const dep = r.state.envs[ev.env];
					if (dep === null || dep === undefined) continue;
					const embedded = new Set(dep.kernelVersions);
					const app = emitApp({
						...r.state,
						kernels: r.state.kernels.filter((k) => embedded.has(k.version)),
					});
					void emitWorkspaceAction(projectId, ev.env, projectName, app).catch(
						() => {},
					);
				}
				st = r.state;
			}
		},
		[projectId, projectName, v1Screens, ladder],
	);

	const send = useCallback(
		async (raw: string) => {
			const text = raw.trim();
			if (text === "") return;
			// Mode déterministe pur : le message entre tel quel dans le pipeline.
			if (!aiEnabled) {
				const prior = messagesRef.current;
				append([text]);
				emitOnDeploy(prior, [text]);
				return;
			}
			if (busy) return; // un seul tour IA à la fois
			setBusy(true);
			try {
				const cur = replayTo(
					messagesRef.current,
					messagesRef.current.length,
					v1Screens,
					bareTree(),
					ladder,
				);
				const out = await chatTurnAction(text, summarize(cur));
				// Panne / réponse invalide → repli déterministe : le texte entre directement.
				if (out === null) {
					const prior = messagesRef.current;
					append([text]);
					emitOnDeploy(prior, [text]);
					return;
				}
				// Les ACTIONS canoniques deviennent les messages du groupe (chacune RE-JUGÉE
				// par le réducteur — la loi) ; une réponse sans action rejoue le texte brut.
				const appended = out.actions.length > 0 ? out.actions : [text];
				const first = messagesRef.current.length;
				setReplies((prev) => ({ ...prev, [first]: out.reply }));
				const prior = messagesRef.current;
				append(appended);
				emitOnDeploy(prior, appended);
			} finally {
				setBusy(false);
			}
		},
		[aiEnabled, busy, append, emitOnDeploy, v1Screens, ladder],
	);

	/** LE VOYAGE DANS LE TEMPS : tronquer le transcript = rejouer un préfixe (replayTo). */
	const rewindTo = useCallback((n: number) => {
		const upTo = Math.max(
			0,
			Math.min(Math.floor(n), messagesRef.current.length),
		);
		messagesRef.current = messagesRef.current.slice(0, upTo);
		setMessages(messagesRef.current);
		setReplies((prev) =>
			Object.fromEntries(
				Object.entries(prev).filter(([k]) => Number(k) < upTo),
			),
		);
	}, []);

	// LA SAUVEGARDE DÉBONCÉE (800 ms) : chaque send/rewindTo (le transcript change) ou
	// réponse IA relance le compte à rebours ; l'horloge (savedAt) ne vit que côté serveur.
	const firstRunRef = useRef(true);
	const dirtyRef = useRef(false);
	useEffect(() => {
		if (firstRunRef.current) {
			// Le premier passage est l'état FRAÎCHEMENT CHARGÉ — rien à resauver.
			firstRunRef.current = false;
			return;
		}
		if (projectId === null || projectName === null) return;
		dirtyRef.current = true;
		const timer = setTimeout(() => {
			dirtyRef.current = false;
			void saveProjectAction({
				id: projectId,
				name: projectName,
				transcript: messages,
				replies: Object.fromEntries(
					Object.entries(replies).map(([k, v]) => [k, v]),
				),
			});
		}, 800);
		return () => clearTimeout(timer);
	}, [messages, replies, projectId, projectName]);

	/** VIDE le débonceur avant de quitter le projet (aucun tour ne se perd au switch). */
	const persistNow = useCallback(async () => {
		if (projectId === null || projectName === null || !dirtyRef.current) return;
		dirtyRef.current = false;
		await saveProjectAction({
			id: projectId,
			name: projectName,
			transcript: messagesRef.current,
			replies: Object.fromEntries(
				Object.entries(repliesRef.current).map(([k, v]) => [k, v]),
			),
		});
	}, [projectId, projectName]);

	/** BASCULE de projet : sauve l'en-cours, pose le cookie, recharge — le layout rejoue. */
	const switchProject = useCallback(
		async (id: string) => {
			if (id === projectId) return;
			await persistNow();
			await setActiveProjectAction(id);
			router.refresh();
		},
		[projectId, persistNow, router],
	);

	/** CRÉE un projet (transcript vide, slug déterministe) puis bascule dessus. */
	const createProject = useCallback(
		async (name: string) => {
			await persistNow();
			const record = await createProjectAction(name);
			if (record === null) return;
			await setActiveProjectAction(record.id);
			router.refresh();
		},
		[persistNow, router],
	);

	const value = useMemo<V3SessionValue>(
		() => ({
			messages,
			turns,
			state,
			send,
			rewindTo,
			aiEnabled,
			setAiEnabled,
			replies,
			busy,
			codeNodes,
			codeEdges,
			strings,
			projectId,
			projectName,
			projects: projectList,
			switchProject,
			createProject,
			ladder,
			instanceConfig,
		}),
		[
			messages,
			turns,
			state,
			send,
			rewindTo,
			aiEnabled,
			replies,
			busy,
			codeNodes,
			codeEdges,
			strings,
			projectId,
			projectName,
			projectList,
			switchProject,
			createProject,
			ladder,
			instanceConfig,
		],
	);

	return (
		<V3SessionContext.Provider value={value}>
			{children}
		</V3SessionContext.Provider>
	);
}

/** La session partagée V3 — à appeler sous V3SessionProvider (le layout /v3). */
export function useV3Session(): V3SessionValue {
	const ctx = useContext(V3SessionContext);
	if (ctx === null)
		throw new Error("useV3Session doit être appelé sous V3SessionProvider");
	return ctx;
}
