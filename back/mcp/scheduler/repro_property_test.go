// repro_property_test.go — the BA23 REPRODUCIBILITY mirror (rapid, N1). The scheduler MCP
// tick is a thin shell over the PURE Schedule planner: same request ⇒ same dispatch view.
// reflects=runtime.scheduler-dispatch · test_kind=invariant · cert_language=rapid.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the tool is NOT an LLM judgment — it sequences a
// pure function whose `now`/`lease_until` are SUPPLIED. This pins that the MCP path adds no
// nondeterminism: two ticks over the same fresh server + same request yield identical rows,
// assignments, and starvation verdict.
package main

import (
	"context"
	"reflect"
	"testing"

	"pgregory.net/rapid"
)

// freshTick runs one tick over a FRESH server at the given now/lease — the deterministic
// unit the property compares.
func freshTick(now, lease string) tickOutput {
	srv := newServer()
	_, out, _ := srv.tick(context.Background(), nil, tickInput{Now: now, LeaseUntil: lease})
	return out
}

// TestTickIsReproducible — same (now, lease_until) ⇒ identical tick output. The MCP shell
// introduces no clock, rng, or I/O of its own; the planner is the sole decider.
func TestTickIsReproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// a small set of well-formed RFC3339 instants and lease windows.
		now := rapid.SampledFrom([]string{
			"2026-06-03T12:00:00Z",
			"2026-06-03T10:30:00Z",
			"2026-06-03T11:00:00Z",
			"2026-06-04T00:00:00Z",
		}).Draw(rt, "now")
		lease := rapid.SampledFrom([]string{
			"2026-06-03T12:05:00Z",
			"2026-06-03T13:00:00Z",
			"2026-06-04T01:00:00Z",
		}).Draw(rt, "lease")

		a := freshTick(now, lease)
		b := freshTick(now, lease)
		if !reflect.DeepEqual(a, b) {
			rt.Fatalf("tick not reproducible for now=%q lease=%q:\n a=%+v\n b=%+v", now, lease, a, b)
		}
	})
}

// TestTickNeverLeasesABlockedItem — the structural wall invariant carried into the shell:
// a row with unresolved dependencies is never claimed by a tick (the dependency gate).
func TestTickNeverLeasesABlockedItem(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		now := rapid.SampledFrom([]string{
			"2026-06-03T12:00:00Z",
			"2026-06-03T10:00:00Z",
		}).Draw(rt, "now")
		out := freshTick(now, "2026-06-03T13:00:00Z")
		for _, r := range out.Queue {
			if r.Status == "claimed" && len(r.Dependencies) > 0 {
				// a claimed item with deps is only legal if every dep is resolved — the
				// canonical fixture's proj dep (mirror) is open, so it must stay blocked.
				rt.Fatalf("item %q with deps %v was claimed though its deps are unresolved", r.ItemID, r.Dependencies)
			}
		}
	})
}
