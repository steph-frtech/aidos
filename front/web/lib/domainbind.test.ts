/**
 * The S97 custom-domain BINDING twin reproducibility mirror (fast-check — the frozen front
 * property slot). It pins the same done-criteria as the Go rapid mirror:
 *   1. reproducibility — same registry + request → byte-identical plan (id + labels);
 *   2. injectivity — a domain owned by ANOTHER project is ALWAYS refused DOMAIN_ALREADY_BOUND,
 *      and the resulting two-project set is never injective (the done-criteria property);
 *   3. HTTPS serving — every accepted bind serves the app over HTTPS (websecure + tls +
 *      ACME certresolver on Host(`<domain>`));
 *   4. idempotent same-project — re-binding the same domain to the SAME project is permitted
 *      and yields the same id as a fresh bind;
 *   5. content-address sensitivity — a different domain/deploy-host → a different id;
 *   6. malformed refusal — an invalid domain / empty project is refused OUT_OF_SCOPE.
 * Same input → same output, on every run.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type BindRequest,
	bind,
	isBlocked,
	isInjective,
	type Registry,
	servesHTTPS,
} from "./domainbind";

const label = fc
	.stringMatching(/^[a-z][a-z0-9]{1,7}$/)
	.map((s) => `${s}.example.com`);

function req(domain: string, project: string): BindRequest {
	return {
		domain,
		project,
		deploySubdomain: "d-ab12cd34ef56",
		deployRoot: "deploy.aidos.app",
		serverService: "svc-server",
	};
}

const empty: Registry = { bindings: [] };

describe("S97 custom-domain binding twin", () => {
	it("is reproducible — same registry + request → same plan id", () => {
		fc.assert(
			fc.property(label, fc.stringMatching(/^[a-z]{2,6}$/), (d, p) => {
				const r = req(d, p);
				const a = bind(empty, r);
				const b = bind(empty, r);
				expect(isBlocked(a)).toBe(isBlocked(b));
				if (!isBlocked(a) && !isBlocked(b)) {
					expect(a.id).toBe(b.id);
					expect(a.labels).toEqual(b.labels);
				}
			}),
		);
	});

	it("is injective — a domain owned by another project is refused", () => {
		fc.assert(
			fc.property(
				label,
				fc.stringMatching(/^[a-z]{2,6}$/),
				fc.stringMatching(/^[a-z]{2,6}$/),
				(d, mine, other) => {
					fc.pre(mine !== other);
					const reg: Registry = { bindings: [{ domain: d, project: other }] };
					const res = bind(reg, req(d, mine));
					expect(isBlocked(res)).toBe(true);
					if (isBlocked(res)) expect(res.code).toBe("DOMAIN_ALREADY_BOUND");
					expect(
						isInjective([
							{ domain: d, project: other },
							{ domain: d, project: mine },
						]),
					).toBe(false);
				},
			),
		);
	});

	it("serves the app over HTTPS for every accepted bind", () => {
		fc.assert(
			fc.property(label, fc.stringMatching(/^[a-z]{2,6}$/), (d, p) => {
				const res = bind(empty, req(d, p));
				expect(isBlocked(res)).toBe(false);
				if (!isBlocked(res)) {
					expect(servesHTTPS(res)).toBe(true);
					expect(res.url.startsWith("https://")).toBe(true);
				}
			}),
		);
	});

	it("is idempotent — re-binding to the same project is permitted, same id", () => {
		fc.assert(
			fc.property(label, fc.stringMatching(/^[a-z]{2,6}$/), (d, p) => {
				const reg: Registry = { bindings: [{ domain: d, project: p }] };
				const a = bind(reg, req(d, p));
				const fresh = bind(empty, req(d, p));
				expect(isBlocked(a)).toBe(false);
				if (!isBlocked(a) && !isBlocked(fresh)) expect(a.id).toBe(fresh.id);
			}),
		);
	});

	it("content-address is sensitive to the domain and the deploy host", () => {
		fc.assert(
			fc.property(label, fc.stringMatching(/^[a-z]{2,6}$/), (d, p) => {
				const base = bind(empty, req(d, p));
				if (isBlocked(base)) return;
				const r2 = req(`x-${d}`, p);
				const p2 = bind(empty, r2);
				if (!isBlocked(p2)) expect(p2.id).not.toBe(base.id);
				const r3 = { ...req(d, p), deploySubdomain: "d-deadbeef9999" };
				const p3 = bind(empty, r3);
				if (!isBlocked(p3)) expect(p3.id).not.toBe(base.id);
			}),
		);
	});

	it("refuses a malformed domain or empty project", () => {
		const a = bind(empty, req("not a domain", "shop"));
		expect(isBlocked(a)).toBe(true);
		if (isBlocked(a)) expect(a.code).toBe("OUT_OF_SCOPE");
		const b = bind(empty, req("shop.acme.com", ""));
		expect(isBlocked(b)).toBe(true);
		if (isBlocked(b)) expect(b.code).toBe("OUT_OF_SCOPE");
	});
});
