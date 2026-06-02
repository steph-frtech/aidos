package main

import (
	"bytes"
	"strings"
	"testing"
)

// diff_test.go pins the S21 `aidos diff` behaviour: it prints the SemanticDiff
// change_type for the three canonical §44.1 pairs (override / rescope / reweight),
// is READ-ONLY (it never writes truth), and is deterministic (same args ⇒ byte-
// identical stdout). It is a means-test toward the human red, not a new truth.

func runDiffArgs(t *testing.T, args ...string) (string, int) {
	t.Helper()
	var buf bytes.Buffer
	code := Run(append([]string{"diff"}, args...), &buf)
	return buf.String(), code
}

// THE done criterion (CLI surface): the incompatible enabled_when pair is an override.
func TestDiff_CheckoutButton_Override(t *testing.T) {
	out, code := runDiffArgs(t, "checkout-button", "--from", "v1", "--to", "v2")
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	if !strings.Contains(out, "change_type       : override") {
		t.Fatalf("expected override change_type, got:\n%s", out)
	}
}

// THE done criterion (CLI surface): the EU→EU+US scope pair is a rescope (not override).
func TestDiff_RefundPolicy_Rescope(t *testing.T) {
	out, code := runDiffArgs(t, "refund-policy")
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	if !strings.Contains(out, "change_type       : rescope") {
		t.Fatalf("expected rescope change_type, got:\n%s", out)
	}
	if strings.Contains(out, "change_type       : override") {
		t.Fatalf("a scope change must NOT be classified override:\n%s", out)
	}
}

// THE done criterion (CLI surface): the cosmetic→load-bearing pair is a reweight.
func TestDiff_HelpLink_Reweight(t *testing.T) {
	out, code := runDiffArgs(t, "help-link")
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	if !strings.Contains(out, "change_type       : reweight") {
		t.Fatalf("expected reweight change_type, got:\n%s", out)
	}
}

// Read-only: aidos diff prints the human-language reading + the referenced fields, no write.
func TestDiff_HumanLanguageAndReferences(t *testing.T) {
	out, _ := runDiffArgs(t, "checkout-button")
	for _, want := range []string{"lecture", "blast_radius", "requires_authority", "red_wave", "n'écrit aucune vérité"} {
		if !strings.Contains(out, want) {
			t.Fatalf("expected %q in output, got:\n%s", want, out)
		}
	}
}

// Determinism: same args ⇒ byte-identical stdout.
func TestDiff_Deterministic(t *testing.T) {
	a, _ := runDiffArgs(t, "refund-policy", "--from", "v1", "--to", "v2")
	b, _ := runDiffArgs(t, "refund-policy", "--from", "v1", "--to", "v2")
	if a != b {
		t.Fatalf("aidos diff must be deterministic; outputs differ:\n%s\n---\n%s", a, b)
	}
}

// An unknown id is a usage error (exit 2) listing the known ids — never a prison.
func TestDiff_UnknownID_Usage(t *testing.T) {
	out, code := runDiffArgs(t, "nope")
	if code != exitUsage {
		t.Fatalf("exit = %d, want %d", code, exitUsage)
	}
	if !strings.Contains(out, "inconnu") {
		t.Fatalf("expected unknown-id message, got:\n%s", out)
	}
}

// No operand falls back to the declared contract (the S03 projection unchanged).
func TestDiff_NoOperand_Contract(t *testing.T) {
	out, code := runDiffArgs(t)
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	if !strings.Contains(out, "aidos diff") {
		t.Fatalf("expected the diff contract heading, got:\n%s", out)
	}
}
