package besoin

// branchtree.go — EL12: the deterministic, code-authoritative per-level DECISION TREE (the forcing
// gate) + altitude classification by SCHEMA-MISMATCH. The "Example-Mapping" missing from the rest of
// AIDOS, built ABOVE the wall.
//
// THREE PURE TOTAL FUNCTIONS, the LLM excluded (CLAUDE.md §6/§8 determinism-first):
//
//   - BranchTree(level, body) → []OpenBranch — for a given level, the CLOSED set of branches that
//     MUST be closed for the level to be resolved. The criteria are the SAME as EL07 (CanDescend),
//     reading the SAME EL06 thresholds (DefaultThresholds().RequiredFieldsFor): one branch per declared
//     RequiredField, plus the per-rung parse rule, plus the anti-vacuity branch (EL07.e). Each branch
//     records whether the supplied body CLOSES it. No re-forked rule: the closing predicate reuses the
//     same isEmptyField / parse helpers candescend.go uses.
//
//   - IsResolved(graph, level) → ResolveVerdict — all branches closed AND anti-vacuity satisfied
//     (EL07.e: ShrinkOptionSpace > 0). The annex carries the node's truth_kind + verifiability (EL04,
//     CertifyMetadata is REUSED, never re-judged) on each node.
//
//   - ClassifyAltitude(body) → Altitude — the SCHEMA-MISMATCH altitude classifier: a body is routed
//     to the level whose besoin_level_schema (its RequiredFields, spec.go) it BEST satisfies. An entity
//     attribute body submitted at the `product` level FAILS the product schema (a declared field-set
//     mismatch), and is classified at `entity` instead — this is NOT an LLM opinion of altitude, it is
//     a deterministic comparison of declared field sets.
//
// THE WALL (CLAUDE.md §2 + ROADMAP EL12). BranchTree feeds Idea.Intent / the /grill triage, NEVER a
// kernel write. This file reads only the BesoinGraph + the declared thresholds; it writes no truth and
// no mirror. The reproducibility mirrors (branchtree_property_test.go) pin same-input→same-output.

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
)

// BranchKind names the closed set of branch NATURES a level's decision tree carries. Declared, never
// learned (CLAUDE.md §8): a branch is either a required-field branch, the per-rung parse-rule branch,
// or the anti-vacuity (OptionSpace-narrowing) branch.
type BranchKind string

const (
	// BranchRequiredField — a branch that closes when a declared RequiredField (spec.go / EL06) is
	// present and non-empty in the body.
	BranchRequiredField BranchKind = "required_field"
	// BranchParseRule — the per-rung parse rule branch (product ≤ MaxScenarios scenarios; journey
	// Gherkin; view goal+zones+data; control bool-typed conditions). Closes when the rule holds.
	BranchParseRule BranchKind = "parse_rule"
	// BranchAntiVacuity — the EL07.e anti-vacuity branch: closes when the body NARROWS the lower rung's
	// declared OptionSpace (ShrinkOptionSpace > 0). A body that parses but constrains nothing leaves it
	// open.
	BranchAntiVacuity BranchKind = "anti_vacuity"
)

// OpenBranch is one branch of a level's decision tree (the Example-Map cell): a question that must be
// answered ("closed") for the level to be resolved. It is PURE DATA — the Closed flag is computed from
// the supplied body by BranchTree, never declared.
type OpenBranch struct {
	// Level the branch belongs to.
	Level Level `json:"level"`
	// Kind is the branch nature (required_field / parse_rule / anti_vacuity).
	Kind BranchKind `json:"kind"`
	// Field names the body field the branch is about (the RequiredField name, or a synthetic name for
	// the parse-rule / anti-vacuity branches). Stable so the tree is order-independent.
	Field string `json:"field"`
	// Closed is true iff the supplied body satisfies this branch. COMPUTED, never declared.
	Closed bool `json:"closed"`
	// Question is the human-legible branch prompt the /compound-besoin interview asks (the LLM may
	// PHRASE it, but the branch's EXISTENCE and its Closed verdict are code-authoritative).
	Question string `json:"question"`
	// HowToFix is the actionable resolution path for an OPEN branch (empty for a closed branch).
	HowToFix []string `json:"how_to_fix,omitempty"`
}

// BranchTree returns the CLOSED set of decision-tree branches for `level`, each annotated with whether
// the supplied `body` closes it. The branch set is sourced from the SAME EL06 thresholds + per-rung
// parse rules EL07 reads — never a second inlined copy. PURE, TOTAL, DETERMINISTIC: a non-grammar
// level yields nil (fail-closed: an out-of-grammar level has no tree). The returned slice is sorted by
// (kind, field) so the tree is order-independent.
func BranchTree(level Level, body map[string]any) []OpenBranch {
	if !IsLevel(level) {
		return nil // out-of-grammar level: no tree (fail-closed, never an LLM guess).
	}
	if body == nil {
		body = map[string]any{}
	}

	var branches []OpenBranch

	// One branch per declared RequiredField (EL06 RequiredFieldsFor → spec.go RequiredFields).
	for _, f := range DefaultThresholds().RequiredFieldsFor(level) {
		closed := !isEmptyField(body[f])
		var fix []string
		if !closed {
			fix = []string{"declare_field:" + f}
		}
		branches = append(branches, OpenBranch{
			Level:    level,
			Kind:     BranchRequiredField,
			Field:    f,
			Closed:   closed,
			Question: fmt.Sprintf("Le champ requis %q du niveau %s est-il déclaré et non-vide ?", f, level),
			HowToFix: fix,
		})
	}

	// The per-rung parse-rule branch (the SAME rules checkBody applies in EL07).
	if pb, has := parseRuleBranch(level, body); has {
		branches = append(branches, pb)
	}

	// The anti-vacuity branch (EL07.e): only meaningful for a SOURCE rung with a lower rung to narrow.
	// A transversal band has no descent ref → no anti-vacuity branch (vacuously satisfied, like EL07).
	if IsSourceRung(level) {
		branches = append(branches, antiVacuityBranch(level, body))
	}

	sort.Slice(branches, func(a, b int) bool {
		if branches[a].Kind != branches[b].Kind {
			return branches[a].Kind < branches[b].Kind
		}
		return branches[a].Field < branches[b].Field
	})
	return branches
}

// parseRuleBranch builds the per-rung parse-rule branch for a level (product scenario bound; journey
// Gherkin; view schema; control bool-typed conditions), reusing the SAME validators EL07 uses. has is
// false for a level with no parse rule beyond its required fields (action/operation/entity/bands).
func parseRuleBranch(level Level, body map[string]any) (OpenBranch, bool) {
	b := OpenBranch{Level: level, Kind: BranchParseRule}
	switch level {
	case LevelProduct:
		th := DefaultThresholds()
		scn, isList := body["scenarios"].([]any)
		b.Field = "scenarios:bound"
		b.Closed = isList && len(scn) >= 1 && len(scn) <= th.MaxScenarios
		b.Question = fmt.Sprintf("Le product déclare-t-il entre 1 et %d scénarios (seuil EL06) ?", th.MaxScenarios)
		if !b.Closed {
			b.HowToFix = []string{"right_size_scenarios", fmt.Sprintf("réduisez à ≤ %d scénarios", th.MaxScenarios)}
		}
		return b, true
	case LevelJourney:
		r := ValidateJourneySchema(rawOf(body))
		b.Field = "gherkin:parsable"
		b.Closed = r.Valid
		b.Question = "Le journey contient-il un scénario Gherkin parsable (Given/When/Then) ?"
		if !b.Closed {
			b.HowToFix = []string{"write_parsable_gherkin", "rédigez un scénario Given/When/Then"}
		}
		return b, true
	case LevelView:
		r := ValidateViewSchema(rawOf(body))
		b.Field = "view:schema"
		b.Closed = r.Valid
		b.Question = "La vue déclare-t-elle un but, ≥1 zone nommée et ≥1 donnée nommée ?"
		if !b.Closed {
			b.HowToFix = []string{"name_zones_and_data", "déclarez un but, au moins une zone et une donnée nommées"}
		}
		return b, true
	case LevelControl:
		b.Field = "conditions:bool"
		b.Closed = isBool(body["visible_when"]) && isBool(body["enabled_when"])
		b.Question = "visible_when et enabled_when sont-ils typés booléens (Expr bool, EL02) ?"
		if !b.Closed {
			b.HowToFix = []string{"type_conditions_bool", "exprimez visible_when/enabled_when comme des conditions booléennes"}
		}
		return b, true
	}
	return OpenBranch{}, false
}

// antiVacuityBranch builds the EL07.e anti-vacuity branch: closed iff the body NARROWS the lower rung's
// declared OptionSpace (ShrinkOptionSpace via a single-node graph). For the declared non-enumerable
// pair (operation→entity) the narrowing is satisfied-by-OpenQuestion (the forwardDep sentinel >0), so
// the branch is closed (the forward dependency is carried, never fabricated to 0).
func antiVacuityBranch(level Level, body map[string]any) OpenBranch {
	shrink := shrinkOptionSpaceForBody(level, body)
	b := OpenBranch{
		Level:    level,
		Kind:     BranchAntiVacuity,
		Field:    "option_space",
		Closed:   shrink > 0,
		Question: fmt.Sprintf("Le niveau %s rétrécit-il l'espace d'options du rung inférieur (anti-vacuité EL07.e) ?", level),
	}
	if !b.Closed {
		b.HowToFix = []string{"narrow_option_space", "déclarez dans `selects` au moins un archétype du rung inférieur que ce niveau retient"}
	}
	return b
}

// shrinkOptionSpaceForBody mirrors ShrinkOptionSpace but operates on a raw body map (so BranchTree need
// not build a graph). Same declared OptionSpace + same forwardDep sentinel as candescend.go — never a
// forked count.
func shrinkOptionSpaceForBody(level Level, body map[string]any) int {
	const forwardDepShrink = 1
	refTo, ok := NextLevel(level)
	if !ok {
		return forwardDepShrink // entity leaf — no lower rung; vacuously satisfied.
	}
	os, found := OptionSpaceFor(level, refTo)
	if !found || !os.Enumerable {
		return forwardDepShrink // declared OpenQuestion (operation→entity) — carried, not failed.
	}
	selected := stringSet(body["selects"])
	if len(selected) == 0 {
		return 0
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
		return 0
	}
	shrink := len(os.Choices) - kept
	if shrink < 0 {
		shrink = 0
	}
	return shrink
}

// rawOf marshals a body map to JSON for the EL10 validators (which take json.RawMessage). A nil map
// marshals to an empty object; marshal errors yield nil (the validators then report invalid).
func rawOf(body map[string]any) []byte {
	if body == nil {
		return []byte("{}")
	}
	b, err := json.Marshal(body)
	if err != nil {
		return nil
	}
	return b
}

// --- IsResolved -------------------------------------------------------------------------------------

// ResolveVerdict is the PURE output of IsResolved for one level. Resolved is true iff EVERY branch is
// closed AND the anti-vacuity branch is satisfied (EL07.e). It carries the OPEN branches (the
// still-open Example-Map cells) and the EL04 truth_kind + verifiability annex (REUSED, never re-judged).
type ResolveVerdict struct {
	// Level the verdict is about.
	Level Level `json:"level"`
	// Resolved is true iff all branches are closed (the level is right-sized). COMPUTED, never declared.
	Resolved bool `json:"resolved"`
	// OpenBranches are the branches still open (empty when Resolved). Deterministically ordered.
	OpenBranches []OpenBranch `json:"open_branches,omitempty"`
	// AntiVacuitySatisfied is the EL07.e flag (the level narrows the lower rung). Mirrored for legibility.
	AntiVacuitySatisfied bool `json:"anti_vacuity_satisfied"`
	// TruthKind / Verifiability are the EL04 annex (the node's declared metadata), carried onto the
	// verdict so the /grill triage reads the kind alongside the resolution. Empty when not declared.
	TruthKind     truthtyping.TruthKind          `json:"truth_kind,omitempty"`
	Verifiability truthtyping.VerifiabilityLevel `json:"verifiability,omitempty"`
}

// IsResolved computes the EL12 resolution verdict for `level` in `graph`, annexing the node's EL04
// metadata. PURE, TOTAL, DETERMINISTIC. It reads only the BesoinGraph + declared thresholds (the wall).
// A level with no node is NOT resolved (an empty rung leaves every branch open).
func IsResolved(graph BesoinGraph, level Level, meta Metadata) ResolveVerdict {
	v := ResolveVerdict{
		Level:         level,
		TruthKind:     meta.TruthKind,
		Verifiability: meta.Verifiability,
	}
	node, ok := graph.Node(level)
	if !ok {
		// No node: build the tree over an empty body so the OPEN branches are still legible.
		v.OpenBranches = openOnly(BranchTree(level, map[string]any{}))
		v.Resolved = false
		return v
	}
	body, err := decodeBody(node.Body)
	if err != nil {
		body = map[string]any{}
	}
	tree := BranchTree(level, body)
	open := openOnly(tree)
	v.OpenBranches = open
	v.AntiVacuitySatisfied = antiVacuitySatisfied(tree)
	v.Resolved = len(open) == 0
	return v
}

// antiVacuitySatisfied reports whether the tree's anti-vacuity branch is closed (true when the tree has
// no anti-vacuity branch — a transversal band, vacuously satisfied).
func antiVacuitySatisfied(tree []OpenBranch) bool {
	for _, b := range tree {
		if b.Kind == BranchAntiVacuity {
			return b.Closed
		}
	}
	return true
}

// openOnly returns the branches of a tree that are still open, preserving order. Pure.
func openOnly(tree []OpenBranch) []OpenBranch {
	var out []OpenBranch
	for _, b := range tree {
		if !b.Closed {
			out = append(out, b)
		}
	}
	return out
}

// --- ClassifyAltitude (schema-mismatch) -------------------------------------------------------------

// Altitude is the result of the schema-mismatch altitude classification: the level whose declared
// besoin_level_schema (RequiredFields, spec.go) a body BEST satisfies. It is a DETERMINISTIC comparison
// of declared field sets, never an LLM opinion of altitude.
type Altitude struct {
	// Best is the level whose schema the body best matches (the routed altitude). ok=false (Matched
	// false) when the body satisfies NO level's schema (a body that belongs to no rung).
	Best Level `json:"best,omitempty"`
	// Matched is true iff the body fully satisfies at least one level's required-field schema.
	Matched bool `json:"matched"`
	// Scores maps each grammar level → how many of its required fields the body satisfies (the
	// schema-match count). Deterministic; used to surface WHY a body is off-altitude.
	Scores map[Level]int `json:"scores"`
}

// MatchesSchema reports whether `body` satisfies a level's besoin_level_schema: every declared
// RequiredField (spec.go) is present and non-empty. PURE, TOTAL. An off-altitude body (e.g. an entity
// `attributes` body submitted at `product`, which requires `intent`+`scenarios`) returns false — a
// declared field-set MISMATCH, not a judgment.
func MatchesSchema(level Level, body map[string]any) bool {
	req := RequiredFields(level)
	if req == nil {
		return false // not a grammar level: no schema to match (fail-closed).
	}
	if body == nil {
		body = map[string]any{}
	}
	for _, f := range req {
		if isEmptyField(body[f]) {
			return false
		}
	}
	return true
}

// schemaScore counts how many of a level's required fields the body satisfies. Used to rank candidate
// altitudes and to explain an off-altitude body. Pure, total.
func schemaScore(level Level, body map[string]any) int {
	n := 0
	for _, f := range RequiredFields(level) {
		if !isEmptyField(body[f]) {
			n++
		}
	}
	return n
}

// ClassifyAltitude routes a body to the level whose besoin_level_schema it BEST satisfies — the
// deterministic schema-mismatch altitude classification. The candidate is the level the body FULLY
// matches; ties (a body matching several levels' field sets) break toward the DEEPEST rung (the most
// specific schema), since a body carrying e.g. `attributes` is an entity body even if it also carries a
// `product` field. Falls back to Matched=false when no level's schema is fully satisfied. PURE, TOTAL,
// DETERMINISTIC — the LLM never enters.
func ClassifyAltitude(body map[string]any) Altitude {
	if body == nil {
		body = map[string]any{}
	}
	scores := map[Level]int{}
	best := Level("")
	bestRank := -1
	matched := false
	for _, l := range AllLevels() {
		scores[l] = schemaScore(l, body)
		if !MatchesSchema(l, body) {
			continue
		}
		// Full match. Break ties toward the deepest (most specific) SOURCE rung; bands rank after.
		r := levelRank(l)
		if !matched || r > bestRank {
			matched = true
			best = l
			bestRank = r
		}
	}
	return Altitude{Best: best, Matched: matched, Scores: scores}
}

// IsOffAltitude reports whether a body submitted AT `claimed` is off-altitude: it does NOT satisfy the
// claimed level's schema (a declared field-set mismatch). The canonical EL12 example: an entity
// `attributes` body submitted at `product` fails the product schema → off-altitude=true. PURE, TOTAL.
func IsOffAltitude(claimed Level, body map[string]any) bool {
	return !MatchesSchema(claimed, body)
}
