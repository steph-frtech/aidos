/**
 * WB2-14 — le TWIN PUR de la POLICY DSL (KRD §24.4, §93) : une autorisation rendue comme un ARBRE
 * RÉCURSIF ALLOW/DENY — les combinateurs `all` (∧) / `any` (∨) / `not` (¬) au-dessus de feuilles
 * (eq/gt/lt, exists, matches) — avec un scope (RESOURCE / OPERATION / ENTITY / FIELD) et un effet
 * (ALLOW / DENY). Là où WB2-13 montre le FLUX d'un scénario, WB2-14 montre la RÈGLE d'autorisation :
 * un arbre que l'on déplie (React Arborist) et que l'on ÉVALUE — chaque nœud tracé (HOLD / FAIL),
 * et la loi §93 « tout ALLOW passe, n'importe quel DENY bloque » lisible sur l'arbre.
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : la SÉMANTIQUE d'évaluation (`holds`, `evaluate`, les
 * sélecteurs $-enracinés, la loi de combinaison via l'effet) est CELLE de `lib/policy.ts` (S09), elle-
 * même miroir du Go `back/kernel/policy`. Ce module n'invente AUCUNE règle : il RÉUTILISE l'évaluateur
 * et l'anchor §93 `canPlaceOrder` VERBATIM, et il ajoute la seule chose neuve de WB2-14 :
 *   - `evalTree(rule, ctx)` — l'évaluation TRACÉE : un arbre parallèle où CHAQUE nœud porte son
 *     verdict `held` (true|false). C'est ce que React Arborist déplie (chaque nœud coloré HOLD/FAIL) ;
 *   - `arboristTree(rule, ctx?)` — la projection vers la forme `{ id, name, children }` que React
 *     Arborist consomme, content-adressée par la position dans l'arbre ("p0", "p0.0", …) → déterministe.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : un évaluateur PUR (aucune horloge, aucun aléa, aucune I/O,
 * aucun LLM) — `evalTree(r, c)` deux fois → le MÊME arbre tracé. Le miroir de reproductibilité
 * lib/v2/policy.test.ts épingle : déterminisme, la loi §93 (DENY domine — property fast-check), la
 * trace cohérente avec `holds`, la bijection slug, l'ensemble clos des scopes/règles.
 *
 * LE MUR (CLAUDE.md §2) : afficher et ÉVALUER une policy contre un contexte d'exemple n'écrit AUCUNE
 * vérité — la policy (l'AST) n'est écrite que par le CLI `aidos` via un ChangeSet approuvé. L'écran
 * AFFICHE et ÉVALUE des échantillons ; il ne PROPOSE ni n'applique aucune écriture de kernel.
 */

import {
	CAN_PLACE_ORDER,
	type CtxData,
	type Decision,
	type Effect,
	evaluate,
	holds,
	type Operand,
	type Policy,
	type PolicySample,
	RULE_KINDS,
	type Rule,
	type RuleKind,
	SAMPLES,
	SCOPES,
	type Scope,
} from "../policy";

// On RÉ-EXPORTE les types/valeurs réutilisés (S09) pour que l'écran V2 importe tout depuis un seul
// module v2 — aucune duplication, aucune nouvelle vérité.
export {
	CAN_PLACE_ORDER,
	type CtxData,
	type Decision,
	type Effect,
	evaluate,
	holds,
	type Operand,
	type Policy,
	type PolicySample,
	RULE_KINDS,
	type Rule,
	type RuleKind,
	SAMPLES,
	SCOPES,
	type Scope,
};

/**
 * Un nœud de l'ARBRE TRACÉ : la règle, son verdict `held` sous le contexte évalué, son libellé
 * humain, et ses enfants tracés. C'est la structure que l'écran déplie (chaque nœud coloré HOLD/FAIL).
 * `id` est content-adressé par la position dans l'arbre ("p0", "p0.0", "p0.1.0", …) → déterministe,
 * stable, unique (la clé React + l'id React Arborist).
 */
export interface TracedNode {
	/** L'identité content-adressée par la position dans l'arbre (déterministe, unique). */
	readonly id: string;
	/** Le type de règle (combinateur all/any/not ou feuille eq/gt/lt/exists/matches). */
	readonly kind: RuleKind;
	/** Le libellé une-ligne (le combinateur, ou la feuille « gauche op droite »). */
	readonly label: string;
	/** Le verdict de CE sous-arbre sous le contexte : la règle tient-elle (true) ou non (false) ? */
	readonly held: boolean;
	/** Les sous-arbres tracés (vide pour une feuille). */
	readonly children: readonly TracedNode[];
}

/** Le libellé humain d'un operande (sélecteur $-enraciné ou littéral). */
function operandLabel(o: Operand): string {
	return o.kind === "sel" ? o.path : JSON.stringify(o.value);
}

/** Le libellé humain d'une règle (le combinateur seul, ou la feuille complète). */
export function ruleLabel(r: Rule): string {
	switch (r.kind) {
		case "all":
			return "all (∧ — tout doit tenir)";
		case "any":
			return "any (∨ — au moins un)";
		case "not":
			return "not (¬ — l'inverse)";
		case "eq":
		case "gt":
		case "lt":
			return `${operandLabel(r.left)} ${r.kind} ${operandLabel(r.right)}`;
		case "exists":
			return `exists(${r.sel})`;
		case "matches":
			return `matches(${r.sel}, ${JSON.stringify(r.pattern)})`;
	}
}

/**
 * `evalTree` est l'ÉVALUATION TRACÉE — PURE & TOTALE & DÉTERMINISTE. Elle renvoie un arbre parallèle
 * à la règle où CHAQUE nœud porte son verdict `held` sous `ctx`. Le verdict d'un nœud RÉUTILISE
 * `holds(rule, ctx)` (S09) — donc l'arbre tracé est COHÉRENT avec l'évaluateur de vérité, jamais une
 * sémantique parallèle. L'id content-adressé par la position garantit le déterminisme (même règle +
 * même contexte → même arbre, mêmes ids, mêmes verdicts).
 */
export function evalTree(rule: Rule, ctx: CtxData): TracedNode {
	const walk = (n: Rule, id: string): TracedNode => {
		const held = holds(n, ctx);
		const label = ruleLabel(n);
		switch (n.kind) {
			case "all":
			case "any":
				return {
					id,
					kind: n.kind,
					label,
					held,
					children: n.children.map((c, i) => walk(c, `${id}.${i}`)),
				};
			case "not":
				return {
					id,
					kind: "not",
					label,
					held,
					children: [walk(n.child, `${id}.0`)],
				};
			default:
				return { id, kind: n.kind, label, held, children: [] };
		}
	};
	return walk(rule, "p0");
}

/**
 * Le nœud que React Arborist consomme : `{ id, name, children? }` — plus les métadonnées de rendu
 * que l'écran lit (kind, held). React Arborist exige `id` (string) + `children` (ou absent pour une
 * feuille). On garde `held` optionnel : un arbre SANS contexte (juste la structure) n'a pas de verdict.
 */
export interface ArboristNode {
	readonly id: string;
	readonly name: string;
	readonly kind: RuleKind;
	/** Le verdict sous le contexte évalué (absent si l'arbre est rendu sans contexte). */
	readonly held?: boolean;
	readonly children?: ArboristNode[];
}

/**
 * `arboristTree` projette une règle (optionnellement tracée par un `ctx`) vers la forêt React Arborist.
 * SANS `ctx` : la structure seule (déplier l'arbre). AVEC `ctx` : chaque nœud porte son `held`
 * (déplier ET voir l'évaluation). PURE & DÉTERMINISTE — la même entrée → la même forêt.
 */
export function arboristTree(rule: Rule, ctx?: CtxData): ArboristNode[] {
	if (ctx === undefined) {
		const walk = (n: Rule, id: string): ArboristNode => {
			const base = { id, name: ruleLabel(n), kind: n.kind };
			switch (n.kind) {
				case "all":
				case "any":
					return {
						...base,
						children: n.children.map((c, i) => walk(c, `${id}.${i}`)),
					};
				case "not":
					return { ...base, children: [walk(n.child, `${id}.0`)] };
				default:
					return base;
			}
		};
		return [walk(rule, "p0")];
	}
	const fromTraced = (t: TracedNode): ArboristNode => ({
		id: t.id,
		name: t.label,
		kind: t.kind,
		held: t.held,
		...(t.children.length > 0 ? { children: t.children.map(fromTraced) } : {}),
	});
	return [fromTraced(evalTree(rule, ctx))];
}

/**
 * Le COMPTE des nœuds par catégorie (combinateurs vs feuilles) — un résumé déterministe pour l'écran
 * (« N combinateurs, M feuilles »). PURE & TOTALE.
 */
export function nodeCounts(rule: Rule): {
	combinators: number;
	leaves: number;
	total: number;
} {
	let combinators = 0;
	let leaves = 0;
	const walk = (n: Rule): void => {
		switch (n.kind) {
			case "all":
			case "any":
				combinators++;
				for (const c of n.children) walk(c);
				return;
			case "not":
				combinators++;
				walk(n.child);
				return;
			default:
				leaves++;
		}
	};
	walk(rule);
	return { combinators, leaves, total: combinators + leaves };
}

// ── Le REGISTRE CLOS des policies (réutilise l'anchor §93 + des exemples de scopes) ──────────────

/**
 * Une seconde policy d'ancrage pour COUVRIR les autres scopes/combinateurs (any/not) sans rien
 * inventer hors du grammaire S09 : une policy DENY de scope FIELD montrant `any`+`not`+`matches`.
 * Elle bloque l'accès à un champ « secret » sauf si l'appelant est admin — exprimée VERBATIM dans la
 * grammaire close (any([ matches($.field, "^secret"), eq($.role, "guest") ]) → DENY).
 */
export const DENY_SECRET_FIELD: Policy = {
	name: "denySecretField",
	scope: "FIELD",
	target: "Order.secretNote",
	effect: "DENY",
	rule: {
		kind: "any",
		children: [
			{ kind: "matches", sel: "$.field", pattern: "^secret" },
			{
				kind: "eq",
				left: { kind: "sel", path: "$.role" },
				right: { kind: "lit", value: "guest" },
			},
		],
	},
};

/** Le registre CLOS des policies de l'écran (l'anchor §93 + un exemple FIELD/any/not). */
export const POLICIES: Record<string, Policy> = {
	canPlaceOrder: CAN_PLACE_ORDER,
	denySecretField: DENY_SECRET_FIELD,
};

/** Le slug de route d'une policy — son nom (pas de « / » dans un nom de policy, slug = nom). */
export function policySlug(name: string): string {
	return name;
}

/** Résout un slug de route vers une policy (totalité : undefined pour un slug inconnu → 404). */
export function policyBySlug(slug: string): Policy | undefined {
	return POLICIES[slug];
}

/** Les slugs de toutes les policies connues (pour la liste + generateStaticParams). */
export function policySlugs(): string[] {
	return Object.keys(POLICIES).map(policySlug);
}

/**
 * Les échantillons de contexte pour une policy donnée. Pour `canPlaceOrder` on RÉUTILISE les SAMPLES
 * S09 (les lignes-miroir de la fixture Go). Pour `denySecretField` on fournit deux contextes qui
 * montrent la loi DENY (un champ secret → DENY ; un champ ordinaire d'un user → ALLOW).
 */
export function samplesFor(name: string): readonly PolicySample[] {
	if (name === "canPlaceOrder") return SAMPLES;
	if (name === "denySecretField") {
		return [
			{
				id: "deny-secret-field",
				role: "Un champ « secret… » → DENY (la règle matches fire ; un DENY bloque, §93).",
				ctx: { field: "secretNote", role: "user" },
			},
			{
				id: "allow-ordinary-field",
				role: "Un champ ordinaire, appelant non-guest → ALLOW (aucune règle DENY ne fire).",
				ctx: { field: "label", role: "user" },
			},
		];
	}
	return [];
}

/** Le verdict d'un échantillon contre une policy nommée, comme chaîne d'affichage. */
export function decisionFor(name: string, ctx: CtxData): Decision {
	const p = policyBySlug(name);
	if (p === undefined) return "DENY";
	return evaluate(p, ctx);
}

/** Le slug d'étape canonique de WB2-14 (pour la seed de doc de l'écran). */
export const STEP_SLUG = "wb2-14-policy";
