/**
 * V3 — le CATALOGUE DES PARAMÈTRES DÉCLARÉS (ADR 0060) : le twin PUR de l'écran
 * /v3/parametrage. TOUTES les vérités déclarées de la V1 + V2 — les jeux clos, les
 * grammaires, les caps, les specs gouvernées — APLATIES en lignes lisibles : les
 * gestes du chat, l'échelle d'environnements, les niveaux de la verticale, les 8
 * facettes, les formes de preuve, les seuils, les écrans, les AGENTS avec leur
 * harness gouverné complet (modèle, droits, zones, stop conditions, réglages,
 * outils — § le mur), les modèles connus par provider, l'échelle d'autonomie
 * A0..A8, les budgets §66.3, l'échelle d'adoption §82.5, le catalogue de
 * behaviors §24.6, la surface du mur, les autorités §13.8, les familles de liens
 * §17 et les six paires-miroir.
 *
 * SEULS LES PARAMÈTRES DÉCLARÉS entrent ici (déclarés au-dessus de la ligne,
 * jamais appris — §8). Les fixtures de DÉMO (RECENT_ACTIONS, ECONOMICS_ROWS,
 * ADMISSION_ROWS…) sont des données d'exemple : EXCLUES.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : paramCatalog est PURE & TOTALE — pas
 * d'horloge, pas d'aléa, pas d'E/S ; même entrée → même catalogue (le miroir
 * lib/v3/params.test.ts l'épingle). Chaque valeur est LUE de son module déclaré,
 * jamais recopiée ; chaque ligne porte son chemin source (« lib/… »).
 *
 * LE MUR (§2) : ce module DÉCRIT les paramètres ; il n'écrit aucune vérité.
 * Modifier un réglage passe par « Proposer un changement » (la capture d'idée au
 * chat — idée → miroir → /goal), jamais un écrit direct depuis l'écran.
 */

import { grants, requires, STAGES, THE_DOOR } from "../adoption";
import type { CoucheAgent } from "../agentlayer";
import {
	KNOWN_MODELS_BY_PROVIDER,
	PROVIDERS,
	resolveHooks,
	resolveSkills,
	resolveTools,
} from "../agentlayer";
import { AGENTS } from "../agentlayer-data";
import { TRUTH_KINDS } from "../authority";
import { CHECKOUT_REGULATORY } from "../authority-data";
import { CRITICAL_CEILING, LEVELS, levelLabel } from "../autonomy";
import { type MirrorForm, mirrorForms } from "../besoin-completeness";
import { SOURCE_ORDER } from "../besoin-grammar";
import { BEHAVIOR_CATALOGUE } from "../compound";
import { CHECKOUT_BUDGET } from "../economics-data";
import { FACETS } from "../facets";
import { PAIR_KINDS } from "../v2/anatomy";
import { ENV_LADDER, INTENT_KINDS, type IntentKind } from "../v2/builder";
import { MIN_MIRROR_LEN } from "../v2/goal";
import { MIN_INTENT_LEN } from "../v2/idea";
import { kindToCanon, LINK_KINDS } from "../v2/links";
import { SCREENS } from "../v2/screens";
import { ABOVE_ZONES, BELOW_ZONES } from "../wall";

/** Une LIGNE de paramètre : le libellé, la valeur déclarée, le module source. */
export interface ParamRow {
	readonly label: string;
	readonly value: string;
	readonly source: string;
}

/** Une SECTION du catalogue : un id stable, sa clé i18n de titre, ses lignes. */
export interface ParamSection {
	readonly id: string;
	readonly titleKey: string;
	readonly rows: readonly ParamRow[];
}

/** La PHRASE CANONIQUE prouvée par intention (le jeu clos — lib/v2/builder + son miroir). */
export const CANONICAL_PHRASES: Record<IntentKind, string> = {
	capturer_idee: "capture l'idée : <besoin>",
	greffer: "greffe <libellé> sous <chemin>",
	promouvoir: "promeus la dernière idée",
	generer: "génère l'application",
	deployer: "déploie l'application en dev | staging | prod",
	delta: "montre le delta depuis la prod",
	impacter: "quel impact si je modifie <chemin>",
	interroger: "montre-moi l'état du projet",
	ouvrir: "ouvre l'écran <nom>",
	adapter: "adapte <coord> : <property>=<token>",
};

/** Le libellé déclaré par forme de preuve (la forme technique reste la valeur). */
const PROOF_LABELS: Record<MirrorForm, string> = {
	gherkin_n0: "scénario de parcours (N0)",
	screen_fixture: "fixture d'écran",
	fixture_n2: "fixture état → commande → événements (N2)",
	property_n1: "propriété ∀ (N1)",
};

/** Tronque une valeur à ~200 caractères — une ligne reste lisible, jamais un pavé. */
function clip(s: string): string {
	return s.length > 200 ? `${s.slice(0, 199)}…` : s;
}

/** « a · b · c » ou le mot déclaré pour le vide (les allow-lists vides = confinement max). */
function joined(items: readonly string[], empty: string): string {
	return items.length === 0 ? empty : items.join(" · ");
}

/** oui/non lisible pour un droit gouverné. */
function ouiNon(b: boolean): string {
	return b ? "oui" : "non";
}

/**
 * Les 8 lignes du HARNESS d'un agent gouverné (« les types d'agent avec leur
 * harness ») : modèle, rôle, droits (le mur noir sur blanc), zones, stop
 * conditions, réglages BA01, surface résolue BA05. Tout vient de la CoucheAgent.
 */
function agentRows(a: CoucheAgent): ParamRow[] {
	const s = a.spec;
	const src = "lib/agentlayer-data.ts · AGENTS";
	const tools = resolveTools(a.mcp).map((t) => `${t.server}.${t.tool}`);
	const skills = resolveSkills(a.skills);
	const hooks = resolveHooks(a.hooks)
		.filter((h) => h.mandatory)
		.map((h) => `${h.phase} ${h.hook}`);
	return [
		{
			label: `${s.id} · modèle`,
			value: clip(`${s.modele} (${s.provider})`),
			source: src,
		},
		{
			label: `${s.id} · rôle`,
			value: clip(`${s.role} — ${s.objectif}`),
			source: src,
		},
		{
			// · le mur rendu en ligne : noyau/fitness JAMAIS (pinné par le type même)
			label: `${s.id} · droits`,
			value: clip(
				`propose vérité : ${ouiNon(s.peutProposerVerite)} · modifie miroir : ${ouiNon(s.peutModifierMiroir)} · modifie noyau : NON (le mur) · modifie fitness : NON (le mur)`,
			),
			source: "lib/agentlayer.ts · AgentSpec (peutModifierNoyau = false)",
		},
		{
			label: `${s.id} · zones lecture`,
			value: clip(joined(s.zonesLecture, "aucune")),
			source: src,
		},
		{
			label: `${s.id} · zones écriture`,
			value: clip(joined(s.zonesEcriture, "aucune")),
			source: src,
		},
		{
			label: `${s.id} · stop conditions`,
			value: clip(joined(s.stopConditions, "aucune")),
			source: src,
		},
		{
			// · les KNOBS gouvernés BA01 — allow-lists vides = confinement max (fail-closed)
			label: `${s.id} · réglages`,
			value: clip(
				`température ${s.temperature} · ${s.maxTurns} tours max · hôtes réseau : ${joined(s.allowedNetworkHosts, "aucun")} · exec : ${joined(s.allowedExec, "aucun")} · concurrence ${s.maxConcurrency}`,
			),
			source: "lib/agentlayer.ts · AgentSpec (BA01, knobs gouvernés)",
		},
		{
			// · la surface RÉSOLUE BA05 — la gouvernance ne fait que rétrécir, jamais élargir
			label: `${s.id} · outils & skills`,
			value: clip(
				`MCP : ${joined(tools, "aucun")} · skills : ${joined(skills, "aucun")} · hooks obligatoires : ${joined(hooks, "aucun")}`,
			),
			source:
				"lib/agentlayer.ts · resolveTools / resolveSkills / resolveHooks (BA05)",
		},
	];
}

/**
 * paramCatalog — le catalogue ENTIER des paramètres déclarés, PUR & TOTAL &
 * DÉTERMINISTE. `extra.screensCount` (le compte d'écrans de la session, une
 * donnée d'entrée) ajoute SA ligne ; sans lui, seul le registre V2 figure.
 */
export function paramCatalog(extra?: {
	screensCount?: number;
}): readonly ParamSection[] {
	const screensRows: ParamRow[] = [];
	if (extra?.screensCount !== undefined) {
		screensRows.push({
			label: "écrans atteignables (session)",
			value: clip(String(extra.screensCount)),
			source: "lib/v2/builder.ts · BuilderState.screens",
		});
	}
	screensRows.push({
		label: "écrans V2 (registre)",
		value: clip(String(SCREENS.length)),
		source: "lib/v2/screens.ts · SCREENS",
	});

	return [
		{
			// ── le jeu CLOS des intentions du chat + la phrase canonique prouvée ──
			id: "chat",
			titleKey: "paramsGestures",
			rows: INTENT_KINDS.map((k) => ({
				label: k,
				value: clip(CANONICAL_PHRASES[k]),
				source: "lib/v2/builder.ts · INTENT_KINDS",
			})),
		},
		{
			// ── l'échelle d'environnements, déclarée, close, ordonnée (le cliquet) ──
			id: "environnements",
			titleKey: "paramsLadder",
			rows: ENV_LADDER.map((env, i) => ({
				label: `barreau ${i + 1}`,
				value: clip(env),
				source: "lib/v2/builder.ts · ENV_LADDER",
			})),
		},
		{
			// ── les 7 barreaux SOURCE de la verticale (§23) ──
			id: "niveaux",
			titleKey: "paramsLevels",
			rows: SOURCE_ORDER.map((l, i) => ({
				label: `niveau ${i + 1}`,
				value: clip(l),
				source: "lib/besoin-grammar.ts · SOURCE_ORDER",
			})),
		},
		{
			// ── les 8 lentilles canoniques F→X ──
			id: "facettes",
			titleKey: "paramsFacets",
			rows: FACETS.map((f) => ({
				label: f.letter,
				value: clip(f.soft ? `${f.name} (lentille douce)` : f.name),
				source: "lib/facets.ts · FACETS",
			})),
		},
		{
			// ── les formes de preuve du jeu clos ──
			id: "preuves",
			titleKey: "paramsProofs",
			rows: mirrorForms().map((f) => ({
				label: PROOF_LABELS[f],
				value: clip(f),
				source: "lib/besoin-completeness.ts · mirrorForms()",
			})),
		},
		{
			// ── les seuils déclarés ──
			id: "seuils",
			titleKey: "paramsThresholds",
			rows: [
				{
					label: "longueur minimale d'une intention",
					value: clip(`${MIN_INTENT_LEN} caractères`),
					source: "lib/v2/idea.ts · MIN_INTENT_LEN",
				},
				{
					label: "longueur minimale d'un miroir",
					value: clip(`${MIN_MIRROR_LEN} caractères`),
					source: "lib/v2/goal.ts · MIN_MIRROR_LEN",
				},
			],
		},
		{
			// ── les écrans : la session (si fournie) + le registre V2 ──
			id: "ecrans",
			titleKey: "paramsScreens",
			rows: screensRows,
		},
		{
			// ── LES TYPES D'AGENT AVEC LEUR HARNESS — la spec gouvernée entière ──
			id: "agents",
			titleKey: "paramsAgents",
			rows: AGENTS.flatMap(agentRows),
		},
		{
			// ── le jeu CLOS de modèles par provider — pinné, jamais découvert ──
			id: "modeles",
			titleKey: "paramsModels",
			rows: PROVIDERS.map((p) => ({
				label: p,
				value: clip(KNOWN_MODELS_BY_PROVIDER[p].join(" · ")),
				source: "lib/agentlayer.ts · KNOWN_MODELS_BY_PROVIDER",
			})),
		},
		{
			// ── l'échelle d'autonomie A0..A8 + le plafond critique (A8 jamais sur critique) ──
			id: "autonomie",
			titleKey: "paramsAutonomy",
			rows: [
				...LEVELS.map((l) => ({
					label: levelLabel(l),
					value: clip(`échelon ${l} / 8 de l'échelle d'autonomie`),
					source: "lib/autonomy.ts · LEVELS",
				})),
				{
					label: "plafond critique",
					value: clip(
						`${levelLabel(CRITICAL_CEILING)} — jamais A8 sur une action critique`,
					),
					source: "lib/autonomy.ts · CRITICAL_CEILING",
				},
			],
		},
		{
			// ── le HarnessCostBudget déclaré (§66.3) — les CAPS, jamais les rows de démo ──
			id: "budgets",
			titleKey: "paramsBudgets",
			rows: [
				{
					label: `CI par goal (${CHECKOUT_BUDGET.cellRef})`,
					value: clip(`≤ ${CHECKOUT_BUDGET.maxCiMinutes} min`),
					source: "lib/economics-data.ts · CHECKOUT_BUDGET",
				},
				{
					label: "tokens LLM par goal",
					value: clip(`≤ ${CHECKOUT_BUDGET.maxLlmTokensPerGoal} tokens`),
					source: "lib/economics-data.ts · CHECKOUT_BUDGET",
				},
				{
					label: "run de mutation",
					value: clip(`≤ ${CHECKOUT_BUDGET.maxMutationRuntimeSeconds} s`),
					source: "lib/economics-data.ts · CHECKOUT_BUDGET",
				},
				{
					label: "revue humaine",
					value: clip(`≤ ${CHECKOUT_BUDGET.maxHumanReviewMinutes} min`),
					source: "lib/economics-data.ts · CHECKOUT_BUDGET",
				},
				{
					label: "réduction de risque attendue",
					value: clip(CHECKOUT_BUDGET.expectedRiskReduction),
					source: "lib/economics-data.ts · CHECKOUT_BUDGET",
				},
			],
		},
		{
			// ── l'échelle d'adoption §82.5 (T0..T4) + la porte unique ──
			id: "adoption",
			titleKey: "paramsAdoption",
			rows: [
				...STAGES.map((stage) => ({
					label: stage,
					value: clip(
						`requiert : ${joined(requires(stage), "—")} · accorde : ${joined(grants(stage), "—")}`,
					),
					source: "lib/adoption.ts · STAGES",
				})),
				{
					label: "la porte",
					value: clip(THE_DOOR),
					source: "lib/adoption.ts · THE_DOOR",
				},
			],
		},
		{
			// ── le catalogue fermé des behaviors (§24.6) ──
			id: "behaviors",
			titleKey: "paramsBehaviors",
			rows: [
				{
					label: "catalogue fermé (§24.6)",
					value: clip(BEHAVIOR_CATALOGUE.join(" · ")),
					source: "lib/compound.ts · BEHAVIOR_CATALOGUE",
				},
			],
		},
		{
			// ── la surface DÉCLARÉE du mur — au-dessus gelé, sous la ligne libre ──
			id: "mur",
			titleKey: "paramsWallZones",
			rows: [
				{
					label: "au-dessus de la ligne (gelé — l'agent n'écrit jamais)",
					value: clip(ABOVE_ZONES.map((z) => z.name).join(" · ")),
					source: "lib/wall.ts · ABOVE_ZONES",
				},
				{
					label: "sous la ligne (projection — libre)",
					value: clip(BELOW_ZONES.map((z) => z.name).join(" · ")),
					source: "lib/wall.ts · BELOW_ZONES",
				},
			],
		},
		{
			// ── les autorités : les 7 sortes de vérité + le graphe §13.8 verbatim ──
			id: "autorites",
			titleKey: "paramsAuthorities",
			rows: [
				{
					label: "sortes de vérité (§13.4)",
					value: clip(TRUTH_KINDS.join(" · ")),
					source: "lib/authority.ts · TRUTH_KINDS",
				},
				{
					label: `approbateurs (${CHECKOUT_REGULATORY.domain} · ${CHECKOUT_REGULATORY.truthKind})`,
					value: clip(joined(CHECKOUT_REGULATORY.approvers, "aucun")),
					source: "lib/authority-data.ts · CHECKOUT_REGULATORY",
				},
				{
					label: "veto",
					value: clip(joined(CHECKOUT_REGULATORY.veto, "aucun")),
					source: "lib/authority-data.ts · CHECKOUT_REGULATORY",
				},
				{
					label: "escalade",
					value: clip(joined(CHECKOUT_REGULATORY.escalation, "aucune")),
					source: "lib/authority-data.ts · CHECKOUT_REGULATORY",
				},
			],
		},
		{
			// ── les 6 familles de liens (§17/§41) + leur mapping canonique S17 ──
			id: "liens",
			titleKey: "paramsLinks",
			rows: LINK_KINDS.map((k) => ({
				label: k,
				value: clip(`canonique S17 : ${kindToCanon(k).join(" · ")}`),
				source: "lib/v2/links.ts · LINK_KINDS",
			})),
		},
		{
			// ── les 6 paires-miroir, dans l'ordre canonique (jeu clos) ──
			id: "anatomie",
			titleKey: "paramsAnatomy",
			rows: PAIR_KINDS.map((p, i) => ({
				label: `paire ${i + 1}`,
				value: clip(p),
				source: "lib/v2/anatomy.ts · PAIR_KINDS",
			})),
		},
	];
}
