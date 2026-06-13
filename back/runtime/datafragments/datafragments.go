// Package datafragments is the DP15 emitter of the DATA-SUBSTRATE service
// fragments (ROADMAP-provisioning-deploy, palette DP14 → fragments StackManifest):
// SubstrateDataFragments(projectID, env) → []ServiceFragment renders the FOUR
// data-layer services of the emitted app as DETERMINISTIC StackManifest data —
//
//   - Postgres   — the prod datastore by default (role=datastore, profile core) ;
//   - Doltgres   — git-for-data, OPT-IN NON-PROD ONLY (role=datastore, profile
//     non-prod, gated by the EXISTING DP06 rule, never forked) ;
//   - Valkey     — the cache (role=cache, profile core) ;
//   - PgBouncer  — the connection pooler (role=pooler, profile core).
//
// Each fragment carries an image + internal port + named bind volume + healthcheck
// + depends_on + profile(s) + project_id, ISOLATED per project (the volume name
// and the bind-device env-var carry a deterministic per-project token, so project
// A never reaches project B's data — S55/S82 isolation, the wall §2).
//
// THE IMAGES ARE THE DP14 MEASUREMENT (substrate-palette.ts, the GO verdicts of
// the 2026-06-13 spike), engraved here — never re-discovered, never re-booted (the
// boot already happened; this package GRAVES the measured palette as fragments).
//
// THE DP06 GATE, DELEGATED — NEVER FORKED. Doltgres in prod is refused by the
// EXISTING rule envbindings.ValidateDatastore(env, doltgres) ⇒
// DOLTGRES_NOT_ALLOWED_IN_PROD (ADR 0065, SPEC-stack-2026 « PostgreSQL = la prod.
// Doltgres = hors prod uniquement. »). SubstrateDataFragments calls that gate and
// surfaces its *Refusal verbatim — it re-coins no code, it owns no rule.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is PURE, TOTAL and
// DETERMINISTIC: no clock, no RNG, no map-order leak, no absolute path. The
// per-project token is records.Hash (S02 reused, never forked); the canonical
// fragment body is records.Canonicalize. Same (projectID, env) ⇒ byte-identical
// fragments, ×100 (the reproducibility mirror). No LLM enters — the palette is a
// closed table, the gate is a pure function, the isolation is a hash.
//
// THE WALL (CLAUDE.md §2). The Service AST is a DP02 above-the-line stack_manifest
// SOURCE; this package PROJECTS the data-substrate slice of it BELOW the line (a
// regenerable fragment for back/gen/<app>/, the composeemit input). It writes NO
// truth: no kernel/mirrors/fitness write. The emitted CREATE-TABLE DDL is rendered
// by the SAME Atlas emitter (S89 provision / S95 datamigrate over gen/db) — this
// package does NOT duplicate it; a destructive (narrowing) migration stays
// human-gated via DataTruthScope (S37). The TS client of the emitted app is the
// replaceable slot (ADR 0040) — never sqlc/pgx in the emitted tree.
package datafragments

import (
	"encoding/json"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
)

// The DECLARED, MEASURED images of the data-substrate palette — the DP14 GO
// verdicts (front/web/lib/substrate-palette.ts), engraved above the line, never
// re-discovered. Postgres/Valkey/PgBouncer reuse the provision (S89) declared
// images where they overlap (postgres:16-alpine is the S89 plainPostgresImage);
// Doltgres reuses the S89 doltgresImage. The set is closed.
const (
	postgresImage  = "postgres:16-alpine"        // S89 plainPostgresImage — measured GO (DP14)
	doltgresImage  = "dolthub/doltgresql:latest" // S89 doltgresImage — non-prod only (ADR 0065)
	valkeyImage    = "valkey/valkey:8-alpine"    // DP14 GO: valkey-cli ping → PONG
	pgbouncerImage = "edoburu/pgbouncer:latest"  // DP14 GO: « process up: PgBouncer 1.25.2 »
)

// The DECLARED internal ports (the DP14 measured listen ports). PgBouncer fronts
// Postgres on a DISTINCT internal port so a grafted manifest keeps unique ports
// (stackmanifest.Validate's DUPLICATE_INTERNAL_PORT law).
const (
	postgresPort  = 5432
	doltgresPort  = 5433 // distinct from postgres so both can coexist in one manifest (non-prod)
	valkeyPort    = 6379
	pgbouncerPort = 6432
)

// The DECLARED healthchecks (the DP14 measured probes — the boilerplate cadence is
// applied by composeemit; this is the command only).
const (
	postgresHealth  = "pg_isready -U app"
	doltgresHealth  = "pg_isready -h 127.0.0.1 -p 5433"
	valkeyHealth    = "valkey-cli ping"
	pgbouncerHealth = "pg_isready -h 127.0.0.1 -p 6432"
)

// ServiceFragment is ONE data-substrate service fragment: the DP02 Service AST
// slice plus its named bind volume(s) and the project it is isolated to. It is a
// PROJECTION value (below the line) carrying enough to graft onto a StackManifest
// and feed composeemit — not a kernel truth.
type ServiceFragment struct {
	// Key is the stable palette key (postgres|doltgres|valkey|pgbouncer) — the twin
	// of the DP14 SUBSTRATE_PALETTE keys, never re-coined.
	Key string `json:"key"`
	// ProjectID is the project this fragment is isolated to (the wall §2 / S55).
	ProjectID string `json:"project_id"`
	// Service is the DP02 Service AST (image, role, internal port, profile,
	// healthcheck, depends_on) — a valid member of the closed role/profile sets.
	Service stackmanifest.Service `json:"service"`
	// Volumes are the named bind volume(s) of the service, isolated per project (the
	// volume name and the device env-var both carry the per-project token).
	Volumes []stackmanifest.Volume `json:"volumes"`
}

// isolationToken derives a deterministic per-project 12-hex token (records.Hash,
// S02 reused — the SAME motif as provision.isolation, never a forked scheme).
// Project A and project B never collide; the same project always maps to the same
// token — reproducible isolation.
func isolationToken(projectID string) string {
	h := records.Hash([]byte("datafragments/v1:" + projectID))
	if len(h) >= 12 {
		return h[:12]
	}
	return h
}

// fragmentSpec is the DECLARED palette row — the measured, closed table. The
// ordering of this slice is the canonical emission order (postgres, doltgres,
// valkey, pgbouncer), stable and deterministic.
type fragmentSpec struct {
	key          string
	role         stackmanifest.Role
	image        string
	internalPort int
	profile      stackmanifest.Profile
	healthcheck  string
	dependsOn    []string
	// nonProdOnly marks the doltgres fragment: gated by the EXISTING DP06 rule.
	nonProdOnly bool
}

// dataPalette is the CLOSED DP15 data-substrate palette (the DP14 measurement,
// engraved). Declared, never learned (§8) — extending it is an addendum + a /goal.
var dataPalette = []fragmentSpec{
	{
		key:          "postgres",
		role:         stackmanifest.RoleDatastore,
		image:        postgresImage,
		internalPort: postgresPort,
		profile:      stackmanifest.ProfileCore,
		healthcheck:  postgresHealth,
	},
	{
		key:          "doltgres",
		role:         stackmanifest.RoleDatastore,
		image:        doltgresImage,
		internalPort: doltgresPort,
		profile:      stackmanifest.ProfileNonProd,
		healthcheck:  doltgresHealth,
		nonProdOnly:  true,
	},
	{
		key:          "valkey",
		role:         stackmanifest.RoleCache,
		image:        valkeyImage,
		internalPort: valkeyPort,
		profile:      stackmanifest.ProfileCore,
		healthcheck:  valkeyHealth,
	},
	{
		key:          "pgbouncer",
		role:         stackmanifest.RolePooler,
		image:        pgbouncerImage,
		internalPort: pgbouncerPort,
		profile:      stackmanifest.ProfileCore,
		// the pooler fronts postgres — depends on it (deterministic edge).
		dependsOn:   []string{"postgres"},
		healthcheck: pgbouncerHealth,
	},
}

// Keys returns the closed data-substrate palette keys in canonical emission order
// (the Workbench legend + the mirror read this single source).
func Keys() []string {
	out := make([]string, 0, len(dataPalette))
	for _, s := range dataPalette {
		out = append(out, s.key)
	}
	return out
}

// buildFragment renders ONE fragment for a project (pure, deterministic). The
// service name and the volume are isolated per project via the token.
func buildFragment(s fragmentSpec, projectID, token string) ServiceFragment {
	// The volume is the per-project, per-service named bind volume. The device is an
	// ENV-VAR REFERENCE (the composeemit / SPEC-stack-2026 law: never a hardcoded
	// path); the var name carries the service + token so each project's bind is its
	// own (isolation), e.g. POSTGRES_<token>_DATA_PATH.
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

// upperEnv folds a token to an UPPER-SNAKE env-var fragment (non-alphanumerics →
// '_'), the SAME discipline composeemit.envVarImage uses (a deterministic map).
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

// SubstrateCoreFragments returns the data-substrate fragments LEGAL in the given
// environment EXCLUDING any non-prod-only fragment that the env forbids. It is the
// fail-closed core path: in prod it omits doltgres (the DP06 gate forbids it) and
// returns postgres + valkey + pgbouncer with NO error; off prod it omits nothing
// here (SubstrateDataFragments is the full-palette door that surfaces the gate).
//
// It refuses an UNKNOWN environment (fail-closed, the DP06 motif) — never guessed.
func SubstrateCoreFragments(projectID string, env scope.Environment) ([]ServiceFragment, error) {
	if !scope.IsKnownEnvironment(env) {
		return nil, &envbindings.Refusal{
			Code:    envbindings.CodeUnknownEnvironment,
			Message: "environment is outside the closed set (want prod|staging|dev|local|future_cloud — ADR 0065)",
		}
	}
	token := isolationToken(projectID)
	out := make([]ServiceFragment, 0, len(dataPalette))
	for _, s := range dataPalette {
		if s.nonProdOnly {
			// In prod the DP06 gate forbids doltgres — omit it from the CORE set
			// (the core path never errors; SubstrateDataFragments surfaces the gate).
			if envbindings.ValidateDatastore(env, envbindings.DatastoreDoltgres) != nil {
				continue
			}
		}
		out = append(out, buildFragment(s, projectID, token))
	}
	return out, nil
}

// SubstrateDataFragments is the DP15 AUTHORITATIVE door: it renders the FULL data
// palette for (projectID, env), and DELEGATES the doltgres-in-prod verdict to the
// EXISTING DP06 rule. If the env forbids doltgres (prod), it surfaces the DP06
// *Refusal (DOLTGRES_NOT_ALLOWED_IN_PROD) VERBATIM — never a forked code, never a
// silent omission. Off prod it returns the four fragments (doltgres profile
// non-prod). Same (projectID, env) ⇒ byte-identical fragments.
//
// Callers that want the LEGAL core slice without a refusal (e.g. a prod compose)
// use SubstrateCoreFragments, which omits the forbidden fragment cleanly.
func SubstrateDataFragments(projectID string, env scope.Environment) ([]ServiceFragment, error) {
	if !scope.IsKnownEnvironment(env) {
		return nil, &envbindings.Refusal{
			Code:    envbindings.CodeUnknownEnvironment,
			Message: "environment is outside the closed set (want prod|staging|dev|local|future_cloud — ADR 0065)",
		}
	}
	token := isolationToken(projectID)
	out := make([]ServiceFragment, 0, len(dataPalette))
	for _, s := range dataPalette {
		if s.nonProdOnly {
			// THE DP06 GATE, DELEGATED: prod imposes Postgres. The full-palette door
			// surfaces the refusal verbatim (the caller asked for doltgres in this env).
			if err := envbindings.ValidateDatastore(env, envbindings.DatastoreDoltgres); err != nil {
				return nil, err
			}
		}
		out = append(out, buildFragment(s, projectID, token))
	}
	return out, nil
}

// fragmentBody is the canonical JSON record body of a fragment (the projection
// shape canonicalised below the line — never a kernel record kind).
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

// HashFragment is the content address of a fragment
// (records.Hash(CanonicalFragment) — S02 reused, never forked). Same fragment ⇒
// same address on any machine; the isolation token makes project A's address
// differ from project B's.
func HashFragment(f ServiceFragment) (string, error) {
	canon, err := CanonicalFragment(f)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}
