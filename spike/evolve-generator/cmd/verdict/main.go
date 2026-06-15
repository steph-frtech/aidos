// Command verdict — THROWAWAY (EG01 spike runnable). Prints the EG01 spike report and the
// computed go/no-go verdict. By default it uses the DETERMINISTIC fixture proposer (no
// network). Pass --real to run a single live claude-CLI sample as the self-play Proposer
// (the gated LLM exception, §6/§8) — the metric harness stays pure, only the candidate
// SOURCE changes. If the CLI is unavailable, --real reports the failure honestly and the
// self-play sampler yields 0 (never a fabricated win).
package main

import (
	"flag"
	"fmt"

	evolvegen "aidos.local/spike/evolve-generator"
)

func main() {
	real := flag.Bool("real", false, "run a live claude-CLI self-play Proposer sample (else fixture)")
	flag.Parse()

	mode := "FIXTURE (deterministic, no network)"
	v := evolvegen.Decide()
	if *real {
		mode = "REAL claude-CLI sample (gated LLM exception)"
		v = evolvegen.DecideWith(evolvegen.ClaudeProposer)
	}

	fmt.Println("=== EG01 SPIKE — self-play variant generator vs stub deterministicSampler ===")
	fmt.Printf("mode: %s\n\n", mode)
	for _, c := range v.Comparisons {
		fmt.Printf("[cell %s]\n", c.Cell)
		fmt.Printf("  stub      : candidates=%d promoted=%d niches=%v passage=%.0f%% coverage=%.0f%%\n",
			c.Stub.Candidates, c.Stub.Promoted, c.Stub.NichesCovered, c.Stub.GatePassageRate*100, c.Stub.NicheCoverage*100)
		fmt.Printf("  self-play : candidates=%d promoted=%d niches=%v passage=%.0f%% coverage=%.0f%%\n",
			c.Self.Candidates, c.Self.Promoted, c.Self.NichesCovered, c.Self.GatePassageRate*100, c.Self.NicheCoverage*100)
		fmt.Printf("  delta     : coverage %+.0f%% passage %+.0f%%\n", c.CoverageDelta*100, c.GatePassageDelta*100)
	}
	fmt.Println("--- aggregate ---")
	fmt.Printf("stub      mean coverage=%.0f%% mean passage=%.0f%%\n", v.StubMeanCoverage*100, v.StubMeanPassage*100)
	fmt.Printf("self-play mean coverage=%.0f%% mean passage=%.0f%%\n", v.SelfMeanCoverage*100, v.SelfMeanPassage*100)
	fmt.Printf("coverage uplift=%+.1f%% (material threshold=%.1f%%)  passage uplift=%+.1f%%\n",
		v.CoverageUplift*100, v.MaterialCoverageUplift*100, v.PassageUplift*100)
	fmt.Printf("\nVERDICT: %s\n%s\n", v.Decision, v.Rationale)
}
