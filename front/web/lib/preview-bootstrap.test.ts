/**
 * Le miroir de reproductibilité du jumeau DP25 preview+bootstrap (fast-check — le slot
 * property frozen du front). EPIC F ouvre, ÉTEND S94, ne le duplique pas. Il épingle les
 * MÊMES done-criteria que le miroir Go rapid (back/runtime/preview/preview_dp25_test.go) :
 *
 *   1. HASH-INVARIANT — ∀ profiles, l'app-hash du preview ÉGALE la baseline S94
 *      (servedMatchesEmitted tient ; l'URL/le subdomain/le stack restent profile-indépendants) ;
 *   2. ré-émission PURE — même (phase, profile, manifest, hôte, secrets) → plan byte-identique
 *      (même id + même sequenceHash + même teardown) ;
 *   3. profile core vs full ⇒ services bootstrap potentiellement différents mais app-hash
 *      IDENTIQUE ; un profile resserrant (`git`) amorce STRICTEMENT moins de services que `full`,
 *      avec des ids/sequenceHash distincts mais le MÊME EmittedAppHash/URL/stack ;
 *   4. démontage DÉTERMINISTE — teardownOf est pur ; les services s'effondrent en ordre de boot
 *      INVERSE ; full démonte un sur-ensemble d'un profile resserré ;
 *   5. anti-overwrite — un input SANS manifest (la forme S94) ne porte ni profile ni bootstrap,
 *      et son id est byte-identique au plan S94 de base (la base reste verte) ;
 *   6. refus — un profile hors de l'ensemble clos est refusé UNKNOWN_PROFILE (jamais coercé) ;
 *      un manifest cross-app est refusé ; un secret requis manquant est refusé.
 *
 * Même input → même output, à chaque run.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	buildBasePlan,
	buildPreviewWithBootstrap,
	type EmittedSurface,
	emittedAppHash,
	isBlocked,
	type PreviewInputWithBootstrap,
	type StackManifest,
	servedMatchesEmitted,
	teardownOf,
} from "./preview-bootstrap";

const project = "shop";

function surfaceOf(p: string, salt: string): EmittedSurface {
	return {
		project: p,
		serverBundleHash: `srv-${salt}`,
		frontBundleHash: `frt-${salt}`,
		infraHash: `inf-${salt}`,
		datastoreHash: `dst-${salt}`,
	};
}

/**
 * Un manifest riche par-app : le core (server + datastore + interpreter, tous `core`) PLUS un
 * service opt-in par profile non-core, donc une sélection resserre VISIBLEMENT les services.
 * Son `app` ÉGALE le projet (preview par-app). Le scope connecteur déclaré exige un secret au
 * boot (le miroir le fournit pour les cas nominaux).
 */
function richManifest(app: string): StackManifest {
	let port = 9100;
	// Roles chosen INSIDE the intersection of the DP02 manifest role set and the DP12
	// bootstrap-emitter role subset (both closed sets) so the emitted sequence is nominal —
	// the profile names below are the closed SPEC-stack-2026 selection labels.
	const optIns = (
		[
			{ profile: "observability", role: "observability" },
			{ profile: "qa", role: "workflow" },
			{ profile: "git", role: "git" },
			{ profile: "tickets", role: "tickets" },
		] as const
	).map(({ profile, role }) => ({
		name: `svc-${profile}`,
		role,
		image: "",
		internal_port: port++,
		profile,
	}));
	return {
		app,
		services: [
			{
				name: "app",
				role: "server",
				image: "node:22-alpine",
				internal_port: 3000,
				profile: "core",
			},
			{
				name: "postgres",
				role: "datastore",
				image: "postgres:17-alpine",
				internal_port: 5432,
				profile: "core",
			},
			{
				name: "interpreter",
				role: "interpreter",
				image: "",
				internal_port: 8973,
				profile: "core",
			},
			...optIns,
		],
		volumes: [{ name: "app_data", device_var: "APP_DATA_PATH" }],
		network: { name: "traefik_default", external: true },
		connector_scopes: ["crm"],
	};
}

/** PRESENT_SECRETS — le seul secret que le scope `crm` du manifest exige au boot. */
const PRESENT_SECRETS = { present: ["APP_SECRET_CRM"] };

function inputOf(
	phaseHash: string,
	salt: string,
	profile?: string,
	withManifest = true,
): PreviewInputWithBootstrap {
	return {
		phase: { phaseHash },
		surface: surfaceOf(project, salt),
		programPath: `gen/${project}/infra/index.ts`,
		programBytes: "export function program() {}\n",
		profile: profile as PreviewInputWithBootstrap["profile"],
		manifest: withManifest ? richManifest(project) : undefined,
		secrets: PRESENT_SECRETS,
		env: "dev",
	};
}

const phaseHash = fc.stringMatching(/^[a-f0-9]{8,16}$/);
const salt = fc.stringMatching(/^[a-f0-9]{0,8}$/);
// Les profiles qui amorcent NOMINALEMENT (le scope crm exige son secret, fourni).
const bootProfile = fc.constantFrom(
	"core",
	"docs",
	"observability",
	"qa",
	"git",
	"tickets",
	"connectors",
	"full",
);

describe("DP25 — preview+bootstrap twin reproducibility (EPIC F extends S94)", () => {
	it("1. HASH-INVARIANT — ∀ profiles, l'app-hash égale la baseline S94 + servedMatchesEmitted tient", () => {
		fc.assert(
			fc.property(phaseHash, salt, bootProfile, (ph, s, profile) => {
				const surface = surfaceOf(project, s);
				const baseline = emittedAppHash({ phaseHash: `phase-${ph}` }, surface);
				const plan = buildPreviewWithBootstrap(
					inputOf(`phase-${ph}`, s, profile),
				);
				if (isBlocked(plan)) return false;
				// le profile change l'amorçage, JAMAIS l'EmittedAppHash de la phase.
				if (plan.emittedAppHash !== baseline) return false;
				// servedMatchesEmitted tient pour CHAQUE profile.
				if (servedMatchesEmitted(plan, plan.emittedAppHash) !== true)
					return false;
				// l'URL/le subdomain/le stack restent profile-indépendants (== la base S94).
				const base = buildBasePlan(inputOf(`phase-${ph}`, s, profile, false));
				if (isBlocked(base)) return false;
				return (
					plan.url === base.url &&
					plan.subdomain === base.subdomain &&
					plan.stackName === base.stackName
				);
			}),
			{ numRuns: 100 },
		);
	});

	it("2. ré-émission PURE — même (phase, profile) → plan byte-identique (id + sequenceHash + teardown)", () => {
		fc.assert(
			fc.property(phaseHash, salt, bootProfile, (ph, s, profile) => {
				const a = buildPreviewWithBootstrap(inputOf(`phase-${ph}`, s, profile));
				const b = buildPreviewWithBootstrap(inputOf(`phase-${ph}`, s, profile));
				if (isBlocked(a) || isBlocked(b)) return false;
				return (
					a.id === b.id &&
					a.bootstrap?.sequenceHash === b.bootstrap?.sequenceHash &&
					JSON.stringify(teardownOf(a)) === JSON.stringify(teardownOf(b))
				);
			}),
			{ numRuns: 100 },
		);
	});

	it("3. profile resserrant (`git`) amorce STRICTEMENT moins que `full`, ids/sequenceHash distincts, MÊME app-hash/URL/stack", () => {
		fc.assert(
			fc.property(phaseHash, salt, (ph, s) => {
				const git = buildPreviewWithBootstrap(inputOf(`phase-${ph}`, s, "git"));
				const full = buildPreviewWithBootstrap(
					inputOf(`phase-${ph}`, s, "full"),
				);
				if (isBlocked(git) || isBlocked(full)) return false;
				if (!git.bootstrap || !full.bootstrap) return false;
				// git amorce STRICTEMENT moins de services que full.
				if (git.bootstrap.services.length >= full.bootstrap.services.length)
					return false;
				// ids + sequenceHash distincts (l'amorçage diffère).
				if (git.id === full.id) return false;
				if (git.bootstrap.sequenceHash === full.bootstrap.sequenceHash)
					return false;
				// MAIS l'EmittedAppHash/l'URL/le stack sont IDENTIQUES (l'invariant capital).
				return (
					git.emittedAppHash === full.emittedAppHash &&
					git.url === full.url &&
					git.stackName === full.stackName
				);
			}),
			{ numRuns: 100 },
		);
	});

	it("4. démontage DÉTERMINISTE — teardownOf pur ; services en ordre de boot INVERSE ; full ⊇ resserré", () => {
		fc.assert(
			fc.property(phaseHash, salt, bootProfile, (ph, s, profile) => {
				const plan = buildPreviewWithBootstrap(
					inputOf(`phase-${ph}`, s, profile),
				);
				if (isBlocked(plan) || !plan.bootstrap) return false;
				const td = teardownOf(plan);
				// les services de teardown = l'inverse EXACT des services d'amorçage.
				const reversed = [...plan.bootstrap.services].reverse();
				if (JSON.stringify(td.services) !== JSON.stringify(reversed))
					return false;
				// les commandes portent `pulumi destroy` + `pulumi stack rm`.
				const cmd = td.commands.join(" ");
				return (
					cmd.includes("pulumi destroy") && cmd.includes("pulumi stack rm")
				);
			}),
			{ numRuns: 100 },
		);
	});

	it("full démonte un SUR-ENSEMBLE des services d'un profile resserré", () => {
		const git = buildPreviewWithBootstrap(
			inputOf("phase-abcdef01", "a", "git"),
		);
		const full = buildPreviewWithBootstrap(
			inputOf("phase-abcdef01", "a", "full"),
		);
		expect(isBlocked(git)).toBe(false);
		expect(isBlocked(full)).toBe(false);
		if (isBlocked(git) || isBlocked(full) || !git.bootstrap || !full.bootstrap)
			return;
		const gitSet = new Set(git.bootstrap.services);
		const fullSet = new Set(full.bootstrap.services);
		for (const svc of gitSet) expect(fullSet.has(svc)).toBe(true);
		expect(fullSet.size).toBeGreaterThan(gitSet.size);
	});

	it("5. anti-overwrite — un input SANS manifest est la forme S94 (pas de profile/bootstrap), id == plan de base", () => {
		fc.assert(
			fc.property(phaseHash, salt, (ph, s) => {
				const plan = buildPreviewWithBootstrap(
					inputOf(`phase-${ph}`, s, undefined, false),
				);
				const base = buildBasePlan(inputOf(`phase-${ph}`, s, undefined, false));
				if (isBlocked(plan) || isBlocked(base)) return false;
				return (
					plan.id === base.id &&
					plan.profile === undefined &&
					plan.bootstrap === undefined &&
					teardownOf(plan).services.length === 0
				);
			}),
			{ numRuns: 100 },
		);
	});

	it("6a. un profile hors de l'ensemble clos est refusé UNKNOWN_PROFILE (jamais coercé)", () => {
		fc.assert(
			fc.property(
				fc.string().filter(
					(s) =>
						// "" means "use the default profile (core)", not an unknown one.
						s !== "" &&
						![
							"core",
							"docs",
							"observability",
							"qa",
							"git",
							"tickets",
							"connectors",
							"non-prod",
							"full",
						].includes(s),
				),
				(bogus) => {
					const r = buildPreviewWithBootstrap(
						inputOf("phase-abcdef01", "a", bogus),
					);
					return isBlocked(r) && r.code === "UNKNOWN_PROFILE";
				},
			),
			{ numRuns: 100 },
		);
		// le nearest-miss littéral que l'e2e exerce est aussi refusé.
		const r = buildPreviewWithBootstrap(
			inputOf("phase-abcdef01", "a", "observabilty"),
		);
		expect(isBlocked(r) && r.code).toBe("UNKNOWN_PROFILE");
	});

	it("6b. un manifest cross-app est refusé (preview par-app)", () => {
		const input = inputOf("phase-abcdef01", "a", "core");
		input.manifest = richManifest("other-app");
		const r = buildPreviewWithBootstrap(input);
		expect(isBlocked(r)).toBe(true);
		if (isBlocked(r)) expect(r.code).toBe("OUT_OF_SCOPE");
	});

	it("6c. un secret requis manquant au boot est refusé MISSING_SECRET_AT_BOOT", () => {
		const input = inputOf("phase-abcdef01", "a", "full");
		input.secrets = { present: [] };
		const r = buildPreviewWithBootstrap(input);
		expect(isBlocked(r)).toBe(true);
		if (isBlocked(r)) expect(r.code).toBe("MISSING_SECRET_AT_BOOT");
	});

	it("7. core est la baseline always-on (≡ full en nombre de services — sémantique DP11 honnête)", () => {
		const core = buildPreviewWithBootstrap(
			inputOf("phase-abcdef01", "a", "core"),
		);
		const full = buildPreviewWithBootstrap(
			inputOf("phase-abcdef01", "a", "full"),
		);
		expect(isBlocked(core)).toBe(false);
		expect(isBlocked(full)).toBe(false);
		if (
			isBlocked(core) ||
			isBlocked(full) ||
			!core.bootstrap ||
			!full.bootstrap
		)
			return;
		// core garde TOUS les services (serviceProfiles ajoute core à chacun) ⇒ ≡ full.
		expect(core.bootstrap.services.length).toBe(full.bootstrap.services.length);
		// mais l'app-hash est identique (l'invariant capital tient partout).
		expect(core.emittedAppHash).toBe(full.emittedAppHash);
	});
});
