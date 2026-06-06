// Command verdict — THROWAWAY (CE01 spike). Prints the spike's effort-delta measurement + the
// computed go/no-go verdict. Run: go run ./cmd/verdict (from /spike/compound). Deterministic —
// same output every run.
package main

import (
	"fmt"

	compound "aidos.spike/compound"
)

func main() {
	v := compound.Decide()
	s := v.Similar
	d := v.Dissimilar
	fmt.Println("=== CE01 SPIKE — compound capitalisation: capture goal-1 -> cheaper goal-2 ===")
	fmt.Printf("SIMILAR pair  [%s]\n", s.Pair)
	fmt.Printf("  goal-1 cost (no prior capture)      : %d tokens\n", s.Goal1Cost)
	fmt.Printf("  goal-2 WITHOUT capture (baseline)   : %d tokens\n", s.Goal2WithoutCap)
	fmt.Printf("  goal-2 WITH    capture (replayed)   : %d tokens\n", s.Goal2WithCap)
	fmt.Printf("  saved=%d tokens  reduction=%.1f%%  (reused procedural=%d, behavior=%d, pattern=%s)\n",
		s.SavedTokens, s.ReductionFrac*100, s.ReusedProcedural, s.ReusedBehavior, s.PatternHash)
	fmt.Printf("DISSIMILAR control [%s]\n", d.Pair)
	fmt.Printf("  reduction=%.1f%% (must stay <= ceiling %.1f%% — no fabricated reuse)\n", d.ReductionFrac*100, v.DissimilarCeil*100)
	fmt.Printf("floor=%.1f%%  reproducible=%v\n", v.ReductionFloor*100, v.Reproducible)
	fmt.Printf("\nVERDICT: GO=%v\n%s\n", v.Go, v.Rationale)
}
