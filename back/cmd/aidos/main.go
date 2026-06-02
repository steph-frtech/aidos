package main

import (
	"fmt"
	"io"
	"os"
)

// Exit codes. The S03 stub only ever returns 0 on a known verb or a bare/`help`
// invocation; an unknown verb returns 2 (the conventional usage-error code) with
// the help text on stderr-equivalent. No command performs work yet.
const (
	exitOK    = 0
	exitUsage = 2
	// exitBreach — `aidos check` reported ≥1 KRD-law breach (the truth graph is
	// INVALID). A non-zero, non-usage code so CI / the harness can gate on it.
	exitBreach = 1
)

// Run is the pure CLI dispatcher: it interprets args (the command verbs, without
// the program name) and writes to stdout, returning the process exit code. It is
// a total function of (args, stdout) — no clock, no rng, no global state, no
// env-dependent ordering — so the same args always produce byte-identical output.
// main wires it to os.Args/os.Stdout; tests call it directly.
func Run(args []string, stdout io.Writer) int {
	if len(args) == 0 {
		renderHelp(stdout)
		return exitOK
	}

	verb := args[0]
	switch verb {
	case "help", "-h", "--help":
		renderHelp(stdout)
		return exitOK
	}

	c, ok := lookup(verb)
	if !ok {
		renderHelp(stdout)
		fmt.Fprintf(stdout, "\nunknown command %q — run \"aidos help\" for the contract of each command\n", verb)
		return exitUsage
	}

	// `check` carries real S45 behaviour: run the law-coverage harness over the truth
	// graph and report breaches (each a S13 BlockReason) or `green` (KRD §82.1 — the
	// keystone "krd check"). It REUSES the prior detectors; it authors no law. With no
	// operand it runs the demo project (all-green); `--red <law_id>` runs that law's
	// violating fragment. It is READ-ONLY — it writes no truth (the wall).
	if c.Verb == VerbCheck {
		return runCheck(args[1:], stdout)
	}

	// `explain` carries real S13 behaviour: render an actionable BlockReason for a
	// code operand (KRD §44.5 / §82.1). With no operand it falls back to the S03
	// declared contract. The other verbs stay print-only stubs.
	if c.Verb == VerbExplain {
		return runExplain(args[1:], stdout)
	}

	// `diff` carries real S21 behaviour: read two kernel versions and print the
	// SemanticDiff (KRD §44.1 / §82.1). With no operand it falls back to the S03
	// declared contract. It is READ-ONLY — it writes no truth (the wall).
	if c.Verb == VerbDiff {
		return runDiff(args[1:], stdout)
	}

	// `impact` carries real S22 behaviour: compute and print the red wave (vague de
	// rouge) a kernel bump triggers (KRD §42 / §82.1). With no operand it falls back to
	// the S03 declared contract. It is READ-ONLY — it computes the wave but enqueues
	// nothing (the harness-invoked PostKernelChange hook enqueues).
	if c.Verb == VerbImpact {
		return runImpact(args[1:], stdout)
	}

	// `stable` carries real S23 behaviour: read the current cut and print the stable-phase
	// verdict (KRD §43 / §82.1) — "is this a stable phase?" = "all links resolved + all green?".
	// With no operand it falls back to the S03 declared contract. It is READ-ONLY — it computes
	// the verdict but records no node (the `aidos` writer role records the node, in a ChangeSet).
	if c.Verb == VerbStable {
		return runStable(args[1:], stdout)
	}

	renderContract(stdout, c)
	return exitOK
}

// renderContract writes one command's declared contract to w, deterministically.
// The heading is exactly "aidos <verb>" so the acceptance mirror can assert it.
func renderContract(w io.Writer, c Contract) {
	fmt.Fprintf(w, "aidos %s — %s\n", c.Verb, c.Purpose)
	fmt.Fprintf(w, "  statut   : %s (S03 — contrat declare, comportement non encore implemente)\n", c.Status)
	fmt.Fprintf(w, "  entrees  : %s\n", c.FutureInputs)
	fmt.Fprintf(w, "  sorties  : %s\n", c.FutureOutputs)
	fmt.Fprintf(w, "  livre par: %s\n", c.OwnedBy)
}

// renderHelp lists every command's heading + purpose in canonical order. It is the
// bare/`help` output and shares the registry with renderContract, so help and the
// per-command contract never diverge.
func renderHelp(w io.Writer) {
	fmt.Fprintln(w, "aidos — l'entrypoint du Runtime AIDOS (S03 : squelette print-only, aucune verite ecrite)")
	fmt.Fprintln(w, "")
	fmt.Fprintln(w, "Commandes coeur :")
	for _, c := range Contracts() {
		fmt.Fprintf(w, "  %-8s %s\n", c.Verb, c.Purpose)
	}
	fmt.Fprintln(w, "")
	fmt.Fprintln(w, "Lancez \"aidos <commande>\" pour lire le contrat complet d'une commande.")
}

func main() {
	os.Exit(Run(os.Args[1:], os.Stdout))
}
