/**
 * bootstrap — le JUMEAU TS PUR de l'émetteur DP12 `back/runtime/bootstrap`
 * (ROADMAP-provisioning-deploy, sur le GO mesuré DP10 + ADR 0067, réutilise
 * DP04 envemit / S91 secretstore / DP02 stackmanifest / DP07 connresolve).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8). EmitBootstrapSequence est une fonction
 * PURE & TOTALE de (bundle, état hôte, secrets présents) : pas d'horloge, pas
 * d'aléa, pas d'E/S, pas de LLM, aucune fuite d'ordre d'itération de map. Même
 * entrée → même séquence d'octets, content-adressée. Le moteur AUTORITAIRE est
 * le Go (back/runtime/bootstrap.EmitBootstrapSequence, 11/11 tests verts) ; ce
 * jumeau re-implémente sa logique décisionnelle pour que l'écran /bootstrap rende
 * la séquence émise sans aller-retour backend. Ports/ordre/merge-env = fonctions
 * pures portées VERBATIM du spike DP10 (lib/bootstrap-spike.ts) ; le contrôle des
 * secrets est un SCAN (différence d'ensembles), jamais un jugement LLM.
 *
 * LA SÉQUENCE est un ensemble CLOS, ORDONNÉ de 10 events :
 *
 *   network-created → volumes-created → env-materialized → secrets-checked →
 *   ports-resolved → traefik-up → datastore-up → server-up → healthy →
 *   urls-printed
 *
 * ou un BlockReason fail-closed :
 *
 *   A bundle nominal + hôte propre        → la séquence complète ordonnée, port 80
 *   B un secret requis manquant           → MISSING_SECRET_AT_BOOT (actionnable)
 *   C le port de base occupé sur l'hôte   → le premier port libre, résolu PUREMENT
 *   D le même (bundle, hôte, secrets)     → la séquence byte-identique (replay)
 *
 * LE MUR (CLAUDE.md §2). Le .env concret + les secrets vivent UNIQUEMENT dans
 * l'appliance au boot (chmod 600, gitignored), JAMAIS dans le source émis, le
 * truth-store ou git (below the line). La projection émise ne porte AUCUNE valeur
 * de secret ni aucun endpoint en dur — seulement des références ${VAR} et des NOMS
 * de variables d'environnement. L'exécution docker réelle reste GATÉE (comme le
 * spike DP10) : l'écran montre la SÉQUENCE déterministe émise, pas un run réel.
 */

// ---------------------------------------------------------------------------
// les types du StackManifest DP02 (sous-ensemble nécessaire à l'émission)
// ---------------------------------------------------------------------------

/** Le rôle d'un service dans l'ensemble clos DP02 (sous-ensemble utilisé ici). */
export type Role =
	| "server"
	| "datastore"
	| "observability"
	| "cache"
	| "pooler"
	| "workflow"
	| "bus"
	| "error-tracking"
	| "git"
	| "tickets"
	| "auth"
	| "interpreter";

/** Un service déclaré du bundle émis. */
export interface Service {
	name: string;
	role: Role;
	image?: string;
	internalPort: number;
}

/** Un volume nommé bind (convention /data/dockers) — deviceVar est une réf ${VAR}. */
export interface Volume {
	name: string;
	deviceVar: string;
}

/** Le réseau reverse-proxy (traefik_default — externe sauf chez le déploiement traefik). */
export interface Network {
	name: string;
	external: boolean;
}

/** Le StackManifest émis : la topologie déclarée d'une pile (la source DP02). */
export interface StackManifest {
	app: string;
	services: Service[];
	volumes?: Volume[];
	network: Network;
	connectorScopes?: string[];
}

/** L'instantané hôte observé AS DATA (convention spike DP10). */
export interface HostState {
	/** la sortie brute de `ss -ltn`. */
	ssOutput: string;
	/** la sortie brute de `docker ps -a --format '{{.Ports}}'`. */
	dockerPsOutput: string;
}

/** L'ensemble des NOMS de variables-secret présentes dans l'appliance (jamais de valeur). */
export interface SecretsState {
	present: string[];
}

// ---------------------------------------------------------------------------
// l'ensemble CLOS, ORDONNÉ des kinds d'event (le jumeau de EventKind Go)
// ---------------------------------------------------------------------------

export type EventKind =
	| "network-created"
	| "volumes-created"
	| "env-materialized"
	| "secrets-checked"
	| "ports-resolved"
	| "traefik-up"
	| "datastore-up"
	| "server-up"
	| "healthy"
	| "urls-printed";

/** La séquence CLOSE dans son ordre DÉCLARÉ (== Go orderedKinds). */
export const ORDERED_KINDS: readonly EventKind[] = [
	"network-created",
	"volumes-created",
	"env-materialized",
	"secrets-checked",
	"ports-resolved",
	"traefik-up",
	"datastore-up",
	"server-up",
	"healthy",
	"urls-printed",
];

/** Vrai ssi `k` est membre de l'ensemble clos. */
export function isKnownKind(k: string): k is EventKind {
	return (ORDERED_KINDS as readonly string[]).includes(k);
}

/** Un cran de la séquence émise : position 1-based, kind, détail (NOM ou ${VAR}). */
export interface BootstrapEvent {
	seq: number;
	kind: EventKind;
	detail: string;
}

/** La projection d'amorçage émise : events ordonnés + port résolu déterministiquement. */
export interface BootstrapSequence {
	events: BootstrapEvent[];
	resolvedPort: number;
}

/** Le BlockReason fail-closed (forme S13 : code, sévérité, explication, how_to_fix). */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** Le résultat de l'émission : soit une séquence, soit un block (jamais les deux). */
export interface EmitResult {
	sequence?: BootstrapSequence;
	block?: BlockReason;
}

/** Le port de base DÉCLARÉ (== Go BasePort : 80, l'entrée web publique derrière traefik). */
export const BASE_PORT = 80;

// ---------------------------------------------------------------------------
// secretstore.EnvVar — le motif APP_SECRET_<SCOPE> (jumeau S91)
// ---------------------------------------------------------------------------

/** Le nom de variable-secret d'un scope : APP_SECRET_<SCOPE> (== secretstore.EnvVar S91). */
export function secretEnvVar(scope: string): string {
	return `APP_SECRET_${scope.trim().toUpperCase()}`;
}

/**
 * Les secrets REQUIS au boot — un APP_SECRET_<SCOPE> par scope de connecteur déclaré
 * (le motif DP04 envemit, réutilisé). DÉTERMINISTE : trié, dé-dupliqué ; jamais
 * inventé (un bundle sans scope ne requiert aucun secret — honnêteté §8).
 */
export function requiredSecrets(m: StackManifest): string[] {
	const seen = new Set<string>();
	for (const scope of m.connectorScopes ?? []) {
		if (scope.trim() === "") continue;
		seen.add(secretEnvVar(scope));
	}
	return [...seen].sort();
}

// ---------------------------------------------------------------------------
// la résolution de ports PURE — portée VERBATIM du spike DP10 (occupiedFrom)
// ---------------------------------------------------------------------------

/** parse les ports en écoute de la sortie brute de `ss -ltn`. Pure (jumeau Go parseSS). */
export function parseSS(out: string): number[] {
	const seen = new Set<number>();
	for (const line of out.split("\n")) {
		if (!line.includes("LISTEN")) continue;
		for (const field of line.split(/\s+/)) {
			const i = field.lastIndexOf(":");
			if (i >= 0) {
				const p = Number.parseInt(field.slice(i + 1), 10);
				if (Number.isInteger(p)) seen.add(p);
			}
		}
	}
	return [...seen].sort((a, b) => a - b);
}

/** parse les ports hôte mappés de `docker ps` Ports : les `:<host>->`. Pure (jumeau Go parseDockerPS). */
export function parseDockerPS(out: string): number[] {
	const seen = new Set<number>();
	for (const seg of out.split("\n")) {
		let s = seg;
		for (;;) {
			const arrow = s.indexOf("->");
			if (arrow < 0) break;
			const head = s.slice(0, arrow);
			const colon = head.lastIndexOf(":");
			if (colon >= 0) {
				const p = Number.parseInt(head.slice(colon + 1), 10);
				if (Number.isInteger(p)) seen.add(p);
			}
			s = s.slice(arrow + 2);
		}
	}
	return [...seen].sort((a, b) => a - b);
}

/** l'ensemble occupé = ss ∪ docker ps (le check deploy.sh, fonction pure). */
export function occupiedFrom(host: HostState): Set<number> {
	return new Set([
		...parseSS(host.ssOutput),
		...parseDockerPS(host.dockerPsOutput),
	]);
}

/**
 * la règle de port DP12 : le PREMIER port libre ≥ BASE_PORT vu l'état observé.
 * PURE — jamais un prompt : même état hôte → même port (jumeau Go ResolvePort).
 */
export function resolvePort(host: HostState): number {
	const occupied = occupiedFrom(host);
	let p = BASE_PORT;
	while (occupied.has(p)) p++;
	return p;
}

// ---------------------------------------------------------------------------
// les helpers déterministes de détail (NOMS + réfs ${VAR}, jamais de secret/hôte)
// ---------------------------------------------------------------------------

const ROLE_OBSERVABILITY: Role = "observability";
const ROLE_DATASTORE: Role = "datastore";
const ROLE_SERVER: Role = "server";

/** le premier service d'un rôle dans l'ordre STABLE (nom trié) — déterministe. */
function firstWithRole(m: StackManifest, role: Role): Service | undefined {
	return [...m.services]
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
		.find((s) => s.role === role);
}

/** le front reverse-proxy : observability (traefik) si présent, sinon le serveur. */
function frontService(m: StackManifest): Service | undefined {
	return firstWithRole(m, ROLE_OBSERVABILITY) ?? firstWithRole(m, ROLE_SERVER);
}

/** la convention de nom de conteneur DP07 : le serveur primaire = ${APP_NAME}, sinon ${APP_NAME}-<name>. */
function containerName(svc: Service | undefined): string {
	if (svc === undefined) return "${APP_NAME}";
	if (svc.role === ROLE_SERVER) return "${APP_NAME}";
	return `\${APP_NAME}-${svc.name}`;
}

/** les références ${VAR} des volumes bind, triées — jamais un chemin en dur. */
function volumeRefs(m: StackManifest): string {
	const refs = (m.volumes ?? []).map((v) => `\${${v.deviceVar}}`).sort();
	return refs.length === 0 ? "(aucun volume nommé)" : refs.join(", ");
}

/** nomme les NOMS de variables-secret requises (jamais une valeur), trié. */
function secretsDetail(required: string[]): string {
	return required.length === 0 ? "(aucun secret requis)" : required.join(", ");
}

/** liste les conteneurs dont le healthcheck doit passer (NOMS seuls), trié. */
function healthyDetail(m: StackManifest): string {
	return [...m.services]
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
		.map((s) => containerName(s))
		.join(", ");
}

// ---------------------------------------------------------------------------
// le validateur DP02 PUR (sous-ensemble : ce qui peut bloquer une émission)
// ---------------------------------------------------------------------------

const KNOWN_ROLES: ReadonlySet<Role> = new Set<Role>([
	"server",
	"datastore",
	"observability",
	"cache",
	"pooler",
	"workflow",
	"bus",
	"error-tracking",
	"git",
	"tickets",
	"auth",
	"interpreter",
]);

/** la cause de refus DP02 (jumeau de stackmanifest.Validate, codes verbatim). */
function validateManifest(m: StackManifest): string | undefined {
	if (m.app.trim() === "")
		return "STACK_NAME_REQUIRED: the manifest must declare an app name";
	const seenNames = new Set<string>();
	const seenPorts = new Map<number, string>();
	let hasServer = false;
	for (const s of m.services) {
		if (s.name.trim() === "")
			return "SERVICE_NAME_REQUIRED: every service must be named";
		if (seenNames.has(s.name))
			return `DUPLICATE_SERVICE_NAME: service "${s.name}" declared twice`;
		seenNames.add(s.name);
		if (!KNOWN_ROLES.has(s.role))
			return `UNKNOWN_SERVICE_ROLE: service "${s.name}": role "${s.role}" is outside the closed set`;
		const prior = seenPorts.get(s.internalPort);
		if (prior !== undefined)
			return `DUPLICATE_INTERNAL_PORT: services "${prior}" and "${s.name}" both declare internal port ${s.internalPort}`;
		seenPorts.set(s.internalPort, s.name);
		if (s.role === ROLE_SERVER) hasServer = true;
	}
	if (!hasServer)
		return "STACK_HAS_NO_SERVER: the manifest must declare at least one role=server service";
	return undefined;
}

// ---------------------------------------------------------------------------
// les BlockReasons (forme S13 — jumeaux du registre Go blockreason)
// ---------------------------------------------------------------------------

/** la différence fail-closed requises − présentes (triée, déterministe). */
function missingSecrets(required: string[], secrets: SecretsState): string[] {
	const present = new Set(secrets.present.map((s) => s.trim()));
	return required.filter((r) => !present.has(r)).sort();
}

/** rend le BlockReason MISSING_SECRET_AT_BOOT en nommant les clés manquantes (actionnable). */
function blockMissingSecret(missing: string[]): BlockReason {
	return {
		code: "MISSING_SECRET_AT_BOOT",
		severity: "blocking",
		explanation:
			"Bootstrap REFUSÉ (DP12) : un secret REQUIS par le bundle émis (un par scope de connecteur déclaré " +
			"dans le StackManifest — l'ensemble que DP04 envemit dérive déjà) est ABSENT de l'appliance au boot. " +
			"La séquence d'amorçage est une PROJECTION pure ; un secret requis manquant est FAIL-CLOSED au cran " +
			"secrets-checked : l'amorçage est refusé, jamais démarré avec un identifiant blanc ou deviné (§8). Le " +
			".env concret et les secrets vivent UNIQUEMENT dans l'appliance au boot (chmod 600, gitignored) — JAMAIS " +
			"dans le source émis, le truth-store ou git (le mur §2). Le contrôle est une différence d'ensembles " +
			"DÉTERMINISTE (clés requises − clés présentes), jamais un jugement LLM. " +
			`Clés manquantes (différence requises − présentes) : ${missing.join(", ")}.`,
		howToFix: [
			"set_the_secret : déposez le secret manquant dans le secret store du projet (S91, scopé project_id, chiffré au repos) — la clé est nommée APP_SECRET_<SCOPE> (secretstore.EnvVar) ; jamais en dur dans le source.",
			"check_declared_scopes : la liste des secrets requis est DÉRIVÉE des connector_scopes déclarés du StackManifest — ni inventée, ni devinée ; vérifiez que chaque scope déclaré a son secret.",
			"rerun : relancez EmitBootstrapSequence une fois les secrets présents ; l'émission est déterministe (même bundle + même état hôte + mêmes secrets → même séquence).",
		],
	};
}

/** rend le BlockReason d'un manifest invalide (code OUT_OF_SCOPE, jumeau Go blockInvalid). */
function blockInvalid(cause: string): BlockReason {
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation:
			`Bootstrap refusé (DP12) : le StackManifest est invalide (${cause}). L'émetteur de séquence ` +
			"d'amorçage REND exactement la topologie déclarée par la source ; il ne devine jamais un rôle, un port " +
			"ou un service (honnêteté). Un manifest qui échoue au validateur pur DP02 n'est pas amorçable.",
		howToFix: [
			"fix_the_manifest : corrigez le StackManifest pour passer la validation — nom d'app requis, ≥1 service role=server, ports internes uniques, rôles dans leur ensemble clos.",
			"engrave_via_goal : un manifest est une vérité au-dessus de la ligne — gravez-le par idée → miroir → /goal → approbation, jamais en passant.",
			"re_emit : relancez EmitBootstrapSequence une fois le manifest valide ; l'émission est byte-identique à chaque run.",
		],
	};
}

// ---------------------------------------------------------------------------
// l'émetteur — le jumeau pur de EmitBootstrapSequence (même ordre, même détails)
// ---------------------------------------------------------------------------

/**
 * EmitBootstrapSequence est le jumeau TS PUR de l'émetteur DP12 : il VALIDE le
 * manifest (un manifest invalide est un BlockReason), FAIL-CLOSED si un secret
 * requis est absent (MISSING_SECRET_AT_BOOT), résout le port DÉTERMINISTIQUEMENT
 * (ss ∪ docker ps → premier libre ≥ base) et rend la séquence CLOSE, ORDONNÉE.
 * Il n'exécute AUCUN docker réel : les events sont un plan-as-data déterministe.
 * Même (manifest, hôte, secrets) → séquence byte-identique.
 *
 * Sur un block, il renvoie `{ block }` sans aucun event — un amorçage bloqué ne
 * démarre jamais à moitié.
 */
export function emitBootstrapSequence(
	m: StackManifest,
	host: HostState,
	secrets: SecretsState,
): EmitResult {
	// 1. le manifest doit être une source DP02 VALIDE (jamais une émission devinée).
	const invalid = validateManifest(m);
	if (invalid !== undefined) {
		return { block: blockInvalid(invalid) };
	}

	// 2. fail-closed sur un secret requis manquant AVANT tout cran émis.
	const required = requiredSecrets(m);
	const missing = missingSecrets(required, secrets);
	if (missing.length > 0) {
		return { block: blockMissingSecret(missing) };
	}

	// 3. résous le port hôte déterministiquement (la règle du spike DP10).
	const port = resolvePort(host);

	// 4. rends la séquence close, ordonnée — chaque détail est un NOM ou une réf
	//    ${VAR}, jamais une valeur de secret, jamais un endpoint en dur.
	const details: Record<EventKind, string> = {
		"network-created": m.network.name,
		"volumes-created": volumeRefs(m),
		// biome-ignore lint/suspicious/noTemplateCurlyInString: ${APP_DATA_PATH} est la réf compose littérale émise (le mur), pas un placeholder TS
		"env-materialized":
			"${APP_DATA_PATH}/.env (chmod 600, gitignored — appliance only)",
		"secrets-checked": secretsDetail(required),
		"ports-resolved": `host port ${port} (résolu depuis ss ∪ docker ps — premier libre ≥ base)`,
		"traefik-up": containerName(frontService(m)),
		"datastore-up": containerName(firstWithRole(m, ROLE_DATASTORE)),
		"server-up": containerName(firstWithRole(m, ROLE_SERVER)),
		healthy: healthyDetail(m),
		// biome-ignore lint/suspicious/noTemplateCurlyInString: ${APP_SUBDOMAIN}.${DOMAIN} sont les réfs compose littérales émises (le mur), pas un placeholder TS
		"urls-printed": "https://${APP_SUBDOMAIN}.${DOMAIN}",
	};

	const events: BootstrapEvent[] = ORDERED_KINDS.map((kind, i) => ({
		seq: i + 1,
		kind,
		detail: details[kind],
	}));
	return { sequence: { events, resolvedPort: port } };
}

/**
 * L'empreinte content-adressée de la séquence (FNV-1a 32 bits sur le rendu
 * canonique). Même séquence → même empreinte. PURE & TOTALE — le miroir de replay
 * épingle que emitBootstrapSequence est byte-stable.
 */
export function sequenceHash(s: BootstrapSequence): string {
	let canon = `port=${s.resolvedPort}\n`;
	for (const e of s.events) canon += `e=${e.seq}:${e.kind}:${e.detail}\n`;
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// les fixtures pinnées — les jumeaux des fixtures du test Go (mêmes entrées)
// ---------------------------------------------------------------------------

/**
 * NOMINAL_BUNDLE — le bundle émis représentatif DP12 (== nominalBundle() Go) :
 * un front traefik, un datastore postgres, un serveur, un volume bind, un scope
 * de connecteur déclaré (donc un secret requis au boot).
 */
export const NOMINAL_BUNDLE: StackManifest = {
	app: "demo",
	services: [
		{ name: "server", role: "server", internalPort: 3000 },
		{ name: "db", role: "datastore", image: "postgres:17", internalPort: 5432 },
		{
			name: "edge",
			role: "observability",
			image: "traefik:v3",
			internalPort: 80,
		},
	],
	volumes: [{ name: "data", deviceVar: "APP_DATA_PATH" }],
	network: { name: "traefik_default", external: true },
	connectorScopes: ["crm"],
};

/** CLEAN_HOST — l'instantané hôte sans port occupé dans la plage de base (== cleanHost() Go). */
export const CLEAN_HOST: HostState = {
	ssOutput:
		"State  Recv-Q Send-Q Local Address:Port\nLISTEN 0      128          0.0.0.0:22 \n",
	dockerPsOutput: "0.0.0.0:5433->5432/tcp\n",
};

/** BUSY_HOST — l'instantané hôte avec 80,81,82 occupés (== le row C Go : résout 83). */
export const BUSY_HOST: HostState = {
	ssOutput: "LISTEN 0 128 0.0.0.0:80 \nLISTEN 0 128 0.0.0.0:81 \n",
	dockerPsOutput: "0.0.0.0:82->80/tcp\n",
};

/** PRESENT_SECRETS — le seul secret que le scope `crm` du bundle nominal exige. */
export const PRESENT_SECRETS: SecretsState = { present: [secretEnvVar("crm")] };

/** NO_SECRETS — aucun secret présent (déclenche MISSING_SECRET_AT_BOOT sur le bundle nominal). */
export const NO_SECRETS: SecretsState = { present: [] };
