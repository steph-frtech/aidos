"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/**
 * ADR 0080 step 2 — la SONDE HONNÊTE d'une ligne de stack. La couche IMPURE (action
 * serveur) qui matérialise la vivacité réelle d'un endpoint hôte : un GET court (curl
 * borné), `up:true` ⟺ HTTP 200. Le verdict affiché DÉRIVE de cette sonde — jamais une
 * affirmation « live » non prouvée (anti-faux-positif, §8). La PROJECTION du statut
 * (probe, sonde) → statut est PURE et testée (lib/v3/probe-status.ts).
 *
 * LE MUR (§2) : une lecture below-the-line (un GET observant la réalité), aucune
 * écriture-vérité. Bornée : seuls les endpoints HÔTE (https Traefik) sont sondés — une
 * adresse interne (nats:, redis:, http interne, doltgres:, vide) est REFUSÉE ici (elle
 * reste « déclarée » dans l'UI), jamais curlée (ni faux-positif, ni SSRF interne).
 */

export interface SondeResult {
	readonly up: boolean;
	/** L'URL effectivement sondée (echo — l'UI affiche ce qui a été prouvé). */
	readonly url: string;
}

/**
 * sondeAction — l'endpoint répond-il ? (un GET court sur l'URL résolue de la ligne).
 * REFUSE toute URL non-hôte (non https) : un service interne n'est PAS sondable depuis
 * l'hôte → `up:false` sans curl (l'UI le rend « déclaré », jamais « hors ligne »).
 */
export async function sondeAction(url: string): Promise<SondeResult> {
	// La règle ADR 0080 step 1 : seul un endpoint hôte (https Traefik) est sondable.
	if (!url.startsWith("https://")) return { up: false, url };
	try {
		const { stdout } = await execFileP(
			"curl",
			[
				"-s",
				"-k",
				"-o",
				"/dev/null",
				"-w",
				"%{http_code}",
				"--max-time",
				"4",
				url,
			],
			{ timeout: 6000 },
		);
		return { up: stdout.trim() === "200", url };
	} catch {
		return { up: false, url };
	}
}
