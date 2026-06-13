// Package appservicefragments is the DP18 emitter of the OPTIONAL APPLICATION-SERVICE
// substrate fragments (ROADMAP-provisioning-deploy EPIC D, palette DP14 →
// fragments StackManifest) AND the auth-cabling projection of the EMITTED app's
// runtime authentication. It is the application-services twin of datafragments
// (DP15, the data layer), asyncfragments (DP16, the async layer) and
// observabilityfragments (DP17, the exploitation observability layer):
//
//   - SubstrateAppServiceFragments(projectID, env) → []ServiceFragment renders the
//     THREE optional application-service fragments of the emitted app as
//     DETERMINISTIC StackManifest data —
//     · Forgejo     — the self-hosted git of the emitted app (role=git, profile git) ;
//     · Plane       — the tickets of the emitted app (role=tickets, profile tickets) ;
//     · Better-Auth — the RUNTIME authentication of the USERS OF THE BUILT APP
//     (role=auth, profile core). DISTINCT de l'auth des users AIDOS (E3/S61-63).
//     Each fragment carries the DP14-measured image + internal port + named bind
//     volume + healthcheck + depends_on + profile + project_id, ISOLATED per project
//     (the volume name + the bind device env-var carry a deterministic per-project
//     token — project A never reaches project B's git/tickets/sessions — S55/S82,
//     the wall §2).
//
//   - EmittedAppAuthBinding(projectID) → AppAuthBinding is the AUTH-CABLING
//     projection: it takes the S80 behavior-macro `app-auth` (appauth.ExpandAppAuth),
//     EXPANDS the auth subsystem's owner-scoping band through the S76 UNIQUE
//     behavior.Expand (NEVER a forked/duplicated expansion), and renders the
//     Better-Auth runtime config + the role→operation mapping onto the AuthorityGraph
//     OF THE EMITTED APP'S RUNTIME. The approvers of a protected operation are the
//     EMITTED APP'S runtime roles (viewer/editor/admin), NEVER the AIDOS approvers
//     (separation auth-app ≠ auth-AIDOS, the wall §2).
//
// THE IMAGES ARE THE DP14 MEASUREMENT (front/web/lib/substrate-palette.ts, the GO
// verdicts of the 2026-06-13 spike), engraved here — never re-discovered, never
// re-booted (the boot already happened; this package GRAVES the measured palette as
// fragments). Forgejo's DP14 verdict is a GO (GET /api/healthz → status pass); Plane's
// is a GO (Next.js « Ready », port 3000 reachable); Better-Auth's is a GO (container
// health=healthy, serves HTML on :3000).
//
// REUSE, DON'T FORK (CLAUDE.md §6, ADR 0007). The ServiceFragment shape, the
// per-project isolation token motif and the CanonicalFragment/HashFragment oracles are
// the DP15 datafragments package — reused verbatim. The app-auth subsystem
// (entities/operations/policies) is the S80 appauth.ExpandAppAuth — IMPORTED, never
// re-coined; the runtime authz decision is appauth.CheckAccess (the emitted app's
// AuthorityGraph, code not LLM). The owner-scoping pieces grafted onto the auth User
// entity are the S76 behavior.Expand UNIQUE function — IMPORTED, never duplicated (the
// single-function law §24.6: one expansion of the `ownable` macro, never a second). DP18
// adds only: the THREE app-service palette rows + the auth-cabling glue.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is PURE, TOTAL and
// DETERMINISTIC: no clock, no RNG, no map-order leak, no absolute path. The per-project
// token is records.Hash (S02, via datafragments.IsolationToken); the canonical fragment
// body is records.Canonicalize. Same (projectID, env) ⇒ byte-identical fragments, ×100
// (the reproducibility mirror). The auth binding is byte-identical per project too (the
// S80 ExpansionID + the S76 ExpansionID both content-address). No LLM enters — the
// palette is a closed table, the auth mapping is a pure lookup over the DECLARED authz
// band, the isolation is a hash. "An LLM deciding whether a runtime role may act" would
// be a determinism gap; the rule is code, and the code is authoritative.
//
// THE WALL (CLAUDE.md §2). The Service AST is a DP02 above-the-line stack_manifest
// SOURCE; this package PROJECTS the app-service slice of it BELOW the line (a
// regenerable fragment for back/gen/<app>/, the composeemit input). It writes NO truth:
// no kernel/mirrors/fitness write (WritesTruth() is always false on every fragment AND
// on the binding). The auth binding maps the EMITTED APP'S runtime AuthorityGraph,
// NEVER the AIDOS approvers — a runtime authz decision of the built app is decided by
// the built app's roles, never by the humans who approve AIDOS changesets. Freezing the
// expanded auth subsystem into the (emitted app's) kernel goes via the wall (idée →
// miroir → /goal → approbation humaine) — appauth.Propose owns that; this package only
// RENDERS the below-the-line binding.
package appservicefragments

import (
	"encoding/json"

	"github.com/steph-frtech/aidos/back/kernel/appauth"
	"github.com/steph-frtech/aidos/back/kernel/behavior"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
)

// The DECLARED, MEASURED images of the app-service palette — the DP14 GO verdicts
// (front/web/lib/substrate-palette.ts), engraved above the line, never re-discovered.
// Forgejo's measured image (codeberg.org/forgejo/forgejo:9, GET /api/healthz → pass);
// Plane's measured image (makeplane/plane-frontend:latest, Next.js Ready); Better-Auth
// is BUILT from the boilerplate (/data/dockers/boilerplates/better-auth, node:22-alpine
// Hono server on :3000) — its image is EMPTY (the DP02 convention: an EMITTED service,
// built from the app's own phase, carries no pinned registry image).
const (
	forgejoImage    = "codeberg.org/forgejo/forgejo:9"  // DP14 GO: GET /api/healthz → { status: pass }
	planeImage      = "makeplane/plane-frontend:latest" // DP14 GO: Next.js « Ready », :3000 reachable
	betterAuthImage = ""                                // EMITTED from /data/dockers/boilerplates/better-auth (node:22-alpine Hono) — built, not pinned
)

// The DECLARED internal ports (the DP14 measured listen ports). They are distinct from
// the DP15/DP16/DP17 substrate ports AND from the emitted server (3000) so a grafted
// manifest keeps unique internal ports (stackmanifest.Validate's DUPLICATE_INTERNAL_PORT
// law). Forgejo/Plane/Better-Auth all natively listen on 3000; we REMAP all three so
// none collides with the emitted server or with each other.
const (
	forgejoPort    = 3300 // Forgejo native 3000, REMAPPED off the emitted server (3000)
	planePort      = 3100 // Plane native 3000, REMAPPED to avoid the server/forgejo collision
	betterAuthPort = 3200 // Better-Auth boilerplate native 3000, REMAPPED to avoid collisions
)

// The DECLARED healthchecks (the DP14 measured probes — composeemit applies the
// boilerplate cadence; this is the command only).
const (
	forgejoHealth    = "wget -q --spider http://localhost:3300/api/healthz" // DP14: GET /api/healthz → status pass (remapped port)
	planeHealth      = "wget -q --spider http://localhost:3100/"            // DP14: Next.js Ready on the remapped port
	betterAuthHealth = "wget -q --spider http://localhost:3200/health"      // boilerplate Hono /health (Dockerfile HEALTHCHECK)
)

// ServiceFragment is ONE app-service substrate fragment: the DP02 Service AST slice plus
// its named bind volume(s), the project it is isolated to. It is a PROJECTION value
// (below the line), NOT a kernel truth. It is structurally identical to
// datafragments.ServiceFragment (same field shape) so it grafts onto a manifest
// alongside the data/async/observability fragments and converts freely — DP18 reuses the
// shape, it only ATTACHES the capability oracle (WritesTruth/Capabilities) that pins the
// wall.
type ServiceFragment struct {
	// Key is the stable palette key (forgejo|plane|better-auth) — the twin of the DP14
	// SUBSTRATE_PALETTE keys, never re-coined.
	Key string `json:"key"`
	// ProjectID is the project this fragment is isolated to (the wall §2 / S55).
	ProjectID string `json:"project_id"`
	// Service is the DP02 Service AST (image, role, internal port, profile, healthcheck,
	// depends_on) — a valid member of the closed role/profile sets.
	Service stackmanifest.Service `json:"service"`
	// Volumes are the named bind volume(s), isolated per project (the volume name and the
	// device env-var both carry the per-project token).
	Volumes []stackmanifest.Volume `json:"volumes"`
}

// WritesTruth reports whether this fragment carries a capability that writes Kernel
// truth (kernel/mirrors/fitness). It is ALWAYS false: an optional app-service (git,
// tickets, the emitted app's auth) is a SERVICE OF THE BUILT APP — it never writes the
// AIDOS truth-store (the wall §2). Better-Auth in particular writes the EMITTED APP'S
// user/session rows (its OWN runtime store), NEVER the AIDOS kernel. The method exists so
// the mirror can ASSERT the invariant.
func (ServiceFragment) WritesTruth() bool { return false }

// Capabilities returns the (below-the-line) capabilities this fragment exercises — git
// hosting, ticket tracking, runtime auth of the BUILT APP's users. None of them is a
// truth-write against the AIDOS kernel/mirrors/fitness. Better-Auth's "auth:*" scopes act
// on the EMITTED APP'S AuthorityGraph (viewer/editor/admin sessions), never the AIDOS
// approvers — the closed set carries NO AIDOS truth-write scope.
func (f ServiceFragment) Capabilities() []string {
	switch f.Key {
	case "forgejo":
		return []string{"git:host-repos", "git:run-ci"}
	case "plane":
		return []string{"tickets:track-issues", "tickets:render-board"}
	case "better-auth":
		// The emitted app's RUNTIME auth — sessions/roles of the BUILT app's users. NEVER
		// the AIDOS approvers (auth-app ≠ auth-AIDOS, the wall §2).
		return []string{"auth:app-runtime-login", "auth:app-runtime-session", "auth:app-runtime-role-gate"}
	default:
		return nil
	}
}

// IsTruthWriteCapability reports whether a capability string writes AIDOS Kernel truth
// (kernel/mirrors/fitness). DP18 fragments NEVER carry such a capability — the predicate
// exists so the mirror proves the absence is total. The closed truth-write namespace is
// "write:kernel|mirrors|fitness" (the wall's schemas); a "git:*"/"tickets:*"/"auth:*"
// capability is a service of the BUILT app and never matches.
func IsTruthWriteCapability(cap string) bool {
	const writePrefix = "write:"
	if len(cap) < len(writePrefix) || cap[:len(writePrefix)] != writePrefix {
		return false
	}
	switch cap[len(writePrefix):] {
	case "kernel", "mirrors", "fitness":
		return true
	default:
		return false
	}
}

// fragmentSpec is the DECLARED palette row — the measured, closed table. The order of
// appServicePalette is the canonical emission order (forgejo, plane, better-auth),
// stable & deterministic.
type fragmentSpec struct {
	key          string
	role         stackmanifest.Role
	image        string
	internalPort int
	profile      stackmanifest.Profile
	healthcheck  string
	dependsOn    []string
}

// appServicePalette is the CLOSED DP18 app-service substrate palette (the DP14
// measurement, engraved). Declared, never learned (§8) — extending it is an addendum +
// a /goal. Forgejo carries profile GIT, Plane profile TICKETS (optional services under
// their own compose profile, off by default — an emitted app opts in). Better-Auth
// carries profile CORE: the runtime auth of the built app's users always runs (an app
// with login needs its auth subsystem up). All three carry a project-isolated bind
// volume (git repos / ticket DB / session store never bleed across projects).
var appServicePalette = []fragmentSpec{
	{
		key:          "forgejo",
		role:         stackmanifest.RoleGit,
		image:        forgejoImage,
		internalPort: forgejoPort,
		profile:      stackmanifest.ProfileGit,
		healthcheck:  forgejoHealth,
	},
	{
		key:          "plane",
		role:         stackmanifest.RoleTickets,
		image:        planeImage,
		internalPort: planePort,
		profile:      stackmanifest.ProfileTickets,
		healthcheck:  planeHealth,
		// Plane stores its issue data in Postgres (the DP15 datastore) — a deterministic edge.
		dependsOn: []string{"postgres"},
	},
	{
		key:          "better-auth",
		role:         stackmanifest.RoleAuth,
		image:        betterAuthImage, // EMITTED (built from the boilerplate) — empty image
		internalPort: betterAuthPort,
		profile:      stackmanifest.ProfileCore,
		healthcheck:  betterAuthHealth,
		// Better-Auth stores the emitted app's users/sessions in Postgres (DP15) — an edge.
		dependsOn: []string{"postgres"},
	},
}

// Keys returns the closed app-service substrate palette keys in canonical emission order
// (the Workbench legend + the mirror read this single source).
func Keys() []string {
	out := make([]string, 0, len(appServicePalette))
	for _, s := range appServicePalette {
		out = append(out, s.key)
	}
	return out
}

// buildFragment renders ONE app-service fragment for a project (pure, deterministic).
// The service name and the volume are isolated per project via the DP15 token (reused,
// not forked) — Forgejo's repos / Plane's tickets / Better-Auth's session store never
// bleed across projects.
func buildFragment(s fragmentSpec, projectID, token string) ServiceFragment {
	// The volume is the per-project, per-service named bind volume. The device is an
	// ENV-VAR REFERENCE (composeemit / SPEC-stack-2026 law: never a hardcoded path); the
	// var name carries the service + token so each project's bind is its own (isolation),
	// e.g. FORGEJO_<token>_DATA_PATH. The discipline mirrors datafragments verbatim.
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
// deterministic map). Kept local so the package is self-contained; all layers fold
// identically, so the env-var keys agree across DP15/DP16/DP17/DP18.
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

// SubstrateAppServiceFragments is the DP18 AUTHORITATIVE door: it renders the app-service
// palette (Forgejo + Plane + Better-Auth) for (projectID, env). All three are legal in
// EVERY environment (no app-service is env-gated — unlike DP15's doltgres), so the
// function only fails-closed on an UNKNOWN environment (the DP06 motif, never guessed).
// Same (projectID, env) ⇒ byte-identical fragments.
func SubstrateAppServiceFragments(projectID string, env scope.Environment) ([]ServiceFragment, error) {
	if !scope.IsKnownEnvironment(env) {
		return nil, &envbindings.Refusal{
			Code:    envbindings.CodeUnknownEnvironment,
			Message: "environment is outside the closed set (want prod|staging|dev|local|future_cloud — ADR 0065)",
		}
	}
	token := datafragments.IsolationToken(projectID)
	out := make([]ServiceFragment, 0, len(appServicePalette))
	for _, s := range appServicePalette {
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

// HashFragment is the content address of a fragment (records.Hash(CanonicalFragment) —
// S02 reused, never forked). Same fragment ⇒ same address on any machine; the isolation
// token makes project A's address differ from project B's.
func HashFragment(f ServiceFragment) (string, error) {
	canon, err := CanonicalFragment(f)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// ── The auth-cabling projection (S80 app-auth × S76 Expand → Better-Auth runtime) ────

// RoleGrant is one row of the emitted app's runtime AuthorityGraph as Better-Auth wires
// it: a protected operation, the MINIMUM runtime role allowed to invoke it, and whether
// a probe role is allowed. It is the BUILT APP'S gate — viewer/editor/admin of the app's
// OWN users, NEVER the AIDOS approvers (the wall §2).
type RoleGrant struct {
	// Operation is the emitted app's protected operation (login/logout/manageRoles).
	Operation string `json:"operation"`
	// MinRole is the weakest EMITTED-APP runtime role allowed to invoke it.
	MinRole appauth.Role `json:"min_role"`
}

// AppAuthBinding is the DP18 auth-cabling projection: the below-the-line config that
// CABLES the emitted Better-Auth service onto the S80 `app-auth` behavior-macro, with the
// owner-scoping pieces grafted onto the auth User entity via the S76 UNIQUE Expand, and
// the role→operation map onto the EMITTED APP'S runtime AuthorityGraph. It is VALUES
// only: WritesTruth() is ALWAYS false (the wall), and BindingID content-addresses the
// canonical body (determinism, testable). It points at the BUILT app's roles, NEVER the
// AIDOS approvers.
type AppAuthBinding struct {
	// ProjectID is the emitted app this binding is isolated to.
	ProjectID string `json:"project_id"`
	// Macro echoes the cabled macro for provenance — ALWAYS appauth.MacroName ("app-auth").
	Macro string `json:"macro"`
	// ServiceKey is the app-service fragment this binding configures — ALWAYS "better-auth".
	ServiceKey string `json:"service_key"`
	// SubsystemExpansionID is the S80 appauth.ExpandAppAuth content address — proves the
	// binding cables onto the EXACT app-auth subsystem (BYTE-IDENTICAL via Expand), never a
	// re-coined one. Same project ⇒ same id.
	SubsystemExpansionID string `json:"subsystem_expansion_id"`
	// OwnerScopingExpansionID is the S76 behavior.Expand content address of the `ownable`
	// expansion grafted onto the auth User entity — proves the owner-scoping band is the
	// UNIQUE Expand (never duplicated). Same project ⇒ same id.
	OwnerScopingExpansionID string `json:"owner_scoping_expansion_id"`
	// Roles are the EMITTED APP'S runtime roles in canonical order (viewer→editor→admin) —
	// the AuthorityGraph of the BUILT app, NEVER the AIDOS approvers.
	Roles []appauth.Role `json:"roles"`
	// Grants is the operation→min-role map Better-Auth enforces at runtime, in canonical
	// order. Decided by code (appauth.CheckAccess), never an LLM.
	Grants []RoleGrant `json:"grants"`
	// AuthorityGraphScope names WHOSE authority graph this binding maps — ALWAYS
	// "emitted-app-runtime", NEVER "aidos-approvers". The explicit token makes the
	// separation (auth-app ≠ auth-AIDOS) testable.
	AuthorityGraphScope string `json:"authority_graph_scope"`
	// BaseURLVar is the ENV-VAR REFERENCE Better-Auth reads for its base URL (the
	// boilerplate's BETTER_AUTH_BASE_URL) — never a hardcoded URL (SPEC-stack-2026).
	BaseURLVar string `json:"base_url_var"`
	// SecretVar is the ENV-VAR REFERENCE carrying the Better-Auth secret — a secret, never
	// in the clear.
	SecretVar string `json:"secret_var"`
	// BindingID = records.Hash(records.Canonicalize(body)) over the semantic body — same
	// project ⇒ same id (the reproducibility invariant, content-addressed).
	BindingID string `json:"binding_id"`
	// WroteKernel is ALWAYS false. The binding is a below-the-line projection; freezing the
	// app-auth subsystem into the (emitted app's) kernel goes via appauth.Propose → /goal.
	WroteKernel bool `json:"wrote_kernel"`
}

// AuthorityGraphScopeEmittedApp is the ONLY scope an AppAuthBinding maps: the EMITTED
// APP'S RUNTIME authority graph. The constant exists so the mirror asserts the binding
// NEVER maps the AIDOS approvers (separation auth-app ≠ auth-AIDOS, the wall §2).
const AuthorityGraphScopeEmittedApp = "emitted-app-runtime"

// betterAuthBaseURLVar / betterAuthSecretVar are the ENV-VAR REFERENCES the Better-Auth
// boilerplate reads (BETTER_AUTH_BASE_URL, BETTER_AUTH_SECRET) — never a hardcoded
// URL/secret (the wall / SPEC-stack-2026).
const (
	betterAuthBaseURLVar = "BETTER_AUTH_BASE_URL"
	betterAuthSecretVar  = "BETTER_AUTH_SECRET"
)

// WritesTruth reports whether the auth binding writes AIDOS Kernel truth. It is ALWAYS
// false: the binding is a below-the-line projection mapping the EMITTED APP'S runtime
// AuthorityGraph — it never touches the AIDOS kernel/mirrors/fitness (the wall §2).
func (AppAuthBinding) WritesTruth() bool { return false }

// EmittedAppAuthBinding is the DP18 AUTH-CABLING projection — PURE, TOTAL, DETERMINISTIC.
// It CABLES the emitted Better-Auth service onto the S80 `app-auth` behavior-macro:
//
//   - it runs the S80 appauth.ExpandAppAuth(projectID) — the UNIQUE app-auth expansion
//     (User/Role/Session entities, login/logout operations, the runtime authz policy
//     band) — and carries its ExpansionID so the cabling is BYTE-IDENTICAL to the macro
//     (never a re-coined subsystem) ;
//   - it grafts the owner-scoping band onto the auth User entity through the S76 UNIQUE
//     behavior.Expand(ownable @ User) — the SINGLE expansion of the `ownable` macro,
//     NEVER duplicated (the single-function law §24.6) — and carries its ExpansionID ;
//   - it renders the operation→min-role map onto the EMITTED APP'S runtime AuthorityGraph
//     (appauth.CheckAccess decides every grant — code, never an LLM) ;
//   - the scope is ALWAYS emitted-app-runtime — the approvers of a protected operation
//     are the BUILT app's roles, NEVER the AIDOS approvers (auth-app ≠ auth-AIDOS).
//
// It WRITES NOTHING (WroteKernel=false). Same projectID ⇒ byte-identical binding
// (BindingID pins it). An empty projectID is a typed error (never a guessed app).
func EmittedAppAuthBinding(projectID string) (AppAuthBinding, error) {
	if projectID == "" {
		return AppAuthBinding{}, appauth.ErrNoTarget
	}

	// 1. The S80 UNIQUE app-auth expansion — IMPORTED, never re-coined. Its ExpansionID
	//    proves the binding cables onto the EXACT subsystem (byte-identical via Expand).
	sub, err := appauth.ExpandAppAuth(projectID)
	if err != nil {
		return AppAuthBinding{}, err
	}

	// 2. The S76 UNIQUE owner-scoping expansion grafted onto the auth User entity — the
	//    SINGLE behavior.Expand of the `ownable` macro, NEVER duplicated (§24.6). The auth
	//    User already carries an owner-ish identity, so we hand behavior.Expand the User's
	//    declared attribute names as the Existing shape (idempotence: it never re-emits a
	//    piece already present). The expansion is byte-identical per project.
	ownerScoping, err := behavior.Expand(behavior.Attachment{
		Behavior: behavior.Ownable,
		Entity:   "User",
		Existing: authUserShape(sub),
	})
	if err != nil {
		return AppAuthBinding{}, err
	}

	// 3. The runtime authz map onto the EMITTED APP'S AuthorityGraph — appauth.CheckAccess
	//    decides every grant (code, never an LLM). The grants are derived from the S80 authz
	//    band's protected operations, in the macro's canonical order.
	grants := make([]RoleGrant, 0, len(sub.Policies))
	for _, pol := range sub.Policies {
		grants = append(grants, RoleGrant{Operation: pol.Operation, MinRole: pol.MinRole})
	}

	out := AppAuthBinding{
		ProjectID:               projectID,
		Macro:                   appauth.MacroName,
		ServiceKey:              "better-auth",
		SubsystemExpansionID:    sub.ExpansionID,
		OwnerScopingExpansionID: ownerScoping.ExpansionID,
		Roles:                   appauth.Roles(),
		Grants:                  grants,
		AuthorityGraphScope:     AuthorityGraphScopeEmittedApp,
		BaseURLVar:              betterAuthBaseURLVar,
		SecretVar:               betterAuthSecretVar,
		WroteKernel:             false,
	}
	id, err := bindingID(out)
	if err != nil {
		return AppAuthBinding{}, err
	}
	out.BindingID = id
	return out, nil
}

// authUserShape extracts the auth User entity's declared attribute names from the S80
// subsystem — the Existing shape handed to the S76 Expand so the owner-scoping band is
// idempotent (it never re-emits a piece the auth User already declares). PURE.
func authUserShape(sub appauth.Subsystem) behavior.Shape {
	var attrs []string
	for _, e := range sub.Entities {
		if e.Name != "User" {
			continue
		}
		for _, a := range e.Attributes {
			attrs = append(attrs, a.Name)
		}
	}
	return behavior.Shape{Attributes: attrs}
}

// CheckAppAccess is the EMITTED app's RUNTIME authorization decision, DELEGATED verbatim
// to the S80 appauth.CheckAccess (the UNIQUE gate, never re-coined). It returns whether a
// runtime role of the BUILT app may invoke a protected operation: allowed iff the role's
// rank ≥ the operation's required minimum-role rank. This maps the AuthorityGraph OF THE
// EMITTED APP'S RUNTIME, NEVER the AIDOS approvers (the wall §2). It is code, never an LLM
// (determinism-first).
func CheckAppAccess(role appauth.Role, operation string) (appauth.Decision, error) {
	return appauth.CheckAccess(role, operation)
}

// bindingID content-addresses an AppAuthBinding over its semantic body (EXCLUDING the
// BindingID/WroteKernel fields). Reuses records.Canonicalize/Hash (S02) — same body ⇒
// same id, key-order-stable.
func bindingID(b AppAuthBinding) (string, error) {
	body := struct {
		ProjectID               string         `json:"project_id"`
		Macro                   string         `json:"macro"`
		ServiceKey              string         `json:"service_key"`
		SubsystemExpansionID    string         `json:"subsystem_expansion_id"`
		OwnerScopingExpansionID string         `json:"owner_scoping_expansion_id"`
		Roles                   []appauth.Role `json:"roles"`
		Grants                  []RoleGrant    `json:"grants"`
		AuthorityGraphScope     string         `json:"authority_graph_scope"`
		BaseURLVar              string         `json:"base_url_var"`
		SecretVar               string         `json:"secret_var"`
	}{
		ProjectID:               b.ProjectID,
		Macro:                   b.Macro,
		ServiceKey:              b.ServiceKey,
		SubsystemExpansionID:    b.SubsystemExpansionID,
		OwnerScopingExpansionID: b.OwnerScopingExpansionID,
		Roles:                   b.Roles,
		Grants:                  b.Grants,
		AuthorityGraphScope:     b.AuthorityGraphScope,
		BaseURLVar:              b.BaseURLVar,
		SecretVar:               b.SecretVar,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}
