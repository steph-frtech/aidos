"use client";

import { useEffect, useMemo, useState } from "react";
import { emitApp } from "@/lib/v2/builder";
import { provisionStatusAction } from "../environnements/deploy-actions";
import type { VersionDag } from "@/lib/v2/version-dag";
import type { FromIframe, ToIframe } from "@/lib/v3/design/bridge-protocol";
import {
	applyDesignMove,
	buildDesignDag,
	currentHead,
	DESIGN_ROOT_LABEL,
	type DesignBranchMove,
	type DesignCapture,
	type DesignCheckpoint,
	listCheckpoints,
	mergeReadiness,
} from "@/lib/v3/design/design-branches";
import {
	componentKindKey,
	deriveLayersTree,
	flattenLayers,
	type LayerNode,
} from "@/lib/v3/design/layers-tree";
import {
	canonicalAdaptPhrase,
	composeScreenDesign,
	coordRef,
	type DesignVerdict,
	type DragGesture,
	type MasterDescriptor,
	PROPERTY_PREFIX,
	rejudgeDesignProposal,
	routeDrag,
	routeStructuralGesture,
	type ScreenCoord,
	type ScreenDesign,
	STYLE_TOKENS,
	type StructuralGesture,
	type StructuralKind,
	type StyleToken,
} from "@/lib/v3/design/screen-design";
import { envStackOf } from "@/lib/v3/instance";
import type { Strings } from "../friendly";
import { useV3Session } from "../V3Session";
import { designBranchPersistAction, designChatTurnAction } from "./actions";
import { DesignIframe } from "./DesignIframe";

/**
 * /v3/design — LE STUDIO DE DESIGN (ADR 0071, Onlook INVERSÉ). use client : useV3Session()
 * (state, send, instanceConfig, projectId, strings:t). Trois zones :
 *   · le LAYERS-PANEL minimal — les coordonnées que l'app PIN (lues du twin emitApp(state) +
 *     enrichies par le bridge `ready`/`mutated` quand l'iframe live est montée) ;
 *   · le STYLE-PANEL de tokens — le catalogue FERMÉ ADR 0010 (property × token), jamais un hex ;
 *   · l'IFRAME live (envStackOf('dev')) — sélection, preview optimiste, edit-proposed→capture.
 *
 * LE MUR (§2) : la capture passe par send(« adapte <coord> : <property>=<token> ») — re-jugé par
 * le réducteur (intent `adapter` → événement `ecran_adapte`, below-the-line) ; un geste
 * STRUCTUREL passe par send(« capture l'idée : … ») → idée→/goal. Aucune écriture-vérité, jamais.
 * DÉTERMINISME-FIRST (§6/§8) : le twin composeScreenDesign (records.Hash byte-égal Go) compose le
 * ScreenDesign DRAFT et VÉRIFIE l'ID AVANT capture — le code juge, le LLM ne déclare rien.
 *
 * Tokens ADR 0010 obligatoires (jamais de hex) ; data-testid sur chaque control ; bilingue.
 */

/** Les properties du catalogue FERMÉ, dans l'ordre déclaré (le jeu clos ADR 0010). */
const PROPERTIES = Object.keys(PROPERTY_PREFIX);

/**
 * Les GROUPES de propriétés du style-panel complet (ADR 0071 T3) — chaque property du catalogue
 * FERMÉ rangée par axe (couleur / typo / espacement / forme+ombre / disposition). DÉCLARÉ, jamais
 * deviné : un groupe = des properties du catalogue, chacune un <select> de ses tokens fermés.
 */
const PROPERTY_GROUPS: ReadonlyArray<{
	readonly key: string; // la clé i18n du titre de groupe
	readonly properties: readonly string[];
}> = [
	{ key: "designGroupColour", properties: ["bg", "text", "border"] },
	{ key: "designGroupTypography", properties: ["size", "weight", "align"] },
	{ key: "designGroupSpacing", properties: ["pad", "gap", "density"] },
	{ key: "designGroupShape", properties: ["radius", "shadow"] },
	{ key: "designGroupLayout", properties: ["width", "cols"] },
];

/** La clé i18n du NOM affichable d'une property (DÉCLARÉE — jamais le code interne brut). */
const PROPERTY_LABEL_KEY: Readonly<Record<string, string>> = {
	bg: "designPropBg",
	text: "designPropText",
	border: "designPropBorder",
	radius: "designPropRadius",
	pad: "designPropPad",
	gap: "designPropGap",
	align: "designPropAlign",
	size: "designPropSize",
	weight: "designPropWeight",
	shadow: "designPropShadow",
	density: "designPropDensity",
	width: "designPropWidth",
	cols: "designPropCols",
};

export function DesignClient() {
	const { state, send, instanceConfig, projectId, strings, aiEnabled } =
		useV3Session();
	const t = strings as Strings;

	// L'URL live de l'app en dev : le motif %project%-%env% (envStackOf, ADR 0062).
	const devUrl = useMemo(
		() =>
			envStackOf("dev", instanceConfig, projectId ?? "app").find(
				(s) => s.key === "app",
			)?.url ?? "",
		[instanceConfig, projectId],
	);

	// L'app est-elle EN LIGNE en dev ? (le vrai signal — un déploiement dev a posé une version
	// dans la session ; ADR 0052 : le déploiement réel est gaté, l'aperçu v0 suffit au studio).
	// Tant qu'elle n'est pas déployée, on offre le geste de déploiement (jamais une iframe morte).
	const deployedDev = state.envs.dev !== null && state.envs.dev !== undefined;
	// #4 (ADR 0071) — l'app est-elle RÉELLEMENT en ligne ? On poll le /healthz de <slug>-dev :
	// si la stack du projet est montée (le vrai déploiement par projet), on monte l'IFRAME LIVE
	// même si la session n'a pas encore de version dev — ainsi le studio designe sur la VRAIE app
	// déployée et la preview optimiste (bg=rouge…) S'Y VOIT. Sans app live, on garde le geste deploy.
	const [appLive, setAppLive] = useState(false);
	useEffect(() => {
		if (projectId === null) {
			setAppLive(false);
			return;
		}
		let alive = true;
		void provisionStatusAction(projectId)
			.then((r) => {
				if (alive) setAppLive(r.up);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [projectId]);
	const showIframe = (deployedDev || appLive) && devUrl !== "";

	// La cible enfant en cours de design (web par défaut — la 1re voie d'adaptation web, ADR 0071).
	const target = "web" as const;

	// L'app PROJETÉE depuis l'état (le twin emitApp — pure, jamais stockée). Chaque entité émise
	// est une SECTION ; sa route est l'écran. C'est la coordonnée que l'app PIN, lisible hors iframe
	// (le studio reste utilisable même sans déploiement live — l'e2e hermétique s'appuie dessus).
	const app = useMemo(() => emitApp(state), [state]);

	// Les coordonnées vues par le bridge (quand l'iframe live est montée) — enrichissent le master.
	const [bridgeCoords, setBridgeCoords] = useState<readonly ScreenCoord[]>([]);
	const [bridgeMasterHash, setBridgeMasterHash] = useState<string>("");

	// LE MASTER-DESCRIPTOR : son adresse + les coordonnées qu'il PIN. Hors iframe, on dérive un
	// hash content-adressé stable de la projection (app.version) et les sections des entités émises ;
	// avec l'iframe, le bridge fournit le vrai master_hash + ses coordonnées (drift déjà normalisé).
	const master: MasterDescriptor = useMemo(() => {
		const projected: ScreenCoord[] = app.entities.map((e) => ({
			kind: "section",
			entity: e.name,
		}));
		const coords = bridgeCoords.length > 0 ? [...bridgeCoords] : projected;
		const hash = bridgeMasterHash !== "" ? bridgeMasterHash : app.version;
		return { hash, coords };
	}, [app, bridgeCoords, bridgeMasterHash]);

	// L'ARBRE LAYERS (ADR 0055 fractale) — DÉRIVÉ PUREMENT : la MAÎTRE → les 3 enfants
	// (web/mobile/desktop) → les SECTIONS (entités S35) → les CHAMPS / les ACTIONS (S11),
	// enrichis par les coords du bridge (les éléments réellement présents dans l'iframe live).
	// La source-kind de chaque nœud EST sa source kernel — la « détection de composants ».
	const layersRoot = useMemo(
		() => deriveLayersTree(app, bridgeCoords),
		[app, bridgeCoords],
	);
	// L'arbre à plat (parcours préfixe, indenté par depth) — déterministe, jamais stocké.
	const layers = useMemo(() => flattenLayers(layersRoot), [layersRoot]);
	// L'app a-t-elle au moins une section ? (sinon le panneau montre l'état vide amical).
	const hasSections = useMemo(
		() => layers.some((n) => n.coord !== null),
		[layers],
	);

	// LA SÉLECTION + L'EMPILEMENT de tokens en cours d'édition (l'apparence proposée, optimiste).
	const [selected, setSelected] = useState<ScreenCoord | null>(null);
	const [draftStyles, setDraftStyles] = useState<StyleToken[]>([]);
	const [property, setProperty] = useState<string>(PROPERTIES[0]);
	const [token, setToken] = useState<string>(STYLE_TOKENS[PROPERTIES[0]][0]);

	// La dernière commande à pousser dans l'iframe (preview optimiste / sélection). Best-effort.
	const [command, setCommand] = useState<ToIframe | null>(null);

	// LE DERNIER ScreenDesign DRAFT composé (le twin) — affiché « avant capture » + sa carte.
	const [draftDesign, setDraftDesign] = useState<ScreenDesign | null>(null);
	const [blockMsg, setBlockMsg] = useState<string | null>(null);

	const tokensFor = (p: string): readonly string[] => STYLE_TOKENS[p] ?? [];

	/** SÉLECTIONNE une coordonnée (panneau ou bridge) — surligne dans l'iframe + ouvre l'apparence. */
	const selectCoord = (c: ScreenCoord) => {
		setSelected(c);
		setDraftStyles([]);
		setDraftDesign(null);
		setBlockMsg(null);
		setCommand({ type: "select", coord: c });
	};

	/** AJOUTE le token courant à l'empilement (déduplique par property — dernier gagne). */
	const addToken = () => {
		if (selected === null) return;
		const next = draftStyles
			.filter((s) => s.property !== property)
			.concat({ property, token });
		setDraftStyles(next);
		// PREVIEW OPTIMISTE : pousse l'édition visuelle dans l'iframe (purement visuel, jamais la source).
		setCommand({ type: "preview-edit", coord: selected, styles: next });
		// Le twin COMPOSE le ScreenDesign DRAFT et VÉRIFIE l'ID — le gate déterministe avant capture.
		const r = composeScreenDesign(master, target, [
			{ coord: selected, styles: next },
		]);
		if (r.ok) {
			setDraftDesign(r.design);
			setBlockMsg(null);
		} else {
			setDraftDesign(null);
			setBlockMsg(r.block.explanation);
		}
	};

	/** ANNULE la preview (retire les classes-token de l'iframe) + vide l'empilement. */
	const clearPreview = () => {
		if (selected !== null)
			setCommand({
				type: "clear-preview",
				coord: selected,
				styles: draftStyles,
			});
		setDraftStyles([]);
		setDraftDesign(null);
		setBlockMsg(null);
	};

	/**
	 * APPLIQUE l'apparence : send(« adapte <coord> : <property>=<token> ») — la phrase canonique
	 * (palette close), RE-JUGÉE par le réducteur (intent `adapter` → `ecran_adapte`, below-the-line).
	 * Le LLM peut proposer cette phrase ; le code la re-juge toujours (le mur §2).
	 */
	const capture = () => {
		if (selected === null || draftStyles.length === 0) return;
		void send(canonicalAdaptPhrase(selected, draftStyles));
		setDraftStyles([]);
		setDraftDesign(null);
	};

	/**
	 * LE MUR STRUCTUREL (Tranche 2) : un geste STRUCTUREL (ajout/retrait/réordre d'un champ/
	 * section/action) classifyGesture==Structural → routeStructuralGesture → send(« capture
	 * l'idée : <besoin verbatim> ») → composeIdea (hasMirror=false). JAMAIS un ScreenDesign,
	 * JAMAIS une écriture directe. Le twin re-juge ; le code juge, jamais le LLM (le mur §2).
	 */
	const routeStructural = (kind: StructuralKind, coord: ScreenCoord) => {
		const g: StructuralGesture = { kind, coord };
		void send(routeStructuralGesture(g));
	};

	/** Le geste structurel depuis le panneau « Apparence » (sur la coordonnée sélectionnée). */
	const requestStructural = () => {
		const coord = selected ?? { kind: "section" as const, entity: "app" };
		// Depuis le panneau apparence, le geste par défaut est un ajout de champ à la coordonnée.
		const kind: StructuralKind =
			coord.kind === "section" ? "add-field" : "remove-field";
		routeStructural(kind, coord);
	};

	/**
	 * LE DRAG-DROP (Tranche 3) : la FRONTIÈRE est routeDrag (= classifyDrag, déléguant à
	 * classifyGesture). On distingue par les coordonnées :
	 *   - un drag d'un CHAMP sur un AUTRE champ de la MÊME section = un RÉORDRE → "reorder"
	 *     → routeDrag → « capture l'idée : réordonner les champs de … » (idée→/goal, le mur §2) ;
	 *   - sinon (un petit décalage cosmétique) c'est un nudge visuel → "visual-nudge" → styling.
	 * Le code re-juge toujours (jamais le LLM) ; un réordre ne fuit JAMAIS comme du styling.
	 */
	const [dragField, setDragField] = useState<ScreenCoord | null>(null);

	/** Émet le geste de drag via send(routeDrag(g)) — vide → rien (la lentille n'émet rien). */
	const fireDrag = (g: DragGesture) => {
		const phrase = routeDrag(g);
		if (phrase !== "") void send(phrase);
	};

	/** Un DROP d'un champ sur un autre champ de la même section = un RÉORDRE (→ structural). */
	const onDropField = (target: ScreenCoord) => {
		if (dragField === null) {
			setDragField(null);
			return;
		}
		// Réordonner ne change que l'ordre — la voie structurelle (idée→/goal). La coordonnée portée
		// est celle déplacée (le besoin « réordonner les champs de <entité.champ> »).
		if (
			dragField.kind === "field" &&
			target.kind === "field" &&
			dragField.entity === target.entity &&
			coordRef(dragField) !== coordRef(target)
		) {
			fireDrag({ coord: dragField, mode: "reorder" });
		}
		setDragField(null);
	};

	/** LE DÉPLOIEMENT en dev : send(« déploie l'application en dev ») — l'app live devient designable. */
	const deployDev = () => void send("déploie l'application en dev");

	// ─── LE CHAT IA GATÉ DU DESIGN LAB (Tranche 4, ADR 0071 §4) ───────────────────────────
	// L'utilisateur écrit en langage NATUREL LIBRE. IA active → le LLM PROPOSE une phrase
	// canonique (designChatTurnAction) ; IA éteinte → le texte BRUT EST la proposition. Dans
	// LES DEUX cas, rejudgeDesignProposal (le DÉTERMINISTE, l'AUTORITÉ) re-juge AVANT capture :
	//   · styling valide   → send(phrase canonique) — re-jugé par le réducteur (ecran_adapte) ;
	//   · structurel       → send(« capture l'idée : … ») — la porte idée→/goal (le mur §2) ;
	//   · refusé           → un message clair, JAMAIS capturé (fail-closed, le mur §8).
	// Le LLM ne capture JAMAIS directement : il propose, le déterministe dispose.
	const [chatInput, setChatInput] = useState("");
	const [chatReply, setChatReply] = useState<string | null>(null);
	const [chatVerdict, setChatVerdict] = useState<DesignVerdict | null>(null);
	const [chatBusy, setChatBusy] = useState(false);

	/** Le RÉSUMÉ des coordonnées que le master PIN (pour le prompt — jamais une coordonnée inventée). */
	const coordsSummary = useMemo(
		() => master.coords.map((c) => coordRef(c)).join(", "),
		[master],
	);

	/** Le RÉSUMÉ du catalogue FERMÉ (les properties + leurs jetons — le LLM ne propose que ça). */
	const catalogueSummary = useMemo(
		() =>
			Object.entries(STYLE_TOKENS)
				.map(([p, toks]) => `${p}: ${toks.join("/")}`)
				.join(" · "),
		[],
	);

	/**
	 * UN TOUR de chat design : free NL → (IA) proposition LLM OU (déterministe) texte brut →
	 * RE-JUGÉ par rejudgeDesignProposal (l'autorité). Un verdict valide est send()é (re-jugé une
	 * 2e fois par le réducteur — défense en profondeur) ; un refus reste affiché, jamais capturé.
	 */
	const submitChat = async () => {
		const text = chatInput.trim();
		if (text === "" || chatBusy) return;
		setChatBusy(true);
		setChatReply(null);
		setChatVerdict(null);
		try {
			// La PROPOSITION : le LLM (IA active) OU le texte brut (IA éteinte — le rejeu déterministe).
			let proposal = text;
			let reply: string | null = null;
			if (aiEnabled) {
				const out = await designChatTurnAction(
					text,
					coordsSummary,
					catalogueSummary,
				);
				// Panne / réponse vide → repli déterministe : le texte brut EST la proposition.
				if (out !== null) {
					reply = out.reply;
					proposal = out.proposal.trim() === "" ? text : out.proposal;
				}
			}
			// LE RE-JUGEMENT DÉTERMINISTE (l'autorité) — le catalogue FERMÉ + composeScreenDesign.
			const verdict = rejudgeDesignProposal(master, target, proposal);
			setChatReply(reply);
			setChatVerdict(verdict);
			// Le déterministe DISPOSE : un verdict valide est send()é (re-jugé encore par le réducteur).
			if (verdict.nature === "styling" || verdict.nature === "structural") {
				setChatInput("");
				void send(verdict.phrase);
			}
		} finally {
			setChatBusy(false);
		}
	};

	/** Les messages du bridge (iframe live) : re-sync coords + remontée d'une édition finie. */
	const onBridge = (msg: FromIframe) => {
		if (msg.type === "ready") {
			setBridgeCoords(msg.coords);
			setBridgeMasterHash(msg.masterHash);
		} else if (msg.type === "mutated") {
			setBridgeCoords(msg.coords);
		} else if (msg.type === "selected") {
			selectCoord(msg.coord);
		} else if (msg.type === "edit-proposed") {
			// L'utilisateur a fini une édition visuelle dans l'iframe → on la classe + capture.
			selectCoord(msg.coord);
			if (msg.styles.length > 0) {
				void send(canonicalAdaptPhrase(msg.coord, [...msg.styles]));
			}
		}
	};

	// LES ÉVÉNEMENTS d'adaptation déjà émis dans la session (le journal below-the-line, rejoué).
	const adaptations = state.log.filter((e) => e.kind === "ecran_adapte");

	// ─── TRANCHE 5 : LES BRANCHES DE DESIGN = LE VERSION DAG S24 + LES CHECKPOINTS ────────────
	// Les branches/checkpoints Onlook MAPPÉS sur le DAG S24 (ADR 0071 §5). RÉUTILISE le twin S24
	// (lib/v3/design/design-branches → lib/v2/version-dag) — JAMAIS une logique recopiée. Le DAG est
	// SEEDÉ depuis la maître (la racine = la version de référence) puis chaque adaptation capturée
	// (un `ecran_adapte`, content-adressé) est PLIÉE en une arête (un ChangeSet S20) faisant avancer
	// la tête. Les mouvements (brancher / forker depuis un ancien point / restaurer un checkpoint)
	// sont DÉTERMINISTES (le twin l'autorité, §8) ; la persistance passe par designBranchPersistAction
	// (une projection below-the-line, le mur §2 ; le MCP `dag` rôle `aidos` est le back-fill Postgres).

	// Les captures de design de la session → les arêtes du DAG (l'id = le ref+detail de l'événement).
	const designCaptures: DesignCapture[] = useMemo(
		() =>
			adaptations.map((e, i) => ({
				captureId: `sd:${e.ref}:${i}`,
				label: e.detail,
			})),
		[adaptations],
	);

	// Le DAG de design COURANT : seedé + plié des captures, puis surchargé des mouvements de branche
	// joués dans la session (l'override pur en mémoire — la même donnée recalculée, jamais stockée).
	const [branchDag, setBranchDag] = useState<VersionDag | null>(null);
	const seededDag = useMemo(
		() => buildDesignDag(designCaptures).dag,
		[designCaptures],
	);
	// Le DAG affiché : l'override de mouvements s'il existe, sinon le DAG seedé du transcript.
	const dag = branchDag ?? seededDag;

	// Les checkpoints (topo-triés) que l'écran pose ; la tête courante (« où vous êtes »).
	const checkpoints = useMemo(() => listCheckpoints(dag), [dag]);
	const head = useMemo(() => currentHead(dag), [dag]);
	const merge = useMemo(() => mergeReadiness(dag), [dag]);

	// Le checkpoint OUVERT (cliqué) — pour naviguer/forker/restaurer depuis lui. Déterministe.
	const [openCheckpoint, setOpenCheckpoint] = useState<string | null>(null);

	/** Le compteur de branches créées dans la session — un label lisible déterministe (jamais une horloge). */
	const [branchSeq, setBranchSeq] = useState(0);

	/**
	 * APPLIQUE un mouvement de branche de design (le jeu CLOS branch/fork/restore). DÉTERMINISTE :
	 * le twin (l'autorité, §8) calcule le nouveau DAG ; on PERSISTE la projection (below-the-line, le
	 * mur §2) en tir-et-oublie (une panne d'écriture ne casse jamais l'écran). Le label est lisible
	 * et déterministe (branche-N / fork-N) ; le changeset réutilise l'id de la tête (la relation S20).
	 */
	const applyMove = (move: DesignBranchMove, targetId: string) => {
		const seq = branchSeq + 1;
		const label =
			move === "branch"
				? `branche-${seq}`
				: move === "fork"
					? `fork-${seq}`
					: (dag.nodes.find((n) => n.id === targetId)?.label ?? targetId);
		const changeset = `csd:${move}:${seq}`;
		const next = applyDesignMove(dag, move, targetId, label, changeset);
		setBranchDag(next);
		if (move !== "restore") setBranchSeq(seq);
		setOpenCheckpoint(currentHead(next)?.id ?? targetId);
		if (projectId !== null) {
			void designBranchPersistAction(projectId, move, next).catch(() => {});
		}
	};

	/** Le checkpoint OUVERT (l'objet), ou null. */
	const openCp: DesignCheckpoint | null = useMemo(
		() => checkpoints.find((c) => c.id === openCheckpoint) ?? null,
		[checkpoints, openCheckpoint],
	);

	/** Le NOM AFFICHABLE du composant (la source-kind) d'un nœud — i18n, jamais devinée. */
	const componentLabel = (n: LayerNode): string | null => {
		const key = componentKindKey(n.sourceKind);
		return key !== null ? (t[key] ?? key) : null;
	};

	/** Le NOM AFFICHABLE d'une property (i18n, le jeu clos ADR 0010) — jamais le code brut. */
	const propLabel = (p: string): string => t[PROPERTY_LABEL_KEY[p] ?? ""] ?? p;

	/**
	 * LES JETONS DE MARQUE (ASSETS, ADR 0071 §4) — une VUE READ-ONLY de la palette DÉCLARÉE
	 * (ADR 0010, zinc + blue-600) : les tokens « que vous pouvez utiliser », JAMAIS un hex inventé.
	 * C'est la source des choix du style-panel — dérivée du catalogue FERMÉ (STYLE_TOKENS), pas écrite.
	 */
	const ASSETS: ReadonlyArray<{
		readonly key: string;
		readonly property: string;
		readonly tokens: readonly string[];
	}> = [
		{ key: "designAssetsColours", property: "bg", tokens: STYLE_TOKENS.bg },
		{
			key: "designAssetsRadius",
			property: "radius",
			tokens: STYLE_TOKENS.radius,
		},
		{
			key: "designAssetsTypography",
			property: "size",
			tokens: STYLE_TOKENS.size,
		},
	];

	/** Un nœud SÉLECTIONNÉ ? (coordonnée adressable identique à la sélection). */
	const isSelected = (n: LayerNode): boolean =>
		n.coord !== null &&
		selected !== null &&
		coordRef(selected) === coordRef(n.coord) &&
		selected.kind === n.coord.kind;

	return (
		<div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
			{/* ── COLONNE GAUCHE : les éléments + l'apparence ── */}
			<div className="space-y-5">
				{/* · LE LAYERS-PANEL : les coordonnées que l'app pin (twin + bridge) */}
				<section
					data-testid="v3-design-layers"
					className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm"
				>
					<h2 className="text-sm font-semibold text-foreground">
						{t.designLayersHeading}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t.designLayersHint}
					</p>
					<p className="text-[11px] leading-relaxed text-muted-foreground italic">
						{t.designDragHint}
					</p>
					{!hasSections ? (
						<p
							data-testid="v3-design-layers-empty"
							className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
						>
							{t.designLayersEmpty}
						</p>
					) : (
						/* L'ARBRE FRACTAL à plat (ADR 0055) : maître → enfants → sections → champs/actions.
						   Chaque nœud porte sa source-kind (le COMPOSANT dont il relève) ; les nœuds
						   adressables (section/champ/action) sélectionnent ; les gestes STRUCTURELS
						   (+ champ / + action / retirer / réordonner) routent vers le mur (idée→/goal). */
						<ul data-testid="v3-design-tree" className="space-y-0.5">
							{layers.map((n) => {
								const comp = componentLabel(n);
								const addressable = n.coord !== null;
								const sel = isSelected(n);
								return (
									<li
										key={n.id}
										data-testid="v3-design-layer-node"
										data-source-kind={n.sourceKind}
										data-depth={n.depth}
										style={{ paddingLeft: `${n.depth * 0.75}rem` }}
									>
										<div className="flex items-center gap-1">
											{/* le nœud lui-même : adressable → bouton de sélection ; sinon libellé organisationnel */}
											{addressable ? (
												<button
													type="button"
													data-testid="v3-design-layer"
													data-coord={coordRef(n.coord as ScreenCoord)}
													data-kind={(n.coord as ScreenCoord).kind}
													data-source-kind={n.sourceKind}
													aria-current={sel ? "true" : undefined}
													onClick={() => selectCoord(n.coord as ScreenCoord)}
													/* LE DRAG-DROP (T3) : un champ est réordonnable. Glisser un champ sur un autre
													   de la MÊME section = un RÉORDRE → routeDrag → idée→/goal (le mur §2). */
													draggable={n.sourceKind === "field"}
													onDragStart={() => {
														if (n.sourceKind === "field")
															setDragField(n.coord as ScreenCoord);
													}}
													onDragOver={(e) => {
														if (n.sourceKind === "field") e.preventDefault();
													}}
													onDrop={(e) => {
														if (n.sourceKind === "field") {
															e.preventDefault();
															onDropField(n.coord as ScreenCoord);
														}
													}}
													className={[
														"flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-1 text-left text-xs transition-colors",
														sel
															? "border-primary bg-primary/10 font-semibold text-primary"
															: "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5",
													].join(" ")}
												>
													{/* LA POIGNÉE de réordre (T3) — sur les champs uniquement (la frontière du drag). */}
													{n.sourceKind === "field" && (
														<span
															data-testid="v3-design-drag-handle"
															aria-hidden="true"
															title={t.designDragHandle}
															className="shrink-0 cursor-grab select-none font-mono text-[10px] text-muted-foreground"
														>
															⠿
														</span>
													)}
													<span className="min-w-0 flex-1 truncate">
														{n.label}
													</span>
													{/* LE COMPOSANT (la source-kind) — la détection de composants AIDOS */}
													{comp !== null && (
														<span
															data-testid="v3-design-component"
															data-component={n.sourceKind}
															className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
														>
															{comp}
														</span>
													)}
												</button>
											) : (
												<span
													data-testid="v3-design-layer-org"
													className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground"
												>
													<span className="min-w-0 flex-1 truncate font-mono">
														{n.sourceKind === "master"
															? n.label
															: (t[
																	`designChild${n.label.charAt(0).toUpperCase()}${n.label.slice(1)}`
																] ?? n.label)}
													</span>
												</span>
											)}

											{/* LES GESTES STRUCTURELS par nœud (le mur §2 — toujours vers idée→/goal) */}
											{n.sourceKind === "entity" && n.coord !== null && (
												<>
													<button
														type="button"
														data-testid="v3-design-struct-add-field"
														data-coord={coordRef(n.coord)}
														title={t.designStructuralWall}
														onClick={() =>
															routeStructural(
																"add-field",
																n.coord as ScreenCoord,
															)
														}
														className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
													>
														{t.designAddField}
													</button>
													<button
														type="button"
														data-testid="v3-design-struct-add-action"
														data-coord={coordRef(n.coord)}
														title={t.designStructuralWall}
														onClick={() =>
															routeStructural(
																"add-action",
																n.coord as ScreenCoord,
															)
														}
														className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
													>
														{t.designAddAction}
													</button>
												</>
											)}
											{n.sourceKind === "field" && n.coord !== null && (
												<>
													{/* LE RÉORDRE (T3) — un drag-drop équivalent, déterministe : un réordre change
													    la structure → routeDrag(mode:"reorder") → idée→/goal (le mur §2). */}
													<button
														type="button"
														data-testid="v3-design-struct-reorder"
														data-coord={coordRef(n.coord)}
														title={t.designReorderWall}
														onClick={() =>
															fireDrag({
																coord: n.coord as ScreenCoord,
																mode: "reorder",
															})
														}
														className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
													>
														{t.designReorder}
													</button>
													<button
														type="button"
														data-testid="v3-design-struct-remove"
														data-coord={coordRef(n.coord)}
														title={t.designStructuralWall}
														onClick={() =>
															routeStructural(
																"remove-field",
																n.coord as ScreenCoord,
															)
														}
														className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
													>
														{t.designRemove}
													</button>
												</>
											)}
											{n.sourceKind === "control" && n.coord !== null && (
												<button
													type="button"
													data-testid="v3-design-struct-remove"
													data-coord={coordRef(n.coord)}
													title={t.designStructuralWall}
													onClick={() =>
														routeStructural(
															"remove-action",
															n.coord as ScreenCoord,
														)
													}
													className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
												>
													{t.designRemove}
												</button>
											)}
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</section>

				{/* · LE STYLE-PANEL : le catalogue FERMÉ ADR 0010 (jamais un hex) */}
				<section
					data-testid="v3-design-style"
					className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
				>
					<div className="space-y-1">
						<h2 className="text-sm font-semibold text-foreground">
							{t.designStylePanel}
						</h2>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{t.designStyleHint}
						</p>
					</div>

					{selected === null ? (
						<p
							data-testid="v3-design-noselect"
							className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
						>
							{t.designNoSelection}
						</p>
					) : (
						<div className="space-y-3">
							<p className="text-xs text-muted-foreground">
								{t.designSelected} :{" "}
								<span
									data-testid="v3-design-selected"
									className="font-mono text-[11px] text-foreground"
								>
									{coordRef(selected)}
								</span>
							</p>

							{/* LE STYLE-PANEL COMPLET (ADR 0071 T3) : la property (groupée par axe) + le token.
							    Chaque property est un <select> de ses tokens FERMÉS (aucune saisie libre). */}
							<div className="grid grid-cols-2 gap-2">
								<label className="space-y-1 text-[11px] font-medium text-muted-foreground">
									{t.designTokenProperty}
									<select
										data-testid="v3-design-property"
										value={property}
										onChange={(e) => {
											setProperty(e.target.value);
											setToken(tokensFor(e.target.value)[0] ?? "");
										}}
										className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
									>
										{/* Toutes les properties, RANGÉES par groupe (couleur/typo/espacement/forme/disposition). */}
										{PROPERTY_GROUPS.map((grp) => (
											<optgroup
												key={grp.key}
												label={t[grp.key] ?? grp.key}
												data-testid="v3-design-property-group"
											>
												{grp.properties.map((p) => (
													<option key={p} value={p}>
														{propLabel(p)}
													</option>
												))}
											</optgroup>
										))}
									</select>
								</label>
								<label className="space-y-1 text-[11px] font-medium text-muted-foreground">
									{t.designTokenValue}
									<select
										data-testid="v3-design-token"
										value={token}
										onChange={(e) => setToken(e.target.value)}
										className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
									>
										{tokensFor(property).map((tk) => (
											<option key={tk} value={tk}>
												{tk}
											</option>
										))}
									</select>
								</label>
							</div>

							<button
								type="button"
								data-testid="v3-design-add-token"
								onClick={addToken}
								className="w-full rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
							>
								{t.designPreview}
							</button>

							{/* l'empilement proposé (les classes-token) */}
							{draftStyles.length > 0 && (
								<div
									data-testid="v3-design-draft"
									className="space-y-2 rounded-md border border-border bg-muted/30 px-2.5 py-2"
								>
									<div className="flex flex-wrap gap-1.5">
										{draftStyles.map((s) => (
											<span
												key={`${s.property}=${s.token}`}
												data-testid="v3-design-draft-token"
												className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-foreground"
											>
												{s.property}={s.token}
											</span>
										))}
									</div>
									{draftDesign !== null && (
										<p className="font-mono text-[10px] text-muted-foreground">
											ScreenDesign DRAFT —{" "}
											<span data-testid="v3-design-draft-id">
												{draftDesign.id.slice(0, 12)}…
											</span>
										</p>
									)}
									<div className="flex flex-wrap gap-2">
										<button
											type="button"
											data-testid="v3-design-capture"
											onClick={capture}
											className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
										>
											{t.designCapture}
										</button>
										<button
											type="button"
											data-testid="v3-design-clear"
											onClick={clearPreview}
											className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
										>
											{t.designClearPreview}
										</button>
									</div>
									<p className="text-[11px] leading-relaxed text-muted-foreground">
										{t.designCaptureHint}
									</p>
								</div>
							)}

							{/* un token refusé (hors catalogue) — le mur honnête, jamais un crash */}
							{blockMsg !== null && (
								<p
									data-testid="v3-design-block"
									className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[11px] leading-relaxed text-destructive"
								>
									{blockMsg}
								</p>
							)}

							{/* LA VOIE STRUCTURELLE : un changement de structure passe par le chat (idée→/goal) */}
							<div className="space-y-1.5 border-t border-border pt-3">
								<p className="text-[11px] leading-relaxed text-muted-foreground">
									{t.designStructuralHint}
								</p>
								<button
									type="button"
									data-testid="v3-design-structural"
									onClick={requestStructural}
									className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
								>
									{t.designStructuralBtn}
								</button>
							</div>
						</div>
					)}
				</section>

				{/* · LES JETONS DE MARQUE (ASSETS, ADR 0071 §4) — la palette DÉCLARÉE, read-only */}
				<section
					data-testid="v3-design-assets"
					className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
				>
					<div className="space-y-1">
						<h2 className="text-sm font-semibold text-foreground">
							{t.designAssetsHeading}
						</h2>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{t.designAssetsHint}
						</p>
					</div>
					{ASSETS.map((group) => (
						<div key={group.key} className="space-y-1.5">
							<h3 className="text-[11px] font-medium text-muted-foreground">
								{t[group.key] ?? group.key}
							</h3>
							<div className="flex flex-wrap gap-1.5">
								{group.tokens.map((tk) => (
									<span
										key={`${group.property}-${tk}`}
										data-testid="v3-design-asset-token"
										data-property={group.property}
										data-token={tk}
										className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-foreground"
									>
										{tk}
									</span>
								))}
							</div>
						</div>
					))}
				</section>

				{/* · LE CHAT IA GATÉ (Tranche 4) : langage naturel → proposition → re-jugé déterministe */}
				<section
					data-testid="v3-design-chat"
					className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
				>
					<div className="space-y-1">
						<h2 className="text-sm font-semibold text-foreground">
							{t.designChatHeading}
						</h2>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{t.designChatHint}
						</p>
					</div>

					<div className="flex items-end gap-2">
						<textarea
							data-testid="v3-design-chat-input"
							value={chatInput}
							rows={2}
							aria-label={t.designChatPlaceholder}
							onChange={(e) => setChatInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									void submitChat();
								}
							}}
							placeholder={t.designChatPlaceholder}
							className="max-h-32 min-h-[3rem] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:outline-none"
						/>
						<button
							type="button"
							data-testid="v3-design-chat-send"
							disabled={chatInput.trim() === "" || chatBusy}
							onClick={() => void submitChat()}
							className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{t.designChatSend}
						</button>
					</div>

					{/* l'indicateur de frappe (le tour IA en cours) */}
					{chatBusy && (
						<p
							data-testid="v3-design-chat-busy"
							className="text-[11px] text-muted-foreground italic"
						>
							{t.designChatBusy}
						</p>
					)}

					{/* la réponse chaleureuse du LLM (IA active) — décor, jamais autoritaire */}
					{chatReply !== null && (
						<p
							data-testid="v3-design-chat-reply"
							className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-[11px] leading-relaxed text-foreground"
						>
							{chatReply}
						</p>
					)}

					{/* LE VERDICT du re-jugement déterministe (l'autorité) — proposition → disposition */}
					{chatVerdict !== null && chatVerdict.nature === "styling" && (
						<div
							data-testid="v3-design-chat-styling"
							className="space-y-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-2"
						>
							<p className="text-[11px] font-medium text-primary">
								{t.designChatStyling}
							</p>
							<p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
								{chatVerdict.phrase}
							</p>
							<p className="font-mono text-[10px] text-muted-foreground">
								ScreenDesign DRAFT —{" "}
								<span data-testid="v3-design-chat-design-id">
									{chatVerdict.design.id.slice(0, 12)}…
								</span>
							</p>
						</div>
					)}
					{chatVerdict !== null && chatVerdict.nature === "structural" && (
						<div
							data-testid="v3-design-chat-structural"
							className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2"
						>
							<p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
								{t.designChatStructural}
							</p>
							<p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
								{chatVerdict.phrase}
							</p>
						</div>
					)}
					{chatVerdict !== null && chatVerdict.nature === "refused" && (
						<p
							data-testid="v3-design-chat-refused"
							className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[11px] leading-relaxed text-destructive"
						>
							{chatVerdict.block.explanation}
						</p>
					)}

					<p className="text-[11px] leading-relaxed text-muted-foreground italic">
						{t.designChatWall}
					</p>
				</section>

				{/* · LES BRANCHES DE DESIGN (Tranche 5) : le VERSION DAG S24 + les checkpoints */}
				<section
					data-testid="v3-design-branches"
					data-node-count={dag.nodes.length}
					data-edge-count={dag.edges.length}
					className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
				>
					<div className="space-y-1">
						<h2 className="text-sm font-semibold text-foreground">
							{t.designBranchHeading}
						</h2>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{t.designBranchHint}
						</p>
					</div>

					{/* « Où vous êtes » : la tête courante du DAG de design. */}
					<p className="text-xs text-muted-foreground">
						{t.designBranchHead} :{" "}
						<span
							data-testid="v3-design-branch-head"
							className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary"
						>
							{head?.label ?? DESIGN_ROOT_LABEL}
						</span>
					</p>

					{/* LA LIGNE DE VERSIONS (topo-triée) : chaque checkpoint cliquable (naviguer). */}
					<ul data-testid="v3-design-checkpoints" className="space-y-1">
						{checkpoints.map((c) => {
							const isHead = c.head;
							const isOpen = c.id === openCheckpoint;
							return (
								<li key={c.id}>
									<button
										type="button"
										data-testid="v3-design-checkpoint"
										data-label={c.label}
										data-head={isHead ? "true" : "false"}
										data-root={c.isRoot ? "true" : "false"}
										aria-current={isOpen ? "true" : undefined}
										onClick={() => setOpenCheckpoint(c.id)}
										className={[
											"flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
											isOpen
												? "border-primary bg-primary/10 font-semibold text-primary"
												: "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5",
										].join(" ")}
										style={{ paddingLeft: `${0.625 + c.rank * 0.6}rem` }}
									>
										<span className="min-w-0 flex-1 truncate font-mono">
											{c.label}
										</span>
										{c.isRoot && (
											<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
												{t.designBranchRoot}
											</span>
										)}
										{isHead && (
											<span
												data-testid="v3-design-checkpoint-head"
												className="shrink-0 text-primary"
											>
												●
											</span>
										)}
									</button>
								</li>
							);
						})}
					</ul>

					{/* LES MOUVEMENTS (le jeu CLOS §121) sur le checkpoint OUVERT : brancher / forker /
					    restaurer. Déterministes (le twin l'autorité) ; persistés below-the-line (le mur §2). */}
					{openCp !== null && (
						<div
							data-testid="v3-design-branch-actions"
							className="space-y-2 border-t border-border pt-3"
						>
							<p className="text-[11px] text-muted-foreground">
								{t.designBranchSelected} :{" "}
								<span
									data-testid="v3-design-branch-open"
									className="font-mono text-foreground"
								>
									{openCp.label}
								</span>
							</p>
							<div className="flex flex-wrap gap-2">
								{/* BRANCHER une ligne alternative depuis le checkpoint ouvert. */}
								<button
									type="button"
									data-testid="v3-design-branch-create"
									onClick={() => applyMove("branch", openCp.id)}
									className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
								>
									{t.designBranchCreate}
								</button>
								{/* FORKER depuis un ANCIEN point (checkout ancêtre + rebranch — l'ancienne ligne reste). */}
								<button
									type="button"
									data-testid="v3-design-branch-fork"
									onClick={() => applyMove("fork", openCp.id)}
									className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
								>
									{t.designBranchFork}
								</button>
								{/* RESTAURER ce checkpoint (un head-flag move arrière — rien supprimé). */}
								<button
									type="button"
									data-testid="v3-design-branch-restore"
									disabled={openCp.head}
									onClick={() => applyMove("restore", openCp.id)}
									className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
								>
									{t.designBranchRestore}
								</button>
							</div>
						</div>
					)}

					{/* LA LISIBILITÉ du MERGE (§122) : deux pointes divergentes → réconciliables par le
					    merge SÉMANTIQUE (le miroir décide, jamais le diff textuel — back/archive/merge). */}
					{merge.canMerge && (
						<p
							data-testid="v3-design-merge-ready"
							className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400"
						>
							{t.designBranchMerge}
						</p>
					)}

					<p className="text-[11px] leading-relaxed text-muted-foreground italic">
						{t.designBranchWall}
					</p>
				</section>

				<p className="px-1 text-[11px] leading-relaxed text-muted-foreground italic">
					{t.designWallNote}
				</p>
			</div>

			{/* ── COLONNE DROITE : l'aperçu live (iframe) ou l'état « non déployé » ── */}
			<div className="space-y-3">
				<h2 className="text-sm font-semibold text-foreground">
					{t.designIframeTitle}
				</h2>
				{!showIframe ? (
					<div
						data-testid="v3-design-not-deployed"
						className="space-y-3 rounded-xl border border-dashed border-border bg-card p-8 text-center"
					>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{t.designNotDeployed}
						</p>
						<button
							type="button"
							data-testid="v3-design-deploy"
							onClick={deployDev}
							className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
						>
							{t.designDeploy}
						</button>
					</div>
				) : (
					<DesignIframe
						devUrl={devUrl}
						title={t.designIframeTitle}
						command={command}
						onMessage={onBridge}
					/>
				)}

				{/* LE JOURNAL d'adaptations déjà capitalisées dans la session (below-the-line, rejoué). */}
				{adaptations.length > 0 && (
					<div
						data-testid="v3-design-applied"
						className="space-y-1.5 rounded-xl border border-border bg-card p-4 shadow-sm"
					>
						<h3 className="text-xs font-semibold text-foreground">
							{t.designStylePanel}
						</h3>
						<ul className="space-y-1">
							{adaptations.map((e) => (
								<li
									key={`${e.ref}-${e.detail}`}
									data-testid="v3-design-applied-row"
									className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground"
								>
									{e.detail}
								</li>
							))}
						</ul>
					</div>
				)}
			</div>
		</div>
	);
}
