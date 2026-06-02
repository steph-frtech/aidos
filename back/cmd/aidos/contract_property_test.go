package main

import (
	"bytes"
	"testing"

	"pgregory.net/rapid"
)

// Reproducibility mirror (rapid, N1) — the determinism invariant of the
// determinism-first mandate (CLAUDE.md §6/§8): for ANY argument vector drawn from
// the command set (plus help/unknown variants), running the pure dispatcher twice
// yields byte-identical stdout AND the same exit code. The CLI is a deterministic
// function of its args — no clock, no rng, no env-dependent ordering — so its
// projection (/cli) and its tests are stable across runs.

func TestRunIsDeterministic(t *testing.T) {
	// The draw space: each known verb, the help variants, an empty invocation,
	// and arbitrary unknown tokens — every path through Run must be reproducible.
	knownArgs := []string{"check", "impact", "stable", "diff", "explain", "help", "--help", "-h", ""}

	rapid.Check(t, func(rt *rapid.T) {
		var arg string
		if rapid.Bool().Draw(rt, "useKnown") {
			arg = rapid.SampledFrom(knownArgs).Draw(rt, "knownArg")
		} else {
			arg = rapid.String().Draw(rt, "arbitraryArg")
		}

		var args []string
		if arg != "" {
			args = []string{arg}
		}

		var out1, out2 bytes.Buffer
		code1 := Run(args, &out1)
		code2 := Run(args, &out2)

		if code1 != code2 {
			rt.Fatalf("exit code not deterministic for args %q: %d vs %d", args, code1, code2)
		}
		if !bytes.Equal(out1.Bytes(), out2.Bytes()) {
			rt.Fatalf("stdout not deterministic for args %q:\n%q\nvs\n%q", args, out1.String(), out2.String())
		}
	})
}

// TestKnownVerbsAlwaysExitZero pins that every declared verb is a success path
// (exit 0) in the stub — no command "fails" yet because none does work.
func TestKnownVerbsAlwaysExitZero(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		verbs := make([]string, 0, len(contracts))
		for _, c := range contracts {
			verbs = append(verbs, string(c.Verb))
		}
		verb := rapid.SampledFrom(verbs).Draw(rt, "verb")

		var out bytes.Buffer
		if code := Run([]string{verb}, &out); code != exitOK {
			rt.Fatalf("known verb %q exited %d, want %d", verb, code, exitOK)
		}
	})
}
