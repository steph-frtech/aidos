// Package doltgresspike is the S88 gating spike (EPIC 9, ADR 0006 addendum).
//
// It answers ONE governance question deterministically: does the emitted app's
// data-versioning target default to Doltgres, or to plain-Postgres?
//
// Per ADR 0006 the open question was "is Doltgres the default emitted-app
// datastore, or opt-in alongside plain-Postgres?". This spike resolves it with a
// MEASURE, never an opinion (§8 "the judge is deterministic", determinism-first
// mandate). A Testcontainers probe (doltgresspike_concurrency_test.go) drives N
// concurrent connections at the emitted app's data driver against a Doltgres
// container and records a Measurement; this package turns that Measurement into a
// content-addressed Decision via a PURE function — same Measurement + same
// declared Thresholds → byte-identical Decision (reproducibility mirror).
//
// The DEFAULT is plain-Postgres and Doltgres is OPT-IN per app. The spike can
// only CONFIRM that default (go: Doltgres is also offerable as opt-in) or HARDEN
// it (no-go: Doltgres is withdrawn even as opt-in until the beta caveats clear).
// Either way the escape hatch (plain-Postgres) is already the default, so EPIC 10
// (S91→S100) stays viable without reordering — exactly as the roadmap requires.
//
// EPIC 9 preamble note (roadmap): the emitted app's data driver is a TypeScript
// Postgres client (postgres.js / node-postgres / Drizzle), NOT pgx. The pgx-only
// failure mode #2581 (thread-unsafe parser under concurrent pgx) may not
// reproduce identically against a TS driver, so the go/no-go criteria are
// re-formulated per the TS driver here: the probe measures connection STABILITY
// (no panic / no dropped connection / no corrupted result) and the perf RATIO
// against plain-Postgres (the ~5.2× and missing lock primitives #2600 are
// dialect/engine-level and survive the driver pivot).
package doltgresspike

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Target is an emitted-app datastore target (ADR 0006 frozen-stack slot,
// replaceable). PlainPostgres is the default; Doltgres is opt-in.
type Target string

const (
	// PlainPostgres is the DEFAULT emitted-app datastore target. It is always
	// available regardless of the spike verdict (the escape hatch).
	PlainPostgres Target = "plain-postgres"
	// Doltgres is the opt-in, git-for-data emitted-app datastore target. It is
	// only OFFERED (as opt-in) when the spike verdict is Go.
	Doltgres Target = "doltgres"
)

// Verdict is the spike's binary gate. It is COMPUTED from a Measurement against
// declared Thresholds, never declared by an agent.
type Verdict string

const (
	// Go means Doltgres survived the concurrency + load probe within the declared
	// thresholds; it MAY be offered as an opt-in target. The default stays
	// plain-Postgres regardless.
	Go Verdict = "go"
	// NoGo means the probe found a reproducible instability or the perf ratio blew
	// past the declared ceiling; Doltgres is withdrawn even as opt-in until the
	// beta caveats clear. The default (already plain-Postgres) is unchanged.
	NoGo Verdict = "no-go"
)

// Driver names the data driver the probe exercised. Per the EPIC 9 preamble the
// emitted-app primary is a TS driver; pgx is retained only as the AIDOS-side
// equivalent stand-in used by the Testcontainers probe when no TS runner is
// available (the failure mode is re-formulated, not the engine under test).
type Driver string

const (
	// DriverTSPostgres is the emitted-app primary driver (postgres.js /
	// node-postgres / Drizzle adapter) — the one S88 must judge against.
	DriverTSPostgres Driver = "ts-postgres"
	// DriverPgx is the Go-side stand-in the in-repo Testcontainers probe uses; its
	// #2581 failure mode is pgx-specific and re-formulated to driver-neutral
	// STABILITY for the verdict.
	DriverPgx Driver = "pgx"
)

// Thresholds are the DECLARED go/no-go criteria (above the line, §8 "weights
// declared, never learned"). They are part of the verdict's content-address, so a
// changed threshold yields a different Decision hash — the verdict can never be
// silently re-graded.
type Thresholds struct {
	// MaxPerfRatio is the largest tolerated (Doltgres latency / plain-Postgres
	// latency) under the concurrent load. ADR 0006 cites ~5.2× as the known
	// dialect-level slowdown; the spike fails (no-go) only above the declared
	// ceiling, so a result merely confirming ~5.2× is still a Go.
	MaxPerfRatio float64 `json:"maxPerfRatio"`
	// MaxFailedConns is the largest tolerated number of connections that ended in
	// a panic / dropped connection / corrupted result across the probe. Default 0:
	// any reproducible instability is a no-go.
	MaxFailedConns int `json:"maxFailedConns"`
}

// DefaultThresholds are the declared S88 criteria. MaxPerfRatio 6.0 leaves head-
// room above ADR 0006's cited ~5.2× (a result near the documented slowdown is a
// Go, a runaway is a no-go); MaxFailedConns 0 means a single reproducible
// instability flips the default. These are DECLARED, not tuned to a result.
var DefaultThresholds = Thresholds{MaxPerfRatio: 6.0, MaxFailedConns: 0}

// Measurement is the raw, deterministic OUTPUT of the Testcontainers probe — a
// pure observation, no judgment. The probe fills it; this package judges it.
type Measurement struct {
	// Driver is the data driver exercised.
	Driver Driver `json:"driver"`
	// Conns is N, the number of concurrent connections submitted.
	Conns int `json:"conns"`
	// FailedConns is how many ended in panic / dropped connection / corrupted
	// result (the driver-neutral re-formulation of #2581 / #2600).
	FailedConns int `json:"failedConns"`
	// PerfRatio is the measured (Doltgres / plain-Postgres) latency ratio under
	// the concurrent load. 0 means not measured (treated as worst case below).
	PerfRatio float64 `json:"perfRatio"`
	// Reproducible reports whether the same probe re-run produced the same
	// failure/stability outcome. A non-reproducible blip is NOT a no-go (the
	// done-criteria require a REPRODUCIBLE failure to flip the default).
	Reproducible bool `json:"reproducible"`
}

// Decision is the content-addressed record the spike emits. It is a RECORD, never
// a declaration: ID = Hash(canonical-json of the inputs+verdict), so the same
// measurement always yields the same Decision and the verdict is auditable.
type Decision struct {
	// ID is the content address (records.Hash of the canonical payload).
	ID string `json:"id"`
	// Verdict is the computed gate.
	Verdict Verdict `json:"verdict"`
	// DefaultTarget is the emitted-app datastore default after this decision —
	// ALWAYS plain-postgres (the escape hatch is the default by construction).
	DefaultTarget Target `json:"defaultTarget"`
	// OptInTargets are the targets an app may opt into. plain-postgres is always
	// present; doltgres is present iff the verdict is Go.
	OptInTargets []Target `json:"optInTargets"`
	// Measurement is the raw observation that produced the verdict.
	Measurement Measurement `json:"measurement"`
	// Thresholds are the declared criteria the measurement was judged against.
	Thresholds Thresholds `json:"thresholds"`
	// Reasons explains the verdict in actionable, deterministic terms.
	Reasons []string `json:"reasons"`
}

// Evaluate is the AUTHORITATIVE pure function: Measurement × Thresholds → Verdict.
// It is total, deterministic and side-effect-free (the reproducibility mirror
// pins same-input→same-output). No LLM may produce this verdict — it is a count
// and two comparisons.
//
// A measurement is a no-go iff a REPRODUCIBLE instability is found beyond the
// declared connection ceiling, OR the perf ratio blows past the declared ceiling.
// A non-reproducible blip never flips the default (the done-criteria demand a
// reproducible failure). An unmeasured perf ratio (0) is treated as worst case.
func Evaluate(m Measurement, th Thresholds) (Verdict, []string) {
	reasons := make([]string, 0, 3)

	stableEnough := m.FailedConns <= th.MaxFailedConns
	if !stableEnough && m.Reproducible {
		reasons = append(reasons, fmt.Sprintf(
			"reproducible instability: %d/%d connections failed (ceiling %d) under driver %q",
			m.FailedConns, m.Conns, th.MaxFailedConns, m.Driver))
	}
	if !stableEnough && !m.Reproducible {
		// Instability seen but not reproducible: per done-criteria this does NOT
		// flip the default; it is recorded as a caveat, not a no-go.
		reasons = append(reasons, fmt.Sprintf(
			"non-reproducible instability (%d/%d) — NOT a no-go per done-criteria; recorded as caveat",
			m.FailedConns, m.Conns))
		stableEnough = true
	}

	ratio := m.PerfRatio
	perfOK := ratio > 0 && ratio <= th.MaxPerfRatio
	if ratio <= 0 {
		reasons = append(reasons, "perf ratio not measured — treated as worst case (no-go)")
	} else if !perfOK {
		reasons = append(reasons, fmt.Sprintf(
			"perf ratio %.2f× exceeds declared ceiling %.2f×", ratio, th.MaxPerfRatio))
	} else {
		reasons = append(reasons, fmt.Sprintf(
			"perf ratio %.2f× within declared ceiling %.2f×", ratio, th.MaxPerfRatio))
	}

	if stableEnough && perfOK {
		reasons = append(reasons, fmt.Sprintf(
			"stability OK: %d/%d connections survived under driver %q → Doltgres offerable as opt-in",
			m.Conns-m.FailedConns, m.Conns, m.Driver))
		return Go, reasons
	}
	return NoGo, reasons
}

// Decide turns a Measurement into a content-addressed Decision. The default
// target is ALWAYS plain-postgres (the escape hatch by construction); Doltgres
// joins the opt-in set only on a Go verdict. The ID is the records.Hash of the
// canonical (verdict-independent) payload so the record is reproducible and
// tamper-evident.
func Decide(m Measurement, th Thresholds) Decision {
	verdict, reasons := Evaluate(m, th)

	optIn := []Target{PlainPostgres}
	if verdict == Go {
		optIn = append(optIn, Doltgres)
	}
	sortTargets(optIn)

	d := Decision{
		Verdict:       verdict,
		DefaultTarget: PlainPostgres, // escape hatch is the default, always.
		OptInTargets:  optIn,
		Measurement:   m,
		Thresholds:    th,
		Reasons:       reasons,
	}
	d.ID = records.Hash(d.canonicalPayload())
	return d
}

// canonicalPayload is the deterministic byte representation hashed into the ID.
// It excludes the ID itself and the human-readable Reasons (which are derived,
// not authoritative), so the content-address keys ONLY on the load-bearing
// inputs+verdict — two runs that agree on those agree on the ID.
func (d Decision) canonicalPayload() []byte {
	type payload struct {
		Verdict       Verdict     `json:"verdict"`
		DefaultTarget Target      `json:"defaultTarget"`
		OptInTargets  []Target    `json:"optInTargets"`
		Measurement   Measurement `json:"measurement"`
		Thresholds    Thresholds  `json:"thresholds"`
	}
	b, _ := json.Marshal(payload{
		Verdict:       d.Verdict,
		DefaultTarget: d.DefaultTarget,
		OptInTargets:  d.OptInTargets,
		Measurement:   d.Measurement,
		Thresholds:    d.Thresholds,
	})
	return b
}

// OptInAllowed reports whether an app may opt into the given target after this
// decision. plain-postgres is always allowed; doltgres only on a Go verdict.
func (d Decision) OptInAllowed(t Target) bool {
	for _, ot := range d.OptInTargets {
		if ot == t {
			return true
		}
	}
	return false
}

func sortTargets(ts []Target) {
	sort.Slice(ts, func(i, j int) bool { return ts[i] < ts[j] })
}
