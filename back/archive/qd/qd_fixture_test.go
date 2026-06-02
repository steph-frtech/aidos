package qd_test

// N2 FIXTURE MIRROR — conceptually stored in the `mirrors` schema, materialized here for the Go
// runner (the mirrors Postgres schema is back-filled at S06; executable red→green proof,
// CLAUDE.md §6 bootstrap exception).
//
//	# reflects: archive.qd.Elites + archive.qd.Niche · test_kind: fixture · cert_language: operation-dsl/go · authority: above
//
// state (a set of variants: niche, mirror status, anchored fitness) → command (Elites(variants))
// → events (the per-niche élites). These ARE the done criteria (KRD §62, §123):
//   - THE done criterion (QD): a GREEN-mirror variant ⇒ promoted as its single niche élite (one
//     élite per niche, MAP-Elites);
//   - THE anti-Goodhart anchor: a RED-mirror variant with HIGHER fitness ⇒ NOT promoted (the Judge
//     is the deterministic mirror, never the score);
//   - a higher-anchored-fitness green champion replaces the niche élite.
//
// The example niche keys (createOrder/discount, n1) are ILLUSTRATIVE per the spec. The fixture is
// a MEANS-TEST toward the human red (green mirror ⇒ promoted; red mirror ⇒ no promotion) — the
// anchored fitness is consumed, never a rule the agent coins and grades.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/qd"
)

func TestElites_Fixtures(t *testing.T) {
	t.Run("a variant with a green mirror is promoted into its niche", func(t *testing.T) {
		// THE DONE CRITERION (QD): a green-mirror variant ⇒ its niche élite (one per niche).
		variants := []qd.Variant{
			{ID: "var-A", Niche: "createOrder/discount", Mirror: qd.MirrorGreen, Fitness: 0.8},
		}
		elites := qd.Elites(variants)
		got, ok := elites["createOrder/discount"]
		if !ok {
			t.Fatalf("niche createOrder/discount must have an élite")
		}
		if got.ID != "var-A" {
			t.Fatalf("élite = %q, want var-A", got.ID)
		}
		if len(elites) != 1 {
			t.Fatalf("exactly one niche must be filled, got %d", len(elites))
		}
	})

	t.Run("a variant with a RED mirror is NOT promoted, whatever its fitness", func(t *testing.T) {
		// THE anti-Goodhart anchor: a red-mirror variant with 0.99 fitness is NOT promoted — the
		// Judge is the deterministic mirror, NEVER the score.
		variants := []qd.Variant{
			{ID: "var-B", Niche: "createOrder/discount", Mirror: qd.MirrorRed, Fitness: 0.99},
		}
		elites := qd.Elites(variants)
		if _, ok := elites["createOrder/discount"]; ok {
			t.Fatalf("a red-mirror variant must NEVER be a niche élite (no promotion without a green mirror)")
		}
		if len(elites) != 0 {
			t.Fatalf("no niche must be filled by a red-mirror-only candidate, got %d", len(elites))
		}
	})

	t.Run("a champion replaces the niche elite only if it beats it on anchored fitness", func(t *testing.T) {
		// Both green; the higher anchored fitness wins (MAP-Elites — one élite per niche).
		variants := []qd.Variant{
			{ID: "var-A", Niche: "n1", Mirror: qd.MirrorGreen, Fitness: 0.8},
			{ID: "var-C", Niche: "n1", Mirror: qd.MirrorGreen, Fitness: 0.9},
		}
		elites := qd.Elites(variants)
		if elites["n1"].ID != "var-C" {
			t.Fatalf("the higher-anchored-fitness green champion must win, got %q", elites["n1"].ID)
		}
		if len(elites) != 1 {
			t.Fatalf("exactly ONE élite per niche, got %d", len(elites))
		}
	})

	t.Run("a green variant beats a red one of higher fitness in the same niche", func(t *testing.T) {
		// The mirror anchor again, mixed in a niche: the green 0.5 wins over the red 0.99.
		variants := []qd.Variant{
			{ID: "var-hi", Niche: "n1", Mirror: qd.MirrorRed, Fitness: 0.99},
			{ID: "var-lo", Niche: "n1", Mirror: qd.MirrorGreen, Fitness: 0.5},
		}
		elites := qd.Elites(variants)
		if elites["n1"].ID != "var-lo" {
			t.Fatalf("the green variant must win over a higher-fitness RED one, got %q", elites["n1"].ID)
		}
	})

	t.Run("MAP-Elites keeps one élite per distinct niche, not one global champion", func(t *testing.T) {
		// Two niches, each with its own green élite — a Pareto front of cells, never one global best.
		variants := []qd.Variant{
			{ID: "a", Niche: "n1", Mirror: qd.MirrorGreen, Fitness: 0.3},
			{ID: "b", Niche: "n2", Mirror: qd.MirrorGreen, Fitness: 0.9},
		}
		elites := qd.Elites(variants)
		if len(elites) != 2 {
			t.Fatalf("two distinct niches must each keep an élite (diversity), got %d", len(elites))
		}
		if elites["n1"].ID != "a" || elites["n2"].ID != "b" {
			t.Fatalf("each niche keeps its own élite, got n1=%q n2=%q", elites["n1"].ID, elites["n2"].ID)
		}
	})

	t.Run("Niche returns the declared descriptor, total on empty", func(t *testing.T) {
		if qd.Niche(qd.Variant{Niche: "createOrder/discount"}) != "createOrder/discount" {
			t.Fatalf("Niche must return the declared descriptor")
		}
		if qd.Niche(qd.Variant{}) != "" {
			t.Fatalf("Niche must be total on an empty variant")
		}
	})
}
