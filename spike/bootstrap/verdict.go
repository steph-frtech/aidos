// verdict.go — THROWAWAY (DP10 spike). The go/no-go is a PURE boolean conjunction
// over the measurement — never an LLM opinion. Content-addressed so "same
// measurement → same verdict hash" is checkable forever.
package bootstrap

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
)

// Verdict is the measured go/no-go.
type Verdict struct {
	Go          bool        `json:"go"`
	Reasons     []string    `json:"reasons"` // every conjunct, with its measured value
	Winner      string      `json:"winner"`  // candidate with the strictly highest score
	Measurement Measurement `json:"measurement"`
	VerdictHash string      `json:"verdictHash"`
}

// Decide computes the verdict. PURE conjunction:
// go ⇔ plan pure ∧ order pure ∧ both real runs ordered+healthy+URL-200
//
//	∧ runs reproducible ∧ native-go scores STRICTLY highest.
func Decide(m Measurement) Verdict {
	winner, strict := topCandidate(m.Candidates)
	conj := []struct {
		ok   bool
		name string
	}{
		{m.PlanDeterministic, "résolution de ports pure (même snapshot → même plan)"},
		{m.OrderDeterministic, "ordre de démarrage pur (permutation → même ordre)"},
		{m.Run1.OrderedOK && m.Run2.OrderedOK, "démarrage ordonné traefik→datastore→serveur (2 runs réels)"},
		{m.Run1.HealthyAll && m.Run2.HealthyAll, "healthchecks verts (2 runs réels)"},
		{m.Run1.URLProbe && m.Run2.URLProbe, "URL imprimée répond 200 via traefik (2 runs réels)"},
		{m.RunsReproducible, "reproductibilité (mêmes événements ordonnés, même port résolu)"},
		{strict && winner == "native-go", "le candidat natif Go score strictement le plus haut"},
	}
	v := Verdict{Go: true, Winner: winner, Measurement: m}
	for _, c := range conj {
		mark := "✓"
		if !c.ok {
			mark = "✗"
			v.Go = false
		}
		v.Reasons = append(v.Reasons, mark+" "+c.name)
	}
	v.VerdictHash = hashVerdict(v)
	return v
}

func topCandidate(cs []Candidate) (string, bool) {
	best, bestScore, strict := "", -1, false
	for _, c := range cs {
		if c.Score > bestScore {
			best, bestScore, strict = c.ID, c.Score, true
		} else if c.Score == bestScore {
			strict = false
		}
	}
	return best, strict
}

// hashVerdict content-addresses the verdict's canonical form (DP01 motif). Pure.
func hashVerdict(v Verdict) string {
	var b strings.Builder
	fmt.Fprintf(&b, "go=%t\nwinner=%s\n", v.Go, v.Winner)
	for _, r := range v.Reasons {
		fmt.Fprintf(&b, "reason=%s\n", r)
	}
	fmt.Fprintf(&b, "port1=%d\nport2=%d\nprompts=%d\nrefs=%d\n",
		v.Measurement.Run1.ResolvedPort, v.Measurement.Run2.ResolvedPort,
		v.Measurement.Script.PromptCount, v.Measurement.Script.DataDockersRefs)
	for _, e := range v.Measurement.Run1.Events {
		fmt.Fprintf(&b, "e1=%d:%s\n", e.Seq, e.Kind)
	}
	for _, e := range v.Measurement.Run2.Events {
		fmt.Fprintf(&b, "e2=%d:%s\n", e.Seq, e.Kind)
	}
	for _, c := range v.Measurement.Candidates {
		fmt.Fprintf(&b, "c=%s:%d\n", c.ID, c.Score)
	}
	sum := sha256.Sum256([]byte(b.String()))
	return hex.EncodeToString(sum[:])
}

// EventKinds projects an event log to its ordered kind sequence. Pure.
func EventKinds(events []Event) []string {
	out := make([]string, len(events))
	for i, e := range events {
		out[i] = e.Kind
	}
	return out
}

// Reproducible compares two runs: identical ordered event kinds + same resolved port. Pure.
func Reproducible(a, b RunResult) bool {
	if a.ResolvedPort != b.ResolvedPort {
		return false
	}
	ka, kb := EventKinds(a.Events), EventKinds(b.Events)
	if len(ka) != len(kb) {
		return false
	}
	for i := range ka {
		if ka[i] != kb[i] {
			return false
		}
	}
	return true
}
