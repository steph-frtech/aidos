// Package preview is the AIDOS Runtime EPHEMERAL PREVIEW ENVIRONMENT planner (S94;
// app-builder EPIC 10, ADR 0043 / DP25).
//
// THE CAPABILITY. Given the EMITTED SURFACE of a content-addressed STABLE PHASE (the
// emitted app's server bundle, front bundle and infra/Pulumi program — produced by
// honoemit (S87), frontemit (S93) and the provision plan (S89)), preview computes a
// DETERMINISTIC, content-addressed PreviewPlan:
//
//   - the EmittedAppHash — the single content address of the WHOLE emitted app of the
//     phase (server ⊕ front ⊕ infra ⊕ datastore), so "the preview serves THIS phase" is
//     a hash equality, never a guess;
//   - a PREVIEW URL keyed on the phase (a stable, collision-resistant subdomain derived
//     from the phase hash) — the same phase always previews at the same URL;
//   - the BOOT command (`pulumi up` of the EMITTED Pulumi program, ADR 0043) and the
//     TEARDOWN command (`pulumi destroy`), both deterministic — the preview is a process
//     (Node/Bun/edge Hono server, ADR 0040, NOT a Go binary) brought up and torn down by
//     the emitted infra program, never a hand-written deploy.sh (DP26 "deploy = re-emit").
//
// THE DONE-CRITERION (S94). Godog build-green → the preview URL serves the app; the
// SERVED-app hash of the preview equals the EMITTED app hash of the phase. preview owns
// the deterministic part: it computes the EmittedAppHash and the plan; the served hash is
// reported back by the running preview (the /__aidos_hash probe the emitted server exposes)
// and asserted EQUAL — code judges the equality (determinism-first), never an agent.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). BuildPlan is a PURE, TOTAL function of its
// canonicalised input — no clock, no RNG, no map-order leak, no absolute path. Same emitted
// surface for the same phase → byte-identical PreviewPlan (same id, same URL, same boot/
// teardown). The reproducibility mirror (preview_property_test.go) pins it. The hash
// equality check (ServedMatchesEmitted) is a pure comparison.
//
// THE WALL (CLAUDE.md §2). preview READS the emitted surface (already-projected bytes,
// below the line) and PLANS the ephemeral environment — it writes NOTHING to the kernel/
// mirrors/fitness. A malformed input (no phase, no server, mismatched project) is a typed
// BlockReason (the S13 shape), never a panic, never an invented URL/phase.
//
// DP25 — THE PROFILE + BOOTSTRAP EXTENSION (EPIC F opens, extending S94, never duplicating
// it). The preview RE-EMITS from the phase (DP05 stackemit.EmitStack is the function the
// gated executor runs to materialize the served bytes) and then AMORCES the ephemeral
// environment via the DP12 deterministic bootstrap sequence (bootstrap.EmitBootstrapSequence),
// with a DP11-SELECTABLE PROFILE (composeemit.FilterByProfile): `core` by default, `full`
// for a complete preview. The profile is a CLOSED-SET membership (DP11), never inferred.
//
//   - THE CAPITAL INVARIANT. The profile changes the SERVICES that are bootstrapped (a lean
//     profile boots fewer services than full), but NEVER the EmittedAppHash of the phase —
//     the app-hash is a pure function of (phase ⊕ surface), profile-independent. The
//     reproducibility mirror pins ∀ profiles: same phase → same EmittedAppHash;
//     ServedMatchesEmitted holds across every profile. (DP11 semantic: `core` is the
//     always-on baseline — it keeps every service whose profile set contains core, which is
//     all of them — so `core` ≡ `full` in service count; a SPECIFIC profile no optional
//     service declares is the one that genuinely narrows the boot set.)
//   - RE-EMISSION IS PURE. Same (phase, surface, profile, manifest, host, secrets) →
//     byte-identical PreviewPlan (same ID, same bootstrap sequence, same teardown). No
//     clock, no RNG, no I/O — the bootstrap host state is an explicit DATA input (the DP12
//     motif), the docker run stays gated (the mirror proves the PLAN + the hash; the
//     existing web-preview server serves the app, ADR 0040 — no real docker here).
//   - DETERMINISTIC TEARDOWN. TeardownOf derives the teardown plan purely from the built
//     plan (the same Pulumi destroy + stack removal, ${VAR}-only) — a demounting that is a
//     pure function of the plan, never a hand-written deploy.sh (DP26 "deploy = re-emit").
//
// BACKWARD-COMPATIBLE (CLAUDE.md §9 anti-overwrite). The bootstrap section is ADDITIVE: an
// Input with no Manifest (the S94 shape) yields exactly the S94 PreviewPlan (no Profile, no
// Bootstrap) — every S94 test stays byte-identical green. Supplying a Manifest opts in to
// the DP25 profile-filtered bootstrap; the EmittedAppHash/URL/StackName are unchanged either
// way (they never read the profile or the manifest).
package preview

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/bootstrap"
	"github.com/steph-frtech/aidos/back/runtime/composeemit"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// mustJSON marshals a value to JSON for the canonical content-address body. The shapes
// passed in are always JSON-marshalable (plain maps/slices/strings), so an error is a
// programming fault, not a runtime input — it surfaces as "{}" (the hash then differs,
// never silently equal).
func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return b
}

// previewBlockCode is the BlockReason code every preview refusal carries (the S13 shape:
// code, severity, explanation, how_to_fix). preview reuses the kernel's OUT_OF_SCOPE code
// (the closed registry) rather than coining a new one — a malformed/cross-app preview input
// is an out-of-scope source, exactly like an emitter's malformed source (honoemit).
const previewBlockCode = blockreason.CodeOutOfScope

// EmittedSurface is the WHOLE emitted app of a stable phase: the content-addressed bytes
// of the emitted server bundle (honoemit, S87), the emitted front bundle (frontemit, S93)
// and the emitted infra/Pulumi program (honoemit pulumi, ADR 0043), plus the datastore
// plan hash (provision, S89). It is the INPUT preview hashes into the EmittedAppHash — the
// single content address of "the app this phase emits".
//
// Each component is identified by its OutputHash (the digest of its emitted bytes), so the
// surface is content-addressed by construction and a single byte change anywhere in any
// emitted artifact yields a new EmittedAppHash (no stale preview can masquerade as a phase).
type EmittedSurface struct {
	// Project is the app the surface belongs to. Every component must agree on it (a
	// cross-project surface is refused) — the preview is per-app (S94 "par app").
	Project string `json:"project"`
	// ServerBundleHash is the OutputHash of the emitted Hono/TS server bundle (S87).
	ServerBundleHash string `json:"server_bundle_hash"`
	// FrontBundleHash is the OutputHash of the emitted front bundle (S93).
	FrontBundleHash string `json:"front_bundle_hash"`
	// InfraHash is the OutputHash of the emitted Pulumi/TS infra program (ADR 0043).
	InfraHash string `json:"infra_hash"`
	// DatastoreHash is the content address of the provision Plan (S89). Optional: an app with
	// no datastore (a pure-compute preview) leaves it empty — the surface stays projectable.
	DatastoreHash string `json:"datastore_hash"`
}

// PhaseRef is the content address of the STABLE PHASE the preview is keyed on (S94 "keyée
// sur une phase content-addressée"). It is the phases.StablePhase Version() — a Hash — so
// two distinct phases never collide on a preview URL, and the SAME phase always previews at
// the SAME URL (idempotent boot).
type PhaseRef struct {
	// PhaseHash is the content address of the stable phase (Hash(Canonicalize(phase body))).
	PhaseHash string `json:"phase_hash"`
}

// Input is the whole preview request: the phase to preview, its emitted surface, the
// emitted Pulumi program (the boot/teardown unit), and the preview-domain root under which
// the per-phase subdomain is minted. PURE input — no clock, no host path.
//
// DP25 adds the OPTIONAL bootstrap section (Profile + Manifest + Host + Secrets + Env). When
// Manifest.AppName is empty the input is exactly the S94 shape (no bootstrap is computed and
// the plan carries no Profile/Bootstrap). When a Manifest is supplied, BuildPlan ADDITIONALLY
// computes the DP11-profile-filtered DP12 bootstrap sequence — never altering the EmittedAppHash.
type Input struct {
	Phase   PhaseRef          `json:"phase"`
	Surface EmittedSurface    `json:"surface"`
	Program honoemit.Artifact `json:"program"`
	// DomainRoot is the preview wildcard root (e.g. "preview.aidos.app"). The per-phase
	// subdomain is minted under it deterministically from the phase hash. Defaults to
	// DefaultDomainRoot when empty so the plan is always projectable.
	DomainRoot string `json:"domain_root"`

	// --- DP25: the optional profile-filtered bootstrap section -------------------
	// Profile is the DP11 compose profile the preview's bootstrap is filtered by — a
	// member of the closed SPEC-stack-2026 set. Defaults to DefaultProfile (`core`) when
	// empty (set-membership, never inferred). It selects the SERVICES that boot, NEVER
	// the EmittedAppHash. Ignored when Manifest is absent.
	Profile stackmanifest.Profile `json:"profile,omitempty"`
	// Manifest is the DP02 StackManifest source the phase pins — the topology whose
	// services the bootstrap amorces. Optional: absent ⇒ the S94 plan (no bootstrap).
	Manifest stackmanifest.StackManifest `json:"manifest,omitempty"`
	// Host is the observed host snapshot AS DATA (DP12 motif) the port resolver reads.
	// The snapshot is taken by the gated executor, never inside this package.
	Host bootstrap.HostState `json:"host,omitempty"`
	// Secrets is the set of secret env-var NAMES present at boot (DP12). A missing
	// required secret fails the bootstrap closed (MISSING_SECRET_AT_BOOT).
	Secrets bootstrap.SecretsState `json:"secrets,omitempty"`
	// Env is the target environment of the preview — used ONLY for the DP11 cross
	// non-prod × prod gate (Doltgres forbidden in prod). Defaults to EnvDev (a preview is
	// an ephemeral non-prod environment) when empty.
	Env scope.Environment `json:"env,omitempty"`
}

// DefaultDomainRoot is the preview wildcard root used when Input.DomainRoot is empty.
const DefaultDomainRoot = "preview.aidos.app"

// DefaultProfile is the DP11 compose profile a preview boots when Input.Profile is empty —
// `core` (the always-running services only). `full` is selected for a complete preview.
const DefaultProfile = stackmanifest.ProfileCore

// DefaultPreviewEnv is the target environment of a preview when Input.Env is empty — a
// preview is an ephemeral NON-PROD environment (dev), so the DP11 Doltgres-in-prod gate
// never bites by default; an explicit prod Env still triggers the delegated DP06 refusal.
const DefaultPreviewEnv = scope.EnvDev

// PreviewPlan is the DETERMINISTIC, content-addressed plan that brings the phase's emitted
// app up at a preview URL and tears it down. Same Input → byte-identical Plan (same ID).
type PreviewPlan struct {
	// ID is the content address of the whole plan (Hash(Canonicalize(canonical body))) — the
	// idempotency key. Same Input → same ID, so re-previewing a phase is a no-op.
	ID string `json:"id"`
	// Project + PhaseHash echo the keying (the preview is per-app, per-phase).
	Project   string `json:"project"`
	PhaseHash string `json:"phase_hash"`
	// EmittedAppHash is the single content address of the WHOLE emitted app of the phase.
	// The preview's served-app hash MUST equal this (the S94 done-criterion).
	EmittedAppHash string `json:"emitted_app_hash"`
	// URL is the preview URL the app is served at — a per-phase subdomain under DomainRoot,
	// deterministically derived from the phase hash (same phase → same URL).
	URL string `json:"url"`
	// Subdomain is the per-phase preview subdomain label (the URL's host first label).
	Subdomain string `json:"subdomain"`
	// StackName is the Pulumi stack the preview runs as (per-app, per-phase, deterministic).
	StackName string `json:"stack_name"`
	// ProgramPath is the path of the emitted Pulumi program the boot/teardown commands run.
	ProgramPath string `json:"program_path"`
	// Boot is the deterministic command sequence that brings the preview up (`pulumi up`).
	Boot []string `json:"boot"`
	// Teardown is the deterministic command sequence that tears the preview down
	// (`pulumi destroy`) — the preview is DEMOUNTED DETERMINISTICALLY (S94).
	Teardown []string `json:"teardown"`

	// --- DP25: the profile-filtered bootstrap section (nil for an S94 plan) ------
	// Profile is the DP11 compose profile this preview's bootstrap was filtered by
	// (DefaultProfile when no Manifest is supplied — but Bootstrap stays nil then).
	Profile stackmanifest.Profile `json:"profile,omitempty"`
	// Bootstrap is the DP11-profile-filtered DP12 bootstrap sequence the preview amorces
	// AFTER the re-emission — nil when no Manifest was supplied (the S94 shape). The
	// profile changes the bootstrapped SERVICES here, NEVER the EmittedAppHash above.
	Bootstrap *PreviewBootstrap `json:"bootstrap,omitempty"`
}

// PreviewBootstrap is the DP25 profile-filtered amorçage of a preview: the DP11 profile,
// the DP12 ordered event sequence over the profile-filtered services, the content address
// of that sequence (so "same phase+profile → same bootstrap" is one comparison), and the
// names of the services the profile kept. PURE: it carries no secret value, no resolved
// endpoint — only NAMES and ${VAR} references (the DP12 discipline).
type PreviewBootstrap struct {
	// Profile is the DP11 compose profile the manifest's services were filtered by.
	Profile stackmanifest.Profile `json:"profile"`
	// Sequence is the DP12 ordered bootstrap events over the profile-filtered manifest.
	Sequence bootstrap.Sequence `json:"sequence"`
	// SequenceHash is the content address of the sequence (bootstrap.Sequence.Hash) —
	// the profile-dependent address: core vs full differ here, but the EmittedAppHash
	// above does not. Same phase+profile → same SequenceHash (reproducibility).
	SequenceHash string `json:"sequence_hash"`
	// Services are the NAMES of the services the profile kept (sorted, deterministic) —
	// the breakdown the Workbench surfaces (core boots fewer than full).
	Services []string `json:"services"`
}

// Typed causes — every refusal is one of these (honesty rule: never invent a URL/phase).
var (
	ErrNoProject  = errors.New("preview: surface has no project")
	ErrNoPhase    = errors.New("preview: no phase hash (a preview is keyed on a content-addressed phase)")
	ErrNoServer   = errors.New("preview: surface has no server bundle (the app must boot a server)")
	ErrNoFront    = errors.New("preview: surface has no front bundle (the app must serve a UI)")
	ErrNoInfra    = errors.New("preview: surface has no infra program (nothing to `pulumi up`)")
	ErrNoProgram  = errors.New("preview: no emitted Pulumi program to boot")
	ErrProjectMix = errors.New("preview: program project does not match the surface project")
	// ErrManifestProjectMix — the supplied DP02 manifest belongs to another app than the
	// surface (a cross-app bootstrap). The preview is per-app (S94).
	ErrManifestProjectMix = errors.New("preview: manifest app does not match the surface project")
)

// block wraps a cause into a typed BlockReason (the S13 shape) with an actionable fix.
func block(cause error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:        previewBlockCode,
		Severity:    blockreason.SeverityBlocking,
		Explanation: "Preview refused: " + cause.Error(),
		HowToFix: []string{
			"Provide a content-addressed phase (phase_hash) and a complete emitted surface",
			"Emit the server (S87), front (S93) and infra/Pulumi program (ADR 0043) for the phase first",
			"Ensure every emitted component belongs to the same project",
		},
	}
}

// validate checks the input is previewable: a phase, a project, a server+front+infra
// surface, an emitted program for the SAME project. It invents nothing.
func validate(in Input) error {
	if in.Phase.PhaseHash == "" {
		return ErrNoPhase
	}
	if in.Surface.Project == "" {
		return ErrNoProject
	}
	if in.Surface.ServerBundleHash == "" {
		return ErrNoServer
	}
	if in.Surface.FrontBundleHash == "" {
		return ErrNoFront
	}
	if in.Surface.InfraHash == "" {
		return ErrNoInfra
	}
	if len(in.Program.Bytes) == 0 || in.Program.Path == "" {
		return ErrNoProgram
	}
	// The emitted Pulumi program lands under gen/<project>/infra/… — its path must carry the
	// surface project, else the program belongs to another app (a cross-app preview).
	if !strings.Contains(in.Program.Path, "gen/"+in.Surface.Project+"/") {
		return ErrProjectMix
	}
	return nil
}

// EmittedAppHash is the SINGLE content address of the whole emitted app of a phase: the
// canonical join of the surface's component hashes (server ⊕ front ⊕ infra ⊕ datastore),
// keyed by the phase. PURE + content-addressed via S02 (records.Canonicalize+Hash, never a
// forked scheme). The same emitted surface for the same phase → the same hash; any byte
// change in any emitted artifact → a new hash.
func EmittedAppHash(phase PhaseRef, s EmittedSurface) (string, error) {
	body := map[string]any{
		"phase":         phase.PhaseHash,
		"project":       s.Project,
		"server_bundle": s.ServerBundleHash,
		"front_bundle":  s.FrontBundleHash,
		"infra":         s.InfraHash,
		"datastore":     s.DatastoreHash,
	}
	canon, err := records.Canonicalize(mustJSON(body))
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// subdomainOf mints the per-phase preview subdomain label: "p-" + the first 12 hex chars of
// the phase hash (lower-case, DNS-safe). Deterministic — same phase → same subdomain. The
// "p-" prefix guarantees the label starts with a letter (DNS labels may not start a digit).
func subdomainOf(phaseHash string) string {
	h := strings.ToLower(phaseHash)
	var b strings.Builder
	for _, r := range h {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
		if b.Len() >= 12 {
			break
		}
	}
	short := b.String()
	if short == "" {
		short = "000000000000"
	}
	return "p-" + short
}

// BuildPlan computes the deterministic, content-addressed PreviewPlan for the input. PURE:
// validate → EmittedAppHash → per-phase URL/stack → boot/teardown commands → content-address
// the whole plan. Same Input → byte-identical Plan (same ID). Writes nothing (the wall).
func BuildPlan(in Input) (PreviewPlan, *blockreason.BlockReason) {
	if err := validate(in); err != nil {
		br := block(err)
		return PreviewPlan{}, &br
	}

	appHash, err := EmittedAppHash(in.Phase, in.Surface)
	if err != nil {
		br := block(err)
		return PreviewPlan{}, &br
	}

	root := in.DomainRoot
	if root == "" {
		root = DefaultDomainRoot
	}
	sub := subdomainOf(in.Phase.PhaseHash)
	url := "https://" + sub + "." + root
	// The Pulumi stack is per-app, per-phase, deterministic — so two phases of the same app
	// never share a stack and re-previewing a phase targets the same stack (idempotent).
	stack := "preview-" + in.Surface.Project + "-" + sub

	boot := []string{
		"pulumi", "stack", "select", "--create", stack,
		"&&",
		"pulumi", "up", "--yes", "--cwd", dir(in.Program.Path),
	}
	teardown := []string{
		"pulumi", "destroy", "--yes", "--cwd", dir(in.Program.Path),
		"&&",
		"pulumi", "stack", "rm", "--yes", stack,
	}

	plan := PreviewPlan{
		Project:        in.Surface.Project,
		PhaseHash:      in.Phase.PhaseHash,
		EmittedAppHash: appHash,
		URL:            url,
		Subdomain:      sub,
		StackName:      stack,
		ProgramPath:    in.Program.Path,
		Boot:           boot,
		Teardown:       teardown,
	}

	// DP25 — the OPTIONAL profile-filtered bootstrap section. Only when a DP02 manifest is
	// supplied (else the S94 shape is preserved byte-identically). The EmittedAppHash above
	// is already computed and NEVER read here: the profile changes the bootstrapped services,
	// never the app-hash (the capital invariant).
	if in.Manifest.AppName != "" {
		bs, br := buildBootstrap(in)
		if br != nil {
			return PreviewPlan{}, br
		}
		plan.Profile = bs.Profile
		plan.Bootstrap = bs
	}

	id, err := plan.contentAddress()
	if err != nil {
		br := block(err)
		return PreviewPlan{}, &br
	}
	plan.ID = id
	return plan, nil
}

// profileOf resolves the DP11 profile the preview boots: the declared Input.Profile, or
// DefaultProfile (`core`) when empty. Set-membership is enforced downstream by FilterByProfile
// (UNKNOWN_PROFILE) — profileOf never coerces an out-of-set value to the nearest known one.
func profileOf(in Input) stackmanifest.Profile {
	if in.Profile == "" {
		return DefaultProfile
	}
	return in.Profile
}

// buildBootstrap computes the DP25 profile-filtered bootstrap of a preview, REUSING DP11 +
// DP12 verbatim (never forking the rules):
//
//  1. the manifest must belong to the SAME project as the surface (per-app preview, S94);
//  2. DP11 composeemit.FilterByProfile narrows the manifest's services to the selected
//     profile (UNKNOWN_PROFILE / DOLTGRES_NOT_ALLOWED_IN_PROD surface verbatim);
//  3. DP12 bootstrap.EmitBootstrapSequence renders the deterministic ordered amorçage over
//     the FILTERED manifest (MISSING_SECRET_AT_BOOT / invalid-manifest surface verbatim).
//
// PURE: same (manifest, profile, host, secrets, env) → byte-identical PreviewBootstrap. It
// runs no real docker — the events are a deterministic plan-as-data (the gated executor and
// the Workbench consume them; the existing web-preview server serves the app).
func buildBootstrap(in Input) (*PreviewBootstrap, *blockreason.BlockReason) {
	// (1) per-app: the manifest's app must match the surface's project.
	if in.Manifest.AppName != in.Surface.Project {
		br := block(ErrManifestProjectMix)
		return nil, &br
	}

	profile := profileOf(in)
	env := in.Env
	if env == "" {
		env = DefaultPreviewEnv
	}

	// (2) DP11 — filter the manifest's services by the selected profile. The filter owns
	// the closed-set membership (UNKNOWN_PROFILE) and the delegated DP06 prod×non-prod gate.
	filtered, fbr := composeemit.FilterByProfile(in.Manifest, profile, env)
	if fbr != nil {
		return nil, fbr
	}

	// (3) DP12 — render the deterministic bootstrap sequence over the FILTERED manifest.
	seq, sbr := bootstrap.EmitBootstrapSequence(filtered, in.Host, in.Secrets)
	if sbr != nil {
		return nil, sbr
	}

	return &PreviewBootstrap{
		Profile:      profile,
		Sequence:     seq,
		SequenceHash: seq.Hash(),
		Services:     serviceNames(filtered),
	}, nil
}

// serviceNames returns the kept services' names in canonical (sorted) order — the
// deterministic breakdown the Workbench surfaces (the profile kept exactly these).
func serviceNames(m stackmanifest.StackManifest) []string {
	out := make([]string, 0, len(m.Services))
	for _, s := range m.Services {
		out = append(out, s.Name)
	}
	sort.Strings(out)
	return out
}

// contentAddress hashes the canonical plan body (every field except ID) into the plan's ID —
// the idempotency key. S02 reused (Canonicalize+Hash), never a forked scheme.
//
// DP25: the profile + the bootstrap sequence address fold into the plan ID, so "same
// phase+profile → byte-identical plan" includes the bootstrap, and core vs full yield
// DISTINCT plan IDs (different bootstrapped services). An S94 plan (no Manifest → nil
// Bootstrap, empty Profile) keeps its ORIGINAL address: the profile/bootstrap keys are
// OMITTED when absent, so the existing S94 plan IDs are unchanged (anti-overwrite §9).
func (p PreviewPlan) contentAddress() (string, error) {
	body := map[string]any{
		"project":          p.Project,
		"phase_hash":       p.PhaseHash,
		"emitted_app_hash": p.EmittedAppHash,
		"url":              p.URL,
		"subdomain":        p.Subdomain,
		"stack_name":       p.StackName,
		"program_path":     p.ProgramPath,
		"boot":             p.Boot,
		"teardown":         p.Teardown,
	}
	// Fold the DP25 bootstrap ONLY when present — an S94 plan (no bootstrap) keeps its
	// original byte-identical content address.
	if p.Bootstrap != nil {
		body["profile"] = string(p.Profile)
		body["bootstrap_hash"] = p.Bootstrap.SequenceHash
	}
	canon, err := records.Canonicalize(mustJSON(body))
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// ServedMatchesEmitted is the S94 DONE-CRITERION CHECK, made deterministic: the running
// preview reports its SERVED-app hash (the /__aidos_hash probe the emitted server exposes,
// which equals the EmittedAppHash baked into the emitted bytes); preview asserts it EQUALS
// the plan's EmittedAppHash. A pure comparison — CODE judges the equality, never an agent.
// Returns (true, nil) on match, (false, BlockReason) on mismatch (a stale/wrong preview).
func ServedMatchesEmitted(plan PreviewPlan, servedAppHash string) (bool, *blockreason.BlockReason) {
	if servedAppHash == plan.EmittedAppHash {
		return true, nil
	}
	br := blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: fmt.Sprintf(
			"the preview serves app hash %q but the phase emits %q — the preview does not serve this phase",
			servedAppHash, plan.EmittedAppHash),
		HowToFix: []string{
			"Re-emit the phase's surface and rebuild the preview plan (deploy = re-emit, DP26)",
			"Tear the stale preview down (`pulumi destroy`) and `pulumi up` the current program",
		},
	}
	return false, &br
}

// TeardownPlan is the DP25 DETERMINISTIC demounting of a preview, derived PURELY from a
// built PreviewPlan: the stack to remove, the Pulumi destroy + stack-rm command sequence,
// and the bootstrap services to tear down in REVERSE boot order (full unwinds more than
// core — the demounting mirrors what was amorced). Same plan → byte-identical TeardownPlan.
type TeardownPlan struct {
	// StackName is the Pulumi stack being demounted (echoes the plan).
	StackName string `json:"stack_name"`
	// Commands is the deterministic teardown command sequence (== the plan's Teardown:
	// `pulumi destroy` + `pulumi stack rm`).
	Commands []string `json:"commands"`
	// Services are the bootstrap services to tear down, in REVERSE boot order (the
	// inverse of the amorçage) — empty for an S94 plan (no bootstrap). The demounting is
	// the exact inverse of what the profile booted (core unwinds fewer than full).
	Services []string `json:"services"`
}

// TeardownOf derives the deterministic teardown of a built plan — a PURE function of the
// plan (no clock, no RNG, no I/O). The preview is DEMOUNTED DETERMINISTICALLY (S94, extended
// DP25): same plan → same teardown; the bootstrap services unwind in reverse boot order, so
// a full preview demounts more services than a core one (the demounting mirrors the amorçage).
func TeardownOf(plan PreviewPlan) TeardownPlan {
	cmds := make([]string, len(plan.Teardown))
	copy(cmds, plan.Teardown)

	var services []string
	if plan.Bootstrap != nil {
		// Reverse the kept services (the inverse of the boot order) — a pure, total reversal.
		n := len(plan.Bootstrap.Services)
		services = make([]string, n)
		for i := 0; i < n; i++ {
			services[i] = plan.Bootstrap.Services[n-1-i]
		}
	}
	return TeardownPlan{
		StackName: plan.StackName,
		Commands:  cmds,
		Services:  services,
	}
}

// dir returns the directory of a forward-slash relative path (the Pulumi --cwd). Pure: no
// filepath (which would leak the host separator) — preview paths are always "/"-joined.
func dir(p string) string {
	i := strings.LastIndex(p, "/")
	if i < 0 {
		return "."
	}
	return p[:i]
}

// sortedHashes returns the surface component hashes in canonical order (stable join input).
// Exposed for callers that want the deterministic component list (the Workbench surface
// breakdown). Never used for the content address (that walks named keys, order-free).
func (s EmittedSurface) sortedHashes() []string {
	hs := []string{s.ServerBundleHash, s.FrontBundleHash, s.InfraHash}
	if s.DatastoreHash != "" {
		hs = append(hs, s.DatastoreHash)
	}
	sort.Strings(hs)
	return hs
}
