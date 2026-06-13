/**
 * preview-bootstrap.ts — le JUMEAU TS PUR de l'EXTENSION DP25 du planificateur de
 * preview éphémère `back/runtime/preview` (EPIC F ouvre, ÉTEND S94, ne le duplique pas).
 *
 * S94 (le jumeau lib/preview.ts) calcule déjà le PreviewPlan déterministe (EmittedAppHash,
 * URL keyée sur la phase, boot/teardown `pulumi`). DP25 AJOUTE — additivement — une section
 * d'AMORÇAGE filtrée par PROFILE (DP11) puis ordonnée (DP12) :
 *
 *   - le PROFILE (DP11, composeemit.filterByProfile) sélectionne les SERVICES amorcés —
 *     `core` par défaut, `full` pour un preview complet ; un profile hors de l'ensemble clos
 *     est REFUSÉ (UNKNOWN_PROFILE), jamais coercé ;
 *   - la SÉQUENCE d'amorçage (DP12, bootstrap.emitBootstrapSequence) est rendue sur le
 *     manifest FILTRÉ — déterministe, content-adressée par son sequenceHash ;
 *   - le DÉMONTAGE (teardownOf) dérive PUREMENT du plan : les services s'effondrent en ordre
 *     de boot INVERSE (full démonte un sur-ensemble d'un profile resserré).
 *
 * L'INVARIANT CAPITAL (le done-criterion DP25). Le profile change les SERVICES amorcés,
 * JAMAIS l'EmittedAppHash de la phase — l'app-hash est une fonction pure de (phase ⊕ surface),
 * indépendante du profile. Le miroir lib/preview-bootstrap.test.ts épingle ∀ profiles : même
 * phase → même EmittedAppHash ; servedMatchesEmitted tient pour chaque profile ; l'URL/le
 * subdomain/le stack restent profile-indépendants.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8). buildPreviewWithBootstrap est une fonction PURE de son
 * input — pas d'horloge, pas d'aléa, pas d'E/S, pas de LLM. Même (phase, surface, profile,
 * manifest, hôte, secrets) → PreviewPlan byte-identique (même id, même séquence, même teardown).
 * Le moteur Go (back/runtime/preview, DP25) est AUTORITAIRE ; ce jumeau reproduit sa logique
 * décisionnelle pour que l'écran /deploy rende le plan étendu sans aller-retour backend.
 *
 * RÉUTILISE, NE DUPLIQUE PAS : il réexporte la base S94 (lib/preview) et compose les jumeaux
 * DP11 (lib/stack-emit.filterByProfile) + DP12 (lib/bootstrap.emitBootstrapSequence). La
 * sémantique DP11 est honnête : une sélection `core` garde TOUS les services (serviceProfiles
 * ajoute core à chacun) — `core` ≡ `full` en nombre de services ; le profile qui resserre
 * vraiment est un profile spécifique qu'aucun service optionnel ne déclare (le miroir contraste
 * `git` vs `full`).
 *
 * LE MUR (CLAUDE.md §2) : le déclencheur de preview est BELOW-THE-LINE — il PLANIFIE, il
 * n'écrit AUCUNE vérité. La docker réelle reste GATÉE (le miroir prouve le PLAN + le hash ; le
 * serveur web-preview existant sert l'app, ADR 0040 — pas de docker réelle ici).
 */

import {
	type StackManifest as BootstrapManifest,
	type BootstrapSequence,
	emitBootstrapSequence,
	type HostState,
	type SecretsState,
	sequenceHash,
} from "./bootstrap";
import {
	type PreviewInput as BasePreviewInput,
	type PreviewPlan as BasePreviewPlan,
	type BlockReason,
	buildPlan as buildBasePlan,
	type EmittedSurface,
	isBlocked,
} from "./preview";
import { filterByProfile, isProfileBlock } from "./stack-emit";
import {
	isKnownProfile,
	type Profile,
	type StackManifest,
} from "./stack-manifest";

// Re-export the S94 base surface so the panel imports one module (the twin keeps the
// authoritative shapes verbatim — never a forked copy).
export {
	type BlockReason,
	type EmittedSurface,
	emittedAppHash,
	isBlocked,
	type PhaseRef,
	servedMatchesEmitted,
} from "./preview";
export {
	isKnownProfile,
	PROFILES,
	type Profile,
	type StackManifest,
} from "./stack-manifest";

/**
 * DEFAULT_PROFILE — le profile DP11 qu'un preview amorce quand aucun n'est sélectionné :
 * `core` (la baseline toujours active). `full` est sélectionné pour un preview complet
 * (le jumeau de Go preview.DefaultProfile).
 */
export const DEFAULT_PROFILE: Profile = "core";

/**
 * DEFAULT_PREVIEW_ENV — l'environnement cible d'un preview quand aucun n'est fourni : un
 * preview est un environnement NON-PROD éphémère (`dev`), donc le gate DP11 Doltgres-en-prod
 * ne mord jamais par défaut (le jumeau de Go preview.DefaultPreviewEnv).
 */
export const DEFAULT_PREVIEW_ENV = "dev";

/**
 * PreviewBootstrap — l'amorçage DP25 filtré par profile : le profile DP11, la séquence DP12
 * ordonnée sur les services filtrés, l'adresse content de cette séquence (l'adresse
 * dépendante-du-profile : core vs full diffèrent ici, mais l'EmittedAppHash non), et les NOMS
 * des services que le profile a gardés (triés, déterministe). PUR : aucune valeur de secret,
 * aucun endpoint résolu — seulement des NOMS et des réfs ${VAR} (la discipline DP12).
 */
export interface PreviewBootstrap {
	profile: Profile;
	sequence: BootstrapSequence;
	/** l'adresse content de la séquence (dépendante du profile : core vs full diffèrent). */
	sequenceHash: string;
	/** les NOMS des services que le profile a gardés (triés, déterministe). */
	services: string[];
}

/**
 * PreviewPlanWithBootstrap — le PreviewPlan S94 ENRICHI de la section DP25 (additif). Quand
 * aucun manifest n'est fourni, bootstrap est `undefined` (la forme S94 exacte) et l'id est
 * inchangé ; fournir un manifest opte-in à l'amorçage filtré par profile, SANS jamais altérer
 * l'EmittedAppHash/l'URL/le stack (l'invariant capital).
 */
export interface PreviewPlanWithBootstrap extends BasePreviewPlan {
	/** le profile DP11 dont l'amorçage a été filtré (présent ssi un manifest a été fourni). */
	profile?: Profile;
	/** l'amorçage DP11-filtré DP12 (undefined pour un plan S94 sans manifest). */
	bootstrap?: PreviewBootstrap;
}

/**
 * PreviewInputWithBootstrap — l'input S94 + la section OPTIONNELLE d'amorçage (profile +
 * manifest + hôte + secrets + env). Quand manifest est absent, l'input est exactement la
 * forme S94 (aucun amorçage calculé, le plan ne porte ni profile ni bootstrap).
 */
export interface PreviewInputWithBootstrap extends BasePreviewInput {
	/** le profile DP11 sélectionné (typé string : un profile hors-ensemble est REFUSÉ
	 * UNKNOWN_PROFILE par filterByProfile, jamais coercé). Défaut DEFAULT_PROFILE. Ignoré sans manifest. */
	profile?: string;
	/** le StackManifest DP02 dont les services sont amorcés. Absent ⇒ le plan S94 (pas d'amorçage). */
	manifest?: StackManifest;
	/** l'instantané hôte AS DATA (motif DP12) que le résolveur de ports lit. */
	host?: HostState;
	/** l'ensemble des NOMS de variables-secret présentes au boot (DP12). */
	secrets?: SecretsState;
	/** l'environnement cible — UNIQUEMENT pour le gate DP11 Doltgres-en-prod. Défaut dev. */
	env?: string;
}

/**
 * profileOf — résout le profile DP11 du preview : le Input.profile déclaré, ou DEFAULT_PROFILE
 * (`core`) quand vide. La membership de l'ensemble clos est appliquée en aval par
 * filterByProfile (UNKNOWN_PROFILE) — profileOf ne coerce jamais une valeur hors-ensemble.
 */
function profileOf(input: PreviewInputWithBootstrap): string {
	return input.profile && input.profile !== ""
		? input.profile
		: DEFAULT_PROFILE;
}

/**
 * toBootstrapManifest — adapte le StackManifest DP02 (le jumeau stack-manifest, snake_case)
 * vers la forme attendue par l'émetteur de bootstrap DP12 (le jumeau bootstrap, camelCase).
 * PUR : une projection nom-à-nom déterministe, jamais une devinette.
 */
function toBootstrapManifest(m: StackManifest): BootstrapManifest {
	return {
		app: m.app,
		services: m.services.map((s) => ({
			name: s.name,
			// the bootstrap twin's Role set is a SUBSET of the manifest's closed set; a role it
			// does not know lands on the same NAME and the bootstrap validator surfaces it.
			role: s.role as BootstrapManifest["services"][number]["role"],
			image: s.image,
			internalPort: s.internal_port,
		})),
		volumes: m.volumes?.map((v) => ({ name: v.name, deviceVar: v.device_var })),
		network: m.network,
		connectorScopes: m.connector_scopes,
	};
}

/** serviceNames — les NOMS des services gardés, en ordre canonique (trié) — déterministe. */
function serviceNames(m: StackManifest): string[] {
	return m.services.map((s) => s.name).sort();
}

/**
 * buildBootstrap — calcule l'amorçage DP25 filtré par profile, RÉUTILISANT DP11 + DP12
 * verbatim (jamais une règle forkée) :
 *
 *  1. le manifest doit appartenir au MÊME projet que la surface (preview par-app, S94) ;
 *  2. DP11 filterByProfile resserre les services du manifest au profile sélectionné
 *     (UNKNOWN_PROFILE / DOLTGRES_NOT_ALLOWED_IN_PROD surfacés verbatim) ;
 *  3. DP12 emitBootstrapSequence rend l'amorçage déterministe ordonné sur le manifest FILTRÉ
 *     (MISSING_SECRET_AT_BOOT / manifest-invalide surfacés verbatim).
 *
 * PUR : même (manifest, profile, hôte, secrets, env) → PreviewBootstrap byte-identique. Il ne
 * lance aucune docker réelle — les events sont un plan-as-data déterministe.
 */
function buildBootstrap(
	input: PreviewInputWithBootstrap,
): PreviewBootstrap | BlockReason {
	const manifest = input.manifest as StackManifest;

	// (1) per-app : le manifest doit matcher le projet de la surface.
	if (manifest.app !== input.surface.project) {
		return {
			code: "OUT_OF_SCOPE",
			severity: "blocking",
			explanation: `Preview refused: manifest app "${manifest.app}" does not match the surface project "${input.surface.project}" (a preview is per-app, S94)`,
			how_to_fix: [
				"Provide a StackManifest whose app equals the surface project.",
				"Re-emit the manifest for this app before previewing.",
			],
		};
	}

	const profile = profileOf(input);
	const env = input.env && input.env !== "" ? input.env : DEFAULT_PREVIEW_ENV;

	// (2) DP11 — filtre les services du manifest par le profile (closed-set + gate prod).
	const filtered = filterByProfile(manifest, profile, env);
	if (isProfileBlock(filtered)) {
		return {
			code: filtered.block.code,
			severity: "blocking",
			explanation: filtered.block.message,
			how_to_fix: [
				"Pick a profile inside the closed SPEC-stack-2026 set (core/full/…) — a selection is declared, never inferred (DP11).",
				"A non-prod (Doltgres) profile is refused in prod (ADR 0065) — preview a non-prod environment.",
			],
		};
	}

	// (3) DP12 — rend la séquence d'amorçage déterministe sur le manifest FILTRÉ.
	const result = emitBootstrapSequence(
		toBootstrapManifest(filtered),
		input.host ?? { ssOutput: "", dockerPsOutput: "" },
		input.secrets ?? { present: [] },
	);
	if (result.block) {
		return {
			code: result.block.code,
			severity: "blocking",
			explanation: result.block.explanation,
			how_to_fix: result.block.howToFix,
		};
	}
	const sequence = result.sequence as BootstrapSequence;

	return {
		profile: profile as Profile,
		sequence,
		sequenceHash: sequenceHash(sequence),
		services: serviceNames(filtered),
	};
}

/**
 * FNV-1a digest (le jumeau de lib/preview.digest — l'adresse content d'affichage ; le Go
 * records.Hash reste autoritaire). Même octets → même digest, pas d'horloge/aléa.
 */
function digest(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/**
 * buildPreviewWithBootstrap — le PreviewPlan S94 ÉTENDU de la section DP25. PUR : il calcule
 * d'abord le plan S94 de base (buildPlan), puis — UNIQUEMENT quand un manifest est fourni —
 * ajoute l'amorçage filtré par profile et REPLIE le profile + le sequenceHash dans l'id du
 * plan (donc core vs full donnent des ids DISTINCTS, mais le MÊME EmittedAppHash/URL/stack).
 * Sans manifest, le plan est byte-identique au plan S94 (anti-overwrite §9). Écrit rien (mur).
 */
export function buildPreviewWithBootstrap(
	input: PreviewInputWithBootstrap,
): PreviewPlanWithBootstrap | BlockReason {
	const base = buildBasePlan(input);
	if (isBlocked(base)) return base;

	// Sans manifest : la forme S94 exacte (pas de profile, pas de bootstrap, id inchangé).
	if (!input.manifest) {
		return base;
	}

	const bs = buildBootstrap(input);
	if (isBlocked(bs)) return bs;

	// Replie le profile + le sequenceHash dans l'id (core vs full ⇒ ids distincts ; même
	// (phase, profile) ⇒ id byte-identique). L'EmittedAppHash/URL/stack restent inchangés.
	const id = digest(
		JSON.stringify({
			base_id: base.id,
			bootstrap_hash: bs.sequenceHash,
			profile: bs.profile,
		}),
	);

	return {
		...base,
		id,
		profile: bs.profile,
		bootstrap: bs,
	};
}

/**
 * TeardownPlan — le DÉMONTAGE DÉTERMINISTE DP25 d'un preview, dérivé PUREMENT d'un plan : le
 * stack à retirer, la séquence `pulumi destroy` + `stack rm`, et les services d'amorçage à
 * démonter en ordre de boot INVERSE (full effondre un sur-ensemble d'un core). Même plan →
 * TeardownPlan byte-identique.
 */
export interface TeardownPlan {
	stackName: string;
	/** la séquence de teardown (== plan.teardown : `pulumi destroy` + `pulumi stack rm`). */
	commands: string[];
	/** les services d'amorçage à démonter, en ordre de boot INVERSE (vide pour un plan S94). */
	services: string[];
}

/**
 * teardownOf — dérive le démontage déterministe d'un plan construit — une fonction PURE du
 * plan (pas d'horloge, pas d'aléa, pas d'E/S). Le preview est DÉMONTÉ DÉTERMINISTIQUEMENT
 * (S94, étendu DP25) : même plan → même teardown ; les services d'amorçage s'effondrent en
 * ordre de boot inverse, donc un preview full démonte plus de services qu'un core (le
 * démontage est l'inverse exact de l'amorçage).
 */
export function teardownOf(plan: PreviewPlanWithBootstrap): TeardownPlan {
	const commands = [...plan.teardown];
	const services = plan.bootstrap ? [...plan.bootstrap.services].reverse() : [];
	return { stackName: plan.stackName, commands, services };
}

// Re-export the shared collaborators the panel/tests consume so they import one module.
export type {
	BootstrapSequence,
	HostState,
	SecretsState,
} from "./bootstrap";
export type { PhaseRef as PreviewPhaseRef } from "./preview";
export type { EmittedSurface as PreviewSurface };
export { buildBasePlan, isKnownProfile as isProfile };
