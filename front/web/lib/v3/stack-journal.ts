/**
 * V3 — le TWIN du JOURNAL DE STACK (ADR 0063) : « si on déploie en dev, les tickets
 * dev se créent et se résolvent, comme la doc, etc. »
 *
 * Les effets de stack ne sont JAMAIS saisis : ils sont DÉRIVÉS des événements du
 * réducteur (une projection PURE du log, dans l'ordre du log — append-only par
 * construction). La table de dérivation est DÉCLARÉE :
 *   - idee_capturee   → docs : une page de concept ÉBAUCHÉE ;
 *   - kernel_propose  → tickets : un ticket de SPEC ouvert (Plane) ;
 *   - deploiement(e)  → tickets : ticket de déploiement CRÉÉ puis RÉSOLU ·
 *                       docs : la page de version PUBLIÉE (Fumadocs) ·
 *                       db : un POINT DE RESTAURATION posé (Doltgres hors prod —
 *                       le git-for-data : revenir = changer de branche) ·
 *                       telemetry : la trace de déploiement ATTENDUE (OTel).
 * Le branchement RÉEL (Plane/Fumadocs/Doltgres/SigNoz par projet/env) = la piste DP ;
 * ce twin déclare la LOI des effets — l'UI la montre, le provisioning l'exécutera.
 */

import type { BuilderState } from "../v2/builder";

export interface StackJournalEntry {
	/** L'environnement concerné ("" pour les effets hors-env : capture/spec). */
	readonly env: string;
	readonly service: "tickets" | "docs" | "db" | "telemetry";
	readonly action:
		| "ebauche"
		| "spec"
		| "cree"
		| "resolu"
		| "publie"
		| "point_de_restauration"
		| "trace_attendue";
	readonly detail: string;
	/** La référence content-adressée (version d'app, id d'idée, version de kernel). */
	readonly ref: string;
}

/** DÉRIVE le journal de stack du log — PURE & TOTALE & APPEND-ONLY (suit le log). */
export function stackJournalOf(state: BuilderState): StackJournalEntry[] {
	const out: StackJournalEntry[] = [];
	for (const e of state.log) {
		switch (e.kind) {
			case "idee_capturee":
				out.push({
					env: "",
					service: "docs",
					action: "ebauche",
					detail: "page de concept ébauchée (Fumadocs)",
					ref: e.ref,
				});
				break;
			case "kernel_propose":
				out.push({
					env: "",
					service: "tickets",
					action: "spec",
					detail: "ticket de spec ouvert (Plane)",
					ref: e.ref,
				});
				break;
			case "deploiement": {
				const env = e.env ?? "";
				out.push(
					{
						env,
						service: "tickets",
						action: "cree",
						detail: `ticket de déploiement ${env} créé (Plane)`,
						ref: e.ref,
					},
					{
						env,
						service: "tickets",
						action: "resolu",
						detail: `ticket de déploiement ${env} résolu (Plane)`,
						ref: e.ref,
					},
					{
						env,
						service: "docs",
						action: "publie",
						detail: `page de version publiée (Fumadocs)`,
						ref: e.ref,
					},
					{
						env,
						service: "db",
						action: "point_de_restauration",
						detail:
							env === "prod"
								? "sauvegarde Postgres planifiée (prod)"
								: "point de restauration Doltgres posé (rollback = changer de branche)",
						ref: e.ref,
					},
					{
						env,
						service: "telemetry",
						action: "trace_attendue",
						detail: "trace de déploiement attendue (OTel → SigNoz)",
						ref: e.ref,
					},
				);
				break;
			}
			default:
				break;
		}
	}
	return out;
}
