// Package telemetryreadersrv is the in-process library of the AIDOS Runtime
// telemetry-reader MCP server (KRD §1521/§1524; ADR 0009) — the capability that CLOSES
// THE EXTERNAL LOOP by reading what the system does in reality: "le tool qui ferme la
// boucle externe : il rapporte ce que fait le système en vrai."
//
// It is read-only on reality (it observes; it never forges telemetry) and write-only
// into incidents.* + the S27 idea-intake door (the only outward edge). It carries NO
// `incident_to_kernel` tool — there is no such door: judging that the world disagrees
// with the kernel is a TRUTH DECISION, above the line (KRD §1099). Every transition is
// the pure reality.* engine; this library only persists an already-decided observation /
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
// never this library. NewServer wires the three persistence seams (incidents/telemetry/
// ideas) and registers the four tools; the cmd binary builds the concrete pgx stores from
// its env and hands them in (the gateway dispatcher does the same in-process).
package telemetryreadersrv

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
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

// NewServer builds the MCP server and registers the four telemetry-reader tools over the
// three persistence seams (incidents/telemetry/ideas). There is deliberately NO
// incident_to_kernel tool — there is no Incident → Kernel door. The caller (the cmd binary
// or the gateway dispatcher) supplies the concrete adapters: *IncidentStore satisfies
// IncidentRepo, *TelemetryStore satisfies TelemetryRepo, *IdeaCaptureStore satisfies
// IdeaCapturer (the in-process wiring is identical to the stdio binary's).
func NewServer(incidents IncidentRepo, telemetry TelemetryRepo, ideasStore IdeaCapturer) *mcp.Server {
	s := &server{incidents: incidents, telemetry: telemetry, ideas: ideasStore}
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-telemetry-reader", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "telemetry_query", Description: "Read OpenTelemetry spans/metrics landed in Postgres (read-only on reality)."}, s.query)
	mcp.AddTool(srv, &mcp.Tool{Name: "incident_observe", Description: "Observe a recurring failure / budget breach → an incidents.incident row (incident_derived taint). Never writes the kernel."}, s.observe)
	mcp.AddTool(srv, &mcp.Tool{Name: "incident_list", Description: "List observed incidents (the external-loop board)."}, s.list)
	mcp.AddTool(srv, &mcp.Tool{Name: "incident_learn", Description: "Run reality.Learn → hand the candidate to S27 idea_capture (a draft idea, provenance incident:#NNNN). Never writes the kernel."}, s.learn)
	return srv
}

// ── Incident store (reality, BELOW the wall) ──

// IncidentStore persists observed incidents over the incidents.incident table (reality,
// BELOW the wall, CLAUDE.md §2). It carries the incidents-schema grant
// (SELECT/INSERT/UPDATE — never DELETE; an incident is kept). It NEVER touches
// kernel/mirrors. The observation DECISIONS are the pure reality.* functions; this store
// only persists an already-observed incident (determinism-first: the algorithm wins).
type IncidentStore struct {
	pool *pgxpool.Pool
}

// NewIncidentStore opens the incidents store against a DSN (the incidents-grant role).
func NewIncidentStore(ctx context.Context, dsn string) (*IncidentStore, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("telemetry-reader: open incidents: %w", err)
	}
	return &IncidentStore{pool: pool}, nil
}

// NewIncidentStoreFromPool wraps an existing pool (test harness).
func NewIncidentStoreFromPool(pool *pgxpool.Pool) *IncidentStore { return &IncidentStore{pool: pool} }

// Close releases the pool.
func (s *IncidentStore) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}

// persistedBody is the JSONB written to incidents.incident: the canonical content body. The
// id stays the content hash; idea_id is a separate column (lifecycle metadata, set by /learn).
type persistedBody struct {
	Kind           string           `json:"kind"`
	Ref            string           `json:"ref"`
	Signal         reality.Signal   `json:"signal"`
	CauseSketch    string           `json:"cause_sketch"`
	Taint          []firewall.Taint `json:"taint"`
	LinkedBranches []string         `json:"linked_branches"`
}

func toBody(inc reality.Incident) ([]byte, error) {
	branches := inc.LinkedBranches
	if branches == nil {
		branches = []string{}
	}
	return json.Marshal(persistedBody{
		Kind:           "incident",
		Ref:            inc.Ref,
		Signal:         inc.Signal,
		CauseSketch:    inc.CauseSketch,
		Taint:          inc.Taint,
		LinkedBranches: branches,
	})
}

func taintStrings(taint []firewall.Taint) []string {
	out := make([]string, len(taint))
	for i, t := range taint {
		out[i] = string(t)
	}
	return out
}

func fromRow(id string, body []byte, ideaID *string) (reality.Incident, error) {
	var pb persistedBody
	if err := json.Unmarshal(body, &pb); err != nil {
		return reality.Incident{}, fmt.Errorf("telemetry-reader: decode incident row: %w", err)
	}
	inc := reality.Incident{
		ID:             id,
		Ref:            pb.Ref,
		Signal:         pb.Signal,
		CauseSketch:    pb.CauseSketch,
		Taint:          pb.Taint,
		LinkedBranches: pb.LinkedBranches,
	}
	if ideaID != nil {
		inc.IdeaID = *ideaID
	}
	return inc, nil
}

// Upsert persists a freshly observed incident (INSERT — observe below the wall). Because an
// incident is content-addressed and append-only, re-observing the SAME body is a no-op
// (ON CONFLICT DO NOTHING) — the kept row is never rewritten or shrunk. A re-observe with a
// higher recurrence is a NEW content address (a new kept row), preserving history.
func (s *IncidentStore) Upsert(ctx context.Context, inc reality.Incident) error {
	body, err := toBody(inc)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	_, err = s.pool.Exec(ctx,
		`INSERT INTO incidents.incident
		   (id, body, taint, linked_branches, idea_id, first_seen, created_at)
		 VALUES ($1, $2::jsonb, $3, $4, NULL, $5, $5)
		 ON CONFLICT (id) DO NOTHING`,
		inc.ID, string(body), taintStrings(inc.Taint),
		emptyIfNil(inc.LinkedBranches), now)
	return err
}

func emptyIfNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// SetIdeaID sets the idea_id column once /learn has handed the incident to S27 (the loop
// traced back). It is the ONLY mutable column; the content address is unchanged.
func (s *IncidentStore) SetIdeaID(ctx context.Context, id, ideaID string) error {
	_, err := s.pool.Exec(ctx,
		"UPDATE incidents.incident SET idea_id = $2 WHERE id = $1", id, ideaID)
	return err
}

// Get reads one incident by id.
func (s *IncidentStore) Get(ctx context.Context, id string) (reality.Incident, error) {
	var body []byte
	var ideaID *string
	err := s.pool.QueryRow(ctx,
		"SELECT body, idea_id FROM incidents.incident WHERE id = $1", id).Scan(&body, &ideaID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return reality.Incident{}, fmt.Errorf("telemetry-reader: incident %q not found", id)
		}
		return reality.Incident{}, err
	}
	return fromRow(id, body, ideaID)
}

// List reads all incidents, ordered by id for a stable, deterministic listing.
func (s *IncidentStore) List(ctx context.Context) ([]reality.Incident, error) {
	rows, err := s.pool.Query(ctx,
		"SELECT id, body, idea_id FROM incidents.incident ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []reality.Incident
	for rows.Next() {
		var id string
		var body []byte
		var ideaID *string
		if err := rows.Scan(&id, &body, &ideaID); err != nil {
			return nil, err
		}
		inc, err := fromRow(id, body, ideaID)
		if err != nil {
			return nil, err
		}
		out = append(out, inc)
	}
	return out, rows.Err()
}

// ── Telemetry store (read-only on reality) ──

// TelemetryStore reads the OpenTelemetry spans/metrics landed in Postgres (read-only on
// reality, KRD §1521/§1524). The agent role is SELECT-only here: it observes, it never
// forges telemetry.
type TelemetryStore struct {
	pool *pgxpool.Pool
}

// SpanRow / MetricRow / TelemetryReport are the read shapes the external loop reflects.
// Attributes is a JSON OBJECT (map), NOT json.RawMessage: a RawMessage ([]byte) makes the
// MCP SDK reflect the OUTPUT schema as a byte-array ({type:[null,array]}), so the gateway's
// output validation REJECTS every real span/metric (whose attributes column holds an object)
// with isError → the front silently falls back to demo and never shows the real spans (the
// S59 scar, output side). A map[string]any reflects as an object schema AND pgx scans a jsonb
// column straight into it.
type SpanRow struct {
	TraceID    string         `json:"trace_id"`
	SpanID     string         `json:"span_id"`
	Name       string         `json:"name"`
	Status     string         `json:"status"`
	Attributes map[string]any `json:"attributes"`
}

type MetricRow struct {
	Name       string         `json:"name"`
	Value      float64        `json:"value"`
	Attributes map[string]any `json:"attributes"`
}

type TelemetryReport struct {
	Spans   []SpanRow   `json:"spans"`
	Metrics []MetricRow `json:"metrics"`
}

// NewTelemetryStore opens the telemetry store against a DSN (the SELECT-only role).
func NewTelemetryStore(ctx context.Context, dsn string) (*TelemetryStore, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("telemetry-reader: open telemetry: %w", err)
	}
	return &TelemetryStore{pool: pool}, nil
}

// NewTelemetryStoreFromPool wraps an existing pool (test harness).
func NewTelemetryStoreFromPool(pool *pgxpool.Pool) *TelemetryStore {
	return &TelemetryStore{pool: pool}
}

// Close releases the pool.
func (s *TelemetryStore) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}

// Query reads spans + metrics landed by the OTel collector, optionally filtered by name.
func (s *TelemetryStore) Query(ctx context.Context, name string) (TelemetryReport, error) {
	rep := TelemetryReport{Spans: []SpanRow{}, Metrics: []MetricRow{}}

	spanQ := "SELECT trace_id, span_id, name, status, attributes FROM telemetry.span"
	metricQ := "SELECT name, value, attributes FROM telemetry.metric"
	var spanArgs, metricArgs []any
	if name != "" {
		spanQ += " WHERE name = $1"
		metricQ += " WHERE name = $1"
		spanArgs = append(spanArgs, name)
		metricArgs = append(metricArgs, name)
	}
	spanQ += " ORDER BY trace_id, span_id"
	metricQ += " ORDER BY name, observed_at"

	srows, err := s.pool.Query(ctx, spanQ, spanArgs...)
	if err != nil {
		return TelemetryReport{}, err
	}
	defer srows.Close()
	for srows.Next() {
		var r SpanRow
		if err := srows.Scan(&r.TraceID, &r.SpanID, &r.Name, &r.Status, &r.Attributes); err != nil {
			return TelemetryReport{}, err
		}
		rep.Spans = append(rep.Spans, r)
	}
	if err := srows.Err(); err != nil {
		return TelemetryReport{}, err
	}

	mrows, err := s.pool.Query(ctx, metricQ, metricArgs...)
	if err != nil {
		return TelemetryReport{}, err
	}
	defer mrows.Close()
	for mrows.Next() {
		var r MetricRow
		if err := mrows.Scan(&r.Name, &r.Value, &r.Attributes); err != nil {
			return TelemetryReport{}, err
		}
		rep.Metrics = append(rep.Metrics, r)
	}
	return rep, mrows.Err()
}

// ── Idea capture store (the ONLY outward edge → S27 idea-intake) ──

// IdeaCaptureStore is the seam to the S27 idea-intake door (ideas.idea, staging ABOVE the
// wall). It carries the already-granted ideas.* capture path (INSERT). It REUSES the S27
// persisted body shape so the two servers never diverge; it does NOT re-implement the
// lifecycle. It writes a DRAFT idea — it NEVER writes the kernel.
type IdeaCaptureStore struct {
	pool *pgxpool.Pool
}

// NewIdeaCaptureStore opens the ideas store against a DSN (the ideas-lifecycle grant).
func NewIdeaCaptureStore(ctx context.Context, dsn string) (*IdeaCaptureStore, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("telemetry-reader: open ideas: %w", err)
	}
	return &IdeaCaptureStore{pool: pool}, nil
}

// NewIdeaCaptureStoreFromPool wraps an existing pool (test harness).
func NewIdeaCaptureStoreFromPool(pool *pgxpool.Pool) *IdeaCaptureStore {
	return &IdeaCaptureStore{pool: pool}
}

// Close releases the pool.
func (s *IdeaCaptureStore) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}

// ideaPersistedBody mirrors the S27 idea-intake persisted shape {proposes, intent,
// provenance, status} — never a `version` and never a `mirror` key (an idea is a candidate).
type ideaPersistedBody struct {
	Proposes   ideas.Proposes   `json:"proposes"`
	Intent     string           `json:"intent"`
	Provenance ideas.Provenance `json:"provenance"`
	Status     ideas.Status     `json:"status"`
}

// Capture persists the candidate's DRAFT idea via the S27 ideas.idea table. It is an
// INSERT (capture above the wall, the already-granted path); it never writes the kernel.
func (s *IdeaCaptureStore) Capture(ctx context.Context, cand reality.IdeaCandidate) error {
	i := cand.Idea
	body, err := json.Marshal(ideaPersistedBody{
		Proposes:   i.Proposes,
		Intent:     i.Intent,
		Provenance: i.Provenance,
		Status:     i.Status,
	})
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		"INSERT INTO ideas.idea (id, body, version) VALUES ($1, $2::jsonb, $3) ON CONFLICT (id) DO NOTHING",
		i.ID, string(body), i.ID)
	return err
}
