// Command agentloop is the AIDOS Runtime agentloop MCP server (BA19; ADR 0009: every
// backend op is an MCP tool).
//
// It is the capability door over agentloop.Drive (BA15) — the runnable, deterministic loop
// SHELL that consumes a ContextPack, claims a red work item, and drives a governed coding
// session under the declared wall, recording an AgentRun ledger. The live LLM is wired in
// BA17 behind provider.Provider; HERE the action source is a DECLARED scripted scenario
// (a ScriptedGenerator), so the SHELL + the wall are proven on the real call path without a
// model (same input ⇒ same AgentRun — the reproducibility mirror pins it).
//
// Tools (one per backend op):
//
//	agentloop_drive   — drive a mono-agent run on a red work item under a governed layer;
//	                    GATED: refuses at the TRANSPORT BOUNDARY if the projected impl does
//	                    not bind the target MCP tool (capacity axis, AGENT_TOOL_NOT_BOUND)
//	                    BEFORE any action runs. Returns the recorded AgentRun (the ledger).
//	agentloop_watch   — replay a recorded run deterministically: re-drive the SAME inputs
//	                    and return the ordered action timeline + the computed result.
//	agentloop_list    — read-only list of the declared scenarios (panel/telemetry).
//
// THE WALL (CLAUDE.md §2): driving a run is BELOW the line — it records an AgentRun
// (telemetry), it NEVER writes truth. A kernel-write action a run attempts is REFUSED in
// place by agentimpl.GateAction (Autorisee:false, AGENT_WRITE_ABOVE_WATERLINE), the effect
// never lands. Any truth the run would propose goes through propose → ChangeSet → approval
// (BA20+); there is deliberately NO tool here that writes kernel/mirrors/fitness.
//
// IDENTITY (BA18): the loop PRESENTS its capability token (agentloop.PresentedToken — the
// content-hash of its confined impl); the drive handler verifies ActAsIdentity binds the
// loop to EXACTLY the requested CoucheAgent@version before driving (fail-closed,
// AGENT_IDENTITY_UNVERIFIED).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): drive/watch are pure compositions over Drive (no
// LLM, no clock, no rng above what is SUPPLIED). Timestamps are passed in (the determinism
// rule). The capacity check at the boundary is set-membership (agentimpl.ToolAllowed),
// never a judgment.
//
// READ/MOCKED VIEW (§6): the governed kernel.agent_layer SELECT view is the same
// deterministic snapshot the agentimpl MCP serves (exampleLayers), so the Workbench, the
// agentimpl server, and this server agree byte-for-byte. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentloop"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/economics"
)

// ── Tool I/O types (JSON-serialisable) ──

type driveInput struct {
	LayerRef     string `json:"layer_ref" jsonschema:"the CoucheAgent@version the run acts as (its governed identity)"`
	RedWorkItem  string `json:"red_work_item" jsonschema:"the red-set item the run claims and works"`
	ContextPack  string `json:"context_pack,omitempty" jsonschema:"the ContextPack ref the run was given (S30, firewall-gated)"`
	Scenario     string `json:"scenario" jsonschema:"the declared deterministic scenario: happy | kernel-write | over-budget"`
	GoalID       string `json:"goal_id" jsonschema:"the /goal the run serves"`
	TargetServer string `json:"target_server" jsonschema:"the MCP server the run will call (its tool must be BOUND in the impl — transport-boundary capacity check)"`
	TargetTool   string `json:"target_tool" jsonschema:"the MCP tool on target_server the run will call"`
	StartedAt    string `json:"started_at" jsonschema:"RFC3339 run start (SUPPLIED — no arg-less clock)"`
	EndedAt      string `json:"ended_at" jsonschema:"RFC3339 run end (SUPPLIED)"`
}

type driveOutput struct {
	// Refused is true when the run was refused at the transport boundary (the impl does not
	// bind target_server/target_tool, or its identity is unverified) BEFORE any action ran.
	Refused     bool                     `json:"refused"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
	// Run is the recorded AgentRun ledger (present iff not Refused). It carries NO truth.
	Run *agentrun.AgentRun `json:"run,omitempty"`
	// Meter is the run's CONSUMED RunMeter (BA27 — the live meter wired into the loop). The
	// loop's pre-call halt keeps it AT/below the effective cap (it never crosses).
	Meter *agentimpl.RunMeter `json:"meter,omitempty"`
	// Economics is the §66.3 verdict of feeding the run's measured cost to economics.Evaluate
	// against the cell's declared HarnessCostBudget (BA27 — until now no AgentRun fed the
	// harness economy). A read-only diagnostic; writes nothing.
	Economics *economics.EconomicsDecision `json:"economics,omitempty"`
}

type watchInput struct {
	// watch replays the SAME drive inputs deterministically (re-driving is pure), so the
	// timeline it returns is byte-for-byte the run's. The inputs equal a drive call.
	LayerRef     string `json:"layer_ref" jsonschema:"the CoucheAgent@version of the run to watch"`
	RedWorkItem  string `json:"red_work_item" jsonschema:"the red-set item the run worked"`
	ContextPack  string `json:"context_pack,omitempty" jsonschema:"the ContextPack ref the run was given"`
	Scenario     string `json:"scenario" jsonschema:"the scenario the run drove"`
	GoalID       string `json:"goal_id" jsonschema:"the /goal the run served"`
	TargetServer string `json:"target_server" jsonschema:"the MCP server the run called"`
	TargetTool   string `json:"target_tool" jsonschema:"the MCP tool the run called"`
	StartedAt    string `json:"started_at" jsonschema:"RFC3339 run start"`
	EndedAt      string `json:"ended_at" jsonschema:"RFC3339 run end"`
}

type timelineEntry struct {
	Index         int                      `json:"index"`
	Type          string                   `json:"type"`
	Cible         string                   `json:"cible"`
	Autorisee     bool                     `json:"autorisee"`
	RaisonBlocage *blockreason.BlockReason `json:"raison_blocage,omitempty"`
}

type watchOutput struct {
	Refused     bool                     `json:"refused"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
	Result      string                   `json:"result,omitempty"`
	Timeline    []timelineEntry          `json:"timeline,omitempty"`
}

type listOutput struct {
	Scenarios []string `json:"scenarios" jsonschema:"the declared deterministic scenarios"`
}

// server wires the read-only governed-layer view to the deterministic loop SHELL. It holds
// NO mutable state above the line — a run is re-derived on every call (idempotent), and
// nothing is persisted above the waterline (an AgentRun is below-the-line telemetry).
type server struct {
	view view
}

// gate is the SHARED transport-boundary check, run by BOTH drive and watch BEFORE Drive:
//  1. the requested governed layer must exist + project (else not-bound, fail-closed);
//  2. the loop's presented identity must bind it to EXACTLY that CoucheAgent@version
//     (BA18 ActAsIdentity, AGENT_IDENTITY_UNVERIFIED on mismatch);
//  3. the projected impl must BIND the target MCP tool (capacity axis, ToolAllowed) — the
//     "is it real?" assertion: the enforcer is ON THE CALL PATH, not a unit-test return.
//
// It returns the projected impl on success, or a BlockReason describing the refusal.
func (s *server) gate(layerRef, targetServer, targetTool, contextPack string) (agentimpl.AgentImplementation, *blockreason.BlockReason) {
	layer, ok := s.view.Layer(layerRef)
	if !ok {
		br := blockreason.For(blockreason.CodeAgentToolNotBound)
		return agentimpl.AgentImplementation{}, &br
	}
	cfg := agentimpl.ProviderCfg{
		Provider: layer.Spec.Provider,
		Model:    layer.Spec.Modele,
		Endpoint: "https://api.example.test/v1",
		APIKey:   "sk-resolved-secret",
	}
	impl, err := agentimpl.Project(layer, cfg, contextPack)
	if err != nil {
		br := blockreason.For(blockreason.CodeAgentToolNotBound)
		return agentimpl.AgentImplementation{}, &br
	}

	// BA18 — the loop's presented token must bind it to EXACTLY the requested identity.
	in := agentloop.DriveInput{Impl: impl}
	if v := agentloop.ActAsIdentity(in, agentimpl.LayerRef(layer)); !v.Verified {
		br := blockreason.For(blockreason.CodeAgentIdentityUnverified)
		return agentimpl.AgentImplementation{}, &br
	}

	// THE TRANSPORT-BOUNDARY CAPACITY CHECK (gap C2): may this impl exercise the target MCP
	// tool? Default-deny — an impl that does NOT bind (target_server, target_tool) is refused
	// HERE, before Drive ever asks the generator for an action. The enforcer is on the path.
	if td := agentimpl.ToolAllowed(impl, targetServer, targetTool); !td.Allowed {
		return agentimpl.AgentImplementation{}, td.BlockReason
	}
	return impl, nil
}

// drive is the capability: gate at the transport boundary, then drive the deterministic
// SHELL on the scenario, returning the recorded AgentRun. A refusal at the boundary returns
// Refused:true with the BlockReason and NO run (nothing executed — the wall holds).
func (s *server) drive(_ context.Context, _ *mcp.CallToolRequest, in driveInput) (*mcp.CallToolResult, driveOutput, error) {
	if !isKnownScenario(in.Scenario) {
		return nil, driveOutput{}, fmt.Errorf("agentloop: unknown scenario %q (want happy|kernel-write|over-budget)", in.Scenario)
	}
	impl, br := s.gate(in.LayerRef, in.TargetServer, in.TargetTool, in.ContextPack)
	if br != nil {
		return nil, driveOutput{Refused: true, BlockReason: br}, nil
	}
	di := buildDriveInput(impl, in.Scenario, in.GoalID, in.RedWorkItem, in.ContextPack, in.StartedAt, in.EndedAt)
	run, meter, err := agentloop.DriveWithEconomics(di)
	if err != nil {
		return nil, driveOutput{}, fmt.Errorf("agentloop: drive: %w", err)
	}
	// BA27 — feed the terminated run's measured cost to the harness economy (§66.3),
	// evaluated against the SAME declared HarnessCostBudget the loop's gate used. Read-only.
	eco := agentloop.EvaluateRun(meter, di.HarnessBudget, nil)
	return nil, driveOutput{Run: &run, Meter: &meter, Economics: &eco}, nil
}

// watch replays a recorded run deterministically (re-driving the SAME pure inputs yields the
// SAME run) and returns its ordered action timeline + computed result. Read-only.
func (s *server) watch(_ context.Context, _ *mcp.CallToolRequest, in watchInput) (*mcp.CallToolResult, watchOutput, error) {
	if !isKnownScenario(in.Scenario) {
		return nil, watchOutput{}, fmt.Errorf("agentloop: unknown scenario %q", in.Scenario)
	}
	impl, br := s.gate(in.LayerRef, in.TargetServer, in.TargetTool, in.ContextPack)
	if br != nil {
		return nil, watchOutput{Refused: true, BlockReason: br}, nil
	}
	di := buildDriveInput(impl, in.Scenario, in.GoalID, in.RedWorkItem, in.ContextPack, in.StartedAt, in.EndedAt)
	run, err := agentloop.Drive(di)
	if err != nil {
		return nil, watchOutput{}, fmt.Errorf("agentloop: watch: %w", err)
	}
	out := watchOutput{Result: string(run.Result)}
	for i, a := range run.Actions {
		out.Timeline = append(out.Timeline, timelineEntry{
			Index:         i,
			Type:          string(a.Type),
			Cible:         a.Cible,
			Autorisee:     a.Autorisee,
			RaisonBlocage: a.RaisonBlocage,
		})
	}
	return nil, out, nil
}

// list is the read-only enumeration of the declared scenarios.
func (s *server) list(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, listOutput, error) {
	return nil, listOutput{Scenarios: scenarioNames()}, nil
}

// newMCPServer builds the MCP server and registers the three agentloop tools.
func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-agentloop", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "agentloop_drive", Description: "Drive a governed mono-agent run on a red work item; GATED at the transport boundary (identity + capacity), records an AgentRun ledger, never writes truth."}, s.drive)
	mcp.AddTool(srv, &mcp.Tool{Name: "agentloop_watch", Description: "Replay a recorded run deterministically: its ordered action timeline + computed result (read-only)."}, s.watch)
	mcp.AddTool(srv, &mcp.Tool{Name: "agentloop_list", Description: "Read-only list of the declared deterministic scenarios."}, s.list)
	mcp.AddTool(srv, &mcp.Tool{Name: "agentloop_ledger", Description: "Query the fidelity-to-reality ledger (read-only): runs + boundary effect-log reconciled, per-run replay + reconciliation + refusal counts. replay-equality ∧ effect-reconciliation = auditable. Writes no truth."}, s.ledger)
	mcp.AddTool(srv, &mcp.Tool{Name: "agentloop_live_ledger", Description: "ADR 0078 (read-only): drive the requested scenarios for REAL and APPEND each really-executed AgentRun into the append-only tamper-evident Merkle ledger (GV03 reused), returning the tip Merkle root + the Verify verdict. Same runs ⇒ same root; any tamper ⇒ Verify red. The audit ledger now chains REALITY, not the ledgerRuns() fixture. Writes no truth (the wall)."}, s.liveLedger)
	mcp.AddTool(srv, &mcp.Tool{Name: "agentloop_run_to_signal", Description: "Bridge recorded runs to reality.Signals (read-only): failed/abandoned/blocked runs and abnormal green runs (thrashing/determinism-gap) map to incident_derived signals; identity is content-addressed on the PATTERN so distinct runs of the same failure mode collapse to one recurring incident id. The cause sketch is a hypothesis; the gateway declares no truth (kernel still refuses)."}, s.runToSignal)
	mcp.AddTool(srv, &mcp.Tool{Name: "agentloop_run_to_draft", Description: "BA31 on-ramp (read-only): drive a failed/abandoned/green-hollow run through reality.Observe→Learn→ToIdea to a DRAFT idea (Status=draft, provenance incident:<pattern>), proposed NEVER applied. Re-asserts the wall: the direct edge Incident→Kernel is ALWAYS refused (REALITY_CANNOT_DECLARE_TRUTH) and WroteTruth is always false. The only legal door is idea→mirror→/goal→approval."}, s.runToDraft)
	mcp.AddTool(srv, &mcp.Tool{Name: "agentloop_apply_gate", Description: "BA31 provenance-verified apply gate (read-only verdict, gap J1): re-derive the admission verdict from the S16 authority graph + the roles actually granted (authority.Decide); NEVER trust a Proposal's self-asserted Status field. A forged Status:'admitted' with no admitting authority record is refused PROPOSAL_NOT_ADMITTED, fail-closed. Writes no truth."}, s.applyGate)
	mcp.AddTool(srv, &mcp.Tool{Name: "agentloop_emitted_fitness", Description: "FN04 (ADR 0036): scan the EMITTED projection tree (back/gen/, default) for the three functional-mandate invariants — EMITTED_NO_GLOBAL_MUTABLE, EMITTED_FUNCTION_PURE, EMITTED_CALL_GRAPH_ACYCLIC — over the AIDOS-marked emitted outputs only. Deterministic AST walk, fail-closed (unparseable emitted Go → EMITTED_UNPARSEABLE), never an LLM judgement. Read-only: reports violations + actionable BlockReasons, writes no truth."}, s.emittedFitness)
	mcp.AddTool(srv, &mcp.Tool{Name: "agentloop_callgraph_index", Description: "FN05 (ADR 0036): the Understand-Anything CALL-GRAPH INDEX of one emitted Go file — the per-function nodes + their same-file callees + a content hash, fed to the agent as context and consumed by the ContextRouter (S33). Pass `changed` to ALSO get the affected sub-graph (the changed symbols + every node that transitively depends on them) so the router targets only the touched layers. Deterministic AST walk (same code → same graph → same hash), out-of-scope/unparseable source → empty index, never an LLM judgement. Read-only, writes no truth."}, s.callGraphIndex)
	return srv
}

func newServer() *server {
	return &server{view: exampleView{}}
}

// newServerWithView builds the server over an INJECTED read-only view — used by the
// transport-integration test to drive an impl that does NOT bind the target tool, proving
// the capacity enforcer sits ON THE CALL PATH (the "is it real?" assertion, gap C2).
func newServerWithView(v view) *server {
	return &server{view: v}
}

func main() {
	srv := newMCPServer(newServer())
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("agentloop: run: %v", err)
	}
}
