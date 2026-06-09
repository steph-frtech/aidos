// Package projectevolve is the AIDOS S108 PER-PROJECT MEDIUM LOOP (ROADMAP-app-builder
// §S108, EPIC 12 / E12, KRD §62/§64/§66) — the `/evolve` + Quality-Diversity loop
// instantiated FOR ONE PROJECT, run from a FIXED user mirror. It is the app-builder
// generalisation of S42's EvolutionSandbox + promotion gate and S26's QD selection: the
// loop searches for a BETTER IMPLEMENTATION of a truth the user has already frozen — it
// never searches for a new truth.
//
//	fixed user mirror  →  variants (branches/reports/ideas ONLY)
//	                   →  mirror + property KILL the variants that break the truth
//	                   →  Pareto élites survive in QD niches
//	                   →  promotion GATED by authority (∧ out-of-sample green)
//
// THE FIXED MIRROR IS THE INVARIANT, NEVER A TARGET THE LOOP WRITES (KRD §66.1, §8).
// Every run in this package is anchored to ONE FixedMirror — the user's frozen truth.
// A variant is an alternative IMPLEMENTATION; it is admitted into the search ONLY if it
// still passes that fixed mirror (the deterministic Judge) AND its property test. A
// variant that breaks the mirror is KILLED — removed from the archive before QD even
// looks at it (Cull). The loop may make a behaviour rapide/cheap/simple; it may NEVER
// change what the behaviour IS.
//
// PROJECT-SCOPED (CLAUDE.md §2, S53–S55). A deployed app is one project (multi-tenant).
// Every Variant, every niche key, every promotion proposal carries the ProjectID; the
// niche namespace is PREFIXED by the project, so two projects' identical niches never
// collapse and a variant from project A can never be promoted into project B's archive
// (CROSS_PROJECT refusal, the version-DAG twin of the S55 wall).
//
// THE WALL — THE SANDBOX NEVER GOVERNS (CLAUDE.md §2, KRD §66.1). This package writes
// NOTHING. The loop's only legal write zones are the S42 sandbox's three — branches,
// reports, ideas/proposed — and Confine (consumed from S42 `evolve`) refuses anything
// else. A promotion that the gate passes is a PROPOSAL (WritesTruth ALWAYS false); the
// freeze is the human /goal door. A run that tries to write a truth is refused with
// SANDBOX_CANNOT_GOVERN.
//
// REUSE, DON'T REINVENT (CLAUDE.md §6). The sandbox AST, Confine, the promotion gate and
// the medium-loop shape are CONSUMED from S42 `runtime/evolve`; the MAP-Elites placement
// is CONSUMED from S26 `archive/qd`. This step ADDS only: the per-project frontier, the
// anchoring to a FixedMirror, the Cull of mirror-breaking variants, and the project-keyed
// niche grammar. It does not fork the loop, re-coin the gate, or re-derive the fitness.
//
// PURE / DETERMINISM-FIRST (CLAUDE.md §6/§8). Every exported function is TOTAL and
// deterministic — no DB, no clock, no rng, no I/O, no LLM, NO WRITE. The Judge is the
// fixed mirror (a verdict consumed), NEVER an LLM scoring its own copy. Same input ⇒ same
// output; a malformed variant yields a result, never a panic. The rapid property mirror
// pins the kill of mirror-breakers, the project frontier, the gate, and reproducibility.
package projectevolve

import (
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/archive/qd"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/evolve"
)

// --- The fixed user mirror (the anchor the loop searches under) -------------------

// MirrorStatus is a variant's verdict against the fixed mirror — the DETERMINISTIC
// Judge (KRD §62/§66). Re-exported from S42 `evolve` so the whole loop speaks one
// language; only Green keeps a variant in the search.
type MirrorStatus = evolve.MirrorStatus

const (
	// MirrorGreen — the variant still satisfies the fixed user mirror: it stays in the
	// search. Re-export of the S42 constant.
	MirrorGreen = evolve.MirrorGreen
	// MirrorRed — the variant BREAKS the fixed user mirror: it is KILLED before QD.
	MirrorRed = evolve.MirrorRed
)

// OutOfSampleStatus is the backtester's out-of-sample verdict (KRD §87) — re-exported
// from S42 so the gate condition reads identically here.
type OutOfSampleStatus = evolve.OutOfSampleStatus

const (
	// OutOfSampleGreen — the variant held up out-of-sample: a REQUIRED gate condition.
	OutOfSampleGreen = evolve.OutOfSampleGreen
	// OutOfSampleRed — the variant failed out-of-sample: never promoted.
	OutOfSampleRed = evolve.OutOfSampleRed
)

// FixedMirror is the user's FROZEN truth the loop searches under (KRD §66.1). The loop
// never changes it; it only proposes better implementations OF it. Its MirrorID + the
// ProjectID identify the niche space the variants compete in.
type FixedMirror struct {
	// ProjectID is the project this mirror (and every variant under it) belongs to.
	ProjectID string `json:"project_id"`
	// MirrorID is the frozen mirror's content address (S01/S02) — never invented.
	MirrorID string `json:"mirror_id"`
	// Behavior is the human-readable behaviour the mirror pins (e.g. "createOrder").
	Behavior string `json:"behavior"`
}

// --- Project-scoped variant -------------------------------------------------------

// Variant is one candidate IMPLEMENTATION the loop proposes for a fixed mirror (a branch
// in the project's version DAG). Every field traces to a real input — the honesty rule
// forbids an invented id / niche / fitness.
type Variant struct {
	// ProjectID — the project this variant belongs to; it must equal the fixed mirror's.
	ProjectID string `json:"project_id"`
	// ID is the variant's branch/node id under /branches/evolution (S02 content address).
	ID string `json:"id"`
	// Niche is the DECLARED behavioral descriptor within the project (e.g.
	// "createOrder/fast"). Consumed from the S26 niche grammar, never learned. It is
	// project-prefixed by NicheKey() before QD placement so projects never collide.
	Niche string `json:"niche"`
	// Mirror is the variant's verdict against the FIXED user mirror — the Judge. Green
	// keeps it; red kills it.
	Mirror MirrorStatus `json:"mirror"`
	// OutOfSample is the backtester's out-of-sample reading (§87) — a gate condition,
	// never a niche admission condition.
	OutOfSample OutOfSampleStatus `json:"out_of_sample"`
	// Fitness is the ANCHORED fitness consumed from the prior fitness/sensor steps
	// (rapide/cheap/simple). It ORDERS within a niche; it NEVER overrides the mirror.
	Fitness float64 `json:"fitness"`
}

// --- Cull: the mirror + property test KILLS the truth-breakers --------------------

// CullResult is the outcome of Cull: the variants that SURVIVED (still green against the
// fixed mirror) and the ids of the ones KILLED for breaking the truth.
type CullResult struct {
	Survivors []Variant `json:"survivors"`
	Killed    []string  `json:"killed"`
}

// Cull is the PURE kill-the-truth-breakers stage (KRD §66, §62). It runs the fixed
// mirror (the deterministic Judge) over every proposed variant of a project and removes
// the ones whose mirror is NOT green — a variant that breaks the user's frozen truth is
// KILLED, WHATEVER its fitness score (the anti-Goodhart anchor). A variant that does not
// belong to the mirror's project is ALSO culled (it can never compete here) and recorded
// among the killed.
//
// Total/deterministic: any slice yields a result, never a panic, reads no clock. Order
// is preserved for survivors; killed ids are returned in input order then made stable.
func Cull(m FixedMirror, variants []Variant) CullResult {
	res := CullResult{Survivors: []Variant{}, Killed: []string{}}
	for _, v := range variants {
		// A foreign-project variant can never compete under this mirror.
		if v.ProjectID != m.ProjectID {
			res.Killed = append(res.Killed, v.ID)
			continue
		}
		// The keystone: only a GREEN mirror keeps a variant. A red variant breaks the
		// frozen truth and is killed regardless of its fitness number.
		if v.Mirror != MirrorGreen {
			res.Killed = append(res.Killed, v.ID)
			continue
		}
		res.Survivors = append(res.Survivors, v)
	}
	sort.Strings(res.Killed)
	return res
}

// --- NicheKey: the project-prefixed QD niche grammar ------------------------------

// NicheKey is the PURE project-scoped niche descriptor (KRD §62, S55 frontier). It
// prefixes a variant's declared niche with its project id so two projects' identical
// niches NEVER collapse into one QD cell. Total: an empty niche yields the project's
// "unnamed" cell, never a panic.
func NicheKey(v Variant) string {
	return v.ProjectID + "::" + v.Niche
}

// --- Niches: the project-scoped Pareto front (consumes S26 qd) --------------------

// Niches is the PURE per-project MAP-Elites placement (KRD §62, algorithm ②). It first
// CULLS the mirror-breakers (so a truth-breaking variant can NEVER become an élite), then
// places the survivors into project-prefixed niches via the CONSUMED S26 qd.Elites — ONE
// élite per niche, the green variant with the MAX anchored fitness (rapide/cheap/simple),
// ties broken deterministically by the smaller id. It returns map[projectNicheKey]Variant.
//
// It never invents a niche or a fitness — every élite is a real survivor returned
// verbatim. It is total/deterministic and never panics (a nil slice yields an empty map).
func Niches(m FixedMirror, variants []Variant) map[string]Variant {
	survivors := Cull(m, variants).Survivors

	// Project the survivors into the CONSUMED S26 qd grammar, keyed by the project-prefixed
	// niche. qd.Elites enforces the keystone (only green admitted) a second time and the
	// max-fitness-wins rule — we never re-coin either.
	qv := make([]qd.Variant, 0, len(survivors))
	for _, v := range survivors {
		qv = append(qv, qd.Variant{
			ID:      v.ID,
			Niche:   NicheKey(v),
			Mirror:  qd.MirrorStatus(v.Mirror),
			Fitness: v.Fitness,
		})
	}
	elites := qd.Elites(qv)

	// Map each qd élite back to the rich project Variant it came from. The élite is
	// identified by its qd niche key (== NicheKey) AND its id — keying by id ALONE is wrong,
	// since two survivors can share an id while living in different niches (the back-map would
	// then return the wrong rich Variant / fitness). The (nicheKey, id) pair is unique.
	byKeyID := map[string]Variant{}
	for _, v := range survivors {
		k := NicheKey(v) + "\x00" + v.ID
		// Keep the MAX-fitness survivor per (nicheKey, id) — qd.Elites selects the
		// max-fitness variant, so the rich back-map must agree (two survivors can share
		// both niche and id while differing in fitness).
		if prev, ok := byKeyID[k]; !ok || v.Fitness > prev.Fitness {
			byKeyID[k] = v
		}
	}
	out := map[string]Variant{}
	for key, e := range elites {
		if v, ok := byKeyID[key+"\x00"+e.ID]; ok {
			out[key] = v
		}
	}
	return out
}

// --- Promote: the per-project authority-gated promotion ---------------------------

// PromotionVerdict is a Promote outcome — re-exported from S42.
type PromotionVerdict = evolve.PromotionVerdict

const (
	// PromotionProposed — the gate passed: a PROPOSAL is produced (it writes no truth).
	PromotionProposed = evolve.PromotionProposed
	// PromotionRefused — the gate failed.
	PromotionRefused = evolve.PromotionRefused
)

// PromotionResult is the pure verdict of Promote — re-exported from S42 so the gate's
// shape (verdict, proposal, reason, block_reason) is identical here.
type PromotionResult = evolve.PromotionResult

// Promote is the PURE per-project promotion gate (KRD §66.1, §62 ②). It delegates the
// three-condition gate to the CONSUMED S42 evolve.Promote (mirror_green ∧
// out_of_sample_green ∧ authority_approval) — a passing gate yields a PROPOSAL, never a
// truth write; a red-mirror variant is refused WHATEVER its fitness; a mirror-green-but-
// out-of-sample-red variant is refused (§87). S108 ADDS one frontier check BEFORE the
// gate: a variant whose project does not match the fixed mirror's is refused with
// CROSS_PROJECT (the S55 wall) — a variant can never be promoted into a foreign project.
//
// Total/deterministic: any variant/evidence yields a verdict, never a panic, reads no
// clock. The élite-green variant is promotable ONLY with authority approval — the done
// criterion made executable.
func Promote(m FixedMirror, v Variant, authorityApproved bool) PromotionResult {
	if v.ProjectID != m.ProjectID {
		br := blockreason.For(blockreason.CodeSandboxEscape)
		return PromotionResult{
			Verdict:     PromotionRefused,
			BlockReason: &br,
			Reason: "promotion refusée : la variante appartient à un autre projet que le miroir fixe " +
				"(le mur S55 — une variante n'est jamais promue dans un projet étranger).",
		}
	}
	e := evolve.Evidence{
		Mirror:            v.Mirror,
		OutOfSample:       v.OutOfSample,
		AuthorityApproved: authorityApproved,
		Fitness:           v.Fitness,
	}
	return evolve.Promote(evolve.Variant{ID: v.ID, Niche: NicheKey(v)}, e)
}

// --- RunMediumLoop: the per-project orchestration shape ---------------------------

// EmittedWrite is one write the per-project run emits — re-exported from S42. Every
// emitted path is under a can_write zone (the loop never governs).
type EmittedWrite = evolve.EmittedWrite

// ProjectEvolutionRun is the pure shape of one per-project medium-loop pass: the fixed
// mirror it ran under, the surviving élites it kept per niche, the variants it killed,
// and the sandbox writes it emitted — ONLY branches/reports/ideas. It writes NOTHING; the
// VALUE is what the evolve MCP persists via the privileged `aidos` writer.
type ProjectEvolutionRun struct {
	Mirror     FixedMirror        `json:"mirror"`
	Niches     map[string]Variant `json:"niches"`
	Killed     []string           `json:"killed"`
	Emitted    []EmittedWrite     `json:"emitted"`
	GateableBy map[string]string  `json:"gateable_by"` // nicheKey → "authority_approval ∧ out_of_sample_green"
}

// confineEmitted asserts (defensively) that an emitted write is under a can_write zone.
// It mirrors the S42 invariant; a path that escapes is dropped (never emitted) so the
// run VALUE can never carry a governing write.
func confineEmitted(path string) bool {
	return evolve.Confine(evolve.WriteAttempt{Path: path}).Verdict == evolve.VerdictAllowed
}

// RunMediumLoop is the PURE per-project orchestration shape (KRD §62, §64, §66). Given a
// fixed user mirror and the variants the generator proposed, it: (1) CULLS the
// mirror-breakers (the truth-breaking variants are killed), (2) places the survivors into
// project-scoped Pareto QD niches, and (3) emits ONLY a branch + a report per surviving
// élite and ONE idea/proposed per niche — never a kernel write. It runs no generator and
// no backtest (those live behind the MCP capabilities); it is a deterministic, replayable
// function of (mirror, variants).
//
// The keystone invariant (the rapid property pins it): EVERY emitted write path is under
// a can_write zone — the loop NEVER governs — and a mirror-breaking variant is NEVER among
// the niche élites. Promotion of any élite still requires authority (GateableBy records
// the remaining gate per niche).
func RunMediumLoop(m FixedMirror, variants []Variant) ProjectEvolutionRun {
	cull := Cull(m, variants)
	niches := Niches(m, variants)

	emitted := []EmittedWrite{}
	gateable := map[string]string{}
	// Stable iteration order over niche keys so a run is byte-replayable.
	keys := make([]string, 0, len(niches))
	for k := range niches {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		v := niches[key]
		branch := evolve.ZoneBranchesEvolution + "/" + v.ID
		report := evolve.ZoneReports + "/" + v.ID + ".json"
		idea := evolve.ZoneIdeasProposed + "/" + m.ProjectID + "-" + sanitize(v.Niche) + "-" + v.ID
		for _, p := range []string{branch, report, idea} {
			if confineEmitted(p) {
				zone := zoneOf(p)
				emitted = append(emitted, EmittedWrite{Zone: zone, Path: p})
			}
		}
		gateable[key] = "authority_approval ∧ out_of_sample_green"
	}
	sort.Slice(emitted, func(i, j int) bool { return emitted[i].Path < emitted[j].Path })

	return ProjectEvolutionRun{
		Mirror:     m,
		Niches:     niches,
		Killed:     cull.Killed,
		Emitted:    emitted,
		GateableBy: gateable,
	}
}

// sanitize replaces niche separators so the idea path is a single legal segment.
func sanitize(s string) string { return strings.ReplaceAll(s, "/", "_") }

// zoneOf returns the can_write zone prefix a path lands under (pure, total).
func zoneOf(path string) string {
	switch {
	case strings.HasPrefix(path, evolve.ZoneBranchesEvolution):
		return evolve.ZoneBranchesEvolution
	case strings.HasPrefix(path, evolve.ZoneReports):
		return evolve.ZoneReports
	case strings.HasPrefix(path, evolve.ZoneIdeasProposed):
		return evolve.ZoneIdeasProposed
	default:
		return ""
	}
}
