// claude.go — EG03 (ADR 0089). The REAL self-play Proposer's CLI shell: the GATED LLM
// exception (§6/§8), confined BEHIND the Proposer seam (selfplay.go). It shells to the
// claude CLI to have a self-play Proposer generate candidate variants for a cell, parses the
// output DETERMINISTICALLY, and returns ONLY niche + mutation candidates. It NEVER decides
// promotion — the cell-side Judge (JudgeCandidate) derives mirror/oos/fitness and the frozen
// Promote gate disposes.
//
// HERMETIC TEST GUARANTEE: the EG03 property MIRROR uses FixtureProposer, never this — so the
// test never touches the network. ClaudeProposer (proposers.go) wraps this with a
// DETERMINISTIC fallback to FixtureProposer, so a real run is never blocked on the CLI and
// never fabricates a win (a malformed line is skipped, never invented).
package evolve

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// claudeBin is the pinned CLI path (ROADMAP-evolve-generator / EG03 contract).
const claudeBin = "/home/stevig/.local/bin/claude"

// claudeModel is the pinned model (CLAUDE.md §7 — AIDOS_LLM_MODEL default).
const claudeModel = "claude-opus-4-8"

// claudeTimeout bounds the CLI call; on timeout the proposer errors and the deterministic
// fallback (FixtureProposer) takes over.
const claudeTimeout = 90 * time.Second

// claudeProposeViaCLI shells to the claude CLI with a self-play Proposer prompt for the cell
// and parses `niche|mutation` lines deterministically. On any CLI error (absent / non-zero /
// timeout) it returns the error so the caller (ClaudeProposer) can fall back deterministically.
// The only nondeterminism is the LLM itself — confined here, re-judged by the gate downstream.
func claudeProposeViaCLI(cell Cell, n int, seed int64) ([]Candidate, error) {
	prompt := buildProposerPrompt(cell, n, seed)

	ctx, cancel := context.WithTimeout(context.Background(), claudeTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, claudeBin, "--print", "--model", claudeModel)
	cmd.Stdin = strings.NewReader(prompt)
	outBytes, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("evolve: claude CLI: %w", err)
	}
	return parseProposals(outBytes), nil
}

// buildProposerPrompt builds the self-play Proposer instruction: it states the cell's
// DECLARED niches and asks for n candidates as `niche|mutation` lines (mutation in [0,1]).
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

// parseProposals parses `niche|mutation` lines DETERMINISTICALLY. Malformed lines are skipped
// (never fabricated). Mutation is clamped to [0,1]. Pure: same bytes → same candidates.
func parseProposals(out []byte) []Candidate {
	var cands []Candidate
	sc := bufio.NewScanner(strings.NewReader(string(out)))
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
