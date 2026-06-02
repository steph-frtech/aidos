package curation_test

// N2 FIXTURE MIRROR — conceptually stored in the `mirrors` schema, materialized here for the Go
// runner (the mirrors Postgres schema is back-filled at S06; this is the executable red→green
// proof, CLAUDE.md §6 bootstrap exception).
//
//	# reflects: archive.curation.Curate (+ archive.qd.Elites in qd_fixture_test.go) · test_kind: fixture · cert_language: operation-dsl/go · authority: above
//
// Each case is the frozen N2 shape: state (a set of DAG nodes + the policy + a passed-in `now`) →
// command (Curate(nodes, policy, now)) → events (the per-node verdicts). These ARE the done
// criteria (KRD §44.4):
//   - THE done criterion: an UNSAFE branch ⇒ TOMBSTONE and the node is STILL PRESENT in the output
//     (append-only, never destroyed), the reason names the unsafe band;
//   - THE done criterion (keep): a stable_phase and a pareto_elite ⇒ KEEP;
//   - a failed variant older than 30d ⇒ COMPRESS (still present);
//   - the recorded decision id == Hash(Canonicalize(body)) (content-addressed, S01/S02 reused).
//
// The example ids (var-7, phase-3, var-9) are ILLUSTRATIVE per the spec — the METHOD's examples,
// not invented business rules. The fixture is a MEANS-TEST toward the human red (unsafe ⇒
// tombstone; élite ⇒ keep) — the §44.4 declared bands are the truth, never a rule the agent
// invents and grades.

import (
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/archive/curation"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

func mustTime(s string) time.Time {
	tm, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return tm
}

// findDecision returns the decision for nodeID, asserting it appears EXACTLY once (append-only,
// no node dropped, no node duplicated).
func findDecision(t *testing.T, ds []curation.CurationDecision, nodeID string) curation.CurationDecision {
	t.Helper()
	var found *curation.CurationDecision
	count := 0
	for i := range ds {
		if ds[i].NodeID == nodeID {
			count++
			found = &ds[i]
		}
	}
	if count != 1 {
		t.Fatalf("node %q must appear EXACTLY once in the output (append-only, never dropped), got %d", nodeID, count)
	}
	return *found
}

func TestCurate_Fixtures(t *testing.T) {
	now := mustTime("2026-05-30T00:00:00Z")
	policy := curation.DefaultPolicy()

	t.Run("an unsafe branch is tombstoned, never deleted", func(t *testing.T) {
		// THE DONE CRITERION (§44.4): an unsafe branch ⇒ tombstone, and the node is STILL PRESENT
		// (a tombstone is a decision row, not a DELETE/DROP — append-only).
		nodes := []curation.Node{{ID: "var-7", Flags: []curation.Flag{curation.FlagUnsafe}}}
		got := curation.Curate(nodes, policy, now)

		d := findDecision(t, got, "var-7")
		if d.Verdict != curation.VerdictTombstone {
			t.Fatalf("var-7 verdict = %q, want tombstone", d.Verdict)
		}
		// the node is STILL PRESENT — Curate produced a decision FOR it, it was not dropped.
		if d.Reason == "" || d.Reason[:9] != "tombstone" {
			t.Fatalf("reason must name the unsafe/tombstone band, got %q", d.Reason)
		}
	})

	t.Run("a stable phase and a pareto elite are kept", func(t *testing.T) {
		// THE DONE CRITERION (keep): a stable_phase node and a pareto_elite ⇒ keep (critical history).
		nodes := []curation.Node{
			{ID: "phase-3", Kind: curation.KindStablePhase},
			{ID: "var-2", Flags: []curation.Flag{curation.FlagParetoElite}},
		}
		got := curation.Curate(nodes, policy, now)

		if findDecision(t, got, "phase-3").Verdict != curation.VerdictKeep {
			t.Fatalf("phase-3 (stable_phase) must be kept")
		}
		if findDecision(t, got, "var-2").Verdict != curation.VerdictKeep {
			t.Fatalf("var-2 (pareto_elite) must be kept")
		}
	})

	t.Run("a failed variant older than 30d is compressed, not destroyed", func(t *testing.T) {
		nodes := []curation.Node{{
			ID:        "var-9",
			Flags:     []curation.Flag{curation.FlagFailed},
			CreatedAt: mustTime("2026-03-01T00:00:00Z"), // ~90 days before now
		}}
		got := curation.Curate(nodes, policy, now)

		d := findDecision(t, got, "var-9")
		if d.Verdict != curation.VerdictCompress {
			t.Fatalf("var-9 (failed >30d) verdict = %q, want compress", d.Verdict)
		}
		// still present — a compress is a decision row, the node is not dropped.
	})

	t.Run("a failed variant younger than 30d is NOT yet compressed", func(t *testing.T) {
		// The age predicate is real: a failed variant created 5 days before now is not yet old
		// enough — it falls to the conservative keep default (nothing dropped early).
		nodes := []curation.Node{{
			ID:        "var-fresh",
			Flags:     []curation.Flag{curation.FlagFailed},
			CreatedAt: mustTime("2026-05-25T00:00:00Z"),
		}}
		got := curation.Curate(nodes, policy, now)
		if findDecision(t, got, "var-fresh").Verdict != curation.VerdictKeep {
			t.Fatalf("a failed variant <30d must not be compressed yet (conservative keep)")
		}
	})

	t.Run("tombstone wins over keep — an unsafe elite is still tombstoned", func(t *testing.T) {
		// Safety precedence: a node that is BOTH a pareto_elite AND unsafe is tombstoned (an unsafe
		// branch is never silently kept).
		nodes := []curation.Node{{
			ID:    "var-danger",
			Flags: []curation.Flag{curation.FlagParetoElite, curation.FlagUnsafe},
		}}
		got := curation.Curate(nodes, policy, now)
		if findDecision(t, got, "var-danger").Verdict != curation.VerdictTombstone {
			t.Fatalf("tombstone must win over keep for an unsafe node")
		}
	})

	t.Run("the recorded decision id is the content hash of its body", func(t *testing.T) {
		// content-addressed (S01/S02 reused): decision.id == Hash(Canonicalize(body)).
		nodes := []curation.Node{{ID: "var-7", Flags: []curation.Flag{curation.FlagUnsafe}}}
		got := curation.Curate(nodes, policy, now)
		d := findDecision(t, got, "var-7")

		hashed, err := d.Hashed(policy.Version)
		if err != nil {
			t.Fatalf("Hashed: %v", err)
		}
		if hashed.ID == "" {
			t.Fatalf("Hashed must stamp a content-address id")
		}

		// Recompute independently via the S02 substrate to prove no forked hash.
		body, err := records.Canonicalize([]byte(`{` +
			`"kind":"phase",` +
			`"node_id":"var-7",` +
			`"policy_version":"` + policy.Version + `",` +
			`"reason":"` + d.Reason + `",` +
			`"verdict":"tombstone"` +
			`}`))
		if err != nil {
			t.Fatalf("canonicalize: %v", err)
		}
		want := records.Hash(body)
		if hashed.ID != want {
			t.Fatalf("decision id = %q, want Hash(Canonicalize(body)) = %q", hashed.ID, want)
		}
	})
}
