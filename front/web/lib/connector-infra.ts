/**
 * connector-infra — the PURE TS twin of back/runtime/connectorinfra (DP23, piste DP, EPIC E).
 *
 * DP23 ÉMET l'INFRA des CONNECTEURS de l'APP ÉMISE (services-substrat, profile connectors) :
 * MCP-Gateway + Connector-Registry + Tool-Registry + Webhook-Gateway. L'app émise reçoit SES
 * PROPRES MCP+Skills (ADR 0040), DISTINCTS de ceux d'AIDOS. La porte unique d'entrée des outils
 * MCP de l'app émise est la MCP-Gateway (ADR 0009 : tout op de l'app émise = un outil MCP). Un
 * outil NON ENREGISTRÉ au Tool-Registry est REFUSÉ (TOOL_NOT_REGISTERED, set-membership pur
 * fail-closed). Un webhook ENTRANT déclenche une operation ASYNC (S73/DP16, worker TS).
 *
 * Le moteur autoritatif est le paquet Go (runtime/connectorinfra) ; ce jumeau laisse le Workbench
 * rendre les quatre fragments profile connectors + re-jouer le routage MCP-Gateway + démontrer le
 * webhook→op-async, verdict-pour-verdict avec le Go.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : les quatre fragments sont une PALETTE close et pure ;
 * `routeTool` est une SET-MEMBERSHIP pure (zéro LLM, fail-closed) ; le webhook réutilise la
 * mécanique S73/DP16 (lib/async-operation : dispatch, effectId, outbox) — il ne forke pas
 * l'outbox. Même entrée ⇒ même verdict (le miroir lib/connector-infra.test.ts l'épingle). Les
 * fragments sont byte-stables (le content-id, FNV-1a sur le corps canonique, le même schéma
 * d'adressage que lib/connector-source).
 *
 * LE MUR (CLAUDE.md §2) : l'infra ÉMISE est SOUS LA LIGNE ; les MCP de l'app émise sont DISTINCTS
 * de ceux d'AIDOS (ADR 0040) ; AUCUN GRANT de vérité. Ce jumeau n'écrit AUCUNE vérité (ni kernel,
 * ni miroirs, ni fitness). Le routage d'un outil, l'enregistrement d'un connecteur, la réception
 * d'un webhook agissent sur le substrat de l'APP ÉMISE, JAMAIS le truth-store AIDOS. Geler un
 * connecteur/outil dans le kernel (de l'app émise) passe par idée → miroir → /goal → approbation.
 */

import {
	type Async,
	dispatch,
	type Effect,
	newOutboxEntry,
	type OutboxEntry,
	validateAsync,
} from "./async-operation";

/**
 * INFRA_KEYS — l'ensemble CLOS des clés de la palette connector-infra, en ordre canonique
 * d'émission (le jumeau verbatim de connectorinfra.Keys() / infraPalette). Étendre = addendum +
 * /goal (§8).
 */
export const INFRA_KEYS = [
	"mcp-gateway",
	"connector-registry",
	"tool-registry",
	"webhook-gateway",
] as const;
export type InfraKey = (typeof INFRA_KEYS)[number];

/**
 * Les ports internes déclarés de la palette (la bande 39xx, hors de toute autre couche
 * substrat) — verbatim les const Go mcpGatewayPort/…/webhookGatewayPort.
 */
const INFRA_PORTS: Record<InfraKey, number> = {
	"mcp-gateway": 3900,
	"connector-registry": 3910,
	"tool-registry": 3920,
	"webhook-gateway": 3930,
};

/** Les depends_on déclarés (les arêtes déterministes) — verbatim infraPalette. */
const INFRA_DEPENDS_ON: Record<InfraKey, string[]> = {
	"mcp-gateway": ["tool-registry"],
	"connector-registry": [],
	"tool-registry": [],
	"webhook-gateway": ["nats"],
};

/** Une note FR de rôle par fragment (la légende de l'écran ; jamais une donnée load-bearing). */
export const INFRA_ROLE_NOTE: Record<InfraKey, string> = {
	"mcp-gateway":
		"porte d'entrée UNIQUE des outils MCP de l'app émise (ADR 0009)",
	"connector-registry": "registre des connecteurs DÉCLARÉS (DP20)",
	"tool-registry": "registre des outils MCP EXPOSÉS (set-membership)",
	"webhook-gateway": "entrée des webhooks ENTRANTS (⇒ ops async, S73/DP16)",
};

/**
 * upperEnv replie une chaîne en UPPER_SNAKE (non-alphanumériques → '_') — la MÊME discipline
 * que connectorinfra.upperEnv / composeemit, donc les clés env-var concordent entre les couches.
 */
function upperEnv(s: string): string {
	let out = "";
	for (const ch of s) {
		if (ch >= "a" && ch <= "z") {
			out += ch.toUpperCase();
		} else if ((ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9")) {
			out += ch;
		} else {
			out += "_";
		}
	}
	return out;
}

/**
 * isolationToken — le token PUR par projet (le jumeau de datafragments.IsolationToken). Une
 * FNV-1a 32-bit sur l'id de projet (le SCHÉMA, non les octets, miroir du S02). Le projet A n'a
 * jamais le même token que le projet B (isolation du substrat — la volume name + l'env-var device
 * portent ce token). Pur, total, déterministe.
 */
export function isolationToken(projectID: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < projectID.length; i++) {
		h ^= projectID.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return `tok_${h.toString(16).padStart(8, "0")}`;
}

/** Une volume bind nommée, isolée par projet (le nom + l'env-var device portent le token). */
export interface FragmentVolume {
	/** le nom du volume — `<key>-<token>` (isolé par projet). */
	name: string;
	/** l'env-var device — `<KEY>_<TOKEN>_DATA_PATH` (jamais un chemin hardcodé). */
	deviceVar: string;
}

/** Le service DP02 d'un fragment (le slice AST projeté sous la ligne). */
export interface FragmentService {
	name: string;
	/** rôle DP02 fermé — toujours "connector" pour la palette connector-infra. */
	role: "connector";
	/** ÉMIS (built from the app's phase) — l'image est VIDE (la convention DP02). */
	image: string;
	internalPort: number;
	/** profile compose — toujours "connectors" (le substrat opt-in de l'app émise). */
	profile: "connectors";
	healthcheck: string;
	dependsOn: string[];
}

/**
 * ServiceFragment — UN fragment connector-infra : le slice Service DP02 + sa volume bind + le
 * projet auquel il est isolé. C'est une valeur de PROJECTION (sous la ligne), JAMAIS une vérité
 * kernel — structurellement identique au connectorinfra.ServiceFragment Go.
 */
export interface ServiceFragment {
	/** la clé stable de la palette (le jumeau des clés DP14). */
	key: InfraKey;
	/** le projet auquel ce fragment est isolé (le mur §2 / S55). */
	projectId: string;
	/** le slice Service DP02 (image, rôle, port, profile, healthcheck, depends_on). */
	service: FragmentService;
	/** les volumes bind nommés, isolés par projet. */
	volumes: FragmentVolume[];
}

/**
 * writesTruth rapporte si un fragment porte une capacité qui écrit la vérité AIDOS
 * (kernel/mirrors/fitness). TOUJOURS false : l'infra connector de l'app ÉMISE est un SERVICE DE
 * L'APP CONSTRUITE — elle n'écrit jamais le truth-store AIDOS (le mur §2). Les MCP de l'app émise
 * sont DISTINCTS de ceux d'AIDOS (ADR 0040). Le jumeau du connectorinfra.WritesTruth() Go.
 */
export function writesTruth(_f: ServiceFragment): boolean {
	return false;
}

/**
 * buildFragment rend UN fragment pour un projet (pur, déterministe). Le nom de service et la
 * volume sont isolés par projet via le token DP15 (réutilisé, jamais forké) — l'état de la
 * gateway/registry du projet A ne fuit jamais dans le projet B. Le jumeau de
 * connectorinfra.buildFragment.
 */
function buildFragment(
	key: InfraKey,
	projectID: string,
	token: string,
): ServiceFragment {
	const deviceVar = `${upperEnv(key)}_${upperEnv(token)}_DATA_PATH`;
	return {
		key,
		projectId: projectID,
		service: {
			name: key,
			role: "connector",
			image: "", // ÉMIS (built from the app's phase) — la convention DP02
			internalPort: INFRA_PORTS[key],
			profile: "connectors",
			healthcheck: `wget -q --spider http://localhost:${INFRA_PORTS[key]}/health`,
			dependsOn: [...INFRA_DEPENDS_ON[key]],
		},
		volumes: [{ name: `${key}-${token}`, deviceVar }],
	};
}

/**
 * substrateConnectorInfraFragments — la porte AUTORITATIVE DP23 : rend la palette connector-infra
 * (MCP-Gateway + Connector-Registry + Tool-Registry + Webhook-Gateway) pour un projet. Les quatre
 * portent profile connectors et sont légaux dans TOUT environnement (aucun fragment d'infra n'est
 * env-gated). Même projet ⇒ fragments byte-identiques. Le jumeau de
 * connectorinfra.SubstrateConnectorInfraFragments (sans le gate env — l'écran ne sélectionne pas
 * d'environnement, il rend la palette d'un projet).
 */
export function substrateConnectorInfraFragments(
	projectID: string,
): ServiceFragment[] {
	const token = isolationToken(projectID);
	return INFRA_KEYS.map((key) => buildFragment(key, projectID, token));
}

/**
 * canonicalFragment rend les octets canoniques d'un fragment (les clés triées, sans espace
 * insignifiant). Même fragment ⇒ mêmes octets, toujours (l'oracle de byte-identité du miroir).
 * Réutilise le schéma S02, jamais forké — le même corps que connectorinfra.fragmentBody.
 */
export function canonicalFragment(f: ServiceFragment): string {
	const body = {
		key: f.key,
		project_id: f.projectId,
		service: {
			depends_on: [...f.service.dependsOn],
			healthcheck: f.service.healthcheck,
			image: f.service.image,
			internal_port: f.service.internalPort,
			name: f.service.name,
			profile: f.service.profile,
			role: f.service.role,
		},
		volumes: f.volumes.map((v) => ({ device_var: v.deviceVar, name: v.name })),
	};
	return JSON.stringify(body);
}

/**
 * hashFragment est l'adresse-contenu d'un fragment (FNV-1a sur le corps canonique — le SCHÉMA du
 * records.Hash S02). Même fragment ⇒ même adresse ; le token d'isolation rend l'adresse du projet
 * A différente de celle du projet B. Pur, total, déterministe.
 */
export function hashFragment(f: ServiceFragment): string {
	const body = canonicalFragment(f);
	let h = 0x811c9dc5;
	for (let i = 0; i < body.length; i++) {
		h ^= body.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return `cid_${h.toString(16).padStart(8, "0")}`;
}

// ── Le routage Tool-Registry (MCP-Gateway, set-membership, fail-closed) ──────────────

/** Le code de refus DP23 — le jumeau de blockreason.CodeToolNotRegistered. */
export const TOOL_NOT_REGISTERED = "TOOL_NOT_REGISTERED" as const;

/**
 * ToolRegistry — le registre des outils MCP EXPOSÉS de l'app émise : l'ensemble CLOS des noms
 * d'outils que la MCP-Gateway routera. Le substrat derrière le fragment tool-registry. Une valeur
 * de PROJECTION (sous la ligne), isolée par projet ; n'écrit aucune vérité. Le jumeau de
 * connectorinfra.ToolRegistry.
 */
export interface ToolRegistry {
	projectId: string;
	/** l'ensemble des noms d'outils ENREGISTRÉS (l'exposition close). Absent ⇒ fail-closed. */
	tools: ReadonlySet<string>;
}

/**
 * newToolRegistry construit un Tool-Registry pour un projet depuis les noms déclarés. Une liste
 * nulle/vide donne un registre vide — qui refuse TOUT outil (fail-closed : rien n'est exposé par
 * défaut). Pur, déterministe. Le jumeau de connectorinfra.NewToolRegistry.
 */
export function newToolRegistry(
	projectID: string,
	names: string[],
): ToolRegistry {
	return { projectId: projectID, tools: new Set(names) };
}

/** Une BlockReason — la forme actionnable du refus (KRD §44.5), miroir de la forme Go. */
export interface InfraBlockReason {
	code: string;
	severity: string;
	explanation: string;
	how_to_fix: string[];
}

/** Decision — le verdict de routeTool : admis ou refusé, avec le code DP23 sur un refus. */
export interface Decision {
	/** true SSI l'outil est enregistré (la MCP-Gateway le route). */
	admitted: boolean;
	/** le code de refus sur un deny ; vide sur une admission. */
	code: string;
}

/**
 * toolNotRegisteredBlockReason — la raison de blocage actionnable (le jumeau verbatim de l'entrée
 * blockreason.For(CodeToolNotRegistered) : sévérité bloquante, explication FR, trois how_to_fix).
 */
export function toolNotRegisteredBlockReason(): InfraBlockReason {
	return {
		code: TOOL_NOT_REGISTERED,
		severity: "blocking",
		explanation:
			"L'outil n'est pas enregistré au Tool-Registry de l'app émise : la MCP-Gateway refuse de le router (set-membership fail-closed — rien n'est exposé par défaut).",
		how_to_fix: [
			"Enregistrez l'outil au Tool-Registry de l'app émise : tout op = un outil MCP exposé via la MCP-Gateway (ADR 0009).",
			"Vérifiez le nom de l'outil : le routage est une comparaison de noms close (le routage ne devine jamais — zéro LLM).",
			"Si l'outil n'existe pas encore, gravez l'op de l'app émise (idée → miroir → /goal → approbation), puis exposez-la.",
		],
	};
}

/**
 * routeTool — la décision PURE, TOTALE, fail-closed de routage de la MCP-Gateway : elle route un
 * outil MCP SSI son nom est membre des noms déclarés du Tool-Registry. Un outil enregistré ⇒
 * (admitted, null) ; un outil ABSENT ⇒ (refusé, TOOL_NOT_REGISTERED). Un registre VIDE refuse TOUT
 * outil. ZÉRO LLM — la gateway interroge le registre clos, elle ne juge jamais (déterminisme-first,
 * §6/§8). Même (registry, toolName) ⇒ même verdict (le miroir l'épingle). Le jumeau de
 * connectorinfra.RouteTool, verdict-pour-verdict.
 */
export function routeTool(
	registry: ToolRegistry,
	toolName: string,
): { decision: Decision; blockReason: InfraBlockReason | null } {
	if (registry.tools.has(toolName)) {
		return { decision: { admitted: true, code: "" }, blockReason: null };
	}
	return {
		decision: { admitted: false, code: TOOL_NOT_REGISTERED },
		blockReason: toolNotRegisteredBlockReason(),
	};
}

// ── La réalisation du webhook ENTRANT (⇒ op async, S73/DP16 réutilisé) ───────────────

/**
 * InboundWebhook — UN webhook REÇU à la Webhook-Gateway : sa source (le système externe qui l'a
 * POSTé), l'operation de l'app émise qu'il cible, et le payload. Une commande runtime (sous la
 * ligne), JAMAIS une vérité. Le jumeau de connectorinfra.InboundWebhook.
 */
export interface InboundWebhook {
	source: string;
	/** l'operation async de l'app émise ciblée. DOIT matcher l'op réalisée (fail-closed). */
	operation: string;
	payload?: Record<string, unknown>;
}

/** ErrWebhookOperationMismatch — le webhook nomme une op qui ne matche pas l'op réalisée. */
export const ERR_WEBHOOK_OPERATION_MISMATCH =
	"connector-infra: le webhook entrant ne matche pas l'operation async réalisée";

/** Un événement de dispatch observable (le jumeau de connectorinfra.DispatchEvent / DP16). */
export interface DispatchEvent {
	operation: string;
	effectId: string;
	kind: string;
	target: string;
}

/** Le résultat de la réalisation d'un webhook entrant. */
export interface RealizeResult {
	/** les événements RÉELLEMENT délivrés cet appel (un replay déjà-dispatché ⇒ aucun). */
	events: DispatchEvent[];
	/** une cause de refus (op-mismatch / bloc async mal formé) ; null sur succès. */
	error: string | null;
}

/**
 * realizeInboundWebhook — la réalisation BUILD-TIME d'un webhook ENTRANT : le webhook est
 * l'ÉVÉNEMENT (un message en file), donc l'op async cible se déclenche IMMÉDIATEMENT (pas
 * d'horloge — contrairement à un cron). Elle écrit les effets de l'op dans l'outbox S73 (PENDING)
 * puis DISPATCHE (lib/async-operation.dispatch, S73), retournant les événements ordonnés.
 *
 * Elle RÉUTILISE la mécanique S73/DP16 verbatim (newOutboxEntry, dispatch, effectId) — elle ne
 * forke PAS l'outbox. La seule glue DP23 : (a) le match webhook→operation (fail-closed : le
 * webhook doit nommer l'op réalisée), (b) le déclenchement sur l'événement plutôt que l'horloge.
 *
 * EXACTLY-ONCE RELATIF : un webhook rejoué re-présente le MÊME effet content-adressé, que dispatch
 * supprime — réaliser le même webhook deux fois sur le même outbox délivre l'effet UNE FOIS
 * observablement. Le jumeau de connectorinfra.RealizeInboundWebhook.
 *
 * PUR sur ses jointures : l'outbox (pending) et l'ensemble dispatched sont injectés ; pas
 * d'horloge réelle, pas de rng, pas de LLM (CLAUDE.md §6/§8). Même (webhook, op, async, état) ⇒
 * mêmes événements.
 */
export function realizeInboundWebhook(
	webhook: InboundWebhook,
	opName: string,
	async: Async,
	outbox: OutboxEntry[],
	dispatched: Set<string>,
): RealizeResult {
	// 1. Le webhook doit nommer l'op réalisée (fail-closed — jamais fire la mauvaise op).
	if (webhook.operation !== opName) {
		return { events: [], error: ERR_WEBHOOK_OPERATION_MISMATCH };
	}
	// 2. Le pré-vol de grammaire close : le bloc async doit être bien formé.
	const cause = validateAsync(async);
	if (cause !== null) {
		return { events: [], error: cause };
	}
	// 3. Écrire chaque effet à l'outbox en PENDING — le côté WRITE du transactional-outbox.
	for (const eff of async.effects) {
		outbox.push(newOutboxEntry(eff));
	}
	// 4. Snapshot des PENDING NON-dispatchés AVANT dispatch : la trace liste exactement les
	//    effets que cet appel délivre (un id déjà-dispatché est supprimé, jamais un phantom).
	const willDeliver: OutboxEntry[] = outbox.filter(
		(e) => e.status === "pending" && !dispatched.has(e.id),
	);
	// 5. Dispatch — at-least-once + dedup content-adressé ⇒ exactly-once relatif.
	dispatch(outbox, dispatched);
	// 6. La trace déterministe des effets RÉELLEMENT délivrés cet appel.
	const events: DispatchEvent[] = willDeliver.map((entry) => ({
		operation: opName,
		effectId: entry.id,
		kind: entry.effect.kind,
		target: entry.effect.target,
	}));
	return { events, error: null };
}

// ── Les fixtures de démonstration que le panneau pilote ──────────────────────────────

/**
 * DEMO_REGISTERED_TOOLS — les noms d'outils EXPOSÉS de l'app émise seedés au Tool-Registry de
 * démonstration (un jumeau sous la ligne, jamais une écriture-vérité). `create_invoice` et
 * `list_payments` sont enregistrés (⇒ routent) ; `drop_database` ne l'est PAS (⇒ refusé).
 */
export const DEMO_REGISTERED_TOOLS = [
	"create_invoice",
	"list_payments",
] as const;

/** L'outil non enregistré de la démo (⇒ TOOL_NOT_REGISTERED). */
export const DEMO_UNREGISTERED_TOOL = "drop_database";

/** Le nom de l'op async cible de la démo webhook (le jumeau du fixture Go). */
export const DEMO_WEBHOOK_OP = "onPaymentReceived";

/** L'op async de la démo webhook : un trigger queue + un effet notification (S73). */
export const DEMO_WEBHOOK_ASYNC: Async = {
	trigger: { kind: "queue" },
	effects: [
		{
			kind: "notification",
			target: "ops@example.com",
			payload: {
				subject: "Payment received",
				body: "A payment webhook arrived",
			},
		},
	],
};

/** Le webhook entrant de la démo (source stripe ⇒ l'op async onPaymentReceived). */
export const DEMO_INBOUND_WEBHOOK: InboundWebhook = {
	source: "stripe",
	operation: DEMO_WEBHOOK_OP,
	payload: { event: "payment_intent.succeeded" },
};

/** Le tool de démo qui ROUTE (enregistré) — utilisé par l'écran pour la démo route. */
export const DEMO_ROUTED_TOOL = "create_invoice";

/** Pure helper: une effect typée (re-export pour l'écran sans ré-importer async-operation). */
export type { Effect };
