import { describe, expect, it } from "vitest";
import {
	catalogue,
	curated,
	fork,
	get,
	instantiate,
	pieceCount,
	sortedNames,
} from "./templates";

// templates.test.ts — proves the S81 front twin reproduces the Go catalogue BYTE-IDENTICALLY (same
// content-addressed bundleId / starterId), and that instantiation is deterministic, green and carries
// the app-auth subsystem. The hashes below are the Go-computed values (printed from the Go package).

// Computed by the Go package for these exact inputs.
const GO_ECOMMERCE_BUNDLE_ID =
	"a29fcea8f530ac838c047ffdc1cc1fd5c183ad17576d8d1007072a4ff27678b5";
const GO_ECOMMERCE_SHOP_APP_STARTER_ID =
	"8d9f02770d87f7e5ccbebcab2d389425f55b4de14bd1540d22c868e9a3d22eb3";

describe("templates twin", () => {
	it("lists the three curated templates", () => {
		expect(catalogue()).toEqual(["ecommerce", "crm", "booking"]);
		expect(curated()).toHaveLength(3);
	});

	it("bundleId is byte-identical to Go", () => {
		expect(get("ecommerce").bundle_id).toBe(GO_ECOMMERCE_BUNDLE_ID);
	});

	it("every curated bundle has a FR label and a bundleId", () => {
		for (const b of curated()) {
			expect(b.labels.fr).toBeTruthy();
			expect(b.bundle_id).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it("instantiate is byte-identical to Go (starterId)", () => {
		const sp = instantiate("ecommerce", "shop-app");
		expect(sp.starter_id).toBe(GO_ECOMMERCE_SHOP_APP_STARTER_ID);
	});

	it("instantiate is deterministic and never writes the kernel", () => {
		const a = instantiate("crm", "acme");
		const b = instantiate("crm", "acme");
		expect(a.starter_id).toBe(b.starter_id);
		expect(a.wrote_kernel).toBe(false);
	});

	it("starter carries the app-auth subsystem", () => {
		const sp = instantiate("ecommerce", "shop-app");
		expect(sp.auth).toBeDefined();
		expect(sp.auth?.entities).toHaveLength(3);
	});

	it("different targets differ", () => {
		expect(instantiate("ecommerce", "a").starter_id).not.toBe(
			instantiate("ecommerce", "b").starter_id,
		);
	});

	it("fork from different phases differs, same phase is idempotent", () => {
		const a = fork("ecommerce", "f", "phaseA");
		const b = fork("ecommerce", "f", "phaseA");
		const c = fork("ecommerce", "f", "phaseB");
		expect(a.starter_id).toBe(b.starter_id);
		expect(a.starter_id).not.toBe(c.starter_id);
	});

	it("pieceCount and sortedNames are stable", () => {
		const sp = instantiate("booking", "spa");
		expect(pieceCount(sp)).toBeGreaterThan(0);
		expect(sortedNames(sp)).toEqual([...sortedNames(sp)].sort());
	});

	it("rejects empty target and unknown id", () => {
		expect(() => instantiate("ecommerce", "")).toThrow();
		// @ts-expect-error unknown id at runtime
		expect(() => get("nope")).toThrow();
	});
});
