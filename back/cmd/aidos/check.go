package main

import (
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/cmd/aidos/lawcoverage"
)

// check.go wires the S45 behaviour of the `aidos check` verb (= `krd check`, KRD
// §82.1 — "vérifie les lois"): it runs the law-coverage harness over a truth graph
// and prints, deterministically and in canonical order, the list of breaches (each
// a S13-shaped BlockReason) or `green`. It edits only the check command's own
// surface; the other verbs keep their wired behaviour.
//
// THE KEYSTONE RULE (KRD §82.1): "Aucun concept KRD n'existe s'il n'est pas
// vérifiable par `krd check`." Every law in the §82.1+§29 registry is reachable
// through `aidos check` (the laws owned by `stable`/`diff`/`explain` are reached
// through those verbs; `check` owns the rest). This verb PROVES the laws are
// surfaced; it authors NO law and NO detector (the wall, CLAUDE.md §2).
//
// READ-ONLY: `aidos check` reads the truth graph (SELECT-only) and the materialized
// demo project; it writes NOTHING. A breach is reported so a HUMAN can fix it via a
// /goal — never auto-applied.
//
// THE GRAPH FEED (OpenQuestion OQ-S45-1, a by-design forward dependency — consistent
// with diff/impact/stable): the store-query "give me the whole truth graph" is owned
// by the content store / DAG steps (S02/S24). Until that read is wired, `aidos check`
// runs against a DETERMINISTIC catalogue of demo-project graphs (the SAME fragments
// the fixture matrix pins) — so the verb is replayable and read-only NOW; swapping in
// the real SELECT-only store read is a later tooth that does not change this surface.
// lawcoverage.Detect is the authoritative pure verdict; the catalogue only supplies
// the graph to walk.
//
// DETERMINISM-FIRST: runCheck is a pure function of (args, stdout) → exit code; the
// verdict is lawcoverage.Detect, the single shared harness the Workbench /check panel
// also reads, so the CLI and the screen agree.

// demoGraph is the canonical "demo project" graph fragment per law: which graph the
// project actually carries for each law. The demo project is the END-TO-END GREEN
// case — it satisfies every law (its verdict is `green`). The fixture matrix's per-
// law red fragments are reached via `aidos check --red <law>` (the red half of the
// 1-law-1-red-1-green proof). Both halves are the same lawcoverage fragments.
func demoGraph(law lawcoverage.LawID) any {
	c, ok := lawcoverage.LookupCell(law)
	if !ok {
		return nil
	}
	return c.Green // the demo project satisfies every law
}

// runCheck handles `aidos check [demo | --red <law_id>]`. With NO operand it falls
// back to the S03 declared contract (so the help/contract projection is unchanged,
// consistent with diff/impact/stable). `aidos check demo` runs the demo project
// (all-green) through every law `check` owns; `--red <law_id>` runs that law's
// violating fragment (the red half of the 1-law-1-red-1-green proof). Returns the
// exit code: exitOK when green, exitUsage on an unknown law id, and a non-zero
// breach code (exitBreach) when ≥1 breach is reported.
func runCheck(args []string, stdout io.Writer) int {
	// No operand: keep the S03 declared-contract behaviour (the verb is wired and its
	// future shape is printed). The contract for check is owned by S45.
	if len(args) == 0 {
		c, _ := lookup(string(VerbCheck))
		renderContract(stdout, c)
		return exitOK
	}
	// `demo` is the explicit end-to-end run over the materialized demo project.
	if len(args) == 1 && args[0] == "demo" {
		args = nil
	}

	redLaw, perr := parseRed(args)
	if perr != "" {
		fmt.Fprintf(stdout, "aidos check — %s\n\n", perr)
		fmt.Fprintln(stdout, "Usage : aidos check [--red <law_id>]")
		fmt.Fprintln(stdout, "Lois connues (le registre §82.1 + §29) :")
		for _, id := range sortedLawIDs() {
			fmt.Fprintf(stdout, "  %s\n", id)
		}
		return exitUsage
	}

	breaches := computeBreaches(redLaw)
	renderCheck(stdout, redLaw, breaches)
	if len(breaches) > 0 {
		return exitBreach
	}
	return exitOK
}

// computeBreaches runs every law `check` owns over the graph (the demo project, or —
// when redLaw is set — that law's red fragment). The result is ordered by registry
// order then code, so the output is byte-stable. The laws owned by stable/diff/
// explain are NOT re-run here (they are reached through those verbs); check covers
// the rest. The keystone rule is satisfied: every law is reachable through SOME verb.
func computeBreaches(redLaw lawcoverage.LawID) []lawcoverage.Breach {
	var out []lawcoverage.Breach
	for _, l := range lawcoverage.Laws() {
		if l.OwningVerb != lawcoverage.VerbCheck {
			continue // owned by stable/diff/explain — reached through that verb
		}
		var frag any
		if redLaw == l.ID {
			c, _ := lawcoverage.LookupCell(l.ID)
			frag = c.Red
		} else {
			frag = demoGraph(l.ID)
		}
		if b := l.Detect(frag); b != nil {
			out = append(out, *b)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Code < out[j].Code })
	return out
}

// renderCheck prints the verdict in human language (KRD §82.1). Green when no
// breach; otherwise the ordered list of S13 BlockReasons with code + how_to_fix.
func renderCheck(w io.Writer, redLaw lawcoverage.LawID, breaches []lawcoverage.Breach) {
	if redLaw == "" {
		fmt.Fprintln(w, "aidos check — vérification des lois KRD sur le projet de démonstration (lecture seule)")
	} else {
		fmt.Fprintf(w, "aidos check --red %s — vérification de la loi %s sur son fragment violant (lecture seule)\n", redLaw, redLaw)
	}
	fmt.Fprintln(w, "")

	if len(breaches) == 0 {
		fmt.Fprintln(w, "  verdict : GREEN — aucune loi KRD violée ; le set rouge est vert (§82.1).")
		fmt.Fprintln(w, "\n  (aidos check n'écrit aucune vérité — corriger une loi passe par un /goal.)")
		return
	}

	fmt.Fprintf(w, "  verdict : INVALID — %d loi(s) violée(s) :\n\n", len(breaches))
	for i, b := range breaches {
		fmt.Fprintf(w, "  %d. [%s] %s (loi %s, sévérité %s)\n", i+1, b.Code, b.Explanation, b.Law, b.Severity)
		for _, fix := range b.HowToFix {
			fmt.Fprintf(w, "       → %s\n", fix)
		}
	}
	fmt.Fprintln(w, "\n  (aidos check n'écrit aucune vérité — corriger une loi passe par un /goal.)")
}

// parseRed extracts the optional `--red <law_id>`. Returns an error message
// (non-empty) on a malformed flag or an unknown law id.
func parseRed(args []string) (lawcoverage.LawID, string) {
	if len(args) == 0 {
		return "", ""
	}
	if args[0] != "--red" {
		return "", fmt.Sprintf("argument inattendu %q", args[0])
	}
	if len(args) < 2 {
		return "", "--red attend un law_id"
	}
	id := lawcoverage.LawID(strings.TrimSpace(args[1]))
	if _, ok := lawcoverage.LookupLaw(id); !ok {
		return "", fmt.Sprintf("loi inconnue : %q", args[1])
	}
	return id, ""
}

// sortedLawIDs returns the registry law ids in sorted order (stable usage listing).
func sortedLawIDs() []string {
	laws := lawcoverage.Laws()
	ids := make([]string, 0, len(laws))
	for _, l := range laws {
		ids = append(ids, string(l.ID))
	}
	sort.Strings(ids)
	return ids
}
