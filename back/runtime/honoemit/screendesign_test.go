// screendesign_test.go — LE MIROIR DU DESIGN LAB (Onlook INVERSÉ, ADR 0071), RED→VERT. Property
// tests rapid (le slot property Go gelé) sur des specs/masters arbitraires :
//
//	(a) EmitScreenDesign IDEMPOTENT — même (target, parent, overrides, validated, by) → même ID
//	    (records.Hash content-adressé, le cœur déterminisme-first §6) ;
//	(b) ReproduceScreen BYTE-STABLE — même (master, target, capitalised) → mêmes bytes sur les 3
//	    enfants (la reproduction est l'émetteur, jamais une génération LLM) ;
//	(c) Screen==nil → EmitWeb/Mobile/DesktopChildAdapted BYTE-IDENTIQUES aux non-adaptés (ESP. le
//	    web == EmitWebApp — l'anti-drift §9, le coût (a) de l'ADR) ;
//	(d) ClassifyGesture TOTAL — ∈ {Styling, Structural}, jamais panic ;
//	(e) un StyleToken HORS-CATALOGUE (hex / Tailwind arbitraire) → BlockReason (fail-closed) ;
//	(f) une coordonnée ABSENTE du master → BlockReason nommant la porte /goal (le wall-refusal
//	    honnête, pas un échec) ;
//	(g) CapitaliseScreenDesign(d,v).Capture.WroteKernel() == false TOUJOURS (le mur épinglé, calque
//	    CapitaliseViewAdaptation) ; non-validé → Capitalised=false, requirement vide.
//
// Mêmes entrées → mêmes sorties, sur chaque run et chaque machine.
package honoemit

import (
	"bytes"
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// genChildTarget draws an arbitrary member of the closed {web, mobile, desktop} enum.
func genChildTarget(t *rapid.T) ChildTarget {
	targets := []ChildTarget{ChildWeb, ChildMobile, ChildDesktop}
	return targets[rapid.IntRange(0, len(targets)-1).Draw(t, "target")]
}

// genMasterFromSpec draws a projectable spec and emits its master (the parent the design adapts).
func genMasterFromSpec(t *rapid.T) (MasterView, WebAppSpec) {
	spec := genWebAppSpec(t)
	m, br := EmitMasterView(spec)
	if br != nil {
		t.Fatalf("EmitMasterView refused a projectable spec: %s", br.Explanation)
	}
	return m, spec
}

// genCatalogueToken draws an arbitrary VALID (property, token) pair from the CLOSED ADR-0010 catalogue.
func genCatalogueToken(t *rapid.T) StyleToken {
	props := []string{
		"bg", "text", "border", "radius", "pad", "gap", "align",
		"size", "weight", "shadow", "density", "width", "cols",
	}
	p := props[rapid.IntRange(0, len(props)-1).Draw(t, "prop")]
	toks := styleTokens[p]
	keys := make([]string, 0, len(toks))
	for k := range toks {
		keys = append(keys, k)
	}
	// keys order is map-random; rapid draws an index over the (run-stable within this draw) slice.
	tok := keys[rapid.IntRange(0, len(keys)-1).Draw(t, "tok")]
	return StyleToken{Property: p, Token: tok}
}

// genExistingOverrides draws 0..3 overrides whose coordinates EXIST in the master (a styling-only
// design the emitter must accept). Each carries 0..2 catalogue tokens + an optional label.
func genExistingOverrides(t *rapid.T, m MasterView) []ScreenOverride {
	coords := masterCoords(m)
	if len(coords) == 0 {
		return nil
	}
	n := rapid.IntRange(0, 3).Draw(t, "noverride")
	out := make([]ScreenOverride, 0, n)
	for i := 0; i < n; i++ {
		c := coords[rapid.IntRange(0, len(coords)-1).Draw(t, "coord")]
		nStyle := rapid.IntRange(0, 2).Draw(t, "nstyle")
		styles := make([]StyleToken, 0, nStyle)
		for j := 0; j < nStyle; j++ {
			styles = append(styles, genCatalogueToken(t))
		}
		out = append(out, ScreenOverride{Coord: c, Styles: styles})
	}
	return out
}

// masterCoords enumerates every coordinate the master pins (sections, fields, actions) — the legal
// targets a styling override may adapt.
func masterCoords(m MasterView) []ScreenCoord {
	var out []ScreenCoord
	for _, sec := range m.Sections {
		out = append(out, sectionCoord(sec.Entity))
		for _, f := range sec.Fields {
			out = append(out, fieldCoord(sec.Entity, f))
		}
	}
	for _, act := range m.Actions {
		out = append(out, actionCoord("", act.Control))
	}
	return out
}

// (a) — EmitScreenDesign idempotent : même requirement → même ID (content-adressé, déterministe).
func TestProp_ScreenDesign_Idempotent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m, _ := genMasterFromSpec(t)
		target := genChildTarget(t)
		overrides := genExistingOverrides(t, m)

		d1, br := EmitScreenDesign(m, target, overrides)
		if br != nil {
			t.Fatalf("EmitScreenDesign refused a catalogue-valid design: %s", br.Explanation)
		}
		// Re-emit with the SAME inputs in a DIFFERENT order → the SAME ID (input order never leaks).
		shuffled := append([]ScreenOverride(nil), overrides...)
		if len(shuffled) >= 2 {
			shuffled[0], shuffled[len(shuffled)-1] = shuffled[len(shuffled)-1], shuffled[0]
		}
		d2, br := EmitScreenDesign(m, target, shuffled)
		if br != nil {
			t.Fatalf("EmitScreenDesign refused the shuffled design: %s", br.Explanation)
		}
		if d1.ID == "" {
			t.Fatalf("EmitScreenDesign must content-address the design (empty ID)")
		}
		if d1.ID != d2.ID {
			t.Fatalf("EmitScreenDesign not idempotent: %q != %q (input order leaked)", d1.ID, d2.ID)
		}
		if d1.ParentID != m.Hash() {
			t.Fatalf("ParentID must be the master hash: %q != %q", d1.ParentID, m.Hash())
		}
		if d1.ChildTarget != target {
			t.Fatalf("ChildTarget must be the target: %q != %q", d1.ChildTarget, target)
		}
	})
}

// (b) — ReproduceScreen byte-stable : même (master, target, capitalised) → mêmes bytes (les 3 enfants).
func TestProp_ReproduceScreen_ByteStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m, _ := genMasterFromSpec(t)
		target := genChildTarget(t)
		overrides := genExistingOverrides(t, m)

		// A capitalised design (validated) targeting this child + this master.
		d, br := EmitScreenDesign(m, target, overrides)
		if br != nil {
			t.Fatalf("EmitScreenDesign refused: %s", br.Explanation)
		}
		cap, err := CapitaliseScreenDesign(d, AdaptationValidation{Validated: true, By: "alice"})
		if err != nil {
			t.Fatalf("CapitaliseScreenDesign error: %v", err)
		}
		corpus := []ScreenDesign{cap.Requirement}

		r1, br := ReproduceScreen(m, target, corpus)
		if br != nil {
			// The web child needs ≥1 section to reconstruct a projectable spec; an action-only master
			// is a legal refusal, not a failure (the documented loopback-web limitation).
			if target == ChildWeb && len(m.Sections) == 0 {
				return
			}
			t.Fatalf("ReproduceScreen(%s) refused: %s", target, br.Explanation)
		}
		r2, br := ReproduceScreen(m, target, corpus)
		if br != nil {
			t.Fatalf("ReproduceScreen(%s) refused on re-run: %s", target, br.Explanation)
		}
		assertArtifactsByteEqual(t, r1.Artifacts, r2.Artifacts, "ReproduceScreen not byte-stable")
		if r1.ParentID != m.Hash() {
			t.Fatalf("ReproduceScreen ParentID must be the master hash: %q != %q", r1.ParentID, m.Hash())
		}
	})
}

// (c) — Screen==nil → EmitWeb/Mobile/DesktopChildAdapted byte-identiques au canonique (anti-drift §9).
func TestProp_ScreenNil_ByteIdenticalToCanonical(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m, spec := genMasterFromSpec(t)

		// WEB: EmitWebChildAdapted(spec, {}) == EmitWebApp(spec) byte-for-byte (the load-bearing anti-drift).
		canonWeb, br := EmitWebApp(spec)
		if br != nil {
			t.Fatalf("EmitWebApp refused: %s", br.Explanation)
		}
		adaptedWeb, br := EmitWebChildAdapted(spec, AdaptationOverride{})
		if br != nil {
			t.Fatalf("EmitWebChildAdapted refused: %s", br.Explanation)
		}
		assertArtifactsByteEqual(t, canonWeb, adaptedWeb.Artifacts, "EmitWebChildAdapted(nil) ≠ EmitWebApp (anti-drift)")

		// MOBILE: EmitMobileChildAdapted(m, {}) == EmitMobileChild(m).
		canonMob, br := EmitMobileChild(m)
		if br != nil {
			t.Fatalf("EmitMobileChild refused: %s", br.Explanation)
		}
		adaptedMob, br := EmitMobileChildAdapted(m, MobileAdaptation{})
		if br != nil {
			t.Fatalf("EmitMobileChildAdapted refused: %s", br.Explanation)
		}
		assertArtifactsByteEqual(t, canonMob.Artifacts, adaptedMob.Artifacts, "EmitMobileChildAdapted(nil) ≠ EmitMobileChild")

		// DESKTOP: EmitDesktopChildAdapted(m, {}) == EmitDesktopChild(m).
		canonDesk, br := EmitDesktopChild(m)
		if br != nil {
			t.Fatalf("EmitDesktopChild refused: %s", br.Explanation)
		}
		adaptedDesk, br := EmitDesktopChildAdapted(m, DesktopAdaptation{})
		if br != nil {
			t.Fatalf("EmitDesktopChildAdapted refused: %s", br.Explanation)
		}
		assertArtifactsByteEqual(t, canonDesk.Artifacts, adaptedDesk.Artifacts, "EmitDesktopChildAdapted(nil) ≠ EmitDesktopChild")
	})
}

// (c-bis) — ReproduceScreen with an EMPTY corpus is byte-identical to the canonical child (the
// loopback applies no override → the base form, anti-overwrite §9).
func TestProp_ReproduceScreen_EmptyCorpus_Canonical(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m, _ := genMasterFromSpec(t)

		// Mobile + desktop derive from the master directly (web needs a spec; covered by (c)).
		repMob, br := ReproduceScreen(m, ChildMobile, nil)
		if br != nil {
			t.Fatalf("ReproduceScreen(mobile, empty) refused: %s", br.Explanation)
		}
		canonMob, _ := EmitMobileChild(m)
		assertArtifactsByteEqual(t, canonMob.Artifacts, repMob.Artifacts, "ReproduceScreen(mobile, empty) ≠ EmitMobileChild")

		repDesk, br := ReproduceScreen(m, ChildDesktop, nil)
		if br != nil {
			t.Fatalf("ReproduceScreen(desktop, empty) refused: %s", br.Explanation)
		}
		canonDesk, _ := EmitDesktopChild(m)
		assertArtifactsByteEqual(t, canonDesk.Artifacts, repDesk.Artifacts, "ReproduceScreen(desktop, empty) ≠ EmitDesktopChild")
	})
}

// (d) — ClassifyGesture TOTAL : ∈ {Styling, Structural}, jamais panic, déterministe (même geste →
// même nature) ; un intent structurel gagne TOUJOURS (anti-smuggling, le mur §8).
func TestProp_ClassifyGesture_Total(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g := GestureInput{
			Coord:                ScreenCoord{Kind: CoordSection, Entity: rapid.StringMatching(`[A-Z][a-z]{0,5}`).Draw(t, "ent")},
			AddsField:            rapid.Bool().Draw(t, "adds"),
			RemovesField:         rapid.Bool().Draw(t, "removes"),
			ReordersFields:       rapid.Bool().Draw(t, "reorders"),
			ChangesTextData:      rapid.Bool().Draw(t, "text"),
			ChangesComponentKind: rapid.Bool().Draw(t, "kind"),
		}
		nature := ClassifyGesture(g)
		if nature != NatureStyling && nature != NatureStructural {
			t.Fatalf("ClassifyGesture must be total ∈ {styling, structural}, got %q", nature)
		}
		// Deterministic — same gesture → same nature.
		if ClassifyGesture(g) != nature {
			t.Fatalf("ClassifyGesture not deterministic for the same gesture")
		}
		// Anti-smuggling: ANY structural intent → Structural (a structural can never pass as styling).
		anyStructural := g.AddsField || g.RemovesField || g.ReordersFields || g.ChangesTextData || g.ChangesComponentKind
		if anyStructural && nature != NatureStructural {
			t.Fatalf("a structural intent must classify Structural (smuggling below the line)")
		}
		if !anyStructural && nature != NatureStyling {
			t.Fatalf("a pure styling gesture must classify Styling")
		}
	})
}

// (e) — un StyleToken hors-catalogue (hex / Tailwind arbitraire) → BlockReason (fail-closed).
func TestProp_BadToken_RefusedFailClosed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m, _ := genMasterFromSpec(t)
		coords := masterCoords(m)
		if len(coords) == 0 {
			return
		}
		coord := coords[rapid.IntRange(0, len(coords)-1).Draw(t, "coord")]

		// A token outside the closed catalogue — a hex, an arbitrary Tailwind utility, a typo.
		badTokens := []StyleToken{
			{Property: "bg", Token: "#aabbcc"},  // a hex (forbidden)
			{Property: "text", Token: "[13px]"}, // an arbitrary Tailwind utility (forbidden)
			{Property: "color", Token: "card"},  // an unknown property
			{Property: "radius", Token: "9999"}, // an unknown token for a known property
			{Property: "bg", Token: "blue-600"}, // a raw Tailwind colour, not a semantic token
		}
		bad := badTokens[rapid.IntRange(0, len(badTokens)-1).Draw(t, "bad")]
		if IsKnownStyleToken(bad) {
			t.Fatalf("the catalogue must NOT contain %+v (it would leak a non-token)", bad)
		}

		d, br := EmitScreenDesign(m, ChildWeb, []ScreenOverride{{Coord: coord, Styles: []StyleToken{bad}}})
		if br == nil {
			t.Fatalf("EmitScreenDesign accepted an out-of-catalogue token %+v (fail-closed breached): %+v", bad, d)
		}
		if len(br.HowToFix) == 0 {
			t.Fatalf("the BlockReason must carry a how_to_fix (no prison)")
		}
	})
}

// (f) — une coordonnée ABSENTE du master → BlockReason nommant la porte /goal (le wall-refusal honnête).
func TestProp_AbsentCoord_RefusedNamingGoal(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m, _ := genMasterFromSpec(t)

		// A coordinate the master does NOT pin (a section whose entity is not in the master).
		absent := ScreenCoord{Kind: CoordSection, Entity: "ZZ_absent_entity_zz"}
		if coordExists(m, absent) {
			return // (astronomically unlikely the generator produced this exact name)
		}
		d, br := EmitScreenDesign(m, ChildWeb, []ScreenOverride{{Coord: absent}})
		if br == nil {
			t.Fatalf("EmitScreenDesign accepted an absent coordinate (structural smuggling): %+v", d)
		}
		if len(br.HowToFix) == 0 {
			t.Fatalf("the BlockReason must carry a how_to_fix (no prison)")
		}
		// The refusal NAMES the /goal door (a structural change is idée→miroir→/goal).
		joined := br.Explanation
		for _, h := range br.HowToFix {
			joined += " " + h
		}
		if !bytes.Contains([]byte(joined), []byte("/goal")) {
			t.Fatalf("the structural refusal must name the /goal door; got: %s", joined)
		}
	})
}

// (g) — CapitaliseScreenDesign.WroteKernel TOUJOURS false (le mur épinglé) ; non-validé → rien.
func TestProp_CapitaliseScreenDesign_WallPinned(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m, _ := genMasterFromSpec(t)
		target := genChildTarget(t)
		overrides := genExistingOverrides(t, m)
		d, br := EmitScreenDesign(m, target, overrides)
		if br != nil {
			t.Fatalf("EmitScreenDesign refused: %s", br.Explanation)
		}

		// NON-validated → capitalises NOTHING (fail-closed).
		notVal, err := CapitaliseScreenDesign(d, AdaptationValidation{Validated: false, By: "alice"})
		if err != nil {
			t.Fatalf("CapitaliseScreenDesign(not validated) error: %v", err)
		}
		if notVal.Capitalised {
			t.Fatalf("a NON-validated design must NOT be capitalised")
		}
		if len(notVal.Capture.ProceduralWrites) != 0 || len(notVal.Capture.BehaviorCandidates) != 0 {
			t.Fatalf("a NON-validated design must capitalise nothing via compound")
		}
		if notVal.Capture.WroteKernel() {
			t.Fatalf("WroteKernel must be false (the wall) even for a non-validated design")
		}

		// VALIDATED → capitalised via compound (procedural + behavior), but WROTE NO KERNEL TRUTH.
		val, err := CapitaliseScreenDesign(d, AdaptationValidation{Validated: true, By: "alice"})
		if err != nil {
			t.Fatalf("CapitaliseScreenDesign(validated) error: %v", err)
		}
		if !val.Capitalised {
			t.Fatalf("a VALIDATED design must be capitalised")
		}
		if val.Capture.WroteKernel() {
			t.Fatalf("CapitaliseScreenDesign must write NO kernel truth (the wall épinglé)")
		}
		if val.Requirement.ID == "" {
			t.Fatalf("the capitalised requirement must be content-addressed (non-empty ID)")
		}
		if !val.Requirement.Validated || val.Requirement.By != "alice" {
			t.Fatalf("the capitalised requirement must carry the validation provenance")
		}
		// Idempotent: re-capitalising the SAME validated design yields the SAME ID (append-only).
		val2, _ := CapitaliseScreenDesign(d, AdaptationValidation{Validated: true, By: "alice"})
		if val2.Requirement.ID != val.Requirement.ID {
			t.Fatalf("CapitaliseScreenDesign not idempotent: %q != %q", val2.Requirement.ID, val.Requirement.ID)
		}
	})
}

// ─── TRANCHE 3 : LE CATALOGUE ÉTENDU (typo / élévation / densité / largeur / colonnes) ──────────

// (h) — the EXTENDED catalogue (T3) is CLOSED and renders deterministically. Each new property accepts
// ONLY its declared tokens (a hex / arbitrary utility / a foreign property's token → refused), and the
// rendered class is the deterministic property→prefix (+ the closed alias) — never a free-form utility.
func TestProp_ExtendedCatalogue_ClosedAndRenders(t *testing.T) {
	// Every NEW property × token the style-panel exposes, with its EXPECTED ADR-0010 class (the
	// deterministic render — a golden the front twin mirrors verdict-for-verdict).
	cases := []struct {
		prop, tok, class string
	}{
		{"size", "xs", "text-xs"}, {"size", "sm", "text-sm"}, {"size", "base", "text-base"},
		{"size", "lg", "text-lg"}, {"size", "xl", "text-xl"},
		{"weight", "normal", "font-normal"}, {"weight", "medium", "font-medium"},
		{"weight", "semibold", "font-semibold"}, {"weight", "bold", "font-bold"},
		{"shadow", "none", "shadow-none"}, {"shadow", "sm", "shadow-sm"},
		{"shadow", "md", "shadow-md"}, {"shadow", "lg", "shadow-lg"},
		{"density", "compact", "aidos-density-compact"}, {"density", "cosy", "aidos-density-cosy"},
		{"density", "spacieux", "aidos-density-spacieux"},
		{"width", "full", "w-full"}, {"width", "auto", "w-auto"}, {"width", "fit", "w-fit"},
		{"width", "half", "w-1/2"}, // the alias: "half" → w-1/2 (no "/" in the catalogue token)
		{"cols", "1", "grid-cols-1"}, {"cols", "2", "grid-cols-2"}, {"cols", "3", "grid-cols-3"},
		{"cols", "4", "grid-cols-4"},
	}
	for _, c := range cases {
		tok := StyleToken{Property: c.prop, Token: c.tok}
		if !IsKnownStyleToken(tok) {
			t.Fatalf("the extended catalogue must contain %+v (a declared T3 token)", tok)
		}
		if got := tok.className(); got != c.class {
			t.Fatalf("className(%+v) = %q, want %q (deterministic property→class)", tok, got, c.class)
		}
	}

	// Fail-closed on the extended axes: a hex, an arbitrary utility, a foreign token are all refused.
	bad := []StyleToken{
		{Property: "size", Token: "13px"},      // an arbitrary size, not the closed ramp
		{Property: "weight", Token: "900"},     // a numeric weight, not the closed ramp
		{Property: "shadow", Token: "2xl"},     // a shadow outside the closed scale
		{Property: "density", Token: "ultra"},  // a density outside the closed presets
		{Property: "width", Token: "1/3"},      // an arbitrary width fraction
		{Property: "cols", Token: "12"},        // a column count outside the closed subset
		{Property: "size", Token: "#aabbcc"},   // a hex (always forbidden)
		{Property: "weight", Token: "primary"}, // a colour token on a non-colour property
	}
	for _, b := range bad {
		if IsKnownStyleToken(b) {
			t.Fatalf("the extended catalogue must REFUSE %+v (fail-closed breached)", b)
		}
	}
}

// (i) — a multi-token design over the EXTENDED catalogue is accepted, content-addressed and renders
// every token's class (the style-panel composes a multi-token ScreenDesign; the emitter reproduces it).
func TestProp_ExtendedCatalogue_MultiTokenDesign(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m, _ := genMasterFromSpec(t)
		coords := masterCoords(m)
		if len(coords) == 0 {
			return
		}
		coord := coords[rapid.IntRange(0, len(coords)-1).Draw(t, "coord")]

		// A stack of NEW-catalogue tokens (typography + elevation + density) on one coordinate.
		styles := []StyleToken{
			{Property: "size", Token: "lg"},
			{Property: "weight", Token: "semibold"},
			{Property: "shadow", Token: "md"},
			{Property: "density", Token: "cosy"},
		}
		d, br := EmitScreenDesign(m, ChildWeb, []ScreenOverride{{Coord: coord, Styles: styles}})
		if br != nil {
			t.Fatalf("EmitScreenDesign refused an extended-catalogue multi-token design: %s", br.Explanation)
		}
		if d.ID == "" {
			t.Fatalf("the multi-token design must be content-addressed")
		}
		// The render helper folds every token's class (sorted canonically) — none dropped, none invented.
		suffix := screenClassSuffix(d.Overrides, coord)
		for _, s := range styles {
			if !strings.Contains(suffix, s.className()) {
				t.Fatalf("screenClassSuffix dropped %+v (class %q) from %q", s, s.className(), suffix)
			}
		}
	})
}

// assertArtifactsByteEqual fails unless the two artifact slices are byte-for-byte equal (same paths,
// same bytes, same order — the determinism contract). Internal-package twin of the external helper.
func assertArtifactsByteEqual(t *rapid.T, want, got []Artifact, msg string) {
	if len(want) != len(got) {
		t.Fatalf("%s: artifact count %d != %d", msg, len(got), len(want))
	}
	for i := range want {
		if want[i].Path != got[i].Path {
			t.Fatalf("%s: artifact[%d] path %q != %q", msg, i, got[i].Path, want[i].Path)
		}
		if !bytes.Equal(want[i].Bytes, got[i].Bytes) {
			t.Fatalf("%s: artifact %q not byte-identical", msg, want[i].Path)
		}
	}
}
