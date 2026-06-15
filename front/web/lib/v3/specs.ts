/**
 * V3 — le TWIN de la VUE SPÉCIFICATIONS (ADR 0062) : chaque vérité du projet
 * (idée capturée, kernel proposé) avec son STATUT CALCULÉ (idee → kernel → l'env
 * le plus haut où sa version est embarquée), projetée sur la GRILLE niveau ×
 * facette. PROJECTION PURE : les comptes sont CONSERVÉS (Σ cellules = specs),
 * le statut est calculé, jamais déclaré. Miroir : lib/v3/specs.test.ts.
 */

import type { MirrorForm } from "../besoin-completeness";
import type { BuilderState, EnvName } from "../v2/builder";

/** Une ligne de spec : la vérité + sa coordonnée + son statut de cycle de vie. */
export interface SpecRow {
	readonly id: string;
	readonly intent: string;
	readonly level: string;
	readonly facet: string;
	readonly scale: string;
	/** idee | kernel | <env> (l'env LE PLUS HAUT qui embarque sa version). */
	readonly status: "idee" | "kernel" | EnvName;
	readonly mirrorForm: MirrorForm | null;
	/** La version gelée si promue (sinon null). */
	readonly version: string | null;
}

/** Une cellule de la grille niveau × facette. */
export interface GridCell {
	readonly level: string;
	readonly facet: string;
	readonly specIds: readonly string[];
}

/** Le statut d'une version de kernel : l'env le plus haut qui l'embarque, sinon kernel. */
function statusOfVersion(
	state: BuilderState,
	version: string,
): "kernel" | EnvName {
	let status: "kernel" | EnvName = "kernel";
	for (const env of state.ladder) {
		const d = state.envs[env];
		if (d?.kernelVersions.includes(version)) status = env;
	}
	return status;
}

/** TOUTES les specs du projet, statut calculé. PURE & TOTALE & DÉTERMINISTE. */
export function specsOf(state: BuilderState): SpecRow[] {
	return state.ideas.map((idea) => {
		const kernel = state.kernels.find((k) => k.ideaId === idea.id) ?? null;
		return {
			id: idea.id,
			intent: idea.intent,
			level: idea.coordinate.level,
			facet: idea.coordinate.facet,
			scale: idea.coordinate.scale,
			status: kernel === null ? "idee" : statusOfVersion(state, kernel.version),
			mirrorForm: idea.expectedMirrorForm,
			version: kernel?.version ?? null,
		};
	});
}

/**
 * ADR 0076/0080 — LES SPECS DU SUBSTRAT GELÉ : toute app émise EMBARQUE la pile gelée
 * (ADR 0003), donc ses composants SONT des spécifications présentes DÈS LA CRÉATION du
 * projet — pas des besoins à découvrir au fil de la conversation. On les DÉCLARE (une
 * donnée close, le miroir de STACK_SERVICES côté specs) avec leur coordonnée niveau ×
 * facette et le statut `kernel` (un GELÉ : la pile est une décision figée, embarquée à
 * chaque build), version stable `stack@2026`. Résultat : un projet neuf affiche déjà sa
 * grille peuplée par le substrat, jamais « 0 / aucune spécification » (déterministe).
 */
export const STACK_SPECS: readonly SpecRow[] = (
	[
		{
			key: "app",
			level: "product",
			facet: "F",
			intent:
				"L'application déployée (le shell Hono + vues) — votre produit en ligne.",
		},
		{
			key: "api",
			level: "operation",
			facet: "F",
			intent:
				"L'API Hono : les opérations métier de l'app, servies par son backend.",
		},
		{
			key: "db",
			level: "entity",
			facet: "R",
			intent:
				"La base versionnée (Doltgres hors-prod / Postgres prod, ADR 0006) : la donnée, append-only.",
		},
		{
			key: "cache",
			level: "operation",
			facet: "B",
			intent: "Le cache Valkey : le budget de latence des lectures chaudes.",
		},
		{
			key: "workflows",
			level: "operation",
			facet: "F",
			intent:
				"Les workflows Windmill : l'orchestration des tâches asynchrones de l'app.",
		},
		{
			key: "bus",
			level: "operation",
			facet: "R",
			intent:
				"Le bus d'événements NATS : la messagerie asynchrone fiable entre composants.",
		},
		{
			key: "telemetry",
			level: "control",
			facet: "R",
			intent:
				"La télémétrie OpenTelemetry → Postgres : traces et métriques observables de l'app.",
		},
		{
			key: "auth",
			level: "control",
			facet: "S",
			intent:
				"L'authentification Better-Auth : l'accès gardé (sessions, identité).",
		},
		{
			key: "docs",
			level: "product",
			facet: "X",
			intent:
				"Les docs de l'app (Fumadocs + Scalar) : l'expérience développeur/utilisateur.",
		},
	] as const
).map((s) => ({
	id: `stack:${s.key}`,
	intent: s.intent,
	level: s.level,
	facet: s.facet,
	scale: `app/${s.key}`,
	status: "kernel" as const,
	mirrorForm: null,
	version: "stack@2026",
}));

/**
 * TOUTES les specs du projet, SUBSTRAT GELÉ COMPRIS. Le substrat (STACK_SPECS) est présent
 * dès la création — il PRÉCÈDE les specs issues de la conversation. specsOf reste inchangé
 * (son contrat — une ligne par idée — ne bouge pas, §9 anti-overwrite) ; cette projection
 * l'AUGMENTE du baseline gelé. PURE & TOTALE & DÉTERMINISTE.
 */
export function specsWithStack(state: BuilderState): SpecRow[] {
	return [...STACK_SPECS, ...specsOf(state)];
}

/** La GRILLE niveau × facette — comptes conservés, ordre stable (niveau puis facette). */
export function gridOf(rows: readonly SpecRow[]): GridCell[] {
	const cells = new Map<
		string,
		{ level: string; facet: string; ids: string[] }
	>();
	for (const r of rows) {
		const key = `${r.level}×${r.facet}`;
		const cell = cells.get(key);
		if (cell === undefined)
			cells.set(key, { level: r.level, facet: r.facet, ids: [r.id] });
		else cell.ids.push(r.id);
	}
	return [...cells.values()]
		.map((c) => ({ level: c.level, facet: c.facet, specIds: c.ids }))
		.sort((a, b) =>
			a.level !== b.level
				? a.level.localeCompare(b.level)
				: a.facet.localeCompare(b.facet),
		);
}
