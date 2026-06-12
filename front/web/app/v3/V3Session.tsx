"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type BuilderState,
	ENV_LADDER,
	type ScreenRef,
} from "@/lib/v2/builder";
import type { CodeEdge, CodeNode } from "@/lib/v2/code-graph";
import { bareTree, nodePath } from "@/lib/v2/composition";
import { replayTo, type SessionTurn, turnsOf } from "@/lib/v3/session";
import { chatTurnAction } from "./actions";

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
}

const V3SessionContext = createContext<V3SessionValue | null>(null);

/** RÉSUME l'état pour le prompt-palette — calculé du rejeu, jamais stocké. */
function summarize(state: BuilderState): string {
	const paths = state.tree
		.map((n) => nodePath(state.tree, n.id).join("/"))
		.sort()
		.slice(0, 40);
	const envs = ENV_LADDER.map(
		(e) => `${e}=${state.envs[e]?.version ?? "vide"}`,
	).join(" · ");
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
	children,
}: {
	/** Les écrans V1 scannés côté serveur — injectés en DONNÉES dans le twin. */
	v1Screens: readonly ScreenRef[];
	codeNodes: readonly CodeNode[];
	codeEdges: readonly CodeEdge[];
	strings: Record<string, string>;
	children: ReactNode;
}) {
	const [messages, setMessages] = useState<string[]>([]);
	const [replies, setReplies] = useState<Record<number, string>>({});
	const [aiEnabled, setAiEnabled] = useState(true);
	const [busy, setBusy] = useState(false);
	// La référence vers le transcript courant (évite une fermeture périmée après un await).
	const messagesRef = useRef<string[]>([]);

	// L'ÉTAT et la TIMELINE sont DÉRIVÉS (recalcul pur) — jamais stockés (ADR 0060).
	// UN PROJET NEUF EST NU (bareTree — loi au miroir) : la seule racine « app »,
	// AUCUNE branche de démonstration ; l'arbre pousse par les gestes du chat.
	const { turns, state } = useMemo(
		() => turnsOf(messages, v1Screens, bareTree()),
		[messages, v1Screens],
	);

	/** APPEND-ONLY : ajoute des messages au transcript (chaque message = un tour rejoué). */
	const append = useCallback((texts: readonly string[]) => {
		messagesRef.current = [...messagesRef.current, ...texts];
		setMessages(messagesRef.current);
	}, []);

	const send = useCallback(
		async (raw: string) => {
			const text = raw.trim();
			if (text === "") return;
			// Mode déterministe pur : le message entre tel quel dans le pipeline.
			if (!aiEnabled) {
				append([text]);
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
				);
				const out = await chatTurnAction(text, summarize(cur));
				// Panne / réponse invalide → repli déterministe : le texte entre directement.
				if (out === null) {
					append([text]);
					return;
				}
				// Les ACTIONS canoniques deviennent les messages du groupe (chacune RE-JUGÉE
				// par le réducteur — la loi) ; une réponse sans action rejoue le texte brut.
				const appended = out.actions.length > 0 ? out.actions : [text];
				const first = messagesRef.current.length;
				setReplies((prev) => ({ ...prev, [first]: out.reply }));
				append(appended);
			} finally {
				setBusy(false);
			}
		},
		[aiEnabled, busy, append, v1Screens],
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
