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
package preview

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
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
type Input struct {
	Phase   PhaseRef          `json:"phase"`
	Surface EmittedSurface    `json:"surface"`
	Program honoemit.Artifact `json:"program"`
	// DomainRoot is the preview wildcard root (e.g. "preview.aidos.app"). The per-phase
	// subdomain is minted under it deterministically from the phase hash. Defaults to
	// DefaultDomainRoot when empty so the plan is always projectable.
	DomainRoot string `json:"domain_root"`
}

// DefaultDomainRoot is the preview wildcard root used when Input.DomainRoot is empty.
const DefaultDomainRoot = "preview.aidos.app"

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
	id, err := plan.contentAddress()
	if err != nil {
		br := block(err)
		return PreviewPlan{}, &br
	}
	plan.ID = id
	return plan, nil
}

// contentAddress hashes the canonical plan body (every field except ID) into the plan's ID —
// the idempotency key. S02 reused (Canonicalize+Hash), never a forked scheme.
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
