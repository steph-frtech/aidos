package main

import (
	"bytes"
	"strings"
	"testing"
)

// impact_test.go pins the S22 `aidos impact` behaviour (= krd impact, §82.1): it computes and
// prints the red wave (vague de rouge) a kernel bump triggers — mirror-first (§42/§98) — is
// READ-ONLY (it never writes truth and enqueues nothing), and is deterministic (same args ⇒
// byte-identical stdout). It is a means-test toward the human red, not a new truth.

func runImpactArgs(t *testing.T, args ...string) (string, int) {
	t.Helper()
	var buf bytes.Buffer
	code := Run(append([]string{"impact"}, args...), &buf)
	return buf.String(), code
}

// THE done criterion part 1 (CLI surface): an Order entity bump reddens its mirror FIRST then
// api/db/types.
func TestImpact_Order_MirrorFirstThenProjections(t *testing.T) {
	out, code := runImpactArgs(t, "Order")
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	for _, want := range []string{"Order.schema.fixture", "api", "db", "types"} {
		if !strings.Contains(out, want) {
			t.Fatalf("an Order bump must show %q in the wave, got:\n%s", want, out)
		}
	}
	// mirror-first: the mirror line must appear before the api line.
	mi := strings.Index(out, "Order.schema.fixture")
	ai := strings.Index(out, "[projection] api")
	if mi < 0 || ai < 0 || mi > ai {
		t.Fatalf("the mirror must print BEFORE the projections (mirror-first), got:\n%s", out)
	}
}

// THE done criterion part 2 (CLI surface): a load-bearing submit-btn bump reddens checkout-view.
func TestImpact_SubmitBtn_ReddensView(t *testing.T) {
	out, code := runImpactArgs(t, "submit-btn")
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	if !strings.Contains(out, "checkout-view") {
		t.Fatalf("a load-bearing button bump must show checkout-view in the wave, got:\n%s", out)
	}
}

// THE negative (CLI surface): a cosmetic label-btn bump does NOT redden checkout-view.
func TestImpact_LabelBtn_DoesNotReddenView(t *testing.T) {
	out, code := runImpactArgs(t, "label-btn")
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	// The wave must be empty (no view item). The "lecture" sentence names checkout-view
	// to explain the negative, so assert on the wave verdict, not the whole output.
	if !strings.Contains(out, "vague vide") {
		t.Fatalf("a cosmetic button bump must yield an empty wave (no view item), got:\n%s", out)
	}
	if strings.Contains(out, "[button] checkout-view") {
		t.Fatalf("a cosmetic button bump must NOT show a checkout-view wave item, got:\n%s", out)
	}
}

// Unknown source ⇒ usage error (exit 2), listing the known ids — never a prison.
func TestImpact_UnknownSource_Usage(t *testing.T) {
	out, code := runImpactArgs(t, "nope")
	if code != exitUsage {
		t.Fatalf("exit = %d, want %d", code, exitUsage)
	}
	if !strings.Contains(out, "inconnue") || !strings.Contains(out, "Order") {
		t.Fatalf("an unknown source must list known ids, got:\n%s", out)
	}
}

// No operand ⇒ the S03 declared contract (fallback), never a crash.
func TestImpact_NoOperand_FallsBackToContract(t *testing.T) {
	out, code := runImpactArgs(t)
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	if !strings.Contains(out, "aidos impact") {
		t.Fatalf("no operand must print the impact contract, got:\n%s", out)
	}
}

// Determinism: same args ⇒ byte-identical stdout (read-only, no clock/rng).
func TestImpact_Deterministic(t *testing.T) {
	a, _ := runImpactArgs(t, "Order")
	b, _ := runImpactArgs(t, "Order")
	if a != b {
		t.Fatalf("aidos impact must be deterministic:\n%s\n---\n%s", a, b)
	}
}
