package projectwall

import (
	"testing"

	"pgregory.net/rapid"
)

// Property mirror (S55, determinism-first). The cross-project wall is a pure total
// classifier; these invariants pin its behaviour. Run by `go test`.

// TestClassifyPureAndStable — same (scope, target) ⇒ identical Decision (no clock,
// no rng): the reproducibility mirror (CLAUDE.md §6 mandate).
func TestClassifyPureAndStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		id := rapid.StringMatching(`[a-z0-9_]{0,8}`).Draw(t, "id")
		proj := rapid.StringMatching(`[a-z0-9_]{0,8}`).Draw(t, "proj")
		tgt := rapid.StringMatching(`[a-z0-9_]{0,8}`).Draw(t, "tgt")
		claim := rapid.StringMatching(`[a-z0-9_]{0,8}`).Draw(t, "claim")
		s := Scope{Identity: id, ActiveProject: proj}
		tg := Target{ProjectID: tgt, ClaimedIdentity: claim}
		a := Classify(s, tg)
		b := Classify(s, tg)
		if a.Verdict != b.Verdict {
			t.Fatalf("non-deterministic verdict: %v vs %v", a.Verdict, b.Verdict)
		}
		if (a.BlockReason == nil) != (b.BlockReason == nil) {
			t.Fatalf("non-deterministic block reason presence")
		}
	})
}

// TestVerdictBinary — there are exactly two verdicts; a deny ALWAYS carries a
// BlockReason and an allow NEVER does (a wall without a reason is a prison, §2).
func TestVerdictBinary(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := Scope{
			Identity:      rapid.StringMatching(`[a-z]{0,6}`).Draw(t, "id"),
			ActiveProject: rapid.StringMatching(`[a-z]{0,6}`).Draw(t, "proj"),
		}
		tg := Target{
			ProjectID:       rapid.StringMatching(`[a-z]{0,6}`).Draw(t, "tgt"),
			ClaimedIdentity: rapid.StringMatching(`[a-z]{0,6}`).Draw(t, "claim"),
		}
		d := Classify(s, tg)
		switch d.Verdict {
		case VerdictAllow:
			if d.BlockReason != nil {
				t.Fatalf("allow must not carry a BlockReason")
			}
		case VerdictDeny:
			if d.BlockReason == nil {
				t.Fatalf("deny must carry a BlockReason")
			}
			if d.BlockReason.Code != CodeAgentCrossProjectWrite {
				t.Fatalf("deny code = %q, want %q", d.BlockReason.Code, CodeAgentCrossProjectWrite)
			}
		default:
			t.Fatalf("third verdict leaked: %q", d.Verdict)
		}
	})
}

// TestCrossProjectAlwaysDenied — the core isolation invariant: when the scope is
// non-zero, the identity matches, but the target project differs from the active
// project, the op is ALWAYS denied (a project-A scope can never touch a project-B
// row).
func TestCrossProjectAlwaysDenied(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		id := rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "id")
		a := rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "a")
		b := rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "b")
		if a == b {
			b = b + "x" // ensure distinct projects
		}
		d := Classify(Scope{Identity: id, ActiveProject: a}, Target{ProjectID: b})
		if d.Verdict != VerdictDeny {
			t.Fatalf("cross-project A=%q B=%q must deny, got %v", a, b, d.Verdict)
		}
	})
}

// TestSameProjectSameIdentityAllowed — the dual: a non-zero scope, matching
// identity, and a target project equal to the active project is ALWAYS allowed.
func TestSameProjectSameIdentityAllowed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		id := rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "id")
		p := rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "p")
		// inherit identity (empty claim) and explicit matching claim both allow.
		claim := rapid.SampledFrom([]string{"", id}).Draw(t, "claim")
		d := Classify(Scope{Identity: id, ActiveProject: p}, Target{ProjectID: p, ClaimedIdentity: claim})
		if d.Verdict != VerdictAllow {
			t.Fatalf("same project+identity must allow, got %v", d.Verdict)
		}
	})
}

// TestForgedIdentityDenied — the S61 defense-in-depth: a target asserting an
// identity that differs from the active scope identity is denied EVEN when the
// project matches (a forged gateway claim never widens scope).
func TestForgedIdentityDenied(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		id := rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "id")
		forged := rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "forged")
		if forged == id {
			forged = forged + "z"
		}
		p := rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "p")
		d := Classify(Scope{Identity: id, ActiveProject: p}, Target{ProjectID: p, ClaimedIdentity: forged})
		if d.Verdict != VerdictDeny {
			t.Fatalf("forged identity must deny, got %v", d.Verdict)
		}
	})
}

// TestZeroScopeFailsClosed — no active scope (empty identity or empty project) ⇒
// every project-scoped target refused (fail-closed, never an open default).
func TestZeroScopeFailsClosed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		p := rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "p")
		zero := rapid.SampledFrom([]Scope{
			{},
			{Identity: "u"},
			{ActiveProject: "x"},
		}).Draw(t, "zero")
		d := Classify(zero, Target{ProjectID: p})
		if d.Verdict != VerdictDeny {
			t.Fatalf("zero scope must deny a project-scoped target, got %v", d.Verdict)
		}
	})
}

// TestUnscopedTargetPassesThrough — a target naming no project is not this wall's
// concern (the S04 waterline wall governs zone): it is allowed regardless of scope.
func TestUnscopedTargetPassesThrough(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := Scope{
			Identity:      rapid.StringMatching(`[a-z]{0,6}`).Draw(t, "id"),
			ActiveProject: rapid.StringMatching(`[a-z]{0,6}`).Draw(t, "proj"),
		}
		d := Classify(s, Target{ProjectID: ""})
		if d.Verdict != VerdictAllow {
			t.Fatalf("unscoped target must pass through, got %v", d.Verdict)
		}
	})
}
