package main

import (
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// impact.go wires the S22 behaviour of the `aidos impact` verb (= `krd impact`, KRD §82.1):
// preview the RED WAVE (vague de rouge) a kernel bump triggers — the ordered set of stale
// links and failing mirrors, mirror-first (§42/§98) — without writing anything.
//
// READ-ONLY (the wall, CLAUDE.md §2): `aidos impact` computes the wave from the link graph
// and prints it so a HUMAN can see the blast before applying anything; it NEVER writes truth
// and it does not enqueue (enqueuing is the harness-invoked PostKernelChange hook). Applying a
// change is the ChangeSet path, owned elsewhere.
//
// Surface (matches the existing stdlib-flag-free positional dispatcher — no second CLI
// framework, ADR-free): `aidos impact <id>` where <id> is the bumped kernel source. With no
// operand it falls back to the S03 declared contract. An unknown id is a usage error (exit 2)
// listing the known ids — never a prison.
//
// THE BUMP-SOURCE FEED (OpenQuestion OQ-S22-1, a by-design forward dependency): the runtime
// query "give me the link graph + heads after bumping <id>" is owned by the content store /
// DAG steps (S02/S24). Until that query is wired, `aidos impact` reads from a DETERMINISTIC
// catalogue of the canonical §42 bump examples (the SAME graphs the fixture mirror pins) — so
// the verb is replayable and read-only NOW; swapping in the real store read is a later tooth
// that does not change this surface. redwave.Impact is the authoritative pure function; this
// catalogue only supplies the graph to walk.
//
// DETERMINISM-FIRST: runImpact is a pure function of (args, stdout) → exit code; the wave is
// redwave.Impact, the single shared engine the PostKernelChange hook and the /red-wave panel
// also run, so the CLI and the screen agree.

// impactCase is one canonical §42 bump example: the bumped source, the link graph (edges) it
// reddens, the heads after the bump, and a plain-language reading. The targets REUSE the
// fixture mirror's example artifacts (Order / submit-btn / label-btn) — they are the METHOD's
// examples, not invented business rules.
type impactCase struct {
	ID       string
	Bumped   []string
	Edges    []redwave.Edge
	Heads    links.Heads
	Sentence string
}

func ic(kind links.Kind, from, to string, lb bool, layer redwave.Layer) redwave.Edge {
	return redwave.Edge{
		Link:        links.Link{Kind: kind, From: links.Ref{ID: from, Version: "v1"}, To: links.Ref{ID: to, Version: "v1"}},
		LoadBearing: lb,
		Layer:       layer,
	}
}

// impactCatalogue is the declared catalogue of the canonical §42 bumps, keyed by id, in
// canonical order. The graphs are the fixture mirror's examples (Fixture A/B/C).
var impactCatalogue = []impactCase{
	{
		ID:     "Order",
		Bumped: []string{"Order"},
		Edges: []redwave.Edge{
			ic(links.KindMirrors, "Order.schema.fixture", "Order", true, redwave.LayerMirror),
			ic(links.KindDerivesFrom, "api", "Order", true, redwave.LayerProjection),
			ic(links.KindDerivesFrom, "db", "Order", true, redwave.LayerProjection),
			ic(links.KindDerivesFrom, "types", "Order", true, redwave.LayerProjection),
		},
		Heads:    links.Heads{"Order": "v2"},
		Sentence: "le bump de l'entité Order rouvre d'abord son miroir (Order.schema.fixture), puis ses projections api/db/types — la vague part du miroir (§42/§98).",
	},
	{
		ID:     "submit-btn",
		Bumped: []string{"submit-btn"},
		Edges: []redwave.Edge{
			ic(links.KindDerivesFrom, "checkout-view", "submit-btn", true, redwave.LayerButton),
		},
		Heads:    links.Heads{"submit-btn": "v2"},
		Sentence: "le bump du bouton submit-btn (load-bearing) rougit checkout-view — le rendu de la vue dépend du bouton.",
	},
	{
		ID:     "label-btn",
		Bumped: []string{"label-btn"},
		Edges: []redwave.Edge{
			ic(links.KindDerivesFrom, "checkout-view", "label-btn", false, redwave.LayerButton),
		},
		Heads:    links.Heads{"label-btn": "v2"},
		Sentence: "le bump du bouton label-btn (cosmetic) ne rougit PAS checkout-view — un changement cosmétique ne propage pas (§112).",
	},
}

func lookupImpactCase(id string) (impactCase, bool) {
	for _, c := range impactCatalogue {
		if c.ID == id {
			return c, true
		}
	}
	return impactCase{}, false
}

func sortedImpactIDs() []string {
	ids := make([]string, 0, len(impactCatalogue))
	for _, c := range impactCatalogue {
		ids = append(ids, c.ID)
	}
	sort.Strings(ids)
	return ids
}

// runImpact handles `aidos impact [<id>]`. args are the verb's operands (without the "impact"
// verb). Returns the process exit code.
func runImpact(args []string, stdout io.Writer) int {
	if len(args) == 0 {
		c, _ := lookup(string(VerbImpact))
		renderContract(stdout, c)
		return exitOK
	}

	id := strings.TrimSpace(args[0])
	c, ok := lookupImpactCase(id)
	if !ok {
		fmt.Fprintf(stdout, "aidos impact — source de noyau inconnue : %q\n\n", id)
		fmt.Fprintln(stdout, "Sources connues (les bumps canoniques §42) :")
		for _, s := range sortedImpactIDs() {
			fmt.Fprintf(stdout, "  %s\n", s)
		}
		fmt.Fprintln(stdout, "\nLancez \"aidos impact <id>\" pour prévisualiser la vague de rouge.")
		return exitUsage
	}

	// THE engine — the single authoritative pure function (the wall: read-only, no enqueue).
	wave := redwave.Impact(c.Bumped, c.Edges, c.Heads)
	renderImpact(stdout, id, c, wave)
	return exitOK
}

// renderImpact prints the red wave in human language (KRD §42/§82.1), mirror-first, grouped
// by layer. It is read-only and never enqueues.
func renderImpact(w io.Writer, id string, c impactCase, wave redwave.RedWave) {
	fmt.Fprintf(w, "aidos impact %s — vague de rouge après le bump de %s (lecture seule)\n\n", id, id)
	fmt.Fprintf(w, "  lecture     : %s\n", c.Sentence)
	if wave.IsEmpty() {
		fmt.Fprintln(w, "  vague vide  : aucun lien périmé — rien à rouvrir (§42).")
		fmt.Fprintln(w, "\n  (aidos impact n'écrit aucune vérité et n'enfile rien — l'enfilement passe par le hook PostKernelChange.)")
		return
	}
	fmt.Fprintf(w, "  items       : %d (du miroir vers les projections — mirror-first §42/§98)\n\n", len(wave.Items))
	for i, it := range wave.Items {
		deps := ""
		if len(it.Dependencies) > 0 {
			deps = " ← " + strings.Join(it.Dependencies, ", ")
		}
		fmt.Fprintf(w, "  %d. [%s] %s (%s)%s\n", i+1, it.Layer, it.Target, it.Reason, deps)
	}
	fmt.Fprintln(w, "\n  (aidos impact n'écrit aucune vérité et n'enfile rien — l'enfilement passe par le hook PostKernelChange.)")
}
