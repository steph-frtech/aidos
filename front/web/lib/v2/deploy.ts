/**
 * WB2-22 — le TWIN PUR du « déploiement » de l'app émise (AI Lab ; ADR 0052 ; S96 ; CLAUDE.md §3 N5).
 * `/v2/deploy` montre la chaîne SPECS → APP WEB → PROD : à partir d'une source d'entité (la même que
 * `/v2/emetteurs` émet), AIDOS PLANIFIE DÉTERMINISTIQUEMENT le déploiement de l'app émise — l'empreinte de
 * l'app (content-adressée sur les projections émises), le plan de CONTENEURISATION (les services
 * docker-compose : postgres + le DDL émis + l'app générique), la ROUTE Traefik (sous-domaine dérivé de la
 * table + domaine de base → URL live, cert Let's Encrypt) et l'APERÇU LIVE (la table back-office que l'app
 * servirait). Une seule source → un plan reproductible, jamais deux URLs pour la même app.
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : ce module NE RÉÉMET RIEN par lui-même — il RÉUTILISE
 * `emitView`/`appPreview`/`entityId` de WB2-21 (`lib/v2/emetteurs.ts`, lui-même un ré-export byte-identique
 * de S35). Il ajoute la seule chose neuve de WB2-22 :
 *   - `deployGate(ctx)` — LA PARENTHÈSE SÉCURITÉ d'ADR 0052, désormais FERMÉE : un bouton public qui
 *     « émet + fait tourner un conteneur » DOIT être GATÉ (auth + rate-limit). Une fonction PURE & TOTALE :
 *     non authentifié → refus `DEPLOY_GATE_UNAUTHENTICATED` ; quota dépassé → refus `DEPLOY_GATE_RATE_LIMITED`.
 *     Le déploiement ne se calcule QUE si la garde passe (fail-closed).
 *   - `buildDeployPlan(entity, gate)` — le plan de déploiement content-adressé : l'app émise (via `emitView`),
 *     son empreinte (`appHash`, le hash des octets des trois cibles + la garde), les services conteneurisés,
 *     la route Traefik (`subdomain`.`baseDomain` → `url`), et l'aperçu live (via `appPreview`). Garde refusée
 *     ou AST malformé → un `BlockReason` (jamais une URL devinée, jamais un déploiement silencieux).
 *   - `reDeployStable(entity, gate, rounds)` — la PREUVE de re-planification reproductible (le critère de
 *     done « plan reproductible ») : replanifier la MÊME source N fois → même `planId`, même `url`, même
 *     `appHash` (un planificateur pur n'a aucun état caché → sa sortie est fonction de sa seule entrée).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : la PLANIFICATION est une FONCTION PURE, jamais un LLM — aucune
 * horloge, aucun aléa, aucune I/O. Mêmes attributs + même garde → même plan, même URL, même empreinte. Le
 * miroir de reproductibilité lib/v2/deploy.test.ts épingle : re-planification reproductible, garde
 * fail-closed (auth ∧ rate-limit), URL dérivée de la table, services attendus, aperçu live = aperçu émis.
 *
 * LE MUR (CLAUDE.md §2) : le déploiement est une action SOUS LA LIGNE (émettre une projection + planifier
 * son conteneur) — il n'écrit AUCUNE vérité. Les entités sont des kernels (vérités) ; l'app émise et son
 * plan sont des PROJECTIONS régénérables. Modifier une source d'entité PROPOSE → /goal, jamais une écriture.
 */

import {
	type AppPreview,
	appPreview,
	type BlockReason,
	type EmitView,
	ENTITY_CASES,
	type Entity,
	type EntityCase,
	emitView,
	entityId,
	isBlockedView,
} from "./emetteurs";

// On RÉ-EXPORTE le registre clos + les types réutilisés pour que l'écran V2 importe tout depuis un seul
// module v2 — aucune duplication, aucun nouveau juge, aucun fork (ADR 0007).
export {
	type AppPreview,
	appPreview,
	type BlockReason,
	type EmitView,
	ENTITY_CASES,
	type Entity,
	type EntityCase,
	emitView,
	entityId,
	isBlockedView,
};

/** Le domaine de base sous lequel l'app émise est routée (le MÊME que l'AI Lab : sagedesk.fr, ADR 0052). */
export const BASE_DOMAIN = "sagedesk.fr" as const;

/**
 * Le contexte d'appel du bouton « Déployer » — ce que la garde sécurité d'ADR 0052 inspecte. PURE : aucune
 * I/O ; l'écran fournit ces deux faits (authentifié ? sous quota ?), la garde tranche déterministiquement.
 */
export interface DeployGateContext {
	/** L'appelant est-il authentifié ? (un bouton public anonyme NE déploie PAS — fail-closed.) */
	readonly authenticated: boolean;
	/** Combien de déploiements l'appelant a déjà lancés dans la fenêtre courante. */
	readonly deploysInWindow: number;
	/** Le quota de déploiements par fenêtre (le rate-limit). Déclaré, jamais appris (§8). */
	readonly rateLimitPerWindow: number;
}

/** Le verdict de la garde sécurité : autorisé, ou refusé avec un BlockReason actionnable. */
export interface GateVerdict {
	readonly allowed: boolean;
	/** Le BlockReason quand refusé (code · sévérité · explication · comment corriger) ; null si autorisé. */
	readonly reason: BlockReason | null;
}

/** Le quota de déploiements par défaut par fenêtre (déclaré au-dessus de la ligne, jamais appris). */
export const DEFAULT_RATE_LIMIT = 5 as const;

/**
 * deployGate — LA PARENTHÈSE SÉCURITÉ d'ADR 0052, fermée. Le bouton « Déployer » exécute (côté serveur réel)
 * une émission + un `docker compose up` : une capacité PUISSANTE qui DOIT être gatée avant toute exposition
 * publique. La garde est une FONCTION PURE & TOTALE, fail-closed et ORDONNÉE (auth d'abord, puis rate-limit) :
 *   - non authentifié → refus `DEPLOY_GATE_UNAUTHENTICATED` (sévérité bloquante) ;
 *   - quota atteint/dépassé → refus `DEPLOY_GATE_RATE_LIMITED` (sévérité bloquante) ;
 *   - sinon → autorisé.
 * DÉTERMINISTE : mêmes faits → même verdict, jamais un jugement LLM « est-ce sûr ? » (§8).
 */
export function deployGate(ctx: DeployGateContext): GateVerdict {
	if (!ctx.authenticated) {
		return {
			allowed: false,
			reason: {
				code: "DEPLOY_GATE_UNAUTHENTICATED",
				severity: "blocking",
				explanation:
					"Le bouton « Déployer » exécute une émission + un conteneur public : il est gaté. " +
					"Un appelant non authentifié ne peut pas déployer (fail-closed).",
				how_to_fix: [
					"S'authentifier auprès du Workbench avant de déclencher le déploiement.",
					"Une fois authentifié, le bouton devient exécutable (sous le rate-limit).",
				],
			},
		};
	}
	if (ctx.deploysInWindow >= ctx.rateLimitPerWindow) {
		return {
			allowed: false,
			reason: {
				code: "DEPLOY_GATE_RATE_LIMITED",
				severity: "blocking",
				explanation:
					`Quota de déploiements atteint (${ctx.deploysInWindow}/${ctx.rateLimitPerWindow} ` +
					"dans la fenêtre courante). Le rate-limit protège l'exécution (coût/sécurité, ADR 0052).",
				how_to_fix: [
					"Attendre la fenêtre suivante pour redéployer.",
					"Le quota est déclaré au-dessus de la ligne (jamais appris) ; le relever PROPOSE → /goal.",
				],
			},
		};
	}
	return { allowed: true, reason: null };
}

/** Un service du plan de conteneurisation (docker-compose) : son nom, son image, son rôle. */
export interface ContainerService {
	readonly name: string;
	readonly image: string;
	readonly role: string;
}

/**
 * Le plan de CONTENEURISATION (docker-compose) de l'app émise (ADR 0052 §3). Un jeu de services CLOS &
 * DÉCLARÉ — postgres (avec le DDL émis appliqué via initdb.d), l'app générique (Go + pgx, lit entities.json),
 * et la route Traefik (TLS Let's Encrypt). Déterministe : mêmes entités → mêmes services.
 */
export const CONTAINER_SERVICES: readonly ContainerService[] = [
	{ name: "postgres", image: "postgres:16", role: "db" },
	{ name: "app", image: "aidos/emitted-app", role: "web" },
	{ name: "traefik", image: "traefik:v3", role: "ingress" },
] as const;

/** La route Traefik calculée : le sous-domaine, le domaine de base, l'URL live (https), le hôte du routeur. */
export interface TraefikRoute {
	readonly subdomain: string;
	readonly baseDomain: string;
	readonly host: string;
	readonly url: string;
}

/**
 * Le plan de déploiement content-adressé : l'app émise (les trois projections), son empreinte (`appHash`),
 * les services conteneurisés, la route Traefik (→ URL live), l'aperçu live (la table back-office), et le
 * `planId` reproductible. Une projection PURE de l'AST + la garde — jamais un déploiement deviné.
 */
export interface DeployPlan {
	readonly entity: Entity;
	/** L'empreinte source de l'entité (content-adressée, S35). */
	readonly sourceHash: string;
	/** L'empreinte de l'app émise : hash des octets des trois cibles (la « BDD du résultat codé »). */
	readonly appHash: string;
	/** L'id reproductible du plan (content-adressé sur appHash) — d-… (le twin du « d-… » de S96). */
	readonly planId: string;
	/** L'émission (les trois projections : DDL · Go · TS) que ce plan déploie. */
	readonly view: EmitView;
	/** Les services docker-compose du plan. */
	readonly services: readonly ContainerService[];
	/** La route Traefik (sous-domaine + URL live). */
	readonly route: TraefikRoute;
	/** L'aperçu LIVE de l'app servie : la table back-office (colonnes, nullabilité, PK) — = l'aperçu émis. */
	readonly preview: AppPreview;
}

/**
 * Le hash content-adressé d'une chaîne (FNV-1a 32-bit, déterministe & total) — le MÊME schéma que l'écran
 * /v2/emetteurs réutilise via S35. Pas de cryptographie (un id d'affichage, pas un secret) ; pur, stable.
 */
function hash32(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/**
 * Le sous-domaine d'une table : minuscules, on garde [a-z0-9-], on collapse le reste en « - », sans tiret de
 * bord. DÉTERMINISTE & TOTAL : une table vide → « app » (jamais un sous-domaine vide, jamais une exception).
 * Le twin de la dérivation `alphashop` → `alphashop.sagedesk.fr` d'ADR 0052.
 */
export function subdomainOf(table: string): string {
	const slug = table
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug.length > 0 ? slug : "app";
}

/**
 * buildDeployPlan — le plan de déploiement de l'app émise, content-adressé & GATÉ. ORDRE (fail-closed) :
 *   1) la GARDE sécurité d'ADR 0052 (auth ∧ rate-limit) — refusée → BlockReason, AUCUN plan ;
 *   2) l'ÉMISSION (via `emitView`, S35) — AST malformé → le BlockReason de l'émission, AUCUN plan ;
 *   3) le PLAN content-adressé : `appHash` = hash des octets des trois cibles (l'app émise) ; `planId` = d-…
 *      dérivé d'`appHash` ; la route Traefik (`subdomainOf(table)`.`BASE_DOMAIN` → URL) ; l'aperçu live.
 * PURE & TOTALE : mêmes attributs + même garde → même plan, même URL, même empreinte (le critère de done
 * « plan reproductible »). Jamais un LLM (§8) — la planification est une projection déterministe.
 */
export function buildDeployPlan(
	entity: Entity,
	gate: GateVerdict,
): DeployPlan | BlockReason {
	// 1) La garde sécurité : fail-closed. On NE planifie QUE si la garde passe.
	if (!gate.allowed) {
		// La garde a déjà fabriqué le BlockReason actionnable.
		return gate.reason as BlockReason;
	}
	// 2) L'émission depuis les entités (réutilise S35). Un AST malformé → le BlockReason de l'émission.
	const view = emitView(entity);
	if (isBlockedView(view)) return view;

	// 3) Le plan content-adressé.
	const preview = appPreview(entity);
	// L'app émise = la concaténation ORDONNÉE des octets des trois cibles (déterministe, ordre d'affichage).
	const appBytes = view.targets.map((tg) => tg.bytes).join(" ");
	const appHash = hash32(appBytes);
	const planId = `d-${appHash}`;
	const subdomain = subdomainOf(preview.table);
	const host = `${subdomain}.${BASE_DOMAIN}`;
	const route: TraefikRoute = {
		subdomain,
		baseDomain: BASE_DOMAIN,
		host,
		url: `https://${host}`,
	};
	return {
		entity,
		sourceHash: view.sourceHash,
		appHash,
		planId,
		view,
		services: CONTAINER_SERVICES,
		route,
		preview,
	};
}

/** Le rapport de re-planification : le nombre de tours, le planId/url/appHash de référence, la stabilité. */
export interface ReDeployReport {
	readonly rounds: number;
	readonly planId: string;
	readonly url: string;
	readonly appHash: string;
	readonly stable: boolean;
}

/**
 * reDeployStable — la PREUVE de re-planification REPRODUCTIBLE (le critère de done « plan reproductible »).
 * Replanifie la MÊME source `rounds` fois (même garde) et confirme que `planId`, `url` et `appHash` sont
 * identiques à chaque tour : un planificateur pur n'a aucun état caché → sa sortie est fonction de sa SEULE
 * entrée. DÉTERMINISTE, jamais un jugement LLM « est-ce reproductible ? » (§8). Fail-closed : une garde
 * refusée ou un AST malformé rend `stable=false` (pas de plan à comparer).
 */
export function reDeployStable(
	entity: Entity,
	gate: GateVerdict,
	rounds = 16,
): ReDeployReport {
	const first = buildDeployPlan(entity, gate);
	if (isBlockedPlan(first)) {
		return { rounds, planId: "", url: "", appHash: "", stable: false };
	}
	let stable = true;
	for (let r = 0; r < rounds; r++) {
		const again = buildDeployPlan(entity, gate);
		if (
			isBlockedPlan(again) ||
			again.planId !== first.planId ||
			again.route.url !== first.route.url ||
			again.appHash !== first.appHash
		) {
			stable = false;
			break;
		}
	}
	return {
		rounds,
		planId: first.planId,
		url: first.route.url,
		appHash: first.appHash,
		stable,
	};
}

/**
 * isBlockedPlan — le type-guard qui discrimine un `BlockReason` d'un `DeployPlan` (le twin de
 * `isBlockedView`). Discrimine sur le champ `code` (présent seulement sur un BlockReason) — un plan n'a
 * jamais de `code`. Total : ni horloge, ni LLM.
 */
export function isBlockedPlan(x: DeployPlan | BlockReason): x is BlockReason {
	return (x as BlockReason).code !== undefined;
}
