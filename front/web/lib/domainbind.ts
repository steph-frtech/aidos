/**
 * The CUSTOM-DOMAIN binding twin — the Workbench /domain-bind source (AIDOS S97).
 *
 * The DECLARED projection of the Go package back/runtime/domainbind: the deterministic plan that
 * binds a custom domain to a deployed app (S96), serving it over HTTPS via Traefik + an ACME
 * certresolver (DP27 / ADR 0043) — like the Workbench behind Traefik, but for the EMITTED apps.
 * A domain belongs to EXACTLY ONE project: the binding domain→project is INJECTIVE.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): bind, servesHTTPS, isInjective are PURE functions of their
 * input — no clock, no rng, no I/O, no LLM. Same registry + request → byte-identical plan (same
 * id, labels, DNS). The Go output is the AUTHORITATIVE truth; this twin reproduces the structure
 * for the screen. The reproducibility mirror lib/domainbind.test.ts (fast-check) pins determinism,
 * injectivity (a domain owned by another project ⇒ DOMAIN_ALREADY_BOUND), HTTPS serving, and the
 * content-address sensitivity.
 *
 * READ-ONLY (the wall): /domain-bind PLANS the binding + emits the Traefik labels/DNS; it writes
 * no truth and makes no live DNS/ACME call. Recording the binding as a DAG decision goes through
 * propose → ChangeSet → approval, never a direct write from the screen.
 */

export interface Binding {
	domain: string;
	project: string;
}

export interface Registry {
	bindings: Binding[];
}

export interface BindRequest {
	domain: string;
	project: string;
	deploySubdomain: string;
	deployRoot: string;
	serverService: string;
	certResolver?: string;
}

export interface Label {
	label: string;
	value: string;
}

export interface DNSRecord {
	type: "CNAME";
	name: string;
	value: string;
}

export interface BindPlan {
	id: string;
	domain: string;
	project: string;
	url: string;
	routerName: string;
	certResolver: string;
	labels: Label[];
	dns: DNSRecord;
}

export interface BlockReason {
	code: string;
	severity: "blocking";
	explanation: string;
	how_to_fix: string[];
}

export const DEFAULT_CERT_RESOLVER = "letsencrypt";

export function isBlocked<T>(v: T | BlockReason): v is BlockReason {
	return (
		typeof v === "object" && v !== null && "code" in v && "how_to_fix" in v
	);
}

/** A deterministic FNV-1a digest (display content address — the Go records.Hash is
 * authoritative). Same bytes → same digest, no clock/rng. */
export function digest(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/** normalizeDomain — lower-cased, scheme stripped, trailing dot + path/port removed. Same
 * normalization the Go twin uses, so matching is consistent. */
export function normalizeDomain(d: string): string {
	let s = d.trim().toLowerCase();
	s = s.replace(/^https?:\/\//, "");
	const i = s.search(/[/:]/);
	if (i >= 0) s = s.slice(0, i);
	if (s.endsWith(".")) s = s.slice(0, -1);
	return s;
}

/** validDomain — a plausible DNS hostname: at least one dot, DNS-safe labels, no empty/leading/
 * trailing-hyphen label. PURE structural check. */
export function validDomain(d: string): boolean {
	if (!d || !d.includes(".")) return false;
	for (const label of d.split(".")) {
		if (!label || label.startsWith("-") || label.endsWith("-")) return false;
		if (!/^[a-z0-9-]+$/.test(label)) return false;
	}
	return true;
}

/** routerNameOf — the deterministic Traefik router name: "app-" + the domain with
 * non-alphanumerics replaced by "-" (DNS-safe). Same domain → same router. */
export function routerNameOf(domain: string): string {
	let out = "app-";
	for (const ch of domain) {
		out += /[a-z0-9]/.test(ch) ? ch : "-";
	}
	return out;
}

function renderLabels(
	router: string,
	domain: string,
	service: string,
	certResolver: string,
): Label[] {
	return [
		{ label: "traefik.enable", value: "true" },
		{
			label: `traefik.http.routers.${router}.rule`,
			value: `Host(\`${domain}\`)`,
		},
		{ label: `traefik.http.routers.${router}.entrypoints`, value: "websecure" },
		{ label: `traefik.http.routers.${router}.tls`, value: "true" },
		{
			label: `traefik.http.routers.${router}.tls.certresolver`,
			value: certResolver,
		},
		{ label: `traefik.http.routers.${router}.service`, value: service },
		{
			label: `traefik.http.routers.${router}-http.rule`,
			value: `Host(\`${domain}\`)`,
		},
		{ label: `traefik.http.routers.${router}-http.entrypoints`, value: "web" },
		{
			label: `traefik.http.routers.${router}-http.middlewares`,
			value: `${router}-redirect`,
		},
		{
			label: `traefik.http.middlewares.${router}-redirect.redirectscheme.scheme`,
			value: "https",
		},
	];
}

function malformed(reason: string): BlockReason {
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation: `Custom-domain binding refused: ${reason}`,
		how_to_fix: [
			"Provide a valid custom domain (a DNS hostname with at least one dot, DNS-safe labels) and a non-empty project.",
			"Provide the deploy host (subdomain + root) the custom domain CNAMEs to (S96 deploy plan).",
			"Provide the emitted server service the Traefik router routes to (honoemit RoleServer service).",
		],
	};
}

function alreadyBound(domain: string, owner: string): BlockReason {
	return {
		code: "DOMAIN_ALREADY_BOUND",
		severity: "blocking",
		explanation:
			"Le binding du domaine custom est REFUSÉ (S97) : ce domaine est DÉJÀ LIÉ à un autre projet. Un domaine appartient à EXACTEMENT UN projet — le binding domaine→projet est INJECTIF." +
			` Le domaine "${domain}" est déjà lié au projet "${owner}".`,
		how_to_fix: [
			"choose_a_free_domain : choisissez un domaine qui n'est lié à aucun autre projet (binding injectif).",
			"release_the_existing_binding : si le domaine doit changer de projet, le projet propriétaire actuel doit d'abord le libérer (unbind).",
			"use_the_default_deploy_subdomain : sans domaine custom, l'app reste servie sur son sous-domaine de déploiement déterministe (S96).",
		],
	};
}

/** indexRegistry — the normalized domain→project map; throws-equivalent (returns a BlockReason)
 * when the registry already maps a domain to two DIFFERENT projects (an inconsistent fact). */
function indexRegistry(
	reg: Registry,
): { idx: Map<string, string> } | BlockReason {
	const idx = new Map<string, string>();
	for (const b of reg.bindings) {
		const d = normalizeDomain(b.domain);
		const owner = idx.get(d);
		if (owner !== undefined && owner !== b.project) {
			return malformed(
				`registry is not injective: domain "${d}" is bound to both "${owner}" and "${b.project}"`,
			);
		}
		idx.set(d, b.project);
	}
	return { idx };
}

/** bind — the deterministic, content-addressed BindPlan, produced ONLY when the domain is free
 * (or already bound to the SAME project, idempotent). INJECTIVITY FIRST: a domain owned by another
 * project is refused DOMAIN_ALREADY_BOUND. Writes nothing (the wall). */
export function bind(reg: Registry, req: BindRequest): BindPlan | BlockReason {
	const domain = normalizeDomain(req.domain);
	if (!validDomain(domain))
		return malformed(`invalid custom domain "${req.domain}"`);
	if (!req.project.trim()) return malformed("empty project");
	if (!req.deploySubdomain || !req.deployRoot)
		return malformed(
			"missing deploy host (subdomain + root) the custom domain CNAMEs to",
		);
	if (!req.serverService.trim())
		return malformed(
			"missing emitted server service the Traefik router routes to",
		);

	const indexed = indexRegistry(reg);
	if (isBlocked(indexed)) return indexed;
	const owner = indexed.idx.get(domain);
	if (owner !== undefined && owner !== req.project) {
		return alreadyBound(domain, owner);
	}

	const certResolver = req.certResolver || DEFAULT_CERT_RESOLVER;
	const router = routerNameOf(domain);
	const labels = renderLabels(router, domain, req.serverService, certResolver);
	const deployHost = `${req.deploySubdomain}.${req.deployRoot}`;
	const dns: DNSRecord = { type: "CNAME", name: domain, value: deployHost };

	const idBody = JSON.stringify({
		cert_resolver: certResolver,
		dns: { name: dns.name, type: dns.type, value: dns.value },
		domain,
		labels: labels.map((l) => ({ label: l.label, value: l.value })),
		project: req.project,
		router_name: router,
		url: `https://${domain}`,
	});

	return {
		id: digest(idBody),
		domain,
		project: req.project,
		url: `https://${domain}`,
		routerName: router,
		certResolver,
		labels,
		dns,
	};
}

/** servesHTTPS — the plan's labels actually serve the app over HTTPS: a websecure router with tls
 * + an ACME certresolver on Host(`<domain>`). PURE — code judges, never an agent. */
export function servesHTTPS(p: BindPlan): boolean {
	const r = p.routerName;
	const want = {
		entrypoints: false,
		tls: false,
		resolver: false,
		rule: false,
	};
	const hostRule = `Host(\`${p.domain}\`)`;
	for (const l of p.labels) {
		if (l.label === `traefik.http.routers.${r}.entrypoints`)
			want.entrypoints = l.value === "websecure";
		if (l.label === `traefik.http.routers.${r}.tls`)
			want.tls = l.value === "true";
		if (l.label === `traefik.http.routers.${r}.tls.certresolver`)
			want.resolver = l.value !== "";
		if (l.label === `traefik.http.routers.${r}.rule`)
			want.rule = l.value === hostRule;
	}
	return (
		want.entrypoints &&
		want.tls &&
		want.resolver &&
		want.rule &&
		p.url.startsWith("https://")
	);
}

/** isInjective — a set of bindings maps every domain to AT MOST ONE project (the done-criteria
 * property). PURE — code judges. Domains normalized before comparison. */
export function isInjective(bindings: Binding[]): boolean {
	const idx = new Map<string, string>();
	for (const b of bindings) {
		const d = normalizeDomain(b.domain);
		const owner = idx.get(d);
		if (owner !== undefined && owner !== b.project) return false;
		idx.set(d, b.project);
	}
	return true;
}
