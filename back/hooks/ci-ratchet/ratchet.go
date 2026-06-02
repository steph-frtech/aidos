// Command ci-ratchet is the AIDOS pre-merge cliquet gate (S05). It is the
// non-bypassable rule (CLAUDE.md §5) that refuses a merge the moment a
// previously-green mirror is red on the candidate. It reads a replay result on
// stdin (the baseline + candidate verdicts produced by mirror-runner), calls the
// pure cliquet core (back/mcp/mirror-runner), and returns:
//
//	exit 0  — ALLOWED (no baseline-green mirror regressed)
//	exit 2  — REJECTED, with a RED_REGRESSION BlockReason on stdout
//
// Fail-closed: an undecodable event is treated as a rejection — a CI gate that
// silently lets a malformed payload through is not a gate.
package main

import (
	"encoding/json"
	"io"
	"os"

	ratchet "github.com/steph-frtech/aidos/back/mcp/mirror-runner"
)

const (
	exitAllow = 0
	exitDeny  = 2
)

// Event is the pre-merge payload: the baseline verdicts (the merge-base set the
// cliquet protects) and the candidate verdicts (the replay over the candidate).
// In production mirror-runner produces these by replaying every living mirror;
// the hook only DECIDES (the pure core), it does not run mirrors itself.
type Event struct {
	Ref       string                  `json:"ref"`
	Baseline  []ratchet.MirrorVerdict `json:"baseline"`
	Candidate []ratchet.MirrorVerdict `json:"candidate"`
}

// Decision is the hook's verdict for a candidate.
type Decision struct {
	Verdict     ratchet.MergeVerdict `json:"verdict"`
	Regressed   []ratchet.Regression `json:"regressed"`
	BlockReason *ratchet.BlockReason `json:"block_reason,omitempty"`
}

// DecodeEvent reads one JSON pre-merge event. A decode error fails closed.
func DecodeEvent(r io.Reader) (Event, error) {
	var ev Event
	if err := json.NewDecoder(r).Decode(&ev); err != nil {
		return Event{}, err
	}
	return ev, nil
}

// Evaluate is the hook's pure decision over a decoded event: it delegates to the
// cliquet core. Determinism-first — the gate is a pure function of its inputs.
func Evaluate(ev Event) Decision {
	verdict, regressed, br := ratchet.Decide(ev.Baseline, ev.Candidate)
	return Decision{Verdict: verdict, Regressed: regressed, BlockReason: br}
}

// Run is the binary entrypoint: read the event, decide, emit the decision JSON,
// and return the exit code (0 = allow, 2 = deny). Fail-closed on a decode error.
func Run(stdin io.Reader, stdout io.Writer) int {
	ev, err := DecodeEvent(stdin)
	if err != nil {
		writeDecision(stdout, Decision{
			Verdict: ratchet.VerdictRejected,
			BlockReason: &ratchet.BlockReason{
				Code:        ratchet.CodeRedRegression,
				Severity:    "error",
				Explanation: "Événement de fusion illisible — le cliquet échoue fermé (fail-closed) : aucune fusion non vérifiable ne passe.",
				HowToFix: []string{
					"Vérifiez la forme de l'événement (JSON : { ref, baseline[], candidate[] } produit par mirror-runner).",
				},
			},
		})
		return exitDeny
	}

	d := Evaluate(ev)
	writeDecision(stdout, d)
	if d.Verdict == ratchet.VerdictRejected {
		return exitDeny
	}
	return exitAllow
}

func writeDecision(w io.Writer, d Decision) {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(d)
}

func main() { os.Exit(Run(os.Stdin, os.Stdout)) }
