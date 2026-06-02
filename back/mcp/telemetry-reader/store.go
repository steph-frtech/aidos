package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/reality"
)

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
type SpanRow struct {
	TraceID    string          `json:"trace_id"`
	SpanID     string          `json:"span_id"`
	Name       string          `json:"name"`
	Status     string          `json:"status"`
	Attributes json.RawMessage `json:"attributes"`
}

type MetricRow struct {
	Name       string          `json:"name"`
	Value      float64         `json:"value"`
	Attributes json.RawMessage `json:"attributes"`
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
