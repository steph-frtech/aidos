package besoin

// capitalisation.go — EL18: the CAPITALISATION OF THE NEED — `/compound` applied to elicitation.
//
// WHEN a BesoinGraph reaches FULL RESOLUTION (every required SOURCE rung resolved), its durable
// motif becomes REUSABLE CAPITAL — but ONLY through the wall (CLAUDE.md §2). EL18 captures, at that
// close, two things:
//
//   (a) the resolved BesoinGraph as a REUSABLE ANCHOR — the canonicalised level→intent keys that a
//       SECOND similar need can replay instead of re-eliciting (the compound in TIME); and
//   (b) the RESOLUTION MOTIF as PROCEDURAL MEMORY (KindProcedural) + a candidate besoin-BEHAVIOR
//       (a draft idea) — proposed through firewall.ViaIdea, NEVER firewall.ToKernel (CE03 discipline).
//
// THE WALL (the load-bearing EL18 invariant). Capitalisation crosses the wall ONLY via
// firewall.ViaIdea (idée → miroir → /goal → human approval). It NEVER calls ToKernel, NEVER touches
// the fitness/weights (CAPITALISATION ≠ APPRENTISSAGE DE CRITÈRES, the CE02 frontier), and writes NO
// truth (WroteKernel ALWAYS false). The behaviour candidate it proposes carries no version and no
// mirror; it must STILL acquire its mirror via /goal to ever reach the kernel.
//
// PROVENANCE HONESTY. firewall.ViaIdea freezes `Detail: "memory:"+id` and `Source: human` (verified
// in firewall.go) — there is NO free `provenance: besoin:<graph_hash>` slot. So EL18 carries the
// graph_hash INSIDE the free-text MemoryItem.Provenance (which IS free text upstream, consumed by
// firewall.Capture). The resulting idea's provenance therefore RECONSTRUCTS down to the graph_hash
// (it is recoverable from the memory's free-text provenance) — WITHOUT touching ViaIdea (a wall
// artifact). ParseGraphHash recovers it deterministically.
//
// REUSE HONESTY. The CE05 reuse-router is a NAME MATCH (verified in compound/reuse.go) — cross-app
// reuse is reliable ONLY on CANONICALISED level names. EL18 BUILDS that normalisation explicitly:
// the corpus key is `(level, normalized-intent-hash)` (CanonicalIntentKey). A SECOND similar need
// under canonicalised names reuses ≥1 level (ReplayCost, not DeriveCost); a DISSIMILAR need
// fabricates NO reuse (the anti-false-positive frontier, CE02 intrinsic_substance forbidden).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is PURE, TOTAL — no DB, no clock, no rng,
// no I/O, never panics. The expansion/reuse REUSE compound.Reuse + behavior.Expand (declared tables),
// never an LLM re-judging the anchor. Same BesoinResolve ⇒ same capture (content-addressed ids are
// stable). The reproducibility mirror capitalisation_property_test.go pins it.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/archive/brain/memory"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/compound"
)

// graphHashTag is the free-text marker that carries the graph_hash inside MemoryItem.Provenance so
// the resulting idea's provenance reconstructs down to the graph_hash WITHOUT touching ViaIdea (it
// freezes "memory:<id>"). ParseGraphHash recovers the value from a memory provenance string.
const graphHashTag = "besoin:"

// BesoinResolve is the input to EL18 — a BesoinGraph that has reached full resolution, plus the DAG
// branch the capture is branch-aware on. The graph is the resolved need; the branch travels with
// the captured memory (S31, branch-aware). Green-equivalent gating is the graph being fully
// resolved (CapitaliseBesoin verifies it; an unresolved graph capitalises NOTHING).
type BesoinResolve struct {
	// Graph is the fully-resolved BesoinGraph whose motif is capitalised.
	Graph BesoinGraph
	// Branch is the DAG branch the capture is branch-aware on (S31).
	Branch string
}

// AnchorUnit is one canonicalised reusable unit of a resolved need: the rung Level it came from, the
// canonical reuse Key `(level, normalized-intent-hash)`, and the verbatim intent (for audit). The
// Key is what the CE05 router name-matches a SECOND need against — the explicit cross-app
// normalisation the ROADMAP requires.
type AnchorUnit struct {
	// Level is the SOURCE rung this unit was elicited at.
	Level Level `json:"level"`
	// Key is the canonicalised reuse key `level::<normalized-intent-hash>` — the CE05 match key.
	Key string `json:"key"`
	// Intent is the verbatim human utterance (audit / provenance), never paraphrased.
	Intent string `json:"intent"`
}

// BesoinAnchor is the reusable anchor of a resolved BesoinGraph (item (a)): the graph_hash it traces
// back to, the canonicalised AnchorUnits a second need replays, and the branch. It is a READ-ONLY
// view of the resolved need — capital, not truth (no version, no mirror; the type cannot encode one).
type BesoinAnchor struct {
	// GraphHash is the content-address of the resolved graph (records.Hash) — the anchor's identity.
	GraphHash string `json:"graph_hash"`
	// Units are the canonicalised reusable units (one per resolved mapping rung), canonical order.
	Units []AnchorUnit `json:"units"`
	// Branch is the DAG branch the anchor was captured on.
	Branch string `json:"branch"`
}

// BesoinCapture is the result of EL18 — the events the capitalisation emits. VALUES only (the wall):
//
//   - Anchor is the reusable anchor (item (a)) — the canonicalised key corpus a second need replays;
//   - ProceduralWrites are the KindProcedural memory.WriteInput entries (≤ 1 — one motif per close),
//     the /brain fuel below the line (the RESOLUTION MOTIF, item (b) first half);
//   - BehaviorCandidates are the DRAFT besoin-behaviour ideas proposed via firewall.ViaIdea (≤ 1),
//     each carrying graph_hash in its free-text provenance (item (b) second half). HasMirror false.
//
// NOTHING here is a kernel write — WroteKernel proves it (every candidate carries ViaIdea's
// WroteKernel=false, and the package never calls ToKernel).
type BesoinCapture struct {
	// Anchor is the reusable anchor of the resolved need (item (a)).
	Anchor BesoinAnchor `json:"anchor"`
	// ProceduralWrites are the KindProcedural memory write-inputs (the resolution motif). ≤ 1.
	ProceduralWrites []memory.WriteInput `json:"procedural_writes"`
	// BehaviorCandidates are the DRAFT besoin-behaviour ideas via firewall.ViaIdea. ≤ 1.
	BehaviorCandidates []firewall.IdeaCandidate `json:"behavior_candidates"`
}

// WroteKernel reports whether ANY emitted event wrote kernel truth. ALWAYS false — the field makes
// the wall guarantee explicit and testable (every candidate is a firewall.ViaIdea result with
// WroteKernel=false; this package has no other sink and never calls ToKernel).
func (c BesoinCapture) WroteKernel() bool {
	for _, b := range c.BehaviorCandidates {
		if b.WroteKernel {
			return true
		}
	}
	return false
}

// normalizeIntent lowercases, collapses whitespace, and trims punctuation from an intent so that two
// utterances differing only in casing/spacing canonicalise to the SAME key. PURE, TOTAL. It is the
// explicit cross-app normalisation the ROADMAP requires (without it, cross-app reuse is an
// OpenQuestion, never a green-on-contrived-fixture capability).
func normalizeIntent(intent string) string {
	s := strings.ToLower(strings.TrimSpace(intent))
	// Collapse all runs of whitespace to a single space.
	s = strings.Join(strings.Fields(s), " ")
	// Trim trailing sentence punctuation (deterministic, declared set).
	s = strings.TrimRight(s, ".!?;:, ")
	return s
}

// CanonicalIntentKey builds the canonical reuse key for a (level, intent) pair:
// `level::<hash-of-normalized-intent>`. PURE, TOTAL. It REUSES records.Hash (never a forked hash) so
// the key is content-addressed and stable. This is the CE05 name-match key for cross-app reuse — two
// needs whose rung intents canonicalise identically share the SAME key and so reuse.
func CanonicalIntentKey(level Level, intent string) string {
	norm := normalizeIntent(intent)
	h := records.Hash([]byte(string(level) + "\x00" + norm))
	return string(level) + "::" + h
}

// Anchor extracts the reusable BesoinAnchor from a resolved BesoinGraph (item (a)). PURE, TOTAL.
// One AnchorUnit per RESOLVED MAPPING SOURCE rung (a NoEmit rung seeds anchors but is not itself a
// reusable emitting unit — it carries no idea-intent to replay). Units are in §23 descent order.
func (r BesoinResolve) Anchor() (BesoinAnchor, error) {
	gh, err := r.Graph.Hash()
	if err != nil {
		return BesoinAnchor{}, fmt.Errorf("besoin: anchor graph hash: %w", err)
	}
	a := BesoinAnchor{GraphHash: gh, Branch: r.Branch}
	for _, lvl := range Levels() { // SOURCE rungs in canonical descent order
		node, ok := r.Graph.Node(lvl)
		if !ok || node.Status != NodeResolved {
			continue
		}
		if IsNoEmit(lvl) { // journey/view — seed anchors but carry no replayable idea-intent
			continue
		}
		intent := node.Provenance.Detail
		a.Units = append(a.Units, AnchorUnit{
			Level:  lvl,
			Key:    CanonicalIntentKey(lvl, intent),
			Intent: intent,
		})
	}
	return a, nil
}

// IsFullyResolved reports whether EVERY SOURCE rung present in the graph is resolved AND at least one
// mapping rung exists (an empty graph capitalises nothing). PURE, TOTAL. This is the "green" gate of
// EL18: only a fully-resolved need capitalises (an in-flight need yields an empty capture).
func (r BesoinResolve) IsFullyResolved() bool {
	mapping := 0
	for _, lvl := range Levels() {
		node, ok := r.Graph.Node(lvl)
		if !ok {
			continue
		}
		if node.Status != NodeResolved {
			return false
		}
		if !IsNoEmit(lvl) {
			mapping++
		}
	}
	return mapping > 0
}

// CapitaliseBesoin runs the EL18 capitalisation over a resolved need. PURE, TOTAL.
//
//   - An UNRESOLVED need capitalises NOTHING (empty BesoinCapture, no error) — the green gate.
//   - A fully-resolved need emits: the reusable Anchor (item a), ONE KindProcedural memory
//     write-input (the resolution motif), and ONE DRAFT besoin-behaviour idea via firewall.ViaIdea
//     whose free-text provenance carries the graph_hash (item b).
//
// It NEVER calls firewall.ToKernel and NEVER touches the fitness (the wall + the CE02 frontier).
// WroteKernel is always false. Same BesoinResolve ⇒ same capture (content-addressed ids stable).
func CapitaliseBesoin(r BesoinResolve) (BesoinCapture, error) {
	var out BesoinCapture
	if !r.IsFullyResolved() {
		return out, nil // green gate: an in-flight need capitalises nothing.
	}

	anchor, err := r.Anchor()
	if err != nil {
		return BesoinCapture{}, err
	}
	out.Anchor = anchor

	// The free-text provenance carries the graph_hash so the resulting idea reconstructs to it
	// WITHOUT touching ViaIdea (which freezes "memory:<id>"). ParseGraphHash recovers it.
	prov := graphHashTag + anchor.GraphHash

	// (b first half) The RESOLUTION MOTIF → a KindProcedural memory recall (below the line).
	out.ProceduralWrites = append(out.ProceduralWrites, memory.WriteInput{
		Kind:       memory.KindProcedural,
		Content:    motifContent(anchor),
		Provenance: prov,
		Confidence: 1.0,
		Taint:      []memory.Taint{memory.TaintUnverified},
		Branch:     r.Branch,
	})

	// (b second half) The besoin-BEHAVIOUR candidate → a DRAFT idea VIA THE WALL (firewall.ViaIdea).
	mem := firewall.MemoryItem{
		Content:    behaviorContent(anchor),
		Provenance: prov, // free text: carries the graph_hash (provenance reconstructs to it).
		Confidence: 1.0,
		Taint:      []firewall.Taint{firewall.TaintUnverified},
		Branch:     r.Branch,
	}
	canon, err := mem.CanonicalBody()
	if err != nil {
		return BesoinCapture{}, fmt.Errorf("besoin: address behaviour memory: %w", err)
	}
	mem.ID = records.Hash(canon)
	cand, err := firewall.ViaIdea(mem) // the ONLY legal door — never ToKernel.
	if err != nil {
		return BesoinCapture{}, fmt.Errorf("besoin: propose besoin-behaviour candidate: %w", err)
	}
	out.BehaviorCandidates = append(out.BehaviorCandidates, cand)

	return out, nil
}

// ParseGraphHash recovers the graph_hash an EL18 memory provenance carries (the free-text marker
// "besoin:<graph_hash>"), proving the resulting idea's provenance reconstructs down to the
// graph_hash. Returns ("", false) when the provenance is not an EL18 besoin provenance. PURE, TOTAL.
func ParseGraphHash(provenance string) (string, bool) {
	if !strings.HasPrefix(provenance, graphHashTag) {
		return "", false
	}
	gh := strings.TrimPrefix(provenance, graphHashTag)
	if gh == "" {
		return "", false
	}
	return gh, true
}

// AnchorCorpus projects a captured BesoinAnchor into a CE05 reuse Corpus keyed by the CANONICALISED
// keys (the explicit cross-app normalisation). PURE, TOTAL. The procedural channel carries the
// resolution-motif units (replayed below the line); SourceGoal echoes the anchor's graph_hash so a
// reuse traces back to what captured it. This is the bridge that makes compound.Reuse name-match on
// canonicalised need keys, never on raw utterances.
func (a BesoinAnchor) Corpus() compound.Corpus {
	c := compound.Corpus{SourceGoal: a.GraphHash}
	for _, u := range a.Units {
		c.Procedural = append(c.Procedural, compound.CapturedUnit{
			Name:    u.Key,
			Channel: compound.ChannelProceduralMemory,
		})
	}
	return c
}

// ReuseFor routes a SECOND need's resolved units against this anchor's corpus (CE05). PURE, TOTAL.
// `next` is the resolved second need; its required units are its canonicalised keys (the SAME
// CanonicalIntentKey), so a need whose rungs canonicalise identically reuses ≥1 unit (ReplayCost),
// and a dissimilar need reuses NOTHING (DeriveCost) — the anti-false-positive frontier. It WRITES NO
// truth (compound.Reuse's WroteKernel is always false).
func (a BesoinAnchor) ReuseFor(next BesoinResolve) (compound.ReusePlan, error) {
	nextAnchor, err := next.Anchor()
	if err != nil {
		return compound.ReusePlan{}, err
	}
	required := make([]string, 0, len(nextAnchor.Units))
	for _, u := range nextAnchor.Units {
		required = append(required, u.Key)
	}
	return compound.Reuse(a.Corpus(), compound.NextGoal{
		GoalID:   nextAnchor.GraphHash,
		Required: required,
	})
}

// motifContent renders the resolution MOTIF as the procedural memory's recall fuel — deterministic
// (canonical-ordered keys, KRD terms verbatim). It is what a second similar need replays instead of
// re-eliciting its rungs (the compound in TIME).
func motifContent(a BesoinAnchor) string {
	keys := make([]string, 0, len(a.Units))
	for _, u := range a.Units {
		keys = append(keys, u.Key)
	}
	sort.Strings(keys) // canonical, order-independent rendering
	return fmt.Sprintf(
		"Motif de résolution du besoin %s (KindProcedural) : %s. Rejoué pour abaisser le coût d'élicitation d'un second besoin similaire (clés canonicalisées (level, normalized-intent-hash)) ; la mémoire propose, le noyau déclare le vrai.",
		a.GraphHash, strings.Join(keys, " · "),
	)
}

// behaviorContent renders the resolved need as the besoin-behaviour candidate's intent — the sketch
// firewall.ViaIdea hands to S27 idea-intake as a DRAFT idea (its mirror is acquired later via /goal).
func behaviorContent(a BesoinAnchor) string {
	levels := make([]string, 0, len(a.Units))
	for _, u := range a.Units {
		levels = append(levels, string(u.Level))
	}
	return fmt.Sprintf(
		"Behavior-besoin candidate capitalisée du BesoinGraph résolu %s : rungs %s. À figer via /goal — aucune écriture kernel hors du mur (firewall.ViaIdea, jamais ToKernel).",
		a.GraphHash, strings.Join(levels, " · "),
	)
}
