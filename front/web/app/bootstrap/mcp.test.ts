/**
 * mcp.test.ts — le miroir vitest de la PORTE MCP de /bootstrap (DP13). Il pince les
 * deux done-criteria du seam :
 *
 *   1. ROUTAGE PUR DÉTERMINISTE. Le décodeur du payload de `stack.bootstrap` est une
 *      fonction PURE & TOTALE : même JSON → même verdict, zéro LLM ; un payload
 *      malformé est REJETÉ (null), jamais coercé.
 *   2. FALLBACK DÉTERMINISTE. Quand la passerelle est injoignable (pas d'endpoint,
 *      erreur transport, payload malformé), l'action retombe sur le JUMEAU TS pur qui
 *      re-dérive la MÊME séquence (source `twin-fallback`) ; un payload live bien formé
 *      donne la séquence décodée (source `live`). La porte conceptuelle reste
 *      `stack.bootstrap` dans les deux cas.
 *
 * mirror record: reflects=DP13-bootstrap-via-mcp, test_kind=property+unit,
 * cert_language=vitest+fast-check, liveness=live.
 */

import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
	CLEAN_HOST,
	emitBootstrapSequence,
	NO_SECRETS,
	NOMINAL_BUNDLE,
	PRESENT_SECRETS,
	sequenceHash,
} from "../../lib/bootstrap";
import type { Scope } from "../../lib/projectWall";
import {
	BOOTSTRAP_MCP_TOOL,
	decodeBootstrapOutput,
	runBootstrapViaMcp,
	runBootstrapViaTwin,
} from "./mcp";

const SCOPE: Scope = { identity: "workbench-human", activeProject: "proj-a" };

/** Un stub fetch qui renvoie une enveloppe JSON-RPC avec le structuredContent donné. */
function okFetch(content: unknown): typeof fetch {
	return (async () =>
		new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				result: { structuredContent: content },
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		)) as unknown as typeof fetch;
}

/** Le structuredContent live (la forme bootstrapOutput Go) du scénario nominal. */
function liveNominalContent() {
	const r = emitBootstrapSequence(NOMINAL_BUNDLE, CLEAN_HOST, PRESENT_SECRETS);
	if (r.sequence === undefined) throw new Error("fixture: expected a sequence");
	return {
		ok: true,
		sequence: {
			events: r.sequence.events,
			resolvedPort: r.sequence.resolvedPort,
		},
		sequence_hash: sequenceHash(r.sequence),
	};
}

describe("decodeBootstrapOutput — pur, rejette le malformé", () => {
	test("décode un payload bien formé (séquence) — reproductible", () => {
		const content = liveNominalContent();
		const a = decodeBootstrapOutput(content);
		const b = decodeBootstrapOutput(content);
		expect(a).toEqual(b);
		expect(a?.sequence?.events).toHaveLength(10);
		expect(a?.sequenceHash).toBe(content.sequence_hash);
		expect(a?.block).toBeUndefined();
	});

	test("décode un block (MISSING_SECRET_AT_BOOT)", () => {
		const decoded = decodeBootstrapOutput({
			ok: false,
			block: {
				code: "MISSING_SECRET_AT_BOOT",
				severity: "error",
				explanation: "secret manquant",
				how_to_fix: ["APP_SECRET_CRM"],
			},
		});
		expect(decoded?.block?.code).toBe("MISSING_SECRET_AT_BOOT");
		expect(decoded?.block?.howToFix).toEqual(["APP_SECRET_CRM"]);
		expect(decoded?.sequence).toBeUndefined();
	});

	test("rejette tout JSON non conforme (null, jamais coercé)", () => {
		fc.assert(
			fc.property(
				fc.oneof(
					fc.constant(null),
					fc.constant(undefined),
					fc.integer(),
					fc.string(),
					fc.array(fc.anything()),
					fc.record({ sequence: fc.string() }),
					fc.record({ sequence: fc.record({ events: fc.string() }) }),
					fc.record({ block: fc.record({ code: fc.integer() }) }),
					fc.record({ wrong: fc.anything() }),
				),
				(bad) => {
					expect(decodeBootstrapOutput(bad)).toBeNull();
				},
			),
		);
	});

	test("un kind hors de l'ensemble clos est rejeté (pas de cast silencieux)", () => {
		const content = liveNominalContent();
		const tampered = {
			...content,
			sequence: {
				events: content.sequence.events.map((e, i) =>
					i === 0 ? { ...e, kind: "not-a-real-kind" } : e,
				),
				resolvedPort: content.sequence.resolvedPort,
			},
		};
		expect(decodeBootstrapOutput(tampered)).toBeNull();
	});
});

describe("runBootstrapViaMcp — la porte stack.bootstrap + fallback déterministe", () => {
	test("la porte empruntée est bien l'outil stack.bootstrap", () => {
		expect(BOOTSTRAP_MCP_TOOL).toBe("stack.bootstrap");
	});

	test("réponse live bien formée → source live, séquence décodée", async () => {
		const r = await runBootstrapViaMcp(
			SCOPE,
			NOMINAL_BUNDLE,
			CLEAN_HOST,
			PRESENT_SECRETS,
			{ endpoint: "http://gw", fetchImpl: okFetch(liveNominalContent()) },
		);
		expect(r.source).toBe("live");
		expect(r.sequence?.events).toHaveLength(10);
		expect(r.block).toBeUndefined();
	});

	test("pas d'endpoint → twin-fallback, la MÊME séquence que le jumeau", async () => {
		const r = await runBootstrapViaMcp(
			SCOPE,
			NOMINAL_BUNDLE,
			CLEAN_HOST,
			PRESENT_SECRETS,
			{ endpoint: null },
		);
		const twin = runBootstrapViaTwin(
			NOMINAL_BUNDLE,
			CLEAN_HOST,
			PRESENT_SECRETS,
		);
		expect(r.source).toBe("twin-fallback");
		expect(r.sequence).toEqual(twin.sequence);
		expect(r.sequenceHash).toBe(twin.sequenceHash);
	});

	test("erreur transport → twin-fallback (ne lance jamais)", async () => {
		const boom = (async () => {
			throw new Error("ECONNREFUSED");
		}) as unknown as typeof fetch;
		const r = await runBootstrapViaMcp(
			SCOPE,
			NOMINAL_BUNDLE,
			CLEAN_HOST,
			PRESENT_SECRETS,
			{ endpoint: "http://gw", fetchImpl: boom },
		);
		expect(r.source).toBe("twin-fallback");
		expect(r.sequence?.events).toHaveLength(10);
	});

	test("payload live malformé → twin-fallback (le décodeur le rejette)", async () => {
		const r = await runBootstrapViaMcp(
			SCOPE,
			NOMINAL_BUNDLE,
			CLEAN_HOST,
			PRESENT_SECRETS,
			{
				endpoint: "http://gw",
				fetchImpl: okFetch({ sequence: "not-an-object" }),
			},
		);
		expect(r.source).toBe("twin-fallback");
		expect(r.sequence?.events).toHaveLength(10);
	});

	test("secret manquant via la porte → MISSING_SECRET_AT_BOOT, zéro event", async () => {
		const r = await runBootstrapViaMcp(
			SCOPE,
			NOMINAL_BUNDLE,
			CLEAN_HOST,
			NO_SECRETS,
			{ endpoint: null },
		);
		expect(r.source).toBe("twin-fallback");
		expect(r.block?.code).toBe("MISSING_SECRET_AT_BOOT");
		expect(r.sequence).toBeUndefined();
	});

	test("twin-fallback est reproductible : même entrée → même résultat", async () => {
		const a = await runBootstrapViaMcp(
			SCOPE,
			NOMINAL_BUNDLE,
			CLEAN_HOST,
			PRESENT_SECRETS,
			{ endpoint: null },
		);
		const b = await runBootstrapViaMcp(
			SCOPE,
			NOMINAL_BUNDLE,
			CLEAN_HOST,
			PRESENT_SECRETS,
			{ endpoint: null },
		);
		expect(a).toEqual(b);
	});
});
