// Package collab is the S113 COLLABORATION SUBSTRATE — the pure, deterministic twin of a
// project's social plane: identified provenance on every act, comments on
// ideas/miroirs/changesets, an append-only activity feed, real-time presence with
// last-writer-protected concurrent editing, and the AdoptionStage ladder surfaced PER
// PROJECT (its current stage + the next dent).
//
// IT SITS ABOVE S62 (membership) AND S110 (team approval). Every below-the-line social
// act first asks the S62 authority "may THIS resolved identity perform THIS op?" — a
// non-member is refused NOT_A_MEMBER, a too-low role ROLE_FORBIDDEN. In particular an
// approval (S110) requires administer authority: a member WITHOUT it can never approve
// (the Godog done-criterion). The actor is ALWAYS a real, resolved identity (S61) — the
// provenance is NEVER a placeholder (the second Godog done-criterion).
//
// THE WALL (CLAUDE.md §2). Comments, shares, invites, feed entries and presence are all
// BELOW the line — they live in their own `collab` (accounts-adjacent) below-the-line
// zone, NEVER kernel/mirrors/fitness. They act directly. A truth-write (approving a
// ChangeSet) is the S110/S20 propose→ChangeSet path — this package only AUTHORIZES the
// act and RECORDS the provenance; it never writes truth itself.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is a PURE TOTAL function of its
// inputs: authorize/comment/share/invite/record/presence/stage are parse, validate, hash,
// authorize, count, route — no clock, no rng, no I/O, no LLM. The id of every record is
// content-addressed (records.Hash) → idempotent. Same input ⇒ same output (the property
// mirror pins it). The actor identity is carried in, never invented.
package collab

import (
	"encoding/json"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/adoption"
	"github.com/steph-frtech/aidos/back/runtime/membership"
)

// ---- actor (identified provenance) -----------------------------------------------------

// Actor is the resolved identity (S61) performing a social act, bound to the project (S53)
// it acts in. A zero/blank identity is NEVER a valid actor — provenance is never a
// placeholder (the Godog done-criterion). It carries the actor's membership so authority
// is checked against a REAL role, not a guess.
type Actor struct {
	// Identity is the propagated caller identity (accounts.users.id, S61) — the SAME value
	// S62 membership and the RLS GUC key on. The empty string is rejected everywhere.
	Identity string `json:"identity"`
	// ProjectID is the project the act is scoped to (projects.project.id, S53).
	ProjectID string `json:"project_id"`
	// Member is the actor's membership in ProjectID, or nil when the identity holds no row
	// (a non-member). Carried in so Authorize is a pure function of the actor.
	Member *membership.Membership `json:"-"`
}

// IsIdentified reports whether the actor carries a real, non-blank identity AND project.
// The provenance-never-placeholder gate: a social act with an unidentified actor is refused.
func (a Actor) IsIdentified() bool {
	return strings.TrimSpace(a.Identity) != "" && strings.TrimSpace(a.ProjectID) != ""
}

// ---- block reasons (the §2 actionable shape) -------------------------------------------

// BlockCode is the stable, machine-readable code of a collab refusal.
type BlockCode string

const (
	// CodeUnidentifiedActor — a social act attempted with a blank/placeholder identity or
	// project. Provenance must never be a placeholder; this is the gate.
	CodeUnidentifiedActor BlockCode = "UNIDENTIFIED_ACTOR"
	// CodeNotAMember — re-surfaced from S62: the actor holds no membership row here.
	CodeNotAMember BlockCode = "NOT_A_MEMBER"
	// CodeRoleForbidden — re-surfaced from S62: the actor's role is too low for the op
	// (e.g. a viewer commenting-as-mutate, a non-owner approving a changeset).
	CodeRoleForbidden BlockCode = "ROLE_FORBIDDEN"
	// CodeEmptyBody — a comment/invite with no body/target is half-formed; refused.
	CodeEmptyBody BlockCode = "EMPTY_BODY"
	// CodeStageGateUnmet — an attempt to advance the project's AdoptionStage past the next
	// dent whose gate is not yet reached ("done is computed", §8).
	CodeStageGateUnmet BlockCode = "STAGE_GATE_UNMET"
)

// BlockReason is the actionable refusal (CLAUDE.md §2): code, severity, explanation, how_to_fix.
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

// Verdict is the allow/deny outcome of an authorization.
type Verdict string

const (
	VerdictAllow Verdict = "allow"
	VerdictDeny  Verdict = "deny"
)

// Decision is the authorization outcome of a social act: a verdict and, when denied, the
// actionable reason. It NEVER carries the actor's confidence — the judge is deterministic.
type Decision struct {
	Verdict     Verdict      `json:"verdict"`
	BlockReason *BlockReason `json:"block_reason,omitempty"`
}

// ---- act kinds & their required authority ----------------------------------------------

// Act is a below-the-line social act this package authorizes + records.
type Act string

const (
	// ActComment — write a comment on an idea/miroir/changeset. Any member may comment.
	ActComment Act = "comment"
	// ActShare — share/grant access to a project (read view). Any member may share-read,
	// but it is an administer act when it grants a role (handled by invite).
	ActShare Act = "share"
	// ActInvite — invite a new member / change a role. Administer (owner) only.
	ActInvite Act = "invite"
	// ActApprove — approve a ChangeSet (the S110 team-approval gate). Administer only:
	// a member WITHOUT administer authority can NEVER approve (the Godog done-criterion).
	ActApprove Act = "approve"
)

// requiredOp maps each social act to the S62 op-kind whose authority it needs. A read-only
// act (comment, share) needs membership only (read); a governing act (invite, approve)
// needs administer authority.
func requiredOp(act Act) membership.OpKind {
	switch act {
	case ActComment, ActShare:
		return membership.OpRead
	case ActInvite, ActApprove:
		return membership.OpAdminister
	default:
		return membership.OpAdminister // unknown acts default to the strictest gate.
	}
}

// Authorize is the single deterministic gate for every social act. PURE and total: it
// (1) refuses an unidentified actor (provenance-never-placeholder), then (2) delegates to
// the S62 membership authority for the act's required op. A member without administer
// authority is refused ROLE_FORBIDDEN for invite/approve — so an approval by a non-admin
// member is impossible. No clock, no I/O, no LLM.
func Authorize(actor Actor, act Act) Decision {
	if !actor.IsIdentified() {
		return Decision{Verdict: VerdictDeny, BlockReason: unidentifiedActorReason()}
	}
	op := requiredOp(act)
	d := membership.Authorize(actor.Member, actor.ProjectID, op)
	if d.Verdict == membership.VerdictAllow {
		return Decision{Verdict: VerdictAllow}
	}
	// Translate the S62 refusal into a collab BlockReason (codes are shared by value).
	if d.BlockReason != nil && d.BlockReason.Code == membership.CodeNotAMember {
		return Decision{Verdict: VerdictDeny, BlockReason: notAMemberReason(actor.ProjectID)}
	}
	return Decision{Verdict: VerdictDeny, BlockReason: roleForbiddenReason(act)}
}

// CanApprove is the named S110 gate: the actor may approve a ChangeSet iff Authorize for
// ActApprove allows. A member WITHOUT administer authority can never approve.
func CanApprove(actor Actor) bool {
	return Authorize(actor, ActApprove).Verdict == VerdictAllow
}

func unidentifiedActorReason() *BlockReason {
	return &BlockReason{
		Code:        CodeUnidentifiedActor,
		Severity:    "error",
		Explanation: "l'acte social a été tenté sans identité résolue — la provenance ne doit JAMAIS être un placeholder (« qui a voulu quoi » avec de vrais users).",
		HowToFix: []string{
			"authentifiez-vous (S61) pour résoudre une identité réelle",
			"agissez dans un projet précis (project_id non vide)",
		},
	}
}

func notAMemberReason(projectID string) *BlockReason {
	return &BlockReason{
		Code:        CodeNotAMember,
		Severity:    "error",
		Explanation: "l'identité résolue ne détient aucune adhésion dans « " + projectID + " » — un non-membre ne peut pas agir sur ce projet.",
		HowToFix: []string{
			"demandez à un owner du projet de vous inviter (/invite)",
			"vérifiez que vous agissez dans le bon projet",
		},
	}
}

func roleForbiddenReason(act Act) *BlockReason {
	return &BlockReason{
		Code:        CodeRoleForbidden,
		Severity:    "error",
		Explanation: "le rôle de ce membre est trop bas pour l'acte « " + string(act) + " » : approuver/inviter exige l'autorité administer (owner).",
		HowToFix: []string{
			"demandez à un owner d'effectuer cet acte",
			"demandez une promotion de rôle (viewer→editor→owner) à un owner",
		},
	}
}

// ---- comments (on ideas / miroirs / changesets) ----------------------------------------

// TargetKind is what a comment is anchored to. Closed set — the three commentable surfaces
// the roadmap names (ideas, miroirs, changesets).
type TargetKind string

const (
	TargetIdea      TargetKind = "idea"
	TargetMirror    TargetKind = "mirror"
	TargetChangeSet TargetKind = "changeset"
)

func (k TargetKind) isValid() bool {
	switch k {
	case TargetIdea, TargetMirror, TargetChangeSet:
		return true
	}
	return false
}

// Comment is a below-the-line annotation on an idea/miroir/changeset, stamped with its
// REAL author (provenance) and content-addressed. Append-only; never edits truth.
type Comment struct {
	ID         string     `json:"id"`
	Author     string     `json:"author"`      // the actor identity — never a placeholder.
	ProjectID  string     `json:"project_id"`  // the scope (S53/S54).
	TargetKind TargetKind `json:"target_kind"` // idea | mirror | changeset.
	TargetID   string     `json:"target_id"`   // the commented record's id.
	Body       string     `json:"body"`        // the comment text (non-empty).
}

const commentBodyKind = "collab_comment"

type commentBody struct {
	Kind       string `json:"kind"`
	Author     string `json:"author"`
	ProjectID  string `json:"project_id"`
	TargetKind string `json:"target_kind"`
	TargetID   string `json:"target_id"`
	Body       string `json:"body"`
}

// Comment authorizes (membership) then builds a content-addressed Comment stamped with the
// actor's REAL identity. PURE: the id is records.Hash(canonical body) → idempotent; the
// author is actor.Identity, NEVER a placeholder. Returns the refusal Decision on deny.
func (actor Actor) Comment(target TargetKind, targetID, body string) (Comment, Decision, error) {
	if d := Authorize(actor, ActComment); d.Verdict != VerdictAllow {
		return Comment{}, d, nil
	}
	targetID = strings.TrimSpace(targetID)
	body = strings.TrimSpace(body)
	if !target.isValid() || targetID == "" || body == "" {
		return Comment{}, Decision{Verdict: VerdictDeny, BlockReason: emptyBodyReason("comment")}, nil
	}
	cb := commentBody{
		Kind: commentBodyKind, Author: actor.Identity, ProjectID: actor.ProjectID,
		TargetKind: string(target), TargetID: targetID, Body: body,
	}
	id, err := hashBody(cb)
	if err != nil {
		return Comment{}, Decision{}, err
	}
	return Comment{
		ID: id, Author: actor.Identity, ProjectID: actor.ProjectID,
		TargetKind: target, TargetID: targetID, Body: body,
	}, Decision{Verdict: VerdictAllow}, nil
}

// ---- share / invite --------------------------------------------------------------------

// Invite is a below-the-line membership grant (invite a member / change a role), stamped
// with the REAL inviter. Authorizing an invite needs administer authority (owner) — a
// non-owner is refused ROLE_FORBIDDEN. It does NOT write the membership row itself (the
// S62 below-the-line store does); it records who invited whom, with what role.
type Invite struct {
	ID        string          `json:"id"`
	Inviter   string          `json:"inviter"` // the actor identity — never a placeholder.
	Invitee   string          `json:"invitee"` // the invited identity (non-empty).
	ProjectID string          `json:"project_id"`
	Role      membership.Role `json:"role"` // the granted role.
}

const inviteBodyKind = "collab_invite"

type inviteBody struct {
	Kind      string `json:"kind"`
	Inviter   string `json:"inviter"`
	Invitee   string `json:"invitee"`
	ProjectID string `json:"project_id"`
	Role      string `json:"role"`
}

// Invite authorizes (administer) then records a content-addressed Invite stamped with the
// REAL inviter. PURE: refuses a non-owner ROLE_FORBIDDEN; refuses a blank invitee/invalid
// role EMPTY_BODY. The provenance (inviter) is actor.Identity, never a placeholder.
func (actor Actor) Invite(invitee string, role membership.Role) (Invite, Decision, error) {
	if d := Authorize(actor, ActInvite); d.Verdict != VerdictAllow {
		return Invite{}, d, nil
	}
	invitee = strings.TrimSpace(invitee)
	if invitee == "" || !role.IsValid() {
		return Invite{}, Decision{Verdict: VerdictDeny, BlockReason: emptyBodyReason("invite")}, nil
	}
	ib := inviteBody{
		Kind: inviteBodyKind, Inviter: actor.Identity, Invitee: invitee,
		ProjectID: actor.ProjectID, Role: string(role),
	}
	id, err := hashBody(ib)
	if err != nil {
		return Invite{}, Decision{}, err
	}
	return Invite{
		ID: id, Inviter: actor.Identity, Invitee: invitee,
		ProjectID: actor.ProjectID, Role: role,
	}, Decision{Verdict: VerdictAllow}, nil
}

func emptyBodyReason(what string) *BlockReason {
	return &BlockReason{
		Code:        CodeEmptyBody,
		Severity:    "error",
		Explanation: "le « " + what + " » est à moitié formé (corps/cible vide ou rôle invalide) — un acte social n'est jamais à demi.",
		HowToFix:    []string{"fournissez une cible et un corps non vides", "pour un invite, un rôle valide (owner|editor|viewer)"},
	}
}

// ---- activity feed (append-only) -------------------------------------------------------

// FeedEntry is one append-only line of a project's activity feed, stamped with the REAL
// actor. The feed records WHO did WHAT (act + target) — never a placeholder author. It is
// content-addressed and ordered by Seq (a caller-supplied monotone sequence — NOT a clock,
// keeping the package pure).
type FeedEntry struct {
	ID        string `json:"id"`
	Actor     string `json:"actor"` // never a placeholder.
	ProjectID string `json:"project_id"`
	Act       Act    `json:"act"`
	Target    string `json:"target"` // a human/ref description of what was acted on.
	Seq       int    `json:"seq"`    // caller-supplied monotone order (deterministic, no clock).
}

const feedBodyKind = "collab_feed_entry"

type feedBody struct {
	Kind      string `json:"kind"`
	Actor     string `json:"actor"`
	ProjectID string `json:"project_id"`
	Act       string `json:"act"`
	Target    string `json:"target"`
	Seq       int    `json:"seq"`
}

// Record appends a content-addressed FeedEntry stamped with the REAL actor identity. PURE
// and total: same (actor, act, target, seq) ⇒ same id (idempotent). The actor is never a
// placeholder — an unidentified actor is refused before any record is made.
func (actor Actor) Record(act Act, target string, seq int) (FeedEntry, Decision, error) {
	if !actor.IsIdentified() {
		return FeedEntry{}, Decision{Verdict: VerdictDeny, BlockReason: unidentifiedActorReason()}, nil
	}
	fb := feedBody{
		Kind: feedBodyKind, Actor: actor.Identity, ProjectID: actor.ProjectID,
		Act: string(act), Target: strings.TrimSpace(target), Seq: seq,
	}
	id, err := hashBody(fb)
	if err != nil {
		return FeedEntry{}, Decision{}, err
	}
	return FeedEntry{
		ID: id, Actor: actor.Identity, ProjectID: actor.ProjectID,
		Act: act, Target: strings.TrimSpace(target), Seq: seq,
	}, Decision{Verdict: VerdictAllow}, nil
}

// Feed sorts entries into the canonical activity-feed order (Seq ascending, id tiebreak) —
// a PURE, deterministic projection. Same set ⇒ same order. It mutates nothing (works on a
// copy).
func Feed(entries []FeedEntry) []FeedEntry {
	out := append([]FeedEntry(nil), entries...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Seq != out[j].Seq {
			return out[i].Seq < out[j].Seq
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// ---- presence & concurrent edit (S68/S75) ----------------------------------------------

// Presence is one user's live presence on a shared canvas/mirror (S75 canvas, S68 mirrors).
// Several presences coexist on the same canvas WITHOUT overwriting each other (the fixture
// done-criterion): each is keyed by its own (identity), so a second user joining ADDS a
// presence, never replaces the first.
type Presence struct {
	Identity  string `json:"identity"`   // never a placeholder.
	ProjectID string `json:"project_id"` // the project (S53).
	CanvasID  string `json:"canvas_id"`  // the shared surface (a canvas S75 / a mirror S68).
}

// Canvas is the set of presences on one shared surface, plus the last-claimed edit lock.
// It is a value type; Join/Edit return a NEW canvas (pure, no mutation) so two users acting
// concurrently never silently clobber the shared state.
type Canvas struct {
	CanvasID  string     `json:"canvas_id"`
	ProjectID string     `json:"project_id"`
	Present   []Presence `json:"present"` // sorted by identity, deduped.
	// LockHolder is the identity that currently holds the edit lock on the canvas (last
	// writer wins ONLY by an explicit, recorded claim — never a silent overwrite). Empty
	// when no one holds it.
	LockHolder string `json:"lock_holder,omitempty"`
}

// Join returns a NEW Canvas with actor present. Two users joining the same canvas both
// appear — the second NEVER overwrites the first (the fixture done-criterion). PURE: the
// presence set is deduped by identity and sorted (deterministic). An unidentified actor is
// rejected (Decision deny). Idempotent: re-joining the same identity is a no-op.
func (c Canvas) Join(actor Actor) (Canvas, Decision) {
	if !actor.IsIdentified() {
		return c, Decision{Verdict: VerdictDeny, BlockReason: unidentifiedActorReason()}
	}
	out := Canvas{CanvasID: c.CanvasID, ProjectID: c.ProjectID, LockHolder: c.LockHolder}
	if out.CanvasID == "" {
		out.CanvasID = strings.TrimSpace(actorCanvas(actor, c.CanvasID))
	}
	if out.ProjectID == "" {
		out.ProjectID = actor.ProjectID
	}
	seen := make(map[string]bool, len(c.Present)+1)
	for _, p := range c.Present {
		if seen[p.Identity] {
			continue
		}
		seen[p.Identity] = true
		out.Present = append(out.Present, p)
	}
	if !seen[actor.Identity] {
		out.Present = append(out.Present, Presence{
			Identity: actor.Identity, ProjectID: out.ProjectID, CanvasID: out.CanvasID,
		})
	}
	sort.SliceStable(out.Present, func(i, j int) bool { return out.Present[i].Identity < out.Present[j].Identity })
	return out, Decision{Verdict: VerdictAllow}
}

func actorCanvas(actor Actor, fallback string) string {
	if fallback != "" {
		return fallback
	}
	return actor.ProjectID
}

// PresentCount is the number of distinct users present (a pure count) — used by the UI/MCP
// to show "2 users on this canvas".
func (c Canvas) PresentCount() int { return len(c.Present) }

// IsPresent reports whether identity is currently present on the canvas.
func (c Canvas) IsPresent(identity string) bool {
	for _, p := range c.Present {
		if p.Identity == identity {
			return true
		}
	}
	return false
}

// ClaimLock returns a NEW Canvas with actor holding the edit lock — an EXPLICIT, recorded
// claim, the only way a concurrent edit lands. It NEVER silently overwrites: if another
// user already holds the lock, the claim is REFUSED (deny) — the holder keeps it until it
// is released. PURE: deterministic, no clock. The actor must be present to claim.
func (c Canvas) ClaimLock(actor Actor) (Canvas, Decision) {
	if !actor.IsIdentified() {
		return c, Decision{Verdict: VerdictDeny, BlockReason: unidentifiedActorReason()}
	}
	if !c.IsPresent(actor.Identity) {
		return c, Decision{Verdict: VerdictDeny, BlockReason: &BlockReason{
			Code: CodeRoleForbidden, Severity: "error",
			Explanation: "vous devez être présent sur le canvas pour réclamer le verrou d'édition.",
			HowToFix:    []string{"rejoignez le canvas (Join) avant d'éditer"},
		}}
	}
	if c.LockHolder != "" && c.LockHolder != actor.Identity {
		return c, Decision{Verdict: VerdictDeny, BlockReason: &BlockReason{
			Code: CodeRoleForbidden, Severity: "warning",
			Explanation: "« " + c.LockHolder + " » détient déjà le verrou d'édition — deux utilisateurs n'écrasent jamais le même canvas en silence.",
			HowToFix:    []string{"attendez que le détenteur relâche le verrou", "éditez une autre zone"},
		}}
	}
	out := c
	out.Present = append([]Presence(nil), c.Present...)
	out.LockHolder = actor.Identity
	return out, Decision{Verdict: VerdictAllow}
}

// ReleaseLock returns a NEW Canvas with the lock released, iff actor holds it.
func (c Canvas) ReleaseLock(actor Actor) Canvas {
	out := c
	out.Present = append([]Presence(nil), c.Present...)
	if c.LockHolder == actor.Identity {
		out.LockHolder = ""
	}
	return out
}

// ---- per-project adoption stage (the §82.5 ladder, surfaced in product) -----------------

// ProjectStage is the AdoptionStage ladder computed FOR ONE PROJECT from its live
// capability view (S47's pure ladder, surfaced per-project). It carries the project's
// CURRENT stage and the NEXT dent (the smallest ratchet that clicks), so a project surfaces
// "where it is on the ladder" and "what it must reach to advance". The advance is COMPUTED
// ("done is computed", §8) — never declared.
type ProjectStage struct {
	ProjectID string                `json:"project_id"`
	Plan      adoption.AdoptionPlan `json:"plan"`
}

// StageFor computes the per-project AdoptionStage ladder. PURE: it delegates to S47's
// adoption.Plan (the smallest-ratchet-that-clicks engine) over the project's capability
// view. Same view ⇒ same stage. It writes nothing (the wall).
func StageFor(projectID string, capabilities []adoption.Capability) ProjectStage {
	return ProjectStage{ProjectID: projectID, Plan: adoption.Plan(capabilities)}
}

// CanAdvance reports whether the project may advance to its next stage — true iff the next
// dent's gate is reached (no gaps). "Done is computed": the ladder advances ONLY when the
// gate is met. A project already at the top (AllSatisfied) cannot advance further.
func (ps ProjectStage) CanAdvance() (bool, *BlockReason) {
	if ps.Plan.AllSatisfied {
		return false, nil // already at the top — nothing to advance to.
	}
	if len(ps.Plan.NextGaps) == 0 {
		return true, nil // the next dent's gate is reached.
	}
	gaps := make([]string, 0, len(ps.Plan.NextGaps))
	for _, g := range ps.Plan.NextGaps {
		gaps = append(gaps, string(g.Missing)+" — "+g.Reason)
	}
	return false, &BlockReason{
		Code:        CodeStageGateUnmet,
		Severity:    "info",
		Explanation: "le projet « " + ps.ProjectID + " » ne peut pas avancer au palier « " + string(ps.Plan.Next) + " » : la porte n'est pas atteinte (done is computed).",
		HowToFix:    gaps,
	}
}

// CurrentStage and NextStage surface the per-project ladder position to the UI/MCP.
func (ps ProjectStage) CurrentStage() adoption.AdoptionStage { return ps.Plan.Current }
func (ps ProjectStage) NextStage() adoption.AdoptionStage    { return ps.Plan.Next }

// ---- shared content-addressing helper --------------------------------------------------

// hashBody canonicalizes + hashes a record body into its content address. Shared by every
// collab record so they all hash identically (deterministic, idempotent).
func hashBody(body any) (string, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}
