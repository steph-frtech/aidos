// opsobservability_fixture_test.go — the ACCEPTANCE (Godog-class, state→signals→dashboard)
// mirror for S92 (ROADMAP-app-builder §S92). It proves the headline done-criterion:
//
//	Godog — l'app émise émet logs/traces, le dashboard d'ops les rend.
//
// Each fixture is a Given (a project's emitted signals) / When (BuildDashboard) / Then
// (the rendered panel) triple — the bootstrap materialisation of a Gherkin scenario as
// an executable Go test (CLAUDE.md §6 bootstrap exception: the mirrors Postgres schema
// persists it later; the test IS the red→green proof now). DETERMINISTIC: no clock, no
// RNG, fixed event times.
package opsobservability

import "testing"

// fixture: the emitted app emits SPANS (request traces) and the dashboard renders the
// latency + error rate. The acceptance done-criterion.
func TestFixture_AppEmitsTraces_DashboardRendersLatencyAndErrorRate(t *testing.T) {
	const app = "proj-shop"
	signals := []Signal{
		{ProjectID: app, Kind: KindSpan, Route: "POST /orders", DurationMs: 10, AtUnixNano: 1},
		{ProjectID: app, Kind: KindSpan, Route: "POST /orders", DurationMs: 20, AtUnixNano: 2},
		{ProjectID: app, Kind: KindSpan, Route: "POST /orders", DurationMs: 30, AtUnixNano: 3},
		{ProjectID: app, Kind: KindSpan, Route: "POST /orders", DurationMs: 40, IsError: true, AtUnixNano: 4},
	}
	for i, s := range signals {
		if _, err := Ingest(s); err != nil {
			t.Fatalf("signal %d should ingest: %v", i, err)
		}
	}

	rep := BuildDashboard(app, signals)
	d := rep.Dashboard

	if d.TotalRequests != 4 {
		t.Fatalf("total requests: want 4, got %d", d.TotalRequests)
	}
	if d.TotalErrors != 1 {
		t.Fatalf("total errors: want 1, got %d", d.TotalErrors)
	}
	if d.ErrorRate != 0.25 {
		t.Fatalf("error rate: want 0.25, got %v", d.ErrorRate)
	}
	// nearest-rank p50 over [10,20,30,40] is rank ceil(0.5*4)=2 → 20.
	if d.LatencyP50 != 20 {
		t.Fatalf("p50: want 20, got %d", d.LatencyP50)
	}
	// p95 rank ceil(0.95*4)=4 → 40 ; p99 rank ceil(0.99*4)=4 → 40.
	if d.LatencyP95 != 40 || d.LatencyP99 != 40 {
		t.Fatalf("p95/p99: want 40/40, got %d/%d", d.LatencyP95, d.LatencyP99)
	}
	if len(d.Routes) != 1 || d.Routes[0].Route != "POST /orders" {
		t.Fatalf("routes: want 1 [POST /orders], got %+v", d.Routes)
	}
	if rep.WroteKernel {
		t.Fatalf("THE WALL: building a dashboard must write NO kernel")
	}
}

// fixture: the emitted app emits LOG and ERROR signals; the dashboard renders the log
// feed AND a separate error feed (the GlitchTip-style error-tracking surface, DP17).
func TestFixture_AppEmitsLogs_DashboardRendersLogAndErrorFeed(t *testing.T) {
	const app = "proj-shop"
	signals := []Signal{
		{ProjectID: app, Kind: KindLog, Route: "GET /health", Severity: SevInfo, Body: "ok", AtUnixNano: 1},
		{ProjectID: app, Kind: KindLog, Route: "POST /orders", Severity: SevError, Body: "db timeout", AtUnixNano: 2},
		{ProjectID: app, Kind: KindError, Route: "POST /orders", Severity: SevFatal, Body: "panic: nil map", AtUnixNano: 3},
	}
	rep := BuildDashboard(app, signals)
	d := rep.Dashboard

	if len(d.Logs) != 3 {
		t.Fatalf("log feed: want 3 lines, got %d", len(d.Logs))
	}
	// the error feed is the error/fatal logs + the error signal → 2 entries.
	if len(d.ErrorFeed) != 2 {
		t.Fatalf("error feed: want 2 entries, got %d (%+v)", len(d.ErrorFeed), d.ErrorFeed)
	}
	if rep.WroteKernel {
		t.Fatalf("THE WALL: building a dashboard must write NO kernel")
	}
}

// fixture: a secret a careless app logged is REDACTED before it reaches the panel — the
// same law as the S91 secret store (a panel that prints a secret is itself a leak).
func TestFixture_LeakedSecretInLog_IsRedactedInDashboard(t *testing.T) {
	const app = "proj-shop"
	leak := `connecting with password="hunter2supersecretvalue"`
	signals := []Signal{
		{ProjectID: app, Kind: KindLog, Route: "boot", Severity: SevWarn, Body: leak, AtUnixNano: 1},
	}
	d := BuildDashboard(app, signals).Dashboard
	if len(d.Logs) != 1 {
		t.Fatalf("want 1 log, got %d", len(d.Logs))
	}
	body := d.Logs[0].Body
	if body == leak {
		t.Fatalf("the panel rendered a secret in the clear: %q", body)
	}
	if want := "[REDACTED]"; !contains(body, want) {
		t.Fatalf("redacted body should carry %q, got %q", want, body)
	}
	if contains(body, "hunter2supersecretvalue") {
		t.Fatalf("the secret value leaked into the rendered panel: %q", body)
	}
}

// fixture: a signal scoped to project A NEVER appears in project B's dashboard (the
// per-app boundary, ROADMAP §S92 "un panneau d'ops par app").
func TestFixture_SignalOfAppA_NeverAppearsInAppBDashboard(t *testing.T) {
	signals := []Signal{
		{ProjectID: "A", Kind: KindSpan, Route: "POST /a", DurationMs: 5, AtUnixNano: 1},
		{ProjectID: "B", Kind: KindSpan, Route: "POST /b", DurationMs: 9, AtUnixNano: 2},
	}
	a := BuildDashboard("A", signals).Dashboard
	b := BuildDashboard("B", signals).Dashboard
	if a.TotalRequests != 1 || a.Routes[0].Route != "POST /a" {
		t.Fatalf("app A leaked B's signal: %+v", a)
	}
	if b.TotalRequests != 1 || b.Routes[0].Route != "POST /b" {
		t.Fatalf("app B leaked A's signal: %+v", b)
	}
}

// fixture: a signal of an unknown kind is REFUSED at ingestion (fail-closed, closed set).
func TestFixture_UnknownSignalKind_IsRefused(t *testing.T) {
	if _, err := Ingest(Signal{ProjectID: "A", Kind: "metric"}); err != ErrUnknownKind {
		t.Fatalf("want ErrUnknownKind, got %v", err)
	}
	if _, err := Ingest(Signal{ProjectID: "", Kind: KindLog}); err != ErrEmptyProject {
		t.Fatalf("want ErrEmptyProject, got %v", err)
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
