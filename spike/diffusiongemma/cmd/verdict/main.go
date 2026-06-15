// Command verdict — THROWAWAY (DG01 spike). Prints the differential-completeness measurement + the
// go/no-go verdict. By default uses the deterministic FIXTURE seam (same output every run). With
// --real it takes a SMALL real claude-CLI sample (two distinct prompts as A/B) for an honest verdict;
// if claude is unavailable/slow it falls back to fixtures and reports usedRealLLM=false.
//
// Run: go run ./cmd/verdict           (fixtures, deterministic)
//
//	go run ./cmd/verdict --real      (one real claude-CLI sample, honest fallback)
package main

import (
	"flag"
	"fmt"
	"time"

	dg "aidos.local/spike/diffusiongemma"
)

func main() {
	real := flag.Bool("real", false, "take a small real claude-CLI sample as A/B (honest fallback to fixtures)")
	bin := flag.String("bin", "/home/stevig/.local/bin/claude", "path to the claude CLI")
	model := flag.String("model", "claude-opus-4-8", "model id for the real sample")
	timeout := flag.Duration("timeout", 60*time.Second, "per-call timeout for the real sample")
	flag.Parse()

	var llm dg.LLM = dg.FixtureLLM{}
	usedReal := false
	if *real {
		cli := dg.ClaudeCLI{Bin: *bin, Model: *model, Timeout: *timeout}
		// Probe the real seam once; if it errors, fall back to fixtures honestly.
		if _, err := cli.Generate("single", dg.CheckoutSpec); err != nil {
			fmt.Printf("[real] claude unavailable (%v) — falling back to fixtures (usedRealLLM=false)\n", err)
		} else {
			llm = cli
			usedReal = true
		}
	}

	v, err := dg.Decide(dg.CheckoutSpec, llm, usedReal)
	if err != nil {
		// A real-call error mid-run: report honestly, do not fabricate.
		fmt.Printf("[error] measurement failed: %v\n", err)
		return
	}
	r := v.Report

	fmt.Printf("=== DG01 SPIKE — differential LLM completeness on spec %q ===\n", r.SpecID)
	fmt.Printf("source: usedRealLLM=%v\n\n", v.UsedRealLLM)
	fmt.Printf("single recompile types (%d): %v\n", r.SingleCount, r.SingleKinds)
	fmt.Printf("model A types        (%d): %v\n", len(r.AKinds), r.AKinds)
	fmt.Printf("model B types        (%d): %v\n", len(r.BKinds), r.BKinds)
	fmt.Printf("UNION types          (%d): %v\n", r.UnionCount, r.UnionKinds)
	fmt.Printf("\nSURPLUS over single recompile (%d, floor=%d):\n  %v\n", r.SurplusCount, v.SurplusFloor, r.SurplusOverSingle)
	fmt.Printf("union over BEST single model (%d): %v\n", r.UnionOverBestModelCnt, r.UnionOverBestModel)
	fmt.Printf("\nspec coverage match%%: single=%.1f%%  union=%.1f%%  (expected types=%d)\n",
		r.SingleMatchPct*100, r.UnionMatchPct*100, r.ExpectedCount)
	fmt.Printf("expected types MISSED by single recompile: %v\n", r.MissingFromSingle)
	fmt.Printf("expected types MISSED even by the union  : %v\n", r.MissingFromUnion)
	fmt.Printf("\nVERDICT: GO=%v\n%s\n", v.Go, v.Rationale)
}
