// Command verdict prints the FN01 spike's COMPUTED go/no-go verdict and its measures.
// Throwaway (spike/functional, ratchet OFF). Run: `go run ./cmd/verdict`.
package main

import (
	"fmt"

	functional "aidos.spike/functional"
)

func main() {
	r := functional.Report(100)
	fmt.Printf("FN01 — ré-émission fonctionnelle du slice checkout\n")
	fmt.Printf("  go-sqlc  parité byte : %v\n", r.Measure.GoParity)
	fmt.Printf("  pg-ddl   parité byte : %v\n", r.Measure.DDLParity)
	fmt.Printf("  ts-types parité byte : %v\n", r.Measure.TSParity)
	fmt.Printf("  reproductible (100×) : %v\n", r.Measure.Reproducible)
	fmt.Printf("  globales mutables    : %d\n", r.Measure.GlobalMutableVars)
	fmt.Printf("\nVERDICT : ")
	if r.Verdict.Go {
		fmt.Printf("GO\n")
	} else {
		fmt.Printf("NO-GO\n")
	}
	fmt.Printf("%s\n", r.Verdict.Rationale)
}
