// Package connresolve is the DP07 PURE connection-mode projection
// (ROADMAP-provisioning-deploy EPIC B): resolveConnection(service,
// environment) → ConnectionMode ∈ {docker_internal, traefik_url,
// managed_url} — the algorithm that wires the emitted stack's services to
// each other and to the outside WITHOUT ONE hardcoded endpoint
// (SPEC-stack-2026: « AUCUNE URL/secret en dur — tout par variables
// d'environnement »).
//
// THE RULES (declared, never learned — §8):
//
//   - an environment whose DP06 binding is MANAGED (future_cloud) resolves
//     EVERYTHING to managed_url;
//   - a connector-role service (the external cloud service, EPIC E) resolves
//     managed_url in EVERY environment — its URL comes from the S91 secret
//     store at boot (${<SERVICE>_MANAGED_URL}), never from the emitted source;
//   - the server role (the public exposure) resolves traefik_url
//     (https://${APP_SUBDOMAIN}.${DOMAIN}) on every traefik_default
//     environment (prod/staging/dev — /data/dockers conventions), and
//     docker_internal on the local machine (no reverse proxy there);
//   - every other service↔service edge is docker_internal: host = the
//     /data/dockers container-name convention (${APP_NAME} for the server,
//     ${APP_NAME}-<name> otherwise), port = the declared internal port, on
//     the shared docker network. Never localhost, never an IP.
//
// THE EMITTED MODULE: EmitConnectionsModule(manifest, env) renders the TS
// config module the emitted Hono server consumes AT BOOT — every endpoint is
// rebuilt from process.env (requireEnv, fail-closed MISSING_ENV_AT_BOOT),
// so the emitted SOURCE carries references only (DP08 will ratchet this
// structurally).
//
// PURE (CLAUDE.md §6 determinism-first): no DB, no clock, no rng, no I/O —
// a total function of (service, environment); the projection is
// content-addressed via records.Hash(records.Canonicalize(...)) (S02 reused).
// THE WALL (§2): below-the-line projection — this package writes nothing;
// it consumes the DP06 envbindings projection and the DP02 stackmanifest
// closed sets verbatim (published contracts, never forked).
package connresolve

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
)

// Mode is the CLOSED connection-mode set (DP07): an unknown mode does not
// exist — the resolver is total over the closed inputs.
type Mode string

const (
	// ModeDockerInternal — service↔service on the shared docker network:
	// host = container name (${APP_NAME}[-<service>]), port = internal port.
	ModeDockerInternal Mode = "docker_internal"
	// ModeTraefikURL — the public exposure through Traefik:
	// https://${APP_SUBDOMAIN}.${DOMAIN} (labels, websecure, certresolver).
	ModeTraefikURL Mode = "traefik_url"
	// ModeManagedURL — an externally managed URL (cloud connector / managed
	// environment), resolved from the Environment binding + the S91 secret
	// store at boot — NEVER from the emitted source.
	ModeManagedURL Mode = "managed_url"
)

var modeOrder = []Mode{ModeDockerInternal, ModeTraefikURL, ModeManagedURL}

// Modes returns the closed mode set in canonical order.
func Modes() []Mode {
	out := make([]Mode, len(modeOrder))
	copy(out, modeOrder)
	return out
}

// IsKnownMode reports whether m is a member of the closed set.
func IsKnownMode(m Mode) bool {
	for _, k := range modeOrder {
		if k == m {
			return true
		}
	}
	return false
}

// The closed refusal codes added by DP07 (package-local, the DP02 motif —
// never new members of the frozen blockreason enum). UNKNOWN_ENVIRONMENT is
// REUSED from envbindings (the DP06 published contract).
const (
	// CodeUnknownRole — the service role is outside the closed DP02 set.
	CodeUnknownRole = "UNKNOWN_ROLE"
	// CodeUnnamedService — a service without a name cannot be wired.
	CodeUnnamedService = "UNNAMED_SERVICE"
)

// Resolution is HOW a consumer reaches one service in one environment —
// a below-the-line projection value. EndpointPattern carries ${VAR}
// REFERENCES ONLY, never a value; EnvVars lists the process.env variables
// the emitted boot module reads to materialize it.
type Resolution struct {
	Service         string             `json:"service"`
	Role            stackmanifest.Role `json:"role"`
	Environment     scope.Environment  `json:"environment"`
	Mode            Mode               `json:"mode"`
	EndpointPattern string             `json:"endpoint_pattern"`
	EnvVars         string             `json:"env_vars"`
}

// managedVar derives the S91 secret-store env-var reference for a service:
// <NAME>_MANAGED_URL with the name upper-snaked. Deterministic, total.
func managedVar(name string) string {
	up := strings.ToUpper(name)
	var b strings.Builder
	for _, r := range up {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	return b.String() + "_MANAGED_URL"
}

// containerHost is the /data/dockers container-name convention (DP03 reused):
// the primary server is ${APP_NAME}, every other service ${APP_NAME}-<name>.
func containerHost(svc stackmanifest.Service) string {
	if svc.Role == stackmanifest.RoleServer {
		return "${APP_NAME}"
	}
	return "${APP_NAME}-" + svc.Name
}

// ResolveConnection is THE DP07 pure function: (service, environment) →
// Resolution. Fail-closed on anything outside the closed sets; total and
// deterministic inside them. Never localhost, never an IP, never a value.
func ResolveConnection(svc stackmanifest.Service, env scope.Environment) (Resolution, error) {
	binding, err := envbindings.BindingsFor(env)
	if err != nil {
		return Resolution{}, err
	}
	if svc.Name == "" {
		return Resolution{}, &envbindings.Refusal{
			Code:    CodeUnnamedService,
			Message: "a service without a name cannot be wired — declare the service name in the StackManifest (idea → mirror → /goal)",
		}
	}
	if !stackmanifest.IsKnownRole(svc.Role) {
		return Resolution{}, &envbindings.Refusal{
			Code:    CodeUnknownRole,
			Message: fmt.Sprintf("role %q is outside the closed DP02 set (want %v) — widening the role set is a truth change: idea → mirror → /goal", svc.Role, stackmanifest.Roles()),
		}
	}

	res := Resolution{Service: svc.Name, Role: svc.Role, Environment: env}

	switch {
	case binding.Managed || svc.Role == stackmanifest.RoleConnector:
		// CLOUD IS MANAGED: the URL is a secret-store reference (S91),
		// resolved at boot — never present in the emitted source.
		v := managedVar(svc.Name)
		res.Mode = ModeManagedURL
		res.EndpointPattern = "${" + v + "}"
		res.EnvVars = v
	case svc.Role == stackmanifest.RoleServer && binding.Network == "traefik_default":
		// PUBLIC EXPOSURE IS TRAEFIK (prod/staging/dev — /data/dockers).
		res.Mode = ModeTraefikURL
		res.EndpointPattern = "https://${APP_SUBDOMAIN}.${DOMAIN}"
		res.EnvVars = "APP_SUBDOMAIN,DOMAIN"
	default:
		// SERVICE↔SERVICE IS DOCKER-INTERNAL: container name + internal port
		// on the shared network — never localhost, never an IP.
		res.Mode = ModeDockerInternal
		res.EndpointPattern = containerHost(svc) + ":" + strconv.Itoa(svc.InternalPort)
		res.EnvVars = "APP_NAME"
	}
	return res, nil
}

// ResolveMatrix resolves every manifest service across the five closed
// environments — services in stable (name) order, environments in
// scope.Environments() canonical order. The matrix the /environments screen
// renders.
func ResolveMatrix(m stackmanifest.StackManifest) ([]Resolution, error) {
	services := make([]stackmanifest.Service, len(m.Services))
	copy(services, m.Services)
	sort.Slice(services, func(i, j int) bool { return services[i].Name < services[j].Name })

	out := make([]Resolution, 0, len(services)*len(scope.Environments()))
	for _, env := range scope.Environments() {
		for _, svc := range services {
			res, err := ResolveConnection(svc, env)
			if err != nil {
				return nil, err
			}
			out = append(out, res)
		}
	}
	return out, nil
}

// DemoManifest is the REPRESENTATIVE below-the-line demo stack the
// /environments matrix displays (the SPEC-stack-2026 palette: Hono server,
// Postgres datastore, Valkey cache, PgBouncer pooler, Windmill workflows,
// one cloud connector). A demo projection input — never a kernel source.
func DemoManifest() stackmanifest.StackManifest {
	return stackmanifest.StackManifest{
		AppName: "demo",
		Services: []stackmanifest.Service{
			{Name: "server", Role: stackmanifest.RoleServer, InternalPort: 3000},
			{Name: "db", Role: stackmanifest.RoleDatastore, Image: "postgres:17", InternalPort: 5432},
			{Name: "cache", Role: stackmanifest.RoleCache, Image: "valkey/valkey:8", InternalPort: 6379},
			{Name: "pooler", Role: stackmanifest.RolePooler, Image: "edoburu/pgbouncer:latest", InternalPort: 6432},
			{Name: "workflows", Role: stackmanifest.RoleWorkflow, Image: "ghcr.io/windmill-labs/windmill:main", InternalPort: 8000},
			{Name: "crm", Role: stackmanifest.RoleConnector, InternalPort: 443},
		},
		Network: stackmanifest.Network{Name: "traefik_default", External: true},
	}
}

// DemoMatrix resolves the demo manifest across the five environments.
func DemoMatrix() ([]Resolution, error) {
	return ResolveMatrix(DemoManifest())
}

// CanonicalDemoMatrix renders the demo matrix as S02-canonical bytes
// (records.Canonicalize — keys sorted, no insignificant whitespace): the body
// the TS twin reproduces byte-for-byte.
func CanonicalDemoMatrix() ([]byte, error) {
	matrix, err := DemoMatrix()
	if err != nil {
		return nil, err
	}
	body, err := json.Marshal(map[string]any{"matrix": matrix})
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(body)
}

// HashDemoMatrix is the content address of the canonical demo matrix
// (records.Hash — S02 reused). The Go address is AUTHORITATIVE and pinned by
// the property mirror, the TS twin and the Playwright e2e.
func HashDemoMatrix() (string, error) {
	canon, err := CanonicalDemoMatrix()
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// EmitConnectionsModule renders the TS config module the emitted Hono server
// consumes AT BOOT for environment env: every endpoint is rebuilt from
// process.env via requireEnv (fail-closed MISSING_ENV_AT_BOOT) — the emitted
// SOURCE carries no value, no localhost, no IP, no secret. Deterministic:
// same (manifest, env) → byte-identical module.
func EmitConnectionsModule(m stackmanifest.StackManifest, env scope.Environment) ([]byte, error) {
	matrix := make([]Resolution, 0, len(m.Services))
	services := make([]stackmanifest.Service, len(m.Services))
	copy(services, m.Services)
	sort.Slice(services, func(i, j int) bool { return services[i].Name < services[j].Name })
	for _, svc := range services {
		res, err := ResolveConnection(svc, env)
		if err != nil {
			return nil, err
		}
		matrix = append(matrix, res)
	}

	var b strings.Builder
	b.WriteString("// Code generated by AIDOS connresolve (DP07) — DO NOT EDIT.\n")
	b.WriteString("// connections." + string(env) + ".ts — consumed by the Hono server at boot.\n")
	b.WriteString("// Every endpoint is resolved from process.env — never hardcoded\n")
	b.WriteString("// (SPEC-stack-2026: no URL/secret in the emitted source; managed URLs\n")
	b.WriteString("// come from the secret store, S91).\n\n")
	b.WriteString("function requireEnv(name: string): string {\n")
	b.WriteString("\tconst v = process.env[name];\n")
	b.WriteString("\tif (v === undefined || v === \"\") {\n")
	b.WriteString("\t\tthrow new Error(`MISSING_ENV_AT_BOOT: ${name}`);\n")
	b.WriteString("\t}\n")
	b.WriteString("\treturn v;\n")
	b.WriteString("}\n\n")
	b.WriteString("export type ConnectionMode = \"docker_internal\" | \"traefik_url\" | \"managed_url\";\n\n")
	b.WriteString("export interface Connection {\n\tservice: string;\n\tmode: ConnectionMode;\n\turl: string;\n}\n\n")
	b.WriteString("/** The resolved connections for environment \"" + string(env) + "\" — DP07 projection. */\n")
	b.WriteString("export const connections: Record<string, Connection> = {\n")
	for _, res := range matrix {
		b.WriteString("\t\"" + res.Service + "\": {\n")
		b.WriteString("\t\tservice: \"" + res.Service + "\",\n")
		b.WriteString("\t\tmode: \"" + string(res.Mode) + "\",\n")
		b.WriteString("\t\turl: " + bootExpr(res) + ",\n")
		b.WriteString("\t},\n")
	}
	b.WriteString("};\n\n")
	b.WriteString("/** connection — the boot accessor: fail-closed on an unknown service. */\n")
	b.WriteString("export function connection(service: string): Connection {\n")
	b.WriteString("\tconst c = connections[service];\n")
	b.WriteString("\tif (c === undefined) {\n")
	b.WriteString("\t\tthrow new Error(`UNKNOWN_SERVICE: ${service}`);\n")
	b.WriteString("\t}\n")
	b.WriteString("\treturn c;\n")
	b.WriteString("}\n")
	return []byte(b.String()), nil
}

// bootExpr renders the TS expression that materializes one endpoint from
// process.env at boot — references only, never a value.
func bootExpr(res Resolution) string {
	switch res.Mode {
	case ModeManagedURL:
		return "requireEnv(\"" + res.EnvVars + "\")"
	case ModeTraefikURL:
		return "`https://${requireEnv(\"APP_SUBDOMAIN\")}.${requireEnv(\"DOMAIN\")}`"
	default:
		// docker_internal: ${APP_NAME}[-<service>]:<port>
		suffix := strings.TrimPrefix(res.EndpointPattern, "${APP_NAME}")
		return "`${requireEnv(\"APP_NAME\")}" + suffix + "`"
	}
}
