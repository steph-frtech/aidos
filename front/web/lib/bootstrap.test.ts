/**
 * bootstrap.test.ts — le miroir vitest du jumeau TS DP12, ÉCRIT D'ABORD et RED
 * (le module `./bootstrap` n'existait pas — compile fail prouvé), puis vert.
 *
 * mirror record: reflects=DP12-bootstrap-emit, test_kind=property+unit,
 * cert_language=vitest+fast-check, liveness=live.
 *
 * Les lois (le mandat déterminisme-first §6/§8 s'applique) :
 *  A un bundle nominal + un hôte propre → la séquence CLOSE, ORDONNÉE de 10 events,
 *    port = BASE_PORT ;
 *  B un secret requis manquant → MISSING_SECRET_AT_BOOT, ZÉRO event (fail-closed) ;
 *  C le port de base occupé → le premier libre ≥ base, résolu PUREMENT (jamais un prompt) ;
 *  D le même (bundle, hôte, secrets) → la même empreinte (replay byte-stable) ;
 *  + les secrets requis sont DÉRIVÉS des connector_scopes (jamais inventés) ;
 *  + le mur : aucune valeur de secret, aucun endpoint en dur dans la projection.
 */
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
	BASE_PORT,
	BUSY_HOST,
	CLEAN_HOST,
	type EmitResult,
	emitBootstrapSequence,
	type HostState,
	isKnownKind,
	NO_SECRETS,
	NOMINAL_BUNDLE,
	ORDERED_KINDS,
	occupiedFrom,
	PRESENT_SECRETS,
	requiredSecrets,
	resolvePort,
	secretEnvVar,
	sequenceHash,
} from "./bootstrap";

function seq(r: EmitResult) {
	if (r.sequence === undefined)
		throw new Error(`expected a sequence, got block ${r.block?.code}`);
	return r.sequence;
}

describe("DP12 — row A : bundle nominal + hôte propre → séquence complète ordonnée", () => {
	test("la séquence CLOSE de 10 events dans l'ordre déclaré, port = base", () => {
		const s = seq(
			emitBootstrapSequence(NOMINAL_BUNDLE, CLEAN_HOST, PRESENT_SECRETS),
		);
		expect(s.events.map((e) => e.kind)).toEqual([...ORDERED_KINDS]);
		expect(s.events).toHaveLength(10);
		s.events.forEach((e, i) => {
			expect(e.seq).toBe(i + 1); // 1-based, contigu
			expect(isKnownKind(e.kind)).toBe(true); // aucun kind monstre
		});
		expect(s.resolvedPort).toBe(BASE_PORT); // hôte propre → le port de base
	});
});

describe("DP12 — row B : secret requis manquant → MISSING_SECRET_AT_BOOT (fail-closed)", () => {
	test("le block nomme le code + la clé manquante, ZÉRO event", () => {
		const r = emitBootstrapSequence(NOMINAL_BUNDLE, CLEAN_HOST, NO_SECRETS);
		expect(r.sequence).toBeUndefined();
		expect(r.block?.code).toBe("MISSING_SECRET_AT_BOOT");
		expect(r.block?.howToFix.length ?? 0).toBeGreaterThan(0); // jamais une prison
		expect(r.block?.explanation).toContain(secretEnvVar("crm")); // la clé manquante est nommée
	});
});

describe("DP12 — row C : port de base occupé → résolu DÉTERMINISTIQUEMENT (jamais un prompt)", () => {
	test("80,81,82 occupés → 83, et le détail ports-resolved nomme le port", () => {
		const s = seq(
			emitBootstrapSequence(NOMINAL_BUNDLE, BUSY_HOST, PRESENT_SECRETS),
		);
		expect(BASE_PORT).toBe(80);
		expect(s.resolvedPort).toBe(83); // premier libre ≥ base
		const resolved = s.events.find((e) => e.kind === "ports-resolved");
		expect(resolved?.detail).toContain("83");
	});

	test("∀ ensembles occupés : pur, jamais occupé, jamais < base", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(fc.integer({ min: 1, max: 65535 }), { maxLength: 200 }),
				(occupied) => {
					const host: HostState = {
						ssOutput: occupied
							.map((p) => `LISTEN 0 128 0.0.0.0:${p} `)
							.join("\n"),
						dockerPsOutput: "",
					};
					const p1 = resolvePort(host);
					const p2 = resolvePort(host);
					expect(p1).toBe(p2); // même état observé → même port
					expect(occupiedFrom(host).has(p1)).toBe(false);
					expect(p1).toBeGreaterThanOrEqual(BASE_PORT);
				},
			),
		);
	});
});

describe("DP12 — row D : replay byte-stable", () => {
	test("le même (bundle, hôte, secrets) → la même empreinte", () => {
		const a = seq(
			emitBootstrapSequence(NOMINAL_BUNDLE, CLEAN_HOST, PRESENT_SECRETS),
		);
		const b = seq(
			emitBootstrapSequence(NOMINAL_BUNDLE, CLEAN_HOST, PRESENT_SECRETS),
		);
		expect(sequenceHash(a)).toBe(sequenceHash(b));
	});

	test("∀ hôtes : l'émission est déterministe (même empreinte sur replay)", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(fc.integer({ min: 1, max: 65535 }), { maxLength: 50 }),
				(occupied) => {
					const host: HostState = {
						ssOutput: occupied
							.map((p) => `LISTEN 0 128 0.0.0.0:${p} `)
							.join("\n"),
						dockerPsOutput: "",
					};
					const a = seq(
						emitBootstrapSequence(NOMINAL_BUNDLE, host, PRESENT_SECRETS),
					);
					const b = seq(
						emitBootstrapSequence(NOMINAL_BUNDLE, host, PRESENT_SECRETS),
					);
					expect(sequenceHash(a)).toBe(sequenceHash(b));
				},
			),
		);
	});
});

describe("DP12 — les secrets requis sont DÉRIVÉS des connector_scopes (jamais inventés)", () => {
	test("un scope crm → APP_SECRET_CRM ; aucun scope → aucun secret", () => {
		expect(requiredSecrets(NOMINAL_BUNDLE)).toEqual([secretEnvVar("crm")]);
		expect(requiredSecrets({ ...NOMINAL_BUNDLE, connectorScopes: [] })).toEqual(
			[],
		);
	});
});

describe("DP12 — le mur : aucune valeur de secret, aucun endpoint en dur dans la projection", () => {
	test("les détails ne portent que des NOMS ou des réfs ${VAR}", () => {
		const s = seq(
			emitBootstrapSequence(NOMINAL_BUNDLE, CLEAN_HOST, PRESENT_SECRETS),
		);
		const blob = s.events.map((e) => e.detail).join("\n");
		// aucune IP littérale ni domaine en dur (sauf les réfs ${VAR})
		expect(blob).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
		expect(blob).not.toMatch(/sagedesk\.fr|localhost:/);
		// l'URL imprimée est une réf ${VAR}, jamais un domaine concret
		const urls = s.events.find((e) => e.kind === "urls-printed");
		expect(urls?.detail).toContain("${APP_SUBDOMAIN}");
		expect(urls?.detail).toContain("${DOMAIN}");
	});
});

describe("DP12 — un manifest invalide est un BlockReason (jamais une émission devinée)", () => {
	test("un bundle sans serveur → OUT_OF_SCOPE, ZÉRO event", () => {
		const r = emitBootstrapSequence(
			{ ...NOMINAL_BUNDLE, services: [], connectorScopes: [] },
			CLEAN_HOST,
			NO_SECRETS,
		);
		expect(r.sequence).toBeUndefined();
		expect(r.block?.code).toBe("OUT_OF_SCOPE");
	});
});
