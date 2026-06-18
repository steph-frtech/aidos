// Package opsobservabilitysrv is the AIDOS S92 OPS-OBSERVABILITY MCP server (app-builder
// EPIC 9 / E12, ROADMAP-app-builder §S92, DP17, ADR 0009: every backend op is an MCP
// tool), exposed as a LIBRARY (S59 dispatcher reuse). It is the capability door over the S92
// per-app ops engine (back/runtime/opsobservability): the emitted app's OpenTelemetry signals
// (logs, spans, error events) flow in; a per-app ops DASHBOARD (latency, error rate, logs,
// error feed) flows out — the surface the user reads to OPERATE the app daily.
//
// THE LOAD-BEARING SEPARATION (ROADMAP §S92). This is DISTINCT from the E12 sensor
// MCP (telemetry-reader, which routes a prod incident into an Idea on-ramp to the
// Kernel). Ops-observability WRITES NOTHING to the Kernel: every tool returns a Report
// whose WroteKernel is false. The RealityMirror (E12) is the only Kernel on-ramp.
//
// THREE tools:
//
//	ops_ingest      — VALIDATE one OTel-shaped signal (closed kind set, project scope).
//	                  The deterministic frontier the emitted app's OTel exporter feeds.
//	ops_dashboard   — AGGREGATE a project's signals into its ops panel (request count,
//	                  error rate, latency p50/p95/p99, redacted log feed, error feed).
//	ops_fingerprint — the content-address of a project's dashboard (proves the panel is
//	                  deterministic — same signals → same fingerprint).
//
// STATELESS + DETERMINISTIC (CLAUDE.md §6/§8). Each tool is a PURE function of its
// input; the server holds no DB, no clock (event times are arguments), no RNG, and
// never touches kernel/mirrors/fitness (the wall). Every tool's I/O is a JSON OBJECT (no
// json.RawMessage), so the S59 gateway dispatches them synchronously over HTTP (the
// byte-array transport scar is avoided).
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process; the standalone stdio binary (back/mcp/ops-observability) and the dispatcher
// construct identical behaviour from one source — no duplicated logic, no twin (CLAUDE.md §0).
package opsobservabilitysrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/opsobservability"
)

// ── ingest ──

type ingestInput struct {
	ProjectID  string `json:"project_id" jsonschema:"the emitted app this signal belongs to (non-empty)"`
	Kind       string `json:"kind" jsonschema:"OTel signal kind: log | span | error"`
	Route      string `json:"route" jsonschema:"the request route (e.g. POST /orders); may be empty"`
	DurationMs int64  `json:"duration_ms" jsonschema:"span duration in ms (load-bearing for kind=span)"`
	Severity   string `json:"severity" jsonschema:"log/error severity: debug|info|warn|error|fatal"`
	Body       string `json:"body" jsonschema:"the log/error message (redacted before render)"`
	IsError    bool   `json:"is_error" jsonschema:"marks a SPAN whose request failed (the error-rate numerator)"`
	AtUnixNano int64  `json:"at_unix_nano" jsonschema:"the event time in unix nanos (caller-supplied, for stable ordering)"`
}

type ingestOutput struct {
	OK          bool   `json:"ok"`
	Error       string `json:"error,omitempty"`
	Kind        string `json:"kind,omitempty"`
	Severity    string `json:"severity,omitempty"`
	WroteKernel bool   `json:"wrote_kernel"`
}

func toSignal(in ingestInput) opsobservability.Signal {
	return opsobservability.Signal{
		ProjectID:  in.ProjectID,
		Kind:       opsobservability.SignalKind(in.Kind),
		Route:      in.Route,
		DurationMs: in.DurationMs,
		Severity:   opsobservability.Severity(in.Severity),
		Body:       in.Body,
		IsError:    in.IsError,
		AtUnixNano: in.AtUnixNano,
	}
}

func ingestTool(_ context.Context, _ *mcp.CallToolRequest, in ingestInput) (*mcp.CallToolResult, ingestOutput, error) {
	s, err := opsobservability.Ingest(toSignal(in))
	if err != nil {
		return nil, ingestOutput{OK: false, Error: err.Error(), WroteKernel: false}, nil
	}
	return nil, ingestOutput{
		OK:          true,
		Kind:        string(s.Kind),
		Severity:    string(s.Severity),
		WroteKernel: false,
	}, nil
}

// ── dashboard ──

type dashboardInput struct {
	ProjectID string        `json:"project_id" jsonschema:"the emitted app whose ops panel to build (non-empty)"`
	Signals   []ingestInput `json:"signals" jsonschema:"the OTel signals the app emitted (only this project's are aggregated)"`
}

type dashboardOutput struct {
	OK          bool                       `json:"ok"`
	Error       string                     `json:"error,omitempty"`
	Dashboard   opsobservability.Dashboard `json:"dashboard"`
	WroteKernel bool                       `json:"wrote_kernel"`
}

func dashboardTool(_ context.Context, _ *mcp.CallToolRequest, in dashboardInput) (*mcp.CallToolResult, dashboardOutput, error) {
	if in.ProjectID == "" {
		return nil, dashboardOutput{OK: false, Error: "project_id is required", WroteKernel: false}, nil
	}
	signals := make([]opsobservability.Signal, 0, len(in.Signals))
	for _, s := range in.Signals {
		signals = append(signals, toSignal(s))
	}
	rep := opsobservability.BuildDashboard(in.ProjectID, signals)
	return nil, dashboardOutput{OK: true, Dashboard: rep.Dashboard, WroteKernel: rep.WroteKernel}, nil
}

// ── fingerprint ──

type fingerprintInput struct {
	ProjectID string        `json:"project_id" jsonschema:"the emitted app to fingerprint (non-empty)"`
	Signals   []ingestInput `json:"signals" jsonschema:"the OTel signals the app emitted"`
}

type fingerprintOutput struct {
	OK          bool   `json:"ok"`
	Error       string `json:"error,omitempty"`
	Fingerprint string `json:"fingerprint,omitempty"`
	WroteKernel bool   `json:"wrote_kernel"`
}

func fingerprintTool(_ context.Context, _ *mcp.CallToolRequest, in fingerprintInput) (*mcp.CallToolResult, fingerprintOutput, error) {
	if in.ProjectID == "" {
		return nil, fingerprintOutput{OK: false, Error: "project_id is required", WroteKernel: false}, nil
	}
	signals := make([]opsobservability.Signal, 0, len(in.Signals))
	for _, s := range in.Signals {
		signals = append(signals, toSignal(s))
	}
	rep := opsobservability.BuildDashboard(in.ProjectID, signals)
	return nil, fingerprintOutput{OK: true, Fingerprint: rep.Dashboard.Fingerprint, WroteKernel: rep.WroteKernel}, nil
}

// NewServer registers the three S92 ops-observability tools. Every tool is PURE and
// writes nothing (the wall) — ops-observability is a render layer, never a Kernel
// on-ramp (the E12 RealityMirror is the only on-ramp). The gateway dispatcher and the
// standalone stdio binary share this one constructor (S59 — no twin).
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-ops-observability", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "ops_ingest", Description: "S92: VALIDATE one OTel-shaped signal (log|span|error) for an emitted app — the deterministic ingestion frontier. Writes nothing (the wall)."}, ingestTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "ops_dashboard", Description: "S92: AGGREGATE an emitted app's OTel signals into its ops panel (request count, error rate, latency p50/p95/p99, redacted log feed, error feed). Deterministic; writes no truth (the E12 RealityMirror is the only Kernel on-ramp)."}, dashboardTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "ops_fingerprint", Description: "S92: the content-address of an emitted app's dashboard — proves the panel is deterministic (same signals → same fingerprint). Writes nothing."}, fingerprintTool)
	return srv
}
