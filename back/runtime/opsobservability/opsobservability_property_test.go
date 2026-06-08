// opsobservability_property_test.go — the S92 INVARIANT mirror (rapid, the frozen Go
// property tool, CLAUDE.md §3). It proves the ∀ done-criteria of ROADMAP §S92:
//
//   - WRITES NO TRUTH (the headline property): over arbitrary signals, BuildDashboard's
//     Report.WroteKernel is ALWAYS false — ops-observability is a render layer, never an
//     on-ramp to the Kernel (the E12 RealityMirror is the only on-ramp).
//   - REPRODUCIBLE: same signals → byte-identical dashboard (same Fingerprint). Pure.
//   - ISOLATION: a dashboard for project P aggregates ONLY P's signals — a foreign
//     project's signal never changes P's totals.
//   - PERCENTILE SOUNDNESS: a percentile is always one of the observed durations and is
//     monotone (p50 ≤ p95 ≤ p99) — the latency view never invents a value.
//   - REDACTION SOUNDNESS: a known secret value logged by the app never survives into a
//     rendered log body.
package opsobservability

import (
	"testing"

	"pgregory.net/rapid"
)

// genSignal draws an arbitrary, valid OTel-shaped signal for a fixed project.
func genSignal(t *rapid.T, project string) Signal {
	kind := rapid.SampledFrom([]SignalKind{KindLog, KindSpan, KindError}).Draw(t, "kind")
	return Signal{
		ProjectID:  project,
		Kind:       kind,
		Route:      rapid.SampledFrom([]string{"GET /a", "POST /b", "PUT /c", ""}).Draw(t, "route"),
		DurationMs: rapid.Int64Range(0, 5000).Draw(t, "dur"),
		Severity:   rapid.SampledFrom([]Severity{SevDebug, SevInfo, SevWarn, SevError, SevFatal}).Draw(t, "sev"),
		Body:       rapid.SampledFrom([]string{"ok", "err", "warn", ""}).Draw(t, "body"),
		IsError:    rapid.Bool().Draw(t, "iserr"),
		AtUnixNano: rapid.Int64Range(0, 1_000_000).Draw(t, "at"),
	}
}

// PROPERTY: building a dashboard NEVER writes the kernel (the wall, ROADMAP §S92).
func TestProp_BuildDashboard_WritesNoTruth(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		n := rapid.IntRange(0, 30).Draw(t, "n")
		signals := make([]Signal, n)
		for i := range signals {
			signals[i] = genSignal(t, "P")
		}
		rep := BuildDashboard("P", signals)
		if rep.WroteKernel {
			t.Fatalf("THE WALL violated: ops-observability wrote the kernel")
		}
	})
}

// PROPERTY: same signals → byte-identical dashboard (deterministic / reproducible).
func TestProp_BuildDashboard_IsReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		n := rapid.IntRange(0, 30).Draw(t, "n")
		signals := make([]Signal, n)
		for i := range signals {
			signals[i] = genSignal(t, "P")
		}
		a := BuildDashboard("P", signals).Dashboard
		b := BuildDashboard("P", signals).Dashboard
		if a.Fingerprint != b.Fingerprint {
			t.Fatalf("not reproducible: %s != %s", a.Fingerprint, b.Fingerprint)
		}
	})
}

// PROPERTY: isolation — a foreign project's signals never change project P's totals.
func TestProp_BuildDashboard_IsolatesProjects(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		nP := rapid.IntRange(0, 15).Draw(t, "nP")
		nQ := rapid.IntRange(0, 15).Draw(t, "nQ")
		pSignals := make([]Signal, nP)
		for i := range pSignals {
			pSignals[i] = genSignal(t, "P")
		}
		qSignals := make([]Signal, nQ)
		for i := range qSignals {
			qSignals[i] = genSignal(t, "Q")
		}
		base := BuildDashboard("P", pSignals).Dashboard
		mixed := BuildDashboard("P", append(append([]Signal{}, pSignals...), qSignals...)).Dashboard
		if base.Fingerprint != mixed.Fingerprint {
			t.Fatalf("isolation broken: Q's signals changed P's dashboard")
		}
	})
}

// PROPERTY: a percentile is always one of the observed durations, and percentiles are
// monotone (p50 ≤ p95 ≤ p99) — the latency view never fabricates a value.
func TestProp_Percentile_IsObservedAndMonotone(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		n := rapid.IntRange(1, 40).Draw(t, "n")
		durations := make([]int64, n)
		observed := map[int64]bool{}
		for i := range durations {
			durations[i] = rapid.Int64Range(0, 10000).Draw(t, "d")
			observed[durations[i]] = true
		}
		p50 := percentile(durations, 50)
		p95 := percentile(durations, 95)
		p99 := percentile(durations, 99)
		if !observed[p50] || !observed[p95] || !observed[p99] {
			t.Fatalf("percentile invented a value: p50=%d p95=%d p99=%d", p50, p95, p99)
		}
		if !(p50 <= p95 && p95 <= p99) {
			t.Fatalf("percentiles not monotone: %d %d %d", p50, p95, p99)
		}
	})
}

// PROPERTY: redaction soundness — a known secret value logged by the app never survives
// into a rendered log body (the same law as S91).
func TestProp_LeakedSecret_NeverSurvivesRender(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		secret := "AKIA" + rapid.StringMatching(`[0-9A-Z]{16}`).Draw(t, "aws")
		body := "boot using key " + secret + " then continue"
		d := BuildDashboard("P", []Signal{
			{ProjectID: "P", Kind: KindLog, Route: "boot", Severity: SevWarn, Body: body, AtUnixNano: 1},
		}).Dashboard
		if len(d.Logs) != 1 {
			t.Fatalf("want 1 log, got %d", len(d.Logs))
		}
		if contains(d.Logs[0].Body, secret) {
			t.Fatalf("secret survived into the rendered panel: %q", d.Logs[0].Body)
		}
	})
}

// PROPERTY: error rate is always in [0,1].
func TestProp_ErrorRate_InUnitInterval(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		n := rapid.IntRange(0, 30).Draw(t, "n")
		signals := make([]Signal, n)
		for i := range signals {
			s := genSignal(t, "P")
			s.Kind = KindSpan // force spans so the error rate is exercised
			signals[i] = s
		}
		d := BuildDashboard("P", signals).Dashboard
		if d.ErrorRate < 0 || d.ErrorRate > 1 {
			t.Fatalf("error rate out of [0,1]: %v", d.ErrorRate)
		}
	})
}
