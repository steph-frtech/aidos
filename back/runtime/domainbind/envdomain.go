// envdomain.go — DP27: CABLAGE DU DOMAINE CUSTOM DANS L'ENVIRONNEMENT (DP06).
//
// THE CAPABILITY (DP27, EPIC F). S97 (domainbind.go) plans the binding of a custom domain to a
// deployed app — the injective domain→project registry, the Traefik HTTPS labels, the DNS CNAME.
// DP27 EXTENDS it (it does not break it): it CABLES a custom domain into ONE of the FIVE closed
// DP06 environments (envbindings — prod/staging/dev/local/future_cloud) and EMITS the Traefik
// HTTPS labels that serve the app there. It REUSES, never re-emits a 2nd divergent jeu:
//
//   - the SAME canonical Traefik HTTPS label set DP03 emits — composeemit.TraefikHTTPSLabels —
//     so the compose YAML and the custom-domain binding can NEVER drift (one source) ;
//   - the SAME S97 normalisation/validation (normalizeDomain/validDomain) and the SAME injective
//     registry rule (Bind/IsInjective) — DP27 does not fork them ;
//   - the SAME DP06 environment resolution (envbindings.BindingsFor) — the TLS flag, the managed
//     flag — so DP27 consults the declared environment, never an invented one.
//
// THE TLS RULE (DP06). A custom domain serves the app over HTTPS, so it requires an environment
// that terminates TLS (Traefik certresolver). prod/staging/dev/future_cloud do; local does NOT
// (it serves http://localhost:${APP_PORT}). Cabling a custom HTTPS domain into local is REFUSED
// (fail-closed) — never a silent http downgrade.
//
// THE WALL (CLAUDE.md §2). The domain ROUTING (the emitted labels) is a below-the-line projection
// — ResolveInEnvironment computes it and writes nothing. But the domain IN THE ENVIRONMENT is an
// environment TRUTH: it moves through propose → ChangeSet → approval (the DP24 connectordeclare
// pattern), never a direct write. ProposeEnvironmentDomain opens a DRAFT ChangeSet (S20) wrapping
// the env-domain source as the spec_delta and its mirror reference as the mirror_delta (so the
// envelope is COMPLETE — a spec without its mirror is a monster); it ALWAYS returns StatusDraft —
// the agent never reaches APPLIED (the human applies, through the aidos writer role).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). ResolveInEnvironment and ProposeEnvironmentDomain are PURE,
// TOTAL functions of their canonicalised input — no clock, no rng, no I/O, no LLM. Same binding +
// env → byte-identical EnvDomainBinding / byte-identical proposed ChangeSet. The injectivity check
// is a deterministic name-match (S97), never a judgment. The reproducibility mirror pins it.
package domainbind

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/composeemit"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
)

// redirectMiddlewareOf mints the deterministic HTTP→HTTPS redirect middleware name for a custom
// domain's router: "<router>-redirect" (the S97 renderLabels convention, kept stable). Same router
// → same middleware.
func redirectMiddlewareOf(router string) string { return router + "-redirect" }

// EnvDomainBinding is the DETERMINISTIC result of cabling a custom domain into ONE DP06
// environment: the resolved domain for that env (a) and the Traefik HTTPS labels emitted to serve
// the app there (b, the DP03-canonical set). PURE — same binding + env → byte-identical binding.
// It writes nothing; the truth-write (the domain IN the Environment) is ProposeEnvironmentDomain.
type EnvDomainBinding struct {
	// Environment — the DP06 scope.Environment the custom domain is cabled into.
	Environment scope.Environment `json:"environment"`
	// Domain + Project echo the S97 Binding (normalized domain). One domain, one project.
	Domain  string `json:"domain"`
	Project string `json:"project"`
	// URL is the HTTPS URL the custom domain serves the app at in this environment.
	URL string `json:"url"`
	// RouterName is the deterministic Traefik router name (DNS-safe, the S97 routerNameOf).
	RouterName string `json:"router_name"`
	// RedirectMiddleware is the HTTP→HTTPS redirect middleware name for this router.
	RedirectMiddleware string `json:"redirect_middleware"`
	// CertResolver is the ACME certresolver Traefik uses to mint the domain's TLS certificate.
	CertResolver string `json:"cert_resolver"`
	// TLS — whether the environment terminates TLS (always true for an accepted custom HTTPS domain).
	TLS bool `json:"tls"`
	// Managed — whether the environment is a managed-cloud target (future_cloud).
	Managed bool `json:"managed"`
	// Labels are the EMITTED Traefik labels (DP03 reused — composeemit.TraefikHTTPSLabels): the
	// websecure router on Host(`<domain>`) + tls + the ACME certresolver + the HTTP→HTTPS redirect.
	Labels []Label `json:"labels"`
}

// envDomainBlock is the typed refusal for an invalid env-domain cabling. It REUSES OUT_OF_SCOPE
// (exactly as S97's malformedBlock) and carries an actionable how_to_fix — never a prison.
func envDomainBlock(reason string) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:        blockreason.CodeOutOfScope,
		Severity:    blockreason.SeverityBlocking,
		Explanation: "Câblage du domaine custom dans l'environnement refusé : " + reason,
		HowToFix: []string{
			"Fournissez un domaine custom valide (un hôte DNS avec au moins un point, des labels DNS-safe) et un projet non vide.",
			"Choisissez un environnement DP06 connu (prod|staging|dev|local|future_cloud) qui termine le TLS — un domaine HTTPS exige un certresolver Traefik.",
			"Pour servir en local (sans TLS), gardez le sous-domaine de déploiement http://localhost:${APP_PORT} — un domaine custom HTTPS n'y est pas servable.",
		},
	}
}

// ResolveInEnvironment is the PURE DP27 cabling: given a custom-domain Binding (S97) and a DP06
// scope.Environment, it (a) RESOLVES the domain for that env and (b) EMITS the Traefik HTTPS labels
// that serve the app there — the DP03-canonical set (composeemit.TraefikHTTPSLabels), reused, never
// a 2nd divergent jeu. It:
//
//  1. validates the binding (the S97 normalizeDomain/validDomain + a non-empty project) ;
//  2. resolves the environment (envbindings.BindingsFor — an unknown env is refused, fail-closed) ;
//  3. REQUIRES TLS — a custom HTTPS domain needs a TLS-terminating env; local (no TLS) is refused ;
//  4. emits the canonical DP03 labels (no loadbalancer port — the binding routes to the already-
//     declared service, port 0) and the HTTPS URL.
//
// Writes nothing (the wall). The injective registry rule (a domain belongs to exactly one project)
// is preserved by S97's Bind/IsInjective — DP27 does not fork it.
func ResolveInEnvironment(b Binding, env scope.Environment) (EnvDomainBinding, *blockreason.BlockReason) {
	domain := normalizeDomain(b.Domain)
	if !validDomain(domain) {
		br := envDomainBlock(fmt.Sprintf("domaine custom invalide %q", b.Domain))
		return EnvDomainBinding{}, &br
	}
	if b.Project == "" {
		br := envDomainBlock("projet vide")
		return EnvDomainBinding{}, &br
	}

	envBinding, err := envbindings.BindingsFor(env)
	if err != nil {
		br := envDomainBlock(err.Error())
		return EnvDomainBinding{}, &br
	}
	if !envBinding.TLS {
		br := envDomainBlock(fmt.Sprintf("l'environnement %q ne termine pas le TLS — un domaine custom HTTPS n'y est pas servable", env))
		return EnvDomainBinding{}, &br
	}

	router := routerNameOf(domain)
	redirect := redirectMiddlewareOf(router)
	certResolver := DefaultCertResolver
	// REUSE the DP03 canonical Traefik HTTPS label set (one source, no drift). Port 0 → the
	// loadbalancer port label is omitted (the custom domain routes to the already-declared service).
	dp03 := composeemit.TraefikHTTPSLabels(router, domain, certResolver, redirect, 0)
	labels := make([]Label, len(dp03))
	for i, l := range dp03 {
		labels[i] = Label{Label: l.Key, Value: l.Value}
	}

	return EnvDomainBinding{
		Environment:        env,
		Domain:             domain,
		Project:            b.Project,
		URL:                "https://" + domain,
		RouterName:         router,
		RedirectMiddleware: redirect,
		CertResolver:       certResolver,
		TLS:                true,
		Managed:            envBinding.Managed,
		Labels:             labels,
	}, nil
}

// EnvServesHTTPS reports whether an env-domain binding's EMITTED labels actually serve the app over
// HTTPS: a websecure router on Host(`<domain>`) with tls + an ACME certresolver. PURE — code judges
// the labels, never an agent. It REUSES the S97 ServesHTTPS judgment by adapting the env binding to
// a BindPlan view (the same label vocabulary, one source).
func EnvServesHTTPS(b EnvDomainBinding) bool {
	return ServesHTTPS(BindPlan{
		Domain:     b.Domain,
		URL:        b.URL,
		RouterName: b.RouterName,
		Labels:     b.Labels,
	})
}

// --- DP27 PROPOSE PATH (the domain IN the Environment is an environment truth) ---

// parentPhaseEnvDomain is the stable phase an env-domain ChangeSet branches from. Declared (not
// invented per call) so the proposed envelope is byte-stable across calls.
const parentPhaseEnvDomain = "env-domain"

// specDeltaTargetEnvDomain is the layer the spec_delta touches: an env-domain binding source.
const specDeltaTargetEnvDomain = "env_domain_binding"

// mirrorReflectsEnvDomain names the mirror the env-domain declaration reflects — keeps the envelope
// COMPLETE (a spec_delta always carries its mirror_delta) so changeset.SpecHasMirror never refuses
// it as a monster.
const mirrorReflectsEnvDomain = "runtime.domainbind.env-domain"

// envDomainSpecBody is the canonical spec_delta body the aidos writer role would grave: the
// resolved env-domain binding (env, domain, project, url, certresolver, the emitted labels). It is
// content-addressed via the S20 changeset hash; the ordering is the EnvDomainBinding struct's.
func envDomainSpecBody(eb EnvDomainBinding) ([]byte, error) {
	labels := make([]map[string]string, len(eb.Labels))
	for i, l := range eb.Labels {
		labels[i] = map[string]string{"label": l.Label, "value": l.Value}
	}
	body := map[string]any{
		"environment":   string(eb.Environment),
		"domain":        eb.Domain,
		"project":       eb.Project,
		"url":           eb.URL,
		"router_name":   eb.RouterName,
		"cert_resolver": eb.CertResolver,
		"labels":        labels,
	}
	return records.Canonicalize(mustJSON(body))
}

// ProposeEnvironmentDomain is the PURE DP27 propose gesture (the DP24 connectordeclare pattern):
// the domain IN the Environment is an environment TRUTH, so it moves through propose → ChangeSet →
// approval, NEVER a direct write. It (1) RESOLVES the cabling (ResolveInEnvironment — a malformed
// binding or a no-TLS env is refused, NO DRAFT for a monster), then (2) OPENS a DRAFT ChangeSet
// (S20 changeset.Open) wrapping the resolved env-domain source as the spec_delta and its mirror
// reference as the mirror_delta (so the envelope is COMPLETE). It RETURNS the proposed ChangeSet;
// it NEVER applies it (the agent has no GRANT — the wall). The returned ChangeSet always carries:
//
//   - Status == changeset.StatusDraft  (NEVER APPLIED — the human applies, via the aidos writer
//     role, through /goal → approval) ;
//   - AppliedAt == nil ;
//   - a non-nil SpecDelta AND a non-nil MirrorDelta (SpecHasMirror passes — no monster) ;
//   - a content-addressed ID (the S20 hash — same binding + env ⇒ same id).
//
// On an invalid input it returns the S13 BlockReason (as an error) and an EMPTY ChangeSet — no
// DRAFT for a binding that could never be served. PURE: no DB, no clock, no rng, no I/O.
func ProposeEnvironmentDomain(b Binding, env scope.Environment) (changeset.ChangeSet, error) {
	eb, br := ResolveInEnvironment(b, env)
	if br != nil {
		return changeset.ChangeSet{}, fmt.Errorf("env-domain refusé : %s", br.Explanation)
	}

	specBody, err := envDomainSpecBody(eb)
	if err != nil {
		return changeset.ChangeSet{}, fmt.Errorf("domainbind: canonical body of a valid env-domain failed: %w", err)
	}
	spec := &changeset.Delta{
		Kind:   "add",
		Target: specDeltaTargetEnvDomain,
		Body:   json.RawMessage(specBody),
	}
	mirrorBody, err := json.Marshal(map[string]string{"reflects": mirrorReflectsEnvDomain, "test_kind": "fixture"})
	if err != nil {
		return changeset.ChangeSet{}, fmt.Errorf("domainbind: env-domain mirror_delta marshal failed: %w", err)
	}
	mirror := &changeset.Delta{
		Kind:   "add",
		Target: mirrorReflectsEnvDomain,
		Body:   json.RawMessage(mirrorBody),
	}

	cs, err := changeset.Open(envDomainLabel(eb), parentPhaseEnvDomain, spec, mirror)
	if err != nil {
		return changeset.ChangeSet{}, fmt.Errorf("domainbind: opening the env-domain changeset failed: %w", err)
	}
	return cs, nil
}

// envDomainLabel renders the human label of an env-domain ChangeSet, deterministically from the
// env + domain (e.g. "cable domain prod: shop.acme.com"). Pure — same input ⇒ same label.
func envDomainLabel(eb EnvDomainBinding) string {
	return fmt.Sprintf("cable domain %s: %s", eb.Environment, eb.Domain)
}
