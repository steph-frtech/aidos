package blockreason

import (
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// Reproducibility / invariant mirror (rapid, N1): reflects=runtime.blockreason,
// test_kind=invariant, cert_language=rapid, liveness=live, authority=below.
//
// The law of S13 (KRD §44.5): every block must provide a resolution path. Restated
// as the single invariant: for EVERY value of the Code enum, the constructed
// BlockReason has a non-empty severity, a non-empty explanation, and a how_to_fix
// of length >= 1 — there is no code that explains itself with an empty fix path
// (that would re-create the prison). And Render round-trips every field: the code,
// the severity, the explanation, and every fix step appear in the rendering, and
// nothing is invented.
//
// Determinism-first: For and Render are pure total functions — no clock, no rng, no
// I/O — so the same code always yields the same BlockReason and the same rendering.

// genCode draws an arbitrary value from the closed Code enum.
func genCode() *rapid.Generator[Code] {
	return rapid.SampledFrom(Codes())
}

// TestEveryCodeHasNonEmptyResolutionPath: the prison-forbidding invariant.
func TestEveryCodeHasNonEmptyResolutionPath(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		code := genCode().Draw(t, "code")
		br := For(code)

		if br.Code != code {
			t.Fatalf("For(%q).Code = %q, want %q", code, br.Code, code)
		}
		if strings.TrimSpace(string(br.Severity)) == "" {
			t.Fatalf("For(%q) has empty severity", code)
		}
		if strings.TrimSpace(br.Explanation) == "" {
			t.Fatalf("For(%q) has empty explanation", code)
		}
		if len(br.HowToFix) < 1 {
			t.Fatalf("For(%q) has empty how_to_fix — the prison", code)
		}
		for i, step := range br.HowToFix {
			if strings.TrimSpace(step) == "" {
				t.Fatalf("For(%q) how_to_fix[%d] is empty", code, i)
			}
		}
	})
}

// TestRenderRoundTripsEveryField: Render drops nothing and invents no field.
func TestRenderRoundTripsEveryField(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		code := genCode().Draw(t, "code")
		br := For(code)
		out := Render(br)

		if !strings.Contains(out, string(br.Code)) {
			t.Fatalf("Render dropped the code %q; got: %q", br.Code, out)
		}
		if !strings.Contains(out, string(br.Severity)) {
			t.Fatalf("Render dropped the severity %q; got: %q", br.Severity, out)
		}
		if !strings.Contains(out, br.Explanation) {
			t.Fatalf("Render dropped the explanation; got: %q", out)
		}
		for _, step := range br.HowToFix {
			if !strings.Contains(out, step) {
				t.Fatalf("Render dropped a how_to_fix step %q; got: %q", step, out)
			}
		}
	})
}

// TestForIsDeterministic: same code -> byte-identical BlockReason + rendering.
func TestForIsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		code := genCode().Draw(t, "code")
		a := Render(For(code))
		b := Render(For(code))
		if a != b {
			t.Fatalf("Render(For(%q)) not deterministic:\n a=%q\n b=%q", code, a, b)
		}
	})
}

// TestCanonicalFixTokensPresent pins the KRD §44.5 resolution-path tokens to their
// codes, so a refactor cannot silently drop the door each code names.
func TestCanonicalFixTokensPresent(t *testing.T) {
	cases := map[Code]string{
		CodeMissingMirror:    "write_mirror",
		CodeMissingAuthority: "assign_authority",
	}
	for code, token := range cases {
		br := For(code)
		found := false
		for _, step := range br.HowToFix {
			if strings.Contains(step, token) {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("For(%q) how_to_fix does not name %q; got: %v", code, token, br.HowToFix)
		}
	}

	// OUT_OF_SCOPE must name the in-scope target or its owner (no fabricated name).
	scope := For(CodeOutOfScope)
	named := false
	for _, step := range scope.HowToFix {
		l := strings.ToLower(step)
		if strings.Contains(l, "scope") || strings.Contains(l, "périmètre") ||
			strings.Contains(l, "perimetre") || strings.Contains(l, "owner") ||
			strings.Contains(l, "propriétaire") || strings.Contains(l, "proprietaire") {
			named = true
			break
		}
	}
	if !named {
		t.Fatalf("For(OUT_OF_SCOPE) names neither the in-scope target nor its owner; got: %v", scope.HowToFix)
	}
}

// TestForUnknownCodeIsNotConstructed: For only knows the closed enum; an unknown
// code is not in Codes() and Lookup reports it absent (no invented BlockReason).
func TestForUnknownCodeIsNotConstructed(t *testing.T) {
	if _, ok := Lookup("NOPE_NOT_A_CODE"); ok {
		t.Fatal("Lookup invented a BlockReason for an unknown code")
	}
}
