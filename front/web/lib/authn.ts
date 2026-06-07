/**
 * authn.ts — the deterministic TS twin of back/runtime/authn (S61).
 *
 * S61 is OAuth/OIDC + sessions (Auth.js front, JWT verified by the gateway) + the
 * `accounts.users` account model (id, email, identity_provider) + a two-layer enforced
 * identity. Authentication is NEVER gateway-only: ONE resolved identity propagates to (a)
 * the gateway scope check (lib/projectWall) AND (b) the Postgres RLS GUC app.identity
 * (S55). The two layers redden INDEPENDENTLY.
 *
 * This module mirrors the Go authn core BYTE-FOR-BYTE:
 *  - the UNAUTHENTICATED code is "UNAUTHENTICATED" (the property done-criterion's refusal);
 *  - authenticate(principal, disposition) refuses an anonymous caller for EVERY
 *    disposition (truth_write OR below_line) — there is no anonymous door, and the refusal
 *    is upstream of routing (reaches no data);
 *  - a resolved principal authenticates and carries the SAME identity to both walls.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure, same input → same output (pinned by the
 * Vitest+fast-check twin lib/authn.test.ts). The Go package is authoritative; this twin
 * must match it. THE WALL: nothing here writes truth — auth lives outside the Kernel.
 */

/** The OIDC issuer that vouched for a user (accounts.users.identity_provider). */
export type IdentityProvider = string;

/** The UNAUTHENTICATED block code — byte-identical to Go authn.CodeUnauthenticated. */
export const CODE_UNAUTHENTICATED = "UNAUTHENTICATED" as const;

/** Tool dispositions the auth gate guards — byte-identical to Go authn.Disposition. */
export type Disposition = "below_line" | "truth_write";

export type AuthOutcome = "authenticated" | "unauthenticated";

export interface AuthBlockReason {
	code: typeof CODE_UNAUTHENTICATED;
	severity: "error";
	explanation: string;
	howToFix: string[];
}

/** A RESOLVED, VERIFIED caller — the output of a successful session/JWT verification. */
export interface Principal {
	/** The stable subject id (accounts.users.id) both walls key on — one value, two layers. */
	identity: string;
	/** The verified email claim. */
	email: string;
	/** The OIDC issuer. */
	provider: IdentityProvider;
}

export interface AuthDecision {
	outcome: AuthOutcome;
	principal?: Principal;
	blockReason?: AuthBlockReason;
}

/** isAnonymous mirrors Go Principal.IsAnonymous — an empty subject ⇒ no caller. */
export function isAnonymous(p: Principal): boolean {
	return p.identity.trim() === "";
}

function unauthenticatedReason(): AuthBlockReason {
	return {
		code: CODE_UNAUTHENTICATED,
		severity: "error",
		explanation:
			"Refus de l'authentification : l'appel ne porte aucune session valide (OAuth/OIDC) " +
			"ni JWT vérifié. AIDOS n'a pas de porte anonyme : l'identité est résolue AVANT le routage et " +
			"propagée aux DEUX murs (passerelle + RLS Postgres) — un appel non authentifié n'atteint AUCUNE " +
			"donnée projet (CLAUDE.md §2, ROADMAP S61).",
		howToFix: [
			"Connectez-vous via le fournisseur OAuth/OIDC (Auth.js côté Workbench) pour ouvrir une session.",
			"La passerelle vérifie le JWT à chaque appel ; un jeton absent ou invalide est refusé UNAUTHENTICATED.",
			"L'authentification n'est jamais gateway-only : la même identité descend jusqu'à la RLS Postgres (S55).",
		],
	};
}

/**
 * authenticate mirrors Go authn.Authenticate exactly. Pure and total. An anonymous
 * principal is refused with UNAUTHENTICATED for EVERY disposition, upstream of routing
 * (reaches no data — the property done-criterion). A resolved principal is returned for
 * the scope/zone walls to continue.
 */
export function authenticate(
	p: Principal,
	_disposition: Disposition,
): AuthDecision {
	if (isAnonymous(p)) {
		return {
			outcome: "unauthenticated",
			blockReason: unauthenticatedReason(),
		};
	}
	return { outcome: "authenticated", principal: { ...p } };
}

/**
 * gucs mirrors Go Principal.GUCs — the app.identity GUC the RLS keys on (layer 2). An
 * anonymous principal yields an empty identity (the RLS then sees zero rows — the second,
 * independent layer). The active project GUC (app.project) is owned by S57, not here.
 */
export function gucs(p: Principal): { identity: string } {
	return { identity: isAnonymous(p) ? "" : p.identity.trim() };
}

/**
 * The OIDC providers the Workbench offers at login. Closed, declared set — the panel
 * renders one button per provider (Auth.js wires the real OIDC flow). NOT coined ad-hoc:
 * the providers a deployment enables come from config; this is the demo's default pair.
 */
export const AUTH_PROVIDERS: readonly {
	id: IdentityProvider;
	label: string;
}[] = [
	{ id: "github", label: "GitHub" },
	{ id: "google", label: "Google" },
];
