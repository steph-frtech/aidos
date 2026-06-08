// Package domainbind is the AIDOS Runtime CUSTOM-DOMAIN binding for a deployed app (S97;
// app-builder EPIC 10, DP27 / ADR 0043).
//
// THE CAPABILITY (S97 done-criteria). Once a stable phase is deployed (S96), the deployed app
// is served on a deterministic deploy subdomain (d-<hash>.deploy.aidos.app). S97 lets the user
// bind a CUSTOM domain (e.g. "shop.acme.com") on top — like the Workbench behind Traefik, but
// for the EMITTED apps. Binding a custom domain is a PURE, DETERMINISTIC plan:
//
//   - it enforces that a domain belongs to EXACTLY ONE project — the binding domain→project is
//     INJECTIVE. Binding a domain already owned by ANOTHER project is REFUSED with
//     DOMAIN_ALREADY_BOUND (the S13 BlockReason shape), naming the owning project — never a
//     silent re-point that would hijack another tenant's HTTPS host (a multi-tenant leak).
//     Re-binding the SAME domain to the SAME project is IDEMPOTENT (not a conflict);
//   - it EMITS the Traefik routing labels (DP03/DP27) that make Traefik serve the app on the
//     custom domain over HTTPS with an ACME certresolver (the /data/dockers convention) — a
//     websecure HTTPS router on Host(`<domain>`) + tls + the ACME certresolver + an HTTP→HTTPS
//     redirect. The labels are RENDERED deterministically, never hand-authored;
//   - it mints the DNS record the user must point at the deploy (a CNAME of the custom domain
//     to the deploy subdomain) — the deterministic instruction, no live DNS API call here.
//
// THE DONE-CRITERIA (S97). A fixture — a domain belongs to EXACTLY ONE project
// (DOMAIN_ALREADY_BOUND otherwise) ; Godog — a custom domain serves the app in HTTPS (the
// emitted Traefik labels carry the websecure router + tls + certresolver on the domain's host) ;
// a property — the binding domain→project is INJECTIVE (no domain maps to two projects).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Bind and the label/DNS rendering are PURE, TOTAL
// functions of their canonicalised input — no clock, no RNG, no map-order leak, no host path.
// Same registry + request → byte-identical BindPlan (same id, same labels, same DNS, same router
// name). The injectivity check is a deterministic name-match over the existing registry, never an
// LLM judgment. The reproducibility mirror pins it. REUSES, never reinvents: records.Canonicalize
// +Hash (S02) for the content address, the Traefik label convention (DP03, honoemit/pulumi.go)
// for the routing, blockreason.For (S13) for the typed refusal.
//
// THE WALL (CLAUDE.md §2). domainbind READS the existing binding registry (already-projected
// facts, below the line) and PLANS the binding + emits the labels/DNS — it writes NOTHING to the
// kernel/mirrors/fitness. A domain already bound elsewhere, a malformed domain, an empty project
// — each is a typed BlockReason, never a panic, never an invented owner, never a silent
// re-point.
package domainbind

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// DefaultCertResolver is the ACME certresolver name Traefik uses to mint the TLS certificate for
// a custom domain — the /data/dockers convention (DP27). Declared, never learned.
const DefaultCertResolver = "letsencrypt"

// mustJSON marshals a value to JSON for the canonical content-address body. The shapes passed in
// are always JSON-marshalable (plain maps/slices/strings), so an error is a programming fault —
// it surfaces as "{}" (the hash then differs, never silently equal).
func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return b
}

// Binding is one existing domain→project binding in the registry (an already-projected fact,
// below the line). The registry is the source of truth for injectivity: a domain appears AT MOST
// once. domainbind only READS it (the wall — it writes no binding itself).
type Binding struct {
	// Domain is the custom domain (lower-cased, no scheme/port). It is the injective KEY.
	Domain string `json:"domain"`
	// Project is the project that OWNS the domain. Exactly one project owns a given domain.
	Project string `json:"project"`
}

// Registry is the set of existing bindings. It is canonicalised (a map keyed by normalized
// domain) so the injectivity check is a deterministic name-match, never an order-dependent scan.
type Registry struct {
	// Bindings are the existing domain→project bindings (a list; duplicates of the same domain to
	// DIFFERENT projects make the registry itself non-injective and are rejected at index time).
	Bindings []Binding `json:"bindings"`
}

// index builds the normalized domain→project map and reports the first injectivity violation
// already present in the registry (the same domain bound to two DIFFERENT projects). A registry
// that already violates injectivity is itself a fault — the caller's facts are inconsistent.
func (r Registry) index() (map[string]string, error) {
	idx := make(map[string]string, len(r.Bindings))
	for _, b := range r.Bindings {
		d := normalizeDomain(b.Domain)
		if owner, ok := idx[d]; ok && owner != b.Project {
			return nil, fmt.Errorf("registry is not injective: domain %q is bound to both %q and %q", d, owner, b.Project)
		}
		idx[d] = b.Project
	}
	return idx, nil
}

// Request is the custom-domain binding request: bind Domain to Project for the deploy served at
// DeploySubdomain (the S96 d-<hash> label) under DeployRoot. The ServerService is the emitted
// server service name (honoemit RoleServer) the Traefik router targets. PURE input — no clock.
type Request struct {
	// Domain is the custom domain to bind (e.g. "shop.acme.com"). Normalized (lower-cased, scheme/
	// trailing-dot stripped) before matching — "Shop.Acme.com." and "shop.acme.com" are the same.
	Domain string `json:"domain"`
	// Project is the project that wants the domain (the prospective owner).
	Project string `json:"project"`
	// DeploySubdomain is the S96 per-phase deploy host label (e.g. "d-ab12cd34ef56") the custom
	// domain CNAMEs to. The custom domain is an alias OVER the deploy host.
	DeploySubdomain string `json:"deploy_subdomain"`
	// DeployRoot is the deploy wildcard root (e.g. "deploy.aidos.app"). The CNAME target is
	// DeploySubdomain + "." + DeployRoot.
	DeployRoot string `json:"deploy_root"`
	// ServerService is the emitted server service name the Traefik router routes to (honoemit
	// RoleServer service). The router/service labels are namespaced by the custom domain so two
	// custom domains on the same service never collide.
	ServerService string `json:"server_service"`
	// CertResolver overrides the ACME certresolver name. Empty → DefaultCertResolver.
	CertResolver string `json:"cert_resolver"`
}

// Label is a single Traefik docker label (the DP03 shape used by honoemit/pulumi.go): a label key
// and its value. Rendered, never hand-authored.
type Label struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// DNSRecord is the DNS instruction the user must apply to point the custom domain at the deploy —
// a CNAME of the custom domain to the deploy host. The deterministic instruction; domainbind makes
// no live DNS API call (the wall — it plans, it does not act on the world).
type DNSRecord struct {
	Type  string `json:"type"`  // always "CNAME" for a custom-domain alias over the deploy host
	Name  string `json:"name"`  // the custom domain
	Value string `json:"value"` // the deploy host (DeploySubdomain.DeployRoot)
}

// BindPlan is the DETERMINISTIC, content-addressed plan that binds a custom domain to a deployed
// app: the Traefik HTTPS routing labels (TLS via ACME) + the DNS CNAME instruction + the resulting
// HTTPS URL. Same Registry + Request → byte-identical Plan (same ID). Produced ONLY when the bind
// is injective; otherwise Bind refuses with DOMAIN_ALREADY_BOUND and produces no plan.
type BindPlan struct {
	// ID is the content address of the whole plan — the idempotency key. Same input → same ID.
	ID string `json:"id"`
	// Domain + Project echo the binding (normalized domain).
	Domain  string `json:"domain"`
	Project string `json:"project"`
	// URL is the HTTPS URL the custom domain serves the app at ("https://<domain>").
	URL string `json:"url"`
	// RouterName is the deterministic Traefik router name for this custom domain (DNS-safe).
	RouterName string `json:"router_name"`
	// CertResolver is the ACME certresolver Traefik uses to mint the domain's TLS certificate.
	CertResolver string `json:"cert_resolver"`
	// Labels are the Traefik docker labels (DP03/DP27) that make Traefik serve the app on the
	// custom domain over HTTPS — a websecure router on Host(`<domain>`) + tls + certresolver +
	// an HTTP→HTTPS redirect. Rendered deterministically, in canonical order.
	Labels []Label `json:"labels"`
	// DNS is the CNAME instruction the user applies to point the domain at the deploy host.
	DNS DNSRecord `json:"dns"`
}

// normalizeDomain canonicalises a domain for matching: lower-cased, scheme stripped, trailing dot
// and path/port removed. Deterministic — "HTTPS://Shop.Acme.com./" and "shop.acme.com" match.
func normalizeDomain(d string) string {
	s := strings.TrimSpace(strings.ToLower(d))
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	if i := strings.IndexAny(s, "/:"); i >= 0 {
		s = s[:i]
	}
	s = strings.TrimSuffix(s, ".")
	return s
}

// validDomain reports whether a normalized domain is a plausible DNS hostname: at least one dot,
// only DNS-safe characters (letters, digits, hyphen, dot), no empty label, no leading/trailing
// hyphen per label. Pure structural check — invents nothing.
func validDomain(d string) bool {
	if d == "" || !strings.Contains(d, ".") {
		return false
	}
	for _, label := range strings.Split(d, ".") {
		if label == "" || strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return false
		}
		for _, r := range label {
			if !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-') {
				return false
			}
		}
	}
	return true
}

// malformedBlock is the typed refusal for a malformed/empty request (reuses OUT_OF_SCOPE, exactly
// as deploy/preview do for a malformed source). It invents no owner.
func malformedBlock(reason string) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:        blockreason.CodeOutOfScope,
		Severity:    blockreason.SeverityBlocking,
		Explanation: "Custom-domain binding refused: " + reason,
		HowToFix: []string{
			"Provide a valid custom domain (a DNS hostname with at least one dot, DNS-safe labels) and a non-empty project",
			"Provide the deploy host (subdomain + root) the custom domain CNAMEs to (S96 deploy plan)",
			"Provide the emitted server service the Traefik router routes to (honoemit RoleServer service)",
		},
	}
}

// alreadyBoundBlock is the DOMAIN_ALREADY_BOUND refusal. It REUSES the canonical registry entry
// (blockreason.For) and appends the owning project so the refusal NAMES who already owns the
// domain — never a silent re-point.
func alreadyBoundBlock(domain, owner string) blockreason.BlockReason {
	br := blockreason.For(blockreason.CodeDomainAlreadyBound)
	br.Explanation += fmt.Sprintf(" Le domaine %q est déjà lié au projet %q.", domain, owner)
	return br
}

// routerNameOf mints the deterministic Traefik router name for a custom domain: "app-" + the
// domain with non-alphanumerics replaced by "-" (DNS-safe, stable). Same domain → same router.
func routerNameOf(domain string) string {
	var b strings.Builder
	b.WriteString("app-")
	for _, r := range domain {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else {
			b.WriteRune('-')
		}
	}
	return b.String()
}

// renderLabels renders the Traefik routing labels (DP03/DP27) that serve the app on the custom
// domain over HTTPS with an ACME certresolver — the /data/dockers convention. The labels are
// emitted in CANONICAL order (the same order honoemit uses), so the plan is byte-stable.
func renderLabels(router, domain, service, certResolver string) []Label {
	return []Label{
		{Label: "traefik.enable", Value: "true"},
		{Label: fmt.Sprintf("traefik.http.routers.%s.rule", router), Value: fmt.Sprintf("Host(`%s`)", domain)},
		{Label: fmt.Sprintf("traefik.http.routers.%s.entrypoints", router), Value: "websecure"},
		{Label: fmt.Sprintf("traefik.http.routers.%s.tls", router), Value: "true"},
		{Label: fmt.Sprintf("traefik.http.routers.%s.tls.certresolver", router), Value: certResolver},
		{Label: fmt.Sprintf("traefik.http.routers.%s.service", router), Value: service},
		// The HTTP companion router that redirects http→https (the same /data/dockers convention).
		{Label: fmt.Sprintf("traefik.http.routers.%s-http.rule", router), Value: fmt.Sprintf("Host(`%s`)", domain)},
		{Label: fmt.Sprintf("traefik.http.routers.%s-http.entrypoints", router), Value: "web"},
		{Label: fmt.Sprintf("traefik.http.routers.%s-http.middlewares", router), Value: router + "-redirect"},
		{Label: fmt.Sprintf("traefik.http.middlewares.%s-redirect.redirectscheme.scheme", router), Value: "https"},
	}
}

// Bind computes the deterministic, content-addressed BindPlan for a custom-domain request, given
// the existing registry. PURE:
//
//  1. validate the request (a valid domain, a project, a deploy host, a server service).
//  2. INJECTIVITY CHECK FIRST — if the domain is already bound to ANOTHER project, REFUSE with
//     DOMAIN_ALREADY_BOUND naming the owner (fail-closed) — never re-point silently. Re-binding to
//     the SAME project is idempotent (allowed).
//  3. RENDER the Traefik HTTPS labels (DP27, ACME certresolver) + the DNS CNAME instruction.
//  4. content-address the whole plan. Same input → byte-identical Plan. Writes nothing (the wall).
func Bind(reg Registry, req Request) (BindPlan, *blockreason.BlockReason) {
	domain := normalizeDomain(req.Domain)
	if !validDomain(domain) {
		br := malformedBlock(fmt.Sprintf("invalid custom domain %q", req.Domain))
		return BindPlan{}, &br
	}
	if strings.TrimSpace(req.Project) == "" {
		br := malformedBlock("empty project")
		return BindPlan{}, &br
	}
	if req.DeploySubdomain == "" || req.DeployRoot == "" {
		br := malformedBlock("missing deploy host (subdomain + root) the custom domain CNAMEs to")
		return BindPlan{}, &br
	}
	if strings.TrimSpace(req.ServerService) == "" {
		br := malformedBlock("missing emitted server service the Traefik router routes to")
		return BindPlan{}, &br
	}

	// 2. INJECTIVITY CHECK FIRST — a domain belongs to exactly one project.
	idx, err := reg.index()
	if err != nil {
		br := malformedBlock(err.Error())
		return BindPlan{}, &br
	}
	if owner, ok := idx[domain]; ok && owner != req.Project {
		br := alreadyBoundBlock(domain, owner)
		return BindPlan{}, &br
	}

	certResolver := req.CertResolver
	if certResolver == "" {
		certResolver = DefaultCertResolver
	}
	router := routerNameOf(domain)
	labels := renderLabels(router, domain, req.ServerService, certResolver)
	deployHost := req.DeploySubdomain + "." + req.DeployRoot

	plan := BindPlan{
		Domain:       domain,
		Project:      req.Project,
		URL:          "https://" + domain,
		RouterName:   router,
		CertResolver: certResolver,
		Labels:       labels,
		DNS: DNSRecord{
			Type:  "CNAME",
			Name:  domain,
			Value: deployHost,
		},
	}
	id, err := plan.contentAddress()
	if err != nil {
		br := malformedBlock("cannot content-address the bind plan: " + err.Error())
		return BindPlan{}, &br
	}
	plan.ID = id
	return plan, nil
}

// contentAddress hashes the canonical plan body (every field except ID) into the plan's ID — the
// idempotency key. S02 reused (Canonicalize+Hash), never a forked scheme.
func (p BindPlan) contentAddress() (string, error) {
	labels := make([]map[string]string, len(p.Labels))
	for i, l := range p.Labels {
		labels[i] = map[string]string{"label": l.Label, "value": l.Value}
	}
	body := map[string]any{
		"domain":        p.Domain,
		"project":       p.Project,
		"url":           p.URL,
		"router_name":   p.RouterName,
		"cert_resolver": p.CertResolver,
		"labels":        labels,
		"dns": map[string]string{
			"type":  p.DNS.Type,
			"name":  p.DNS.Name,
			"value": p.DNS.Value,
		},
	}
	canon, err := records.Canonicalize(mustJSON(body))
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// ServesHTTPS reports whether a bind plan's emitted labels actually serve the app on the custom
// domain over HTTPS: a websecure router on Host(`<domain>`) with tls + an ACME certresolver. PURE
// — code judges the labels, never an agent. The done-criteria Godog check (« un domaine custom
// sert l'app en HTTPS ») asserts this over the rendered plan.
func ServesHTTPS(p BindPlan) bool {
	want := map[string]bool{
		fmt.Sprintf("traefik.http.routers.%s.entrypoints", p.RouterName):      false,
		fmt.Sprintf("traefik.http.routers.%s.tls", p.RouterName):              false,
		fmt.Sprintf("traefik.http.routers.%s.tls.certresolver", p.RouterName): false,
		fmt.Sprintf("traefik.http.routers.%s.rule", p.RouterName):             false,
	}
	hostRule := fmt.Sprintf("Host(`%s`)", p.Domain)
	for _, l := range p.Labels {
		switch l.Label {
		case fmt.Sprintf("traefik.http.routers.%s.entrypoints", p.RouterName):
			want[l.Label] = l.Value == "websecure"
		case fmt.Sprintf("traefik.http.routers.%s.tls", p.RouterName):
			want[l.Label] = l.Value == "true"
		case fmt.Sprintf("traefik.http.routers.%s.tls.certresolver", p.RouterName):
			want[l.Label] = l.Value != ""
		case fmt.Sprintf("traefik.http.routers.%s.rule", p.RouterName):
			want[l.Label] = l.Value == hostRule
		}
	}
	for _, ok := range want {
		if !ok {
			return false
		}
	}
	return strings.HasPrefix(p.URL, "https://")
}

// IsInjective reports whether a set of bindings maps every domain to AT MOST ONE project — the
// done-criteria property (the binding domain→project is injective). PURE — code judges, never an
// agent. A domain bound to two DIFFERENT projects breaks injectivity. Domains are normalized
// before comparison so "Shop.Acme.com" and "shop.acme.com" count as the same domain.
func IsInjective(bindings []Binding) bool {
	idx := make(map[string]string, len(bindings))
	keys := make([]string, 0, len(bindings))
	for _, b := range bindings {
		d := normalizeDomain(b.Domain)
		if owner, ok := idx[d]; ok && owner != b.Project {
			return false
		}
		if _, ok := idx[d]; !ok {
			keys = append(keys, d)
		}
		idx[d] = b.Project
	}
	sort.Strings(keys) // determinism: the check is order-independent.
	return true
}
