/**
 * V3 — le TWIN de la VUE SPÉCIFICATIONS (ADR 0062) : chaque vérité du projet
 * (idée capturée, kernel proposé) avec son STATUT CALCULÉ (idee → kernel → l'env
 * le plus haut où sa version est embarquée), projetée sur la GRILLE niveau ×
 * facette. PROJECTION PURE : les comptes sont CONSERVÉS (Σ cellules = specs),
 * le statut est calculé, jamais déclaré. Miroir : lib/v3/specs.test.ts.
 */

import type { MirrorForm } from "../besoin-completeness";
import { type BuilderState, ENV_LADDER, type EnvName } from "../v2/builder";

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
	for (const env of ENV_LADDER) {
		const d = state.envs[env];
		if (d !== null && d.kernelVersions.includes(version)) status = env;
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
