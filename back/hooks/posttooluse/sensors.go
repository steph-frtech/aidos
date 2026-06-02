// Package main is the AIDOS PostToolUse sensors hook — the feedback wall and the
// twin of the wall (CLAUDE.md §6, KRD §74: "PostToolUse = les sensors"). After
// each agent diff below the waterline, it resolves the CHANGED CODE set, runs the
// computational sensor suite (gofmt, vet, lint, archtest, affected), and emits a
// verdict: on any failing check `block` with an actionable BlockReason (code
// SENSOR_FAILED); on all-green `allow`. Every run is recorded append-only in
// runtime.sensor_runs.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the verdict is a pure function of the event
// and the code it points at — Aggregate has no clock, no rng, no I/O, so the same
// results always yield the same decision (the rapid property is its reproducibility
// mirror). The hook INVOKES the frozen tools (gofmt, go vet, go test) as
// subprocesses; it never reimplements them, and it never delegates the verdict to
// an LLM (a sensor judged by an agent would be a determinism gap).
//
// The sensors check CONFORMANCE to the kernel; they do not define it. The hook
// writes nothing above the waterline — sensor_runs is a runtime audit log below the
// line (ADR 0014).
package main

// Verdict is the hook's decision. There are exactly two — there is no third
// verdict (the rapid invariant pins this; the DB CHECK constraint enforces it).
type Verdict string

const (
	// VerdictAllow lets the diff proceed (all sensors green).
	VerdictAllow Verdict = "allow"
	// VerdictBlock refuses the diff (at least one sensor failed). on_fail: block.
	VerdictBlock Verdict = "block"
)

// BlockCode is the stable, machine-readable code of a refusal.
type BlockCode string

// CodeSensorFailed is the one code this hook emits: at least one computational
// sensor failed on the changed code.
const CodeSensorFailed BlockCode = "SENSOR_FAILED"

// BlockReason is the actionable refusal shape shared across AIDOS block sites
// (CLAUDE.md §2: code, severity, explanation, how_to_fix[]). It mirrors the S04
// wall BlockReason JSON contract; each hook declares the shape locally (the
// existing two-hook precedent — pretooluse + ci-ratchet). A block without a
// BlockReason becomes a prison; the refusal always names the door.
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

// CheckResult is one computational sensor's outcome on the changed code.
//   - Pass:    the sensor is green. An errored result MUST have Pass=false.
//   - Errored: the sensor could not produce a verdict (crashed / missing). This is
//     a FAILURE made explicit (KRD §82 .passthrough() anti-pattern), never ignored.
//   - Output:  the captured tool output (for the BlockReason / audit log).
//   - DurationMS: wall-clock duration, for the /sensors panel.
type CheckResult struct {
	Name       string `json:"name"`
	Pass       bool   `json:"pass"`
	Errored    bool   `json:"errored,omitempty"`
	Output     string `json:"output,omitempty"`
	DurationMS int64  `json:"duration_ms"`
}

// Decision is the aggregator's output: a verdict, the failing check names (exactly
// the failing subset, sorted, no drop), and — on block — the BlockReason.
type Decision struct {
	Verdict     Verdict      `json:"verdict"`
	Failing     []string     `json:"failing,omitempty"`
	BlockReason *BlockReason `json:"block_reason,omitempty"`
}

// Aggregate is the deep, well-named heart of on_fail:block: block IFF at least one
// check failed, allow otherwise. Pure and total. A result is "failing" iff !Pass
// (an errored result has Pass=false, so it counts as failing — never silently
// dropped). The failing[] list is exactly the failing subset, in input order.
func Aggregate(results []CheckResult) Decision {
	var failing []string
	for _, r := range results {
		if !r.Pass {
			failing = append(failing, r.Name)
		}
	}
	if len(failing) == 0 {
		return Decision{Verdict: VerdictAllow}
	}
	return Decision{
		Verdict:     VerdictBlock,
		Failing:     failing,
		BlockReason: sensorFailedBlockReason(failing, results),
	}
}

// sensorFailedBlockReason builds the canonical actionable refusal naming the
// failing sensor(s) and how to fix them.
func sensorFailedBlockReason(failing []string, results []CheckResult) *BlockReason {
	first := failing[0]
	explanation := "Sensor en échec sur le code changé : « " + first + " »"
	if len(failing) > 1 {
		explanation += " (et " + itoa(len(failing)-1) + " autre(s))"
	}
	explanation += ". L'agent ne s'auto-certifie que sur le computationnel ; le diff est bloqué tant qu'un capteur est rouge (on_fail: block, KRD §74)."
	// Surface the first failing sensor's output, when present, to make the refusal
	// concrete (the audit log carries the full per-check output).
	if out := outputFor(first, results); out != "" {
		explanation += " Sortie : " + truncate(out, 400)
	}
	return &BlockReason{
		Code:        CodeSensorFailed,
		Severity:    "error",
		Explanation: explanation,
		HowToFix: []string{
			"Reproduisez localement le capteur fautif sur le paquet changé (gofmt -l / go vet / go test).",
			"Inspectez le BlockReason avec `aidos explain SENSOR_FAILED` et la route Workbench /sensors.",
			"Réparez le diff (red→green) avant le prochain tool-call ; le mur de feedback tient tant que le capteur reste rouge.",
		},
	}
}

func outputFor(name string, results []CheckResult) string {
	for _, r := range results {
		if r.Name == name {
			return r.Output
		}
	}
	return ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// itoa avoids pulling strconv into the hot type file for a single small int.
func itoa(n int) string {
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
