// Package ideaintakesrv is the AIDOS Kernel idea-intake MCP server, exposed as a
// LIBRARY (S59 dispatcher reuse). It is the single capability door (ADR 0009: every
// backend op is an MCP tool) over the `ideas` schema — candidate-truths staged ABOVE
// product but BELOW the freeze, with no version-freeze and no mirror (KRD §118). It is
// the legal on-ramp toward truth: a human ("finalement je veux que…") or an incident
// (#NNNN) captures an Idea with provenance, then the lifecycle advances it
// draft → grilled → {spiking → harvested | harvested}, with a traced reject branch.
//
// It carries the `ideas`-schema lifecycle grant (INSERT/SELECT/UPDATE — never DELETE; a
// rejected idea is kept). It deliberately has NO tool that bypasses the mirror: there is
// no `idea_promote_to_kernel` here. Promotion = writing the idea's mirror = the /goal =
// the freeze, gated by the promotion-gate hook (NO_MIRROR_NO_KERNEL); the kernel write
// is the aidos CLI role, never this server (the wall, CLAUDE.md §2).
//
// Tools (one tool = one backend op):
//
//	convert_to_markdown — MK03: document (DocConverter port) → markdown → captured draft
//	idea_capture — human|incident → draft (records a candidate-truth + provenance)
//	idea_grill   — draft → grilled
//	idea_spike   — grilled → spiking (the floue branch, ratchet OFF)
//	idea_harvest — grilled|spiking → harvested
//	idea_reject  — → rejected (traced, kept; never deleted)
//	idea_status  — read one idea + its provenance + status
//	idea_list    — list candidate-truths (the triage queue), optional status filter
//
// DETERMINISM-FIRST (CLAUDE.md §6): every transition is the pure ideas.* functions; this
// server only persists an already-decided transition.
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this
// SAME server in-process: it builds the idea-intake *mcp.Server via NewServer and
// dispatches a routed below-the-line idea_* call to it over an in-memory transport.
// Extracting the handlers + the store here (rather than the old package-main) lets BOTH
// the standalone stdio binary (back/mcp/idea-intake) and the dispatcher construct
// identical behaviour — no duplicated logic, no twin (reuse, don't reinvent — CLAUDE.md
// §0).
package ideaintakesrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/markitdown"
)

// ── Tool I/O types ──

type captureInput struct {
	Proposes string `json:"proposes" jsonschema:"the layer/kind the idea would become: control|policy|operation|action|entity|product"`
	Intent   string `json:"intent" jsonschema:"the sketched behaviour in prose (not yet falsifiable)"`
	Source   string `json:"source" jsonschema:"the provenance source: human | incident"`
	Detail   string `json:"detail" jsonschema:"the human utterance verbatim, or the incident reference #NNNN"`
	// ProjectID scopes the captured idea to a project (S64). An empty value lands the
	// idea in the seed __system__ project (the table DEFAULT, S54). The id stays the
	// content hash of the SKETCH (proposes/intent/provenance) — two projects can stage
	// the same sketch as two scoped rows of the same id (the scope is metadata, not
	// identity; ON CONFLICT keeps the first per the append-only contract).
	ProjectID string `json:"project_id,omitempty" jsonschema:"the project the captured idea is scoped to (S64); empty = the __system__ seed"`
}

type ideaOutput struct {
	ID           string `json:"id"`
	Proposes     string `json:"proposes"`
	Intent       string `json:"intent"`
	Source       string `json:"source"`
	Detail       string `json:"detail"`
	Status       string `json:"status"`
	RejectReason string `json:"reject_reason,omitempty"`
	// ProjectID is the project this idea is scoped to (S64). The inbox lists ideas of
	// the active project only; capture carries the project the user is pinned to.
	ProjectID string `json:"project_id,omitempty"`
	// HasMirror is always false from this server: an idea has no mirror — that is
	// what makes it an idea. The Workbench renders the "no mirror yet" marker.
	HasMirror bool `json:"has_mirror"`
}

type idInput struct {
	ID string `json:"id" jsonschema:"the idea content-hash id"`
}

type rejectInput struct {
	ID     string `json:"id" jsonschema:"the idea content-hash id"`
	Reason string `json:"reason" jsonschema:"the traced reason the idea is rejected (kept, never deleted)"`
}

type listInput struct {
	Status string `json:"status,omitempty" jsonschema:"optional lifecycle filter: draft|grilled|spiking|harvested|rejected"`
	// ProjectID scopes the inbox to one project (S64). Empty = unscoped (every project),
	// preserved for the global triage queue; the per-project inbox passes the active id.
	ProjectID string `json:"project_id,omitempty" jsonschema:"optional project scope (S64); empty = every project"`
}
type listOutput struct {
	Ideas []ideaOutput `json:"ideas"`
}

func toOutput(i ideas.Idea) ideaOutput {
	return ideaOutput{
		ID:           i.ID,
		Proposes:     string(i.Proposes),
		Intent:       i.Intent,
		Source:       string(i.Provenance.Source),
		Detail:       i.Provenance.Detail,
		Status:       string(i.Status),
		RejectReason: i.RejectReason,
		HasMirror:    false, // an idea never carries a mirror (KRD §118).
	}
}

// server wires the MCP tools to one idea-intake Store and the MK02 DocConverter port (replaceable,
// ADR 0039) — the MK03 ingestion door uses the converter to turn a document into the markdown it
// captures as an idea. The converter is an interface: the in-process HTMLConverter is the default
// reference adapter; the real microsoft/markitdown is swapped in behind the same port by an ADR,
// never touching this server. It is unexported: callers construct the configured *mcp.Server via
// NewServer and never touch the handlers directly.
type server struct {
	store     *Store
	converter markitdown.DocConverter
}

func (s *server) capture(ctx context.Context, _ *mcp.CallToolRequest, in captureInput) (*mcp.CallToolResult, ideaOutput, error) {
	i, err := ideas.Capture(
		ideas.Proposes(in.Proposes),
		in.Intent,
		ideas.Provenance{Source: ideas.ProvenanceSource(in.Source), Detail: in.Detail},
	)
	if err != nil {
		return nil, ideaOutput{}, err
	}
	if err := s.store.InsertScoped(ctx, i, in.ProjectID); err != nil {
		return nil, ideaOutput{}, err
	}
	out := toOutput(i)
	out.ProjectID = in.ProjectID
	return nil, out, nil
}

// advance loads an idea, applies a pure lifecycle gesture, and persists the result.
func (s *server) advance(ctx context.Context, id string, gesture func(ideas.Idea) (ideas.Idea, error)) (ideaOutput, error) {
	i, err := s.store.Get(ctx, id)
	if err != nil {
		return ideaOutput{}, err
	}
	next, err := gesture(i)
	if err != nil {
		return ideaOutput{}, err
	}
	if err := s.store.Update(ctx, next); err != nil {
		return ideaOutput{}, err
	}
	return toOutput(next), nil
}

func (s *server) grill(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, ideaOutput, error) {
	out, err := s.advance(ctx, in.ID, ideas.Grill)
	return nil, out, err
}

func (s *server) spike(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, ideaOutput, error) {
	out, err := s.advance(ctx, in.ID, ideas.Spike)
	return nil, out, err
}

func (s *server) harvest(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, ideaOutput, error) {
	out, err := s.advance(ctx, in.ID, ideas.Harvest)
	return nil, out, err
}

func (s *server) reject(ctx context.Context, _ *mcp.CallToolRequest, in rejectInput) (*mcp.CallToolResult, ideaOutput, error) {
	out, err := s.advance(ctx, in.ID, func(i ideas.Idea) (ideas.Idea, error) {
		return ideas.Reject(i, in.Reason)
	})
	return nil, out, err
}

func (s *server) statusTool(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, ideaOutput, error) {
	i, err := s.store.Get(ctx, in.ID)
	if err != nil {
		return nil, ideaOutput{}, err
	}
	return nil, toOutput(i), nil
}

func (s *server) list(ctx context.Context, _ *mcp.CallToolRequest, in listInput) (*mcp.CallToolResult, listOutput, error) {
	all, err := s.store.ListScoped(ctx, in.Status, in.ProjectID)
	if err != nil {
		return nil, listOutput{}, err
	}
	out := listOutput{Ideas: make([]ideaOutput, len(all))}
	for i, sc := range all {
		o := toOutput(sc.Idea)
		o.ProjectID = sc.ProjectID
		out.Ideas[i] = o
	}
	return nil, out, nil
}

// NewServer builds the configured idea-intake *mcp.Server over a single idea-intake Store
// and the MK02 DocConverter port. It registers the seven idea-intake tools plus the MK03
// ingestion door — identical behaviour whether driven by the standalone stdio binary or
// the S59 gateway dispatcher over an in-memory transport. There is deliberately NO
// promote-to-kernel tool: promotion is the /goal flow.
func NewServer(store *Store, converter markitdown.DocConverter) *mcp.Server {
	s := &server{store: store, converter: converter}
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-idea-intake", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "convert_to_markdown", Description: "MK03: convert a document (DocConverter port, ADR 0039) → markdown → capture it as an idea draft with provenance. Deterministic; never writes the kernel (the wall)."}, s.convertToMarkdown)
	mcp.AddTool(srv, &mcp.Tool{Name: "idea_capture", Description: "Capture a candidate-truth (human|incident) with provenance → draft. Never writes the kernel."}, s.capture)
	mcp.AddTool(srv, &mcp.Tool{Name: "idea_grill", Description: "Advance an idea draft → grilled."}, s.grill)
	mcp.AddTool(srv, &mcp.Tool{Name: "idea_spike", Description: "Advance an idea grilled → spiking (exploration, ratchet OFF)."}, s.spike)
	mcp.AddTool(srv, &mcp.Tool{Name: "idea_harvest", Description: "Advance an idea grilled|spiking → harvested."}, s.harvest)
	mcp.AddTool(srv, &mcp.Tool{Name: "idea_reject", Description: "Reject an idea (traced, kept; never deleted)."}, s.reject)
	mcp.AddTool(srv, &mcp.Tool{Name: "idea_status", Description: "Read one idea + its provenance + status."}, s.statusTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "idea_list", Description: "List candidate-truths (triage queue), optional status filter."}, s.list)
	return srv
}
