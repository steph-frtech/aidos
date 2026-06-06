// Command verdict — THROWAWAY (EL01 spike). Prints the necessity measurement (BesoinGraph vs flat
// prompt on the S46 checkout) + the COMPUTED go/no-go verdict + the harvested DRAFT Idea. Run:
// go run ./cmd/verdict (from /spike/besoin). Deterministic — same output every run.
package main

import (
	"fmt"

	besoin "aidos.spike/besoin"
)

func main() {
	v := besoin.Decide()
	c := v.Cmp
	fmt.Println("=== EL01 SPIKE — le besoin doit-il suivre l'architecture ? (BesoinGraph vs boîte texte-libre) ===")
	fmt.Printf("besoin: %s\n", c.Need)
	fmt.Printf("  capture       Ideas  resolved  typed  anchored  ordered  NoEmit-seeded\n")
	fmt.Printf("  BesoinGraph   %5d  %8d  %5d  %8d  %7v  %12d\n",
		c.Graph.NumIdeas, c.Graph.NumResolved, c.Graph.NumFullyTyped, c.Graph.NumAnchored, c.Graph.Ordered, c.Graph.NoEmitSeeded)
	fmt.Printf("  FlatPrompt    %5d  %8d  %5d  %8d  %7v  %12d\n",
		c.Flat.NumIdeas, c.Flat.NumResolved, c.Flat.NumFullyTyped, c.Flat.NumAnchored, c.Flat.Ordered, c.Flat.NoEmitSeeded)
	fmt.Printf("  delta Ideas=+%d resolved=+%d typed=+%d anchored=+%d (floor: +%d Ideas)\n",
		c.DeltaIdeas, c.DeltaResolved, c.DeltaFullyTyped, c.DeltaAnchored, v.MinIdeaGain)
	fmt.Printf("  graph_hash=%s flat_hash=%s reproducible=%v\n", c.Graph.Hash, c.Flat.Hash, v.Reproducible)
	fmt.Printf("\nVERDICT: GO=%v\n%s\n", v.Go, v.Rationale)

	d := besoin.Harvest()
	fmt.Printf("\n--- HARVEST (DRAFT candidate-Idea — no mirror, no frozen version) ---\n")
	fmt.Printf("proposes=%s status=%s provenance=%s/%s has_mirror=%v has_version=%v\n",
		d.Proposes, d.Status, d.ProvenanceKind, d.ProvenanceFrom, d.HasMirror, d.HasVersion)
	fmt.Printf("intent: %s\n", d.Intent)
	fmt.Printf("OpenQuestions: %d\n", len(d.OpenQuestions))
	for _, oq := range d.OpenQuestions {
		fmt.Printf("  - %s\n", oq)
	}
}
