package opsobservabilitysrv

import (
	"context"
	"testing"
)

// The ops-observability MCP server is PURE computation (the wall): these tests prove each
// S92 tool returns deterministically without any I/O — ingest validates an OTel signal,
// dashboard aggregates a project's signals, fingerprint content-addresses the panel — and
// EVERY tool writes no kernel (the E12 RealityMirror is the only on-ramp).

func TestIngestTool(t *testing.T) {
	_, out, err := ingestTool(context.Background(), nil, ingestInput{ProjectID: "P", Kind: "span", DurationMs: 10})
	if err != nil || !out.OK {
		t.Fatalf("ingest span: %v %+v", err, out)
	}
	if out.WroteKernel {
		t.Fatalf("ingest must not write the kernel (the wall)")
	}
	// unknown kind is refused, never guessed.
	_, bad, _ := ingestTool(context.Background(), nil, ingestInput{ProjectID: "P", Kind: "metric"})
	if bad.OK {
		t.Fatalf("unknown kind must error")
	}
	// empty project is refused.
	_, noproj, _ := ingestTool(context.Background(), nil, ingestInput{ProjectID: "", Kind: "log"})
	if noproj.OK {
		t.Fatalf("empty project must error")
	}
}

func TestDashboardTool(t *testing.T) {
	in := dashboardInput{
		ProjectID: "P",
		Signals: []ingestInput{
			{ProjectID: "P", Kind: "span", Route: "POST /o", DurationMs: 10, AtUnixNano: 1},
			{ProjectID: "P", Kind: "span", Route: "POST /o", DurationMs: 20, IsError: true, AtUnixNano: 2},
			{ProjectID: "P", Kind: "log", Route: "POST /o", Severity: "error", Body: "boom", AtUnixNano: 3},
			{ProjectID: "Q", Kind: "span", Route: "POST /q", DurationMs: 99, AtUnixNano: 4}, // foreign — must be ignored
		},
	}
	_, out, err := dashboardTool(context.Background(), nil, in)
	if err != nil || !out.OK {
		t.Fatalf("dashboard: %v %+v", err, out)
	}
	if out.WroteKernel {
		t.Fatalf("dashboard must not write the kernel (the wall)")
	}
	if out.Dashboard.TotalRequests != 2 {
		t.Fatalf("isolation broken or count wrong: want 2, got %d", out.Dashboard.TotalRequests)
	}
	if out.Dashboard.TotalErrors != 1 || out.Dashboard.ErrorRate != 0.5 {
		t.Fatalf("error stats wrong: %d / %v", out.Dashboard.TotalErrors, out.Dashboard.ErrorRate)
	}
	if len(out.Dashboard.ErrorFeed) != 1 {
		t.Fatalf("error feed: want 1, got %d", len(out.Dashboard.ErrorFeed))
	}
	// determinism: same signals ⇒ same fingerprint.
	_, out2, _ := dashboardTool(context.Background(), nil, in)
	if out.Dashboard.Fingerprint != out2.Dashboard.Fingerprint {
		t.Fatalf("dashboard not deterministic: %s vs %s", out.Dashboard.Fingerprint, out2.Dashboard.Fingerprint)
	}
}

func TestFingerprintTool(t *testing.T) {
	in := fingerprintInput{
		ProjectID: "P",
		Signals:   []ingestInput{{ProjectID: "P", Kind: "span", Route: "GET /a", DurationMs: 7, AtUnixNano: 1}},
	}
	_, out, err := fingerprintTool(context.Background(), nil, in)
	if err != nil || !out.OK || out.Fingerprint == "" {
		t.Fatalf("fingerprint: %v %+v", err, out)
	}
	if out.WroteKernel {
		t.Fatalf("fingerprint must not write the kernel (the wall)")
	}
}

func TestServerRegisters(t *testing.T) {
	if NewServer() == nil {
		t.Fatalf("server should construct")
	}
}
