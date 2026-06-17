/**
 * WB2-27 — le TWIN PUR du IA BUILDER (ADR 0057) : UN écran, UN chat qui fait TOUT —
 * mais « tout » passe par une GRAMMAIRE D'INTENTIONS FERMÉE et un RÉDUCTEUR PUR.
 *
 * LE MODÈLE (déterminisme-first §6/§8, poussé au maximum) :
 *   - le jeu des intentions est CLOS et DÉCLARÉ (INTENT_KINDS) — le chat ne sait faire
 *     que ce qui est déclaré, jamais « un peu de tout » ;
 *   - chaque message est CLASSÉ par un algorithme lexical (classifyIntent — accents
 *     pliés, lexiques déclarés, scores), JAMAIS par un prompt :
 *       · « L'ATTENTE »                       = le candidat en tête (understand) ;
 *       · « LES TYPES DE RÉPONSE POSSIBLES »  = TOUS les candidats, classés ;
 *       · l'AMBIGUÏTÉ (deux candidats à égalité) est DÉTECTÉE et REMONTÉE — jamais
 *         tranchée en silence (l'écran offre le choix ; le LLM n'est que l'exception
 *         gatée de désambiguïsation, et le code garde l'autorité) ;
 *   - applyIntent est un RÉDUCTEUR PUR event-sourcé : même (état, message) → même
 *     (état', événements, impacts) ; le journal est APPEND-ONLY (§9) ;
 *       · « LA RÉPONSE »   = les événements produits (jeu clos, typés) ;
 *       · « LES IMPACTS »  = la vague calculée (sous-arbre composes, idées, kernels).
 *
 * RÉUTILISATION (pas de fork — le builder COMPOSE les twins existants) : l'arbre
 * vivant (composition : seed/greffe/placement/position), l'idée (composeIdea — le
 * niveau, la facette et l'échelle sont PRIS DU NŒUD D'ATTACHE : le système identifie
 * la coordonnée entière), la promotion (goal : promoteIdea → kernel proposé, ChangeSet
 * DRAFT). L'impact code (code-graph) est composé CÔTÉ ÉCRAN sur le graphe extrait.
 *
 * LE MUR (§2) : aucune intention, sur aucun état, ne produit une écriture-vérité —
 * une idée a toujours hasMirror=false, un kernel proposé toujours wroteKernel=false,
 * un déploiement est PROPOSÉ (gaté ADR 0052), jamais exécuté ici. Épinglé par une
 * propriété ∀ du miroir lib/v2/builder.test.ts.
 */

import {
	classifyGesture,
	isKnownStyleToken,
	type StyleToken,
} from "../v3/design/screen-design";
import {
	type AnchorSuggestion,
	anchorSymbols,
	type CodeEdge,
	type CodeNode,
	impactOf,
} from "./code-graph";
import {
	growComposes,
	nodeByPath,
	nodePath,
	placeIntent,
	seedComposes,
} from "./composition";
import { type MirrorSpec, type ProposedKernel, promoteIdea } from "./goal";
import { composeIdea, type Idea } from "./idea";
import type { KernelNode } from "./kernel-tree";
import { ALL_SCREENS } from "./screen-registry";

/** Le jeu CLOS des intentions — tout ce que le chat sait faire, déclaré, rien d'autre. */
export const INTENT_KINDS = [
	"capturer_idee",
	"greffer",
	"promouvoir",
	"generer",
	"deployer",
	"delta",
	"impacter",
	"interroger",
	"ouvrir",
	"adapter",
	// LES CAPACITÉS LANCÉES (DG06/ADR 0088 ; ADR 0046 EvolutionSandbox) — un geste de
	// cockpit ENVOIE au chat « lance le bench… » / « explore l'évolution… » ; le réducteur
	// les ROUTE vers leur port (RequirementBench, EvolutionSandbox) below-the-line. Sans ces
	// deux kinds, l'action exposée tombait en « incomprise » (un MONSTRE — la loi de couverture
	// §1/§5 généralisée : aucune action exposée sans type de réponse). Voir CANONICAL_ACTIONS.
	"lancer_bench",
	"explorer_evolution",
	// LES LECTURES LIVE (ADR 0092 — la passerelle dispatche le serveur Go ; le moteur est la
	// SOURCE) : chaque geste de LECTURE adossé à un serveur DISPATCHÉ produit un kind `lecture_live`
	// dont l'événement porte `via = { server, tool, args }` — l'aval (V3Session/actions) résout par
	// `readVia(scope, tool, args)`. Le réducteur reste PUR : il NE fait AUCUN I/O, il POINTE la
	// capacité (jamais réimplémenter la logique du serveur — déterminisme-first §6, le moteur la SOURCE).
	"voir_pourquoi", // why-tree/build — l'arbre POURQUOI d'un incident (FK13 /why)
	"piloter_goal", // goal-piloting/goal_pilot_open — l'objectif piloté (état DRAFT)
	"voir_federation", // federation/fan_out — la fédération entre cellules (§51)
	"reconcilier", // conscience/reconcile — réconcilier les décisions sourcées (FK09)
	"mesurer_archfit", // arch-fitness/measure — la conformité architecturale (S102)
	"voir_boucle", // build-loop/buildloop_terminate — la boucle de construction (S83)
	"mesurer_cout", // cost-meter/cost_meter_cell — le coût d'une cellule (S111)
	"parcourir_comportements", // behaviors/behaviors_search — la bibliothèque de comportements
	"jardiner_kernel", // kernel-garden/garden_tend_project — la dette kernel (S112)
	"enforcer_autonomie", // autonomy/enforce — le verdict de niveau d'autonomie
	"voir_console", // build-console/buildconsole_project — la console de construction (S86)
	"voir_facturation", // billing/billing_meter — la facturation du projet (S110)
	"parcourir_gabarits", // templates/templates_list — les gabarits content-adressés (S81)
	"voir_besoin", // besoin-intake/besoin_graph_state — l'état du BesoinGraph (EL15)
	"auto_certifier", // self-cert/selfcert_gate — le verdict de certification (batterie)
	"verifier_auth", // app-auth/app_auth_check_access — un lookup d'autorisation pur
	"explorer_espace", // workspace/workspace_provision — le provisioning DRY-RUN (sandbox)
	"modeler_entites", // entity-modeler/schema_validate — la validation d'entités (S75)
	"inspecter_forme", // shape-editor/shape_derive — la forme dérivée d'une entité (S76)
	"mapper_contexte", // context-map/verify_all — la vérif des contrats inter-cellules (S78)
	"griller_intention", // grilling-loop/grill_route — le verdict de fidélité du grilling
	// LES PROPOSITIONS (LE MUR §2 — un geste qui CHANGERAIT la vérité ne grave JAMAIS depuis le
	// réducteur ; il PROPOSE : une idée DRAFT / un ChangeSet DRAFT) : le kind `proposition` porte
	// `via = { server, tool, args }` ET `propose` (la nature de la proposition) ; l'aval ouvre la
	// porte légale (idée → miroir → /goal). wroteKernel/hasMirror restent toujours faux.
	"apprendre_incident", // learn/bump_hash — signal d'incident → Idea DRAFT (firewall.ViaIdea)
	"editer_dsl", // dsl-editor/dsl_propose — un ChangeSet DRAFT typé sur un DSL (S77)
	"provisionner_substrat", // provision/stack.emit — un StackManifest ChangeSet DRAFT (DP13)
	"ingerer_realite", // idea-intake — un signal de réalité → Idea DRAFT (la seule porte prod→kernel)
] as const;
export type IntentKind = (typeof INTENT_KINDS)[number];

/**
 * LE RÉFÉRENCEMENT D'UN SERVEUR DISPATCHÉ (ADR 0092) — la coordonnée que le réducteur
 * POINTE pour un geste live/propose, SANS jamais appeler la passerelle (il reste PUR).
 * L'aval (V3Session/actions) lit `readVia(scope, tool, args)` ; le moteur Go est la SOURCE.
 */
export interface ServerVia {
	/** Le serveur DISPATCHÉ par la passerelle (ex. « why-tree », « goal-piloting »). */
	readonly server: string;
	/** L'outil MCP à invoquer en aval (ex. « build », « goal_pilot_open »). */
	readonly tool: string;
	/** Les arguments extraits du message (la cible citée VERBATIM), passés à readVia. */
	readonly args: Readonly<Record<string, string>>;
}

/**
 * LA TABLE DÉCLARÉE des gestes LIVE/PROPOSE → (intent, serveur, outil, nature). FERMÉE,
 * au-dessus de la ligne (§8 — jamais apprise). Le réducteur la consulte pour POINTER la
 * capacité ; le miroir l'itère pour prouver la bijection geste↔kind. `propose` distingue
 * une LECTURE (false — un read live câblé à un serveur) d'une PROPOSITION (la nature de la
 * proposition : idée / changeset — le MUR §2, jamais une écriture directe).
 */
export interface LiveGesture {
	readonly intent: IntentKind;
	readonly server: string;
	readonly tool: string;
	/** L'ANCRE lexicale qui précède la cible (« incident », « cellule », « spec »…). */
	readonly anchor: string;
	/** La clé d'argument passée à readVia (ex. « incident », « cell », « scope »). */
	readonly argKey: string;
	/** La cible par défaut si aucune n'est citée (l'écran porte la canonique). */
	readonly fallback: string;
	/** La route Workbench de la lentille correspondante (la cible de l'événement). */
	readonly route: string;
	/** false = LECTURE live ; sinon la nature de la PROPOSITION (le MUR §2). */
	readonly propose: false | "idee" | "changeset";
}

export const LIVE_GESTURES: readonly LiveGesture[] = [
	// — LECTURES LIVE (un serveur dispatché → readVia, le moteur est la SOURCE, ADR 0092) —
	{
		intent: "voir_pourquoi",
		server: "why-tree",
		tool: "build",
		anchor: "incident",
		argKey: "incident",
		fallback: "le-symptome",
		route: "/v2/why-tree",
		propose: false,
	},
	{
		intent: "piloter_goal",
		server: "goal-piloting",
		tool: "goal_pilot_open",
		anchor: "objectif",
		argKey: "goal",
		fallback: "la-derniere-idee",
		route: "/v2/goal",
		propose: false,
	},
	{
		intent: "voir_federation",
		server: "federation",
		tool: "fan_out",
		anchor: "federation",
		argKey: "policy",
		fallback: "la-politique-globale",
		route: "/federation-cockpit",
		propose: false,
	},
	{
		intent: "reconcilier",
		server: "conscience",
		tool: "reconcile",
		anchor: "decisions",
		argKey: "scope",
		fallback: "le-projet",
		route: "/v2/conscience",
		propose: false,
	},
	{
		intent: "mesurer_archfit",
		server: "arch-fitness",
		tool: "measure",
		anchor: "architecturale",
		argKey: "scope",
		fallback: "le-projet",
		route: "/arch-fitness",
		propose: false,
	},
	{
		intent: "voir_boucle",
		server: "build-loop",
		tool: "buildloop_terminate",
		anchor: "construction",
		argKey: "project",
		fallback: "le-projet",
		route: "/build-loop",
		propose: false,
	},
	{
		intent: "mesurer_cout",
		server: "cost-meter",
		tool: "cost_meter_cell",
		anchor: "cellule",
		argKey: "cell",
		fallback: "la-cellule-canonique",
		route: "/cost-meter",
		propose: false,
	},
	{
		intent: "parcourir_comportements",
		server: "behaviors",
		tool: "behaviors_search",
		anchor: "comportements",
		argKey: "facet",
		fallback: "toutes",
		route: "/behaviors",
		propose: false,
	},
	{
		intent: "jardiner_kernel",
		server: "kernel-garden",
		tool: "garden_tend_project",
		anchor: "jardin",
		argKey: "project",
		fallback: "le-projet",
		route: "/kernel-garden",
		propose: false,
	},
	{
		intent: "enforcer_autonomie",
		server: "autonomy",
		tool: "enforce",
		anchor: "autonomie",
		argKey: "level",
		fallback: "le-niveau-courant",
		route: "/autonomy",
		propose: false,
	},
	{
		intent: "voir_console",
		server: "build-console",
		tool: "buildconsole_project",
		anchor: "construction",
		argKey: "project",
		fallback: "le-projet",
		route: "/build-console",
		propose: false,
	},
	{
		intent: "voir_facturation",
		server: "billing",
		tool: "billing_meter",
		anchor: "facturation",
		argKey: "project",
		fallback: "le-projet",
		route: "/billing",
		propose: false,
	},
	{
		intent: "parcourir_gabarits",
		server: "templates",
		tool: "templates_list",
		anchor: "gabarits",
		argKey: "kind",
		fallback: "tous",
		route: "/templates",
		propose: false,
	},
	{
		intent: "voir_besoin",
		server: "besoin-intake",
		tool: "besoin_graph_state",
		anchor: "besoin",
		argKey: "level",
		fallback: "le-niveau-courant",
		route: "/besoin-intake",
		propose: false,
	},
	{
		intent: "auto_certifier",
		server: "self-cert",
		tool: "selfcert_gate",
		anchor: "batterie",
		argKey: "spec",
		fallback: "la-batterie-canonique",
		route: "/self-cert",
		propose: false,
	},
	{
		intent: "verifier_auth",
		server: "app-auth",
		tool: "app_auth_check_access",
		anchor: "auth",
		argKey: "role",
		fallback: "le-role-courant",
		route: "/app-auth",
		propose: false,
	},
	{
		intent: "explorer_espace",
		server: "workspace",
		tool: "workspace_provision",
		anchor: "espace",
		argKey: "project",
		fallback: "le-projet",
		route: "/workspace",
		propose: false,
	},
	{
		intent: "modeler_entites",
		server: "entity-modeler",
		tool: "schema_validate",
		anchor: "entites",
		argKey: "scope",
		fallback: "le-projet",
		route: "/entity-modeler",
		propose: false,
	},
	{
		intent: "inspecter_forme",
		server: "shape-editor",
		tool: "shape_derive",
		anchor: "forme",
		argKey: "entity",
		fallback: "l-entite-courante",
		route: "/shape-editor",
		propose: false,
	},
	{
		intent: "mapper_contexte",
		server: "context-map",
		tool: "verify_all",
		anchor: "contexte",
		argKey: "domain",
		fallback: "le-domaine",
		route: "/context-map",
		propose: false,
	},
	{
		intent: "griller_intention",
		server: "grilling-loop",
		tool: "grill_route",
		anchor: "challenge",
		argKey: "intent",
		fallback: "l-intention-courante",
		route: "/v2/grill",
		propose: false,
	},
	// — PROPOSITIONS (LE MUR §2 — idée / ChangeSet DRAFT, JAMAIS une écriture-vérité) —
	{
		intent: "apprendre_incident",
		server: "learn",
		tool: "bump_hash",
		anchor: "incident",
		argKey: "incident",
		fallback: "le-dernier-incident",
		route: "/learn",
		propose: "idee",
	},
	{
		intent: "editer_dsl",
		server: "dsl-editor",
		tool: "dsl_propose",
		anchor: "dsl",
		argKey: "spec",
		fallback: "la-spec-courante",
		route: "/dsl-editor",
		propose: "changeset",
	},
	{
		intent: "provisionner_substrat",
		server: "provision",
		tool: "stack.emit",
		anchor: "substrat",
		argKey: "version",
		fallback: "la-version-courante",
		route: "/v3/environnements",
		propose: "changeset",
	},
	{
		intent: "ingerer_realite",
		server: "idea-intake",
		tool: "idea_capture",
		anchor: "realite",
		argKey: "path",
		fallback: "le-signal-courant",
		route: "/v2/idee",
		propose: "idee",
	},
] as const;

/**
 * LE REGISTRE CANONIQUE DES ACTIONS DE L'OS — déclaré, clos (la LOI DE COUVERTURE des
 * actions, §1/§5 « pas de monstre » généralisée). CHAQUE action que l'OS expose (un bouton
 * de cockpit qui ENVOIE un geste au chat via send(), les gestes de cycle de vie) figure ici
 * avec SA phrase canonique et le type de réponse (l'intent) auquel elle DOIT s'accrocher.
 *
 * C'est CE registre qui PILOTE le miroir de complétude (builder.test.ts) : ∀ action du
 * registre, understand(phrase).attente === expect ∧ status === "comprise" — JAMAIS le
 * fallthrough « incomprise ». Une action exposée par un écran et absente d'ici (ou retombant
 * en « incomprise ») est un MONSTRE — l'inverse d'un miroir orphelin. DÉCLARÉ, jamais appris.
 *
 * NOTE : les phrases portent des arguments concrets (un id de spec, un chemin, un titre
 * d'écran réels) — le classement lexical ne dépend QUE des verbes/indices déclarés, pas des
 * arguments ; le registre les fige pour que le miroir rejoue exactement ce que les écrans
 * envoient (BenchClient, EvolveClient, ParcoursClient, EnvsClient, ParamsClient, DesignClient).
 */
export interface CanonicalAction {
	/** L'identifiant stable de l'action (la source/écran qui l'expose). */
	readonly id: string;
	/** La phrase canonique EXACTE qu'un écran envoie au chat (avec un argument exemple). */
	readonly phrase: string;
	/** Le type de réponse (l'intent) auquel l'action DOIT s'accrocher — jamais le fallthrough. */
	readonly expect: IntentKind;
}

export const CANONICAL_ACTIONS: readonly CanonicalAction[] = [
	// — Cycle de vie d'une appli (lab/chat) —
	{
		id: "capture-idee",
		phrase: "capture l'idée : au checkout, débiter le compte une seule fois",
		expect: "capturer_idee",
	},
	{
		id: "greffe",
		phrase: "greffe les remboursements sous app/paiement",
		expect: "greffer",
	},
	{ id: "promotion", phrase: "promeus la dernière idée", expect: "promouvoir" },
	{ id: "generation", phrase: "génère l'application", expect: "generer" },
	// — EnvsClient : le bouton « Déployer en <env> » —
	{
		id: "envs-deploy",
		phrase: "déploie l'application en dev",
		expect: "deployer",
	},
	{ id: "delta", phrase: "montre le delta depuis la prod", expect: "delta" },
	// — ParcoursClient : le bouton « Calculer l'impact » —
	{
		id: "parcours-impact",
		phrase: "quel impact si je modifie app/paiement",
		expect: "impacter",
	},
	{
		id: "interrogation",
		phrase: "montre-moi l'état du projet",
		expect: "interroger",
	},
	// — Navigation totale du Workbench —
	{ id: "ouvrir-ecran", phrase: "ouvre l'écran idee", expect: "ouvrir" },
	// — DesignClient : le bouton « Appliquer » (styling below-the-line, tokens ADR 0010) —
	{
		id: "design-adapte",
		phrase: "adapte la section heros : text=primary radius=lg",
		expect: "adapter",
	},
	// — BenchClient : le bouton « Lancer le bench » (RequirementBench, DG06/ADR 0088) —
	{
		id: "bench-completude",
		phrase: "lance le bench de complétude sur la spec createOrder",
		expect: "lancer_bench",
	},
	// — EvolveClient : le bouton « Explorer » (EvolutionSandbox, ADR 0046) —
	{
		id: "evolve-exploration",
		phrase: "explore l'évolution de la cellule debit-du-compte par self-play",
		expect: "explorer_evolution",
	},
	// — LES LECTURES LIVE (ADR 0092 — un serveur DISPATCHÉ ; l'aval résout par readVia ;
	//   le moteur Go est la SOURCE). Chaque phrase canonique cite l'ANCRE + la cible. —
	{
		id: "why-tree-display",
		phrase: "montre l'arbre pourquoi de l'incident debit-double",
		expect: "voir_pourquoi",
	},
	{
		id: "goal-pilot-open",
		phrase: "pilote l'objectif idee-checkout",
		expect: "piloter_goal",
	},
	{
		id: "federation-view",
		phrase: "affiche la fédération entre les cellules paiement-catalogue",
		expect: "voir_federation",
	},
	{
		id: "conscience-reconcile",
		phrase: "réconcilie les décisions du scope paiement",
		expect: "reconcilier",
	},
	{
		id: "arch-fitness-measure",
		phrase: "mesure la conformité architecturale du projet",
		expect: "mesurer_archfit",
	},
	{
		id: "build-loop-view",
		phrase: "affiche la boucle buildloop du projet",
		expect: "voir_boucle",
	},
	{
		id: "cost-meter-cell",
		phrase: "mesure le coût de la cellule debit-du-compte",
		expect: "mesurer_cout",
	},
	{
		id: "behaviors-search",
		phrase: "parcours les comportements de paiement",
		expect: "parcourir_comportements",
	},
	{
		id: "kernel-garden-tend",
		phrase: "tend le jardin kernel du projet demoshop",
		expect: "jardiner_kernel",
	},
	{
		id: "autonomy-enforce",
		phrase: "enforce l'autonomie du niveau N2",
		expect: "enforcer_autonomie",
	},
	{
		id: "build-console-project",
		phrase: "affiche la console buildconsole du projet",
		expect: "voir_console",
	},
	{
		id: "billing-meter",
		phrase: "affiche la facturation billing du projet demoshop",
		expect: "voir_facturation",
	},
	{
		id: "templates-browse",
		phrase: "parcours les gabarits saas",
		expect: "parcourir_gabarits",
	},
	{
		id: "besoin-compound",
		phrase: "travaille le besoin du niveau product",
		expect: "voir_besoin",
	},
	{
		id: "self-cert-gate",
		phrase: "auto-certifie la batterie createOrder",
		expect: "auto_certifier",
	},
	{
		id: "app-auth-check",
		phrase: "vérifie l'auth du role admin",
		expect: "verifier_auth",
	},
	{
		id: "workspace-provision",
		phrase: "explore l'espace workspace du projet demoshop",
		expect: "explorer_espace",
	},
	{
		id: "entity-modeler-validate",
		phrase: "modèle les entités du scope paiement",
		expect: "modeler_entites",
	},
	{
		id: "shape-editor-inspect",
		phrase: "inspecte la forme de l'entité Commande",
		expect: "inspecter_forme",
	},
	{
		id: "context-map-verify",
		phrase: "mappe le contexte du domaine paiement",
		expect: "mapper_contexte",
	},
	{
		id: "grilling-loop-grill",
		phrase: "grille le challenge de l'intention idee-checkout",
		expect: "griller_intention",
	},
	// — LES PROPOSITIONS (LE MUR §2 — idée / ChangeSet DRAFT, jamais une écriture-vérité) —
	{
		id: "learn-from-incident",
		phrase: "apprends de l'incident debit-double",
		expect: "apprendre_incident",
	},
	{
		id: "dsl-parse-edit",
		phrase: "édite le dsl de la spec createOrder",
		expect: "editer_dsl",
	},
	{
		id: "provision-stack",
		phrase: "provisionne le substrat de la version v2",
		expect: "provisionner_substrat",
	},
	{
		id: "reality-ingest-signal",
		phrase: "ingère le signal de réalité du path checkout-latence",
		expect: "ingerer_realite",
	},
] as const;

/**
 * L'ÉCHELLE D'ENVIRONNEMENTS — DÉCLARÉE, close, ORDONNÉE (le cliquet généralisé) :
 * déployer au barreau i exige que la MÊME version soit posée au barreau i-1 ; toute
 * nouvelle promotion ré-arme chaque barreau supérieur. Étendre l'échelle = déclarer
 * un barreau ici (une donnée), jamais coder un cas.
 */
export const ENV_LADDER = ["dev", "staging", "prod"] as const;
/** Le nom d'un environnement — l'échelle est une DONNÉE (configurable par instance). */
export type EnvName = string;

/** Une référence d'ÉCRAN du Workbench (v1 ou v2) — l'inventaire est une DONNÉE. */
export interface ScreenRef {
	readonly route: string;
	readonly label: string;
}

/** Un candidat de classement : une intention possible + son score d'accroche. */
export interface IntentCandidate {
	readonly kind: IntentKind;
	readonly score: number;
}

/** Le verdict de compréhension d'un message — « l'attente » + les possibles. */
export interface Understanding {
	/** comprise (un candidat net) · ambigue (égalité en tête) · incomprise (aucune accroche). */
	readonly status: "comprise" | "ambigue" | "incomprise";
	/** TOUS les candidats, classés score ↓ (les « types de réponse possibles »). */
	readonly candidates: readonly IntentCandidate[];
	/** L'intention en tête quand le statut est comprise (sinon null). */
	readonly attente: IntentKind | null;
}

/** Un ÉVÉNEMENT produit par le réducteur — jeu clos, typé (« la réponse »). */
export interface BuilderEvent {
	readonly kind:
		| "idee_capturee"
		| "arbre_greffe"
		| "kernel_propose"
		| "impact_calcule"
		| "etat_lu"
		| "app_generee"
		| "deploiement"
		| "delta_calcule"
		| "ecran_ouvert"
		| "ecran_adapte"
		// LES CAPACITÉS LANCÉES (below-the-line — un run de port projeté, jamais une vérité) :
		| "bench_lance"
		| "evolution_exploree"
		// LA LECTURE LIVE (ADR 0092 — un serveur DISPATCHÉ ; l'aval résout par readVia ; le
		// moteur Go est la SOURCE). `via` porte { server, tool, args } ; le réducteur reste PUR.
		| "lecture_live"
		// LA PROPOSITION (LE MUR §2 — idée / ChangeSet DRAFT, jamais une écriture-vérité).
		| "proposition"
		| "refus";
	readonly detail: string;
	/** La référence content-adressée touchée (chemin, id d'idée, version, route…). */
	readonly ref: string;
	/** Le barreau d'environnement concerné (déploiements/refus d'échelle). */
	readonly env?: EnvName;
	/**
	 * LA COORDONNÉE DE SERVEUR (lecture_live / proposition) — ce que l'aval (V3Session/
	 * actions) passe à `readVia(scope, tool, args)`. Le réducteur ne l'APPELLE jamais (il
	 * reste pur) : il POINTE la capacité. Absent pour les événements purement locaux.
	 */
	readonly via?: ServerVia;
	/**
	 * LA NATURE DE LA PROPOSITION (proposition uniquement, LE MUR §2) — « idee » (un signal/
	 * besoin → Idea DRAFT, hasMirror=false) ou « changeset » (un ChangeSet DRAFT, jamais
	 * appliqué). Atteste qu'AUCUNE vérité n'est gravée depuis le chat.
	 */
	readonly propose?: "idee" | "changeset";
}

/** Un IMPACT calculé (« quoi est touché ») — la vague, jamais estimée. */
export interface BuilderImpact {
	readonly cible: string;
	readonly type: "composes" | "idee" | "kernel";
}

/** Un DÉPLOIEMENT d'environnement : la version d'app posée + les versions de kernels embarquées. */
export interface Deployment {
	/** La version content-adressée de l'app déployée (app:<hash>). */
	readonly version: string;
	/** Les versions des kernels embarqués (la base du calcul de DELTA). */
	readonly kernelVersions: readonly string[];
}

/** L'ÉTAT du builder — event-sourcé : l'arbre vivant, les idées, les kernels, les ENVIRONNEMENTS, le journal. */
export interface BuilderState {
	readonly tree: readonly KernelNode[];
	readonly ideas: readonly Idea[];
	readonly kernels: readonly ProposedKernel[];
	/** L'ÉCHELLE de CET état (configurable par instance — le nombre d'envs est une donnée). */
	readonly ladder: readonly string[];
	/** Les environnements de l'échelle (le CLIQUET généralisé — barreau i exige i-1). */
	readonly envs: Readonly<Record<string, Deployment | null>>;
	/** L'inventaire des ÉCRANS atteignables (v2 = le registre déclaré ; v1 = injecté en données). */
	readonly screens: readonly ScreenRef[];
	readonly log: readonly BuilderEvent[];
}

/** Le résultat d'un tour de chat : l'état suivant + les événements + la vague. */
export interface ApplyResult {
	readonly state: BuilderState;
	readonly events: readonly BuilderEvent[];
	readonly impacts: readonly BuilderImpact[];
}

/** L'état initial : l'arbre seed (un SEUL produit racine), rien d'autre. */
export function initBuilderState(
	extraScreens: readonly ScreenRef[] = [],
	tree?: readonly KernelNode[],
	ladder: readonly string[] = ENV_LADDER,
): BuilderState {
	// LE REGISTRE D'ÉCRANS COMPLET (ALL_SCREENS) est l'inventaire par défaut, faisant AUTORITÉ :
	// TOUTES les capacités de la nav — racine (V1), V2, V3 — déclarées en données (jamais le seul
	// scan du système de fichiers, qui n'énumère pas les sous-routes /v3/* → un angle mort/monstre).
	// `extraScreens` reste pour une augmentation runtime (un écran dynamique scanné en plus) ; le
	// registre déclaré garantit la COUVERTURE que le miroir prouve. Les routes en double sont
	// idempotentes (Map par route — le registre déclaré l'emporte, l'injection ne le contredit pas).
	const byRoute = new Map<string, ScreenRef>();
	for (const s of ALL_SCREENS) byRoute.set(s.route, s);
	for (const s of extraScreens)
		if (!byRoute.has(s.route)) byRoute.set(s.route, s);
	return {
		// Par défaut le seed de démo (les écrans V2 illustrent le concept) ; la V3
		// passe bareTree() — un PROJET NEUF est NU (loi au miroir).
		tree: tree ?? seedComposes(),
		ideas: [],
		kernels: [],
		ladder,
		envs: Object.fromEntries(ladder.map((e) => [e, null])),
		screens: [...byRoute.values()],
		log: [],
	};
}

/** Plie un texte en tokens canoniques (accents pliés, ≥3 chars). */
function tokensOf(text: string): Set<string> {
	return new Set(
		text
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.split(/[^a-z0-9/]+/)
			.filter((t) => t.length >= 3),
	);
}

/**
 * Les LEXIQUES déclarés de la grammaire — par intention : verbes FORTS (2 points) et
 * indices FAIBLES (1 point). DÉCLARÉS au-dessus de la ligne, jamais appris (§8).
 */
const LEXICONS: Record<
	IntentKind,
	{ strong: readonly string[]; weak: readonly string[] }
> = {
	capturer_idee: {
		strong: ["capture", "capturer", "note", "noter", "enregistre"],
		weak: ["idee", "besoin", "veux", "voudrais"],
	},
	greffer: {
		strong: ["greffe", "greffer", "ajoute", "ajouter", "cree", "creer"],
		weak: ["sous", "branche", "noeud", "arbre"],
	},
	promouvoir: {
		strong: ["promeus", "promouvoir", "promotion", "goal", "gele", "geler"],
		weak: ["miroir", "kernel", "verite", "derniere"],
	},
	impacter: {
		strong: ["impact", "impacte", "impacts", "touche", "casse"],
		weak: ["modifie", "modifier", "change", "vague", "rouge"],
	},
	generer: {
		strong: [
			"genere",
			"generer",
			"emets",
			"emettre",
			"construis",
			"construire",
		],
		weak: ["app", "application", "code", "entites"],
	},
	delta: {
		strong: ["delta", "deltas", "diff", "difference", "ecart", "compare"],
		weak: ["depuis", "entre", "version", "deploye"],
	},
	interroger: {
		strong: ["montre", "montrer", "affiche", "liste", "etat"],
		weak: ["voir", "combien", "projet", "resume"],
	},
	deployer: {
		strong: ["deploie", "deployer", "deploiement", "livre", "livrer"],
		weak: ["production", "prod", "staging", "dev", "ligne", "mettre"],
	},
	ouvrir: {
		strong: ["ouvre", "ouvrir", "ecran", "panneau", "navigue"],
		weak: ["page", "route", "aller", "vers"],
	},
	adapter: {
		strong: ["adapte", "adapter", "style", "styler", "couleur", "design"],
		weak: ["token", "radius", "fond", "marge", "espacement", "theme"],
	},
	// LE BENCH DE COMPLÉTUDE (RequirementBench, DG06/ADR 0088) — « lance le bench de
	// complétude sur la spec <id> » : verbes forts `bench`/`complétude`, indices faibles
	// (spec/requirement…) ; `lance` seul reste faible (il sert aussi à d'autres lancements).
	lancer_bench: {
		strong: ["bench", "benchmarque", "completude", "complete"],
		weak: [
			"lance",
			"lancer",
			"spec",
			"specification",
			"requirement",
			"couverture",
		],
	},
	// L'EXPLORATION D'ÉVOLUTION (EvolutionSandbox, ADR 0046) — « explore l'évolution de la
	// cellule <id> par <sampler> » : verbes forts `explore`/`évolution`/`cellule`, indices
	// faibles (variant/sampler/self-play…). Le run reste en quarantaine (le sandbox), jamais
	// une promotion (idée → miroir → /goal pour une variante à verser).
	explorer_evolution: {
		strong: ["explore", "explorer", "evolution", "evolue"],
		weak: [
			"cellule",
			"variant",
			"variante",
			"sampler",
			"play",
			"niche",
			"quarantaine",
			"sandbox",
		],
	},
	// LES LECTURES LIVE (ADR 0092) — l'ANCRE distinctive de chaque serveur est un verbe FORT
	// (l'incident, la fédération, le jardin… n'apparaissent dans aucun autre lexique) ; les indices
	// faibles désambiguïsent. Le moteur Go est la SOURCE en aval ; ici, juste le classement.
	voir_pourquoi: {
		strong: ["pourquoi", "incident", "whytree"],
		weak: ["arbre", "symptome", "cause", "racine", "rouge"],
	},
	piloter_goal: {
		strong: ["pilote", "piloter", "goal", "objectif"],
		weak: ["draft", "redset", "promotion", "fige"],
	},
	voir_federation: {
		strong: ["federation", "federe", "federer", "saga"],
		weak: ["cellules", "cross", "policy", "fanout", "globale"],
	},
	reconcilier: {
		strong: ["reconcilie", "reconcilier", "reconciliation", "conscience"],
		weak: ["decisions", "decision", "sourcees", "verdicts", "cards"],
	},
	mesurer_archfit: {
		strong: ["architecturale", "archfit", "fitness"],
		weak: ["conformite", "mesure", "ratchet", "depguard", "architecture"],
	},
	voir_boucle: {
		strong: ["boucle", "buildloop"],
		weak: ["construction", "terminate", "progress", "verdict", "iteration"],
	},
	mesurer_cout: {
		strong: ["cout", "couts", "costmeter", "disjoncteur"],
		weak: ["mesure", "cellule", "budget", "facture", "depense"],
	},
	parcourir_comportements: {
		strong: ["comportements", "comportement", "behaviors"],
		weak: ["parcours", "parcourt", "bibliotheque", "facette", "library"],
	},
	jardiner_kernel: {
		strong: ["jardin", "jardine", "jardinage", "garden"],
		weak: ["tend", "dette", "debt", "trim", "rot"],
	},
	enforcer_autonomie: {
		strong: ["autonomie", "enforce", "enforcer", "autonomy"],
		weak: ["niveau", "level", "verdict", "promote"],
	},
	voir_console: {
		strong: ["console", "buildconsole"],
		weak: ["construction", "phase", "stable", "journal", "tableau"],
	},
	voir_facturation: {
		strong: ["facturation", "facture", "billing"],
		weak: ["plan", "quota", "meter", "compteur", "abonnement"],
	},
	parcourir_gabarits: {
		strong: ["gabarits", "gabarit", "templates", "template"],
		weak: ["parcours", "parcourt", "modeles", "bundle", "instancie"],
	},
	voir_besoin: {
		strong: ["besoin", "besoingraph"],
		weak: ["niveau", "level", "graphe", "intake", "rung"],
	},
	auto_certifier: {
		strong: ["certifie", "certifier", "certification", "selfcert"],
		weak: ["batterie", "verdict", "auto", "gate", "battery"],
	},
	verifier_auth: {
		strong: ["auth", "authentification", "autorisation"],
		weak: ["verifie", "verifier", "role", "acces", "access", "gere"],
	},
	explorer_espace: {
		strong: ["espace", "workspace"],
		weak: ["provision", "provisionne", "sandbox", "dryrun", "isole"],
	},
	modeler_entites: {
		strong: ["entites", "entite", "modeler", "modele", "modeleur"],
		weak: ["schema", "scope", "canvas", "valide", "champs"],
	},
	inspecter_forme: {
		strong: ["forme", "shape", "inspecte", "inspecter"],
		weak: ["entite", "derive", "valide", "champs", "type"],
	},
	mapper_contexte: {
		strong: ["contexte", "mappe", "mapper", "contextmap", "pact"],
		weak: ["domaine", "domain", "contrats", "verifie", "frontiere"],
	},
	griller_intention: {
		strong: ["grille", "griller", "grilling", "challenge"],
		weak: ["intention", "fidelite", "verdict", "tranchant", "route"],
	},
	// LES PROPOSITIONS (LE MUR §2) — un verbe d'apprentissage/édition/provisioning/ingestion
	// FORT ; la cible (incident/dsl/substrat/realite) désambiguïse. Aucune écriture-vérité ici.
	apprendre_incident: {
		strong: ["apprends", "apprendre", "apprend", "learn"],
		weak: ["incident", "signal", "telemetrie", "leçon", "lecon", "loop"],
	},
	editer_dsl: {
		strong: ["dsl", "edite", "editer", "editez"],
		weak: ["spec", "grammaire", "ast", "expr", "policy"],
	},
	provisionner_substrat: {
		strong: ["substrat", "provisionne", "provisionner", "stack"],
		weak: ["version", "manifest", "base", "interpreteur", "bootstrap"],
	},
	ingerer_realite: {
		strong: ["ingere", "ingerer", "realite", "ingestion"],
		weak: ["signal", "path", "webhook", "telemetrie", "prod"],
	},
};

/**
 * CLASSE un message contre la grammaire — un algorithme, pas un prompt. PURE & TOTALE &
 * DÉTERMINISTE : tokens pliés, +2 par verbe fort, +1 par indice faible ; TOUS les kinds
 * sont retournés, classés score ↓ puis ordre déclaré (stable). Ce classement EST la
 * liste des « types de réponse possibles ».
 */
export function classifyIntent(text: string): IntentCandidate[] {
	const tokens = tokensOf(text);
	return INTENT_KINDS.map((kind) => {
		const lex = LEXICONS[kind];
		let score = 0;
		for (const s of lex.strong) if (tokens.has(s)) score += 2;
		for (const w of lex.weak) if (tokens.has(w)) score += 1;
		return { kind, score };
	}).sort((a, b) =>
		a.score !== b.score
			? b.score - a.score
			: INTENT_KINDS.indexOf(a.kind) - INTENT_KINDS.indexOf(b.kind),
	);
}

/**
 * COMPREND un message : « l'attente » = le candidat net en tête ; une ÉGALITÉ en tête
 * (deux intentions au même score > 0) est une AMBIGUÏTÉ détectée — remontée, jamais
 * tranchée en silence ; aucune accroche = incomprise. PURE & TOTALE.
 */
export function understand(state: BuilderState, text: string): Understanding {
	void state;
	const candidates = classifyIntent(text);
	// RÈGLE DÉCLARÉE « l'impératif de navigation commande » : `ouvre`/`ouvrir`/`navigue`
	// en TÊTE de message ⇒ intention `ouvrir`, toujours. C'est le seul intent dont la
	// charge utile CITE naturellement le vocabulaire des autres (les titres d'écrans
	// contiennent « idée », « goal », « déployer »…) — sans cette règle, la loi de
	// couverture (∀ écran atteignable) serait fausse. Déterministe, épinglée au miroir.
	const first = text
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.find((t) => t.length >= 3);
	if (first === "ouvre" || first === "ouvrir" || first === "navigue")
		return { status: "comprise", candidates, attente: "ouvrir" };
	const top = candidates[0];
	if (top.score === 0)
		return { status: "incomprise", candidates, attente: null };
	if (candidates[1].score === top.score)
		return { status: "ambigue", candidates, attente: null };
	return { status: "comprise", candidates, attente: top.kind };
}

/** Le premier CHEMIN explicite (a/b/c) cité dans le message, sinon null. */
function explicitPath(text: string): string | null {
	const m = text
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.match(/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)+/);
	return m === null ? null : m[0];
}

/** Les chemins du SOUS-ARBRE d'un nœud (la vague composes) — descendants, ordre stable. */
function subtreePaths(tree: readonly KernelNode[], rootId: string): string[] {
	const out: string[] = [];
	const walk = (id: string) => {
		for (const n of tree)
			if (n.parentId === id) {
				out.push(nodePath(tree, n.id).join("/"));
				walk(n.id);
			}
	};
	walk(rootId);
	return out.sort();
}

/** Retire le préfixe verbal d'une intention de capture (« capture l'idée : … »). */
function stripCaptureVerb(text: string): string {
	const stripped = text.replace(
		/^.*?(?:capture[rz]?|note[rz]?|enregistre[rz]?)\s*(?:l['']\s*idee|l['']\s*idée)?\s*:?\s*/i,
		"",
	);
	return stripped.trim() === "" ? text.trim() : stripped.trim();
}

/**
 * Extrait (référence de coordonnée, tokens) d'une phrase d'adaptation canonique
 * « adapte <coord> : <property>=<token> [<property>=<token> …] ». PURE & TOTALE & fail-closed :
 * sans « : » ou sans token reconnaissable → null (jamais une adaptation en douce). La référence
 * de coordonnée est reprise VERBATIM (le système l'affiche ; le twin TS la re-valide contre le
 * master côté lentille — ici, sous la ligne, on ne juge que la nature du token).
 */
function parseAdapt(
	text: string,
): { ref: string; tokens: StyleToken[] } | null {
	const colon = text.indexOf(":");
	if (colon < 0) return null;
	// La partie gauche : retire le verbe d'adaptation, garde la référence de coordonnée.
	const left = text
		.slice(0, colon)
		.replace(/^.*?(?:adapte[rz]?|style[rz]?|design)\s*/i, "")
		.trim();
	const right = text.slice(colon + 1).trim();
	const tokens: StyleToken[] = [];
	// Chaque « property=token » plié (accents retirés, minuscule).
	for (const part of right.split(/[\s,;]+/)) {
		const m = part
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.match(/^([a-z]+)=([a-z0-9#[\]-]+)$/);
		if (m === null) continue;
		tokens.push({ property: m[1], token: m[2] });
	}
	if (tokens.length === 0) return null;
	return { ref: left, tokens };
}

/** Extrait (libellé, chemin parent) d'une greffe : « greffe X sous a/b », fail-closed. */
function parseGraft(
	text: string,
	tree: readonly KernelNode[],
): { label: string; parentPath: string } | null {
	const folded = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
	const m = folded.match(
		/(?:greffe[rz]?|ajoute[rz]?|cree[rz]?)\s+(?:l[ae]s?\s+|l['']|un[e]?\s+|d[ue]s?\s+)?(.+?)\s+sous\s+([a-z0-9/-]+)/,
	);
	if (m !== null) return { label: m[1].trim(), parentPath: m[2] };
	// pas de « sous X » : le système identifie le point d'attache (placeIntent).
	const verb = folded.match(/(?:greffe[rz]?|ajoute[rz]?|cree[rz]?)\s+(.+)$/);
	if (verb === null) return null;
	const p = placeIntent(tree, text);
	if (p.nodeId === "") return null;
	return { label: verb[1].trim(), parentPath: p.path };
}

/**
 * Le RÉFÉRENT cité après un mot-clé d'ancrage (« sur la spec X », « de la cellule Y ») —
 * le premier token (≥1 char, tirets autorisés) qui suit un ancrage. Le MATCH est plié
 * (accents/casse) pour trouver l'ancre, mais le référent est repris VERBATIM du texte
 * d'origine (la casse est préservée : « createOrder » reste « createOrder », jamais
 * « createorder »). PURE & TOTALE & fail-closed : aucun ancrage / aucun token → null.
 */
function refAfter(text: string, anchors: readonly string[]): string | null {
	const folded = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
	for (const anchor of anchors) {
		// Capture l'AMORCE (anchor + espaces) séparément du référent → l'index de fin de
		// l'amorce dans le texte plié = l'index de début du référent dans l'original (le
		// pliage NFD+lowercase est 1:1 sur ce vocabulaire latin, aucun décalage d'index).
		const m = folded.match(new RegExp(`(${anchor}\\s+)[a-z0-9][a-z0-9-]*`));
		if (m === null || m.index === undefined) continue;
		const start = m.index + m[1].length;
		return text.slice(start).match(/^[A-Za-z0-9][A-Za-z0-9-]*/)?.[0] ?? null;
	}
	return null;
}

/** L'INDEX par intent des gestes live/propose (la table déclarée, fermée — §8). */
const LIVE_BY_INTENT: Readonly<Record<string, LiveGesture>> =
	Object.fromEntries(LIVE_GESTURES.map((g) => [g.intent, g]));

/**
 * LE PRÉFIXE-VERBE de désambiguïsation par geste LIVE/PROPOSE — DÉRIVÉ du PREMIER verbe FORT
 * de son lexique (un token DISTINCTIF, unique au geste — « pourquoi », « federation »,
 * « jardin »… n'apparaissent dans aucun autre lexique). Préfixer ce token force ce type de
 * réponse au reclassement (la désambiguïsation déterministe, motif /v2/builder). Garantit que
 * chaque geste du vocabulaire étendu a SON préfixe — l'écran reste complet par construction
 * (jamais « plein de gestes manquants »). PURE & TOTALE & DÉTERMINISTE.
 */
export const LIVE_FORCE_PREFIX: Readonly<Record<string, string>> =
	Object.fromEntries(
		LIVE_GESTURES.map((g) => [g.intent, `${LEXICONS[g.intent].strong[0]} `]),
	);

/**
 * COMPLÈTE une carte de libellés du NOYAU (les 12 gestes du cycle de vie/nav/capacités) en une
 * carte TOTALE `Record<IntentKind, V>` : chaque geste LIVE/PROPOSE reçoit `readValue` (lecture)
 * ou `proposeValue` (proposition). L'écran qui rend une carte de libellés reste COMPLET par
 * construction (∀ geste du jeu clos → un libellé ; jamais « plein de gestes manquants »). PURE.
 */
export function withLiveLabels<V>(
	noyau: Record<string, V>,
	readValue: V,
	proposeValue: V,
): Record<IntentKind, V> {
	const out = { ...noyau } as Record<IntentKind, V>;
	for (const g of LIVE_GESTURES)
		out[g.intent] = g.propose === false ? readValue : proposeValue;
	return out;
}

/**
 * LE JEU CLOS DES MOTS-OUTILS FRANÇAIS (articles, prépositions, le vocabulaire d'ancrage des
 * serveurs) — DÉCLARÉ, jamais appris (§8). L'extracteur de cible les saute pour ne retenir que
 * le RÉFÉRENT (le grain réel cité : un id de cellule, un nom d'entité, un hash d'incident…).
 */
const TARGET_STOPWORDS: ReadonlySet<string> = new Set([
	// articles / prépositions
	"du",
	"de",
	"des",
	"la",
	"le",
	"les",
	"un",
	"une",
	"au",
	"aux",
	"entre",
	// le vocabulaire d'ancrage des serveurs (les anchors/argKeys eux-mêmes, jamais le grain)
	"kernel",
	"niveau",
	"scope",
	"projet",
	"spec",
	"specification",
	"version",
	"path",
	"role",
	"domaine",
	"domain",
	"entite",
	"cellule",
	"cell",
	"intention",
	"batterie",
	"facette",
	"facet",
	"conformite",
	"construction",
	"boucle",
	"console",
	"decisions",
	"decision",
	"comportements",
	"gabarits",
	"gabarit",
	"espace",
	"forme",
	"auth",
	"besoin",
	"fitness",
	"federation",
	"contexte",
	"challenge",
	"substrat",
	"incident",
	"objectif",
	"signal",
	"arbre",
	"pourquoi",
	"realite",
	"dsl",
	"goal",
	"policy",
	"kind",
	"level",
	"project",
	"entity",
	"intent",
	"buildloop",
	"buildconsole",
	"billing",
	"workspace",
]);

/**
 * EXTRAIT le RÉFÉRENT d'un geste live/propose — PURE & TOTALE & DÉTERMINISTE : le DERNIER token
 * de contenu (≥2 chars, hors mots-outils) cité APRÈS l'ancre. La phrase canonique cite toujours
 * la cible en fin (« …du projet demoshop », « …la batterie createOrder ») ; on la reprend VERBATIM
 * (casse préservée : « createOrder » reste « createOrder »). Aucune cible → null (l'écran porte la
 * canonique de repli). Le pliage NFD+lowercase est 1:1 sur ce vocabulaire latin (index alignés).
 */
function liveTarget(text: string, anchor: string): string | null {
	const folded = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
	const m = folded.match(new RegExp(`\\b${anchor}\\b`));
	if (m === null || m.index === undefined) return null;
	const from = m.index + anchor.length;
	const afterFolded = folded.slice(from);
	const afterOrig = text.slice(from);
	const re = /[a-z0-9][a-z0-9-]*/g;
	let tok: RegExpExecArray | null;
	let last: string | null = null;
	// biome-ignore lint/suspicious/noAssignInExpressions: itération de matches, idiome standard
	while ((tok = re.exec(afterFolded)) !== null) {
		if (tok[0].length < 2 || TARGET_STOPWORDS.has(tok[0])) continue;
		last = afterOrig.slice(tok.index, tok.index + tok[0].length);
	}
	return last;
}

/**
 * CONSTRUIT l'événement d'un geste LIVE/PROPOSE — PURE & TOTALE & DÉTERMINISTE : extrait la
 * CIBLE citée après l'ancre (VERBATIM, casse préservée) sinon la valeur de repli, POINTE le
 * serveur dispatché (`via`) que l'aval résout par readVia (le moteur Go est la SOURCE, ADR 0092),
 * et — pour une proposition — atteste la nature DRAFT (le MUR §2, jamais une écriture). Le
 * réducteur NE fait AUCUN I/O : il ne réimplémente JAMAIS la logique du serveur.
 */
function liveEvent(g: LiveGesture, text: string): BuilderEvent {
	const target = liveTarget(text, g.anchor) ?? g.fallback;
	const via: ServerVia = {
		server: g.server,
		tool: g.tool,
		args: { [g.argKey]: target },
	};
	if (g.propose === false)
		return {
			kind: "lecture_live",
			detail: `lecture live « ${g.server}/${g.tool} » sur « ${target} » — le moteur Go est la source (readVia en aval, ADR 0092) ; voir ${g.route}`,
			ref: `${g.route}#${target}`,
			via,
		};
	return {
		kind: "proposition",
		detail:
			g.propose === "idee"
				? `proposition : signal « ${target} » → Idea DRAFT via ${g.server}/${g.tool} (hasMirror=false ; la porte reste idée → miroir → /goal) ; voir ${g.route}`
				: `proposition : ChangeSet DRAFT via ${g.server}/${g.tool} sur « ${target} » (jamais appliqué — le MUR §2) ; voir ${g.route}`,
		ref: `${g.route}#${target}`,
		via,
		propose: g.propose,
	};
}

/** L'APP PROJETÉE depuis les kernels proposés — une PROJECTION pure, jamais stockée. */
export interface AppProjection {
	/** La version content-adressée de l'app (app:<hash des versions de kernels triées>). */
	readonly version: string;
	/** Une entité par kernel proposé (nommée du grain feuille de sa coordonnée). */
	readonly entities: readonly {
		readonly name: string;
		readonly version: string;
	}[];
	/** Les routes émises (une par entité). */
	readonly routes: readonly string[];
}

/** FNV-1a local pour la version d'app (le schéma commun content-adressé). */
function fnv1aApp(canon: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/**
 * GÉNÈRE l'app — « développer toute une appli dans le chat » : une PROJECTION PURE
 * des kernels proposés (déterminisme-first : l'app n'est jamais stockée, elle est
 * RECALCULÉE — même état → même app, même version). Une entité par kernel (nommée du
 * grain feuille de sa coordonnée), une route par entité, la version = le hash des
 * versions de kernels triées (le contenu décide, jamais l'horloge).
 */
export function emitApp(state: BuilderState): AppProjection {
	const entities = state.kernels.map((k) => ({
		name: k.coordinate.scale.split("/").pop() ?? k.coordinate.scale,
		version: k.version,
	}));
	const version = `app:${fnv1aApp(
		state.kernels
			.map((k) => k.version)
			.slice()
			.sort()
			.join("|"),
	)}`;
	return {
		version,
		entities,
		routes: entities.map((e) => `/${e.name}`),
	};
}

/** Plie un texte en tokens (le même schéma que la grammaire). */
function screenTokens(text: string): Set<string> {
	return new Set(
		text
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			// ≥3 chars, OU un token lettre+chiffre (v1, v2, v3, a0…) — les noms de
			// versions/niveaux départagent les routes (« v2 ai-lab » ≠ « ai-lab »).
			.filter((t) => t.length >= 3 || /^[a-z][0-9]$/.test(t)),
	);
}

/**
 * RÉSOUT un écran depuis un message — la COUVERTURE TOTALE du Workbench (« il sait
 * tout faire ») : score lexical contre l'inventaire DÉCLARÉ (le registre V2 + les
 * écrans V1 injectés en données), +3 par token du slug de route, +1 par token de
 * libellé ; départage stable par route. Aucune accroche → null (fail-closed, jamais
 * une invention). PURE & TOTALE & DÉTERMINISTE. La LOI DE COUVERTURE du miroir
 * prouve : ∀ écran du registre, « ouvre <titre> » résout vers SA route.
 */
export function resolveScreen(
	screens: readonly ScreenRef[],
	text: string,
): ScreenRef | null {
	const tokens = screenTokens(text);
	// La phrase pliée, séparateurs unifiés en tirets (pour le match de slug exact).
	const phrase = `-${text
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")}-`;
	let best: { s: ScreenRef; score: number } | null = null;
	for (const sc of screens) {
		const routeTokens = screenTokens(sc.route.replace(/[/-]/g, " "));
		const labelTokens = screenTokens(sc.label);
		let score = 0;
		for (const t of tokens) {
			if (routeTokens.has(t)) score += 3;
			if (labelTokens.has(t)) score += 1;
		}
		// BONUS DE SLUG EXACT : la phrase cite le slug terminal de la route TEL QUEL
		// (« auth » bat « app-auth », « ai-lab » ne vole pas « lab » — départage
		// déterministe des collisions, exigé par la loi de couverture totale).
		const lastSeg = sc.route.split("/").pop() ?? "";
		if (lastSeg.length > 0 && phrase.includes(`-${lastSeg}-`)) score += 4;
		if (
			best === null ||
			score > best.score ||
			(score === best.score && sc.route < best.s.route)
		)
			best = { s: sc, score };
	}
	return best === null || best.score === 0 ? null : best.s;
}

/** Une ligne du DELTA AU GRAIN CODE : un kernel d'écart → ses fonctions ancrées + la vague. */
export interface CodeDelta {
	/** La version du kernel en écart. */
	readonly kernelVersion: string;
	/** Les fonctions/classes ancrées (ADR 0056 — « telle classe, telle fonction »). */
	readonly anchors: readonly AnchorSuggestion[];
	/** La taille de la vague de rouge code (impactOf de la meilleure ancre). */
	readonly waveSize: number;
}

/**
 * Le DELTA AU GRAIN CODE (ADR 0056 × ADR 0058) : pour chaque kernel d'écart, les
 * SYMBOLES de code ancrés (anchorSymbols sur sa coordonnée — « quelles fonctions
 * exactes ») et la taille de leur vague (impactOf). PURE & TOTALE & DÉTERMINISTE :
 * un graphe de code vide → des ancres vides, jamais une erreur.
 */
export function codeDeltaFor(
	kernels: readonly ProposedKernel[],
	tree: readonly KernelNode[],
	codeNodes: readonly CodeNode[],
	codeEdges: readonly CodeEdge[],
): CodeDelta[] {
	return kernels.map((k) => {
		const anchors = anchorSymbols(
			tree,
			codeNodes,
			codeEdges,
			k.coordinate.scale,
		).slice(0, 3);
		const waveSize =
			anchors.length === 0
				? 0
				: impactOf(codeNodes, codeEdges, anchors[0].nodeId).length;
		return { kernelVersion: k.version, anchors, waveSize };
	});
}

/**
 * APPLIQUE un message à l'état — LE RÉDUCTEUR PUR event-sourcé du builder. PURE &
 * TOTALE & DÉTERMINISTE : même (état, message) → même (état', événements, impacts).
 * Une intention ambiguë ou incomprise produit un événement `refus` (l'écran offre
 * alors les candidats — jamais un choix silencieux). Le journal est APPEND-ONLY.
 */
export function applyIntent(state: BuilderState, text: string): ApplyResult {
	const u = understand(state, text);
	const finish = (
		next: Omit<BuilderState, "log">,
		events: BuilderEvent[],
		impacts: BuilderImpact[],
	): ApplyResult => ({
		state: { ...next, log: [...state.log, ...events] },
		events,
		impacts,
	});

	if (u.status !== "comprise") {
		return finish(
			state,
			[
				{
					kind: "refus",
					detail:
						u.status === "ambigue"
							? "intention ambiguë — deux lectures possibles, choisissez un type de réponse"
							: "intention incomprise — aucun type de réponse ne s'accroche",
					ref: "",
				},
			],
			[],
		);
	}

	switch (u.attente as IntentKind) {
		case "greffer": {
			const g = parseGraft(text, state.tree);
			const parent = g === null ? null : nodeByPath(state.tree, g.parentPath);
			if (g === null || parent === null)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail:
								"greffe refusée : point d'attache introuvable (fail-closed)",
							ref: g?.parentPath ?? "",
						},
					],
					[],
				);
			const grown = growComposes(state.tree, parent.id, g.label);
			const childPath = `${g.parentPath}/${g.label
				.normalize("NFD")
				.replace(/[̀-ͯ]/g, "")
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "")}`;
			return finish(
				{ ...state, tree: grown },
				[
					{
						kind: "arbre_greffe",
						detail: `« ${g.label} » greffé sous ${g.parentPath}`,
						ref: childPath,
					},
				],
				[{ cible: childPath, type: "composes" }],
			);
		}

		case "capturer_idee": {
			const intentText = stripCaptureVerb(text);
			const p = placeIntent(state.tree, intentText);
			const node = state.tree.find((n) => n.id === p.nodeId);
			if (node === undefined)
				return finish(
					state,
					[{ kind: "refus", detail: "placement introuvable", ref: "" }],
					[],
				);
			// Le SYSTÈME identifie la coordonnée ENTIÈRE depuis le nœud d'attache.
			const r = composeIdea(
				{
					intent: intentText,
					level: node.level,
					facet: node.facet,
					scale: p.path,
					provenance: "humain",
				},
				state.tree,
			);
			if (!r.ok)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail: `capture refusée : ${r.errors.join(", ")}`,
							ref: "",
						},
					],
					[],
				);
			return finish(
				{ ...state, ideas: [...state.ideas, r.idea] },
				[
					{
						kind: "idee_capturee",
						detail: `idée ${r.idea.id} placée à ${p.path} (${node.level} × ${node.facet})`,
						ref: r.idea.id,
					},
				],
				[
					{ cible: p.path, type: "composes" },
					{ cible: r.idea.id, type: "idee" },
				],
			);
		}

		case "promouvoir": {
			const idea = state.ideas[state.ideas.length - 1];
			if (idea === undefined)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail:
								"rien à promouvoir : aucune idée capturée (la porte reste idée → miroir → /goal)",
							ref: "",
						},
					],
					[],
				);
			const stub: MirrorSpec = {
				form: idea.expectedMirrorForm ?? "fixture_n2",
				text: `auto : ${idea.intent}`,
			};
			const r = promoteIdea(idea, stub);
			if (!r.ok)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail: `promotion refusée : ${r.errors.join(", ")}`,
							ref: idea.id,
						},
					],
					[],
				);
			return finish(
				{ ...state, kernels: [...state.kernels, r.proposed] },
				[
					{
						kind: "kernel_propose",
						detail: `version gelée ${r.proposed.version} (ChangeSet ${r.proposed.changeSet.id} DRAFT — PROPOSE, n'applique pas)`,
						ref: r.proposed.version,
					},
				],
				[
					{ cible: r.proposed.version, type: "kernel" },
					{ cible: idea.id, type: "idee" },
				],
			);
		}

		case "impacter": {
			const path = explicitPath(text) ?? placeIntent(state.tree, text).path;
			const node = nodeByPath(state.tree, path);
			if (node === null)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail: `impact : cible « ${path} » introuvable (fail-closed)`,
							ref: path,
						},
					],
					[],
				);
			const wave = subtreePaths(state.tree, node.id);
			return finish(
				state,
				[
					{
						kind: "impact_calcule",
						detail: `modifier ${path} touche ${wave.length} nœud(s) du sous-arbre`,
						ref: path,
					},
				],
				wave.map((cible) => ({ cible, type: "composes" as const })),
			);
		}

		case "interroger":
			return finish(
				state,
				[
					{
						kind: "etat_lu",
						detail: `arbre : ${state.tree.length} nœuds · idées : ${state.ideas.length} · kernels proposés : ${state.kernels.length}`,
						ref: "",
					},
				],
				[],
			);

		case "generer": {
			if (state.kernels.length === 0)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail:
								"rien à générer : aucun kernel proposé (capture puis promeus d'abord — l'app est une projection des vérités)",
							ref: "",
						},
					],
					[],
				);
			const app = emitApp(state);
			return finish(
				state,
				[
					{
						kind: "app_generee",
						detail: `app ${app.version} générée — ${app.entities.length} entité(s), ${app.routes.length} route(s) : ${app.routes.join(", ")}`,
						ref: app.version,
					},
				],
				app.entities.map((e) => ({
					cible: e.version,
					type: "kernel" as const,
				})),
			);
		}

		case "deployer": {
			const folded = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
			// Le barreau visé : le PLUS HAUT nommé dans le message ; défaut = le premier (test).
			let env: EnvName = state.ladder[0];
			for (const e of state.ladder)
				if (
					new RegExp(`\\b${e === "prod" ? "prod(uction)?" : e}\\b`).test(folded)
				)
					env = e;
			if (state.kernels.length === 0)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail: `rien à déployer en ${env} : aucun kernel proposé`,
							ref: "",
							env,
						},
					],
					[],
				);
			const app = emitApp(state);
			const rung = state.ladder.indexOf(env);
			// LE CLIQUET GÉNÉRALISÉ : le barreau précédent doit porter CETTE version exacte.
			if (rung > 0) {
				const below = state.envs[state.ladder[rung - 1]];
				if (below === null || below.version !== app.version)
					return finish(
						state,
						[
							{
								kind: "refus",
								detail: `${env} REFUSÉ : la version courante ${app.version} n'est pas passée en ${state.ladder[rung - 1]} (le cliquet — chaque barreau, dans l'ordre, toujours)`,
								ref: app.version,
								env,
							},
						],
						[],
					);
			}
			const deployment: Deployment = {
				version: app.version,
				kernelVersions: state.kernels.map((k) => k.version),
			};
			return finish(
				{ ...state, envs: { ...state.envs, [env]: deployment } },
				[
					{
						kind: "deploiement",
						detail: `app ${app.version} déployée en ${env.toUpperCase()} (${app.entities.length} entité(s))`,
						ref: app.version,
						env,
					},
				],
				[{ cible: app.version, type: "kernel" }],
			);
		}

		case "delta": {
			const folded = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
			let env: EnvName = state.ladder[state.ladder.length - 1] ?? "prod";
			for (const e of state.ladder)
				if (
					new RegExp(`\\b${e === "prod" ? "prod(uction)?" : e}\\b`).test(folded)
				)
					env = e;
			const target = state.envs[env];
			if (target === null)
				return finish(
					state,
					[
						{
							kind: "delta_calcule",
							detail: `aucun déploiement en ${env} — tout est écart (${state.kernels.length} kernel(s))`,
							ref: env,
						},
					],
					state.kernels.map((k) => ({
						cible: k.version,
						type: "kernel" as const,
					})),
				);
			const deployed = new Set(target.kernelVersions);
			const drift = state.kernels.filter((k) => !deployed.has(k.version));
			return finish(
				state,
				[
					{
						kind: "delta_calcule",
						detail: `${drift.length} kernel(s) d'écart avec ${env} (déployé : ${target.version} · courant : ${emitApp(state).version})`,
						ref: env,
					},
				],
				drift.map((k) => ({ cible: k.version, type: "kernel" as const })),
			);
		}

		case "ouvrir": {
			const target = resolveScreen(state.screens, text);
			if (target === null)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail:
								"écran introuvable dans l'inventaire déclaré (fail-closed — jamais une route inventée)",
							ref: "",
						},
					],
					[],
				);
			return finish(
				state,
				[
					{
						kind: "ecran_ouvert",
						detail: `écran « ${target.label.split(" ").slice(1).join(" ") || target.label} » — ${target.route}`,
						ref: target.route,
					},
				],
				[],
			);
		}

		case "adapter": {
			// LE DESIGN LAB (ADR 0071, Onlook INVERSÉ) : un geste de STYLING PUR — re-styler une
			// coordonnée EXISTANTE en tokens ADR 0010. PURE & TOTALE & DÉTERMINISTE & BELOW-THE-LINE :
			// aucune écriture-vérité, un requirement SOFT content-adressé (le twin lib/v3/design le
			// compose ; la lentille le capitalise). Un geste STRUCTUREL (ajout/retrait/réordre) passe
			// par « capture l'idée : … » (intent capturer_idee) — JAMAIS ici (classifyGesture le tranche).
			const a = parseAdapt(text);
			if (a === null)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail:
								"adaptation refusée : phrase non reconnue (attendu « adapte <coord> : <property>=<token> », fail-closed)",
							ref: "",
						},
					],
					[],
				);
			// FAIL-CLOSED : chaque token DOIT être du catalogue FERMÉ ADR 0010 (hex/Tailwind arbitraire
			// refusé) — le MÊME catalogue que le twin Go EmitScreenDesign (déterminisme-first §6).
			const bad = a.tokens.find((s) => !isKnownStyleToken(s));
			if (bad !== undefined)
				return finish(
					state,
					[
						{
							kind: "refus",
							detail: `adaptation refusée : le token ${bad.property}=${bad.token} est hors du catalogue FERMÉ ADR 0010 (jamais un hex, jamais une utilitaire arbitraire)`,
							ref: a.ref,
						},
					],
					[],
				);
			// Un geste de styling est below-the-line (classifyGesture sans intention structurelle →
			// styling) ; on l'épingle pour rendre la garde explicite (un structurel ne fuit jamais ici).
			const nature = classifyGesture({
				coord: { kind: "section", entity: a.ref },
				styles: a.tokens,
			});
			void nature; // toujours "styling" sur cette voie — la garde §8/BA12.
			const stack = a.tokens.map((s) => `${s.property}=${s.token}`).join(" ");
			return finish(
				state,
				[
					{
						kind: "ecran_adapte",
						detail: `écran « ${a.ref} » adapté (${a.tokens.length} token(s) : ${stack}) — requirement SOFT below-the-line, aucune vérité écrite`,
						ref: a.ref,
					},
				],
				// L'IMPACT est below-the-line (composes) — la coordonnée re-stylée, pas une vérité.
				[{ cible: a.ref, type: "composes" }],
			);
		}

		case "lancer_bench": {
			// LE BENCH DE COMPLÉTUDE (RequirementBench, DG06/ADR 0088) : le chat ROUTE vers le
			// port — un RUN PROJETÉ, hermétique, below-the-line (l'IA reste côté Go derrière le
			// port ; le réducteur ne fait que pointer la capacité + sa spec). AUCUNE mutation
			// d'état, AUCUNE écriture-vérité : les types manquants que le bench remonte restent
			// des PROPOSITIONS (idea → mirror → /goal), jamais gravées ici. La cible (l'id de spec)
			// est citée VERBATIM ; absente → on lance quand même (l'écran porte la spec canonique).
			const spec = refAfter(text, ["spec", "specification", "specs"]);
			const cible = spec ?? "createOrder";
			return finish(
				state,
				[
					{
						kind: "bench_lance",
						detail: `bench de complétude lancé sur la spec « ${cible} » — voir /v3/bench (RequirementBench, port DG06) ; les types manquants sont des propositions, jamais une vérité écrite`,
						ref: `/v3/bench#${cible}`,
					},
				],
				[],
			);
		}

		case "explorer_evolution": {
			// L'EXPLORATION D'ÉVOLUTION (EvolutionSandbox, ADR 0046) : le chat ROUTE vers le port —
			// un run de self-play/QD EN QUARANTAINE, below-the-line (une variante n'écrit JAMAIS le
			// kernel ; au mieux une branche/idée). AUCUNE mutation d'état, AUCUNE écriture-vérité :
			// verser une variante reste idée → miroir → /goal. La cellule visée est citée VERBATIM.
			const cell = refAfter(text, ["cellule", "cell", "cellues"]);
			const cible = cell ?? "la cellule canonique";
			return finish(
				state,
				[
					{
						kind: "evolution_exploree",
						detail: `exploration d'évolution lancée sur « ${cible} » — voir /v3/evolve (EvolutionSandbox en quarantaine, ADR 0046) ; verser une variante reste idée → miroir → /goal`,
						ref: `/v3/evolve#${cible}`,
					},
				],
				[],
			);
		}

		// LES LECTURES LIVE + LES PROPOSITIONS (ADR 0092 × LE MUR §2) — un SEUL chemin déclaré,
		// piloté par la table fermée LIVE_GESTURES (jamais un cas codé par geste — déterminisme-first).
		// Une LECTURE pointe son serveur dispatché (via → readVia en aval, le moteur Go est la SOURCE) ;
		// une PROPOSITION atteste une idée/ChangeSet DRAFT (aucune écriture-vérité depuis le réducteur).
		// AUCUNE mutation d'état (le journal append-only mis à part) — un run/une proposition projeté(e).
		case "voir_pourquoi":
		case "piloter_goal":
		case "voir_federation":
		case "reconcilier":
		case "mesurer_archfit":
		case "voir_boucle":
		case "mesurer_cout":
		case "parcourir_comportements":
		case "jardiner_kernel":
		case "enforcer_autonomie":
		case "voir_console":
		case "voir_facturation":
		case "parcourir_gabarits":
		case "voir_besoin":
		case "auto_certifier":
		case "verifier_auth":
		case "explorer_espace":
		case "modeler_entites":
		case "inspecter_forme":
		case "mapper_contexte":
		case "griller_intention":
		case "apprendre_incident":
		case "editer_dsl":
		case "provisionner_substrat":
		case "ingerer_realite": {
			const g = LIVE_BY_INTENT[u.attente as IntentKind];
			return finish(state, [liveEvent(g, text)], []);
		}
	}
}
