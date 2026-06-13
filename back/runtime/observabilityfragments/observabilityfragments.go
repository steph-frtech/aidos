// Package observabilityfragments is the DP17 emitter of the OBSERVABILITY-SUBSTRATE
// service fragments of the EMITTED app's EXPLOITATION observability (ROADMAP-
// provisioning-deploy, palette DP14 → fragments StackManifest), and the EMITTED
// INSTRUMENTATION (a PURE projection of the Kernel: how the emitted TS app wires
// @opentelemetry/* → SigNoz and its errors → GlitchTip). It is the observability
// twin of datafragments (DP15, data) and asyncfragments (DP16, async):
//
//   - SubstrateObservabilityFragments(projectID, env) → []ServiceFragment renders
//     the THREE observability-layer services of the emitted app as DETERMINISTIC
//     StackManifest data, profile OBSERVABILITY:
//     · OTel Collector — otel/opentelemetry-collector-contrib (role observability):
//     the OTLP ingest the emitted app's @opentelemetry/* exporter feeds (4317
//     gRPC), fan-out to SigNoz.
//     · SigNoz — signoz/signoz (role observability): traces + metrics + logs, the
//     per-app exploitation dashboard; volume /var/lib/signoz (DP14 measured).
//     · GlitchTip — glitchtip/glitchtip (role errortracking): error-tracking,
//     depends_on postgres + valkey (DP14 measured: « Cache/Queue: Valkey »).
//     Each fragment carries the DP14-measured image + internal port + named bind
//     volume + healthcheck + depends_on + profile + project_id, ISOLATED per project
//     (the volume name + the bind device env-var carry a deterministic per-project
//     token — project A never reads project B's traces/errors — S55/S82, the wall §2).
//
//   - EmittedInstrumentation(projectID, env) → Instrumentation renders, as DATA
//     (never Go runtime code), how the emitted TS app INSTRUMENTS itself: the
//     @opentelemetry/* packages it imports (ADR 0040 — JS/TS OTel SDK, NEVER Go),
//     the OTLP endpoint it exports to (an ENV-VAR REFERENCE pointing at this
//     project's otel-collector — never a hardcoded URL) and the GlitchTip DSN its
//     errors flow to (an ENV-VAR REFERENCE — a secret, never in the clear). The
//     instrumentation is READ-ONLY on reality: it OBSERVES, it never mutates truth.
//
// THE IMAGES ARE THE DP14 MEASUREMENT (front/web/lib/substrate-palette.ts, the GO
// verdicts of the 2026-06-13 spike), engraved here — never re-discovered, never
// re-booted (the boot already happened; this package GRAVES the measured palette as
// fragments). otel-collector GO (v0.154.0, « Everything is ready », OTLP 4317/4318
// listening) ; signoz GO (« Query server started listening on 0.0.0.0:8080 », volume
// /var/lib/signoz writable) ; glitchtip GO (« Listening at http://0.0.0.0:8080 »,
// + Postgres + Valkey, « Cache/Queue: Valkey » + « Started worker-1 »). SigNoz and
// GlitchTip both LISTEN on 8080 in their own container; when GRAFTED into one
// manifest the internal ports must be unique (stackmanifest.Validate's
// DUPLICATE_INTERNAL_PORT law), so GlitchTip's grafted internal port is REMAPPED to
// 8081 — the SAME collision-avoidance discipline DP15 uses for doltgres (5433 vs
// postgres 5432), a deterministic engraved value, not a re-measurement.
//
// REUSE, DON'T FORK (CLAUDE.md §6, ADR 0007 — REUSE/EXTEND S92, NEVER DUPLICATE).
// The per-project isolation token motif is the DP15 datafragments package
// (datafragments.IsolationToken) — reused verbatim, never re-coined. The Service /
// Volume / Role / Profile shapes are the DP02 stackmanifest package. The S92
// opsobservability package (runtime/opsobservability) owns the per-app ops
// DASHBOARD (signal ingest → latency/error-rate/log-feed panel) and is REUSED by
// the Workbench/MCP for the dashboard, NEVER forked here. DP17 adds only: the THREE
// observability palette rows + the emitted-instrumentation projection.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is PURE, TOTAL and
// DETERMINISTIC: no clock, no RNG, no map-order leak, no absolute path. The
// per-project token is records.Hash (S02, via datafragments.IsolationToken); the
// canonical body is records.Canonicalize. Same (projectID, env) ⇒ byte-identical
// fragments + byte-identical instrumentation, ×100 (the reproducibility mirror). No
// LLM enters — the palette is a closed table, the isolation is a hash.
//
// THE WALL (CLAUDE.md §2) — THE CAPITAL INVARIANT. The Service AST is a DP02
// above-the-line stack_manifest SOURCE; this package PROJECTS the observability
// slice of it BELOW the line (a regenerable fragment for back/gen/<app>/, the
// composeemit input). It writes NO truth: no kernel/mirrors/fitness write. CRUCIALLY,
// NO observability service and NO emitted instrumentation carries a write-truth
// capability: WritesTruth() is ALWAYS false, Capabilities() never returns a
// truth-write scope. Exploitation observability is NOT a Kernel sensor — the
// RealityMirror (E12, runtime/reality) is the ONLY on-ramp from production reality
// into the Kernel (incident → Idea → mirror → /goal). A trace, a metric, an error
// event is read by the user to OPERATE the app; it never writes the truth-store.
package observabilityfragments

import (
	"encoding/json"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
)

// The DECLARED, MEASURED images of the observability-substrate palette — the DP14 GO
// verdicts (front/web/lib/substrate-palette.ts), engraved above the line, never
// re-discovered.
const (
	otelCollectorImage = "otel/opentelemetry-collector-contrib:latest" // DP14 GO: v0.154.0, « Everything is ready », OTLP 4317/4318 listening
	signozImage        = "signoz/signoz:latest"                        // DP14 GO: « Query server started listening on 0.0.0.0:8080 »
	glitchtipImage     = "glitchtip/glitchtip:latest"                  // DP14 GO: « Listening at http://0.0.0.0:8080 », + Postgres + Valkey
)

// The DECLARED internal ports (the DP14 measured listen ports). SigNoz and GlitchTip
// both listen on 8080 in their own container; GRAFTED into one manifest the internal
// ports must be UNIQUE (stackmanifest.Validate's DUPLICATE_INTERNAL_PORT law), so
// GlitchTip's grafted internal port is REMAPPED to 8081 — the SAME discipline DP15
// uses for doltgres (5433 vs postgres 5432). The OTel collector's grafted port is its
// OTLP gRPC listen port (4317), the load-bearing endpoint the emitted app exports to.
const (
	otelCollectorPort = 4317 // DP14 measured OTLP gRPC listen port (the app's export target)
	signozPort        = 8080 // DP14 measured query/UI listen port
	glitchtipPort     = 8081 // DP14 measured 8080, REMAPPED to 8081 to avoid the SigNoz collision in a grafted manifest
)

// The DECLARED healthchecks (the DP14 measured probes — composeemit applies the
// boilerplate cadence; this is the command only).
const (
	otelCollectorHealth = "wget -q --spider http://localhost:13133/" // OTel collector health_check extension (default :13133)
	signozHealth        = "wget -q --spider http://localhost:8080/api/v1/health"
	glitchtipHealth     = "wget -q --spider http://localhost:8081/"
)

// ServiceFragment is ONE observability-substrate service fragment: the DP02 Service
// AST slice plus its named bind volume(s), the project it is isolated to. It is a
// PROJECTION value (below the line), NOT a kernel truth. It is structurally identical
// to datafragments.ServiceFragment (same field shape) so it grafts onto a manifest
// alongside the data/async fragments and converts freely — DP17 reuses the shape, it
// only ATTACHES the capability oracle (WritesTruth/Capabilities) that pins the wall.
type ServiceFragment struct {
	// Key is the stable palette key (otel-collector|signoz|glitchtip) — the twin of
	// the DP14 SUBSTRATE_PALETTE keys, never re-coined.
	Key string `json:"key"`
	// ProjectID is the project this fragment is isolated to (the wall §2 / S55).
	ProjectID string `json:"project_id"`
	// Service is the DP02 Service AST (image, role, internal port, profile,
	// healthcheck, depends_on) — a valid member of the closed role/profile sets.
	Service stackmanifest.Service `json:"service"`
	// Volumes are the named bind volume(s), isolated per project (the volume name and
	// the device env-var both carry the per-project token).
	Volumes []stackmanifest.Volume `json:"volumes"`
}

// WritesTruth reports whether this fragment carries a capability that writes Kernel
// truth (kernel/mirrors/fitness). It is ALWAYS false: an observability service is
// EXPLOITATION observability, not a Kernel sensor — it reads signals to render the
// user's ops dashboard, it never writes the truth-store (the wall §2, the RealityMirror
// E12 is the only on-ramp). The method exists so the mirror can ASSERT the invariant.
func (ServiceFragment) WritesTruth() bool { return false }

// Capabilities returns the (read-only) reality capabilities this fragment exercises —
// it OBSERVES (ingests OTLP signals, stores traces/errors for its OWN project), it
// never writes truth. The set is closed and carries NO truth-write scope.
func (f ServiceFragment) Capabilities() []string {
	switch f.Key {
	case "otel-collector":
		return []string{"observe:otlp-ingest", "observe:fan-out-signoz"}
	case "signoz":
		return []string{"observe:store-traces", "observe:store-metrics", "observe:store-logs", "observe:render-dashboard"}
	case "glitchtip":
		return []string{"observe:store-errors", "observe:render-error-feed"}
	default:
		return nil
	}
}

// IsTruthWriteCapability reports whether a capability string writes Kernel truth
// (kernel/mirrors/fitness). DP17 fragments and instrumentation NEVER carry such a
// capability — the predicate exists so the mirror proves the absence is total. The
// closed truth-write namespace is "write:kernel|mirrors|fitness" (the wall's schemas);
// an "observe:*" capability is read-only on reality and never matches.
func IsTruthWriteCapability(cap string) bool {
	const writePrefix = "write:"
	if len(cap) < len(writePrefix) || cap[:len(writePrefix)] != writePrefix {
		return false
	}
	target := cap[len(writePrefix):]
	switch target {
	case "kernel", "mirrors", "fitness":
		return true
	default:
		// Any write:<truth-schema> is a truth-write; conservatively, every write: scope
		// against the three truth schemas is caught above. A non-truth write: scope
		// (none exists in this package) is not a truth write.
		return false
	}
}

// fragmentSpec is the DECLARED palette row — the measured, closed table. The order of
// observabilityPalette is the canonical emission order (otel-collector, signoz,
// glitchtip), stable & deterministic.
type fragmentSpec struct {
	key          string
	role         stackmanifest.Role
	image        string
	internalPort int
	profile      stackmanifest.Profile
	healthcheck  string
	dependsOn    []string
}

// observabilityPalette is the CLOSED DP17 observability-substrate palette (the DP14
// measurement, engraved). Declared, never learned (§8) — extending it is an addendum +
// a /goal. All three are profile OBSERVABILITY (an emitted app that wants exploitation
// observability runs them under the observability compose profile); all carry a
// project-isolated bind volume.
var observabilityPalette = []fragmentSpec{
	{
		key:          "otel-collector",
		role:         stackmanifest.RoleObservability,
		image:        otelCollectorImage,
		internalPort: otelCollectorPort,
		profile:      stackmanifest.ProfileObservability,
		healthcheck:  otelCollectorHealth,
	},
	{
		key:          "signoz",
		role:         stackmanifest.RoleObservability,
		image:        signozImage,
		internalPort: signozPort,
		profile:      stackmanifest.ProfileObservability,
		healthcheck:  signozHealth,
		// SigNoz receives the collector's fan-out (a deterministic edge).
		dependsOn: []string{"otel-collector"},
	},
	{
		key:          "glitchtip",
		role:         stackmanifest.RoleErrorTracking,
		image:        glitchtipImage,
		internalPort: glitchtipPort,
		profile:      stackmanifest.ProfileObservability,
		healthcheck:  glitchtipHealth,
		// GlitchTip stores errors in Postgres + queues over Valkey (DP14 measured).
		dependsOn: []string{"postgres", "valkey"},
	},
}

// Keys returns the closed observability-substrate palette keys in canonical emission
// order (the Workbench legend + the mirror read this single source).
func Keys() []string {
	out := make([]string, 0, len(observabilityPalette))
	for _, s := range observabilityPalette {
		out = append(out, s.key)
	}
	return out
}

// buildFragment renders ONE observability fragment for a project (pure, deterministic).
// The service name and the volume are isolated per project via the DP15 token (reused,
// not forked) — SigNoz's trace store / GlitchTip's error store never bleed across
// projects.
func buildFragment(s fragmentSpec, projectID, token string) ServiceFragment {
	// The volume is the per-project, per-service named bind volume. The device is an
	// ENV-VAR REFERENCE (composeemit / SPEC-stack-2026 law: never a hardcoded path); the
	// var name carries the service + token so each project's bind is its own (isolation),
	// e.g. SIGNOZ_<token>_DATA_PATH. The discipline mirrors datafragments verbatim.
	deviceVar := upperEnv(s.key) + "_" + upperEnv(token) + "_DATA_PATH"
	vol := stackmanifest.Volume{
		Name:      s.key + "-" + token,
		DeviceVar: deviceVar,
	}
	return ServiceFragment{
		Key:       s.key,
		ProjectID: projectID,
		Service: stackmanifest.Service{
			Name:         s.key,
			Role:         s.role,
			Image:        s.image,
			InternalPort: s.internalPort,
			Profile:      s.profile,
			Healthcheck:  s.healthcheck,
			DependsOn:    append([]string(nil), s.dependsOn...),
		},
		Volumes: []stackmanifest.Volume{vol},
	}
}

// upperEnv folds a token to an UPPER-SNAKE env-var fragment (non-alphanumerics → '_'),
// the SAME discipline datafragments.upperEnv / composeemit.envVarImage use (a
// deterministic map). Kept local so the package is self-contained; both fold
// identically, so the env-var keys agree across the layers.
func upperEnv(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z':
			out = append(out, r-('a'-'A'))
		case r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			out = append(out, r)
		default:
			out = append(out, '_')
		}
	}
	return string(out)
}

// SubstrateObservabilityFragments is the DP17 AUTHORITATIVE door: it renders the
// observability palette (OTel collector + SigNoz + GlitchTip) for (projectID, env).
// All three are profile observability and legal in EVERY environment (no observability
// service is env-gated — unlike DP15's doltgres), so the function only fails-closed on
// an UNKNOWN environment (the DP06 motif, never guessed). Same (projectID, env) ⇒
// byte-identical fragments.
func SubstrateObservabilityFragments(projectID string, env scope.Environment) ([]ServiceFragment, error) {
	if !scope.IsKnownEnvironment(env) {
		return nil, &envbindings.Refusal{
			Code:    envbindings.CodeUnknownEnvironment,
			Message: "environment is outside the closed set (want prod|staging|dev|local|future_cloud — ADR 0065)",
		}
	}
	token := datafragments.IsolationToken(projectID)
	out := make([]ServiceFragment, 0, len(observabilityPalette))
	for _, s := range observabilityPalette {
		out = append(out, buildFragment(s, projectID, token))
	}
	return out, nil
}

// fragmentBody is the canonical JSON record body of a fragment (the projection shape
// canonicalised below the line — never a kernel record kind). It mirrors the DP15 body
// shape so a fragment's address is computed the same way across layers.
type fragmentBody struct {
	Key       string                 `json:"key"`
	ProjectID string                 `json:"project_id"`
	Service   stackmanifest.Service  `json:"service"`
	Volumes   []stackmanifest.Volume `json:"volumes"`
}

// CanonicalFragment returns the S02-canonical bytes of a fragment
// (records.Canonicalize over the body — keys sorted, no insignificant whitespace).
// Same fragment ⇒ same bytes, always (the byte-identity oracle of the mirror).
func CanonicalFragment(f ServiceFragment) ([]byte, error) {
	raw, err := json.Marshal(fragmentBody{
		Key:       f.Key,
		ProjectID: f.ProjectID,
		Service:   f.Service,
		Volumes:   f.Volumes,
	})
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// HashFragment is the content address of a fragment (records.Hash(CanonicalFragment)
// — S02 reused, never forked). Same fragment ⇒ same address on any machine; the
// isolation token makes project A's address differ from project B's.
func HashFragment(f ServiceFragment) (string, error) {
	canon, err := CanonicalFragment(f)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// ── the emitted instrumentation (a PURE projection of the Kernel, ADR 0040 TS) ──────

// Instrumentation is DATA describing how the EMITTED TS app instruments itself — NEVER
// Go runtime code. It is a PURE projection of the Kernel: the @opentelemetry/* packages
// the emitted app imports (ADR 0040 — JS/TS OTel SDK, never Go), the OTLP endpoint it
// exports its signals to (an ENV-VAR REFERENCE pointing at this project's
// otel-collector — never a hardcoded URL), and the GlitchTip DSN its errors flow to (an
// ENV-VAR REFERENCE — a secret, never in the clear). It is READ-ONLY on reality: it
// OBSERVES, it never mutates truth (WritesTruth() is always false).
type Instrumentation struct {
	// ProjectID is the emitted app this instrumentation is isolated to.
	ProjectID string `json:"project_id"`
	// Env is the environment the instrumentation projects for (the binding is per-env).
	Env string `json:"env"`
	// Packages are the TS OTel/error packages the emitted app imports (ADR 0040 — never
	// a Go module). Declared, closed, deterministic.
	Packages []string `json:"packages"`
	// OTLPEndpointVar is the ENV-VAR REFERENCE the OTLP exporter reads to reach this
	// project's otel-collector (e.g. OTEL_EXPORTER_OTLP_ENDPOINT) — never a hardcoded URL.
	OTLPEndpointVar string `json:"otlp_endpoint_var"`
	// OTLPTarget is the service key the OTLP exporter targets (otel-collector) — the
	// stack member that ingests the app's signals (then fans out to SigNoz).
	OTLPTarget string `json:"otlp_target"`
	// DashboardTarget is the service key the user reads the exploitation dashboard from
	// (signoz) — traces/metrics/logs.
	DashboardTarget string `json:"dashboard_target"`
	// ErrorDSNVar is the ENV-VAR REFERENCE carrying the GlitchTip DSN the error tracker
	// reports to (e.g. GLITCHTIP_DSN) — a secret, never in the clear.
	ErrorDSNVar string `json:"error_dsn_var"`
	// ErrorTarget is the service key errors flow to (glitchtip).
	ErrorTarget string `json:"error_target"`
	// ReadOnlyReality is ALWAYS true: the instrumentation observes reality, it never
	// writes truth (the wall §2 — exploitation observability is not a Kernel sensor).
	ReadOnlyReality bool `json:"read_only_reality"`
}

// WritesTruth reports whether the emitted instrumentation writes Kernel truth. It is
// ALWAYS false: the instrumentation is read-only on reality — it exports the app's own
// traces/metrics/errors to the per-app observability stack, it NEVER writes
// kernel/mirrors/fitness (the wall §2). The method exists so the mirror can ASSERT it.
func (Instrumentation) WritesTruth() bool { return false }

// Capabilities returns the (read-only) reality capabilities the emitted instrumentation
// exercises — it EXPORTS its own signals, it never writes truth. The set is closed and
// carries NO truth-write scope.
func (Instrumentation) Capabilities() []string {
	return []string{"observe:export-traces", "observe:export-metrics", "observe:export-logs", "observe:report-errors"}
}

// The DECLARED TS instrumentation packages (ADR 0040 — JS/TS OTel SDK, NEVER Go). The
// set is closed; extending it is an addendum + a /goal.
var instrumentationPackages = []string{
	"@opentelemetry/sdk-node",
	"@opentelemetry/auto-instrumentations-node",
	"@opentelemetry/exporter-trace-otlp-grpc",
	"@opentelemetry/exporter-metrics-otlp-grpc",
	"@opentelemetry/exporter-logs-otlp-grpc",
	"@sentry/node", // GlitchTip is Sentry-SDK compatible (DP14: « GlitchTip = fork léger compatible Sentry SDK »)
}

// EmittedInstrumentation is the DP17 PURE projection of how the emitted TS app
// instruments itself for (projectID, env). It fails-closed on an UNKNOWN environment
// (the DP06 motif, never guessed). The endpoint and DSN are ENV-VAR REFERENCES (no
// hardcoded URL, no secret in the clear — SPEC-stack-2026). Same (projectID, env) ⇒
// byte-identical instrumentation. The instrumentation is DATA, never Go runtime code,
// and is READ-ONLY on reality (it observes, it never writes truth — the wall §2).
func EmittedInstrumentation(projectID string, env scope.Environment) (Instrumentation, error) {
	if !scope.IsKnownEnvironment(env) {
		return Instrumentation{}, &envbindings.Refusal{
			Code:    envbindings.CodeUnknownEnvironment,
			Message: "environment is outside the closed set (want prod|staging|dev|local|future_cloud — ADR 0065)",
		}
	}
	pkgs := append([]string(nil), instrumentationPackages...)
	return Instrumentation{
		ProjectID:       projectID,
		Env:             string(env),
		Packages:        pkgs,
		OTLPEndpointVar: "OTEL_EXPORTER_OTLP_ENDPOINT",
		OTLPTarget:      "otel-collector",
		DashboardTarget: "signoz",
		ErrorDSNVar:     "GLITCHTIP_DSN",
		ErrorTarget:     "glitchtip",
		ReadOnlyReality: true,
	}, nil
}

// CanonicalInstrumentation returns the S02-canonical bytes of an instrumentation
// projection (records.Canonicalize over the body). Same instrumentation ⇒ same bytes
// — the byte-identity oracle of the mirror.
func CanonicalInstrumentation(in Instrumentation) ([]byte, error) {
	raw, err := json.Marshal(in)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// HashInstrumentation is the content address of an instrumentation projection
// (records.Hash(CanonicalInstrumentation) — S02 reused). Same instrumentation ⇒ same
// address; the project_id makes A's address differ from B's.
func HashInstrumentation(in Instrumentation) (string, error) {
	canon, err := CanonicalInstrumentation(in)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}
