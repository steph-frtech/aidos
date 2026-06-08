/**
 * Reproducibility mirror for the blob-attribute twin (S72) — the TS side of the S72
 * property mirror (back/kernel/entities/blob/blob_property_test.go), pinned with Vitest +
 * fast-check. Same input ⇒ same output (determinism); a blob round-trips as a
 * content-addressed AST and yields the SAME hash as Go; the MIME allow-list + size ceiling
 * are closed (out-of-MIME / over-size refused); a blob of project A is inaccessible from B.
 * The Go output is AUTHORITATIVE — these tests assert the twin reproduces it byte-for-byte.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type BlobAttribute,
	blobBody,
	blobId,
	crossProjectAccess,
	emitHandler,
	isBlocked,
	projectOf,
	storageKey,
	validateUpload,
} from "./blob-attribute";

const arbBlob = fc.record({
	name: fc.stringMatching(/^[a-z][a-z0-9_]{0,7}$/),
	allowed_mime: fc.array(fc.stringMatching(/^[a-z]{1,6}\/[a-z0-9.+-]{1,8}$/), {
		minLength: 1,
		maxLength: 4,
	}),
	max_bytes: fc.integer({ min: 1, max: 1 << 30 }),
	required: fc.boolean(),
});

describe("blob-attribute twin (S72)", () => {
	it("byte-equal to the Go blob.Body + blob.ID (the cross-language anchor)", () => {
		// the exact Go canonical body + hash dumped from blob.Body/blob.ID.
		const b: BlobAttribute = {
			name: "avatar",
			allowed_mime: ["image/png", "image/jpeg"],
			max_bytes: 1 << 20,
			required: true,
		};
		expect(blobBody(b)).toBe(
			'{"allowed_mime":["image/png","image/jpeg"],"max_bytes":1048576,"name":"avatar","required":true}',
		);
		expect(blobId(b)).toBe(
			"b532622b6bd65a7595f2a4377e03fc1b11e374d201757f8b6ccbd4e05bb57f03",
		);
	});

	it("∀ — blobId is deterministic (same input → same output)", () => {
		fc.assert(
			fc.property(arbBlob, (b) => {
				expect(blobId(b)).toBe(blobId(b));
			}),
		);
	});

	it("∀ — a byte change (max_bytes) changes the content address (a new version)", () => {
		fc.assert(
			fc.property(arbBlob, (b) => {
				expect(blobId(b)).not.toBe(
					blobId({ ...b, max_bytes: b.max_bytes + 1 }),
				);
			}),
		);
	});

	it("∀ — an out-of-MIME or over-size upload is refused; a conforming one accepted", () => {
		fc.assert(
			fc.property(arbBlob, (b) => {
				const goodMime = b.allowed_mime[0];
				expect(validateUpload(b, { mime: goodMime, size: 1 })).toBeNull();
				expect(
					validateUpload(b, { mime: goodMime, size: b.max_bytes + 1 }),
				).not.toBeNull();
				const badMime = `zzz/absent-${goodMime}`;
				if (!b.allowed_mime.includes(badMime)) {
					expect(validateUpload(b, { mime: badMime, size: 1 })).not.toBeNull();
				}
			}),
		);
	});

	it("∀ — a storage key of A is inaccessible from B≠A (project scoping)", () => {
		fc.assert(
			fc.property(
				arbBlob,
				fc.stringMatching(/^a[a-z0-9]{1,8}$/),
				fc.stringMatching(/^b[a-z0-9]{1,8}$/),
				(b, pa, pb) => {
					const key = storageKey(pa, "User", b, "deadbeef");
					expect(key).not.toBeNull();
					if (!key) return;
					expect(projectOf(key)).toBe(pa);
					expect(crossProjectAccess(key, pa)).toBeNull();
					expect(crossProjectAccess(key, pb)).not.toBeNull();
				},
			),
		);
	});

	it("∀ — emitHandler is deterministic (byte-stable) and bakes in the closed set", () => {
		fc.assert(
			fc.property(arbBlob, (b) => {
				const h1 = emitHandler("projA", "User", b);
				const h2 = emitHandler("projA", "User", b);
				expect(isBlocked(h1)).toBe(false);
				expect(h1).toBe(h2);
				if (typeof h1 === "string") {
					expect(h1).toContain("BLOB_MIME_REFUSED");
					expect(h1).toContain("BLOB_CROSS_PROJECT");
				}
			}),
		);
	});
});
