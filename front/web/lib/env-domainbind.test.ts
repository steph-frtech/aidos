/**
 * The DP27 ENV-DOMAIN cabling twin reproducibility mirror (fast-check — the frozen front
 * property slot). It pins the same done-criteria as the Go rapid mirror (envdomain_property_test.go):
 *   1. reproducibility — same registry + request + env → byte-identical EnvDomainBinding
 *      (the URL, the router, the emitted Traefik HTTPS labels);
 *   2. HTTPS on every TLS-terminating env — a custom domain cabled into prod/staging/dev/
 *      future_cloud ALWAYS serves the app over HTTPS (websecure + tls + ACME certresolver);
 *   3. local refuses HTTPS — cabling a custom HTTPS domain into `local` (no TLS) is REFUSED
 *      fail-closed (OUT_OF_SCOPE), never a silent http downgrade;
 *   4. injectivity preserved — a domain owned by ANOTHER project is refused DOMAIN_ALREADY_BOUND,
 *      and the resulting two-project set is never injective (the S97 rule, not forked);
 *   5. one-source labels (DP03) — the emitted labels are EXACTLY the DP03 canonical Traefik HTTPS
 *      set (traefikHTTPSLabels), never a 2nd divergent jeu;
 *   6. unknown env refused — an out-of-set environment is refused (fail-closed).
 * Same input → same output, on every run. The Go output is AUTHORITATIVE; this twin reproduces it.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isInjective } from "./domainbind";
import {
	cableInEnvironment,
	type EnvBindRequest,
	isBlocked,
	traefikHTTPSLabels,
} from "./env-domainbind";

const label = fc
	.stringMatching(/^[a-z][a-z0-9]{1,7}$/)
	.map((s) => `${s}.example.com`);
const project = fc.stringMatching(/^[a-z]{2,6}$/);
// the four TLS-terminating environments (local is the no-TLS outlier).
const tlsEnv = fc.constantFrom("prod", "staging", "dev", "future_cloud");

function req(domain: string, proj: string, env: string): EnvBindRequest {
	return {
		domain,
		project: proj,
		environment: env,
		registry: { bindings: [] },
	};
}

describe("DP27 env-domain cabling twin", () => {
	it("is reproducible — same request + env → byte-identical binding", () => {
		fc.assert(
			fc.property(label, project, tlsEnv, (d, p, env) => {
				const a = cableInEnvironment(req(d, p, env));
				const b = cableInEnvironment(req(d, p, env));
				expect(isBlocked(a)).toBe(isBlocked(b));
				if (!isBlocked(a) && !isBlocked(b)) {
					expect(a.url).toBe(b.url);
					expect(a.routerName).toBe(b.routerName);
					expect(a.labels).toEqual(b.labels);
				}
			}),
		);
	});

	it("serves the app over HTTPS in every TLS-terminating environment", () => {
		fc.assert(
			fc.property(label, project, tlsEnv, (d, p, env) => {
				const res = cableInEnvironment(req(d, p, env));
				expect(isBlocked(res)).toBe(false);
				if (!isBlocked(res)) {
					expect(res.tls).toBe(true);
					expect(res.url.startsWith("https://")).toBe(true);
					expect(res.certResolver).toBe("letsencrypt");
				}
			}),
		);
	});

	it("refuses a custom HTTPS domain in local (no TLS, fail-closed)", () => {
		fc.assert(
			fc.property(label, project, (d, p) => {
				const res = cableInEnvironment(req(d, p, "local"));
				expect(isBlocked(res)).toBe(true);
				if (isBlocked(res)) expect(res.code).toBe("OUT_OF_SCOPE");
			}),
		);
	});

	it("is injective — a domain owned by another project is refused", () => {
		fc.assert(
			fc.property(label, project, project, tlsEnv, (d, mine, other, env) => {
				fc.pre(mine !== other);
				const res = cableInEnvironment({
					domain: d,
					project: mine,
					environment: env,
					registry: { bindings: [{ domain: d, project: other }] },
				});
				expect(isBlocked(res)).toBe(true);
				if (isBlocked(res)) expect(res.code).toBe("DOMAIN_ALREADY_BOUND");
				expect(
					isInjective([
						{ domain: d, project: other },
						{ domain: d, project: mine },
					]),
				).toBe(false);
			}),
		);
	});

	it("emits EXACTLY the DP03 canonical Traefik HTTPS label set (one source)", () => {
		fc.assert(
			fc.property(label, project, tlsEnv, (d, p, env) => {
				const res = cableInEnvironment(req(d, p, env));
				expect(isBlocked(res)).toBe(false);
				if (!isBlocked(res)) {
					const dp03 = traefikHTTPSLabels(
						res.routerName,
						res.domain,
						res.certResolver,
						res.redirectMiddleware,
					);
					expect(res.labels).toEqual(dp03);
				}
			}),
		);
	});

	it("refuses an unknown environment (fail-closed)", () => {
		const res = cableInEnvironment(req("shop.acme.com", "shop", "qa-cloud"));
		expect(isBlocked(res)).toBe(true);
		if (isBlocked(res)) expect(res.code).toBe("OUT_OF_SCOPE");
	});

	it("refuses a malformed domain or empty project", () => {
		const a = cableInEnvironment(req("not a domain", "shop", "prod"));
		expect(isBlocked(a)).toBe(true);
		if (isBlocked(a)) expect(a.code).toBe("OUT_OF_SCOPE");
		const b = cableInEnvironment(req("shop.acme.com", "", "prod"));
		expect(isBlocked(b)).toBe(true);
		if (isBlocked(b)) expect(b.code).toBe("OUT_OF_SCOPE");
	});
});
