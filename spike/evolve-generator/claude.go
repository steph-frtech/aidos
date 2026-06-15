// claude.go — THROWAWAY (EG01 spike). The OPTIONAL real Proposer: it shells to the claude
// CLI to have a self-play Proposer generate 5-10 candidate variants for the cell. This is
// the GATED LLM exception (§6/§8) behind the SAME Proposer seam as the fixture — so the
// reproducibility test never touches the network (it uses fixtureProposer), while the
// verdict CAN run a real sample.
//
// HONESTY: the CLI output is PARSED deterministically; mirror/oos/fitness are STILL derived
// by the cell-side Judge (deriveMirror/deriveOutOfSample) — the LLM only chooses niches +
// mutation strengths. A malformed line is skipped, never fabricated. If the CLI is absent
// or errors, claudeProposer returns an error and selfPlaySampler reports 0 (no fake win).
package evolvegen

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// claudeBin is the pinned CLI path (from the spike contract).
const claudeBin = "/home/stevig/.local/bin/claude"

// claudeModel is the pinned model.
const claudeModel = "claude-opus-4-8"

// ClaudeProposer is the real self-play Proposer behind the seam. It asks the model to
// propose candidate variants as `niche|mutation` lines, parses them, and clamps to the
// cell's declared niches (an off-niche proposal is kept but will fail Gate.NicheValid —
// honest, not silently dropped). Deterministic parse; the only nondeterminism is the LLM
// itself, which is why the reproducibility test uses the fixture, never this. Exported so
// cmd/verdict --real can inject it (the gated LLM exception, §6/§8).
func ClaudeProposer(cell Cell, budget int, seed int64) ([]Candidate, error) {
	n := budget
	if n > 10 {
		n = 10
	}
	if n < 5 {
		n = 5
	}
	prompt := buildProposerPrompt(cell, n, seed)

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, claudeBin, "--print", "--model", claudeModel)
	cmd.Stdin = strings.NewReader(prompt)
	outBytes, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("claude CLI: %w", err)
	}
	return parseProposals(string(outBytes)), nil
}

// buildProposerPrompt builds the self-play Proposer instruction. It states the cell's
// declared niches and asks for n candidates as `niche|mutation` lines (mutation in [0,1]).
// The seed is woven in so two seeds ask for different exploration emphases.
func buildProposerPrompt(cell Cell, n int, seed int64) string {
	var b strings.Builder
	b.WriteString("You are a self-play VARIANT PROPOSER for an evolutionary code-search loop.\n")
	b.WriteString("A kernel operation cell is being evolved. Propose distinct candidate variants.\n\n")
	b.WriteString("Cell id: " + cell.ID + "\n")
	b.WriteString("Declared behavioral niches (pick from these, spread across them for coverage):\n")
	for _, nch := range cell.Niches {
		b.WriteString("  - " + nch + "\n")
	}
	b.WriteString(fmt.Sprintf("\nExploration seed: %d (vary your emphasis by this seed).\n", seed))
	b.WriteString(fmt.Sprintf("\nOutput EXACTLY %d lines, one per candidate, format:\n", n))
	b.WriteString("  niche|mutation\n")
	b.WriteString("where niche is one of the declared niches and mutation is a float in [0,1]\n")
	b.WriteString("(mutation = how aggressively the variant diverges from the parent;\n")
	b.WriteString(" bold mutations explore more but risk breaking behavior).\n")
	b.WriteString("No prose, no numbering, no code fences — only the lines.\n")
	return b.String()
}

// parseProposals parses `niche|mutation` lines deterministically. Malformed lines are
// skipped (never fabricated). Mutation is clamped to [0,1].
func parseProposals(out string) []Candidate {
	var cands []Candidate
	sc := bufio.NewScanner(strings.NewReader(out))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || !strings.Contains(line, "|") {
			continue
		}
		// strip any leading list markers the model might add
		line = strings.TrimLeft(line, "-*0123456789. ")
		parts := strings.SplitN(line, "|", 2)
		if len(parts) != 2 {
			continue
		}
		niche := strings.TrimSpace(parts[0])
		mut, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
		if err != nil {
			continue
		}
		if mut < 0 {
			mut = 0
		}
		if mut > 1 {
			mut = 1
		}
		if niche == "" {
			continue
		}
		cands = append(cands, Candidate{Niche: niche, Mutation: mut})
	}
	return cands
}
