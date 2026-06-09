// Package learn implements the AIDOS S107 `/learn` LOOP-CLOSURE
// (ROADMAP-app-builder §S107, EPIC 12 / E12, KRD §53/§67/§42/§98) — the deterministic
// mechanics by which a production incident becomes a NEW tooth in the kernel:
//
//	Incident (RealityMirror, provenance=incident, S106/S43)
//	   → [draft Idea]        reality.Learn  (REUSED — S43)
//	   → [human] grill → /goal → APPROVED new Mirror   (the only judgment, above the wall)
//	   → BumpHash(target, mirror)   the content address of the operation/policy MOVES
//	   → TargetedWave(bump, edges)  redwave.Impact (REUSED — S22) seeds the worklist
//
// THE LOAD-BEARING S107 CONTRACT — the three done-criteria, all DETERMINISTIC CODE:
//
//  1. INCIDENT → DRAFT IDEA → APPROVED MIRROR → RED WAVE (the Godog journey). The loop
//     does NOT author the approved mirror — the mirror is an INPUT, the outcome of the
//     human's /goal. learn only (a) verifies the incident's idea-candidate carries
//     provenance=incident and wrote no kernel (reality.Learn, REUSED), (b) computes the
//     hash bump the approved mirror's reflection causes on the target, and (c) seeds the
//     targeted red wave over the bumped target. The "facts change" is resolved MECHANICALLY:
//     a new content-addressed reflection ⇒ a new target hash ⇒ a targeted wave.
//
//  2. NOTHING LEARNS ITS OWN FITNESS (KRD §8 anti-circularity; the property). This package
//     touches the `fitness` schema NOWHERE — it has no import of it, no read, no write. The
//     approved mirror is supplied by the human (above the wall); learn never writes a
//     truth-test it would then satisfy. WroteKernel is ALWAYS false. The wall
//     (reality.ToKernel) is RE-ASSERTED to refuse the direct edge Incident→Kernel
//     (REALITY_CANNOT_DECLARE_TRUTH). The world teaches; the agent never learns its own
//     fitness.
//
//  3. THE HASH BUMP IS A DETERMINISTIC CONTENT-ADDRESS DELTA (CLAUDE.md §6 determinism-first;
//     ROADMAP §S107 "le hash policy/operation change … résolu mécaniquement"). BumpHash
//     REUSES records.Canonicalize + records.Hash — never a forked hashing path. Attaching the
//     approved mirror's reflection to the target's spec body re-canonicalises and re-hashes:
//     same target + same mirror ⇒ byte-identical (before, after) pair, and after != before
//     IFF the reflection actually changes the body (a no-op attachment yields NO bump and an
//     EMPTY wave — a cosmetic re-reflection is not a tooth).
//
// REUSE, DON'T REINVENT (ADR 0007/0020): the incident→idea edge + the always-refused kernel
// gate are S43 runtime/reality; the targeted wave is S22 runtime/redwave.Impact; the content
// address is S01/S02 records.Hash/Canonicalize; the link graph is S17 links. S107 ADDS only the
// hash-bump-on-mirror-attach and the loop-closure assembly — it forks none of them.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every exported function is PURE and TOTAL — no DB, no
// clock, no rng, no I/O, never panics. The reproducibility mirror learn_property_test.go pins
// same-input ⇒ same-output for the bump AND the wave, the wall always-holds, and the
// no-own-fitness invariant (the package never names the fitness schema).
package learn

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/reality"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// TargetKind is the CLOSED set of kernel layers a learned mirror can attach to — exactly the
// two §S107 names (an operation or a policy). A learned tooth never lands on a button or an
// entity directly: the incident is about behaviour (an operation failing, a policy that should
// have fired), so the new mirror reflects an operation or a policy. The Workbench groups the
// wave by this kind.
type TargetKind string

const (
	// TargetOperation — the new mirror reflects an OPERATION (e.g. createOrder, §S107 example).
	TargetOperation TargetKind = "operation"
	// TargetPolicy — the new mirror reflects a POLICY (e.g. out-of-stock-during-checkout, §S107).
	TargetPolicy TargetKind = "policy"
)

// IsKnownTargetKind reports whether k is one of the two closed S107 target kinds.
func IsKnownTargetKind(k TargetKind) bool {
	return k == TargetOperation || k == TargetPolicy
}

// ApprovedMirror is the OUTCOME of the human's /goal: a content-addressed mirror reflection the
// loop ATTACHES to a target. It is an INPUT to learn (the agent never authors it — anti-circularity,
// KRD §8). MirrorID is the new mirror's content hash (computed at /goal over its Gherkin/property
// source, S06/S25 — not here). Reflects names the target it reddens FIRST (the §42/§98 mirror-first
// seed). It carries no assertion text: learn does not read what the mirror promises, only THAT it
// reflects the target — the promise is the human's, the bump is mechanical.
type ApprovedMirror struct {
	// MirrorID is the new mirror's content hash (the address the /goal froze). Required, non-empty.
	MirrorID string `json:"mirror_id"`
	// Reflects is the target ref the mirror reflects (id@version of the operation/policy).
	Reflects links.Ref `json:"reflects"`
}

// Target is the kernel source the incident teaches a lesson about — an operation or a policy,
// content-addressed by its spec body (S01/S02). SpecBody is the canonical JSON of the target's
// AST BEFORE the new reflection is attached; ID@Version is its current pinned head (the from-side
// of the edges). The loop re-canonicalises SpecBody+the new reflection to compute the bump.
type Target struct {
	// Kind is the layer (operation/policy) — one of the closed TargetKind set.
	Kind TargetKind `json:"kind"`
	// ID is the target's content hash / id at the current head.
	ID string `json:"id"`
	// Version is the target's current head version (the bump moves it).
	Version string `json:"version"`
	// SpecBody is the canonical JSON of the target's AST body BEFORE the reflection attaches.
	SpecBody json.RawMessage `json:"spec_body"`
}

// Ref returns the target's pinned link ref (id@version) — the consuming `from` side of its edges.
func (t Target) Ref() links.Ref { return links.Ref{ID: t.ID, Version: t.Version} }

// Bump is the deterministic content-address delta a learned mirror causes on its target. Before
// is the target's hash without the reflection; After is its hash with the reflection attached.
// Moved reports whether the address actually changed (After != Before) — a no-op re-reflection
// does NOT move it (and seeds no wave). The bump is the SEED of the targeted red wave.
type Bump struct {
	// TargetID is the id the bump applies to.
	TargetID string `json:"target_id"`
	// Before is the target's content hash BEFORE the reflection (the old head body's hash).
	Before string `json:"before"`
	// After is the target's content hash AFTER the reflection attaches (the new head).
	After string `json:"after"`
	// Moved is After != Before — true IFF the reflection actually changes the body.
	Moved bool `json:"moved"`
}

// Errors of the learn surface.
var (
	// ErrUnknownTargetKind — a target whose kind is outside the closed {operation, policy} set.
	ErrUnknownTargetKind = fmt.Errorf("learn: target kind is not one of {operation, policy} (closed set)")
	// ErrNoMirrorID — an approved mirror with no content address (it was never frozen at /goal).
	ErrNoMirrorID = fmt.Errorf("learn: approved mirror has no mirror_id (not frozen at /goal)")
	// ErrReflectMismatch — the approved mirror reflects a ref that is not the target (a learned
	// mirror must reflect the very target it bumps — no cross-attachment).
	ErrReflectMismatch = fmt.Errorf("learn: approved mirror does not reflect the bumped target")
	// ErrBadSpecBody — the target's spec body is not valid JSON (cannot be canonicalised/hashed).
	ErrBadSpecBody = fmt.Errorf("learn: target spec_body is not valid JSON")
)

// reflectionAttached returns the canonical JSON of the target's spec body WITH the approved
// mirror's reflection attached under a stable "_reflections" key (a sorted, deduped set of mirror
// ids). It is the body the bumped head hashes over. Attaching a reflection is ADDITIVE and
// append-only: the prior reflections are preserved, the new id merged in, the set sorted so the
// address is order-independent. REUSES records.Canonicalize (never a forked encoder).
func reflectionAttached(specBody json.RawMessage, mirrorID string) ([]byte, error) {
	var obj map[string]any
	if err := json.Unmarshal(specBody, &obj); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrBadSpecBody, err)
	}
	if obj == nil {
		obj = map[string]any{}
	}
	// Read the prior reflection set (if any) into a string set.
	set := map[string]struct{}{}
	if raw, ok := obj["_reflections"]; ok {
		if arr, ok := raw.([]any); ok {
			for _, v := range arr {
				if s, ok := v.(string); ok {
					set[s] = struct{}{}
				}
			}
		}
	}
	set[mirrorID] = struct{}{}
	ids := make([]string, 0, len(set))
	for id := range set {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	obj["_reflections"] = ids
	merged, err := json.Marshal(obj)
	if err != nil {
		return nil, fmt.Errorf("learn: re-marshal reflected body: %w", err)
	}
	return records.Canonicalize(merged)
}

// BumpHash computes the deterministic content-address delta the approved mirror causes on the
// target (done-criterion 3: "le hash policy/operation change … mécaniquement"). It REUSES
// records.Canonicalize + records.Hash for BOTH sides, so the (before, after) pair is byte-stable:
// same target + same mirror ⇒ identical Bump. After != Before IFF the reflection actually changes
// the canonical body (a re-reflection of an already-attached mirror yields Moved=false — no tooth).
// Pure, total. Validates the inputs first (unknown kind / no mirror id / reflect-mismatch / bad body).
func BumpHash(t Target, m ApprovedMirror) (Bump, error) {
	if !IsKnownTargetKind(t.Kind) {
		return Bump{}, fmt.Errorf("%w: %q", ErrUnknownTargetKind, t.Kind)
	}
	if m.MirrorID == "" {
		return Bump{}, ErrNoMirrorID
	}
	if m.Reflects != t.Ref() {
		return Bump{}, fmt.Errorf("%w: mirror reflects %s, target is %s", ErrReflectMismatch, m.Reflects, t.Ref())
	}
	beforeCanon, err := records.Canonicalize(t.SpecBody)
	if err != nil {
		return Bump{}, fmt.Errorf("%w: %v", ErrBadSpecBody, err)
	}
	afterCanon, err := reflectionAttached(t.SpecBody, m.MirrorID)
	if err != nil {
		return Bump{}, err
	}
	before := records.Hash(beforeCanon)
	after := records.Hash(afterCanon)
	return Bump{
		TargetID: t.ID,
		Before:   before,
		After:    after,
		Moved:    after != before,
	}, nil
}

// TargetedWave seeds the red wave the bump triggers (done-criterion 1: "un red wave ciblé devient
// la worklist"). When the bump MOVED, the target's head has effectively advanced to the After
// address, so every edge pinned to the Before head is now stale — the wave is the redwave.Impact
// closure walked OUTWARD from the mirror (mirror-first, §42/§98). When the bump did NOT move (a
// no-op re-reflection), the wave is EMPTY (no tooth ⇒ no work). TargetedWave REUSES redwave.Impact
// (never forks the wave engine): it bumps exactly the one target id, hands the edges + the
// post-bump heads through, and returns the ordered wave. Pure, total.
//
// heads is the S17 head map AFTER the bump: the bumped target id maps to the new After address, so
// its consumers' pinned (Before) versions resolve stale. edges is the target's link graph (its
// mirror reflection edge first, then projections). A nil/empty edge graph yields an empty wave.
func TargetedWave(b Bump, edges []redwave.Edge, heads links.Heads) redwave.RedWave {
	if !b.Moved {
		return redwave.RedWave{}
	}
	return redwave.Impact([]string{b.TargetID}, edges, heads)
}

// WallVerdict is the RE-ASSERTION of the wall (done-criterion 2 + KRD §53/§1099): the loop NEVER
// declares truth. It is *blockreason.BlockReason — ALWAYS non-nil — proving the direct edge
// Incident→Kernel is refused (REALITY_CANNOT_DECLARE_TRUTH). The loop's only legal continuation is
// the one already taken: incident → draft idea → human /goal → approved mirror (an input). REUSES
// reality.ToKernel (never a forked gate). Pure, total.
func WallVerdict(inc reality.Incident) *blockreason.BlockReason {
	return reality.ToKernel(inc)
}

// Outcome is the full, deterministic result of closing the /learn loop on one approved mirror — the
// value the MCP and the Workbench render. It carries the draft-idea candidate (provenance=incident,
// WroteKernel=false), the hash bump, the targeted red wave (the worklist), and the wall verdict
// (always a refusal). NOTHING in it is authored by the agent's judgment: the idea is reality.Learn,
// the mirror is the human's, the bump and the wave are pure functions.
type Outcome struct {
	// Candidate is the draft idea the incident produced (reality.Learn — provenance=incident).
	Candidate reality.IdeaCandidate `json:"candidate"`
	// ApprovedMirror is the human-frozen mirror the loop attached (the only judgment, above the wall).
	ApprovedMirror ApprovedMirror `json:"approved_mirror"`
	// Bump is the content-address delta the mirror caused on the target.
	Bump Bump `json:"bump"`
	// Wave is the targeted red wave the bump seeded — the worklist (mirror-first).
	Wave redwave.RedWave `json:"wave"`
	// Wall is the re-asserted refusal (always non-nil): reality never declares truth.
	Wall blockreason.BlockReason `json:"wall"`
	// WroteKernel is ALWAYS false — the loop writes no truth (the anti-circularity guarantee).
	WroteKernel bool `json:"wrote_kernel"`
}

// Close runs the full /learn loop deterministically over (incident, approvedMirror, target, edges,
// heads) and returns the Outcome (done-criterion 1, the assembly). It is PURE — it composes
// reality.Learn (the draft idea), WallVerdict (the refusal), BumpHash (the address delta), and
// TargetedWave (the worklist). It writes NOTHING (WroteKernel always false; the fitness schema is
// never named). Same inputs ⇒ identical Outcome. Returns an error only on a malformed input
// (unknown kind / no mirror id / reflect mismatch / bad spec body / un-hashable idea).
func Close(inc reality.Incident, m ApprovedMirror, t Target, edges []redwave.Edge, heads links.Heads) (Outcome, error) {
	cand, err := reality.Learn(inc)
	if err != nil {
		return Outcome{}, fmt.Errorf("learn: close: %w", err)
	}
	bump, err := BumpHash(t, m)
	if err != nil {
		return Outcome{}, fmt.Errorf("learn: close: %w", err)
	}
	wave := TargetedWave(bump, edges, heads)
	wall := WallVerdict(inc)
	return Outcome{
		Candidate:      cand,
		ApprovedMirror: m,
		Bump:           bump,
		Wave:           wave,
		Wall:           *wall,
		WroteKernel:    false,
	}, nil
}
