package main

import (
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/archive/projectdag"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/project"
	"github.com/steph-frtech/aidos/back/runtime/buildconsole"
)

// stable.go wires the S23 behaviour of the `aidos stable` verb (KRD §43 / §82.1): the mechanical
// answer to "is this a stable phase?" = "all links resolved + all green?". It reads the current
// cut (the constraint→version selection, the heads, the links, the latest sensor results) and
// runs the PURE phases.IsStable, then PRINTS the verdict — STABLE, or UNSTABLE with the reasons
// list naming every offending link/sensor — and the phase's content address (the kernel's
// lockfile, S02 reused).
//
// READ-ONLY (the wall, CLAUDE.md §2): `aidos stable` reads via the SELECT-only agent role and
// COMPUTES the verdict; it writes NOTHING. RECORDING the phase node into dag.stable_phase is done
// ONLY through the privileged `aidos` writer role inside an approved ChangeSet — never the agent,
// never from this verb. `aidos stable` shows the verdict; the commit-gate records the node.
//
// THE LIVE-CUT FEED (OpenQuestion OQ-S23-1, a by-design forward dependency — consistent with
// `aidos impact`): the runtime query "give me the current cut + heads + links + latest sensor
// results" is owned by the content store / DAG steps (S02/S24) and the sensor-run reader (S07).
// Until that read is wired, `aidos stable` reads from a DETERMINISTIC catalogue of the canonical
// §43 cuts (the SAME cuts the fixture mirror pins) — so the verb is replayable and read-only NOW;
// swapping in the real store read is a later tooth that does not change this surface.
// phases.IsStable is the authoritative pure function; this catalogue only supplies the cut.
//
// DETERMINISM-FIRST: runStable is a pure function of (args, stdout) → exit code; the verdict is
// phases.IsStable, the single shared engine the /phase-stable panel also runs, so the CLI and the
// screen agree.

// stableCase is one canonical §43 cut: the cut selection, the heads, the links in the cut, the
// sensor snapshot, and a plain-language reading. The targets REUSE the fixture mirror's example
// artifacts (createOrder / checkout-submit / createOrder.fixture) — the METHOD's examples, not
// invented business rules.
type stableCase struct {
	ID       string
	Cut      phases.Cut
	Heads    links.Heads
	Links    []links.Link
	Sensors  []phases.SensorStatus
	Sentence string
}

func binds(from, fromV, to, toV string) links.Link {
	return links.Link{
		Kind: links.KindBinds,
		From: links.Ref{ID: from, Version: fromV},
		To:   links.Ref{ID: to, Version: toV},
	}
}

// stableCatalogue is the declared catalogue of the canonical §43 cuts, keyed by id, in canonical
// order. The cuts are the fixture mirror's examples (empty / all-green / one-red / one-stale).
var stableCatalogue = []stableCase{
	{
		ID:       "empty",
		Cut:      phases.Cut{},
		Heads:    links.Heads{},
		Links:    nil,
		Sensors:  nil,
		Sentence: "la coupe vide est STABLE par vacuité — aucun lien ne pend, rien n'est rouge (le cas de base, §43).",
	},
	{
		ID:       "green",
		Cut:      phases.Cut{"createOrder": "v3"},
		Heads:    links.Heads{"createOrder": "v3"},
		Links:    []links.Link{binds("checkout-submit", "v1", "createOrder", "v3")},
		Sensors:  []phases.SensorStatus{{ID: "createOrder.fixture", Pass: true}},
		Sentence: "tout lien resout (S17 vert) ET tout senseur est vert — la coupe est une phase STABLE (§43).",
	},
	{
		ID:       "red-sensor",
		Cut:      phases.Cut{"createOrder": "v3"},
		Heads:    links.Heads{"createOrder": "v3"},
		Links:    []links.Link{binds("checkout-submit", "v1", "createOrder", "v3")},
		Sensors:  []phases.SensorStatus{{ID: "createOrder.fixture", Pass: false}},
		Sentence: "un seul miroir rouge (le senseur createOrder.fixture) rend la coupe INSTABLE — ce n'est pas une phase stable.",
	},
	{
		ID:       "stale-link",
		Cut:      phases.Cut{"createOrder": "v3"},
		Heads:    links.Heads{"createOrder": "v3"},
		Links:    []links.Link{binds("checkout-submit", "v1", "createOrder", "v2")}, // pinned off-head
		Sensors:  []phases.SensorStatus{{ID: "createOrder.fixture", Pass: true}},
		Sentence: "un lien perime (epingle hors-tete) fait pendre la coupe — INSTABLE (§42).",
	},
}

func lookupStableCase(id string) (stableCase, bool) {
	for _, c := range stableCatalogue {
		if c.ID == id {
			return c, true
		}
	}
	return stableCase{}, false
}

func sortedStableIDs() []string {
	ids := make([]string, 0, len(stableCatalogue))
	for _, c := range stableCatalogue {
		ids = append(ids, c.ID)
	}
	sort.Strings(ids)
	return ids
}

// runStable handles `aidos stable [<id>]`. With no operand it falls back to the S03 declared
// contract. <id> is the canonical cut to evaluate. An unknown id is a usage error (exit 2)
// listing the known cuts — never a prison. Returns the process exit code.
func runStable(args []string, stdout io.Writer) int {
	if len(args) == 0 {
		c, _ := lookup(string(VerbStable))
		renderContract(stdout, c)
		return exitOK
	}

	// S86 — per-project stable-phase recording: `aidos stable <cut> --project <slug>` computes
	// the §43 verdict and, ONLY when it passes, prints the per-project DAG node to record (its
	// id is the phase content-address; its parents are the project's heads). It still records
	// NOTHING above the line (the wall) — the privileged `aidos` writer commits the node inside
	// an approved ChangeSet. An inconsistent cut is REFUSED with STABLE_PHASE_INCONSISTENT_CUT.
	id := strings.TrimSpace(args[0])
	if slug, ok := projectFlag(args[1:]); ok {
		c, found := lookupStableCase(id)
		if !found {
			return unknownCut(stdout, id)
		}
		return runStableProject(slug, id, c, stdout)
	}

	c, ok := lookupStableCase(id)
	if !ok {
		return unknownCut(stdout, id)
	}

	// THE engine — the single authoritative pure function (the wall: read-only, records nothing).
	phase := phases.IsStable(c.Cut, c.Heads, c.Links, c.Sensors)
	renderStable(stdout, id, c, phase)
	return exitOK
}

// unknownCut prints the unknown-cut usage error (exit 2) listing the known cuts — never a prison.
func unknownCut(stdout io.Writer, id string) int {
	fmt.Fprintf(stdout, "aidos stable — coupe inconnue : %q\n\n", id)
	fmt.Fprintln(stdout, "Coupes connues (les coupes canoniques §43) :")
	for _, s := range sortedStableIDs() {
		fmt.Fprintf(stdout, "  %s\n", s)
	}
	fmt.Fprintln(stdout, "\nLancez \"aidos stable <id>\" pour calculer la verdict de stabilite (lecture seule).")
	return exitUsage
}

// projectFlag scans the operands for "--project <slug>" (or "--project=<slug>") and returns
// the slug. Pure; no flag ⇒ ("", false).
func projectFlag(args []string) (string, bool) {
	for i := 0; i < len(args); i++ {
		a := args[i]
		if a == "--project" && i+1 < len(args) {
			return strings.TrimSpace(args[i+1]), true
		}
		if strings.HasPrefix(a, "--project=") {
			return strings.TrimSpace(strings.TrimPrefix(a, "--project=")), true
		}
	}
	return "", false
}

// runStableProject is the S86 per-project recording branch: it computes the §43 verdict for the
// named canonical cut against the project's frontier (buildconsole.RecordStablePhase, the single
// engine) and prints the per-project DAG node to record (when stable) or the refusal (when not).
// READ-ONLY (the wall): it returns the node as a VALUE; the privileged `aidos` writer commits it.
func runStableProject(slug, id string, c stableCase, stdout io.Writer) int {
	p, err := project.New(slug, slug, "aidos-stable", "2026-06-08T00:00:00Z")
	if err != nil {
		fmt.Fprintf(stdout, "aidos stable — projet invalide : %q (%v)\n", slug, err)
		return exitUsage
	}
	pd := projectdag.Genesis(p)

	res := buildconsole.RecordStablePhase(buildconsole.StablePhaseRequest{
		Project: pd,
		Cut:     c.Cut,
		Heads:   c.Heads,
		Links:   c.Links,
		Sensors: c.Sensors,
		Label:   "stable:" + id,
	})

	fmt.Fprintf(stdout, "aidos stable %s --project %s — enregistrement de phase stable par projet (S86)\n\n", id, slug)
	fmt.Fprintf(stdout, "  projet      : %s (frontière DAG isolée, S56)\n", pd.ProjectID())
	fmt.Fprintf(stdout, "  lecture     : %s\n", c.Sentence)

	if res.Recorded {
		fmt.Fprintln(stdout, "  verdict     : STABLE — le verdict S23/S40 passe ; un nœud DAG est enregistrable (§43).")
		fmt.Fprintf(stdout, "  node id     : %s (content-addressed — le lockfile du noyau, S02)\n", res.Node.ID)
		fmt.Fprintf(stdout, "  parents     : %v (descend des heads du projet)\n", res.Node.ParentIDs)
		fmt.Fprintf(stdout, "  label       : %s\n", res.Node.Label)
		fmt.Fprintln(stdout, "\n  (aidos stable n'ecrit aucune verite ; le noeud est enregistre par le role aidos dans un ChangeSet.)")
		return exitOK
	}

	fmt.Fprintln(stdout, "  verdict     : UNSTABLE — la coupe n'est PAS coherente ; AUCUN noeud n'est enregistre.")
	if res.BlockReason != nil {
		fmt.Fprintf(stdout, "  refus       : %s\n", res.BlockReason.Code)
		fmt.Fprintf(stdout, "  explication : %s\n", res.BlockReason.Explanation)
		for _, h := range res.BlockReason.HowToFix {
			fmt.Fprintf(stdout, "    - %s\n", h)
		}
	}
	return exitOK
}

// renderStable prints the stability verdict in human language (KRD §43/§82.1): the cut, the
// STABLE/UNSTABLE verdict, the reasons (offending links/sensors) when unstable, and the phase's
// content address. It is read-only and records nothing.
func renderStable(w io.Writer, id string, c stableCase, phase phases.StablePhase) {
	fmt.Fprintf(w, "aidos stable %s — phase stable ? (la coupe coherente du DAG, lecture seule)\n\n", id)
	fmt.Fprintf(w, "  lecture     : %s\n", c.Sentence)

	if phase.Stable {
		fmt.Fprintln(w, "  verdict     : STABLE — tout lien resout (S17 vert) ET tout senseur est vert (§43).")
	} else {
		fmt.Fprintln(w, "  verdict     : UNSTABLE — au moins un miroir rouge ; ce n'est PAS une phase stable.")
		fmt.Fprintf(w, "  reasons     : %d\n", len(phase.Reasons))
		for _, r := range phase.Reasons {
			fmt.Fprintf(w, "    - %s\n", r)
		}
	}

	if addr, err := phase.Version(); err == nil {
		fmt.Fprintf(w, "  phase id    : %s (content-addressed — le lockfile du noyau, S02)\n", addr)
	}
	fmt.Fprintln(w, "\n  (aidos stable n'ecrit aucune verite ; l'enregistrement du noeud passe par le role aidos dans un ChangeSet.)")
}
