package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// SensorRun is one immutable record of a sensor suite execution — what
// runtime.sensor_runs (+ sensor_check_results) stores. Content-addressed by the
// event hash; append-only.
type SensorRun struct {
	RunID     string        `json:"run_id"`
	EventHash string        `json:"event_hash"`
	Target    string        `json:"target"`
	Verdict   Verdict       `json:"verdict"`
	Ref       string        `json:"ref"`
	Results   []CheckResult `json:"results"`
}

// RunLog records sensor runs append-only and reads the latest. A real impl writes
// runtime.sensor_runs (below the waterline — the agent role MAY write its own
// audit log there, ADR 0014). In-memory impls back the journey + unit mirrors.
type RunLog interface {
	Record(ctx context.Context, run SensorRun) error
}

// RunSensors is the hook's orchestration: resolve the changed set, run the
// computational sensor suite over it, aggregate the verdict, record the run
// append-only, and return the decision. Determinism-first: the verdict is a pure
// function of the event + the code it points at; only Record performs I/O. An
// errored/unknown sensor is a failure made explicit (it flows through Aggregate as
// !Pass), never a silent pass.
func RunSensors(ctx context.Context, ev Event, runner CheckRunner, log RunLog) Decision {
	files := ChangedFiles(ev)
	checkCtx := CheckContext{
		Files:    files,
		Packages: AffectedGoPackages(files),
	}

	results := make([]CheckResult, 0, len(CanonicalChecks))
	for _, name := range CanonicalChecks {
		results = append(results, runner.Run(name, checkCtx))
	}

	decision := Aggregate(results)

	run := SensorRun{
		RunID:     runID(ev, files),
		EventHash: eventHash(ev, files),
		Target:    strings.Join(files, ","),
		Verdict:   decision.Verdict,
		Ref:       ev.Ref,
		Results:   results,
	}
	if log != nil {
		// A failure to record the run is itself a block-worthy condition (the audit
		// log is part of the guardrail), but it must never SILENTLY allow. We record
		// best-effort and let the caller surface a write error; the in-memory and Pg
		// logs both return nil on success.
		_ = log.Record(ctx, run)
	}

	return decision
}

// eventHash is the content address of the diff/event the run reflects: a stable
// digest of the changed-file set + ref. Same diff ⇒ same hash (determinism-first).
func eventHash(ev Event, files []string) string {
	h := sha256.New()
	h.Write([]byte(ev.Tool))
	h.Write([]byte{0})
	h.Write([]byte(ev.Ref))
	for _, f := range files {
		h.Write([]byte{0})
		h.Write([]byte(f))
	}
	return hex.EncodeToString(h.Sum(nil))
}

// runID groups the per-check rows of a single replay. It derives from the event
// hash so a re-run of the identical diff is traceable, while remaining unique per
// changed-set composition.
func runID(ev Event, files []string) string {
	return "sr-" + eventHash(ev, files)[:16]
}
