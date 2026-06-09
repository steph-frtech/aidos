// Package ailab implements FK11 (ROADMAP-fke, FKE-38): the deterministic core of the AI Lab
// COCKPIT — the trialogue screen /ai-lab — as a set of PURE functions. It is the AUTHORITATIVE
// Go side of the cockpit's three panes (the TS twin front/web/lib/ai-lab.ts mirrors it for the
// Workbench). The single load-bearing rule of the whole step (CLAUDE.md §6/§8): every gap, every
// scope, every transition the cockpit shows is a CALCULATION, never an LLM judgment. The cockpit
// COMPOSES the existing truths — the FK09 conscience report (runtime/conscience) — it AUTHORS
// none.
//
// THE TRIALOGUE (FKE-38). Three panes, one screen at two zooms:
//
//   - GAUCHE — the chat scoped to the open node (the "cerveau gauche"). ProposeSlot PROPOSES a
//     slot (amber, status="proposed"); it NEVER writes a truth. A chat message that demands a
//     DIRECT TRUTH WRITE is REFUSED at the wall (IsTruthWriteRequest → a WallRefusal) — the only
//     door is idea → mirror → /goal. A proposed slot is content-addressed + idempotent.
//   - CENTRE — the navigable layer: the kernel + its 1-for-1 anatomy, the WALL drawn between
//     above-the-line (kernel/mirrors, propose-only) and below-the-line (projections/evidence,
//     read-only from the cockpit), and a 🟢/🔴/🟡 voyant per PAIR of every facet (PairTier draws
//     the wall by the judge that produced the pair).
//   - DROITE — the decision cards (FK09) + the blast radius + the red wave + the promotion gate.
//
// VALIDATING A CARD FLIPS A PAIR (the headline done-criterion). ApplyCardValidation with the
// below-the-wall option fix_below_wall flips the addressed pair 🔴→🟢 deterministically and
// RE-RECONCILES the report (the FK09 aggregator recomputes the verdict + cards). An above-the-wall
// option (change_above_wall / block / …) does NOT flip a pair — it OPENS a goal (the wall §2).
//
// CLICKING A PAIR SCOPES LEFT + RIGHT. ScopeForPair resolves a pair key to the deterministic scope
// of the left chat (the facet+pair) and the right cards (those addressing the pair).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function is PURE + TOTAL: no DB, no clock, no rng, no
// I/O, no LLM. Same input ⇒ same output; the reproducibility property is ailab_property_test.go.
// Slot IDs are content-addressed (records.Hash over the canonical body), never a clock/sequence.
// THE WALL (§2): the cockpit core writes NOTHING — every output is a projection; truth-writes go
// idea → mirror → /goal.
package ailab

import (
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/conscience"
)

// WallTier is the side of the wall a cockpit cell sits on (§2): above = propose-only ; below =
// read-only from the cockpit (it acts directly elsewhere).
type WallTier string

const (
	TierAbove WallTier = "above"
	TierBelow WallTier = "below"
)

// Voyant is the per-pair indicator: green / red / amber (advisory or proposed).
type Voyant string

const (
	VoyantGreen Voyant = "green"
	VoyantRed   Voyant = "red"
	VoyantAmber Voyant = "amber"
)

// CodeDirectTruthWrite is the BlockReason code a chat truth-write refusal carries (the wall §2).
const CodeDirectTruthWrite = "AI_LAB_DIRECT_TRUTH_WRITE"

// aboveTheLineSources are the judges whose verdicts address an ABOVE-the-line truth (kernel /
// mirror): the cockpit may only PROPOSE there. Every other source reads BELOW-the-line evidence /
// projections (sensors, reality, ledger) — READ-ONLY from the cockpit. DECLARED — this is how the
// wall is DRAWN per pair. A CLOSED set.
var aboveTheLineSources = map[string]bool{
	"runner":        true,
	"completeness":  true,
	"facet":         true,
	"semantic_diff": true,
}

// PairTier returns the wall tier of a pair from the judge that produced it (pure + total).
func PairTier(source string) WallTier {
	if aboveTheLineSources[source] {
		return TierAbove
	}
	return TierBelow
}

// VoyantFor maps a conscience pair verdict to its cockpit voyant (advisory → amber).
func VoyantFor(verdict string) Voyant {
	switch verdict {
	case "green":
		return VoyantGreen
	case "advisory":
		return VoyantAmber
	default:
		return VoyantRed
	}
}

// PairKey is the stable, content-addressed key of a pair (the CENTRE voyant + click target).
func PairKey(facet, pair, source string) string {
	return facet + ":" + pair + ":" + source
}

// ── GAUCHE — the chat proposes slots, never a truth ──

// CockpitNode is the node the cockpit is scoped to; the CENTRE selection drives GAUCHE + DROITE.
type CockpitNode struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Facet string `json:"facet"`
}

// ProposedSlot is a slot the chat PROPOSES (amber). Status is always "proposed" — never a truth.
type ProposedSlot struct {
	ID     string `json:"id"`
	NodeID string `json:"node_id"`
	Facet  string `json:"facet"`
	Intent string `json:"intent"`
	Status string `json:"status"`
	Voyant Voyant `json:"voyant"`
}

// WallRefusal is the actionable refusal when the chat tries to write a truth directly (the wall §2).
type WallRefusal struct {
	Refused     bool     `json:"refused"`
	Code        string   `json:"code"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

// truthWriteMarkers is the CLOSED set of phrasings that ASK FOR A DIRECT TRUTH WRITE — refused at
// the wall. DECLARED, deterministic — no LLM judges the intent.
var truthWriteMarkers = []string{
	"écris la vérité",
	"écris le kernel",
	"write the kernel",
	"write truth",
	"modifie le kernel",
	"edit the mirror",
	"modifie le miroir",
	"freeze",
	"gèle la vérité",
}

// IsTruthWriteRequest reports whether a chat message demands a direct truth write (refused §2).
func IsTruthWriteRequest(message string) bool {
	m := strings.ToLower(message)
	for _, mk := range truthWriteMarkers {
		if strings.Contains(m, mk) {
			return true
		}
	}
	return false
}

// SlotResult is the outcome of a chat: either a proposed slot or a wall refusal (never both).
type SlotResult struct {
	Slot    *ProposedSlot `json:"slot,omitempty"`
	Refusal *WallRefusal  `json:"refusal,omitempty"`
}

// ProposeSlot is the GAUCHE chat gesture: a message scoped to a node either PROPOSES an amber slot
// (a candidate, never a truth) or is REFUSED at the wall if it demands a direct truth write. PURE
// + TOTAL + content-addressed (same message + node ⇒ same slot ID). NO LLM enters.
func ProposeSlot(node CockpitNode, message string) SlotResult {
	if IsTruthWriteRequest(message) {
		return SlotResult{Refusal: &WallRefusal{
			Refused: true,
			Code:    CodeDirectTruthWrite,
			Explanation: "Le chat de l'AI Lab PROPOSE des slots, il n'écrit jamais la vérité. " +
				"Une écriture directe du kernel ou d'un miroir est refusée au mur (§2).",
			HowToFix: []string{
				"Capturez l'intention comme une idée (idea-intake).",
				"Dérivez son miroir (write-bdd-scenario).",
				"Ouvrez un /goal — la promotion passe par la décision humaine.",
			},
		}}
	}
	intent := strings.TrimSpace(message)
	id := "SLOT-" + records.Hash([]byte(node.ID + "|" + node.Facet + "|" + intent))[:8]
	return SlotResult{Slot: &ProposedSlot{
		ID:     id,
		NodeID: node.ID,
		Facet:  node.Facet,
		Intent: intent,
		Status: "proposed",
		Voyant: VoyantAmber,
	}}
}

// ── DROITE — validating a card flips a pair ──

// belowWallOptions are the cockpit options that ACT BELOW the wall directly (the only ones the
// cockpit may apply). Every other option opens a goal above the wall.
var belowWallOptions = map[string]bool{"fix_below_wall": true}

// IsBelowWallOption reports whether a card option acts below the wall (the cockpit may apply it).
func IsBelowWallOption(option string) bool { return belowWallOptions[option] }

// CardValidation is the result of validating a decision card from the cockpit.
type CardValidation struct {
	Applied     bool                           `json:"applied"`
	Report      conscience.ConsciousnessReport `json:"report"`
	FlippedPair string                         `json:"flipped_pair,omitempty"`
	OpenedGoal  bool                           `json:"opened_goal,omitempty"`
	Reason      string                         `json:"reason,omitempty"`
}

// ApplyCardValidation is the DROITE gesture: validating a card with the BELOW-the-wall option
// fix_below_wall flips the addressed pair 🔴→🟢 deterministically and RE-RECONCILES the report (so
// the verdict + remaining cards recompute from the SAME aggregator, FK09). An ABOVE-the-wall
// option does NOT flip a pair — it OPENS a goal (the wall §2). PURE + TOTAL.
func ApplyCardValidation(report conscience.ConsciousnessReport, cardID, option string) CardValidation {
	var card *conscience.DecisionCard
	for i := range report.Cards {
		if report.Cards[i].ID == cardID {
			card = &report.Cards[i]
			break
		}
	}
	if card == nil {
		return CardValidation{Applied: false, Report: report, Reason: "carte inconnue : " + cardID}
	}
	if !IsBelowWallOption(option) {
		return CardValidation{
			Applied:    false,
			Report:     report,
			OpenedGoal: true,
			Reason: "option au-dessus du mur — la carte ouvre un /goal (idea → mirror → /goal), " +
				"le cockpit n'écrit aucune vérité.",
		}
	}
	target := PairKey(string(card.Facet), card.Pair, string(card.Source))
	flipped := false
	verdicts := make([]conscience.SourcedVerdict, 0, len(report.Pairs))
	for _, p := range report.Pairs {
		sv := conscience.SourcedVerdict{
			Source:  p.Source,
			Facet:   p.Facet,
			Pair:    p.Pair,
			Verdict: p.Verdict,
			Drift:   p.Drift,
			Detail:  p.Detail,
			Blast:   p.Blast,
		}
		if PairKey(string(p.Facet), p.Pair, string(p.Source)) == target && p.Verdict == "red" {
			flipped = true
			sv.Verdict = "green"
			sv.Drift = ""
			sv.Detail = ""
		}
		verdicts = append(verdicts, sv)
	}
	next := conscience.Reconcile(conscience.Input{KernelID: report.KernelID, Verdicts: verdicts})
	res := CardValidation{Applied: flipped, Report: next}
	if flipped {
		res.FlippedPair = target
	}
	return res
}

// ── CENTRE click → scope GAUCHE + DROITE ──

// PairScope is the scope a clicked pair resolves to: the left chat node + the right cards (FKE-38).
type PairScope struct {
	PairKey   string   `json:"pair_key"`
	Facet     string   `json:"facet"`
	Pair      string   `json:"pair"`
	Source    string   `json:"source"`
	Tier      WallTier `json:"tier"`
	ChatFacet string   `json:"chat_facet"`
	ChatPair  string   `json:"chat_pair"`
	CardIDs   []string `json:"card_ids"`
	Voyant    Voyant   `json:"voyant"`
}

// ScopeForPair is the CENTRE→GAUCHE+DROITE gesture: clicking a pair resolves the deterministic
// scope of the left chat (the facet+pair) and the right cards (those addressing it). PURE + TOTAL.
func ScopeForPair(report conscience.ConsciousnessReport, key string) (PairScope, bool) {
	for _, p := range report.Pairs {
		if PairKey(string(p.Facet), p.Pair, string(p.Source)) != key {
			continue
		}
		cardIDs := []string{}
		for _, c := range report.Cards {
			if PairKey(string(c.Facet), c.Pair, string(c.Source)) == key {
				cardIDs = append(cardIDs, c.ID)
			}
		}
		sort.Strings(cardIDs)
		return PairScope{
			PairKey:   key,
			Facet:     string(p.Facet),
			Pair:      p.Pair,
			Source:    string(p.Source),
			Tier:      PairTier(string(p.Source)),
			ChatFacet: string(p.Facet),
			ChatPair:  p.Pair,
			CardIDs:   cardIDs,
			Voyant:    VoyantFor(string(p.Verdict)),
		}, true
	}
	return PairScope{}, false
}

// ── the whole cockpit state (CENTRE + GAUCHE + DROITE), one zoomable screen ──

// PairCell is a CENTRE pair cell carrying its voyant + wall tier — the navigable layer's atom.
type PairCell struct {
	Key      string   `json:"key"`
	Facet    string   `json:"facet"`
	Pair     string   `json:"pair"`
	Source   string   `json:"source"`
	Voyant   Voyant   `json:"voyant"`
	Tier     WallTier `json:"tier"`
	ReadOnly bool     `json:"read_only"`
}

// PromotionGate is the DROITE promotion gate (FK10): a declared autonomy level + whether it rises.
type PromotionGate struct {
	Level      int  `json:"level"`
	CanPromote bool `json:"can_promote"`
	NextLevel  int  `json:"next_level"`
}

// CockpitState is the whole zoomable cockpit state: CENTRE cells + DROITE cards/red-wave/blast/gate.
type CockpitState struct {
	KernelID string                    `json:"kernel_id"`
	Mode     string                    `json:"mode"`
	Cells    []PairCell                `json:"cells"`
	Cards    []conscience.DecisionCard `json:"cards"`
	RedWave  []string                  `json:"red_wave"`
	Blast    map[string]string         `json:"blast"`
	Gate     *PromotionGate            `json:"gate,omitempty"`
	Verdict  string                    `json:"verdict"`
	Green    int                       `json:"green"`
	Red      int                       `json:"red"`
	Amber    int                       `json:"amber"`
}

// BuildCockpit composes the FK09 conscience report + the mode + the optional promotion gate into
// the whole zoomable cockpit state: the CENTRE pair cells (voyant + wall tier + read-only), the
// DROITE cards + red-wave + blast radii. PURE + TOTAL: same input ⇒ same state, deterministic
// ordering (by pair key). NO LLM enters — every cell is a copied verdict.
func BuildCockpit(report conscience.ConsciousnessReport, mode string, gate *PromotionGate) CockpitState {
	if mode == "" {
		mode = "navigational"
	}
	cells := make([]PairCell, 0, len(report.Pairs))
	red := []string{}
	amber := 0
	for _, p := range report.Pairs {
		tier := PairTier(string(p.Source))
		v := VoyantFor(string(p.Verdict))
		key := PairKey(string(p.Facet), p.Pair, string(p.Source))
		cells = append(cells, PairCell{
			Key:      key,
			Facet:    string(p.Facet),
			Pair:     p.Pair,
			Source:   string(p.Source),
			Voyant:   v,
			Tier:     tier,
			ReadOnly: tier == TierBelow,
		})
		if p.Verdict == "red" {
			red = append(red, key)
		}
		if v == VoyantAmber {
			amber++
		}
	}
	sort.Slice(cells, func(i, j int) bool { return cells[i].Key < cells[j].Key })
	sort.Strings(red)

	blast := map[string]string{}
	for _, c := range report.Cards {
		blast[c.ID] = string(c.Blast)
	}

	return CockpitState{
		KernelID: report.KernelID,
		Mode:     mode,
		Cells:    cells,
		Cards:    report.Cards,
		RedWave:  red,
		Blast:    blast,
		Gate:     gate,
		Verdict:  report.Verdict,
		Green:    report.Green,
		Red:      report.Red,
		Amber:    amber,
	}
}
