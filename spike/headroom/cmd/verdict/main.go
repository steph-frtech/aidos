// Command verdict — THROWAWAY (HR01 spike). Prints the spike's measurement + go/no-go verdict.
// Run: go run ./cmd/verdict (from /spike/headroom). Deterministic — same output every run.
package main

import (
	"fmt"

	headroom "aidos.spike/headroom"
)

func main() {
	v := headroom.Decide()
	fmt.Println("=== HR01 SPIKE — headroom retrieve∘compress on AIDOS prompts ===")
	fmt.Println("LOSSLESS reference-replacement (determinism-safe):")
	for _, r := range v.Reductions {
		fmt.Printf("  [%s] %d -> %d tokens (%.1f%%)\n", r.Prompt, r.TokensBefore, r.TokensAfter, r.ReductionFrac*100)
	}
	fmt.Printf("  allLossless=%v anyCarrierLost=%v\n", v.AllLossless, v.AnyLosslessCarrierLost)
	fmt.Println("LOSSY restatement-drop (fidelity asserted, NOT byte-reversible):")
	for _, lr := range v.LossyReports {
		fmt.Printf("  [%s] %d -> %d tokens (%.1f%%) carriers_lost=%v\n", lr.Prompt, lr.TokensBefore, lr.TokensAfter, lr.ReductionFrac*100, lr.CarriersLost)
	}
	fmt.Printf("\nVERDICT: GO=%v\n%s\n", v.Go, v.Rationale)
}
