/**
 * LE REGISTRE D'ÉCRANS COMPLET — l'AUTORITÉ SOURCE de « toutes les capacités de la nav »
 * (au-delà des seules phrases que les écrans V3 émettent ; ADR 0057, loi de couverture §1/§5).
 *
 * LE PROBLÈME RÉSOLU. Avant ce module, l'inventaire que le chat (lib/v2/builder) connaissait
 * ne couvrait QUE le registre V2 déclaré (SCREENS) + les concepts du glossaire (GLOSSARY), plus
 * les écrans-racine SCANNÉS au runtime côté serveur (page.tsx). Conséquences :
 *   - le SCAN n'est qu'une donnée du système de fichiers — aucune AUTORITÉ déclarée ; une route
 *     exposée par la nav mais absente du scan (les sous-routes /v3/*, jamais énumérées par le scan
 *     plat de app/<dir>) était INATTEIGNABLE depuis le chat → « écran introuvable » (le fallthrough),
 *     un MONSTRE (capacité exposée, chat incompétent — l'inverse d'un miroir orphelin) ;
 *   - surtout, le MIROIR de complétude (builder.test.ts) n'itérait QUE SCREENS (22 écrans V2) — il
 *     ne PROUVAIT jamais que les ~186 autres capacités de la nav s'accrochent à un type de réponse.
 *
 * LA SOLUTION (déterminisme-first §6/§8). Ce module DÉCLARE, en DONNÉES, le registre COMPLET des
 * écrans-capacités du Workbench — racine (V1), V2, V3 — chacun avec sa route content-adressée et
 * ses libellés/synonymes FR d'accroche. C'est CE registre (ALL_SCREENS) qui :
 *   1. PILOTE l'inventaire du chat : `initBuilderState()` le prend par défaut (la couverture du
 *      réducteur passe de « V2 + scan » à « 100 % de la nav, déclaré ») ;
 *   2. PILOTE le miroir de complétude : `builder.test.ts` itère ALL_SCREENS et prouve que CHAQUE
 *      capacité s'accroche à un type de réponse — via « ouvre <écran> » résolu par resolveScreen,
 *      jamais le fallthrough. Le miroir est NON tautologique : retirer une entrée de l'inventaire
 *      passé à resolveScreen fait ROUGIR le miroir en NOMMANT l'écran (cf. la propriété dédiée).
 *
 * PURES & TOTALES & DÉTERMINISTES : `ALL_SCREENS`, `canonicalOpenPhrase`, `registryHash` ne
 * dépendent que des données déclarées — pas d'horloge, pas d'aléa, pas d'E/S, pas de LLM. Le
 * registre est DÉCLARÉ, jamais appris (§8) ; un nouvel écran s'AJOUTE ici (une donnée), jamais
 * un cas codé. La résolution capacité → écran reste l'algorithme lexical de resolveScreen.
 *
 * LE MUR (§2). Ce module DÉCRIT les écrans et ROUTE vers eux (ouvrir) ; il n'écrit AUCUNE vérité.
 * Une capacité qui « écrit la vérité » (promouvoir une idée en kernel) reste routée par le chat
 * vers idée → miroir → /goal (l'intent `promouvoir`, le ChangeSet DRAFT), jamais exécutée ici.
 */

import { GLOSSARY } from "./glossary";
import { SCREENS } from "./screens";

/**
 * Une référence d'ÉCRAN du Workbench — la même forme que `ScreenRef` du réducteur (route + label).
 * On la redéclare ici (et le builder importe ALL_SCREENS) pour éviter un cycle d'import runtime :
 * le label porte les SYNONYMES FR d'accroche (resolveScreen score les tokens du label à +1).
 */
export interface RegistryScreen {
	/** La route content-adressée /<…> du Workbench (l'identité de l'écran). */
	readonly route: string;
	/** Les libellés + synonymes FR d'accroche (tokens scorés par resolveScreen). */
	readonly label: string;
}

/**
 * LES ÉCRANS-RACINE (V1) — toutes les capacités historiques du Workbench, hors V2/V3 et hors
 * routes non routables (api, dossiers privés `_`). Chaque entrée = un slug de route + ses
 * SYNONYMES FR (le slug lui-même + son expansion française), pour que « ouvre <capacité> »
 * s'accroche. DÉCLARÉ, exhaustif (l'audit du système de fichiers — un par app/<dir>/page.tsx) :
 * un écran-racine exposé par la nav et absent d'ici serait un monstre (le miroir le nommerait).
 *
 * NOTE : la liste fige les ROUTES (l'identité) ; les synonymes FR aident l'accroche mais la
 * preuve de couverture du miroir n'a besoin que de la route (la phrase canonique reprend les
 * segments de route — voir canonicalOpenPhrase). Le bon mot FR vient enrichir l'expérience.
 */
const ROOT_SCREENS: readonly RegistryScreen[] = [
	{
		route: "/account-release",
		label: "compte release livraison palier adoption",
	},
	{ route: "/adoption", label: "adoption échelle paliers" },
	{ route: "/agents", label: "agents couche agent layer" },
	{ route: "/ai-lab", label: "ai lab laboratoire besoin verticale" },
	{ route: "/api-projection", label: "api projection émetteur" },
	{ route: "/api-surface", label: "api surface contrats" },
	{ route: "/app-auth", label: "app auth authentification émise" },
	{ route: "/app-builder", label: "app builder constructeur application" },
	{ route: "/app-docs", label: "app docs documentation émise" },
	{ route: "/app-ops", label: "app ops opérations émises" },
	{
		route: "/app-regenerator",
		label: "app regenerator régénérateur application",
	},
	{ route: "/arch-fitness", label: "arch fitness architecture conformité" },
	{ route: "/archive-curation", label: "archive curation conservation" },
	{ route: "/async-operation", label: "async operation opération asynchrone" },
	{ route: "/auth", label: "auth authentification connexion" },
	{ route: "/authorities", label: "authorities autorités" },
	{ route: "/authority-binding", label: "authority binding liaison autorité" },
	{ route: "/autonomy", label: "autonomy autonomie" },
	{
		route: "/behavior-capture",
		label: "behavior capture capture comportement",
	},
	{
		route: "/behavior-expander",
		label: "behavior expander expanseur comportement",
	},
	{ route: "/behaviors", label: "behaviors comportements" },
	{ route: "/besoin-intake", label: "besoin intake admission besoin" },
	{
		route: "/besoin-invariant",
		label: "besoin invariant invariant transversal",
	},
	{ route: "/besoin-necessity", label: "besoin necessity nécessité besoin" },
	{ route: "/billing", label: "billing facturation" },
	{ route: "/blob-attribute", label: "blob attribute attribut binaire" },
	{ route: "/blocks", label: "blocks blocs blocages" },
	{ route: "/bootstrap", label: "bootstrap amorçage" },
	{ route: "/bootstrap-spike", label: "bootstrap spike amorçage sonde" },
	{ route: "/brain", label: "brain cerveau mémoire" },
	{
		route: "/build-approvals",
		label: "build approvals approbations construction",
	},
	{ route: "/build-console", label: "build console console construction" },
	{ route: "/build-loop", label: "build loop boucle construction" },
	{ route: "/capture-idea", label: "capture idea capture idée" },
	{ route: "/caused-by", label: "caused by causé par cause" },
	{ route: "/cell-federation", label: "cell federation fédération cellules" },
	{ route: "/changeset", label: "changeset jeu de changements transaction" },
	{ route: "/check", label: "check vérification contrôle" },
	{ route: "/cli", label: "cli ligne de commande aidos" },
	{ route: "/collab", label: "collab collaboration" },
	{ route: "/completeness", label: "completeness complétude loi" },
	{ route: "/compound", label: "compound composé capitalisation" },
	{
		route: "/compound-besoin",
		label: "compound besoin umbrella entretien besoin",
	},
	{
		route: "/compound-besoin-branchtree",
		label: "compound besoin branchtree arbre branches",
	},
	{
		route: "/compound-besoin-candescend",
		label: "compound besoin candescend descente verdict",
	},
	{
		route: "/compound-besoin-capitalisation",
		label: "compound besoin capitalisation capital",
	},
	{ route: "/compound-besoin-cascade", label: "compound besoin cascade" },
	{
		route: "/compound-besoin-completeness",
		label: "compound besoin completeness complétude",
	},
	{ route: "/compound-besoin-gate", label: "compound besoin gate porte" },
	{
		route: "/compound-besoin-grammar",
		label: "compound besoin grammar grammaire",
	},
	{ route: "/compound-besoin-graph", label: "compound besoin graph graphe" },
	{
		route: "/compound-besoin-metadata",
		label: "compound besoin metadata métadonnées",
	},
	{
		route: "/compound-besoin-mirrorform",
		label: "compound besoin mirrorform forme miroir",
	},
	{
		route: "/compound-besoin-proposes",
		label: "compound besoin proposes propose",
	},
	{
		route: "/compound-besoin-thresholds",
		label: "compound besoin thresholds seuils",
	},
	{ route: "/connectors", label: "connectors connecteurs" },
	{ route: "/connectors-spike", label: "connectors spike connecteurs sonde" },
	{ route: "/conscience", label: "conscience voulu construit prouvé autorisé" },
	{
		route: "/context-compression",
		label: "context compression compression contexte",
	},
	{ route: "/context-map", label: "context map carte contexte" },
	{ route: "/context-pack", label: "context pack paquet contexte" },
	{ route: "/contract", label: "contract contrat pact" },
	{ route: "/control", label: "control contrôle bouton" },
	{ route: "/cost-meter", label: "cost meter compteur coût" },
	{ route: "/data-migrate", label: "data migrate migration données" },
	{ route: "/db-projection", label: "db projection projection base ddl" },
	{ route: "/decision-reuse", label: "decision reuse réemploi décision" },
	{ route: "/demo-checkout", label: "demo checkout démo paiement tranche" },
	{ route: "/deploy", label: "deploy déploiement déployer" },
	{ route: "/derive-doc", label: "derive doc dérive documentation" },
	{ route: "/doc-mirror", label: "doc mirror miroir documentation" },
	{ route: "/doltgres-spike", label: "doltgres spike sonde doltgres données" },
	{ route: "/domain-bind", label: "domain bind liaison domaine" },
	{ route: "/dsl-editor", label: "dsl editor éditeur dsl" },
	{ route: "/emit-ideas", label: "emit ideas émettre idées backlog" },
	{ route: "/emitted-target", label: "emitted target cible émise" },
	{ route: "/emitters", label: "emitters émetteurs ddl go ts" },
	{
		route: "/endpoints-fitness",
		label: "endpoints fitness conformité endpoints",
	},
	{ route: "/entity-map", label: "entity map carte entités" },
	{ route: "/entity-modeler", label: "entity modeler modeleur entités" },
	{ route: "/entity-relation", label: "entity relation relation entités" },
	{ route: "/environments", label: "environments environnements échelle" },
	{
		route: "/env-rollback",
		label: "env rollback retour arrière environnement",
	},
	{
		route: "/evolution-sandbox",
		label: "evolution sandbox bac à sable évolution quarantaine",
	},
	{ route: "/exploration", label: "exploration sonde spike" },
	{ route: "/expr", label: "expr expression cel" },
	{
		route: "/facet-completeness",
		label: "facet completeness complétude facette",
	},
	{ route: "/facets", label: "facets facettes lentilles" },
	{ route: "/facet-wire", label: "facet wire câblage facette" },
	{ route: "/federation", label: "federation fédération" },
	{
		route: "/federation-cockpit",
		label: "federation cockpit cockpit fédération",
	},
	{ route: "/first-app", label: "first app première application" },
	{ route: "/front-emitter", label: "front emitter émetteur front" },
	{ route: "/gateway", label: "gateway passerelle go front" },
	{ route: "/gdpr-erasure", label: "gdpr erasure effacement rgpd" },
	{
		route: "/global-invariants",
		label: "global invariants invariants globaux",
	},
	{ route: "/goal", label: "goal promouvoir idée vérité but" },
	{ route: "/goal-piloting", label: "goal piloting pilotage goal" },
	{ route: "/goal-stream", label: "goal stream flux goal" },
	{ route: "/governance", label: "governance gouvernance" },
	{ route: "/grid", label: "grid grille niveau facette" },
	{ route: "/grilling-loop", label: "grilling loop boucle grill challenge" },
	{ route: "/harness-economics", label: "harness economics économie harnais" },
	{ route: "/hono-emitter", label: "hono emitter émetteur hono serveur" },
	{ route: "/ideas", label: "ideas idées candidats vérité" },
	{
		route: "/incidents-to-ideas",
		label: "incidents to ideas incidents vers idées",
	},
	{ route: "/ingestion", label: "ingestion conversion document markdown" },
	{ route: "/kernel-debt", label: "kernel debt dette kernel trim" },
	{ route: "/kernel-garden", label: "kernel garden jardin kernel" },
	{ route: "/learn", label: "learn apprendre incident signal" },
	{ route: "/lexicon", label: "lexicon lexique vocabulaire" },
	{ route: "/link-graph", label: "link graph graphe liens" },
	{ route: "/memory-backends", label: "memory backends backends mémoire" },
	{ route: "/memory-firewall", label: "memory firewall pare-feu mémoire" },
	{ route: "/meta", label: "meta méta méta-méta" },
	{ route: "/mirror-health", label: "mirror health santé miroirs" },
	{ route: "/mirror-library", label: "mirror library bibliothèque miroirs" },
	{ route: "/mirrors", label: "mirrors miroirs bdd preuves" },
	{ route: "/mirror-watch", label: "mirror watch surveillance miroirs" },
	{ route: "/mutation-score", label: "mutation score score mutation" },
	{
		route: "/operation",
		label: "operation opération état commande événements",
	},
	{
		route: "/ops-observability",
		label: "ops observability observabilité opérations télémétrie",
	},
	{ route: "/phase-stable", label: "phase stable phase stable dag" },
	{ route: "/policy", label: "policy politique allow deny autorisation" },
	{ route: "/preview", label: "preview aperçu web" },
	{ route: "/project-dag", label: "project dag dag projet" },
	{ route: "/project-evolve", label: "project evolve évolution projet" },
	{ route: "/project-members", label: "project members membres projet" },
	{ route: "/projects", label: "projects projets liste" },
	{ route: "/project-scope", label: "project scope portée projet" },
	{ route: "/project-wall", label: "project wall mur projet" },
	{ route: "/proof-levels", label: "proof levels niveaux preuve" },
	{ route: "/proof-type", label: "proof type type preuve" },
	{ route: "/provision", label: "provision provisionner substrat" },
	{ route: "/reality-evolution", label: "reality evolution évolution réalité" },
	{
		route: "/reality-ingest",
		label: "reality ingest ingestion réalité télémétrie",
	},
	{ route: "/records", label: "records enregistrements records" },
	{ route: "/red-backlog", label: "red backlog backlog rouge ordre" },
	{ route: "/red-propagation", label: "red propagation propagation rouge" },
	{ route: "/red-wave", label: "red wave vague rouge" },
	{ route: "/relation-emitter", label: "relation emitter émetteur relation" },
	{ route: "/sagas", label: "sagas saga compensation" },
	{ route: "/scopes", label: "scopes portées" },
	{ route: "/secret-store", label: "secret store coffre secrets" },
	{ route: "/self-cert", label: "self cert auto-certification" },
	{ route: "/semantic-diff", label: "semantic diff diff sémantique" },
	{ route: "/semantic-merge", label: "semantic merge fusion sémantique" },
	{ route: "/sensors", label: "sensors capteurs sondes" },
	{ route: "/shape-editor", label: "shape editor éditeur forme entité" },
	{ route: "/stack-emit", label: "stack emit émission pile" },
	{ route: "/stack-manifest", label: "stack manifest manifeste pile" },
	{ route: "/stack-spike", label: "stack spike sonde pile" },
	{ route: "/store", label: "store magasin contenu" },
	{ route: "/strangler", label: "strangler étrangleur migration" },
	{ route: "/substrate", label: "substrate substrat" },
	{ route: "/substrate-spike", label: "substrate spike sonde substrat" },
	{ route: "/tech-spec", label: "tech spec spécification technique" },
	{ route: "/templates", label: "templates gabarits modèles" },
	{
		route: "/temporal-invariants",
		label: "temporal invariants invariants temporels",
	},
	{ route: "/tool-projection", label: "tool projection projection outil mcp" },
	{ route: "/truth-approval", label: "truth approval approbation vérité" },
	{ route: "/truth-level", label: "truth level niveau vérité" },
	{ route: "/truth-tree", label: "truth tree arbre vérité" },
	{ route: "/truth-typing", label: "truth typing typage vérité" },
	{ route: "/version-dag", label: "version dag dag versions" },
	{ route: "/wall", label: "wall mur frontière" },
	{ route: "/web-preview", label: "web preview aperçu web composant" },
	{ route: "/why-blocked", label: "why blocked pourquoi bloqué blockreason" },
	{ route: "/why-tree", label: "why tree arbre pourquoi cause racine" },
	{ route: "/workspace", label: "workspace espace de travail cockpit" },
] as const;

/**
 * LES ÉCRANS V3 — les dix lentilles de la session V3 (V3Nav.ENTRIES) + le générateur d'évolution
 * et le bench de complétude. Libellés FR AMICAUX (la copie de la nav V3), VERBATIM. La route porte
 * son préfixe `v3` (le départage déterministe contre les homonymes V2/racine : /v3/code ≠ /v2/code).
 */
const V3_SCREENS: readonly RegistryScreen[] = [
	{ route: "/v3/lab", label: "ai lab laboratoire besoin session" },
	{ route: "/v3/parcours", label: "parcours produit journey" },
	{ route: "/v3/specs", label: "spécifications specs" },
	{ route: "/v3/operation", label: "opérations operation état commande" },
	{ route: "/v3/history", label: "historique history dag" },
	{ route: "/v3/environnements", label: "environnements échelle déploiement" },
	{ route: "/v3/code", label: "code descente symboles" },
	{ route: "/v3/instance", label: "instance déployée live" },
	{ route: "/v3/parametrage", label: "paramètres paramétrage réglages" },
	{ route: "/v3/design", label: "design lab styling tokens onlook" },
	{ route: "/v3/emetteurs", label: "émetteurs ddl go ts hono" },
	{
		route: "/v3/evolve",
		label: "générateur évolution sandbox quarantaine self-play",
	},
	{ route: "/v3/bench", label: "bench complétude requirement spec couverture" },
] as const;

/**
 * LES ÉCRANS V2 — RÉUTILISÉS du registre V2 déclaré (SCREENS) + les CONCEPTS du glossaire servis
 * par la route dynamique /v2/[slug] (GLOSSARY moins les slugs déjà dédiés). On NE DUPLIQUE PAS le
 * registre V2 : on le PROJETTE (même mécanique qu'initBuilderState auparavant), ici centralisée.
 */
function v2Screens(): readonly RegistryScreen[] {
	const dedicated = new Set(SCREENS.map((e) => e.slug));
	const fromScreens: RegistryScreen[] = SCREENS.map((e) => ({
		route: `/v2/${e.slug}`,
		label: `${e.slug} ${e.fr.title} ${e.en.title}`,
	}));
	const fromGlossary: RegistryScreen[] = GLOSSARY.filter(
		(g) => !dedicated.has(g.slug),
	).map((g) => ({
		route: `/v2/${g.slug}`,
		label: `${g.slug} ${g.fr.def} ${g.en.def}`,
	}));
	return [...fromScreens, ...fromGlossary];
}

/**
 * LE REGISTRE D'ÉCRANS COMPLET — l'AUTORITÉ : toutes les capacités de la nav, déclarées, triées
 * par route (déterministe, stable). C'est l'inventaire par défaut du réducteur ET la source que
 * le miroir de complétude itère. Les routes sont UNIQUES (prouvé par registryIsTotal).
 */
export const ALL_SCREENS: readonly RegistryScreen[] = [
	...ROOT_SCREENS,
	...v2Screens(),
	...V3_SCREENS,
]
	.slice()
	.sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));

/**
 * LA PHRASE CANONIQUE d'OUVERTURE d'un écran — « ouvre <segments de route> » : la phrase que le
 * miroir REJOUE pour prouver que l'écran est atteignable. Les segments de route (préfixe v2/v3
 * inclus, tirets dépliés en espaces) DÉPARTAGENT déterministiquement les homonymes (/v2/code vs
 * /v3/code) — le bonus de slug exact + le score de tokens de route de resolveScreen résolvent
 * chaque entrée vers SA propre route. PURE & TOTALE & DÉTERMINISTE.
 */
export function canonicalOpenPhrase(screen: RegistryScreen): string {
	const segs = screen.route.replace(/^\//, "").replace(/[/-]+/g, " ");
	return `ouvre ${segs}`;
}

/**
 * LA TOTALITÉ du registre (le critère de « pas de monstre ») : route non vide, route UNIQUE,
 * label non vide. PURE & TOTALE. Le miroir l'épingle (un registre incohérent rougit avant tout).
 */
export function registryIsTotal(
	entries: readonly RegistryScreen[] = ALL_SCREENS,
): boolean {
	const seen = new Set<string>();
	for (const e of entries) {
		if (typeof e.route !== "string" || e.route.trim() === "") return false;
		if (seen.has(e.route)) return false;
		seen.add(e.route);
		if (typeof e.label !== "string" || e.label.trim() === "") return false;
	}
	return entries.length > 0;
}

/**
 * L'empreinte content-adressée du registre (déterministe, stable) — FNV-1a 32 bits sur la
 * sérialisation ordonnée. Même registre → même empreinte (le registre est une vérité de lecture).
 */
export function registryHash(
	entries: readonly RegistryScreen[] = ALL_SCREENS,
): string {
	const canon = entries.map((e) => `${e.route}|${e.label}`).join("\n");
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}
