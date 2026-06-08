// Package opsobservability is the AIDOS S92 per-app OPS OBSERVABILITY engine
// (app-builder EPIC 9 / E12, ROADMAP-app-builder §S92, DP17, ADR 0043).
//
// THE STEP. An emitted app, once running, needs day-to-day OPERATION: the user must
// see its LOGS, its request TRACES, its ERROR events, and an at-a-glance DASHBOARD of
// latency and error rate. The emitted app is instrumented with OpenTelemetry (JS/TS
// OTel SDK in the Hono server, ROADMAP §S92 forced decision) and its signals flow into
// a PER-APP ops panel (latency, error rate, logs). DP17 substrate: OTel → SigNoz/
// GlitchTip emitted by the `observability` profile.
//
// THE LOAD-BEARING SEPARATION (ROADMAP §S92, the property done-criterion). This is
// DISTINCT from "la télémétrie comme senseur du Kernel" (E12 / the RealityMirror,
// back/runtime/reality). The RealityMirror is the ONLY on-ramp from prod reality to the
// Kernel: it OBSERVES an incident and routes it via an Idea (Incident → Learn → Idea →
// [human] Mirror → Goal → Kernel). Ops-observability is the OPPOSITE direction: it is a
// pure RENDERING layer the USER reads to operate the app — it WRITES NOTHING to the
// Kernel/mirrors/fitness. A dashboard view is not a truth; observing latency is not a
// truth decision. The property mirror proves WroteKernel is ALWAYS false: the only
// Kernel on-ramp stays the E12 RealityMirror, never this panel.
//
// TWO done-criteria (ROADMAP §S92):
//
//   - Godog (acceptance): the emitted app emits logs/traces, and the ops dashboard
//     RENDERS them — Ingest accepts OTel-shaped signals, Dashboard aggregates them into
//     a panel (request count, error rate, latency p50/p95/p99, recent logs).
//   - property (invariant): ops-observability writes NO truth — every operation returns
//     a Report whose WroteKernel is false; the RealityMirror (E12) remains the only
//     Kernel on-ramp.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every judgment here is a PURE function: parsing
// an OTel signal (validate shape), bucketing spans into latency percentiles (a sorted
// nearest-rank computation), counting error events (a tally over the declared severity
// set), redacting a log line — none is an LLM. Same signals → same dashboard, byte for
// byte (the reproducibility mirror pins this). No LLM enters anywhere.
//
// THE WALL (CLAUDE.md §2). This is Runtime plumbing BELOW the line. Like the S91 secret
// store it is project-scoped (a signal for app A never bleeds into app B's dashboard);
// it writes only its own per-app observability projection, never kernel/mirrors/fitness.
package opsobservability

import (
	"errors"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// SignalKind is the CLOSED set of OTel signal kinds the emitted app emits. OTel defines
// three core signals; an ops panel renders all three. The set is declared (never an LLM
// guess): a signal of any other kind is refused at ingestion (fail-closed).
type SignalKind string

const (
	// KindLog is an OTel LOG RECORD: a structured log line (severity + body) the app
	// emitted while serving — what the user reads to debug a request after the fact.
	KindLog SignalKind = "log"
	// KindSpan is an OTel SPAN: one request trace with a duration (ms) and an outcome —
	// the unit the latency percentiles and the error rate are computed over.
	KindSpan SignalKind = "span"
	// KindError is an OTel-modelled ERROR EVENT (error-tracking, the GlitchTip surface of
	// DP17): an exception/failure the app recorded, surfaced as the error feed.
	KindError SignalKind = "error"
)

// Severity is the CLOSED set of log/error severities (the OTel SeverityNumber buckets,
// collapsed to the five an ops panel renders). Declared, never learned.
type Severity string

const (
	SevDebug Severity = "debug"
	SevInfo  Severity = "info"
	SevWarn  Severity = "warn"
	SevError Severity = "error"
	SevFatal Severity = "fatal"
)

// errorSeverities is the declared set of severities that count toward the ERROR feed /
// error rate when carried on a log signal. A span's error outcome is its own flag.
var errorSeverities = map[Severity]bool{SevError: true, SevFatal: true}

// Signal is one OTel-shaped observability signal the emitted app emitted. It is the
// INPUT the dashboard aggregates; it is operational material, NEVER a truth. The
// project_id scopes it to one app (isolation, like the S91 secret store).
type Signal struct {
	// ProjectID scopes the signal to one emitted app — a signal of app A never appears in
	// app B's dashboard (the per-app boundary, ROADMAP §S92 "un panneau d'ops par app").
	ProjectID string `json:"project_id"`
	// Kind is the OTel signal kind (log | span | error). A foreign kind is refused.
	Kind SignalKind `json:"kind"`
	// Route is the request route the signal belongs to (e.g. "POST /orders") — the
	// dimension the user slices latency/error rate by. Empty is allowed (unrouted signal).
	Route string `json:"route"`
	// DurationMs is the span duration in milliseconds — load-bearing for KindSpan only
	// (the latency percentile input). Ignored for log/error signals.
	DurationMs int64 `json:"duration_ms"`
	// Severity is the log/error severity (the error-feed input). Load-bearing for
	// KindLog/KindError; ignored for spans.
	Severity Severity `json:"severity"`
	// Body is the human-readable log/error message the panel renders. It MAY carry a
	// secret a careless app logged — Dashboard REDACTS it deterministically (never an LLM).
	Body string `json:"body"`
	// IsError marks a SPAN whose request failed (HTTP 5xx / handler error) — the error
	// rate numerator. Ignored for log/error signals (their Severity carries the flag).
	IsError bool `json:"is_error"`
	// AtUnixNano is the signal's event time (caller-supplied, never a wall clock here —
	// determinism: no arg-less time enters). Used only for stable recent-log ordering.
	AtUnixNano int64 `json:"at_unix_nano"`
}

var (
	// ErrEmptyProject — a signal/operation pinned no project_id (the isolation scope).
	ErrEmptyProject = errors.New("opsobservability: signal pins no project_id")
	// ErrUnknownKind — a signal carried a kind outside the closed {log,span,error} set.
	ErrUnknownKind = errors.New("opsobservability: signal kind is not one of log|span|error")
)

// Ingest VALIDATES an OTel-shaped signal (pure, fail-closed) and returns it normalised
// for aggregation. It refuses an empty project_id (no unscoped signal) and a foreign
// kind (closed set). It is the deterministic frontier the emitted app's OTel exporter
// feeds: same signal → same accept/reject. It writes NOTHING (Report.WroteKernel false
// is asserted by the caller-facing Aggregator; Ingest is the pure validator).
func Ingest(s Signal) (Signal, error) {
	if strings.TrimSpace(s.ProjectID) == "" {
		return Signal{}, ErrEmptyProject
	}
	switch s.Kind {
	case KindLog, KindSpan, KindError:
	default:
		return Signal{}, ErrUnknownKind
	}
	// Normalise an empty severity on a log/error to info (a renderable default), never a
	// guess of a higher severity. Spans carry no severity.
	if (s.Kind == KindLog || s.Kind == KindError) && strings.TrimSpace(string(s.Severity)) == "" {
		s.Severity = SevInfo
	}
	return s, nil
}

// RouteStat is the per-route slice of the dashboard: the count, error rate and latency
// percentiles for one route. Deterministic (a pure aggregation over the route's spans).
type RouteStat struct {
	Route        string `json:"route"`
	RequestCount int    `json:"request_count"`
	ErrorCount   int    `json:"error_count"`
	// ErrorRate is error_count / request_count in [0,1], rounded to 4 decimals for a
	// byte-stable render (no float drift in the reproducibility mirror).
	ErrorRate float64 `json:"error_rate"`
	// LatencyP50/P95/P99 are nearest-rank percentiles (ms) over the route's span
	// durations — the canonical ops latency view. 0 when the route has no spans.
	LatencyP50 int64 `json:"latency_p50_ms"`
	LatencyP95 int64 `json:"latency_p95_ms"`
	LatencyP99 int64 `json:"latency_p99_ms"`
}

// LogLine is one rendered log/error entry in the dashboard feed: severity + a REDACTED
// body (a secret a careless app logged never reaches the panel in the clear) + its route.
type LogLine struct {
	Kind       SignalKind `json:"kind"`
	Severity   Severity   `json:"severity"`
	Route      string     `json:"route"`
	Body       string     `json:"body"`
	AtUnixNano int64      `json:"at_unix_nano"`
}

// Dashboard is the per-app ops panel the user reads to operate the app daily — the
// thing the Workbench /ops-observability route RENDERS. It is a pure projection of the
// ingested signals; it is NOT a truth (WroteKernel on the Report is false).
type Dashboard struct {
	ProjectID string `json:"project_id"`
	// TotalRequests / TotalErrors / ErrorRate are the headline numbers (over all spans).
	TotalRequests int     `json:"total_requests"`
	TotalErrors   int     `json:"total_errors"`
	ErrorRate     float64 `json:"error_rate"`
	// LatencyP50/P95/P99 are the app-wide latency percentiles (ms) over every span.
	LatencyP50 int64 `json:"latency_p50_ms"`
	LatencyP95 int64 `json:"latency_p95_ms"`
	LatencyP99 int64 `json:"latency_p99_ms"`
	// Routes is the per-route breakdown, SORTED by route name (deterministic order).
	Routes []RouteStat `json:"routes"`
	// Logs is the rendered log/error feed (redacted bodies), SORTED by (at, route, body)
	// for a byte-stable render — same signals → same feed.
	Logs []LogLine `json:"logs"`
	// ErrorFeed is the subset of Logs that are error-tracked (error/fatal logs + error
	// signals) — the GlitchTip-style error-tracking surface of DP17.
	ErrorFeed []LogLine `json:"error_feed"`
	// Fingerprint is a content-address of the WHOLE dashboard (pure: same signals → same
	// fingerprint) — the Workbench/MCP renders it to prove the panel is deterministic.
	Fingerprint string `json:"fingerprint"`
}

// Report wraps a dashboard build with the WALL PROOF: WroteKernel is ALWAYS false. The
// field exists so the no-truth-write property (ROADMAP §S92) is explicit and testable —
// ops-observability is a read/render layer, never an on-ramp to the Kernel (that is
// E12's RealityMirror alone).
type Report struct {
	Dashboard Dashboard `json:"dashboard"`
	// WroteKernel is ALWAYS false — building a dashboard performs no kernel write.
	WroteKernel bool `json:"wrote_kernel"`
}

// BuildDashboard aggregates a project's signals into its ops panel, DETERMINISTICALLY,
// and proves it wrote no truth (Report.WroteKernel == false). It ignores any signal not
// scoped to projectID (the per-app isolation: app A's signals never enter app B's
// dashboard). It is pure: no clock, no RNG, no DB — same (projectID, signals) → same
// Report, byte for byte.
func BuildDashboard(projectID string, signals []Signal) Report {
	d := Dashboard{ProjectID: projectID}

	// 1. Partition the project's own signals into spans / log-feed entries.
	var spans []Signal
	logs := []LogLine{}
	errFeed := []LogLine{}
	byRoute := map[string][]Signal{}
	for _, s := range signals {
		if s.ProjectID != projectID {
			continue // isolation: never aggregate another app's signal.
		}
		switch s.Kind {
		case KindSpan:
			spans = append(spans, s)
			byRoute[s.Route] = append(byRoute[s.Route], s)
		case KindLog, KindError:
			ll := LogLine{
				Kind:       s.Kind,
				Severity:   s.Severity,
				Route:      s.Route,
				Body:       redactLog(s.Body),
				AtUnixNano: s.AtUnixNano,
			}
			logs = append(logs, ll)
			if s.Kind == KindError || errorSeverities[s.Severity] {
				errFeed = append(errFeed, ll)
			}
		}
	}

	// 2. Headline numbers + app-wide latency percentiles over every span.
	d.TotalRequests = len(spans)
	errCount := 0
	durations := make([]int64, 0, len(spans))
	for _, sp := range spans {
		if sp.IsError {
			errCount++
		}
		durations = append(durations, sp.DurationMs)
	}
	d.TotalErrors = errCount
	d.ErrorRate = rate(errCount, len(spans))
	d.LatencyP50 = percentile(durations, 50)
	d.LatencyP95 = percentile(durations, 95)
	d.LatencyP99 = percentile(durations, 99)

	// 3. Per-route breakdown, SORTED by route name (deterministic order).
	routeNames := make([]string, 0, len(byRoute))
	for r := range byRoute {
		routeNames = append(routeNames, r)
	}
	sort.Strings(routeNames)
	for _, r := range routeNames {
		rs := byRoute[r]
		ec := 0
		ds := make([]int64, 0, len(rs))
		for _, sp := range rs {
			if sp.IsError {
				ec++
			}
			ds = append(ds, sp.DurationMs)
		}
		d.Routes = append(d.Routes, RouteStat{
			Route:        r,
			RequestCount: len(rs),
			ErrorCount:   ec,
			ErrorRate:    rate(ec, len(rs)),
			LatencyP50:   percentile(ds, 50),
			LatencyP95:   percentile(ds, 95),
			LatencyP99:   percentile(ds, 99),
		})
	}

	// 4. Stable feed ordering: (at, route, severity, body) — same signals → same feed.
	sortLogs(logs)
	sortLogs(errFeed)
	d.Logs = logs
	d.ErrorFeed = errFeed

	// 5. Content-address the whole dashboard (pure fingerprint).
	d.Fingerprint = fingerprint(d)

	return Report{Dashboard: d, WroteKernel: false}
}

// rate is error/total in [0,1] rounded to 4 decimals (byte-stable). 0 when total==0.
func rate(errs, total int) float64 {
	if total == 0 {
		return 0
	}
	r := float64(errs) / float64(total)
	// round to 4 decimals deterministically (no float drift in the render).
	return float64(int64(r*1e4+0.5)) / 1e4
}

// percentile returns the nearest-rank p-th percentile (ms) of durations. Pure: it sorts
// a COPY (never mutates the caller's slice) and indexes by ceil(p/100 * n). 0 when empty.
// Nearest-rank is the canonical, drift-free percentile for an ops latency view.
func percentile(durations []int64, p int) int64 {
	if len(durations) == 0 {
		return 0
	}
	d := append([]int64(nil), durations...)
	sort.Slice(d, func(i, j int) bool { return d[i] < d[j] })
	// nearest-rank: rank = ceil(p/100 * n), 1-based, clamped to [1,n].
	rank := (p*len(d) + 99) / 100
	if rank < 1 {
		rank = 1
	}
	if rank > len(d) {
		rank = len(d)
	}
	return d[rank-1]
}

// sortLogs orders a feed by (at, route, severity, body) for a byte-stable render.
func sortLogs(ls []LogLine) {
	sort.SliceStable(ls, func(i, j int) bool {
		if ls[i].AtUnixNano != ls[j].AtUnixNano {
			return ls[i].AtUnixNano < ls[j].AtUnixNano
		}
		if ls[i].Route != ls[j].Route {
			return ls[i].Route < ls[j].Route
		}
		if ls[i].Severity != ls[j].Severity {
			return ls[i].Severity < ls[j].Severity
		}
		return ls[i].Body < ls[j].Body
	})
}

// logLeakRules is the CLOSED, declared set of secret-shaped patterns a careless app
// might log. The redaction is the SAME deterministic gitleaks-style gesture as the S91
// secret store (a dashboard must NEVER print a secret a careless app logged — a panel
// that prints a secret is itself a leak). Declared, never learned, never an LLM.
var logLeakRules = []*regexp.Regexp{
	regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
	regexp.MustCompile(`-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----`),
	regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9._\-]{20,}`),
	regexp.MustCompile(`postgres(?:ql)?://[^:/\s]+:[^@/\s]+@`),
	regexp.MustCompile(`(?i)(?:secret|api[_-]?key|password|passwd|token|client[_-]?secret)["'\s]*[:=]\s*["']?[A-Za-z0-9._\-+/]{8,}["']?`),
}

// redactLog deterministically masks any secret-shaped span in a log body so the ops
// panel never renders a credential in the clear (the same law as S91 ScanEmission).
// Pure: same body → same redacted body. Each matched span becomes [REDACTED].
func redactLog(body string) string {
	out := body
	for _, re := range logLeakRules {
		out = re.ReplaceAllString(out, "[REDACTED]")
	}
	return out
}

// fingerprint content-addresses a dashboard deterministically — same signals → same
// hash. It hashes the canonical render (route stats + feed) WITHOUT the fingerprint
// field itself (to avoid the self-reference). No plaintext secret enters (bodies are
// already redacted by the time the feed is built).
func fingerprint(d Dashboard) string {
	var b strings.Builder
	b.WriteString(d.ProjectID)
	b.WriteByte('\n')
	writeInt(&b, d.TotalRequests)
	writeInt(&b, d.TotalErrors)
	writeI64(&b, d.LatencyP50)
	writeI64(&b, d.LatencyP95)
	writeI64(&b, d.LatencyP99)
	for _, r := range d.Routes {
		b.WriteString(r.Route)
		b.WriteByte('|')
		writeInt(&b, r.RequestCount)
		writeInt(&b, r.ErrorCount)
		writeI64(&b, r.LatencyP50)
		writeI64(&b, r.LatencyP95)
		writeI64(&b, r.LatencyP99)
	}
	for _, l := range d.Logs {
		b.WriteString(string(l.Kind))
		b.WriteByte(':')
		b.WriteString(string(l.Severity))
		b.WriteByte(':')
		b.WriteString(l.Route)
		b.WriteByte(':')
		b.WriteString(l.Body)
		b.WriteByte('\n')
	}
	return records.Hash([]byte(b.String()))
}

func writeInt(b *strings.Builder, n int)   { b.WriteString(itoa(int64(n))); b.WriteByte(';') }
func writeI64(b *strings.Builder, n int64) { b.WriteString(itoa(n)); b.WriteByte(';') }

// itoa is a tiny deterministic int64→string (avoids importing strconv for one call site
// and keeps the fingerprint render obviously pure).
func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// UnixNano is the deterministic time helper for callers that want a stable event time
// from a fixed instant (never an arg-less clock — determinism). Tests/MCP pass fixed
// times so a signal's AtUnixNano is reproducible.
func UnixNano(t time.Time) int64 { return t.UnixNano() }
