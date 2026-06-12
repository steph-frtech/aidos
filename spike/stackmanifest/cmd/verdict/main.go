// Command verdict — THROWAWAY (DP01 spike). Prints the measured go/no-go verdict and the
// harvested DRAFT record as JSON. Run: go run ./cmd/verdict (from /spike/stackmanifest).
// Deterministic — same output every run (no clock, no RNG, no LLM).
package main

import (
	"encoding/json"
	"fmt"
	"os"

	stackmanifest "aidos.spike/stackmanifest"
)

func main() {
	v := stackmanifest.Decide()
	fmt.Println("=== DP01 SPIKE — StackManifest as a first-rank content-addressed source ===")
	fmt.Printf("emissions=%d byte_identical=%v round_trip=%v drift_detected(source)=%v drift_detected(template)=%v\n",
		v.Measurement.Emissions, v.Measurement.ByteIdentical, v.Measurement.RoundTripOK,
		v.Measurement.DriftDetectedOnSource, v.Measurement.DriftDetectedOnTmpl)
	fmt.Printf("source_hash=%s\noutput_hash=%s emitted_bytes=%d\n",
		v.Measurement.SourceHash, v.Measurement.OutputHash, v.Measurement.EmittedBytes)
	for _, f := range v.Forms {
		fmt.Printf("form %-26s fit=%d/4 (body=%v addr=%v wall=%v append=%v)\n",
			f.Form, f.Fit, f.CarriesBody, f.ContentAddressed, f.WallGoverned, f.AppendOnly)
	}
	fmt.Printf("\nVERDICT: GO=%v — chosen form: %s\n%s\n\n", v.Go, v.ChosenForm, v.Rationale)

	rec := stackmanifest.Harvest(v)
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	fmt.Println("=== /harvest record (DRAFT candidate-Idea — a record, never a declaration) ===")
	_ = enc.Encode(rec)
}
