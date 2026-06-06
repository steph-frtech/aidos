// cmd/verdict — THROWAWAY (MK01 spike). Prints the computed go/no-go verdict for the markitdown
// ingestion frontier. Run: `cd spike/markitdown && go run ./cmd/verdict`.
package main

import (
	"fmt"

	mk "aidos.spike/markitdown"
)

func main() {
	v := mk.Decide()
	fmt.Println("=== MK01 SPIKE — markitdown ingestion frontier (real document -> markdown -> idea draft) ===")
	fmt.Printf("FIDELITY      carriers %d/%d (%.1f%%, floor %.1f%%)  missing=%v\n",
		v.Fidelity.Found, v.Fidelity.Total, v.Fidelity.Frac*100, v.FidelityFloor*100, v.Fidelity.Missing)
	fmt.Printf("IDEMPOTENCE   deterministic=%v  md-hash=%s  reingest-stable=%v (%.1f%%)\n",
		v.Idempotence.Deterministic, v.Idempotence.Hash, v.Idempotence.ReingestStable, v.Idempotence.ReingestFidelity.Frac*100)
	fmt.Printf("IDEA DRAFT    title=%q  status=%s  source=%s  md=%s\n",
		v.Draft.Title, v.Draft.Status, v.Draft.SourceHash, v.Draft.MarkdownHash)
	fmt.Printf("WALL          respected=%v   REPRODUCIBLE=%v\n", v.WallRespected, v.Reproducible)
	fmt.Printf("\nVERDICT: GO=%v\n%s\n", v.Go, v.Rationale)
}
