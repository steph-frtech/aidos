// Command aidosdatafragments emits the DP15 DATA-SUBSTRATE service fragments of
// the emitted app as DETERMINISTIC JSON for the /substrate Workbench panel. It is
// a thin CLI shell over runtime/datafragments (the authoritative Go, never forked
// in TS): given -project and -env it prints, on stdout, the FULL palette door
// (surfacing the DP06 doltgres-in-prod refusal VERBATIM) plus the legal core slice
// and each fragment's content address — the panel reads this single source.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the body is a pure projection of the closed
// palette; same (-project, -env) ⇒ byte-identical JSON. No LLM, no clock, no RNG.
// THE WALL (§2): below-the-line projection, writes NO truth (no kernel/mirrors/
// fitness, no gen/ file) — it only renders the fragments to stdout.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/asyncfragments"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
	"github.com/steph-frtech/aidos/back/runtime/observabilityfragments"
)

// fragmentOut is the per-fragment JSON the panel renders: the ServiceFragment plus
// its content address (HashFragment — the byte-identity / isolation oracle).
type fragmentOut struct {
	datafragments.ServiceFragment
	Hash string `json:"hash"`
}

// output is the full DP15 emission the panel consumes for one (project, env).
type output struct {
	ProjectID string `json:"project_id"`
	Env       string `json:"env"`
	// FullOK is true when the full palette door returned no refusal (off prod), so
	// Full carries the four fragments. In prod FullOK is false and Refusal is set.
	FullOK bool          `json:"full_ok"`
	Full   []fragmentOut `json:"full"`
	// Refusal carries the DP06 verdict VERBATIM when the full door refuses (prod ×
	// doltgres ⇒ DOLTGRES_NOT_ALLOWED_IN_PROD).
	Refusal *refusalOut `json:"refusal,omitempty"`
	// Core is the legal core slice (omits the forbidden doltgres in prod, no error).
	Core []fragmentOut `json:"core"`
	// Keys is the closed palette key set in canonical order.
	Keys []string `json:"keys"`
}

type refusalOut struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// asyncOutput is the full DP16 async-substrate emission for one (project, env): the TWO
// async fragments (Windmill + NATS) and the deterministic DEMO dispatch trace of the S73
// scheduled operation realised at its echeance on an INJECTED clock (write-effect → ack).
type asyncOutput struct {
	ProjectID string        `json:"project_id"`
	Env       string        `json:"env"`
	Async     []fragmentOut `json:"async"`
	Keys      []string      `json:"keys"`
	// Demo carries the ordered dispatch steps of the canonical scheduled operation
	// (sendReminder) realised at echeance — write-effect THEN ack, the outbox sequence.
	Demo []demoStep `json:"demo"`
}

// demoStep is one observable step of the demo job's outbox dispatch sequence — the
// transactional-outbox order: a `write-effect` step (the effect is written PENDING in the
// state transaction) then an `ack` step (the dispatcher delivers + marks dispatched). The
// `step` index is the deterministic order the panel renders (1 = write, 2 = ack, …).
type demoStep struct {
	Step      int    `json:"step"`
	Phase     string `json:"phase"` // "write-effect" | "ack"
	Operation string `json:"operation"`
	EffectID  string `json:"effect_id"`
	Kind      string `json:"kind"`
	Target    string `json:"target"`
	Bus       string `json:"bus"` // the async fragment the effect is dispatched over (nats)
}

// obsFragmentOut is the per-fragment JSON the observability panel renders — the
// observabilityfragments.ServiceFragment plus its content address AND the wall oracle
// (writes_truth + the read-only capabilities), so the screen can SHOW the capital
// invariant: an exploitation-observability fragment writes NO truth.
type obsFragmentOut struct {
	observabilityfragments.ServiceFragment
	Hash         string   `json:"hash"`
	WritesTruth  bool     `json:"writes_truth"`
	Capabilities []string `json:"capabilities"`
}

// instrumentationOut is the emitted-instrumentation JSON: how the emitted TS app wires
// @opentelemetry/* → SigNoz and its errors → GlitchTip (a PURE projection of the Kernel,
// ADR 0040 TS — never Go runtime), plus its content address AND the wall oracle.
type instrumentationOut struct {
	observabilityfragments.Instrumentation
	Hash         string   `json:"hash"`
	WritesTruth  bool     `json:"writes_truth"`
	Capabilities []string `json:"capabilities"`
}

// observabilityOutput is the full DP17 observability-substrate emission for one
// (project, env): the THREE observability fragments (OTel collector + SigNoz +
// GlitchTip, all profile observability), the emitted TS instrumentation projection, and
// the closed palette key set. ALL of it writes NO truth (the wall §2) — the obs_no_truth
// flag is the screen's capital indicator (exploitation observability ≠ Kernel sensor;
// the RealityMirror E12 is the only on-ramp).
type observabilityOutput struct {
	ProjectID       string             `json:"project_id"`
	Env             string             `json:"env"`
	Observability   []obsFragmentOut   `json:"observability"`
	Instrumentation instrumentationOut `json:"instrumentation"`
	Keys            []string           `json:"keys"`
	// ObsNoTruth is true iff NO fragment and NOT the instrumentation writes truth AND
	// no capability is a truth-write scope — the screen's deterministic « écrit aucune
	// vérité » indicator (computed from the oracle, never asserted by prose).
	ObsNoTruth bool `json:"obs_no_truth"`
}

func toObsOut(frags []observabilityfragments.ServiceFragment) ([]obsFragmentOut, error) {
	out := make([]obsFragmentOut, 0, len(frags))
	for _, f := range frags {
		h, err := observabilityfragments.HashFragment(f)
		if err != nil {
			return nil, err
		}
		out = append(out, obsFragmentOut{
			ServiceFragment: f,
			Hash:            h,
			WritesTruth:     f.WritesTruth(),
			Capabilities:    f.Capabilities(),
		})
	}
	return out, nil
}

// emitObservability prints the DP17 observability-substrate emission (the three fragments
// + the emitted instrumentation). The obs_no_truth flag is COMPUTED from the wall oracle:
// no fragment writes truth, the instrumentation writes no truth, and no capability is a
// truth-write scope (IsTruthWriteCapability). Same (project, env) ⇒ byte-identical JSON.
func emitObservability(project, env string) {
	frags, err := observabilityfragments.SubstrateObservabilityFragments(project, scope.Environment(env))
	if err != nil {
		var ref *envbindings.Refusal
		if errors.As(err, &ref) {
			fmt.Fprintln(os.Stderr, "aidosdatafragments:", ref.Error())
			os.Exit(1)
		}
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", err)
		os.Exit(1)
	}
	obsOut, ferr := toObsOut(frags)
	if ferr != nil {
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", ferr)
		os.Exit(1)
	}
	instr, ierr := observabilityfragments.EmittedInstrumentation(project, scope.Environment(env))
	if ierr != nil {
		var ref *envbindings.Refusal
		if errors.As(ierr, &ref) {
			fmt.Fprintln(os.Stderr, "aidosdatafragments:", ref.Error())
			os.Exit(1)
		}
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", ierr)
		os.Exit(1)
	}
	ih, herr := observabilityfragments.HashInstrumentation(instr)
	if herr != nil {
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", herr)
		os.Exit(1)
	}

	// Compute the capital indicator from the wall oracle — never a prose assertion.
	noTruth := !instr.WritesTruth()
	for _, c := range instr.Capabilities() {
		if observabilityfragments.IsTruthWriteCapability(c) {
			noTruth = false
		}
	}
	for _, f := range obsOut {
		if f.WritesTruth {
			noTruth = false
		}
		for _, c := range f.Capabilities {
			if observabilityfragments.IsTruthWriteCapability(c) {
				noTruth = false
			}
		}
	}

	res := observabilityOutput{
		ProjectID:     project,
		Env:           env,
		Observability: obsOut,
		Instrumentation: instrumentationOut{
			Instrumentation: instr,
			Hash:            ih,
			WritesTruth:     instr.WritesTruth(),
			Capabilities:    instr.Capabilities(),
		},
		Keys:       observabilityfragments.Keys(),
		ObsNoTruth: noTruth,
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(res); err != nil {
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", err)
		os.Exit(1)
	}
}

func toOut(frags []datafragments.ServiceFragment) ([]fragmentOut, error) {
	out := make([]fragmentOut, 0, len(frags))
	for _, f := range frags {
		h, err := datafragments.HashFragment(f)
		if err != nil {
			return nil, err
		}
		out = append(out, fragmentOut{ServiceFragment: f, Hash: h})
	}
	return out, nil
}

// demoOutbox is a deterministic in-memory double for the S73 transactional outbox seam —
// the SAME shape the asyncfragments fixture uses (Write + Pending/MarkDispatched/
// IsDispatched). It is build-time only (the CLI runs no real job, no real clock); it lets
// the demo trace REUSE the authoritative RealizeScheduled rather than re-coin a sequence.
type demoOutbox struct {
	entries    []operation.OutboxEntry
	dispatched map[string]bool
}

func newDemoOutbox() *demoOutbox { return &demoOutbox{dispatched: map[string]bool{}} }

func (o *demoOutbox) Write(e operation.OutboxEntry) { o.entries = append(o.entries, e) }

func (o *demoOutbox) Pending() []operation.OutboxEntry {
	out := make([]operation.OutboxEntry, 0, len(o.entries))
	for _, e := range o.entries {
		if e.Status == operation.OutboxPending {
			out = append(out, e)
		}
	}
	return out
}

func (o *demoOutbox) MarkDispatched(id string) {
	o.dispatched[id] = true
	for i := range o.entries {
		if o.entries[i].ID == id {
			o.entries[i].Status = operation.OutboxDispatched
		}
	}
}

func (o *demoOutbox) IsDispatched(id string) bool { return o.dispatched[id] }

// demoSink records deliveries; the demo discards them (the trace is built from the events).
type demoSink struct{ delivered []operation.Effect }

func (s *demoSink) Deliver(e operation.Effect) error {
	s.delivered = append(s.delivered, e)
	return nil
}

// buildDemoTrace realises the canonical scheduled operation (sendReminder) at its echeance
// on an INJECTED clock through the S73 outbox, and renders the ordered dispatch steps the
// panel shows: per delivered effect, a `write-effect` step THEN an `ack` step (the
// transactional-outbox order — the effect is written before it is acknowledged/dispatched).
// Same input ⇒ byte-identical trace (no clock, no rng — the clock is the fixture echeance).
func buildDemoTrace() ([]demoStep, error) {
	op, async := operation.SendReminder()
	clock := operation.FixedClock{At: async.Trigger.At} // realise AT the echeance — injected
	outbox := newDemoOutbox()
	sink := &demoSink{}
	events, err := asyncfragments.RealizeScheduled(op, async, clock, outbox, sink)
	if err != nil {
		return nil, err
	}
	steps := make([]demoStep, 0, len(events)*2)
	n := 0
	for _, e := range events {
		// 1. write-effect — the effect is written PENDING (the outbox WRITE side).
		n++
		steps = append(steps, demoStep{
			Step:      n,
			Phase:     "write-effect",
			Operation: e.Operation,
			EffectID:  e.EffectID,
			Kind:      string(e.Kind),
			Target:    e.Target,
			Bus:       "nats",
		})
		// 2. ack — the dispatcher delivered it (at-least-once + dedup ⇒ exactly-once relative).
		n++
		steps = append(steps, demoStep{
			Step:      n,
			Phase:     "ack",
			Operation: e.Operation,
			EffectID:  e.EffectID,
			Kind:      string(e.Kind),
			Target:    e.Target,
			Bus:       "nats",
		})
	}
	return steps, nil
}

// emitAsync prints the DP16 async-substrate emission (the two fragments + the demo trace).
func emitAsync(project, env string) {
	frags, err := asyncfragments.SubstrateAsyncFragments(project, scope.Environment(env))
	if err != nil {
		var ref *envbindings.Refusal
		if errors.As(err, &ref) {
			fmt.Fprintln(os.Stderr, "aidosdatafragments:", ref.Error())
			os.Exit(1)
		}
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", err)
		os.Exit(1)
	}
	asyncOut, ferr := toOut(frags)
	if ferr != nil {
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", ferr)
		os.Exit(1)
	}
	demo, derr := buildDemoTrace()
	if derr != nil {
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", derr)
		os.Exit(1)
	}
	res := asyncOutput{
		ProjectID: project,
		Env:       env,
		Async:     asyncOut,
		Keys:      asyncfragments.Keys(),
		Demo:      demo,
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(res); err != nil {
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", err)
		os.Exit(1)
	}
}

func main() {
	project := flag.String("project", "", "the project the fragments are isolated to")
	env := flag.String("env", "dev", "the deployment environment (prod|staging|dev|local|future_cloud)")
	async := flag.Bool("async", false, "emit the DP16 ASYNC-substrate fragments (Windmill + NATS) + the demo dispatch trace instead of the DP15 data fragments")
	observability := flag.Bool("observability", false, "emit the DP17 OBSERVABILITY-substrate fragments (OTel collector + SigNoz + GlitchTip) + the emitted TS instrumentation instead of the DP15 data fragments")
	flag.Parse()

	if *observability {
		emitObservability(*project, *env)
		return
	}

	if *async {
		emitAsync(*project, *env)
		return
	}

	res := output{
		ProjectID: *project,
		Env:       *env,
		Keys:      datafragments.Keys(),
	}

	// The full palette door — surfaces the DP06 refusal verbatim in prod.
	full, err := datafragments.SubstrateDataFragments(*project, scope.Environment(*env))
	if err != nil {
		var ref *envbindings.Refusal
		if errors.As(err, &ref) {
			res.FullOK = false
			res.Refusal = &refusalOut{Code: ref.Code, Message: ref.Message}
		} else {
			fmt.Fprintln(os.Stderr, "aidosdatafragments:", err)
			os.Exit(1)
		}
	} else {
		fullOut, ferr := toOut(full)
		if ferr != nil {
			fmt.Fprintln(os.Stderr, "aidosdatafragments:", ferr)
			os.Exit(1)
		}
		res.FullOK = true
		res.Full = fullOut
	}

	// The legal core slice — never errors for a known env (omits the gated fragment).
	core, cerr := datafragments.SubstrateCoreFragments(*project, scope.Environment(*env))
	if cerr != nil {
		var ref *envbindings.Refusal
		if errors.As(cerr, &ref) {
			// An unknown env is the only core refusal; surface it on stderr + exit.
			fmt.Fprintln(os.Stderr, "aidosdatafragments:", ref.Error())
			os.Exit(1)
		}
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", cerr)
		os.Exit(1)
	}
	coreOut, ferr := toOut(core)
	if ferr != nil {
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", ferr)
		os.Exit(1)
	}
	res.Core = coreOut

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(res); err != nil {
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", err)
		os.Exit(1)
	}
}
