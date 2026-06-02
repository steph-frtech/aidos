package main

import (
	"fmt"
	"io"
	"strings"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// explain.go wires the S13 behaviour of the `aidos explain` verb: rendering an
// actionable BlockReason (KRD §44.5 / §82.1 — "explique les blocages"). It edits
// only the explain command's own surface; the other verbs (check/impact/stable/
// diff) keep their S03 stub contract.
//
// Surface (matches the existing stdlib-flag-free, positional dispatcher in main.go —
// no second CLI framework is introduced, ADR-free): `aidos explain <CODE>` renders
// the BlockReason for that code; `aidos explain` with no argument falls back to the
// S03 declared contract (so the help/contract projection is unchanged); an unknown
// code is a usage error (exit 2) listing the known codes — never a prison.
//
// DETERMINISM-FIRST: runExplain is a pure function of (args, stdout) → exit code;
// the rendering is blockreason.Render, the single shared renderer (the Workbench
// /why-blocked panel uses the same field order), so the CLI and the screen agree.

// runExplain handles `aidos explain [CODE]`. args are the verb's operands (without
// the "explain" verb itself). Returns the process exit code.
func runExplain(args []string, stdout io.Writer) int {
	// No operand: keep the S03 declared-contract behaviour (the verb is wired and
	// its future shape is printed). The contract for explain is owned by S13.
	if len(args) == 0 {
		c, _ := lookup(string(VerbExplain))
		renderContract(stdout, c)
		return exitOK
	}

	code := blockreason.Code(strings.TrimSpace(args[0]))
	br, ok := blockreason.Lookup(code)
	if !ok {
		fmt.Fprintf(stdout, "aidos explain — code de blocage inconnu : %q\n\n", args[0])
		fmt.Fprintln(stdout, "Codes connus (l'énumération est close) :")
		for _, c := range blockreason.Codes() {
			fmt.Fprintf(stdout, "  %s\n", c)
		}
		fmt.Fprintln(stdout, "\nLancez \"aidos explain <CODE>\" pour le chemin de résolution d'un blocage.")
		return exitUsage
	}

	fmt.Fprintf(stdout, "aidos explain %s — refus actionnable (BlockReason)\n\n", code)
	fmt.Fprint(stdout, blockreason.Render(br))
	return exitOK
}
