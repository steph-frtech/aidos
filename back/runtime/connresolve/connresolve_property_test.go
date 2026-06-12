package connresolve_test

// Property mirror (∀ N1) for DP07 — the deterministic connection-mode
// PROJECTION resolveConnection(service, environment) → ConnectionMode ∈
// {docker_internal, traefik_url, managed_url} (ROADMAP-provisioning-deploy
// EPIC B), plus the emitted TS config module (process.env) the Hono server
// consumes at boot.
// reflects=runtime.connresolve, test_kind=property, cert_language=rapid,
// liveness=live. Written FIRST and red (no non-test Go files → compile fail),
// then green — the red IS the /goal (CLAUDE.md §6).
//
// The laws (DP07 done-criteria + SPEC-stack-2026: « AUCUNE URL/secret en dur —
// tout par variables d'environnement »):
//
//   1. DETERMINISM (the reproducibility mirror). Same (service, environment)
//      → same Resolution, every time — the resolution is an ALGORITHM, never
//      a prompt.
//   2. TOTALITY OVER THE CLOSED SETS. Every known role × known environment
//      resolves without error, and the mode is inside the CLOSED three-member
//      set {docker_internal, traefik_url, managed_url}.
//   3. FAIL-CLOSED ON THE UNKNOWN. An out-of-set environment is refused
//      UNKNOWN_ENVIRONMENT (the DP06 code reused verbatim); an out-of-set
//      role is refused UNKNOWN_ROLE; an unnamed service UNNAMED_SERVICE —
//      never guessed.
//   4. NO HARDCODED ENDPOINT, EVER. ∀ resolutions: the endpoint pattern
//      carries NO localhost, NO IP literal, NO literal domain — its host is
//      built from ${VAR} references only (the DP03–DP05 law).
//   5. PROD WIRES INTERNALLY. In prod (and every self-hosted environment) a
//      non-server, non-connector service resolves docker_internal — host =
//      the /data/dockers container-name convention (${APP_NAME}-<name>),
//      port = the declared internal port. Never localhost, never an IP.
//   6. CLOUD IS MANAGED. A connector-role service resolves managed_url in
//      EVERY environment; in future_cloud (the managed environment binding,
//      DP06) EVERY service resolves managed_url; the managed endpoint is
//      EXACTLY one ${VAR} reference whose value comes from the secret store
//      (S91) at boot — never from the emitted source.
//   7. PUBLIC EXPOSURE IS TRAEFIK. The server role resolves traefik_url
//      (https://${APP_SUBDOMAIN}.${DOMAIN}) in every traefik_default
//      environment (prod/staging/dev), and docker_internal on the local
//      machine (no reverse proxy there).
//   8. THE EMITTED MODULE IS PURE process.env. EmitConnectionsModule is
//      byte-identical across runs, reads every endpoint via requireEnv(...)
//      (process.env), and contains no hardcoded host/IP/secret.
//   9. THE DEMO MATRIX IS PINNED. HashDemoMatrix() reproduces the
//      Go-authoritative address consumed by the TS twin
//      (front/web/lib/connections.ts) and the Playwright e2e — byte-for-byte.

import (
	"bytes"
	"regexp"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/connresolve"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
	"pgregory.net/rapid"
)

// goMatrixHash is the Go-AUTHORITATIVE content address of the demo
// resolution matrix — the byte-for-byte pin the TS twin
// (front/web/lib/connections.ts) and the Playwright e2e reproduce.
const goMatrixHash = "eb382dcff9243e410ceb6d7bbfe79a942d3845d3adba1f3732439bdb39f45772"

var ipLiteral = regexp.MustCompile(`\d+\.\d+\.\d+\.\d+`)

// drawKnownEnv draws one of the five closed environments (S15 + DP06).
func drawKnownEnv(rt *rapid.T) scope.Environment {
	envs := scope.Environments()
	return envs[rapid.IntRange(0, len(envs)-1).Draw(rt, "env")]
}

// drawKnownRole draws one of the closed DP02 roles.
func drawKnownRole(rt *rapid.T) stackmanifest.Role {
	roles := stackmanifest.Roles()
	return roles[rapid.IntRange(0, len(roles)-1).Draw(rt, "role")]
}

// drawService draws a well-formed service over the closed role set.
func drawService(rt *rapid.T) stackmanifest.Service {
	return stackmanifest.Service{
		Name:         rapid.StringMatching(`[a-z][a-z0-9-]{0,14}`).Draw(rt, "name"),
		Role:         drawKnownRole(rt),
		InternalPort: rapid.IntRange(1, 65535).Draw(rt, "port"),
	}
}

// TestResolveConnectionDeterministic — law 1: same (service, env) → same
// Resolution, twice (the reproducibility mirror; determinism-first §6).
func TestResolveConnectionDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		svc := drawService(rt)
		env := drawKnownEnv(rt)
		a, errA := connresolve.ResolveConnection(svc, env)
		b, errB := connresolve.ResolveConnection(svc, env)
		if (errA == nil) != (errB == nil) {
			t.Fatalf("non-deterministic error: %v vs %v", errA, errB)
		}
		if errA != nil {
			t.Fatalf("known service+env must resolve: %v", errA)
		}
		if a != b {
			t.Fatalf("non-deterministic resolution: %+v vs %+v", a, b)
		}
	})
}

// TestTotalityOverClosedSets — law 2: every known role × env resolves and the
// mode is in the closed three-member set.
func TestTotalityOverClosedSets(t *testing.T) {
	for _, role := range stackmanifest.Roles() {
		for _, env := range scope.Environments() {
			svc := stackmanifest.Service{Name: "svc", Role: role, InternalPort: 8080}
			res, err := connresolve.ResolveConnection(svc, env)
			if err != nil {
				t.Fatalf("role %s × env %s must resolve, got %v", role, env, err)
			}
			if !connresolve.IsKnownMode(res.Mode) {
				t.Fatalf("mode %q outside the closed set for %s × %s", res.Mode, role, env)
			}
		}
	}
	if got := len(connresolve.Modes()); got != 3 {
		t.Fatalf("the connection-mode set is CLOSED at 3, got %d", got)
	}
}

// TestFailClosedOnUnknown — law 3: unknown env / role / empty name are
// refused with their closed codes, never guessed.
func TestFailClosedOnUnknown(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		bogusEnv := scope.Environment(rapid.StringMatching(`[a-z]{3,10}`).Draw(rt, "bogusEnv"))
		if scope.IsKnownEnvironment(bogusEnv) {
			return
		}
		svc := stackmanifest.Service{Name: "svc", Role: stackmanifest.RoleServer, InternalPort: 80}
		_, err := connresolve.ResolveConnection(svc, bogusEnv)
		var ref *envbindings.Refusal
		if !envbindings.AsRefusal(err, &ref) || ref.Code != envbindings.CodeUnknownEnvironment {
			t.Fatalf("unknown env must refuse UNKNOWN_ENVIRONMENT, got %v", err)
		}
	})
	// unknown role
	svc := stackmanifest.Service{Name: "svc", Role: stackmanifest.Role("quantum"), InternalPort: 80}
	_, err := connresolve.ResolveConnection(svc, scope.EnvProd)
	var ref *envbindings.Refusal
	if !envbindings.AsRefusal(err, &ref) || ref.Code != connresolve.CodeUnknownRole {
		t.Fatalf("unknown role must refuse UNKNOWN_ROLE, got %v", err)
	}
	// unnamed service
	_, err = connresolve.ResolveConnection(stackmanifest.Service{Role: stackmanifest.RoleServer, InternalPort: 80}, scope.EnvProd)
	if !envbindings.AsRefusal(err, &ref) || ref.Code != connresolve.CodeUnnamedService {
		t.Fatalf("unnamed service must refuse UNNAMED_SERVICE, got %v", err)
	}
}

// assertNoHardcodedEndpoint — law 4 helper: no localhost, no IP literal, no
// literal domain; the host is ${VAR}-built.
func assertNoHardcodedEndpoint(t interface{ Fatalf(string, ...any) }, where, s string) {
	low := strings.ToLower(s)
	if strings.Contains(low, "localhost") {
		t.Fatalf("%s carries a hardcoded localhost: %q", where, s)
	}
	if ipLiteral.MatchString(s) {
		t.Fatalf("%s carries a hardcoded IP literal: %q", where, s)
	}
	for _, dom := range []string{"sagedesk", ".fr", ".com", ".io", ".net"} {
		if strings.Contains(low, dom) {
			t.Fatalf("%s carries a literal domain %q: %q", where, dom, s)
		}
	}
}

// TestNoHardcodedEndpointEver — law 4: ∀ (service, env), the endpoint pattern
// is ${VAR} references only.
func TestNoHardcodedEndpointEver(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		svc := drawService(rt)
		env := drawKnownEnv(rt)
		res, err := connresolve.ResolveConnection(svc, env)
		if err != nil {
			t.Fatalf("must resolve: %v", err)
		}
		assertNoHardcodedEndpoint(t, "endpoint", res.EndpointPattern)
		if !strings.Contains(res.EndpointPattern, "${") {
			t.Fatalf("endpoint %q carries no ${VAR} reference", res.EndpointPattern)
		}
		if len(res.EnvVars) == 0 {
			t.Fatalf("resolution %+v declares no env vars — the boot module needs them", res)
		}
	})
}

// TestProdWiresDockerInternal — law 5: in prod a non-server, non-connector
// service is docker_internal with the /data/dockers container-name convention.
func TestProdWiresDockerInternal(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		svc := drawService(rt)
		if svc.Role == stackmanifest.RoleServer || svc.Role == stackmanifest.RoleConnector {
			return
		}
		res, err := connresolve.ResolveConnection(svc, scope.EnvProd)
		if err != nil {
			t.Fatalf("must resolve: %v", err)
		}
		if res.Mode != connresolve.ModeDockerInternal {
			t.Fatalf("prod internal service %s must be docker_internal, got %s", svc.Role, res.Mode)
		}
		want := "${APP_NAME}-" + svc.Name + ":"
		if !strings.HasPrefix(res.EndpointPattern, want) {
			t.Fatalf("docker_internal host must follow the container-name convention %q, got %q", want, res.EndpointPattern)
		}
	})
}

// TestCloudIsManaged — law 6: connector → managed_url everywhere;
// future_cloud → managed_url for everything; the managed endpoint is exactly
// one ${VAR} reference (resolved from the S91 secret store at boot).
func TestCloudIsManaged(t *testing.T) {
	exactRef := regexp.MustCompile(`^\$\{[A-Z][A-Z0-9_]*\}$`)
	rapid.Check(t, func(rt *rapid.T) {
		svc := drawService(rt)
		env := drawKnownEnv(rt)
		res, err := connresolve.ResolveConnection(svc, env)
		if err != nil {
			t.Fatalf("must resolve: %v", err)
		}
		isCloud := svc.Role == stackmanifest.RoleConnector || env == scope.EnvFutureCloud
		if isCloud && res.Mode != connresolve.ModeManagedURL {
			t.Fatalf("%s × %s must be managed_url, got %s", svc.Role, env, res.Mode)
		}
		if res.Mode == connresolve.ModeManagedURL && !exactRef.MatchString(res.EndpointPattern) {
			t.Fatalf("managed endpoint must be EXACTLY one ${VAR} reference, got %q", res.EndpointPattern)
		}
	})
}

// TestPublicExposureIsTraefik — law 7: server → traefik_url on
// traefik_default environments, docker_internal on local.
func TestPublicExposureIsTraefik(t *testing.T) {
	svc := stackmanifest.Service{Name: "server", Role: stackmanifest.RoleServer, InternalPort: 3000}
	for _, env := range []scope.Environment{scope.EnvProd, scope.EnvStaging, scope.EnvDev} {
		res, err := connresolve.ResolveConnection(svc, env)
		if err != nil {
			t.Fatalf("must resolve: %v", err)
		}
		if res.Mode != connresolve.ModeTraefikURL {
			t.Fatalf("server × %s must be traefik_url, got %s", env, res.Mode)
		}
		if res.EndpointPattern != "https://${APP_SUBDOMAIN}.${DOMAIN}" {
			t.Fatalf("traefik_url pattern must be https://${APP_SUBDOMAIN}.${DOMAIN}, got %q", res.EndpointPattern)
		}
	}
	res, err := connresolve.ResolveConnection(svc, scope.EnvLocal)
	if err != nil {
		t.Fatalf("must resolve: %v", err)
	}
	if res.Mode != connresolve.ModeDockerInternal {
		t.Fatalf("server × local (no reverse proxy) must be docker_internal, got %s", res.Mode)
	}
}

// TestEmittedModuleIsPureProcessEnv — law 8: the emitted TS config module is
// byte-identical across runs and reads everything via process.env.
func TestEmittedModuleIsPureProcessEnv(t *testing.T) {
	m := connresolve.DemoManifest()
	for _, env := range scope.Environments() {
		a, errA := connresolve.EmitConnectionsModule(m, env)
		b, errB := connresolve.EmitConnectionsModule(m, env)
		if errA != nil || errB != nil {
			t.Fatalf("emit must succeed: %v %v", errA, errB)
		}
		if !bytes.Equal(a, b) {
			t.Fatalf("EmitConnectionsModule is not byte-identical for %s", env)
		}
		src := string(a)
		assertNoHardcodedEndpoint(t, "emitted module", src)
		if !strings.Contains(src, "process.env") {
			t.Fatalf("the emitted module must read process.env")
		}
		if !strings.Contains(src, "requireEnv(") {
			t.Fatalf("the emitted module must gate every endpoint through requireEnv")
		}
		if !strings.Contains(src, "DO NOT EDIT") {
			t.Fatalf("the emitted module must carry the generated-only header")
		}
	}
}

// TestDemoMatrixPinned — law 9: the demo matrix is deterministic and pinned
// to the Go-authoritative address (the TS twin + e2e reproduce it).
func TestDemoMatrixPinned(t *testing.T) {
	h1, err := connresolve.HashDemoMatrix()
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	h2, err := connresolve.HashDemoMatrix()
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if h1 != h2 {
		t.Fatalf("HashDemoMatrix is not deterministic: %s vs %s", h1, h2)
	}
	if h1 != goMatrixHash {
		t.Fatalf("the demo matrix drifted from the Go-authoritative pin:\n got %s\nwant %s", h1, goMatrixHash)
	}
	// the demo matrix covers services × the five environments
	matrix, err := connresolve.DemoMatrix()
	if err != nil {
		t.Fatalf("matrix: %v", err)
	}
	wantRows := len(connresolve.DemoManifest().Services) * len(scope.Environments())
	if len(matrix) != wantRows {
		t.Fatalf("demo matrix must cover services × environments = %d rows, got %d", wantRows, len(matrix))
	}
}
