package besoin

// candescend.go — EL07: the PURE forcing function of the compound-du-besoin gate.
//
// CanDescend(graph, level, metadata) → Verdict computes — DETERMINISTICALLY, never declared by the
// user or the LLM (anti-Goodhart, CLAUDE.md §8) — whether a level is RIGHT-SIZED enough to descend to
// the next rung. A level is descendable (Verdict.Enough) iff ALL of:
//
//   (a) its body is statable AND NON-VACANT — per the rung's RequiredFields (spec.go, the SINGLE
//       source EL06 also reads) + the rung's parse rules (product ≤ th.MaxScenarios scenarios + an
//       intent; journey: Gherkin with Given/When/Then; view: goal+zones+data; control: visible_when /
//       enabled_when bool-typed + triggers; action: invoke; operation: steps+fixture; entity:
//       attributes; invariant: a ∀ statement);
//   (b) its FOUR metadata are present/certifiable — EL04 CertifyMetadata (REUSED, never re-judged);
//   (c) its outgoing SOURCE ref (spec.go OutgoingRef) RESOLVES @version — here: the node carries a Ref
//       whose To matches the spec's RefTo (EL08 will resolve the concrete @version; EL07 sees the
//       graph). A MISSING deeper ref toward a NOT-YET-EXISTING rung is a forward dependency → carried
//       OpenQuestion + enough=true (bootstrap §6), NEVER a blocking residual;
//   (e) ANTI-VACUITY — ShrinkOptionSpace(graph, level) > 0: a parsable level that does NOT narrow the
//       lower rung's declared OptionSpace (EL06) is not_enough. A body that parses but constrains
//       nothing is REJECTED (anti-gaming). For the declared NON-enumerable pair (operation→entity) the
//       narrowing is satisfied-by-OpenQuestion (the sentinel), never fabricated to 0.
//
// (d) — "contradicts no frozen anchor above" — is owned by EL08's cascade (AnchorsAbove). EL07 reads
// only the BesoinGraph (the wall: the gate reads the need graph, writes no truth — CLAUDE.md §2).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): CanDescend and ShrinkOptionSpace are PURE TOTAL functions of
// (graph, level, metadata) — no clock, no rng, no IO, no LLM. The reproducibility mirror
// (candescend_fixture_test.go) pins same-input→same-output. The verdict is COMPUTED; nobody declares
// "enough".

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// BesoinBlockCode is the closed, besoin-local set of refusal codes the EL07 gate emits. It is a
// SEPARATE, below-the-line enum from blockreason.Code (the kernel-side closed registry): the gate
// reuses the blockreason.BlockReason SHAPE (code/severity/explanation/how_to_fix — KRD §44.5) without
// polluting the global truth-side registry with need-stage codes. Declared, never invented at runtime.
type BesoinBlockCode string

const (
	// CodeNodeAbsent — the level has no node in the graph (nothing to right-size).
	CodeNodeAbsent BesoinBlockCode = "BESOIN_NODE_ABSENT"
	// CodeBodyVacantOrMalformed — gate (a): the body is missing a required field, is over a declared
	// bound (e.g. > th.MaxScenarios), or fails its parse rule (unparsable Gherkin, non-bool condition).
	CodeBodyVacantOrMalformed BesoinBlockCode = "BESOIN_BODY_VACANT_OR_MALFORMED"
	// CodeMetadataIncomplete — gate (b): the four metadata are not all present/certifiable (EL04).
	CodeMetadataIncomplete BesoinBlockCode = "BESOIN_METADATA_INCOMPLETE"
	// CodeRefUnresolved — gate (c): the outgoing SOURCE ref toward an EXISTING lower rung does not
	// resolve (distinct from a forward dependency, which is a carried OpenQuestion, never a block).
	CodeRefUnresolved BesoinBlockCode = "BESOIN_REF_UNRESOLVED"
	// CodeOptionSpaceNotNarrowed — gate (e): ShrinkOptionSpace == 0 — the level parses but narrows
	// nothing (anti-vacuity / anti-gaming).
	CodeOptionSpaceNotNarrowed BesoinBlockCode = "BESOIN_OPTION_SPACE_NOT_NARROWED"
)

// Verdict is the PURE output of CanDescend (the EL07 forcing verdict). Enough is COMPUTED from the
// five gates above — never declared. Missing names the unsatisfied gate fields (human-legible);
// OpenQuestions carries the deeper-level gaps (forward dependencies, bootstrap §6 — non-blocking);
// BlockReasons are the actionable refusals (KRD §44.5 shape) for each failed gate.
type Verdict struct {
	// Enough is true iff every gate passes. COMPUTED, never declared (anti-Goodhart §8).
	Enough bool `json:"enough"`
	// Missing names the gate fields a not_enough verdict failed on (deterministically ordered).
	Missing []string `json:"missing,omitempty"`
	// OpenQuestions are the carried deeper-level gaps (forward dependencies) — non-blocking (§6).
	OpenQuestions []string `json:"open_questions,omitempty"`
	// BlockReasons are the actionable refusals (one per failed gate). Empty when Enough.
	BlockReasons []blockreason.BlockReason `json:"block_reasons,omitempty"`
}

// CanDescend computes the EL07 forcing verdict for `level` in `graph`, given the node's four metadata.
// PURE, TOTAL, DETERMINISTIC. It writes no truth and reads only the BesoinGraph (the wall).
func CanDescend(graph BesoinGraph, level Level, meta Metadata) Verdict {
	var v Verdict

	node, ok := graph.Node(level)
	if !ok {
		return notEnough(v, "node", CodeNodeAbsent,
			fmt.Sprintf("Aucun nœud %q dans le BesoinGraph : il n'y a rien à right-sizer.", level),
			[]string{"declare_level_body", "open the level in the /compound-besoin wizard and state its body"})
	}

	// (a) body statable AND non-vacant.
	if missing, code, expl, fix, ok := checkBody(level, node); !ok {
		v = notEnough(v, missing, code, expl, fix)
	}

	// (b) the four metadata present/certifiable (EL04, reused).
	mv := CertifyMetadata(node, meta)
	if !mv.Complete {
		fix := []string{"declare_missing_metadata"}
		for _, g := range mv.Gaps {
			fix = append(fix, g.HowToFix...)
		}
		v = notEnough(v, "metadata", CodeMetadataIncomplete,
			"Les quatre métadonnées (truth_kind, verifiability, scope, authority) ne sont pas toutes présentes/certifiables (EL04).",
			dedup(fix))
	}

	// (c) outgoing SOURCE ref resolves @version — OR a forward dependency (carried OpenQuestion).
	if oq, missing, code, expl, fix, kind := checkOutgoingRef(level, node); kind == refForwardDep {
		v.OpenQuestions = appendUnique(v.OpenQuestions, oq)
	} else if kind == refUnresolved {
		v = notEnough(v, missing, code, expl, fix)
	}

	// (e) ANTI-VACUITY: the level must narrow the lower rung's OptionSpace.
	if shrink := ShrinkOptionSpace(graph, level); shrink == 0 {
		v = notEnough(v, "option_space", CodeOptionSpaceNotNarrowed,
			"Le niveau parse mais ne rétrécit PAS l'espace d'options du niveau inférieur (anti-vacuité, anti-gaming) : un corps qui ne contraint rien est rejeté.",
			[]string{"narrow_option_space", "déclarez dans `selects` au moins un archétype du niveau inférieur que ce niveau retient"})
	}

	v.Enough = len(v.BlockReasons) == 0
	sort.Strings(v.Missing)
	sort.Strings(v.OpenQuestions)
	return v
}

// notEnough appends a missing field + a BlockReason and returns the updated verdict (Enough stays
// false until the final compute). Pure.
func notEnough(v Verdict, missing string, code BesoinBlockCode, explanation string, howToFix []string) Verdict {
	v.Missing = appendUnique(v.Missing, missing)
	v.BlockReasons = append(v.BlockReasons, blockreason.BlockReason{
		Code:        blockreason.Code(code),
		Severity:    blockreason.SeverityBlocking,
		Explanation: explanation,
		HowToFix:    howToFix,
	})
	return v
}

// --- gate (a): body parse rules -----------------------------------------------------------------

// checkBody verifies the level body is statable and NON-VACANT against the rung's RequiredFields (the
// single source EL06 reads) plus the rung's parse rule. Returns ok=false with an actionable refusal.
func checkBody(level Level, node LevelNode) (missing string, code BesoinBlockCode, expl string, fix []string, ok bool) {
	body, err := decodeBody(node.Body)
	if err != nil {
		return "body", CodeBodyVacantOrMalformed,
			"Le corps du nœud n'est pas un objet JSON valide (corps vacant ou malformé).",
			[]string{"state_body", "déclarez un corps conforme au schéma du niveau"}, false
	}

	// Every declared RequiredField must be present and non-empty — sourced from the SAME thresholds
	// record EL06 owns (RequiredFieldsFor → spec.go RequiredFields), never a second inlined copy.
	for _, f := range DefaultThresholds().RequiredFieldsFor(level) {
		if isEmptyField(body[f]) {
			return "body:" + f, CodeBodyVacantOrMalformed,
				fmt.Sprintf("Le champ requis %q est absent ou vide (corps vacant, EL02 RequiredFields).", f),
				[]string{"declare_field:" + f}, false
		}
	}

	// Per-rung parse rules.
	switch level {
	case LevelProduct:
		th := DefaultThresholds()
		scn, isList := body["scenarios"].([]any)
		if !isList || len(scn) == 0 || len(scn) > th.MaxScenarios {
			return "body:scenarios", CodeBodyVacantOrMalformed,
				fmt.Sprintf("Le product doit déclarer entre 1 et %d scénarios (seuil déclaré EL06, jamais un 5 inliné).", th.MaxScenarios),
				[]string{"right_size_scenarios", fmt.Sprintf("réduisez à ≤ %d scénarios", th.MaxScenarios)}, false
		}
	case LevelJourney:
		// Delegate to the dedicated EL10 validator (single source of truth — one journey rule).
		if r := ValidateJourneySchema(node.Body); !r.Valid {
			return r.Field, CodeBodyVacantOrMalformed,
				r.Reason,
				[]string{"write_parsable_gherkin", "rédigez un scénario Given/When/Then"}, false
		}
	case LevelView:
		// Delegate to the dedicated EL10 validator (single source of truth — one view-schema rule).
		if r := ValidateViewSchema(node.Body); !r.Valid {
			return r.Field, CodeBodyVacantOrMalformed,
				r.Reason,
				[]string{"name_zones_and_data", "déclarez un but, au moins une zone nommée et une donnée nommée"}, false
		}
	case LevelControl:
		if !isBool(body["visible_when"]) || !isBool(body["enabled_when"]) {
			return "body:conditions", CodeBodyVacantOrMalformed,
				"visible_when et enabled_when doivent être typés booléens (un Expr bool, EL02).",
				[]string{"type_conditions_bool", "exprimez visible_when/enabled_when comme des conditions booléennes"}, false
		}
	}
	return "", "", "", nil, true
}

// --- gate (c): outgoing ref resolution ----------------------------------------------------------

type refKind int

const (
	refResolved   refKind = iota // the outgoing ref resolves toward the declared deeper rung.
	refForwardDep                // the deeper rung does not exist yet — a carried OpenQuestion (§6).
	refUnresolved                // the ref SHOULD resolve (the rung exists/expected) but does not.
	refNone                      // the level has no outgoing SOURCE ref (entity leaf, bands).
)

// checkOutgoingRef resolves the level's single outgoing SOURCE ref (spec.go OutgoingRef). A node that
// carries a Ref whose To == spec.RefTo is resolved. A node missing that ref is a FORWARD DEPENDENCY
// when the deeper pair is the declared non-enumerable OptionSpace (operation→entity, the user's open
// domain) — a carried OpenQuestion, enough=true. Otherwise the missing ref is unresolved (a block).
func checkOutgoingRef(level Level, node LevelNode) (openQuestion, missing string, code BesoinBlockCode, expl string, fix []string, kind refKind) {
	refTo, refField, has := OutgoingRef(level)
	if !has {
		return "", "", "", "", nil, refNone // entity leaf or transversal band — no descent ref.
	}
	for _, r := range node.Refs {
		if r.To == refTo {
			return "", "", "", "", nil, refResolved
		}
	}
	// The ref is absent. Is the deeper pair a declared forward dependency (non-enumerable OptionSpace)?
	if os, ok := OptionSpaceFor(level, refTo); ok && !os.Enumerable {
		return fmt.Sprintf("forward-dep: %s→%s non résolu — %s (OpenQuestion portée, bootstrap §6, jamais un résiduel bloquant).", level, refTo, os.OpenQuestion),
			"", "", "", nil, refForwardDep
	}
	return "", "ref:" + refField, CodeRefUnresolved,
		fmt.Sprintf("La référence sortante %q (%s→%s) ne résout pas @version : le niveau inférieur existe/attendu mais n'est pas atteint.", refField, level, refTo),
		[]string{"resolve_ref", fmt.Sprintf("résolvez la référence %q vers le rung %s", refField, refTo)}, refUnresolved
}

// --- (e): ShrinkOptionSpace (anti-vacuity count) -------------------------------------------------

// ShrinkOptionSpace counts how much the level's declared body NARROWS the lower rung's OptionSpace
// (EL06). It is the anti-vacuity metric EL07 consumes as gate (e): a level whose body retains the
// FULL OptionSpace (or selects nothing) shrinks by 0 and is not_enough. The narrowing is a PURE COUNT
// over the declared closed set: shrink = |OptionSpace| − |OptionSpace after the body's `selects`|,
// i.e. the number of archetypes the body PRUNES by selecting a proper non-empty subset.
//
//   - A body selecting k of the N declared choices (1 ≤ k < N) → shrink = N − k > 0 (narrowed).
//   - A body selecting NONE (or only invalid choices) → shrink = 0 (vacant; rejected by (e)).
//   - A body selecting ALL N choices → shrink = 0 (constrains nothing; rejected).
//   - A NON-enumerable pair (operation→entity) → the declared OpenQuestion sentinel
//     (forwardDepShrink > 0) so the forward dependency does NOT fail anti-vacuity (it is carried).
//   - A level with no descent ref (entity leaf, bands) → forwardDepShrink (no lower OptionSpace to
//     narrow; anti-vacuity is vacuously satisfied).
//
// PURE, TOTAL, DETERMINISTIC — no clock/rng/IO/LLM. EL08 will extend this to count BEFORE/AFTER the
// frozen anchors cascade; EL07 owns the minimal per-node narrowing it gates on.
func ShrinkOptionSpace(graph BesoinGraph, level Level) int {
	// forwardDepShrink is the positive sentinel for a pair with no enumerable OptionSpace (or no
	// descent ref): the anti-vacuity gate is satisfied-by-OpenQuestion, never a fabricated narrowing.
	const forwardDepShrink = 1

	refTo, ok := NextLevel(level)
	if !ok {
		return forwardDepShrink // entity leaf — no lower rung to narrow; vacuously satisfied.
	}
	os, found := OptionSpaceFor(level, refTo)
	if !found || !os.Enumerable {
		return forwardDepShrink // declared OpenQuestion (operation→entity) — carried, not failed.
	}

	node, present := graph.Node(level)
	if !present {
		return 0 // no body → narrows nothing.
	}
	body, err := decodeBody(node.Body)
	if err != nil {
		return 0
	}
	selected := stringSet(body["selects"])
	if len(selected) == 0 {
		return 0 // selects nothing → vacant.
	}

	full := map[string]bool{}
	for _, c := range os.Choices {
		full[c] = true
	}
	kept := 0
	for c := range selected {
		if full[c] {
			kept++
		}
	}
	if kept == 0 {
		return 0 // only invalid choices selected → narrows nothing meaningful.
	}
	shrink := len(os.Choices) - kept
	if shrink < 0 {
		shrink = 0 // selecting more than the closed set (duplicates) cannot narrow.
	}
	return shrink
}

// --- pure body helpers --------------------------------------------------------------------------

// decodeBody parses the node body JSONB into a map. An empty body is an empty (non-nil) map.
func decodeBody(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}
	return m, nil
}

// isEmptyField reports whether a body field is absent or "empty" (nil, "", empty list/map).
func isEmptyField(v any) bool {
	switch t := v.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(t) == ""
	case []any:
		return len(t) == 0
	case map[string]any:
		return len(t) == 0
	default:
		return false // a bool/number is a present field (e.g. visible_when:false is non-empty).
	}
}

// isBool reports whether v decoded as a JSON bool (the bool-typed condition rule).
func isBool(v any) bool { _, ok := v.(bool); return ok }

// asString returns v as a string, or "" if it is not a string.
func asString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// isParsableGherkin reports whether a Gherkin body contains at least one Given/When/Then step — the
// minimal parse rule (a deterministic structural check, never an LLM judgment). Case-insensitive.
func isParsableGherkin(g string) bool {
	low := strings.ToLower(g)
	return strings.Contains(low, "given") && strings.Contains(low, "when") && strings.Contains(low, "then")
}

// stringSet decodes a body field that is a JSON list of strings into a set (ignoring non-strings).
func stringSet(v any) map[string]bool {
	out := map[string]bool{}
	list, ok := v.([]any)
	if !ok {
		return out
	}
	for _, e := range list {
		if s, ok := e.(string); ok && strings.TrimSpace(s) != "" {
			out[s] = true
		}
	}
	return out
}

// appendUnique appends s to xs if absent. Pure.
func appendUnique(xs []string, s string) []string {
	for _, x := range xs {
		if x == s {
			return xs
		}
	}
	return append(xs, s)
}

// dedup returns xs with duplicates removed, preserving first-seen order. Pure.
func dedup(xs []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(xs))
	for _, x := range xs {
		if !seen[x] {
			seen[x] = true
			out = append(out, x)
		}
	}
	return out
}
