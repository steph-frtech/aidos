// Package besoinintakesrv is the AIDOS Archive besoin-intake MCP server, exposed as a LIBRARY
// (S59/ADR 0092 dispatcher reuse). It is the SINGLE capability door over the BesoinGraph (ADR 0009:
// every backend op is an MCP tool) — the NEED store ABOVE the wall (CLAUDE.md §2), DISTINCT from the
// truth-store (kernel/mirrors/fitness), NOT an exception to the wall. A human EXPLAINS their app level
// by level (the §23 verticale + the invariant/policy bands); each resolved level leaves as an Idea via
// the ONLY legal door, idea_capture (provenance human, the utterance verbatim, status draft). There is
// NO idea_promote_to_kernel here, NO kernel/mirrors/fitness write anywhere on this path (WroteKernel is
// always false).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The BesoinGraph build, the EL07 forcing verdict (CanDescend),
// the EL05 mapping, the EL12 off-altitude rejection, the EL14 invariant classification — ALL are the
// pure besoin.* functions, the AUTHORITY. NO LLM enters this server: it persists an already-decided,
// already-hashed graph. The id of a captured row is the content-address (records.Hash) of the graph.
//
// DUAL-STORE, RLS-SCOPED. The server wires TWO seams: the besoin Store (the need graph, RLS-scoped to
// `project` via the SET LOCAL `aidos.project` GUC — S55) AND the IdeaStore (the legal EL05 emission
// door, reusing the `ideas` schema). A single DSN carries both grants (besoin + ideas reuse); both are
// co-located schemas in the one truth-store. The READ/VALIDATE tools (graph_state/level_schema/list/
// validate_level/classify/red_backlog) are dispatched below the line; the CAPTURE/EMIT tools append a
// DRAFT idea (WroteKernel always false) — read-ish per the wall (the panel keeps its propose→ChangeSet
// voie for any real truth-write, which is refused by GRANT).
//
// WHY A LIBRARY (S59/ADR 0092). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process via NewServer and dispatches a routed below-the-line besoin_* read call to it over
// an in-memory transport. Extracting the handlers here lets BOTH the standalone stdio binary
// (back/mcp/besoin-intake) and the dispatcher construct identical behaviour — no twin (reuse, don't
// reinvent — CLAUDE.md §0).
package besoinintakesrv

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
	"github.com/steph-frtech/aidos/back/runtime/besoin"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ── shared metadata input (the four per-truth metadata, EL04) ──

// metaInput is the four per-truth metadata a turn supplies (EL04). The client passes the typed values;
// the server REUSES the kernel classifiers (truthtyping/scope/authority) via besoin.Metadata — never a
// fork. truth_kind + verifiability are the canonical enums; scope is the global escape hatch by default
// here, authority is left absent unless the kind is regulatory (CertifyMetadata then routes it).
type metaInput struct {
	TruthKind     string `json:"truth_kind,omitempty" jsonschema:"the epistemic truth_kind (truthtyping §13.4)"`
	Verifiability string `json:"verifiability,omitempty" jsonschema:"the verifiability level (§13.5); 'unverifiable' routes the turn to /spike"`
	GlobalScope   bool   `json:"global_scope,omitempty" jsonschema:"true when the node's scope is the explicit global '*' (§13.7)"`
}

func (m metaInput) toMeta() besoin.Metadata {
	meta := besoin.Metadata{
		TruthKind:     truthtyping.TruthKind(m.TruthKind),
		Verifiability: truthtyping.VerifiabilityLevel(m.Verifiability),
	}
	if m.GlobalScope {
		meta.Scope = scope.TruthScope{Region: scope.RegionGlobal}
	}
	return meta
}

// ── tool I/O types ──

type stateInput struct {
	Project string `json:"project" jsonschema:"the project key scoping the BesoinGraph (RLS, EL19/S55)"`
}

type levelVerdict struct {
	Level         string   `json:"level"`
	Enough        bool     `json:"enough"`
	Missing       []string `json:"missing,omitempty"`
	OpenQuestions []string `json:"open_questions,omitempty"`
}

type stateOutput struct {
	Project        string         `json:"project"`
	GraphHash      string         `json:"graph_hash"`
	NodeRowCount   int            `json:"node_row_count"`
	EnterableLevel string         `json:"enterable_level,omitempty"`
	Done           bool           `json:"done"`
	Verdicts       []levelVerdict `json:"verdicts"`
}

type schemaInput struct {
	Level string `json:"level" jsonschema:"the grammar level whose schema to read (product|journey|view|control|action|operation|entity|invariant|policy)"`
}

type schemaOutput struct {
	Level            string   `json:"level"`
	RequiredFields   []string `json:"required_fields"`
	OutgoingRefTo    string   `json:"outgoing_ref_to,omitempty"`
	OutgoingRefField string   `json:"outgoing_ref_field,omitempty"`
	Transversal      bool     `json:"transversal"`
	AttachableTo     []string `json:"attachable_to,omitempty"`
	Mapping          string   `json:"mapping"` // emit:<proposes> | no_emit (EL05)
}

type captureInput struct {
	Project   string         `json:"project" jsonschema:"the project key scoping the BesoinGraph"`
	Body      map[string]any `json:"body" jsonschema:"the rung-shaped body fields (must satisfy besoin_level_schema)"`
	Utterance string         `json:"utterance" jsonschema:"the verbatim human utterance (provenance, never paraphrased)"`
	Meta      metaInput      `json:"meta" jsonschema:"the four per-truth metadata (EL04)"`
}

// invariantCaptureInput is the EL14 band turn: the human STATES the ∀ (selfAuthored is always false —
// the circularity ban §8 forbids the skill authoring an invariant it would satisfy).
type invariantCaptureInput struct {
	Project      string         `json:"project" jsonschema:"the project key scoping the BesoinGraph"`
	Body         map[string]any `json:"body" jsonschema:"the band body: a 'statement' (∀, never an example) + attachment fields"`
	Utterance    string         `json:"utterance" jsonschema:"the verbatim human utterance (provenance)"`
	SelfAuthored bool           `json:"self_authored,omitempty" jsonschema:"the circularity ban (§8): a self-authored invariant is refused"`
	Meta         metaInput      `json:"meta" jsonschema:"the four per-truth metadata (EL04)"`
}

// captureOutput is the result of a capture turn: the post-turn graph hash, the COMPUTED routing/verdict
// (never declared), the level's mapping (EL05), and — for a MAPPING rung — the captured Idea. A NoEmit
// rung returns Emitted=false with no Idea (no silent cast). A refusal carries the BlockReason.
type captureOutput struct {
	Project       string                   `json:"project"`
	Level         string                   `json:"level"`
	Routing       string                   `json:"routing"`
	Resolved      bool                     `json:"resolved"`
	GraphHash     string                   `json:"graph_hash,omitempty"`
	NodeID        string                   `json:"node_id,omitempty"`
	Emitted       bool                     `json:"emitted"`
	Idea          *ideaOutput              `json:"idea,omitempty"`
	CrossedLevels []string                 `json:"crossed_levels,omitempty"`
	OpenBranches  []string                 `json:"open_branches,omitempty"`
	SpikeRoute    []string                 `json:"spike_route,omitempty"`
	BlockReason   *blockreason.BlockReason `json:"block_reason,omitempty"`
}

type ideaOutput struct {
	ID       string `json:"id"`
	Proposes string `json:"proposes"`
	Intent   string `json:"intent"`
	Source   string `json:"source"`
	Detail   string `json:"detail"`
	Status   string `json:"status"`
}

type validateInput struct {
	Project string         `json:"project" jsonschema:"the project key scoping the BesoinGraph"`
	Level   string         `json:"level" jsonschema:"the level to pre-flight"`
	Body    map[string]any `json:"body,omitempty" jsonschema:"optional candidate body to validate before capture"`
	Meta    metaInput      `json:"meta" jsonschema:"the four per-truth metadata (EL04)"`
}

type validateOutput struct {
	Level         string                    `json:"level"`
	Enough        bool                      `json:"enough"`
	Missing       []string                  `json:"missing,omitempty"`
	OpenQuestions []string                  `json:"open_questions,omitempty"`
	BlockReasons  []blockreason.BlockReason `json:"block_reasons,omitempty"`
}

type classifyOutput struct {
	Level        string   `json:"level"`
	Complete     bool     `json:"complete"`
	RouteToSpike bool     `json:"route_to_spike"`
	Missing      []string `json:"missing,omitempty"`
}

type listInput struct {
	Project string `json:"project" jsonschema:"the project key scoping the BesoinGraph (RLS)"`
}
type listOutput struct {
	Project      string `json:"project"`
	NodeRowCount int    `json:"node_row_count"`
}

// emitInput is the EL16 batch-emission turn: project the whole persisted BesoinGraph into the backlog
// of draft Ideas, GOVERNED by the closed table LevelToProposes (EL05). When DryRun is true the Ideas
// are computed but NOT persisted (the read-only "what would I emit?" preview the Workbench uses).
type emitInput struct {
	Project string    `json:"project" jsonschema:"the project key scoping the BesoinGraph (RLS)"`
	DryRun  bool      `json:"dry_run,omitempty" jsonschema:"true to PREVIEW the emitted Ideas without persisting them"`
	Meta    metaInput `json:"meta" jsonschema:"the four per-truth metadata (EL04) the EL07 resolved-verdict reads — passed in, never guessed"`
}

// emitOutput is the EL16 result: the topologically-ordered backlog of draft Ideas (one per resolved
// MAPPING rung, NoEmit rungs excluded), the count, the graph_hash they were projected from, and
// whether they were persisted (DryRun=false) or previewed (DryRun=true).
type emitOutput struct {
	Project   string       `json:"project"`
	GraphHash string       `json:"graph_hash"`
	Count     int          `json:"count"`
	Persisted bool         `json:"persisted"`
	Ideas     []ideaOutput `json:"ideas"`
}

// backlogInput is the EL17 read turn: topo-sort the persisted BesoinGraph's emitted Ideas (the mapping
// rungs) into the architectural promotion order S64+ opens its /goal in. READ-ONLY — it persists
// nothing (the mirror form is ANNEXED, never written; no Idea is captured here).
type backlogInput struct {
	Project string    `json:"project" jsonschema:"the project key scoping the BesoinGraph (RLS)"`
	Meta    metaInput `json:"meta" jsonschema:"the four per-truth metadata (EL04) the EL07 resolved-verdict reads — passed in, never guessed"`
}

// backlogItemOutput is one ordered backlog entry: the projected Idea, its source rung, its expected
// mirror FORM (annexed, never written), its anchors_above (NoEmit rungs included), and its @version
// ref resolution + carried forward-dep OpenQuestions.
type backlogItemOutput struct {
	Idea           ideaOutput `json:"idea"`
	FromLevel      string     `json:"from_level"`
	MirrorForm     string     `json:"mirror_form"`
	AnchorsAbove   []string   `json:"anchors_above,omitempty"`
	ResolvedRefs   []string   `json:"resolved_refs,omitempty"`
	UnresolvedRefs []string   `json:"unresolved_refs,omitempty"`
	OpenQuestions  []string   `json:"open_questions,omitempty"`
}

// backlogOutput is the EL17 result: the topologically-ordered RedBacklog, the count, the graph_hash it
// was projected from, and — on a cycle — the BESOIN_CYCLE refusal code (the backlog is empty + refused).
type backlogOutput struct {
	Project   string              `json:"project"`
	GraphHash string              `json:"graph_hash"`
	Count     int                 `json:"count"`
	Cycle     bool                `json:"cycle"`
	CycleCode string              `json:"cycle_code,omitempty"`
	Backlog   []backlogItemOutput `json:"backlog,omitempty"`
}

// capitaliseInput is the EL18 turn: at a FULLY-RESOLVED BesoinGraph, capitalise the need — capture
// its reusable anchor + the resolution motif (procedural memory) + a candidate besoin-behaviour idea,
// strictly via firewall.ViaIdea (never ToKernel, never fitness). READ-ONLY w.r.t. truth — it persists
// no kernel/mirror/Idea (the behaviour candidate is a VALUE the client may later /goal). An optional
// reuse_against project routes a SECOND resolved need's units against this anchor (CE05 name-match on
// canonicalised keys) to show the compound-in-time.
type capitaliseInput struct {
	Project      string `json:"project" jsonschema:"the project key scoping the resolved BesoinGraph (RLS)"`
	ReuseAgainst string `json:"reuse_against,omitempty" jsonschema:"an OPTIONAL second project to route against this anchor (CE05 reuse preview); empty to skip"`
}

// anchorUnitOutput is one canonicalised reusable unit (level, canonical key, verbatim intent).
type anchorUnitOutput struct {
	Level  string `json:"level"`
	Key    string `json:"key"`
	Intent string `json:"intent"`
}

// reuseOutput is the optional CE05 reuse preview of a second need routed against this anchor.
type reuseOutput struct {
	Goal             string `json:"goal"`
	SourceGoal       string `json:"source_goal"`
	ReusedProcedural int    `json:"reused_procedural"`
	ReusedBehavior   int    `json:"reused_behavior"`
	DerivedFresh     int    `json:"derived_fresh"`
	EffortBefore     int    `json:"effort_before"`
	EffortAfter      int    `json:"effort_after"`
	SavedTokens      int    `json:"saved_tokens"`
	WroteKernel      bool   `json:"wrote_kernel"`
}

// capitaliseOutput is the EL18 result: whether the need was fully resolved (only then it capitalises),
// the reusable anchor (graph_hash + canonical units), the candidate besoin-behaviour idea (a DRAFT via
// the wall, its provenance reconstructing to the graph_hash), the always-false WroteKernel proof, and
// an optional reuse preview. NO truth is written.
type capitaliseOutput struct {
	Project       string             `json:"project"`
	FullyResolved bool               `json:"fully_resolved"`
	GraphHash     string             `json:"graph_hash"`
	AnchorUnits   []anchorUnitOutput `json:"anchor_units,omitempty"`
	BehaviorIdea  *ideaOutput        `json:"behavior_idea,omitempty"`
	MemoryProv    string             `json:"memory_provenance,omitempty"`
	WroteKernel   bool               `json:"wrote_kernel"`
	Reuse         *reuseOutput       `json:"reuse,omitempty"`
}

// ── the server ──

// server wires the MCP tools to the besoin Store (the need graph) and an IdeaStore (the legal EL05
// emission door, reusing ideas.idea). NO LLM enters: every routing/verdict is the pure besoin.*.
type server struct {
	store *Store
	ideas *IdeaStore
}

func (s *server) metaAccessor(perLevel map[besoin.Level]besoin.Metadata) func(besoin.Level) besoin.Metadata {
	return func(l besoin.Level) besoin.Metadata {
		if perLevel != nil {
			if m, ok := perLevel[l]; ok {
				return m
			}
		}
		return besoin.Metadata{}
	}
}

// graphState — READ: the current graph + the enterable level (EL07) + the per-level verdicts. Pure
// projection: it reads the persisted graph and recomputes the verdicts deterministically.
func (s *server) graphState(ctx context.Context, _ *mcp.CallToolRequest, in stateInput) (*mcp.CallToolResult, stateOutput, error) {
	g, _, err := s.store.LoadGraph(ctx, in.Project)
	if err != nil {
		return nil, stateOutput{}, err
	}
	count, err := s.store.CountNodes(ctx, in.Project)
	if err != nil {
		return nil, stateOutput{}, err
	}
	hash, err := g.Hash()
	if err != nil {
		return nil, stateOutput{}, err
	}
	metaOf := s.metaAccessor(nil)
	out := stateOutput{Project: in.Project, GraphHash: hash, NodeRowCount: count}
	if lvl, ok := besoin.EnterableLevel(g, metaOf); ok {
		out.EnterableLevel = string(lvl)
	} else {
		out.Done = true
	}
	for _, l := range besoin.Levels() {
		v := besoin.CanDescend(g, l, metaOf(l))
		out.Verdicts = append(out.Verdicts, levelVerdict{
			Level: string(l), Enough: v.Enough, Missing: v.Missing, OpenQuestions: v.OpenQuestions,
		})
	}
	return nil, out, nil
}

// levelSchema — READ: the required fields + outgoing ref + mapping of a level (a client renders the
// right form, invents no field — ROADMAP EL15). Pure: a closed grammar lookup.
func (s *server) levelSchema(ctx context.Context, _ *mcp.CallToolRequest, in schemaInput) (*mcp.CallToolResult, schemaOutput, error) {
	lvl := besoin.Level(in.Level)
	spec, ok := besoin.SpecOf(lvl)
	if !ok {
		return nil, schemaOutput{}, fmt.Errorf("besoin-intake: %q is not a grammar level", in.Level)
	}
	out := schemaOutput{
		Level:          in.Level,
		RequiredFields: spec.RequiredFields,
		Transversal:    spec.Transversal,
	}
	if to, field, has := besoin.OutgoingRef(lvl); has {
		out.OutgoingRefTo = string(to)
		out.OutgoingRefField = field
	}
	for _, a := range spec.AttachableTo {
		out.AttachableTo = append(out.AttachableTo, string(a))
	}
	m := besoin.LevelToProposes(lvl)
	if m.Kind == besoin.MappingNoEmit {
		out.Mapping = "no_emit"
	} else {
		out.Mapping = "emit:" + string(m.Proposes)
	}
	return nil, out, nil
}

// capture is the shared CAPTURE per-rung handler (parameterized by level). It loads the current graph,
// runs the PURE RecordAnswer (EL07 gate + EL12 off-altitude + EL04 /spike routing — the authority), and
// ON A RECORDED TURN persists the post-turn graph (append-only) AND, for a MAPPING rung (EL05), captures
// the Idea via the legal idea_capture door. A NoEmit rung (journey/view) appends WITHOUT an Idea (no
// silent cast). A refusal leaves the graph unchanged and returns the BlockReason (fail-closed).
func (s *server) capture(ctx context.Context, level besoin.Level, in captureInput) (captureOutput, error) {
	g, _, err := s.store.LoadGraph(ctx, in.Project)
	if err != nil {
		return captureOutput{}, err
	}
	g.Project = in.Project
	meta := in.Meta.toMeta()
	res := besoin.RecordAnswer(g, level, in.Body, in.Utterance, meta)

	out := captureOutput{
		Project:     in.Project,
		Level:       string(level),
		Routing:     string(res.Routing),
		Resolved:    res.Resolved,
		BlockReason: res.BlockReason,
		SpikeRoute:  res.SpikeRoute,
	}
	for _, b := range res.OpenBranches {
		out.OpenBranches = append(out.OpenBranches, b.Field)
	}
	if res.Routing != besoin.RouteRecord {
		return out, nil // off-altitude / spike: fail-closed, graph unchanged.
	}

	id, err := s.store.AppendGraph(ctx, res.Graph, level)
	if err != nil {
		return captureOutput{}, err
	}
	hash, err := res.Graph.Hash()
	if err != nil {
		return captureOutput{}, err
	}
	out.NodeID = id
	out.GraphHash = hash

	// EL05: a MAPPING rung emits its Idea via idea_capture; a NoEmit rung (journey/view) does not.
	if m := besoin.LevelToProposes(level); m.Kind == besoin.MappingEmit {
		idea, err := s.emitIdea(ctx, m.Proposes, in.Body, in.Utterance)
		if err != nil {
			return captureOutput{}, err
		}
		out.Emitted = true
		out.Idea = idea
	}
	return out, nil
}

// emitIdea captures an Idea via the legal idea_capture shape (provenance human, the utterance verbatim).
// The intent is the canonical body sketch; the proposes is the EL05 mapping. NEVER promotes to kernel.
func (s *server) emitIdea(ctx context.Context, proposes ideas.Proposes, body map[string]any, utterance string) (*ideaOutput, error) {
	intent := utterance
	idea, err := ideas.Capture(proposes, intent, ideas.Provenance{Source: ideas.ProvenanceSource("human"), Detail: utterance})
	if err != nil {
		return nil, err
	}
	if err := s.ideas.Insert(ctx, idea); err != nil {
		return nil, err
	}
	return &ideaOutput{
		ID: idea.ID, Proposes: string(idea.Proposes), Intent: idea.Intent,
		Source: string(idea.Provenance.Source), Detail: idea.Provenance.Detail, Status: string(idea.Status),
	}, nil
}

// per-rung capture tool handlers (each binds the shared capture to its level).
func (s *server) captureProduct(ctx context.Context, _ *mcp.CallToolRequest, in captureInput) (*mcp.CallToolResult, captureOutput, error) {
	out, err := s.capture(ctx, besoin.LevelProduct, in)
	return nil, out, err
}
func (s *server) captureJourney(ctx context.Context, _ *mcp.CallToolRequest, in captureInput) (*mcp.CallToolResult, captureOutput, error) {
	out, err := s.capture(ctx, besoin.LevelJourney, in)
	return nil, out, err
}
func (s *server) captureView(ctx context.Context, _ *mcp.CallToolRequest, in captureInput) (*mcp.CallToolResult, captureOutput, error) {
	out, err := s.capture(ctx, besoin.LevelView, in)
	return nil, out, err
}
func (s *server) captureControl(ctx context.Context, _ *mcp.CallToolRequest, in captureInput) (*mcp.CallToolResult, captureOutput, error) {
	out, err := s.capture(ctx, besoin.LevelControl, in)
	return nil, out, err
}
func (s *server) captureAction(ctx context.Context, _ *mcp.CallToolRequest, in captureInput) (*mcp.CallToolResult, captureOutput, error) {
	out, err := s.capture(ctx, besoin.LevelAction, in)
	return nil, out, err
}
func (s *server) captureOperation(ctx context.Context, _ *mcp.CallToolRequest, in captureInput) (*mcp.CallToolResult, captureOutput, error) {
	out, err := s.capture(ctx, besoin.LevelOperation, in)
	return nil, out, err
}
func (s *server) captureEntity(ctx context.Context, _ *mcp.CallToolRequest, in captureInput) (*mcp.CallToolResult, captureOutput, error) {
	out, err := s.capture(ctx, besoin.LevelEntity, in)
	return nil, out, err
}

// captureInvariant is the EL14 band turn (transversal ∀/policy). It runs the PURE RecordInvariant
// (circularity ban §8 + ∀-not-∃ parse + lateral cross-product + at-most-one policy Idea), persists the
// post-turn graph on a record, and — for a POLICY band ONLY — captures the SINGLE Idea{Proposes:policy}.
// An ∀ invariant emits NO Idea (NoEmit — its mirror is a property N1, not an idea kind).
func (s *server) captureInvariant(ctx context.Context, _ *mcp.CallToolRequest, in invariantCaptureInput) (*mcp.CallToolResult, captureOutput, error) {
	g, _, err := s.store.LoadGraph(ctx, in.Project)
	if err != nil {
		return nil, captureOutput{}, err
	}
	g.Project = in.Project
	res := besoin.RecordInvariant(g, in.Body, in.Utterance, in.SelfAuthored, in.Meta.toMeta())

	out := captureOutput{
		Project:     in.Project,
		Level:       "invariant",
		Routing:     string(res.Routing),
		Resolved:    res.Recorded,
		BlockReason: res.BlockReason,
		SpikeRoute:  res.SpikeRoute,
	}
	for _, l := range res.CrossedLevels {
		out.CrossedLevels = append(out.CrossedLevels, string(l))
	}
	if res.Routing != besoin.RouteRecord {
		return nil, out, nil // refused / spike: fail-closed.
	}
	id, err := s.store.AppendGraph(ctx, res.Graph, besoin.LevelInvariant)
	if err != nil {
		return nil, captureOutput{}, err
	}
	hash, err := res.Graph.Hash()
	if err != nil {
		return nil, captureOutput{}, err
	}
	out.NodeID = id
	out.GraphHash = hash

	// EL14: a POLICY band emits AT MOST ONE Idea{Proposes:policy}; an ∀ invariant emits NONE (NoEmit).
	if res.PolicyIdea != nil {
		if err := s.ideas.Insert(ctx, *res.PolicyIdea); err != nil {
			return nil, captureOutput{}, err
		}
		out.Emitted = true
		out.Idea = &ideaOutput{
			ID: res.PolicyIdea.ID, Proposes: string(res.PolicyIdea.Proposes), Intent: res.PolicyIdea.Intent,
			Source: string(res.PolicyIdea.Provenance.Source), Detail: res.PolicyIdea.Provenance.Detail,
			Status: string(res.PolicyIdea.Status),
		}
	}
	return nil, out, nil
}

// validateLevel — VALIDATE: the pure pre-flight EL07 verdict (no write). If a candidate body is given,
// it is recorded in a SCRATCH (in-memory) graph and the verdict is computed over it; nothing persists.
func (s *server) validateLevel(ctx context.Context, _ *mcp.CallToolRequest, in validateInput) (*mcp.CallToolResult, validateOutput, error) {
	lvl := besoin.Level(in.Level)
	if !besoin.IsLevel(lvl) {
		return nil, validateOutput{}, fmt.Errorf("besoin-intake: %q is not a grammar level", in.Level)
	}
	g, _, err := s.store.LoadGraph(ctx, in.Project)
	if err != nil {
		return nil, validateOutput{}, err
	}
	g.Project = in.Project
	meta := in.Meta.toMeta()
	if in.Body != nil {
		// scratch record (in-memory only) so the pre-flight reflects the candidate body. The
		// utterance is empty: a pre-flight never persists, so provenance is not yet pinned.
		res := besoin.RecordAnswer(g, lvl, in.Body, "", meta)
		g = res.Graph
	}
	v := besoin.CanDescend(g, lvl, meta)
	return nil, validateOutput{
		Level: in.Level, Enough: v.Enough, Missing: v.Missing,
		OpenQuestions: v.OpenQuestions, BlockReasons: v.BlockReasons,
	}, nil
}

// classify — VALIDATE: the four-metadata classification (EL04, wraps classify-truth). Reads the level's
// node (or a probe) and reports completeness + the /spike routing. Pure.
func (s *server) classify(ctx context.Context, _ *mcp.CallToolRequest, in validateInput) (*mcp.CallToolResult, classifyOutput, error) {
	lvl := besoin.Level(in.Level)
	if !besoin.IsLevel(lvl) {
		return nil, classifyOutput{}, fmt.Errorf("besoin-intake: %q is not a grammar level", in.Level)
	}
	g, _, err := s.store.LoadGraph(ctx, in.Project)
	if err != nil {
		return nil, classifyOutput{}, err
	}
	node, ok := g.Node(lvl)
	if !ok {
		node = besoin.LevelNode{Level: lvl, Status: besoin.NodeDrafting}
	}
	mv := besoin.CertifyMetadata(node, in.Meta.toMeta())
	out := classifyOutput{Level: in.Level, Complete: mv.Complete, RouteToSpike: mv.RouteToSpike}
	for _, gap := range mv.Gaps {
		out.Missing = append(out.Missing, string(gap.Code))
	}
	return nil, out, nil
}

// emitIdeas — EL16: project the whole persisted BesoinGraph into the backlog of draft Ideas, GOVERNED
// by the closed table LevelToProposes (EL05). The PURE besoin.EmitIdeas is the AUTHORITY (no LLM): for
// each resolved MAPPING rung it yields exactly one draft Idea (provenance human, content-addressed),
// NoEmit rungs yield none. On DryRun it previews; otherwise it persists each via the legal idea_capture
// door (ON CONFLICT DO NOTHING — idempotent, never a duplicate). It writes NO kernel and NO mirror (the
// wall); promotion is the app-builder writing the mirror via /goal (hand-off S64).
func (s *server) emitIdeas(ctx context.Context, _ *mcp.CallToolRequest, in emitInput) (*mcp.CallToolResult, emitOutput, error) {
	g, _, err := s.store.LoadGraph(ctx, in.Project)
	if err != nil {
		return nil, emitOutput{}, err
	}
	g.Project = in.Project
	hash, err := g.Hash()
	if err != nil {
		return nil, emitOutput{}, err
	}
	// EL16 authority: emit one draft Idea per RESOLVED MAPPING rung (governed by LevelToProposes,
	// EL05). A rung is resolvable two honest ways: its stored node Status is resolved, OR the COMPUTED
	// EL07 verdict CanDescend(graph, level, meta).Enough is true (the pure besoin functions judge, no
	// LLM). The union is taken so a graph persisted with drafting nodes still emits its EL07-right-sized
	// rungs, AND a graph carrying explicit resolved nodes emits them. NoEmit rungs emit nothing.
	meta := in.Meta.toMeta()
	metaOf := func(besoin.Level) besoin.Metadata { return meta } // the metadata passed in, never guessed.
	emitted, err := besoin.EmitIdeasUnion(g, metaOf)
	if err != nil {
		return nil, emitOutput{}, err
	}
	out := emitOutput{Project: in.Project, GraphHash: hash, Count: len(emitted), Persisted: !in.DryRun}
	for _, idea := range emitted {
		if !in.DryRun {
			if err := s.ideas.Insert(ctx, idea); err != nil { // legal idea_capture door — no kernel write.
				return nil, emitOutput{}, err
			}
		}
		out.Ideas = append(out.Ideas, ideaOutput{
			ID: idea.ID, Proposes: string(idea.Proposes), Intent: idea.Intent,
			Source: string(idea.Provenance.Source), Detail: idea.Provenance.Detail, Status: string(idea.Status),
		})
	}
	return nil, out, nil
}

// redBacklog — EL17: topo-sort the persisted BesoinGraph's emitted Ideas (the mapping rungs) along the
// constrains/seeds edges into the architectural promotion order S64+ opens its /goal in. The PURE
// besoin.RedBacklogUnion is the AUTHORITY (no LLM): a total deterministic topological sort, NoEmit rungs
// excluded from the list (they appear in anchors_above), each item carrying its expected mirror FORM
// (LevelMirrorForm, EL10) ANNEXED and its @version ref resolution. A cycle is refused with BESOIN_CYCLE
// (the backlog is empty + the code surfaced). READ-ONLY — it writes NO kernel, NO mirror, NO Idea.
func (s *server) redBacklog(ctx context.Context, _ *mcp.CallToolRequest, in backlogInput) (*mcp.CallToolResult, backlogOutput, error) {
	g, _, err := s.store.LoadGraph(ctx, in.Project)
	if err != nil {
		return nil, backlogOutput{}, err
	}
	g.Project = in.Project
	hash, err := g.Hash()
	if err != nil {
		return nil, backlogOutput{}, err
	}
	meta := in.Meta.toMeta()
	metaOf := func(besoin.Level) besoin.Metadata { return meta } // passed in, never guessed.
	items, err := besoin.RedBacklogUnion(g, metaOf)
	if err != nil {
		// A cycle is a deterministic refusal, not a server error — surface the BESOIN_CYCLE code.
		if ce, ok := besoin.AsCycleError(err); ok {
			return nil, backlogOutput{Project: in.Project, GraphHash: hash, Cycle: true, CycleCode: string(ce.Code())}, nil
		}
		return nil, backlogOutput{}, err
	}
	out := backlogOutput{Project: in.Project, GraphHash: hash, Count: len(items)}
	for _, it := range items {
		bi := backlogItemOutput{
			Idea: ideaOutput{
				ID: it.Idea.ID, Proposes: string(it.Idea.Proposes), Intent: it.Idea.Intent,
				Source: string(it.Idea.Provenance.Source), Detail: it.Idea.Provenance.Detail, Status: string(it.Idea.Status),
			},
			FromLevel:     string(it.FromLevel),
			MirrorForm:    string(it.MirrorForm),
			OpenQuestions: it.OpenQuestions,
		}
		for _, a := range it.AnchorsAbove {
			bi.AnchorsAbove = append(bi.AnchorsAbove, string(a.Level))
		}
		for _, r := range it.ResolvedRefs {
			bi.ResolvedRefs = append(bi.ResolvedRefs, r.Field+"→"+string(r.To))
		}
		for _, r := range it.UnresolvedRefs {
			bi.UnresolvedRefs = append(bi.UnresolvedRefs, r.Field+"→"+string(r.To))
		}
		out.Backlog = append(out.Backlog, bi)
	}
	return nil, out, nil
}

// capitalise — EL18: at a FULLY-RESOLVED BesoinGraph, capitalise the need via the wall. The PURE
// besoin.CapitaliseBesoin is the AUTHORITY (no LLM): it returns the reusable anchor + the resolution
// motif (procedural memory) + a candidate besoin-behaviour idea proposed STRICTLY via firewall.ViaIdea
// (never ToKernel, never fitness). WroteKernel is always false. An unresolved need capitalises NOTHING.
// The behaviour idea's provenance reconstructs to the graph_hash (carried in the memory's free text).
// READ-ONLY w.r.t. truth — it persists no kernel/mirror/Idea here.
func (s *server) capitalise(ctx context.Context, _ *mcp.CallToolRequest, in capitaliseInput) (*mcp.CallToolResult, capitaliseOutput, error) {
	g, _, err := s.store.LoadGraph(ctx, in.Project)
	if err != nil {
		return nil, capitaliseOutput{}, err
	}
	g.Project = in.Project
	resolve := besoin.BesoinResolve{Graph: g, Branch: in.Project}
	cap, err := besoin.CapitaliseBesoin(resolve)
	if err != nil {
		return nil, capitaliseOutput{}, err
	}
	out := capitaliseOutput{
		Project:       in.Project,
		FullyResolved: resolve.IsFullyResolved(),
		GraphHash:     cap.Anchor.GraphHash,
		WroteKernel:   cap.WroteKernel(), // always false — the wall.
	}
	for _, u := range cap.Anchor.Units {
		out.AnchorUnits = append(out.AnchorUnits, anchorUnitOutput{Level: string(u.Level), Key: u.Key, Intent: u.Intent})
	}
	if len(cap.BehaviorCandidates) == 1 {
		idea := cap.BehaviorCandidates[0].Idea
		out.BehaviorIdea = &ideaOutput{
			ID: idea.ID, Proposes: string(idea.Proposes), Intent: idea.Intent,
			Source: string(idea.Provenance.Source), Detail: idea.Provenance.Detail, Status: string(idea.Status),
		}
	}
	if len(cap.ProceduralWrites) == 1 {
		out.MemoryProv = cap.ProceduralWrites[0].Provenance
	}
	// Optional CE05 reuse preview: route a SECOND resolved need against this anchor (name-match on
	// canonicalised keys). It WRITES NOTHING — purely a compound-in-time preview.
	if in.ReuseAgainst != "" && out.FullyResolved {
		g2, _, err := s.store.LoadGraph(ctx, in.ReuseAgainst)
		if err != nil {
			return nil, capitaliseOutput{}, err
		}
		g2.Project = in.ReuseAgainst
		plan, err := cap.Anchor.ReuseFor(besoin.BesoinResolve{Graph: g2, Branch: in.ReuseAgainst})
		if err != nil {
			return nil, capitaliseOutput{}, err
		}
		out.Reuse = &reuseOutput{
			Goal: plan.Goal, SourceGoal: plan.SourceGoal,
			ReusedProcedural: plan.ReusedProcedural, ReusedBehavior: plan.ReusedBehavior, DerivedFresh: plan.DerivedFresh,
			EffortBefore: plan.EffortBefore, EffortAfter: plan.EffortAfter, SavedTokens: plan.SavedTokens,
			WroteKernel: plan.WroteKernel,
		}
	}
	return nil, out, nil
}

// list — READ: the project's captured node-row count (the append-only history depth), RLS-scoped.
func (s *server) list(ctx context.Context, _ *mcp.CallToolRequest, in listInput) (*mcp.CallToolResult, listOutput, error) {
	count, err := s.store.CountNodes(ctx, in.Project)
	if err != nil {
		return nil, listOutput{}, err
	}
	return nil, listOutput{Project: in.Project, NodeRowCount: count}, nil
}

// NewServer builds the besoin-intake MCP server and registers the besoin-intake tools (the 13 capture/
// read/validate tools + the EL16 besoin_emit_ideas batch emitter + the EL17 besoin_red_backlog + the
// EL18 besoin_capitalise). There is NO promote-to-kernel tool: a need leaves only as an Idea (EL05/EL16),
// promotion is the /goal flow (S64). Reused identically by the standalone stdio binary AND the gateway
// dispatcher (S59) — no twin.
func NewServer(store *Store, ideaStore *IdeaStore) *mcp.Server {
	s := &server{store: store, ideas: ideaStore}
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-besoin-intake", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_graph_state", Description: "Read the current BesoinGraph + the enterable level (EL07) + the per-level verdicts. Never writes the kernel."}, s.graphState)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_level_schema", Description: "Read a level's required fields + outgoing ref + EL05 mapping (a client renders the right form, invents no field)."}, s.levelSchema)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_list", Description: "List a project's captured node rows (the append-only history depth), RLS-scoped."}, s.list)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_capture_product", Description: "Capture the product rung (intent + scenarios); emits an Idea{Proposes:product} (EL05)."}, s.captureProduct)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_capture_journey", Description: "Capture the journey rung (Gherkin); NoEmit — appends + seeds anchors with NO Idea (EL05)."}, s.captureJourney)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_capture_view", Description: "Capture the view rung (goal/zones/data); NoEmit — appends + seeds anchors with NO Idea (EL05)."}, s.captureView)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_capture_control", Description: "Capture the control rung; emits an Idea{Proposes:control} (EL05)."}, s.captureControl)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_capture_action", Description: "Capture the action rung; emits an Idea{Proposes:action} (EL05)."}, s.captureAction)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_capture_operation", Description: "Capture the operation rung; emits an Idea{Proposes:operation} (EL05)."}, s.captureOperation)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_capture_entity", Description: "Capture the entity rung (attributes); emits an Idea{Proposes:entity} (EL05)."}, s.captureEntity)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_capture_invariant", Description: "Capture a transversal band (∀/policy, EL14); circularity ban §8; a policy band emits at most one Idea{Proposes:policy}, an ∀ emits none (NoEmit)."}, s.captureInvariant)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_validate_level", Description: "Pre-flight the pure EL07 forcing verdict for a level (no write)."}, s.validateLevel)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_classify", Description: "Classify a level's four metadata (EL04, wraps classify-truth): completeness + /spike routing."}, s.classify)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_emit_ideas", Description: "EL16: project the whole BesoinGraph into the backlog of draft Ideas (one per resolved MAPPING rung, NoEmit rungs excluded), governed by LevelToProposes (EL05). dry_run previews; otherwise persists via idea_capture (idempotent). Writes no kernel/mirror — promotion is /goal (S64)."}, s.emitIdeas)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_red_backlog", Description: "EL17: topo-sort the BesoinGraph's emitted Ideas (mapping rungs) along constrains/seeds → the architectural promotion order S64 opens its /goal in. Each item carries its expected mirror FORM (LevelMirrorForm, EL10) ANNEXED, its anchors_above (NoEmit journey/view included), and its @version ref resolution. A cycle is refused (BESOIN_CYCLE). READ-ONLY — writes no kernel/mirror/Idea."}, s.redBacklog)
	mcp.AddTool(srv, &mcp.Tool{Name: "besoin_capitalise", Description: "EL18: at a FULLY-RESOLVED BesoinGraph, capitalise the need — its reusable anchor (graph_hash + canonicalised (level,intent) keys) + the resolution motif + a candidate besoin-behaviour idea, STRICTLY via firewall.ViaIdea (never ToKernel, never fitness). WroteKernel always false; the idea's provenance reconstructs to the graph_hash. An unresolved need capitalises NOTHING. Optional reuse_against routes a second resolved need against this anchor (CE05 name-match on canonical keys). Persists no kernel/mirror/Idea."}, s.capitalise)
	return srv
}
