// Package docsfragments is the DP30 emitter of the PROFILE-DOCS substrate fragments
// (ROADMAP-provisioning-deploy EPIC G — the OPENING step of the docs track, palette DP14
// docs row → fragments StackManifest) AND the DETERMINISTIC PROJECTION of the EMITTED
// app's documentation (Fumadocs + Scalar + Pagefind). It is the documentation twin of
// datafragments (DP15, the data layer), asyncfragments (DP16, the async layer),
// observabilityfragments (DP17, the exploitation observability layer) and
// appservicefragments (DP18, the application-services layer):
//
//   - SubstrateDocsFragments(projectID, env) → []ServiceFragment renders the THREE
//     profile-docs fragments of the emitted app as DETERMINISTIC StackManifest data —
//     · Fumadocs — the doc SITE rendering the user's domain concepts (role=docs, profile docs) ;
//     · Scalar   — the API REFERENCE consuming the S90-emitted OpenAPI (role=docs, profile docs) ;
//     · Pagefind — the STATIC search index over the doc site (role=docs, profile docs).
//     Each fragment carries the DP14-measured image + internal port + named bind volume +
//     healthcheck + depends_on + profile + project_id, ISOLATED per project (the volume
//     name + the bind device env-var carry a deterministic per-project token — project A
//     never reaches project B's doc site/index — S55/S82, the wall §2).
//
//   - EmittedDocs(spec) → DocsProjection is the DOCS PROJECTION: a PURE function that,
//     from the Kernel (the S90 apisurface.ApiSpec — entities + operations) + the emitted
//     OpenAPI, produces (a) the Scalar config CONSUMING the emitted OpenAPI (EVERY S90
//     sync endpoint present), (b) the Fumadocs pages of the domain's concepts, (c) the
//     Pagefind static index — DATA, byte-stable, NEVER runtime code. The theme is the ccup
//     theme (ADR 0010) inherited as a class hook; the locales are bilingual FR-default
//     (ADR 0011). Same Kernel ⇒ same docs (the capital property).
//
// THE DOCS ARE A PROJECTION, NEVER A TRUTH (the wall §2). They are byte-stable data
// regenerable from the Kernel; freezing anything into truth goes via idée → miroir →
// /goal. Docs PER APP are DISTINCT from the AIDOS Mintlify docs (the build journal):
// these document the BUILT app's domain + API, never AIDOS itself.
//
// THE DP14 MEASUREMENT (front/web/lib/substrate-palette.ts, the GO verdict of the
// 2026-06-13 spike): the docs row is « Fumadocs + Scalar + Pagefind » — npm libraries
// served by the emitted Next docs app (fumadocs-core@16.10.2, fumadocs-ui@16.10.2,
// @scalar/api-reference@1.59.3, pagefind@1.5.2 resolve on the npm registry). They are
// EMITTED (built from the app's own phase, not pinned registry images): the fragment
// images are EMPTY (the DP02 convention for an emitted service).
//
// REUSE, DON'T FORK (CLAUDE.md §6, ADR 0007). The ServiceFragment shape, the per-project
// isolation token motif (datafragments.IsolationToken) and the CanonicalFragment/
// HashFragment oracles are the DP15 datafragments package — reused verbatim. The OpenAPI
// + operation set is the S90 apisurface package — IMPORTED (apisurface.SourceHash,
// apisurface.PathOf, apisurface.EmitOpenAPI), never re-coined. DP30 adds only: the THREE
// docs palette rows + the docs projection glue.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is PURE, TOTAL and
// DETERMINISTIC: no clock, no RNG, no map-order leak, no absolute path. The per-project
// token is records.Hash (S02, via datafragments.IsolationToken); the canonical body is
// records.Canonicalize. Same (projectID, env) ⇒ byte-identical fragments; same ApiSpec ⇒
// byte-identical docs projection (DocsID content-addresses it). No LLM enters — the
// palette is a closed table, the projection is a pure walk over the Kernel cut, the search
// is a deterministic token match. "An LLM writing the doc text" would be a determinism
// gap; the rule is code, and the code is authoritative.
package docsfragments

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/apisurface"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
)

// The DECLARED images of the docs palette. All three are EMITTED (built from the app's own
// phase via the npm libs the DP14 spike resolved) — so the DP02 convention gives them an
// EMPTY image (a service built from the app's phase carries no pinned registry image).
const (
	fumadocsImage = "" // EMITTED — fumadocs-core@16.10.2 + fumadocs-ui@16.10.2 (DP14 GO)
	scalarImage   = "" // EMITTED — @scalar/api-reference@1.59.3 (DP14 GO)
	pagefindImage = "" // EMITTED — pagefind@1.5.2 (DP14 GO)
)

// The DECLARED internal ports — distinct from the emitted server (3000), the DP18
// app-services (3100/3200/3300) and the DP15/16/17 substrate ports, so a grafted manifest
// keeps unique internal ports (stackmanifest.Validate's DUPLICATE_INTERNAL_PORT law).
const (
	fumadocsPort = 3400 // the doc site (Next docs app serving the domain concepts)
	scalarPort   = 3500 // the API reference (Scalar standalone) — distinct from the site
	pagefindPort = 3600 // the static search index server — distinct from both
)

// The DECLARED healthchecks (the DP14 measured probes — composeemit applies the boilerplate
// cadence; this is the command only).
const (
	fumadocsHealth = "wget -q --spider http://localhost:3400/"
	scalarHealth   = "wget -q --spider http://localhost:3500/"
	pagefindHealth = "wget -q --spider http://localhost:3600/pagefind/pagefind.js"
)

// ThemeCcup is the inherited Workbench design theme (ADR 0010 — zinc + blue-600 "ccup",
// Geist, radius 0.5rem). The emitted docs carry it as a CLASS HOOK (never a hardcoded
// hex), so the doc site inherits the same design tokens as the emitted app's front (S93).
const ThemeCcup = "ccup"

// ServiceFragment is ONE docs substrate fragment: the DP02 Service AST slice plus its named
// bind volume(s) and the project it is isolated to. It is a PROJECTION value (below the
// line), NOT a kernel truth. It is structurally identical to datafragments.ServiceFragment
// so it grafts onto a manifest alongside the data/async/observability/app-service fragments
// and converts freely — DP30 reuses the shape, it only ATTACHES the capability oracle
// (WritesTruth/Capabilities) that pins the wall.
type ServiceFragment struct {
	// Key is the stable palette key (fumadocs|scalar|pagefind) — the twin of the DP14
	// docs-row libraries, never re-coined.
	Key string `json:"key"`
	// ProjectID is the project this fragment is isolated to (the wall §2 / S55).
	ProjectID string `json:"project_id"`
	// Service is the DP02 Service AST (image, role, internal port, profile, healthcheck,
	// depends_on) — a valid member of the closed role/profile sets.
	Service stackmanifest.Service `json:"service"`
	// Volumes are the named bind volume(s), isolated per project (the volume name + the
	// device env-var both carry the per-project token).
	Volumes []stackmanifest.Volume `json:"volumes"`
}

// WritesTruth reports whether this fragment carries a capability that writes Kernel truth
// (kernel/mirrors/fitness). It is ALWAYS false: a docs service (a site, an API reference, a
// search index) is a PROJECTION OF THE BUILT APP — it never writes the AIDOS truth-store
// (the wall §2). The method exists so the mirror can ASSERT the invariant.
func (ServiceFragment) WritesTruth() bool { return false }

// Capabilities returns the (below-the-line) capabilities this fragment exercises — render a
// doc site, render an API reference, serve a static search index. None of them is a
// truth-write against the AIDOS kernel/mirrors/fitness. The closed set carries NO truth-write
// scope (docs are a projection, never a verity).
func (f ServiceFragment) Capabilities() []string {
	switch f.Key {
	case "fumadocs":
		return []string{"docs:render-concept", "docs:serve-site"}
	case "scalar":
		return []string{"docs:render-api-reference", "docs:consume-openapi"}
	case "pagefind":
		return []string{"docs:index-static", "docs:serve-search"}
	default:
		return nil
	}
}

// IsTruthWriteCapability reports whether a capability string writes AIDOS Kernel truth
// (kernel/mirrors/fitness). DP30 fragments NEVER carry such a capability — the predicate
// exists so the mirror proves the absence is total. The closed truth-write namespace is
// "write:kernel|mirrors|fitness" (the wall's schemas); a "docs:*" capability is a projection
// of the BUILT app and never matches.
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
// docsPalette is the canonical emission order (fumadocs, scalar, pagefind), stable &
// deterministic.
type fragmentSpec struct {
	key          string
	role         stackmanifest.Role
	image        string
	internalPort int
	profile      stackmanifest.Profile
	healthcheck  string
	dependsOn    []string
}

// docsPalette is the CLOSED DP30 docs substrate palette (the DP14 docs-row measurement,
// engraved). Declared, never learned (§8) — extending it is an addendum + a /goal. All
// three carry role=docs, profile=docs (the optional docs profile, off by default — an
// emitted app opts in). Scalar depends_on fumadocs only for ordering of the doc bundle;
// pagefind depends_on fumadocs (it indexes the built site). Each carries a project-isolated
// bind volume (doc site / index never bleed across projects).
var docsPalette = []fragmentSpec{
	{
		key:          "fumadocs",
		role:         stackmanifest.RoleDocs,
		image:        fumadocsImage, // EMITTED (built from the app's phase) — empty image
		internalPort: fumadocsPort,
		profile:      stackmanifest.ProfileDocs,
		healthcheck:  fumadocsHealth,
	},
	{
		key:          "scalar",
		role:         stackmanifest.RoleDocs,
		image:        scalarImage, // EMITTED — empty image
		internalPort: scalarPort,
		profile:      stackmanifest.ProfileDocs,
		healthcheck:  scalarHealth,
		// Scalar renders alongside the doc site (it links from the site nav).
		dependsOn: []string{"fumadocs"},
	},
	{
		key:          "pagefind",
		role:         stackmanifest.RoleDocs,
		image:        pagefindImage, // EMITTED — empty image
		internalPort: pagefindPort,
		profile:      stackmanifest.ProfileDocs,
		healthcheck:  pagefindHealth,
		// Pagefind indexes the BUILT doc site — it depends on fumadocs being present.
		dependsOn: []string{"fumadocs"},
	},
}

// Keys returns the closed docs substrate palette keys in canonical emission order (the
// Workbench legend + the mirror read this single source).
func Keys() []string {
	out := make([]string, 0, len(docsPalette))
	for _, s := range docsPalette {
		out = append(out, s.key)
	}
	return out
}

// buildFragment renders ONE docs fragment for a project (pure, deterministic). The service
// name and the volume are isolated per project via the DP15 token (reused, not forked) —
// the doc site / index never bleed across projects.
func buildFragment(s fragmentSpec, projectID, token string) ServiceFragment {
	// The volume is the per-project, per-service named bind volume. The device is an ENV-VAR
	// REFERENCE (composeemit / SPEC-stack-2026 law: never a hardcoded path); the var name
	// carries the service + token so each project's bind is its own (isolation), e.g.
	// FUMADOCS_<token>_DATA_PATH. The discipline mirrors datafragments verbatim.
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

// upperEnv folds a token to an UPPER-SNAKE env-var fragment (non-alphanumerics → '_'), the
// SAME discipline datafragments.upperEnv / composeemit.envVarImage use (a deterministic
// map). Kept local so the package is self-contained; all layers fold identically, so the
// env-var keys agree across DP15/DP16/DP17/DP18/DP30.
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

// SubstrateDocsFragments is the DP30 AUTHORITATIVE door: it renders the docs palette
// (Fumadocs + Scalar + Pagefind) for (projectID, env). All three are legal in EVERY
// environment (no docs service is env-gated — unlike DP15's doltgres), so the function only
// fails-closed on an UNKNOWN environment (the DP06 motif, never guessed). Same (projectID,
// env) ⇒ byte-identical fragments.
func SubstrateDocsFragments(projectID string, env scope.Environment) ([]ServiceFragment, error) {
	if !scope.IsKnownEnvironment(env) {
		return nil, &envbindings.Refusal{
			Code:    envbindings.CodeUnknownEnvironment,
			Message: "environment is outside the closed set (want prod|staging|dev|local|future_cloud — ADR 0065)",
		}
	}
	token := datafragments.IsolationToken(projectID)
	out := make([]ServiceFragment, 0, len(docsPalette))
	for _, s := range docsPalette {
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

// CanonicalFragment returns the S02-canonical bytes of a fragment (records.Canonicalize over
// the body — keys sorted, no insignificant whitespace). Same fragment ⇒ same bytes, always
// (the byte-identity oracle of the mirror).
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

// HashFragment is the content address of a fragment (records.Hash(CanonicalFragment) — S02
// reused, never forked). Same fragment ⇒ same address on any machine; the isolation token
// makes project A's address differ from project B's.
func HashFragment(f ServiceFragment) (string, error) {
	canon, err := CanonicalFragment(f)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// ── The docs PROJECTION (Kernel + S90 OpenAPI → Scalar/Fumadocs/Pagefind data) ──────────

// ScalarEndpoint is ONE row of the Scalar API-reference projection: the S90 operation it
// renders (operationId), its REST method + path (the S90 PathOf), and whether it carries an
// authorize step. It is DATA read from the S90 ApiSpec — Scalar CONSUMES the emitted
// OpenAPI; this projection asserts every sync op is present.
type ScalarEndpoint struct {
	OperationID string `json:"operation_id"`
	Method      string `json:"method"`
	Path        string `json:"path"`
	Authorize   bool   `json:"authorize"`
}

// ScalarConfig is the Scalar standalone configuration (DATA, never runtime code): the path
// to the emitted OpenAPI document it consumes + the endpoint inventory (one per S90 sync
// op). The theme is the inherited ccup theme (ADR 0010).
type ScalarConfig struct {
	// OpenAPIPath is the RELATIVE path to the S90-emitted OpenAPI document Scalar consumes
	// (gen/<project>/api/openapi.json — the byte-stable S90 artifact). No absolute path.
	OpenAPIPath string `json:"openapi_path"`
	// Theme is the inherited ccup theme (ADR 0010) — a class hook, never a hardcoded hex.
	Theme string `json:"theme"`
	// Endpoints is the inventory of S90 sync endpoints, in canonical operationId order.
	Endpoints []ScalarEndpoint `json:"endpoints"`
}

// FumadocsPage is ONE rendered domain-concept page (DATA): its relative MDX path, its
// title, the locale it is written in (FR or EN), and the search terms it contributes to the
// Pagefind index. The text is DERIVED deterministically from the entity AST — no LLM.
type FumadocsPage struct {
	Path  string `json:"path"`
	Title string `json:"title"`
	// Locale — the language of this page (ADR 0011 bilingue). Each concept ships an FR page
	// (default) — the EN page rides the same projection at the EN locale path (the projection
	// renders the FR set; the EN mirror is the same set under /en/). The default-locale page
	// is the FR one.
	Locale string `json:"locale"`
	// Terms are the indexable search terms this page contributes (the entity name +
	// attribute names, lower-cased), the source of the Pagefind index.
	Terms []string `json:"terms"`
}

// FumadocsSite is the doc-site projection (DATA): the concept pages of the user's domain,
// in canonical order. The theme/locales ride on the DocsProjection (the whole site shares
// them).
type FumadocsSite struct {
	Pages []FumadocsPage `json:"pages"`
}

// PagefindRecord is ONE static-search index record (DATA): the page it points at + the
// indexable terms. Pagefind builds a static index over the doc site; this is the index
// content as deterministic data.
type PagefindRecord struct {
	PagePath string   `json:"page_path"`
	Title    string   `json:"title"`
	Terms    []string `json:"terms"`
}

// PagefindIndex is the static-search index projection (DATA): one record per Fumadocs page.
type PagefindIndex struct {
	Records []PagefindRecord `json:"records"`
}

// DocsProjection is the WHOLE DP30 docs projection of an emitted app: the Scalar API
// reference (consuming the S90 OpenAPI), the Fumadocs concept site, the Pagefind static
// index — PLUS the inherited theme (ADR 0010) and the bilingual locale set (ADR 0011). It
// is DATA, byte-stable, content-addressed (DocsID). It is a PROJECTION, NEVER a truth.
type DocsProjection struct {
	// Project is the emitted app this projection documents.
	Project string `json:"project"`
	// SourceHash is the S90 apisurface.SourceHash of the ApiSpec this projection is keyed on
	// — proving the docs are a PROJECTION of the EXACT same Kernel cut the API surface is.
	SourceHash string `json:"source_hash"`
	// Scalar is the API-reference config consuming the emitted OpenAPI (every sync endpoint).
	Scalar ScalarConfig `json:"scalar"`
	// Fumadocs is the domain-concept site.
	Fumadocs FumadocsSite `json:"fumadocs"`
	// Pagefind is the static search index over the site.
	Pagefind PagefindIndex `json:"pagefind"`
	// Theme is the inherited ccup theme (ADR 0010).
	Theme string `json:"theme"`
	// DefaultLocale is "fr" (ADR 0011 — bilingue, français par défaut).
	DefaultLocale string `json:"default_locale"`
	// Locales is the bilingual set [fr, en] (ADR 0011).
	Locales []string `json:"locales"`
	// IsProjection is ALWAYS true — the explicit token makes the wall testable (the docs are
	// a projection, never a verity).
	IsProjection bool `json:"is_projection"`
	// DocsID = records.Hash(records.Canonicalize(body)) over the semantic body — same spec ⇒
	// same id (the reproducibility invariant, content-addressed).
	DocsID string `json:"docs_id"`
	// WroteKernel is ALWAYS false. The projection is below the line; freezing anything into
	// truth goes via idée → miroir → /goal → approbation humaine.
	WroteKernel bool `json:"wrote_kernel"`
}

// WritesTruth reports whether the docs projection writes AIDOS Kernel truth. It is ALWAYS
// false: the projection is below-the-line DATA documenting the EMITTED app — it never
// touches the AIDOS kernel/mirrors/fitness (the wall §2).
func (DocsProjection) WritesTruth() bool { return false }

// EmittedDocs is the DP30 docs PROJECTION door — PURE, TOTAL, DETERMINISTIC. From the S90
// apisurface.ApiSpec it produces:
//
//   - the Scalar config CONSUMING the emitted OpenAPI (apisurface.EmitOpenAPI), with EVERY
//     S90 sync endpoint present (the async ops carry no synchronous route, excluded) ;
//   - the Fumadocs pages of the domain's concepts (one per distinct entity, derived from
//     the entity AST — no LLM) ;
//   - the Pagefind static index over those pages.
//
// The theme is the inherited ccup theme (ADR 0010); the locales are bilingual FR-default
// (ADR 0011). The SourceHash equals apisurface.SourceHash(spec) — the docs are keyed on the
// SAME Kernel cut. It WRITES NOTHING (WroteKernel=false, IsProjection=true). Same spec ⇒
// byte-identical projection (DocsID pins it). A malformed spec is a typed BlockReason
// (delegated to the S90 emitter — never a panic, never invented docs).
func EmittedDocs(spec apisurface.ApiSpec) (DocsProjection, error) {
	// The S90 emitter owns validation + the OpenAPI bytes: we delegate to it, never re-coin
	// the rule. A malformed spec surfaces the S90 BlockReason verbatim.
	openapi, br := apisurface.EmitOpenAPI(spec)
	if br != nil {
		return DocsProjection{}, refusalError(*br)
	}
	sourceHash, err := apisurface.SourceHash(spec)
	if err != nil {
		return DocsProjection{}, err
	}

	// 1. Scalar — CONSUME the emitted OpenAPI: one endpoint per S90 SYNC op, in canonical
	//    operationId order (the same order the S90 router/openapi emit). The async ops have
	//    no synchronous route and are excluded (parity with apisurface.syncOps).
	syncOps := syncSorted(spec)
	endpoints := make([]ScalarEndpoint, 0, len(syncOps))
	for _, op := range syncOps {
		endpoints = append(endpoints, ScalarEndpoint{
			OperationID: op.Name,
			Method:      string(op.Verb),
			Path:        apisurface.PathOf(op),
			Authorize:   op.Authorize,
		})
	}
	scalar := ScalarConfig{
		OpenAPIPath: openapi.Path, // gen/<project>/api/openapi.json — the byte-stable S90 doc
		Theme:       ThemeCcup,
		Endpoints:   endpoints,
	}

	// 2. Fumadocs — one concept page per DISTINCT entity of the domain (the entities the
	//    operations touch), in canonical name order. The page text is DERIVED from the entity
	//    AST (title = the entity name, terms = the entity + its attribute names) — no LLM.
	pages := conceptPages(spec)
	site := FumadocsSite{Pages: pages}

	// 3. Pagefind — a static index record per Fumadocs page (one-to-one), carrying the page's
	//    indexable terms. SearchIndex is the deterministic token match over these records.
	pfRecords := make([]PagefindRecord, 0, len(pages))
	for _, p := range pages {
		pfRecords = append(pfRecords, PagefindRecord{
			PagePath: p.Path,
			Title:    p.Title,
			Terms:    append([]string(nil), p.Terms...),
		})
	}
	index := PagefindIndex{Records: pfRecords}

	out := DocsProjection{
		Project:       spec.Project,
		SourceHash:    sourceHash,
		Scalar:        scalar,
		Fumadocs:      site,
		Pagefind:      index,
		Theme:         ThemeCcup,
		DefaultLocale: "fr",
		Locales:       []string{"fr", "en"},
		IsProjection:  true,
		WroteKernel:   false,
	}
	id, err := docsID(out)
	if err != nil {
		return DocsProjection{}, err
	}
	out.DocsID = id
	return out, nil
}

// DocsRefusal wraps a S90 apisurface BlockReason as a Go error so EmittedDocs surfaces a
// malformed spec verbatim (the typed refusal, never a panic). It carries the BlockReason so
// `aidos explain` / the Workbench panel can render its code + how_to_fix unchanged — the
// emitter coins no new refusal (it delegates validation to S90, the wall §2 honesty).
type DocsRefusal struct {
	BlockReason blockreason.BlockReason
}

func (e *DocsRefusal) Error() string { return e.BlockReason.Explanation }

// refusalError lifts a S90 BlockReason to a *DocsRefusal error value.
func refusalError(br blockreason.BlockReason) error {
	return &DocsRefusal{BlockReason: br}
}

// AsRefusal extracts a *DocsRefusal from an error (the errors.As idiom) so a caller can read
// the underlying BlockReason. Returns false for any other error.
func AsRefusal(err error, target **DocsRefusal) bool { return errors.As(err, target) }

// syncSorted returns the spec's SYNC operations in canonical operationId order (so map/source
// order never leaks into the bytes) — the SAME filter+order apisurface.syncOps applies, kept
// local so the projection is parity-faithful to the S90 surface.
func syncSorted(spec apisurface.ApiSpec) []apisurface.Op {
	out := make([]apisurface.Op, 0, len(spec.Ops))
	for _, op := range spec.Ops {
		if !op.Async {
			out = append(out, op)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// conceptPages renders one Fumadocs concept page per DISTINCT entity the spec's operations
// touch, in canonical entity-name order. The page is DATA derived from the entity AST: the
// title is the entity name; the terms are the lower-cased entity name + its attribute names
// (the domain vocabulary Pagefind indexes). PURE — no LLM, no clock.
func conceptPages(spec apisurface.ApiSpec) []FumadocsPage {
	seen := map[string]entities.Entity{}
	for _, op := range spec.Ops {
		if op.Entity.Name == "" {
			continue
		}
		if _, ok := seen[op.Entity.Name]; !ok {
			seen[op.Entity.Name] = op.Entity
		}
	}
	names := make([]string, 0, len(seen))
	for n := range seen {
		names = append(names, n)
	}
	sort.Strings(names)
	pages := make([]FumadocsPage, 0, len(names))
	for _, n := range names {
		e := seen[n]
		terms := conceptTerms(e)
		pages = append(pages, FumadocsPage{
			Path:   "concepts/" + strings.ToLower(n) + ".mdx",
			Title:  n,
			Locale: "fr", // FR par défaut (ADR 0011) — the EN mirror rides the same set under /en/
			Terms:  terms,
		})
	}
	return pages
}

// conceptTerms derives the indexable search terms of an entity's concept page: the entity
// name + each attribute name, lower-cased and de-duplicated, in stable order. PURE.
func conceptTerms(e entities.Entity) []string {
	seen := map[string]bool{}
	out := []string{}
	add := func(s string) {
		t := strings.ToLower(strings.TrimSpace(s))
		if t == "" || seen[t] {
			return
		}
		seen[t] = true
		out = append(out, t)
	}
	add(e.Name)
	for _, a := range e.Attributes {
		add(a.Name)
	}
	sort.Strings(out)
	return out
}

// SearchIndex is the DETERMINISTIC static-search query over a Pagefind index: it returns the
// page paths whose indexed terms contain the (lower-cased) query token, in stable order. It
// is a PURE token match — no LLM, no fuzzy ranking. An off-domain term returns nothing (the
// index is honest, never a catch-all). This is the code twin of pagefind's static index
// lookup — the runtime serves the built index; this proves the index FINDS.
func SearchIndex(index PagefindIndex, query string) []string {
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return nil
	}
	var hits []string
	for _, rec := range index.Records {
		for _, t := range rec.Terms {
			if strings.Contains(t, q) {
				hits = append(hits, rec.PagePath)
				break
			}
		}
	}
	sort.Strings(hits)
	return hits
}

// CanonicalDocs returns the S02-canonical bytes of a docs projection (records.Canonicalize
// over the semantic body, EXCLUDING DocsID — the address never depends on itself). Same
// projection ⇒ same bytes, always (the byte-identity oracle of the docs mirror).
func CanonicalDocs(d DocsProjection) ([]byte, error) {
	body := docsBody(d)
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// docsBody is the address-bearing body of a projection — every semantic field EXCEPT DocsID
// (content addresses cannot depend on themselves) and WroteKernel (a constant invariant, not
// part of the identity).
func docsBody(d DocsProjection) any {
	return struct {
		Project       string        `json:"project"`
		SourceHash    string        `json:"source_hash"`
		Scalar        ScalarConfig  `json:"scalar"`
		Fumadocs      FumadocsSite  `json:"fumadocs"`
		Pagefind      PagefindIndex `json:"pagefind"`
		Theme         string        `json:"theme"`
		DefaultLocale string        `json:"default_locale"`
		Locales       []string      `json:"locales"`
		IsProjection  bool          `json:"is_projection"`
	}{
		Project:       d.Project,
		SourceHash:    d.SourceHash,
		Scalar:        d.Scalar,
		Fumadocs:      d.Fumadocs,
		Pagefind:      d.Pagefind,
		Theme:         d.Theme,
		DefaultLocale: d.DefaultLocale,
		Locales:       d.Locales,
		IsProjection:  d.IsProjection,
	}
}

// docsID content-addresses a projection (records.Hash(CanonicalDocs) — S02 reused). Same
// body ⇒ same id, key-order-stable.
func docsID(d DocsProjection) (string, error) {
	canon, err := CanonicalDocs(d)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}
