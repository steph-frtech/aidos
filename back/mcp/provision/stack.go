// stack.go — the DP13 STACK / BOOTSTRAP / PROFILE tool handlers of the provisioning
// MCP server (ROADMAP-provisioning-deploy EPIC C, on top of S58, ADR 0009).
//
// Each handler frames an EXISTING deterministic emitter as an MCP tool — PURE ROUTING,
// ZERO LLM (CLAUDE.md §6/§8): no clock, no rng, no model enters; the code judges and
// the response is a byte-stable function of the request (the reproducibility mirror).
//
// THE WALL IS APPLIED SERVER-SIDE (CLAUDE.md §2), reusing the SAME predicates the S58
// gateway and the Postgres RLS enforce — never a forked rule, never a GRANT bypass:
//
//   - PROJECT SCOPE. Every below-the-line call runs projectwall.Classify(scope,
//     target) BEFORE the emitter; a cross-project / forged call is refused with
//     AGENT_CROSS_PROJECT_WRITE and emits nothing.
//   - BELOW THE LINE ACTS DIRECT. The five stack.* projections read the manifest AST
//     (the SELECT-only kernel mirror) + the observed host state and return
//     bytes/events/ports — they write no truth.
//   - A TRUTH-WRITE NEVER GOES DIRECT. stack.engrave_manifest is the fenced door a
//     caller might craft to move a manifest (above-the-line truth) directly; it is
//     refused with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET (truth moves only via
//     idea → mirror → /goal → ChangeSet). The server holds no GRANT to write truth.
package main

import (
	"context"
	"net/http"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/bootstrap"
	"github.com/steph-frtech/aidos/back/runtime/composeemit"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
	"github.com/steph-frtech/aidos/back/runtime/stackemit"
)

// ── shared project-scope I/O (the SAME shape the S58 gateway uses) ──

// scopeIn is the active (identity, project) scope a request is pinned to (S57 cookie
// + S61 propagated identity).
type scopeIn struct {
	Identity      string `json:"identity" jsonschema:"the propagated caller identity (S61); the RLS keys app.identity on it"`
	ActiveProject string `json:"active_project" jsonschema:"the project_id the request is pinned to (S57 cookie)"`
}

// targetIn is the project the call acts on (+ an optionally-asserted identity; a
// non-empty mismatching value is a forged claim → refused).
type targetIn struct {
	ProjectID       string `json:"project_id" jsonschema:"the project the call's rows/emission belong to"`
	ClaimedIdentity string `json:"claimed_identity,omitempty" jsonschema:"an asserted identity; non-empty mismatching = forged → refused"`
}

// blockOut is the actionable refusal shape surfaced over the wire (CLAUDE.md §2:
// code, severity, explanation, how_to_fix[]). Identical across every block site.
type blockOut struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

// hostStateIn is the OBSERVED host snapshot AS DATA (the DP10 spike convention) — the
// raw ss + docker ps output the gated executor captures; the resolver is pure over it.
type hostStateIn struct {
	SSOutput       string `json:"ss_output,omitempty" jsonschema:"raw ss -ltn output (observed host state)"`
	DockerPSOutput string `json:"docker_ps_output,omitempty" jsonschema:"raw docker ps Ports output (observed host state)"`
}

// secretsStateIn carries the secret env-var NAMES present in the appliance at boot
// (APP_SECRET_<SCOPE>) — no value, only presence (the DP12 set-difference check).
type secretsStateIn struct {
	Present []string `json:"present,omitempty" jsonschema:"the secret env-var NAMES present at boot (no value)"`
}

func (h hostStateIn) toHostState() bootstrap.HostState {
	return bootstrap.HostState{SSOutput: h.SSOutput, DockerPSOutput: h.DockerPSOutput}
}

func (s secretsStateIn) toSecretsState() bootstrap.SecretsState {
	return bootstrap.SecretsState{Present: s.Present}
}

// scopeCheck runs the project-aware wall (the SAME projectwall.Classify the gateway +
// RLS enforce). On a cross-project / forged call it returns the gateway-shaped
// BlockReason; on an in-scope call it returns nil (proceed to the emitter).
func scopeCheck(s scopeIn, t targetIn) *blockOut {
	d := projectwall.Classify(
		projectwall.Scope{Identity: s.Identity, ActiveProject: s.ActiveProject},
		projectwall.Target{ProjectID: t.ProjectID, ClaimedIdentity: t.ClaimedIdentity},
	)
	if d.Verdict == projectwall.VerdictDeny && d.BlockReason != nil {
		return &blockOut{
			Code:        string(d.BlockReason.Code),
			Severity:    d.BlockReason.Severity,
			Explanation: d.BlockReason.Explanation,
			HowToFix:    d.BlockReason.HowToFix,
		}
	}
	return nil
}

// fromBlockReason adapts a runtime/blockreason.BlockReason (the emitters' refusal) to
// the wire shape.
func fromBlockReason(b *blockreason.BlockReason) *blockOut {
	if b == nil {
		return nil
	}
	return &blockOut{
		Code:        string(b.Code),
		Severity:    string(b.Severity),
		Explanation: b.Explanation,
		HowToFix:    b.HowToFix,
	}
}

// ── stack.emit — DP05 re-emit the complete stack of a stable phase ──

type emitInput struct {
	Scope    scopeIn                     `json:"scope"`
	Target   targetIn                    `json:"target"`
	Manifest stackmanifest.StackManifest `json:"manifest" jsonschema:"the StackManifest source to (re)emit the complete stack from"`
}

// artifactSummary is the wire-friendly descriptor of one emitted artifact — its path,
// target, kind and content addresses (NO raw bytes). A routing tool surfaces the
// ADDRESSES (the regenerable bytes are recoverable by re-emit from the phase); this
// keeps the MCP output schema string-typed and the wall honest (addresses, not blobs).
type artifactSummary struct {
	Path       string `json:"path"`
	Target     string `json:"target"`
	Kind       string `json:"kind"`
	SourceHash string `json:"source_hash"`
	OutputHash string `json:"output_hash"`
}

// bundleSummary is the wire projection of a stackemit.Bundle — the triple content
// addresses + the per-artifact summaries, no []byte (which would break the SDK's
// generated output schema). The bundle is content-addressed (BundleHash): same phase
// ⇒ same summary, the reproducibility done-criterion surfaced over the wire.
type bundleSummary struct {
	PhaseVersion string            `json:"phase_version"`
	SourceHash   string            `json:"source_hash"`
	BundleHash   string            `json:"bundle_hash"`
	Artifacts    []artifactSummary `json:"artifacts"`
}

func summarizeBundle(b stackemit.Bundle) bundleSummary {
	arts := make([]artifactSummary, 0, len(b.Artifacts()))
	for _, a := range b.Artifacts() {
		arts = append(arts, artifactSummary{
			Path:       a.Path,
			Target:     a.Target,
			Kind:       a.Kind,
			SourceHash: a.SourceHash,
			OutputHash: a.OutputHash,
		})
	}
	return bundleSummary{
		PhaseVersion: b.PhaseVersion,
		SourceHash:   b.SourceHash,
		BundleHash:   b.BundleHash,
		Artifacts:    arts,
	}
}

type emitOutput struct {
	OK     bool           `json:"ok"`
	Bundle *bundleSummary `json:"bundle,omitempty"`
	Block  *blockOut      `json:"block,omitempty"`
}

func stackEmit(_ context.Context, _ *mcp.CallToolRequest, in emitInput) (*mcp.CallToolResult, emitOutput, error) {
	if br := scopeCheck(in.Scope, in.Target); br != nil {
		return nil, emitOutput{OK: false, Block: br}, nil
	}
	// The phase is the AUTHORITATIVE source (DP05): seed the minimal stable phase that
	// pins the manifest, then re-emit. A real build supplies the DAG phase; here the
	// MCP seam emits from the supplied manifest's own pinned phase (PhaseFor).
	phase, err := stackemit.PhaseFor(in.Manifest)
	if err != nil {
		// An invalid manifest cannot be pinned — surface the emitter's typed refusal.
		_, br := stackemit.EmitStack(phase, in.Manifest, nil, nil)
		return nil, emitOutput{OK: false, Block: fromBlockReason(br)}, nil
	}
	bundle, br := stackemit.EmitStack(phase, in.Manifest, nil, nil)
	if br != nil {
		return nil, emitOutput{OK: false, Block: fromBlockReason(br)}, nil
	}
	summary := summarizeBundle(bundle)
	return nil, emitOutput{OK: true, Bundle: &summary}, nil
}

// ── stack.select_profile — DP11 filter the manifest by a declared compose profile ──

type selectProfileInput struct {
	Scope       scopeIn                     `json:"scope"`
	Target      targetIn                    `json:"target"`
	Manifest    stackmanifest.StackManifest `json:"manifest" jsonschema:"the StackManifest to filter"`
	Profile     string                      `json:"profile" jsonschema:"the DECLARED compose profile (core/docs/observability/qa/git/tickets/connectors/non-prod/full)"`
	Environment string                      `json:"environment" jsonschema:"the target environment (prod/staging/dev/local/future_cloud) — non-prod×prod is the DP06 gate"`
}

type selectProfileOutput struct {
	OK       bool                         `json:"ok"`
	Manifest *stackmanifest.StackManifest `json:"manifest,omitempty"`
	Block    *blockOut                    `json:"block,omitempty"`
}

func stackSelectProfile(_ context.Context, _ *mcp.CallToolRequest, in selectProfileInput) (*mcp.CallToolResult, selectProfileOutput, error) {
	if br := scopeCheck(in.Scope, in.Target); br != nil {
		return nil, selectProfileOutput{OK: false, Block: br}, nil
	}
	filtered, br := composeemit.FilterByProfile(
		in.Manifest,
		stackmanifest.Profile(in.Profile),
		scope.Environment(in.Environment),
	)
	if br != nil {
		return nil, selectProfileOutput{OK: false, Block: fromBlockReason(br)}, nil
	}
	return nil, selectProfileOutput{OK: true, Manifest: &filtered}, nil
}

// ── stack.bootstrap — DP12 emit the one-shot bootstrap sequence ──

type bootstrapInput struct {
	Scope   scopeIn                     `json:"scope"`
	Target  targetIn                    `json:"target"`
	Bundle  stackmanifest.StackManifest `json:"bundle" jsonschema:"the emitted bundle (StackManifest) to bootstrap"`
	Host    hostStateIn                 `json:"host" jsonschema:"the observed host state (ss + docker ps AS DATA)"`
	Secrets secretsStateIn              `json:"secrets" jsonschema:"the secret env-var NAMES present at boot"`
}

type bootstrapOutput struct {
	OK           bool                `json:"ok"`
	Sequence     *bootstrap.Sequence `json:"sequence,omitempty"`
	SequenceHash string              `json:"sequence_hash,omitempty"`
	URLs         []string            `json:"urls,omitempty"`
	Block        *blockOut           `json:"block,omitempty"`
}

func stackBootstrap(_ context.Context, _ *mcp.CallToolRequest, in bootstrapInput) (*mcp.CallToolResult, bootstrapOutput, error) {
	if br := scopeCheck(in.Scope, in.Target); br != nil {
		return nil, bootstrapOutput{OK: false, Block: br}, nil
	}
	seq, br := bootstrap.EmitBootstrapSequence(in.Bundle, in.Host.toHostState(), in.Secrets.toSecretsState())
	if br != nil {
		return nil, bootstrapOutput{OK: false, Block: fromBlockReason(br)}, nil
	}
	return nil, bootstrapOutput{
		OK:           true,
		Sequence:     &seq,
		SequenceHash: seq.Hash(),
		URLs:         urlsFromSequence(seq),
	}, nil
}

// ── stack.resolve_ports — DP12 resolve the host port deterministically ──

type resolvePortsInput struct {
	Scope  scopeIn     `json:"scope"`
	Target targetIn    `json:"target"`
	Host   hostStateIn `json:"host" jsonschema:"the observed host state (ss + docker ps AS DATA)"`
}

type resolvePortsOutput struct {
	OK           bool      `json:"ok"`
	ResolvedPort int       `json:"resolved_port"`
	Block        *blockOut `json:"block,omitempty"`
}

func stackResolvePorts(_ context.Context, _ *mcp.CallToolRequest, in resolvePortsInput) (*mcp.CallToolResult, resolvePortsOutput, error) {
	if br := scopeCheck(in.Scope, in.Target); br != nil {
		return nil, resolvePortsOutput{OK: false, Block: br}, nil
	}
	port := bootstrap.ResolvePort(in.Host.toHostState())
	return nil, resolvePortsOutput{OK: true, ResolvedPort: port}, nil
}

// ── stack.print_urls — DP12 the access URLs the bootstrap one-shot prints ──

type printURLsInput struct {
	Scope   scopeIn                     `json:"scope"`
	Target  targetIn                    `json:"target"`
	Bundle  stackmanifest.StackManifest `json:"bundle" jsonschema:"the emitted bundle (StackManifest) whose URLs to print"`
	Host    hostStateIn                 `json:"host" jsonschema:"the observed host state"`
	Secrets secretsStateIn              `json:"secrets" jsonschema:"the secret env-var NAMES present at boot"`
}

type printURLsOutput struct {
	OK    bool      `json:"ok"`
	URLs  []string  `json:"urls,omitempty"`
	Block *blockOut `json:"block,omitempty"`
}

func stackPrintURLs(_ context.Context, _ *mcp.CallToolRequest, in printURLsInput) (*mcp.CallToolResult, printURLsOutput, error) {
	if br := scopeCheck(in.Scope, in.Target); br != nil {
		return nil, printURLsOutput{OK: false, Block: br}, nil
	}
	seq, br := bootstrap.EmitBootstrapSequence(in.Bundle, in.Host.toHostState(), in.Secrets.toSecretsState())
	if br != nil {
		return nil, printURLsOutput{OK: false, Block: fromBlockReason(br)}, nil
	}
	return nil, printURLsOutput{OK: true, URLs: urlsFromSequence(seq)}, nil
}

// urlsFromSequence extracts the urls-printed rung's detail as the printed URL set —
// ${VAR} references resolved at deploy time, never a hardcoded host (DP12). Pure.
func urlsFromSequence(seq bootstrap.Sequence) []string {
	for _, e := range seq.Events {
		if e.Kind == bootstrap.EventURLsPrinted && e.Detail != "" {
			return []string{e.Detail}
		}
	}
	return nil
}

// ── stack.engrave_manifest — THE FENCED TRUTH-WRITE DOOR (refused, never performed) ──

type engraveInput struct {
	Scope    scopeIn                     `json:"scope"`
	Target   targetIn                    `json:"target"`
	Manifest stackmanifest.StackManifest `json:"manifest" jsonschema:"the manifest a caller might try to write directly (refused)"`
}

type engraveOutput struct {
	OK    bool      `json:"ok"`
	Block *blockOut `json:"block"`
}

func stackEngraveManifest(_ context.Context, _ *mcp.CallToolRequest, in engraveInput) (*mcp.CallToolResult, engraveOutput, error) {
	// SCOPE first (a truth-write to the wrong project is a scope leak before a zone
	// violation — the SAME order the gateway router applies).
	if br := scopeCheck(in.Scope, in.Target); br != nil {
		return nil, engraveOutput{OK: false, Block: br}, nil
	}
	// A manifest is above-the-line truth: it NEVER moves through a direct provisioning
	// write — only via idea → mirror → /goal → ChangeSet. The server holds no GRANT to
	// write the kernel; this refusal is the edge mirror of that wall.
	return nil, engraveOutput{OK: false, Block: truthWriteBlock()}, nil
}

// truthWriteBlock renders the canonical GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET refusal
// (the SAME code the S58 gateway emits — never forked).
func truthWriteBlock() *blockOut {
	return &blockOut{
		Code:     string(gateway.CodeTruthWriteNeedsChangeset),
		Severity: "error",
		Explanation: "Refus du mur (provisioning) : un StackManifest est de la VÉRITÉ au-dessus de la ligne. " +
			"Il ne se grave QUE par un ChangeSet (idée → miroir → /goal → approbation, CLAUDE.md §2) — " +
			"jamais par une écriture directe d'un outil de provisioning. Le serveur n'a aucun GRANT sur le noyau.",
		HowToFix: []string{
			"Ouvrez une idée (idea_capture), dérivez son miroir, ouvrez un /goal.",
			"Empaquetez le delta de vérité dans un ChangeSet (changeset_open) ; appliquez-le par changeset_apply.",
			"Les outils stack.* below-the-line émettent/projettent ; ils ne sont jamais la porte de la vérité.",
		},
	}
}

// httpHandler builds the provision MCP-over-HTTP handler — the SAME server served over
// JSON-RPC/HTTP via the SDK's StreamableHTTPHandler (the HTTP honours the MCP — the
// provider-verification done-criterion; the seam the gateway/Workbench call). Pinned
// JSONResponse keeps the wire deterministic (no random SSE ids).
func httpHandler() http.Handler {
	srv := newMCPServer()
	return mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return srv }, &mcp.StreamableHTTPOptions{JSONResponse: true})
}
