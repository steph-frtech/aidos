/**
 * V3 — ADR 0080 step 2 : la PROJECTION HONNÊTE du statut d'une ligne de stack.
 *
 * Le drapeau `probe` (ADR 0080 step 1) dit si la ligne porte un endpoint SONDABLE
 * depuis l'hôte (https Traefik) ou un service INTERNE au réseau docker. Ce module PUR
 * traduit (probe, résultat-de-sonde) en un statut affichable — et JAMAIS il n'affirme
 * « en ligne » ce qui n'est pas sondable depuis l'hôte (anti-faux-positif, §8) :
 *   - probe=false                 → "declared" (badge « déclaré » : adresse interne)
 *   - probe=true, sonde absente   → "probing"  (la sonde n'a pas encore répondu)
 *   - probe=true, sonde up=true   → "up"       (« en ligne » — la seule affirmation prouvée)
 *   - probe=true, sonde up=false  → "down"     (« hors ligne »)
 *
 * La règle de sondabilité est CELLE de step 1 (instance.ts `hostProbeable`) : une URL
 * est sondable ⟺ elle est un endpoint hôte (https Traefik). On la dérive ICI de l'URL
 * résolue, sans dépendre d'un champ `.probe` éventuellement absent du twin courant —
 * mais si l'entrée le porte (step 1 mergé), il est honoré tel quel. Déterministe & totale
 * (miroir : probe-status.test.ts).
 */

export type ProbeStatus = "declared" | "probing" | "up" | "down";

/** Le retour borné de la sonde HTTP d'UNE ligne (l'action sondeAction). */
export interface ProbeResult {
	readonly up: boolean;
}

/**
 * Une ligne de stack vue PAR CE MODULE : son URL résolue, et — si le twin le porte
 * déjà (step 1) — son drapeau `probe`. Le champ est optionnel pour rester compatible
 * avec un EnvStackEntry qui ne l'expose pas encore (le drapeau est alors dérivé de l'URL).
 */
export interface ProbeableEntry {
	readonly url: string;
	readonly probe?: boolean;
}

/**
 * UNE ligne est-elle SONDABLE depuis l'hôte ? La règle exacte d'ADR 0080 step 1 :
 * un endpoint hôte (https Traefik) l'est ; un service interne au réseau docker
 * (nats:, redis:, http://…interne, doltgres://, vide) NE l'est PAS. Si l'entrée porte
 * son propre drapeau (step 1 mergé), on l'honore ; sinon on le dérive de l'URL. PURE.
 */
export function isProbeable(entry: ProbeableEntry): boolean {
	if (entry.probe !== undefined) return entry.probe;
	return entry.url.startsWith("https://");
}

/**
 * Le statut HONNÊTE d'une ligne de stack — PUR : (probe, sonde) → statut.
 * Un service non sondable est TOUJOURS "declared" quel que soit le bruit reçu :
 * on ne fabrique jamais un « live » depuis l'hôte sur une adresse interne.
 */
export function probeStatusOf(
	probe: boolean,
	result: ProbeResult | undefined,
): ProbeStatus {
	if (!probe) return "declared";
	if (result === undefined) return "probing";
	return result.up ? "up" : "down";
}

/** La clé i18n du libellé de statut (jeu DÉCLARÉ et clos — jamais deviné). */
export function probeStatusLabelKey(status: ProbeStatus): string {
	switch (status) {
		case "declared":
			return "stackDeclared";
		case "up":
			return "stackProbeUp";
		case "down":
			return "stackProbeDown";
		case "probing":
			return "stackProbing";
	}
}

/** Le data-testid déclaré d'un statut (pour l'e2e). */
export function probeStatusTestId(status: ProbeStatus): string {
	return `v3-stack-status-${status}`;
}
