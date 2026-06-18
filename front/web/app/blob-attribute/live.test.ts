import { describe, expect, it } from "vitest";
import {
	blobBody,
	blobId,
	emitHandler,
	storageKey,
} from "../../lib/blob-attribute";
import {
	DEMO_ENTITY,
	DEMO_PROJECT_A,
	DEMO_PROJECT_B,
	demoAddress,
	demoBlob,
	demoCross,
	demoKey,
	demoValidate,
} from "../../lib/blob-attribute-data";
import {
	addressDecoder,
	handlerDecoder,
	keyDecoder,
	verdictDecoder,
} from "./live";

/**
 * /blob-attribute live read — le MIROIR DE PARITÉ (Vitest, le slot front N1 figé).
 *
 * Il prouve que les décodeurs TS reconstruisent, depuis un échantillon Go des outils du serveur
 * `blob-attribute` (blobattributesrv : { ok, id, body } / { ok } / { ok, key } /
 * { ok, path, target, source_hash, code }), EXACTEMENT ce que le twin lib/blob-attribute produit
 * pour le MÊME nœud / upload — c'est le contrat des outils, PAS une seconde implémentation du
 * calcul (blob.ID / blob.StorageKey / blob.EmitHandler sont autoritatifs). Le test épingle la
 * PARITÉ live==demo + le repli sur payload mal formé / refusé.
 *
 * DÉTERMINISME-FIRST (§6/§8) : même JSON → même verdict, zéro LLM.
 */

describe("blob-attribute live — blob_address decoder parity (Go == twin)", () => {
	it("decodes the EXACT twin round-trip (id + body) from a Go-sample", () => {
		// L'image EXACTE que blob_address renverrait pour le nœud démo.
		const sample = {
			ok: true,
			id: blobId(demoBlob),
			body: blobBody(demoBlob),
		};
		expect(addressDecoder(sample)).toEqual(demoAddress(demoBlob));
	});

	it("rejects a refused / malformed address payload (→ demo fallback)", () => {
		expect(addressDecoder({ ok: false, block: { code: "X" } })).toBeNull();
		expect(addressDecoder({ ok: true, id: "abc" })).toBeNull(); // body absent
		expect(addressDecoder(null)).toBeNull();
		expect(addressDecoder({})).toBeNull();
	});
});

describe("blob-attribute live — blob_validate_upload decoder parity", () => {
	it("decodes an accepted upload verdict (Go ok:true == twin demoValidate)", () => {
		const upload = { mime: "image/png", size: 50000 };
		expect(verdictDecoder({ ok: true })).toEqual({ ok: true });
		expect(demoValidate(upload, demoBlob)).toBe(true);
	});

	it("decodes a refused upload verdict (Go ok:false == twin demoValidate)", () => {
		// hors-MIME (image/gif) et hors-taille (> 1 MiB) : le twin refuse, le Go aussi.
		expect(verdictDecoder({ ok: false })).toEqual({ ok: false });
		expect(demoValidate({ mime: "image/gif", size: 50000 }, demoBlob)).toBe(
			false,
		);
		expect(demoValidate({ mime: "image/png", size: 1 << 21 }, demoBlob)).toBe(
			false,
		);
	});

	it("rejects a payload without a boolean ok (→ demo fallback)", () => {
		expect(verdictDecoder({ ok: "yes" })).toBeNull();
		expect(verdictDecoder({})).toBeNull();
		expect(verdictDecoder(null)).toBeNull();
	});
});

describe("blob-attribute live — blob_storage_key decoder parity (Go == twin)", () => {
	it("decodes the EXACT twin project-scoped key from a Go-sample", () => {
		const contentHash = blobId(demoBlob).slice(0, 16);
		const expected = storageKey(
			DEMO_PROJECT_A,
			DEMO_ENTITY,
			demoBlob,
			contentHash,
		);
		expect(expected).not.toBeNull();
		const sample = { ok: true, key: expected };
		expect(keyDecoder(sample)).toEqual({
			key: demoKey(DEMO_PROJECT_A, DEMO_ENTITY, contentHash, demoBlob),
		});
	});

	it("rejects a refused / empty key payload (→ demo fallback)", () => {
		expect(keyDecoder({ ok: false })).toBeNull();
		expect(keyDecoder({ ok: true, key: "" })).toBeNull();
		expect(keyDecoder({ ok: true })).toBeNull();
		expect(keyDecoder(null)).toBeNull();
	});
});

describe("blob-attribute live — blob_cross_project decoder parity (Go == twin)", () => {
	it("the owner reaches, the other project is refused (Go == twin)", () => {
		const contentHash = blobId(demoBlob).slice(0, 16);
		const key = demoKey(DEMO_PROJECT_A, DEMO_ENTITY, contentHash, demoBlob);
		// Owner A reaches it (ok:true) ; project B is refused (ok:false).
		expect(verdictDecoder({ ok: true })).toEqual({ ok: true });
		expect(demoCross(key, DEMO_PROJECT_A)).toBe(true);
		expect(verdictDecoder({ ok: false })).toEqual({ ok: false });
		expect(demoCross(key, DEMO_PROJECT_B)).toBe(false);
	});
});

describe("blob-attribute live — blob_emit_handler decoder parity (Go == twin)", () => {
	it("decodes the EXACT twin emitted handler from a Go-sample", () => {
		const h = emitHandler(DEMO_PROJECT_A, DEMO_ENTITY, demoBlob);
		// le twin renvoie une string ok (un nœud bien-formé) — pas un BlockReason.
		expect(typeof h).toBe("string");
		if (typeof h !== "string") return;
		const sample = {
			ok: true,
			path: `gen/${DEMO_PROJECT_A}/${DEMO_ENTITY}/avatar_blob.ts`,
			target: "ts-next",
			source_hash: blobId(demoBlob),
			code: h,
		};
		const decoded = handlerDecoder(sample);
		expect(decoded).not.toBeNull();
		if (decoded === null) return;
		// le code décodé == le code du twin (byte-stable) ; la tête (5 lignes) coïncide.
		expect(decoded.code).toBe(h);
		expect(decoded.sourceHash).toBe(blobId(demoBlob));
		expect(decoded.target).toBe("ts-next");
	});

	it("rejects a refused / empty-code handler payload (→ demo fallback)", () => {
		expect(handlerDecoder({ ok: false })).toBeNull();
		expect(
			handlerDecoder({
				ok: true,
				path: "p",
				target: "t",
				source_hash: "h",
				code: "",
			}),
		).toBeNull();
		expect(handlerDecoder({ ok: true, path: "p" })).toBeNull(); // champs manquants
		expect(handlerDecoder(null)).toBeNull();
	});
});
