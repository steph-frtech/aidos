// Command telemetry-reader is the AIDOS Runtime telemetry-reader MCP server
// (KRD §1521/§1524; ADR 0009) — the capability that CLOSES THE EXTERNAL LOOP by
// reading what the system does in reality: "le tool qui ferme la boucle externe : il
// rapporte ce que fait le système en vrai."
//
// It is read-only on reality (it observes; it never forges telemetry) and write-only
// into incidents.* + the S27 idea-intake door (the only outward edge). It carries NO
// `incident_to_kernel` tool — there is no such door: judging that the world disagrees
// with the kernel is a TRUTH DECISION, above the line (KRD §1099). Every transition is
// the pure reality.* engine; this server only persists an already-decided observation /
// hands a candidate to S27 (determinism-first, CLAUDE.md §6).
//
// Tools (one tool = one backend op, ADR 0009):
//
//	telemetry_query   — read OpenTelemetry spans/metrics landed in Postgres (read-only)
//	incident_observe  — a recurring failure / budget breach → an incidents.incident row
//	incident_list     — list observed incidents (the external-loop board)
//	incident_learn    — run reality.Learn → hand the candidate to S27 idea_capture (draft)
//
// THE WALL (CLAUDE.md §2): there is deliberately NO tool that writes the kernel/mirrors/
// fitness. The kernel write at the far end of the flow is the aidos CLI role via /goal,
// never this server. Transport: stdio. DSNs come from AIDOS_INCIDENTS_DSN /
// AIDOS_TELEMETRY_DSN / AIDOS_IDEAS_DSN.
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/runtime/reality"
)

// ── Tool I/O types ──

type signalInput struct {
	Operation  string `json:"operation,omitempty" jsonschema:"the failing operation/journey reference (e.g. createOrder); pins proposes=operation when present"`
	Error      string `json:"error" jsonschema:"the observed failure / breached budget, verbatim (e.g. 30% fail)"`
	Recurrence int    `json:"recurrence" jsonschema:"how many times the signal has been observed"`
}

type observeInput struct {
	Ref            string      `json:"ref" jsonschema:"the human incident reference #NNNN, carried verbatim into the idea provenance"`
	Signal         signalInput `json:"signal" jsonschema:"the observed reality (operation/error/recurrence)"`
	CauseSketch    string      `json:"cause_sketch" jsonschema:"a root-cause HYPOTHESIS in prose — NOT a falsifiable assertion, NOT a truth"`
	LinkedBranches []string    `json:"linked_branches,omitempty" jsonschema:"the DAG branches the incident relates to"`
}

type incidentOutput struct {
	ID             string   `json:"id"`
	Ref            string   `json:"ref"`
	Operation      string   `json:"operation"`
	Error          string   `json:"error"`
	Recurrence     int      `json:"recurrence"`
	CauseSketch    string   `json:"cause_sketch"`
	Taint          []string `json:"taint"`
	LinkedBranches []string `json:"linked_branches"`
	IdeaID         string   `json:"idea_id,omitempty"`
	// HasMirror / HasVersion are always false: an incident is reality, never a truth.
	HasMirror  bool `json:"has_mirror"`
	HasVersion bool `json:"has_version"`
}

type idInput struct {
	ID string `json:"id" jsonschema:"the incident content-hash id"`
}

type listInput struct{}

type listOutput struct {
	Incidents []incidentOutput `json:"incidents"`
}

type learnOutput struct {
	// The DRAFT idea handed to the S27 idea-intake (provenance incident:#NNNN). It carries
	// no version and no mirror — it must STILL acquire its mirror via /goal.
	IdeaID         string `json:"idea_id"`
	Proposes       string `json:"proposes"`
	Intent         string `json:"intent"`
	ProvenanceKind string `json:"provenance_source"`
	Provenance     string `json:"provenance_detail"`
	Status         string `json:"status"`
	ProposesPinned bool   `json:"proposes_pinned"`
	OpenQuestion   string `json:"open_question,omitempty"`
	IncidentID     string `json:"incident_id"`
	// WroteKernel is ALWAYS false — incident_learn hands a draft idea to S27, it never
	// writes the kernel.
	WroteKernel bool `json:"wrote_kernel"`
	HasMirror   bool `json:"has_mirror"`
	HasVersion  bool `json:"has_version"`
}

type queryInput struct {
	// Name filters the telemetry by span/metric name (e.g. "createOrder"). Empty = all.
	Name string `json:"name,omitempty" jsonschema:"optional span/metric name filter (e.g. createOrder)"`
}

func toIncidentOutput(inc reality.Incident) incidentOutput {
	taint := make([]string, len(inc.Taint))
	for i, t := range inc.Taint {
		taint[i] = string(t)
	}
	branches := inc.LinkedBranches
	if branches == nil {
		branches = []string{}
	}
	return incidentOutput{
		ID:             inc.ID,
		Ref:            inc.Ref,
		Operation:      inc.Signal.Operation,
		Error:          inc.Signal.Error,
		Recurrence:     inc.Signal.Recurrence,
		CauseSketch:    inc.CauseSketch,
		Taint:          taint,
		LinkedBranches: branches,
		IdeaID:         inc.IdeaID,
		HasMirror:      false, // an incident never carries a mirror — it PROPOSES one.
		HasVersion:     false, // and never a freeze — it is reality, not a truth.
	}
}

// server wires the MCP tools to the incident + telemetry + ideas stores. Every decision is
// the pure reality.* engine; the server only persists / hands off. The stores are
// interfaces so the wiring is testable without a DB (the real adapters are the pgx stores).
type server struct {
	incidents IncidentRepo
	telemetry TelemetryRepo
	ideas     IdeaCapturer
}

// IncidentRepo is the incidents.* persistence seam (observe/list/get/trace-back).
type IncidentRepo interface {
	Upsert(ctx context.Context, inc reality.Incident) error
	List(ctx context.Context) ([]reality.Incident, error)
	Get(ctx context.Context, id string) (reality.Incident, error)
	SetIdeaID(ctx context.Context, id, ideaID string) error
}

// TelemetryRepo is the read-only telemetry seam.
type TelemetryRepo interface {
	Query(ctx context.Context, name string) (TelemetryReport, error)
}

// IdeaCapturer is the S27 idea-intake door seam (the ONLY outward edge). The real server
// wires the idea-intake Store; the test wires a fake. It captures a DRAFT idea — it never
// writes the kernel.
type IdeaCapturer interface {
	Capture(ctx context.Context, draft reality.IdeaCandidate) error
}

func (s *server) observe(ctx context.Context, _ *mcp.CallToolRequest, in observeInput) (*mcp.CallToolResult, incidentOutput, error) {
	inc, err := reality.Observe(reality.ObserveInput{
		Ref: in.Ref,
		Signal: reality.Signal{
			Operation:  in.Signal.Operation,
			Error:      in.Signal.Error,
			Recurrence: in.Signal.Recurrence,
		},
		CauseSketch: in.CauseSketch,
		// incident_derived is guaranteed by reality.Observe; the caller need not supply it.
		Taint:          []firewall.Taint{firewall.TaintIncidentDerived},
		LinkedBranches: in.LinkedBranches,
	})
	if err != nil {
		return nil, incidentOutput{}, err
	}
	if err := s.incidents.Upsert(ctx, inc); err != nil {
		return nil, incidentOutput{}, err
	}
	return nil, toIncidentOutput(inc), nil
}

func (s *server) list(ctx context.Context, _ *mcp.CallToolRequest, _ listInput) (*mcp.CallToolResult, listOutput, error) {
	all, err := s.incidents.List(ctx)
	if err != nil {
		return nil, listOutput{}, err
	}
	out := listOutput{Incidents: make([]incidentOutput, len(all))}
	for i, inc := range all {
		out.Incidents[i] = toIncidentOutput(inc)
	}
	return nil, out, nil
}

func (s *server) learn(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, learnOutput, error) {
	inc, err := s.incidents.Get(ctx, in.ID)
	if err != nil {
		return nil, learnOutput{}, err
	}
	cand, err := reality.Learn(inc)
	if err != nil {
		return nil, learnOutput{}, err
	}
	// The ONLY outward edge: hand the candidate to the S27 idea-intake door (a DRAFT idea).
	if err := s.ideas.Capture(ctx, cand); err != nil {
		return nil, learnOutput{}, err
	}
	// Trace the loop back on the incident (idea_id; the only mutable column).
	learned := reality.LearnedIncident(inc, cand)
	if err := s.incidents.SetIdeaID(ctx, learned.ID, learned.IdeaID); err != nil {
		return nil, learnOutput{}, err
	}
	return nil, learnOutput{
		IdeaID:         cand.Idea.ID,
		Proposes:       string(cand.Idea.Proposes),
		Intent:         cand.Idea.Intent,
		ProvenanceKind: string(cand.Idea.Provenance.Source),
		Provenance:     cand.Idea.Provenance.Detail,
		Status:         string(cand.Idea.Status),
		ProposesPinned: cand.ProposesPinned,
		OpenQuestion:   cand.OpenQuestion,
		IncidentID:     learned.ID,
		WroteKernel:    false,
		HasMirror:      false,
		HasVersion:     false,
	}, nil
}

func (s *server) query(ctx context.Context, _ *mcp.CallToolRequest, in queryInput) (*mcp.CallToolResult, TelemetryReport, error) {
	rep, err := s.telemetry.Query(ctx, in.Name)
	if err != nil {
		return nil, TelemetryReport{}, err
	}
	return nil, rep, nil
}

// newMCPServer builds the MCP server and registers the four telemetry-reader tools. There
// is deliberately NO incident_to_kernel tool — there is no Incident → Kernel door.
func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-telemetry-reader", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "telemetry_query", Description: "Read OpenTelemetry spans/metrics landed in Postgres (read-only on reality)."}, s.query)
	mcp.AddTool(srv, &mcp.Tool{Name: "incident_observe", Description: "Observe a recurring failure / budget breach → an incidents.incident row (incident_derived taint). Never writes the kernel."}, s.observe)
	mcp.AddTool(srv, &mcp.Tool{Name: "incident_list", Description: "List observed incidents (the external-loop board)."}, s.list)
	mcp.AddTool(srv, &mcp.Tool{Name: "incident_learn", Description: "Run reality.Learn → hand the candidate to S27 idea_capture (a draft idea, provenance incident:#NNNN). Never writes the kernel."}, s.learn)
	return srv
}

func main() {
	incDSN := os.Getenv("AIDOS_INCIDENTS_DSN")
	telDSN := os.Getenv("AIDOS_TELEMETRY_DSN")
	ideasDSN := os.Getenv("AIDOS_IDEAS_DSN")
	if incDSN == "" || telDSN == "" || ideasDSN == "" {
		log.Fatal("telemetry-reader: AIDOS_INCIDENTS_DSN, AIDOS_TELEMETRY_DSN and AIDOS_IDEAS_DSN are required")
	}
	ctx := context.Background()

	inc, err := NewIncidentStore(ctx, incDSN)
	if err != nil {
		log.Fatal(fmt.Errorf("telemetry-reader: open incidents store: %w", err))
	}
	defer inc.Close()

	tel, err := NewTelemetryStore(ctx, telDSN)
	if err != nil {
		log.Fatal(fmt.Errorf("telemetry-reader: open telemetry store: %w", err))
	}
	defer tel.Close()

	ideaStore, err := NewIdeaCaptureStore(ctx, ideasDSN)
	if err != nil {
		log.Fatal(fmt.Errorf("telemetry-reader: open ideas store: %w", err))
	}
	defer ideaStore.Close()

	srv := newMCPServer(&server{incidents: inc, telemetry: tel, ideas: ideaStore})
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("telemetry-reader: run: %v", err)
	}
}
