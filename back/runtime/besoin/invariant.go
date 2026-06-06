package besoin

// invariant.go — EL14: the transversal band `/besoin-invariant` — the interview of the invariants ∀
// that cross every level ("true on all paths") + the policies where authorization is in play (the
// `policy` band of EL02, with its own gate criteria). It is the LATERAL counterpart of the EL13
// vertical interview: where the descent (product…entity) is the verticale, the invariant/policy band
// CROSSES the rungs — an invariant attached at `operation` also constrains every SOURCE rung ABOVE the
// operation it crosses.
//
// FOUR PURE TOTAL FUNCTIONS, the LLM excluded as authority (CLAUDE.md §6/§8 determinism-first):
//
//   - ParseInvariantBand(body) → (InvariantBand, error) — the deterministic constructor: it types the
//     ∀ statement, refuses an ∃ (a single example masquerading as a universal:
//     INVARIANT_IS_EXAMPLE_NOT_FORALL), validates the attached levels against the grammar, and
//     classifies the band's nature (path_independent / policy). Never an LLM judgment of "is this a
//     ∀": a forall-shaped statement is recognised by a DECLARED lexical predicate (IsForallStatement).
//
//   - CrossedLevels(band) → []Level — the LATERAL constraint set: an invariant attached at a SOURCE
//     rung L constrains L AND every SOURCE rung ABOVE L it crosses (an invariant on `operation` is also
//     a constraint on action/control/view/journey/product). PURE: the cross-product over the descent
//     order, never re-judged.
//
//   - RecordInvariant(graph, body, meta) → InvariantResult — the deterministic recorder of one band
//     turn (the LATERAL analogue of EL13 RecordAnswer): it parses the band, REFUSES an ∃ by code,
//     applies the CIRCULARITY BAN (the skill cannot author an invariant it would then satisfy — §8:
//     the human states the invariant, the code only records and classifies it), routes the band via
//     classify-truth (CertifyMetadata, EL04 — the SAME truthtyping classifier), and on success appends
//     the band node + (for a policy band only) emits AT MOST ONE Idea{Proposes:policy} guidance via
//     the legal idea_capture door. Writes NO truth.
//
//   - BandCompleteness(graph) → BandCompletenessReport — the completeness flag for the band: a SOURCE
//     rung that SHOULD carry an invariant/policy (it is `resolved` and declares it requires one) but
//     does NOT is flagged (NEED_LEVEL_MISSING_INVARIANT). The need-side mirror of check-completeness
//     for the lateral band.
//
// THE WALL (CLAUDE.md §2 + ROADMAP EL14). This file reads only the BesoinGraph + the declared
// thresholds + the three metadata kernel packages (via CertifyMetadata). It writes NO truth and NO
// mirror. The ONLY emission is at most ONE Idea{Proposes:policy} GUIDANCE (the legal idea_capture
// route, provenance human, verbatim utterance) — never an Idea for the ∀ statement itself (an
// invariant's mirror is a property N1, LevelToProposes(invariant)==NoEmit). The reproducibility mirror
// (invariant_property_test.go) pins same-input → same-output.

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// InvariantKind is the closed set of natures a band carries. Declared (CLAUDE.md §8), never learned:
// a band is either a path-independent invariant (∀, true on all paths) or a policy (authorization).
type InvariantKind string

const (
	// InvariantPathIndependent — a ∀ P→Q true on every path; it constrains the crossed levels laterally
	// and is NEVER exemplified (an example is an ∃, refused).
	InvariantPathIndependent InvariantKind = "path_independent"
	// InvariantPolicy — an authorization rule (the `policy` band, EL02): who may do what. It maps to
	// Idea{Proposes:policy}.
	InvariantPolicy InvariantKind = "policy"
)

// InvariantKinds returns the closed set of band kinds in canonical order. Never invented at runtime.
func InvariantKinds() []InvariantKind {
	return []InvariantKind{InvariantPathIndependent, InvariantPolicy}
}

// IsInvariantKind reports whether k is one of the closed band kinds. Pure, total.
func IsInvariantKind(k InvariantKind) bool {
	for _, x := range InvariantKinds() {
		if x == k {
			return true
		}
	}
	return false
}

// InvariantBand models one lateral band of the BesoinGraph (EL14). It carries the ∀ Statement (never
// exemplified), the SOURCE rungs it is AttachedLevels to, its Kind (path_independent | policy), and —
// for a policy band — the optional authorization Rule. It is need-data above the wall: NO Version, NO
// Mirror (the double absence, EL03) — an invariant's mirror is written below the wall via /goal.
type InvariantBand struct {
	// Statement is the ∀ P→Q the human stated. Recognised as a universal by IsForallStatement; an ∃
	// (single example) is refused (INVARIANT_IS_EXAMPLE_NOT_FORALL).
	Statement string `json:"statement"`
	// AttachedLevels are the SOURCE rungs the band attaches to (it crosses them + every rung above).
	// Validated against AttachableTo(invariant|policy, rung); sorted canonically.
	AttachedLevels []Level `json:"attached_levels"`
	// Kind is the band nature (path_independent | policy).
	Kind InvariantKind `json:"kind"`
	// Policy is the authorization rule, present only for a policy band (the `rule` field). Empty for a
	// path-independent invariant.
	Policy string `json:"policy,omitempty"`
}

// bandBlock codes — EL14-local refusal codes, distinct from the EL07 gate codes and the EL09 monster
// codes. Each names exactly one band refusal, surfaced verbatim by the mirror + the Workbench panel.
const (
	// CodeInvariantIsExample — the statement is an ∃ (a single example) masquerading as a ∀: refused.
	CodeInvariantIsExample BesoinBlockCode = "INVARIANT_IS_EXAMPLE_NOT_FORALL"
	// CodeInvariantNoAttachment — the band attaches to no SOURCE rung (a band that crosses nothing).
	CodeInvariantNoAttachment BesoinBlockCode = "INVARIANT_NO_ATTACHMENT"
	// CodeInvariantBadAttachment — the band attaches to a level it may not (AttachableTo refuses it).
	CodeInvariantBadAttachment BesoinBlockCode = "INVARIANT_BAD_ATTACHMENT"
	// CodeInvariantCircular — the recorder was asked to AUTHOR (not record) an invariant — the
	// circularity ban (§8): the skill may not write a ∀ it would then satisfy.
	CodeInvariantCircular BesoinBlockCode = "INVARIANT_CIRCULAR_SELF_AUTHORED"
	// CodeInvariantEmpty — the statement is empty/vacant (nothing to record).
	CodeInvariantEmpty BesoinBlockCode = "INVARIANT_EMPTY_STATEMENT"
)

// forallMarkers is the DECLARED lexical set that marks a universal statement (∀ "for all / pour tout /
// toujours / chaque / tout … / jamais / never"). Declared (CLAUDE.md §8), never an LLM judgment: a
// statement is forall-shaped iff it carries a universal marker. The set is bilingual (FR default + EN).
var forallMarkers = []string{
	"∀",
	"for all", "for every", "for each", "for any",
	"always", "never", "no ", "every ", "all ", "each ", "any ",
	"pour tout", "pour toute", "pour chaque", "toujours", "jamais",
	"chaque ", "tout ", "toute ", "tous ", "toutes ", "aucun", "aucune",
}

// exampleMarkers is the DECLARED lexical set that marks an EXAMPLE (∃ — a single instance): "for
// example / par exemple / e.g. / such as / once / one time". A statement carrying an example marker
// AND no universal marker is an ∃ (refused). Declared, never learned.
var exampleMarkers = []string{
	"for example", "for instance", "e.g.", "such as", "once,", "one time", "this case",
	"par exemple", "par ex.", "une fois", "dans ce cas", "ce cas-ci", "exemple :",
}

// IsForallStatement reports whether a statement is forall-shaped: it carries a universal marker and is
// NOT a single example. PURE, TOTAL, DETERMINISTIC — a DECLARED lexical predicate, never an LLM "is
// this a ∀" judgment (determinism-first: a deterministic option exists, so it is authoritative). An
// empty statement is not a forall.
func IsForallStatement(statement string) bool {
	s := strings.ToLower(strings.TrimSpace(statement))
	if s == "" {
		return false
	}
	// An example marker present WITHOUT any universal marker → an ∃ (not a ∀).
	hasUniversal := false
	for _, m := range forallMarkers {
		if strings.Contains(s, m) {
			hasUniversal = true
			break
		}
	}
	if !hasUniversal {
		return false
	}
	for _, m := range exampleMarkers {
		if strings.Contains(s, m) {
			return false // a universal phrased AS an example is still an example (∃), refused.
		}
	}
	return true
}

// IsExampleStatement reports whether a statement is an ∃ (a single example) rather than a ∀. It is the
// negation of IsForallStatement for a non-empty statement. Pure, total.
func IsExampleStatement(statement string) bool {
	return strings.TrimSpace(statement) != "" && !IsForallStatement(statement)
}

// ParseInvariantBand is the deterministic constructor of an InvariantBand from a raw body map (the LLM
// has paraphrased the human utterance into the fields; the CODE types it). It:
//   - reads `statement` (the ∀) and refuses an empty one (CodeInvariantEmpty);
//   - refuses an ∃ (a single example) — INVARIANT_IS_EXAMPLE_NOT_FORALL;
//   - reads `attached_levels` and validates each against AttachableTo for the band kind;
//   - reads `kind` (path_independent | policy) and `rule` (for a policy band).
//
// PURE, TOTAL, DETERMINISTIC: same body → same (band, error). No clock/rng/IO/LLM. Fail-closed: any
// out-of-grammar or ∃ input is a HARD typed error, never a silent coercion.
func ParseInvariantBand(body map[string]any) (InvariantBand, error) {
	if body == nil {
		body = map[string]any{}
	}
	statement := strings.TrimSpace(asString(body["statement"]))
	if statement == "" {
		return InvariantBand{}, fmt.Errorf("%s: le champ `statement` est vide", CodeInvariantEmpty)
	}
	if IsExampleStatement(statement) {
		return InvariantBand{}, fmt.Errorf("%s: %q est un exemple (∃), pas un invariant universel (∀ P→Q)", CodeInvariantIsExample, statement)
	}

	kind := InvariantKind(asString(body["kind"]))
	if kind == "" {
		// Default nature: a band carrying a `rule`/`policy` is a policy band; otherwise path-independent.
		if asString(body["rule"]) != "" || asString(body["policy"]) != "" {
			kind = InvariantPolicy
		} else {
			kind = InvariantPathIndependent
		}
	}
	if !IsInvariantKind(kind) {
		return InvariantBand{}, fmt.Errorf("%s: kind %q hors des deux natures de bande (path_independent|policy)", ErrUnknownLevel, kind)
	}

	// The band's grammar level: a policy band is the `policy` Level; otherwise the `invariant` Level.
	bandLevel := LevelInvariant
	if kind == InvariantPolicy {
		bandLevel = LevelPolicy
	}

	levels, err := parseAttachedLevels(body["attached_levels"], bandLevel)
	if err != nil {
		return InvariantBand{}, err
	}

	band := InvariantBand{
		Statement:      statement,
		AttachedLevels: levels,
		Kind:           kind,
	}
	if kind == InvariantPolicy {
		rule := strings.TrimSpace(asString(body["rule"]))
		if rule == "" {
			rule = strings.TrimSpace(asString(body["policy"]))
		}
		band.Policy = rule
	}
	return band, nil
}

// parseAttachedLevels resolves the `attached_levels` body field to a sorted, validated, de-duplicated
// slice of SOURCE rungs the band may attach to (AttachableTo for bandLevel). A band attaching to NO
// rung is refused (CodeInvariantNoAttachment); an attachment AttachableTo refuses is a hard error
// (CodeInvariantBadAttachment). Pure, total.
func parseAttachedLevels(raw any, bandLevel Level) ([]Level, error) {
	var names []string
	switch v := raw.(type) {
	case []any:
		for _, x := range v {
			if s, ok := x.(string); ok {
				names = append(names, s)
			}
		}
	case []string:
		names = append(names, v...)
	case string:
		if v != "" {
			names = append(names, v)
		}
	}
	if len(names) == 0 {
		return nil, fmt.Errorf("%s: la bande n'attache aucun rung SOURCE (un invariant doit croiser au moins un niveau)", CodeInvariantNoAttachment)
	}
	seen := map[Level]bool{}
	var out []Level
	for _, n := range names {
		l, err := ParseLevel(n)
		if err != nil {
			return nil, fmt.Errorf("%s: niveau attaché %q invalide: %w", CodeInvariantBadAttachment, n, err)
		}
		attachable, ok := AttachableTo(bandLevel, l)
		if !ok {
			return nil, fmt.Errorf("%s: %q n'est pas une bande transversale", CodeInvariantBadAttachment, bandLevel)
		}
		if !attachable {
			return nil, fmt.Errorf("%s: la bande %q ne peut s'attacher au niveau %q (AttachableTo, EL02)", CodeInvariantBadAttachment, bandLevel, l)
		}
		if seen[l] {
			continue
		}
		seen[l] = true
		out = append(out, l)
	}
	sort.Slice(out, func(a, b int) bool { return levelRank(out[a]) < levelRank(out[b]) })
	return out, nil
}

// CrossedLevels returns the LATERAL constraint set of a band: every SOURCE rung the band constrains.
// An invariant attached at rung L constrains L AND every SOURCE rung strictly ABOVE L (an invariant on
// `operation` is a constraint on action/control/view/journey/product too — "true on all paths" holds
// on every level the path crosses). PURE, TOTAL, DETERMINISTIC — a cross-product over the descent
// order, never re-judged by the LLM. The result is sorted in descent order and de-duplicated.
func CrossedLevels(band InvariantBand) []Level {
	crossed := map[Level]bool{}
	for _, attached := range band.AttachedLevels {
		idx := sourceIndex(attached)
		if idx < 0 {
			continue // defensive: AttachedLevels are validated SOURCE rungs.
		}
		// The attached rung AND every SOURCE rung above it (lower index = higher rung).
		for i := 0; i <= idx; i++ {
			crossed[sourceOrder[i]] = true
		}
	}
	out := make([]Level, 0, len(crossed))
	for l := range crossed {
		out = append(out, l)
	}
	sort.Slice(out, func(a, b int) bool { return levelRank(out[a]) < levelRank(out[b]) })
	return out
}

// ConstrainsLevel reports whether a band laterally constrains a given SOURCE rung (level ∈
// CrossedLevels(band)). Pure, total — the property mirror pins that an invariant on `operation`
// constrains every rung above it.
func ConstrainsLevel(band InvariantBand, level Level) bool {
	for _, l := range CrossedLevels(band) {
		if l == level {
			return true
		}
	}
	return false
}

// InvariantResult is the PURE output of one band turn (RecordInvariant) — the lateral analogue of
// InterviewResult. It carries the NEXT BesoinGraph (band node appended, to be persisted via the EL15
// MCP), the parsed band, the crossed levels (the lateral constraint), the routing, and — for a policy
// band — AT MOST ONE Idea{Proposes:policy} guidance. On a refused turn the Graph is UNCHANGED.
type InvariantResult struct {
	// Graph is the BesoinGraph after the turn — the SAME graph (no mutation) on a refused turn, or a
	// graph with the band node appended on a recorded turn. To be persisted via EL15.
	Graph BesoinGraph `json:"graph"`
	// Band is the parsed band (zero value on a refused turn).
	Band InvariantBand `json:"band"`
	// CrossedLevels are the SOURCE rungs the band laterally constrains. COMPUTED, never re-judged.
	CrossedLevels []Level `json:"crossed_levels,omitempty"`
	// Routing is the COMPUTED routing (record / off_altitude / spike) — reuses the EL13 AnswerRouting
	// closed set so the band and the vertical interview speak one routing language.
	Routing AnswerRouting `json:"routing"`
	// Recorded is true iff the band was appended (Routing == record). COMPUTED, never declared.
	Recorded bool `json:"recorded"`
	// PolicyIdea, for a POLICY band only, is the SINGLE Idea{Proposes:policy} guidance (the legal
	// idea_capture route, provenance human, verbatim utterance). nil for a path-independent invariant
	// (NoEmit — an invariant's mirror is a property N1, not an idea kind). At most ONE per band.
	PolicyIdea *ideas.Idea `json:"policy_idea,omitempty"`
	// SpikeRoute is the legal /spike three-hop route, set ONLY when Routing == spike. Empty otherwise.
	SpikeRoute []string `json:"spike_route,omitempty"`
	// BlockReason names the door when the turn was refused. nil on a recorded turn.
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// RecordInvariant is the deterministic recorder of one band turn. The human STATES the invariant (the
// CIRCULARITY BAN, §8: the skill may not author a ∀ it would then satisfy — selfAuthored=true is
// refused INVARIANT_CIRCULAR_SELF_AUTHORED). The CODE:
//
//  1. CIRCULARITY: if selfAuthored, the turn is REFUSED (the skill cannot self-author an invariant).
//  2. PARSE: ParseInvariantBand types the ∀ and REFUSES an ∃ (INVARIANT_IS_EXAMPLE_NOT_FORALL) and a
//     bad/absent attachment — the graph is unchanged on any parse error.
//  3. FUZZY → /spike: if the band's metadata routes it to /spike (CertifyMetadata.RouteToSpike — an
//     unverifiable verifiability), the turn is ROUTED to /spike via the legal three-hop gate; no record.
//  4. RECORD: otherwise the band node is appended (status drafting). For a POLICY band only, AT MOST
//     ONE Idea{Proposes:policy} guidance is built (provenance human, verbatim utterance). A
//     path-independent invariant emits NO Idea (NoEmit).
//
// PURE, TOTAL, DETERMINISTIC: same (graph, body, utterance, selfAuthored, meta) → same InvariantResult.
// It writes no truth; the returned Graph is to be persisted via the EL15 MCP. The LLM never enters as
// authority.
func RecordInvariant(graph BesoinGraph, body map[string]any, utterance string, selfAuthored bool, meta Metadata) InvariantResult {
	res := InvariantResult{Graph: graph}

	// 1. CIRCULARITY BAN (§8). The skill cannot author an invariant it would then satisfy: only a
	//    human-stated invariant is recordable.
	if selfAuthored {
		br := blockreason.BlockReason{
			Code:        blockreason.Code(CodeInvariantCircular),
			Severity:    blockreason.SeverityBlocking,
			Explanation: "Ban de circularité (§8) : la skill ne peut PAS auteurer un invariant qu'elle satisferait ensuite. L'humain énonce l'invariant ; le code ne fait que l'enregistrer et le classer.",
			HowToFix:    []string{"let_the_human_state_the_invariant"},
		}
		res.Routing = RouteOffAltitude
		res.BlockReason = &br
		return res
	}

	// 2. PARSE — types the ∀, refuses an ∃ and a bad attachment.
	band, err := ParseInvariantBand(body)
	if err != nil {
		br := blockreason.BlockReason{
			Code:        bandCodeOf(err),
			Severity:    blockreason.SeverityBlocking,
			Explanation: err.Error(),
			HowToFix:    bandFixOf(err),
		}
		res.Routing = RouteOffAltitude
		res.BlockReason = &br
		return res
	}
	res.Band = band
	res.CrossedLevels = CrossedLevels(band)

	// 3. FUZZY → /spike. An unverifiable band is routed to /spike via the legal three-hop gate; the
	//    band does NOT record. REUSES CertifyMetadata (EL04) — the SAME truthtyping classifier.
	bandLevel := LevelInvariant
	if band.Kind == InvariantPolicy {
		bandLevel = LevelPolicy
	}
	probe := LevelNode{Level: bandLevel, Body: rawOf(body), Status: NodeDrafting, Provenance: Provenance{Source: "human", Detail: utterance}}
	if CertifyMetadata(probe, meta).RouteToSpike {
		br := blockreason.BlockReason{
			Code:        blockreason.Code(CodeMetadataIncomplete),
			Severity:    blockreason.SeverityBlocking,
			Explanation: "La bande est floue (verifiability unverifiable) : elle est routée vers /spike via idea_capture(draft) → idea_grill → idea_spike, JAMAIS enregistrée. Un invariant non falsifiable ne descend pas.",
			HowToFix:    append([]string{"route_to_spike"}, SpikeGate...),
		}
		res.Routing = RouteSpike
		res.SpikeRoute = append([]string(nil), SpikeGate...)
		res.BlockReason = &br
		return res
	}

	// 4. RECORD. Append the band node (status drafting); the band attaches laterally (its crossed
	//    levels are computed, not stored as edges here — the lateral constraint is read via CrossedLevels).
	next := upsertNode(graph, LevelNode{
		Level:      bandLevel,
		Body:       rawOf(body),
		Provenance: Provenance{Source: "human", Detail: utterance},
		Status:     NodeDrafting,
	})
	res.Graph = next
	res.Routing = RouteRecord
	res.Recorded = true

	// For a POLICY band ONLY: AT MOST ONE Idea{Proposes:policy} guidance, via the legal idea_capture
	// door (provenance human, verbatim utterance). A path-independent invariant emits NO Idea (NoEmit).
	if band.Kind == InvariantPolicy {
		res.PolicyIdea = buildPolicyIdea(graph.Project, band, utterance)
	}
	return res
}

// buildPolicyIdea builds the SINGLE Idea{Proposes:policy} guidance for a policy band, via the legal
// idea_capture shape (provenance human, verbatim utterance, no mirror, no version). It is GUIDANCE: the
// interview returns it for the EL15 MCP to capture; this file writes nothing. The Idea intent is the
// verbatim policy rule (never paraphrased). At most ONE per band — the function returns exactly one.
func buildPolicyIdea(project string, band InvariantBand, utterance string) *ideas.Idea {
	intent := band.Policy
	if strings.TrimSpace(intent) == "" {
		intent = band.Statement
	}
	idea := ideas.Idea{
		Intent:   intent,
		Proposes: ideas.ProposesPolicy,
		Provenance: ideas.Provenance{
			Source: ideas.ProvenanceHuman,
			Detail: utterance,
		},
		Status: ideas.StatusDraft,
	}
	// Content-address the idea (the legal idea_capture shape: provenance human, draft, no mirror, no
	// version). REUSES the kernel content-hash scheme — never a forked address. A marshal error here
	// leaves the ID empty; the body is still the verbatim policy intent.
	if hashed, err := ideas.Hashed(idea); err == nil {
		idea = hashed
	}
	return &idea
}

// bandCodeOf maps a ParseInvariantBand error to its blockreason.Code by inspecting the leading EL14
// band code. Deterministic; falls back to a generic body-malformed code. Pure.
func bandCodeOf(err error) blockreason.Code {
	msg := err.Error()
	for _, c := range []BesoinBlockCode{CodeInvariantIsExample, CodeInvariantNoAttachment, CodeInvariantBadAttachment, CodeInvariantEmpty, CodeInvariantCircular} {
		if strings.Contains(msg, string(c)) {
			return blockreason.Code(c)
		}
	}
	return blockreason.Code(CodeBodyVacantOrMalformed)
}

// bandFixOf maps a ParseInvariantBand error to its actionable how_to_fix steps. Deterministic. Pure.
func bandFixOf(err error) []string {
	msg := err.Error()
	switch {
	case strings.Contains(msg, string(CodeInvariantIsExample)):
		return []string{"state_as_forall", "reformulez en ∀ P→Q (pour tout / toujours / jamais), jamais un exemple unique"}
	case strings.Contains(msg, string(CodeInvariantNoAttachment)):
		return []string{"attach_to_a_source_rung", "nommez au moins un rung SOURCE que l'invariant croise"}
	case strings.Contains(msg, string(CodeInvariantBadAttachment)):
		return []string{"attach_to_an_attachable_rung", "policy → operation/entity ; invariant → tout rung SOURCE (AttachableTo, EL02)"}
	case strings.Contains(msg, string(CodeInvariantEmpty)):
		return []string{"state_the_invariant", "énoncez l'invariant ∀"}
	default:
		return []string{"fix_band_body"}
	}
}

// --- band completeness ------------------------------------------------------------------------------

// BandMonsterCode is the EL14-local completeness code: a SOURCE rung that SHOULD carry an invariant or
// policy but does NOT. Distinct from the EL09 MonsterCode set (which is about the level↔mirror link).
type BandMonsterCode string

const (
	// CodeLevelMissingInvariant — a `resolved` SOURCE rung that DECLARES it requires a crossing
	// invariant/policy (body field `requires_invariant: true`) but no band crosses it: a monster.
	CodeLevelMissingInvariant BandMonsterCode = "NEED_LEVEL_MISSING_INVARIANT"
)

// BandMonster is one detected band-completeness violation: the code + the level it concerns.
type BandMonster struct {
	Code        BandMonsterCode `json:"code"`
	Level       Level           `json:"level"`
	Explanation string          `json:"explanation"`
	HowToFix    []string        `json:"how_to_fix"`
}

// BandCompletenessReport is the PURE output of BandCompleteness: whether every level that SHOULD carry a
// crossing band does, and the monsters (the levels that should but do not). Complete iff no monster.
type BandCompletenessReport struct {
	Complete bool          `json:"complete"`
	Monsters []BandMonster `json:"monsters,omitempty"`
}

// BandCompleteness flags every `resolved` SOURCE rung that DECLARES it requires a crossing
// invariant/policy (its body carries `requires_invariant: true`) but is crossed by NO band in the
// graph. It is the need-side mirror of check-completeness for the lateral band: a level that should
// carry an invariant and does not is a monster (NEED_LEVEL_MISSING_INVARIANT). PURE, TOTAL,
// DETERMINISTIC — counting + matching, never an LLM. Reads only the BesoinGraph above the wall.
func BandCompleteness(graph BesoinGraph) BandCompletenessReport {
	bands := bandsOf(graph)
	var report BandCompletenessReport
	for _, l := range Levels() { // SOURCE rungs only.
		node, ok := graph.Node(l)
		if !ok || node.Status != NodeResolved {
			continue
		}
		body, err := decodeBody(node.Body)
		if err != nil {
			continue
		}
		if !requiresInvariant(body) {
			continue
		}
		if !levelIsCrossed(bands, l) {
			report.Monsters = append(report.Monsters, BandMonster{
				Code:        CodeLevelMissingInvariant,
				Level:       l,
				Explanation: fmt.Sprintf("Le niveau %s est résolu et déclare requérir un invariant/policy croisé, mais aucune bande ne le croise.", l),
				HowToFix:    []string{"record_a_crossing_invariant", fmt.Sprintf("énoncez un ∀ attaché à %s (ou à un rung qu'il croise)", l)},
			})
		}
	}
	sort.Slice(report.Monsters, func(a, b int) bool {
		return levelRank(report.Monsters[a].Level) < levelRank(report.Monsters[b].Level)
	})
	report.Complete = len(report.Monsters) == 0
	return report
}

// requiresInvariant reports whether a node body declares it requires a crossing invariant/policy
// (`requires_invariant: true`). Declared opt-in (CLAUDE.md §8): a level is only flagged when it itself
// states it needs one — never an inferred LLM "should this have an invariant". Pure, total.
func requiresInvariant(body map[string]any) bool {
	v, ok := body["requires_invariant"].(bool)
	return ok && v
}

// bandsOf parses every invariant/policy band node already in the graph (best-effort; a malformed band
// node is skipped — it is caught at record time). Pure helper.
func bandsOf(graph BesoinGraph) []InvariantBand {
	var out []InvariantBand
	for _, l := range TransversalBands() {
		node, ok := graph.Node(l)
		if !ok {
			continue
		}
		body, err := decodeBody(node.Body)
		if err != nil {
			continue
		}
		band, err := ParseInvariantBand(body)
		if err != nil {
			continue
		}
		out = append(out, band)
	}
	return out
}

// levelIsCrossed reports whether any band in the set laterally crosses the given SOURCE rung. Pure.
func levelIsCrossed(bands []InvariantBand, level Level) bool {
	for _, b := range bands {
		if ConstrainsLevel(b, level) {
			return true
		}
	}
	return false
}

// canonicalBand marshals a band to canonical JSON for the property mirror's determinism assertion.
// Errors yield nil. Pure.
func canonicalBand(b InvariantBand) []byte {
	raw, err := json.Marshal(b)
	if err != nil {
		return nil
	}
	return raw
}
