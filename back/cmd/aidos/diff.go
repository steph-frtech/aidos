package main

import (
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/runtime/semanticdiff"
)

// diff.go wires the S21 behaviour of the `aidos diff` verb: read two kernel
// versions (old@from → new@to) and print the SemanticDiff — the REAL NATURE of a
// change (KRD §44.1 / §82.1), not a textual line diff. It edits only the diff
// command's own surface; the other verbs keep their declared contract.
//
// READ-ONLY (the wall, CLAUDE.md §2): `aidos diff` reads kernel rows via the
// SELECT-only agent role and prints the classification so a HUMAN can decide; it
// NEVER writes truth. Applying a change is the ChangeSet path, owned elsewhere.
//
// Surface (matches the existing stdlib-flag-free positional dispatcher — no second
// CLI framework, ADR-free): `aidos diff <id> --from <version> --to <version>`.
// With no operand it falls back to the S03 declared contract (the help/contract
// projection is unchanged). An unknown id or a missing flag is a usage error
// (exit 2) listing the known ids — never a prison.
//
// THE KERNEL-VERSION READ SOURCE (OpenQuestion OQ-S21-1, a by-design forward
// dependency): the store-query "give me artifact <id>@<version>" is owned by the
// content store / DAG steps (S02/S24). Until that query is wired, `aidos diff`
// reads from a DETERMINISTIC, content-addressed fixture catalogue of the canonical
// §44.1 pairs (the same artifacts the fixture mirror pins) — so the verb is
// replayable and read-only NOW; swapping in the real SELECT-only store read is a
// later tooth that does not change this surface. Classify itself is the authoritative
// pure function; this catalogue only supplies the two versions to compare.
//
// DETERMINISM-FIRST: runDiff is a pure function of (args, stdout) → exit code; the
// classification is semanticdiff.Classify, the single shared classifier the
// Workbench /semantic-diff panel also runs, so the CLI and the screen agree.

// diffPair is one canonical §44.1 example: an id with its two versions and the
// referenced (not recomputed) blast_radius / requires_authority / red_wave the
// SemanticDiff surfaces for the human (KRD §44.1's "speak in human language").
type diffPair struct {
	ID                string
	FromVersion       string
	ToVersion         string
	Old               semanticdiff.Artifact
	New               semanticdiff.Artifact
	BlastRadius       string
	RequiresAuthority string
	RedWave           string
	Sentence          string // the plain-language reading the panel/CLI prints
}

// diffCatalogue is the declared catalogue of the canonical §44.1 pairs, keyed by id,
// in canonical order. The bodies REUSE the fixture mirror's example artifacts
// (checkout-button / refund-policy / help-link); they are the METHOD's examples, not
// invented business rules. The three referenced fields are illustrative references to
// the prior contracts (S15/S16/S17), never recomputed at S21.
var diffCatalogue = []diffPair{
	{
		ID:          "checkout-button",
		FromVersion: "v1",
		ToVersion:   "v2",
		Old:         mustArt(map[string]any{"kind": "control", "name": "checkout-button", "enabled_when": map[string]any{"call": "&&", "args": []any{"$.form.valid", map[string]any{"call": "!", "args": []any{"$.submitting"}}}}}),
		New:         mustArt(map[string]any{"kind": "control", "name": "checkout-button", "enabled_when": "$.form.valid"}),

		BlastRadius:       "checkout-button → checkout-action → createOrder (S17 links)",
		RequiresAuthority: "UX + Product (S16 AuthorityGraph)",
		RedWave:           "the control's state fixture mirror re-opens (S17 red wave)",
		Sentence:          "vous révoquez la promesse enabled_when du bouton checkout (la condition se relâche) — c'est un override, pas un simple ajustement.",
	},
	{
		ID:          "refund-policy",
		FromVersion: "v1",
		ToVersion:   "v2",
		Old:         mustArt(map[string]any{"kind": "truth", "name": "refund-policy", "scope": map[string]any{"cells": []any{"EU"}}}),
		New:         mustArt(map[string]any{"kind": "truth", "name": "refund-policy", "scope": map[string]any{"cells": []any{"EU", "US"}}}),

		BlastRadius:       "refund-policy étendue à la cellule US (S15 TruthScope)",
		RequiresAuthority: "Product + Legal (S16 AuthorityGraph)",
		RedWave:           "les miroirs de refund-policy rejoués sur le scope élargi (S17 red wave)",
		Sentence:          "vous élargissez le scope de refund-policy de EU à EU+US, corps de la règle inchangé — c'est un rescope, pas un override.",
	},
	{
		ID:          "help-link",
		FromVersion: "v1",
		ToVersion:   "v2",
		Old:         mustArt(map[string]any{"kind": "link", "link_kind": "composes", "parent": map[string]any{"id": "checkout", "version": "v1"}, "child": map[string]any{"id": "help-link", "version": "v1"}, "weight": "cosmetic"}),
		New:         mustArt(map[string]any{"kind": "link", "link_kind": "composes", "parent": map[string]any{"id": "checkout", "version": "v1"}, "child": map[string]any{"id": "help-link", "version": "v1"}, "weight": "load-bearing"}),

		BlastRadius:       "le lien composes checkout→help-link (KRD §96)",
		RequiresAuthority: "Product (S16 AuthorityGraph)",
		RedWave:           "l'invariant émergent de checkout peut se ré-ouvrir au-dessus du seuil (S19)",
		Sentence:          "vous requalifiez le poids de help-link de cosmetic à load-bearing — c'est un reweight, une re-qualification d'importance, pas un changement de la règle.",
	},
}

// runDiff handles `aidos diff [<id> --from <v> --to <v>]`. args are the verb's
// operands (without the "diff" verb). Returns the process exit code.
func runDiff(args []string, stdout io.Writer) int {
	if len(args) == 0 {
		c, _ := lookup(string(VerbDiff))
		renderContract(stdout, c)
		return exitOK
	}

	id := strings.TrimSpace(args[0])
	from, to, perr := parseFromTo(args[1:])
	if perr != "" {
		fmt.Fprintf(stdout, "aidos diff — %s\n\n", perr)
		fmt.Fprintln(stdout, "Usage : aidos diff <id> --from <version> --to <version>")
		return exitUsage
	}

	pair, ok := lookupPair(id)
	if !ok {
		fmt.Fprintf(stdout, "aidos diff — id de noyau inconnu : %q\n\n", id)
		fmt.Fprintln(stdout, "Ids connus (les paires canoniques §44.1) :")
		for _, p := range sortedIDs() {
			fmt.Fprintf(stdout, "  %s\n", p)
		}
		fmt.Fprintln(stdout, "\nLancez \"aidos diff <id> --from <version> --to <version>\" pour le SemanticDiff.")
		return exitUsage
	}

	// --from / --to default to the pair's canonical versions when omitted, so the verb
	// is usable with just the id; an explicit mismatch is a usage error (never guessed).
	if from == "" {
		from = pair.FromVersion
	}
	if to == "" {
		to = pair.ToVersion
	}
	if from != pair.FromVersion || to != pair.ToVersion {
		fmt.Fprintf(stdout, "aidos diff — versions inconnues pour %q : --from %q --to %q (connues : --from %q --to %q)\n",
			id, from, to, pair.FromVersion, pair.ToVersion)
		return exitUsage
	}

	// THE classification — the single authoritative pure function (the wall: read-only).
	diff := semanticdiff.Classify(pair.Old, pair.New)
	diff.OldVersion = pair.FromVersion
	diff.NewVersion = pair.ToVersion
	diff.BlastRadius = pair.BlastRadius
	diff.RequiresAuthority = pair.RequiresAuthority
	diff.RedWave = pair.RedWave

	renderDiff(stdout, id, pair, diff)
	return exitOK
}

// renderDiff prints the SemanticDiff in human language (KRD §44.1: not a YAML patch).
func renderDiff(w io.Writer, id string, pair diffPair, diff semanticdiff.SemanticDiff) {
	fmt.Fprintf(w, "aidos diff %s — SemanticDiff %s@%s → %s@%s (lecture seule)\n\n",
		id, id, diff.OldVersion, id, diff.NewVersion)
	fmt.Fprintf(w, "  change_type       : %s\n", diff.ChangeType)
	fmt.Fprintf(w, "  lecture           : %s\n", pair.Sentence)
	fmt.Fprintf(w, "  blast_radius      : %s\n", diff.BlastRadius)
	fmt.Fprintf(w, "  requires_authority: %s\n", diff.RequiresAuthority)
	fmt.Fprintf(w, "  red_wave          : %s\n", diff.RedWave)
	if diff.OpenQuestion != "" {
		fmt.Fprintf(w, "  open_question     : %s\n", diff.OpenQuestion)
	}
	fmt.Fprintln(w, "\n  (aidos diff n'écrit aucune vérité — appliquer un changement passe par un ChangeSet.)")
}

// parseFromTo extracts --from / --to from the flag operands. Returns an error message
// (non-empty) on a malformed flag. Empty values are allowed (defaults apply upstream).
func parseFromTo(flags []string) (from, to, errMsg string) {
	i := 0
	for i < len(flags) {
		switch flags[i] {
		case "--from":
			if i+1 >= len(flags) {
				return "", "", "--from attend une version"
			}
			from = flags[i+1]
			i += 2
		case "--to":
			if i+1 >= len(flags) {
				return "", "", "--to attend une version"
			}
			to = flags[i+1]
			i += 2
		default:
			return "", "", fmt.Sprintf("argument inattendu %q", flags[i])
		}
	}
	return from, to, ""
}

// lookupPair returns the canonical pair for an id.
func lookupPair(id string) (diffPair, bool) {
	for _, p := range diffCatalogue {
		if p.ID == id {
			return p, true
		}
	}
	return diffPair{}, false
}

// sortedIDs returns the catalogue ids in sorted order (stable usage listing).
func sortedIDs() []string {
	ids := make([]string, 0, len(diffCatalogue))
	for _, p := range diffCatalogue {
		ids = append(ids, p.ID)
	}
	sort.Strings(ids)
	return ids
}

// mustArt builds a semanticdiff.Artifact from a Go body (the catalogue is a constant —
// a marshal failure is a build-time bug, so a panic at init is correct here, never a
// runtime Classify crash).
func mustArt(body any) semanticdiff.Artifact {
	b, err := json.Marshal(body)
	if err != nil {
		panic(err)
	}
	return semanticdiff.Artifact{Body: b}
}
