// Package evolve is the AIDOS Runtime EVOLUTIONSANDBOX (step S42, KRD §66.1): the
// typed quarantine every `/evolve` medium-loop run (KRD §62 algorithm ②, §64, §66)
// executes inside. Its single law is "l'évolution EXPLORE, elle ne GOUVERNE pas" —
// the loop may produce candidates, branches, scores, hypotheses, suggestions, and it
// may never produce truths, approvals, exceptions, or rights.
//
// THREE PURE FUNCTIONS, NO I/O (CLAUDE.md §6/§8 determinism-first). Confine, Promote,
// and Evolve are TOTAL, deterministic functions of their inputs — no DB, no clock, no
// rng, no I/O, NO WRITE. Any seed / budget / `now` is PASSED IN so a run is replayable;
// nothing is read from the ambient. Same inputs ⇒ same result. The rapid property
// mirror pins determinism, the confinement invariant, the promotion gate, and totality.
//
// THE SANDBOX AST IS DECLARED, NEVER LEARNED (CLAUDE.md §8, KRD §66.1). The zones and
// the promotion gate are fixed exactly as §66.1 declares them:
//
//	can_write          = {/branches/evolution, /reports, /ideas/proposed}
//	cannot_write       = {/kernel, /mirrors/above, /authority, /fitness}
//	promotion.requires = {mirror_green, out_of_sample_green, authority_approval}
//
// No fourth zone, no fourth gate condition, no coined fitness — the honesty rule
// (never invent a target / business rule). The §66.1 cannot_write set IS the §2 wall.
//
// THE WALL (CLAUDE.md §2). This package writes NOTHING. Confine returns a verdict;
// Promote returns a PROPOSAL (it never itself writes kernel/mirror/authority/fitness —
// that door is the human /goal freeze, KRD §118/§132); Evolve returns an EvolutionRun
// whose every emitted write path is under can_write. All persistence of
// branches/reports/ideas goes through the evolve MCP / aidos CLI write-grant on
// ideas/dag — never the agent role, never this package.
//
// THE JUDGE IS THE DETERMINISTIC MIRROR (KRD §66, §1, §62). Promotion is a BINARY
// gate, never a score the loop grades itself: a variant enters a niche ONLY IF its
// mirror is green AND it is green OUT-OF-SAMPLE (§87 — in-sample Sharpe ≈ no predictive
// power; the market is adversarial/non-stationary; out-of-sample is the only honest
// signal) AND the authority approved. A red-mirror variant is NEVER promoted, WHATEVER
// its backtest score. CellVitality (§66.2) is diagnostic; it never validates a variant.
//
// CONSUMED, NOT REDEFINED. The QD niche/élite shape (S26 archive/qd) and the anchored
// fitness reading (kernel_red_to_green ⊕ sensors_computational ⊕ out_of_sample, the
// prior fitness/sensor steps) are CONSUMED here, never re-coined. This step delivers
// the SANDBOX + the promotion GATE + the medium-loop orchestration SHAPE — not the QD
// curation engine, not the fitness definition, not a real generator/backtest.
package evolve

import (
	"sort"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// --- The EvolutionSandbox AST (KRD §66.1 — declared, never learned) ---------------

// Zone prefixes. CanWrite are the EXACTLY three zones the sandbox may write;
// CannotWrite are the EXACTLY four it may never write. Declared here verbatim from
// KRD §66.1 — the honesty rule forbids coining a fourth.
const (
	ZoneBranchesEvolution = "/branches/evolution"
	ZoneReports           = "/reports"
	ZoneIdeasProposed     = "/ideas/proposed"

	ZoneKernel       = "/kernel"
	ZoneMirrorsAbove = "/mirrors/above"
	ZoneAuthority    = "/authority"
	ZoneFitness      = "/fitness"
)

// EvolutionSandbox is the typed quarantine (KRD §66.1). The zones and the promotion
// gate are DECLARED, immutable fields — Sandbox() returns the one canonical value;
// callers never mutate it. can_write / cannot_write are sorted prefix lists.
type EvolutionSandbox struct {
	CanWrite          []string      `json:"can_write"`
	CannotWrite       []string      `json:"cannot_write"`
	PromotionRequires PromotionGate `json:"promotion_requires"`
}

// PromotionGate is the §66.1 promotion.requires set — the three binary conditions a
// variant must ALL satisfy to be promoted into a niche. They are NAMES of conditions,
// declared; the actual values come from a variant's Evidence at Promote time.
type PromotionGate struct {
	MirrorGreen       bool `json:"mirror_green"`
	OutOfSampleGreen  bool `json:"out_of_sample_green"`
	AuthorityApproval bool `json:"authority_approval"`
}

// sandbox is the single canonical EvolutionSandbox value (KRD §66.1). Built once;
// Sandbox() returns a copy-safe view. The promotion gate's bool fields here mark the
// three REQUIRED conditions (all true == "all three are required").
var sandbox = EvolutionSandbox{
	CanWrite:    []string{ZoneBranchesEvolution, ZoneIdeasProposed, ZoneReports},
	CannotWrite: []string{ZoneAuthority, ZoneFitness, ZoneKernel, ZoneMirrorsAbove},
	PromotionRequires: PromotionGate{
		MirrorGreen:       true,
		OutOfSampleGreen:  true,
		AuthorityApproval: true,
	},
}

// Sandbox returns the canonical EvolutionSandbox AST (KRD §66.1). It is deterministic
// and allocates fresh slices so a caller can never mutate the shared declaration.
func Sandbox() EvolutionSandbox {
	cw := make([]string, len(sandbox.CanWrite))
	copy(cw, sandbox.CanWrite)
	cnw := make([]string, len(sandbox.CannotWrite))
	copy(cnw, sandbox.CannotWrite)
	return EvolutionSandbox{
		CanWrite:          cw,
		CannotWrite:       cnw,
		PromotionRequires: sandbox.PromotionRequires,
	}
}

// --- Confine: the pure write classifier ------------------------------------------

// Verdict is a Confine outcome: a write is Allowed or Refused.
type Verdict string

const (
	// VerdictAllowed — the write path is under a can_write prefix.
	VerdictAllowed Verdict = "allowed"
	// VerdictRefused — the write path escapes the sandbox (cannot_write or outside
	// can_write); it carries a BlockReason.
	VerdictRefused Verdict = "refused"
)

// WriteAttempt is one write the active /evolve run attempts: the target path.
type WriteAttempt struct {
	Path string `json:"path"`
}

// ConfineResult is the pure verdict of Confine: Allowed, or Refused with the
// actionable BlockReason (SANDBOX_WRITE_ESCAPES_ZONE).
type ConfineResult struct {
	Verdict     Verdict                  `json:"verdict"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// underPrefix reports whether path is exactly prefix or under "prefix/". Pure/total.
func underPrefix(path, prefix string) bool {
	if path == prefix {
		return true
	}
	if len(path) > len(prefix) && path[:len(prefix)] == prefix && path[len(prefix)] == '/' {
		return true
	}
	return false
}

// inCanWrite reports whether a path falls under one of the three can_write prefixes.
func inCanWrite(path string) bool {
	for _, p := range sandbox.CanWrite {
		if underPrefix(path, p) {
			return true
		}
	}
	return false
}

// Confine is the PURE write classifier (KRD §66.1). A write whose path falls under a
// can_write prefix is ALLOWED; any other path — under a cannot_write prefix OR simply
// outside the can_write set — is REFUSED with SANDBOX_WRITE_ESCAPES_ZONE. Total and
// deterministic: it yields a verdict for any string, never panics, reads no clock.
//
// The default is REFUSE (fail closed): the sandbox is an allow-list, not a deny-list,
// so an unrecognised path can never slip out of quarantine.
func Confine(w WriteAttempt) ConfineResult {
	if inCanWrite(w.Path) {
		return ConfineResult{Verdict: VerdictAllowed}
	}
	br := blockreason.For(blockreason.CodeSandboxWriteEscapesZone)
	return ConfineResult{Verdict: VerdictRefused, BlockReason: &br}
}

// --- Promote: the binary QD promotion gate ----------------------------------------

// MirrorStatus is a variant's mirror verdict — the DETERMINISTIC Judge (KRD §66/§62).
// Re-exported alias of the consumed S26 qd shape's vocabulary so the gate speaks the
// same language; only Green admits a variant.
type MirrorStatus string

const (
	// MirrorGreen — the variant's mirror is green: a REQUIRED gate condition.
	MirrorGreen MirrorStatus = "green"
	// MirrorRed — the variant's mirror is red: NEVER promoted, whatever the score.
	MirrorRed MirrorStatus = "red"
)

// OutOfSampleStatus is the backtester's out-of-sample / walk-forward verdict (KRD §87)
// — the honest signal, NEVER in-sample. Consumed from the backtester capability.
type OutOfSampleStatus string

const (
	// OutOfSampleGreen — the variant held up out-of-sample: a REQUIRED gate condition.
	OutOfSampleGreen OutOfSampleStatus = "green"
	// OutOfSampleRed — the variant failed out-of-sample: NEVER promoted.
	OutOfSampleRed OutOfSampleStatus = "red"
)

// Evidence is the non-gameable evidence a Promote decision consumes for one variant.
// It is READ (consumed), never coined: Mirror is the deterministic Judge's verdict
// (S26/the mirror runner), OutOfSample is the backtester's out-of-sample reading
// (§87), AuthorityApproved is the human authority's approval. Fitness is the anchored
// fitness reading (consumed) — it ORDERS within a niche, it NEVER overrides the gate.
type Evidence struct {
	Mirror            MirrorStatus      `json:"mirror"`
	OutOfSample       OutOfSampleStatus `json:"out_of_sample"`
	AuthorityApproved bool              `json:"authority_approved"`
	Fitness           float64           `json:"fitness"`
}

// Variant is one candidate the loop proposes (a branch in the version DAG). ID and
// Niche trace to real inputs (the honesty rule — never an invented niche). It carries
// no truth; it is a sandbox artifact.
type Variant struct {
	// ID is the variant's branch/node id under /branches/evolution (S02 content addr).
	ID string `json:"id"`
	// Niche is the DECLARED behavioral descriptor (the niche key, e.g.
	// "createOrder/discount") — consumed from S26's QD niche grammar, never learned.
	Niche string `json:"niche"`
}

// PromotionVerdict is a Promote outcome.
type PromotionVerdict string

const (
	// PromotionProposed — the gate passed: a PROMOTION PROPOSAL is produced. It is a
	// proposal only — it writes no truth (the human /goal freezes it, KRD §118/§132).
	PromotionProposed PromotionVerdict = "proposed"
	// PromotionRefused — the gate failed (mirror not green, OR out-of-sample not green,
	// OR authority not approved).
	PromotionRefused PromotionVerdict = "refused"
)

// PromotionProposal is the §66.1 output of a passed gate: a candidate a LATER human
// /goal can freeze, carrying its evidence. It is explicitly a PROPOSAL — WritesTruth
// is ALWAYS false (the sandbox never governs). The freeze is a separate human gesture.
type PromotionProposal struct {
	VariantID   string   `json:"variant_id"`
	Niche       string   `json:"niche"`
	Evidence    Evidence `json:"evidence"`
	Proposal    bool     `json:"proposal"`     // ALWAYS true — it is a proposal.
	WritesTruth bool     `json:"writes_truth"` // ALWAYS false — it never governs.
	// RequiresGoal names the door a candidate must walk to become truth.
	RequiresGoal string `json:"requires_goal"`
}

// TheGoalDoor is the single door a promotion proposal must walk to become truth: the
// human /goal freeze. The sandbox never bypasses it.
const TheGoalDoor = "mirror_green ∧ out_of_sample_green ∧ authority_approval → /goal (human freeze)"

// PromotionResult is the pure verdict of Promote.
type PromotionResult struct {
	Verdict  PromotionVerdict   `json:"verdict"`
	Proposal *PromotionProposal `json:"proposal,omitempty"`
	Reason   string             `json:"reason,omitempty"`
	// BlockReason is set only if the loop tried to GOVERN (write truth) rather than
	// propose — SANDBOX_CANNOT_GOVERN. A plain gate failure carries only Reason.
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// Promote is the PURE QD promotion gate (KRD §66.1, §62 ② two-stage fitness, §64
// "gate binaire — passe ou meurt"). A variant is promoted into its niche ONLY IF its
// evidence satisfies ALL THREE declared conditions:
//
//	mirror_green ∧ out_of_sample_green ∧ authority_approval
//
// A red-mirror variant is refused WHATEVER its fitness score (the anti-Goodhart
// anchor — the Judge is the deterministic mirror, never an LLM scoring its own copy,
// never CellVitality §66.2). A mirror-green-but-out-of-sample-red variant is refused
// (§87 — out-of-sample is the only honest signal). A passing gate yields a PROPOSAL —
// Promote NEVER itself writes kernel/mirror/authority/fitness (that door is /goal).
//
// Total/deterministic: any variant/evidence yields a verdict, never a panic, reads no
// clock. Every output traces to the input variant/evidence — it invents nothing.
func Promote(v Variant, e Evidence) PromotionResult {
	if e.Mirror != MirrorGreen {
		return PromotionResult{
			Verdict: PromotionRefused,
			Reason: "promotion refusée : le miroir n'est pas vert — le Juge est le miroir déterministe, " +
				"jamais un LLM ni le score (anti-Goodhart, KRD §62/§66). Une variante au miroir rouge n'est " +
				"JAMAIS promue, quel que soit son score de backtest.",
		}
	}
	if e.OutOfSample != OutOfSampleGreen {
		return PromotionResult{
			Verdict: PromotionRefused,
			Reason: "promotion refusée : la variante échoue en OUT-OF-SAMPLE — le seul signal honnête " +
				"(KRD §87 : in-sample ≈ pouvoir prédictif nul ; le marché est adversarial/non-stationnaire). " +
				"On ne promeut jamais sur l'in-sample.",
		}
	}
	if !e.AuthorityApproved {
		return PromotionResult{
			Verdict: PromotionRefused,
			Reason: "promotion refusée : l'autorité n'a pas approuvé — la promotion exige " +
				"l'approbation de l'autorité du sous-graphe (KRD §66.1). L'IA propose, l'humain gèle.",
		}
	}
	return PromotionResult{
		Verdict: PromotionProposed,
		Proposal: &PromotionProposal{
			VariantID:    v.ID,
			Niche:        v.Niche,
			Evidence:     e,
			Proposal:     true,
			WritesTruth:  false,
			RequiresGoal: TheGoalDoor,
		},
	}
}

// --- Evolve: the medium-loop orchestration shape ----------------------------------

// EmittedWrite is one write an Evolution run emits. Zone is the can_write prefix it
// lands under; Path is the full target. Every emitted write is confined (the
// invariant: Evolve never governs).
type EmittedWrite struct {
	Zone string `json:"zone"`
	Path string `json:"path"`
}

// EvolutionRun is the pure shape of one medium-loop pass (KRD §62 ②). It records the
// sampled parent (a stepping stone, possibly a weak ancestor), the proposed variant
// with its consumed non-gameable fitness reading and behavioral niche, and the writes
// it emitted — ONLY branches/reports/ideas. It carries the seed/budget it ran under
// (deterministic/replayable). It writes NOTHING: the run VALUE is the orchestration
// shape the evolve MCP persists via the aidos CLI write-grant.
type EvolutionRun struct {
	Cell     string         `json:"cell"`
	ParentID string         `json:"parent_id"`
	Variant  Variant        `json:"variant"`
	Evidence Evidence       `json:"evidence"`
	Emitted  []EmittedWrite `json:"emitted"`
	Seed     int64          `json:"seed"`
	Budget   int            `json:"budget"`
}

// Sampler abstracts the archive sampling (KRD §62 ② "échantillonne l'archive, y
// compris des stepping stones faibles"). It is INJECTED so Evolve stays pure (no DB):
// given a cell and a deterministic seed, it returns a parent id and a candidate
// variant + its consumed evidence. The real generator (self-play / AlphaEvolve
// mutation) and the real out-of-sample backtest live behind the MCP capabilities —
// here the sampler is a pure, deterministic function of (cell, seed) for replayability.
type Sampler func(cell string, seed int64) (parentID string, variant Variant, evidence Evidence)

// Evolve is the PURE orchestration shape of the medium loop ② over an already-populated
// archive (KRD §62, §64, §66). It samples a parent (stepping stones included) via the
// injected sampler, records the proposed variant + its consumed non-gameable fitness
// reading + its niche, and emits ONLY a branch (under /branches/evolution), a report
// (under /reports), and optionally an idea (under /ideas/proposed). It generates no
// variant itself (no LLM, no rng read from ambient), runs no backtest, and writes
// nothing — the seed/budget are PASSED IN so the run is deterministic and replayable.
//
// The keystone invariant (the rapid property pins it): EVERY emitted write path is
// under can_write — the loop NEVER governs. Confine over each emitted path always
// returns Allowed.
func Evolve(cell string, budget int, seed int64, sampler Sampler) EvolutionRun {
	parentID, variant, evidence := sampler(cell, seed)

	emitted := []EmittedWrite{
		{Zone: ZoneBranchesEvolution, Path: ZoneBranchesEvolution + "/" + variant.ID},
		{Zone: ZoneReports, Path: ZoneReports + "/" + variant.ID + ".json"},
	}
	// A suggestion (idea) is emitted only when the run has a non-empty cell to attach
	// it to — it never invents an idea from nothing (the honesty rule).
	if cell != "" {
		emitted = append(emitted, EmittedWrite{
			Zone: ZoneIdeasProposed,
			Path: ZoneIdeasProposed + "/" + cell + "-" + variant.ID,
		})
	}
	// Stable order so a run is byte-replayable.
	sort.Slice(emitted, func(i, j int) bool { return emitted[i].Path < emitted[j].Path })

	return EvolutionRun{
		Cell:     cell,
		ParentID: parentID,
		Variant:  variant,
		Evidence: evidence,
		Emitted:  emitted,
		Seed:     seed,
		Budget:   budget,
	}
}
