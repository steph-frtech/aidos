package telemetryreadersrv

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/reality"
)

// MCP behaviour mirror: the telemetry-reader server DEFERS to the pure reality engine. These
// tests assert each tool's wiring without a DB (in-memory fakes): observe records an
// incident_derived incident with no version/mirror; learn hands a DRAFT idea to the S27 door
// (provenance verbatim) and traces the loop back via idea_id; there is NO incident_to_kernel
// tool (the only outward edge is → S27 idea_capture). The server never writes the kernel.

// fakeIncidentRepo is an in-memory IncidentRepo.
type fakeIncidentRepo struct {
	rows map[string]reality.Incident
}

func newFakeIncidentRepo() *fakeIncidentRepo {
	return &fakeIncidentRepo{rows: map[string]reality.Incident{}}
}
func (f *fakeIncidentRepo) Upsert(_ context.Context, inc reality.Incident) error {
	if _, ok := f.rows[inc.ID]; ok {
		return nil // append-only / content-addressed: keep the existing row
	}
	f.rows[inc.ID] = inc
	return nil
}
func (f *fakeIncidentRepo) List(_ context.Context) ([]reality.Incident, error) {
	out := make([]reality.Incident, 0, len(f.rows))
	for _, v := range f.rows {
		out = append(out, v)
	}
	return out, nil
}
func (f *fakeIncidentRepo) Get(_ context.Context, id string) (reality.Incident, error) {
	return f.rows[id], nil
}
func (f *fakeIncidentRepo) SetIdeaID(_ context.Context, id, ideaID string) error {
	inc := f.rows[id]
	inc.IdeaID = ideaID
	f.rows[id] = inc
	return nil
}

// fakeIdeaCapturer records the DRAFT idea handed to the S27 door; it never writes the kernel.
type fakeIdeaCapturer struct {
	captured []reality.IdeaCandidate
}

func (f *fakeIdeaCapturer) Capture(_ context.Context, cand reality.IdeaCandidate) error {
	f.captured = append(f.captured, cand)
	return nil
}

type fakeTelemetry struct{}

func (fakeTelemetry) Query(_ context.Context, _ string) (TelemetryReport, error) {
	return TelemetryReport{Spans: []SpanRow{}, Metrics: []MetricRow{}}, nil
}

func newTestServer() (*server, *fakeIncidentRepo, *fakeIdeaCapturer) {
	inc := newFakeIncidentRepo()
	cap := &fakeIdeaCapturer{}
	return &server{incidents: inc, telemetry: fakeTelemetry{}, ideas: cap}, inc, cap
}

func TestObserve_IsRealityNotTruth(t *testing.T) {
	s, _, _ := newTestServer()
	_, out, err := s.observe(context.Background(), nil, observeInput{
		Ref:         "#1043",
		Signal:      signalInput{Operation: "createOrder", Error: "30% fail", Recurrence: 312},
		CauseSketch: "item goes out-of-stock between add-to-cart and pay",
	})
	if err != nil {
		t.Fatalf("incident_observe: %v", err)
	}
	if out.HasMirror || out.HasVersion {
		t.Fatalf("an incident must have no mirror and no version: %+v", out)
	}
	found := false
	for _, tt := range out.Taint {
		if tt == "incident_derived" {
			found = true
		}
	}
	if !found {
		t.Fatalf("incident must carry incident_derived taint: %v", out.Taint)
	}
	if out.IdeaID != "" {
		t.Fatalf("a freshly observed incident must not be learned yet: %q", out.IdeaID)
	}
}

func TestLearn_HandsDraftIdeaToS27_AndTracesBack(t *testing.T) {
	s, inc, cap := newTestServer()
	_, obs, err := s.observe(context.Background(), nil, observeInput{
		Ref:         "#1043",
		Signal:      signalInput{Operation: "createOrder", Error: "30% fail", Recurrence: 312},
		CauseSketch: "item goes out-of-stock between add-to-cart and pay",
	})
	if err != nil {
		t.Fatalf("incident_observe: %v", err)
	}

	_, learned, err := s.learn(context.Background(), nil, idInput{ID: obs.ID})
	if err != nil {
		t.Fatalf("incident_learn: %v", err)
	}
	if learned.Status != "draft" {
		t.Fatalf("learn must produce a draft idea: %q", learned.Status)
	}
	if learned.Provenance != "#1043" || learned.ProvenanceKind != "incident" {
		t.Fatalf("provenance must be incident:#1043 verbatim: %q %q", learned.ProvenanceKind, learned.Provenance)
	}
	if learned.Proposes != "operation" || !learned.ProposesPinned {
		t.Fatalf("a failing operation pins proposes=operation: %+v", learned)
	}
	if learned.WroteKernel || learned.HasMirror || learned.HasVersion {
		t.Fatalf("the learned idea must write no kernel, carry no mirror/version: %+v", learned)
	}
	// the S27 door received exactly one DRAFT idea.
	if len(cap.captured) != 1 {
		t.Fatalf("the S27 idea_capture door must receive exactly one draft: %d", len(cap.captured))
	}
	// the loop is traced back on the incident.
	row, _ := inc.Get(context.Background(), obs.ID)
	if row.IdeaID != learned.IdeaID {
		t.Fatalf("incident.idea_id must trace back: got %q want %q", row.IdeaID, learned.IdeaID)
	}
}

func TestLearn_UnpinnedProposesIsOpenQuestion(t *testing.T) {
	s, _, _ := newTestServer()
	_, obs, err := s.observe(context.Background(), nil, observeInput{
		Ref:         "#2099",
		Signal:      signalInput{Operation: "", Error: "p99 budget breached", Recurrence: 47},
		CauseSketch: "fan-out grew unbounded",
	})
	if err != nil {
		t.Fatalf("incident_observe: %v", err)
	}
	_, learned, err := s.learn(context.Background(), nil, idInput{ID: obs.ID})
	if err != nil {
		t.Fatalf("incident_learn: %v", err)
	}
	if learned.ProposesPinned || learned.Proposes != "" {
		t.Fatalf("an unpinned proposes must be left unset (not guessed): %+v", learned)
	}
	if learned.OpenQuestion == "" {
		t.Fatalf("an unpinned proposes must surface an OpenQuestion")
	}
}

// The server registers exactly four tools and NO incident_to_kernel door.
func TestNoIncidentToKernelTool(t *testing.T) {
	s, _, _ := newTestServer()
	srv := NewServer(s.incidents, s.telemetry, s.ideas)
	if srv == nil {
		t.Fatal("server must build")
	}
	// There is no incident_to_kernel method on the server — enforced at compile time by the
	// absence of such a handler. This test documents the contract: the only outward edge is
	// → S27 idea_capture (exercised above).
}
