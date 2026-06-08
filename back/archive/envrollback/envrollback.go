// Package envrollback is the AIDOS Archive ENVIRONMENTS + ROLLBACK-TO-PHASE plane (S98;
// app-builder EPIC 10, DP28 / ADR 0043).
//
// THE CAPABILITY (S98 / DP28 done-criteria). Two gestures over the per-app DAG of stable
// phases (S24):
//
//   - PROMOTE a stable phase into an environment (preview → staging → prod). A phase is
//     promotable IFF « done is computed » holds over its cut (the S96 Stop-gate, INHERITED via
//     deploy.IsDeployable: red→green ∧ prior green intact ∧ mutation ≥ threshold ∧ NO MONSTER,
//     KRD §43/§44, CLAUDE.md §8). A non-stable phase is REFUSED with ENV_PROMOTE_NOT_STABLE
//     before anything re-emits — never promote a red mirror to prod.
//
//   - ROLLBACK an environment to an EARLIER stable phase = CHECKOUT of an earlier stable DAG
//     phase that DETERMINISTICALLY RE-PROJECTS the app from that phase (S78, via
//     preview.EmittedAppHash). The truth-store/phase is AUTHORITATIVE; the sandbox code is
//     regenerable and is NEVER restored as-is (CLAUDE.md §9). The target phase must be DISTINCT
//     from the served phase, PRECEDE it in the DAG, and itself be STABLE — else
//     ROLLBACK_NOT_EARLIER. Rollback RECONCILES the datastore (the inverse expand-contract
//     migration; a Doltgres `as-of` checkout when opted-in non-prod) and RECORDS the decision
//     (append-only, provenance §9) — nothing is deleted.
//
// THE RE-PROJECTION PROPERTY (the S98 / DP28 done-criterion). The artifact a rollback produces
// is the RE-PROJECTION of the target phase (its preview.EmittedAppHash), byte-equal to a fresh
// re-emit of N-1 — NEVER a stale sandbox artifact. RollbackProducesReProjection asserts the
// equality deterministically (CODE judges, never an agent). This is the mechanical guarantee
// that « rien supprimé ni restauré comme artefact stale » (DP28).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Promote and Rollback are PURE, TOTAL functions of their
// canonicalised inputs — no clock, no RNG, no map-order leak, no absolute path. Same inputs →
// byte-identical Promotion / RollbackDecision (same id, same re-emitted app hash, same
// datastore-reconciliation plan, same recorded provenance body). The reproducibility mirror
// (envrollback_property_test.go) pins it. REUSES, never reinvents: deploy.IsDeployable (S96)
// for the Stop-gate, preview.EmittedAppHash (S94) for the re-projection address, datamigrate
// (S95) for the inverse data reconciliation, records.Canonicalize+Hash (S02) for the content
// address. The DAG ordering is a pure ancestry check over the supplied lineage (S24).
//
// THE WALL (CLAUDE.md §2/§9). envrollback READS the phases' stable-cut verdicts + the emitted
// surface + the DAG lineage (already-projected facts, below the line) and PLANS the promotion /
// rollback — it writes NOTHING to the kernel/mirrors/fitness. A rollback is NOT a write-to-kernel
// (it re-projects an earlier phase); it is a DECISION, recorded append-only as a content-addressed
// RollbackDecision body (provenance §9) that the Workbench /deploy screen proposes as a ChangeSet
// for approval — never a direct truth-write. A non-stable phase, a non-earlier rollback target —
// each is a typed BlockReason (the S13 shape), never a panic, never an invented phase/hash.
package envrollback

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
	"github.com/steph-frtech/aidos/back/runtime/deploy"
	"github.com/steph-frtech/aidos/back/runtime/preview"
)

// mustJSON marshals a value to JSON for the canonical content-address body. The shapes passed in
// are always JSON-marshalable (plain maps/slices/strings), so an error is a programming fault,
// not a runtime input — it surfaces as "{}" (the hash then differs, never silently equal).
func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return b
}

// Environment is the CLOSED promotion ladder (preview → staging → prod). The order is DECLARED
// (Rank), never derived, so promotion direction is a pure comparison (§8 — declared, never
// learned). Each Pulumi STACK is per-env (DP28, ADR 0043) — the env names the stack suffix.
type Environment string

const (
	// EnvPreview is the ephemeral, lowest environment (S94 — torn down deterministically).
	EnvPreview Environment = "preview"
	// EnvStaging is the lasting pre-prod environment.
	EnvStaging Environment = "staging"
	// EnvProd is the production environment — the RealityMirror sensor target (E12).
	EnvProd Environment = "prod"
)

// envRank is the DECLARED order of the ladder (preview < staging < prod). Used to render the
// stack name and to keep the env set closed; an unknown env is rejected (never invented).
var envRank = map[Environment]int{EnvPreview: 0, EnvStaging: 1, EnvProd: 2}

// Environments returns the closed ladder in promotion order — preview, staging, prod.
func Environments() []Environment { return []Environment{EnvPreview, EnvStaging, EnvProd} }

// isKnownEnv reports whether e is one of the closed ladder rungs.
func isKnownEnv(e Environment) bool { _, ok := envRank[e]; return ok }

// PhaseInput is a single DAG phase as envrollback reads it: its coherent-cut verdict (S23), the
// gate inputs (§8), and its emitted surface (S94 — what RE-EMITS). PURE input — no clock, no host
// path. The phase content address (Phase.Version()) keys everything downstream.
type PhaseInput struct {
	// Phase is the coherent-cut verdict (phases.StablePhase, S23). Its Stable + Reasons feed the
	// Stop-gate; its Version() (content address) is the phase id used across envs/rollback.
	Phase phases.StablePhase `json:"phase"`
	// Gate is the declared/computed « done is computed » inputs (mutation threshold, monster count).
	Gate deploy.Gate `json:"gate"`
	// Surface is the WHOLE emitted app of the phase (S94 EmittedSurface) — what RE-EMITS.
	Surface preview.EmittedSurface `json:"surface"`
}

// reProjectedHash is the SINGLE content address of the app RE-EMITTED from a phase (S94
// preview.EmittedAppHash, reused). It is the address the deploy/promotion/rollback artifact MUST
// carry — the re-projection of the phase, never a stale sandbox artifact.
func (p PhaseInput) reProjectedHash() (string, error) {
	h, err := p.Phase.Version()
	if err != nil {
		return "", err
	}
	return preview.EmittedAppHash(preview.PhaseRef{PhaseHash: h}, p.Surface)
}

// ─── PROMOTION ────────────────────────────────────────────────────────────────────────────

// PromoteInput is a promotion request: the target environment, the phase to promote, and the
// deploy domain root (per-env stacks under it). PURE input.
type PromoteInput struct {
	// Env is the environment the phase is promoted into (preview/staging/prod). Must be known.
	Env Environment `json:"env"`
	// Phase is the phase to promote (its verdict, gate and emitted surface).
	Phase PhaseInput `json:"phase"`
	// Project is the app the promotion belongs to (the per-app stack suffix).
	Project string `json:"project"`
	// DomainRoot is the optional custom domain to LINK to this env (S99/DP29). Empty ⇒ the
	// default AIDOS deploy root. TLS is provisioned via the ACME certresolver (DP27/S97).
	DomainRoot string `json:"domain_root,omitempty"`
}

// Promotion is the DETERMINISTIC, content-addressed record of an env←phase binding: the env now
// serves the RE-EMITTED app of the phase. Same input → byte-identical Promotion (same ID). It is
// produced ONLY when the phase is promotable; otherwise Promote refuses with ENV_PROMOTE_NOT_STABLE.
type Promotion struct {
	// ID is the content address of the binding (the idempotency key). Same input → same ID.
	ID string `json:"id"`
	// Env + Project + PhaseHash echo the binding (per-app, per-env, per-phase).
	Env       Environment `json:"env"`
	Project   string      `json:"project"`
	PhaseHash string      `json:"phase_hash"`
	// EmittedAppHash is the re-projection of the phase (preview.EmittedAppHash) the env now serves.
	EmittedAppHash string `json:"emitted_app_hash"`
	// StackName is the per-env Pulumi stack the promotion runs as (DP28, ADR 0043).
	StackName string `json:"stack_name"`
	// DomainRoot is the domain linked to this env (custom or the default) — TLS via ACME (S97/DP27).
	DomainRoot string `json:"domain_root"`
	// LiveURL is the live HTTPS URL the cockpit surfaces (S99/DP29) — always https (TLS inherited).
	LiveURL string `json:"live_url"`
}

// Typed causes (honesty: never invent a phase/env).
var (
	ErrNoProject  = errors.New("envrollback: no project (the binding is per app)")
	ErrUnknownEnv = errors.New("envrollback: unknown environment (the ladder is closed: preview|staging|prod)")
)

// promoteNotStableBlock is the ENV_PROMOTE_NOT_STABLE refusal. It REUSES the canonical registry
// entry and appends the offending reasons so the refusal NAMES why the phase is not promotable.
func promoteNotStableBlock(reasons []string) blockreason.BlockReason {
	br := blockreason.For(blockreason.CodeEnvPromoteNotStable)
	if len(reasons) > 0 {
		br.Explanation += " Raisons : " + strings.Join(reasons, ", ") + "."
	}
	return br
}

// outOfScopeBlock wraps a structural cause (no project, unknown env, un-addressable phase) into a
// typed OUT_OF_SCOPE BlockReason — the same shape S94/S96 use for a malformed input.
func outOfScopeBlock(cause error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:        blockreason.CodeOutOfScope,
		Severity:    blockreason.SeverityBlocking,
		Explanation: "Promotion/rollback refusé : " + cause.Error(),
		HowToFix: []string{
			"Fournissez un projet et un environnement connu (preview|staging|prod).",
			"Fournissez une phase content-adressable avec sa surface émise (S94) — la promotion ré-émet la phase, jamais un artefact sandbox périmé.",
			"Assurez-vous que chaque composant émis appartient au même projet.",
		},
	}
}

// stackName mints the per-env, per-app, per-phase Pulumi stack name (DP28, ADR 0043):
// "<env>-<project>-d-<short phase hash>" — deterministic, same phase → same stack within an env.
func stackName(env Environment, project, phaseHash string) string {
	return string(env) + "-" + project + "-" + subdomainOf(phaseHash)
}

// DefaultDomainRoot is the AIDOS deploy root used when a promotion links no custom domain. It
// mirrors the deploy (S97/DP27) default so the cockpit URL matches the Traefik-routed address.
const DefaultDomainRoot = "deploy.aidos.app"

// LiveURL mints the per-env live HTTPS URL the cockpit surfaces (S99/DP29). DETERMINISTIC: the
// Traefik-routed address is "https://<env>-<subdomain>.<domain root>" (TLS via the ACME
// certresolver, DP27/S97). The scheme is ALWAYS https — TLS is inherited, never optional. Same
// env+phase+domain → same URL. PURE — no clock, no rng, no I/O.
func LiveURL(env Environment, phaseHash, domainRoot string) string {
	root := strings.TrimSpace(domainRoot)
	if root == "" {
		root = DefaultDomainRoot
	}
	return "https://" + string(env) + "-" + subdomainOf(phaseHash) + "." + root
}

// Promote binds a STABLE phase to an environment. PURE:
//
//  1. validate the project + env (closed ladder).
//  2. STOP-GATE — the phase must be DEPLOYABLE (« done is computed », deploy.IsDeployable, S96).
//     A non-stable phase is REFUSED with ENV_PROMOTE_NOT_STABLE before any re-emission.
//  3. RE-PROJECT the app from the phase (preview.EmittedAppHash, S94) — the env serves the
//     phase's app, never a stale sandbox artifact.
//  4. content-address the binding. Same input → byte-identical Promotion. Writes nothing.
func Promote(in PromoteInput) (Promotion, *blockreason.BlockReason) {
	if in.Project == "" {
		br := outOfScopeBlock(ErrNoProject)
		return Promotion{}, &br
	}
	if !isKnownEnv(in.Env) {
		br := outOfScopeBlock(ErrUnknownEnv)
		return Promotion{}, &br
	}

	// STOP-GATE FIRST — a non-stable phase never reaches re-emission (fail-closed). Reuses the
	// S96 deploy gate (the SAME « done is computed » verdict), never a forked check.
	deployable, reasons := deploy.IsDeployable(in.Phase.Phase, in.Phase.Gate)
	if !deployable {
		br := promoteNotStableBlock(reasons)
		return Promotion{}, &br
	}

	phaseHash, err := in.Phase.Phase.Version()
	if err != nil {
		br := outOfScopeBlock(fmt.Errorf("cannot content-address the phase: %w", err))
		return Promotion{}, &br
	}
	appHash, err := in.Phase.reProjectedHash()
	if err != nil {
		br := outOfScopeBlock(fmt.Errorf("cannot re-emit the phase's app: %w", err))
		return Promotion{}, &br
	}

	domainRoot := strings.TrimSpace(in.DomainRoot)
	if domainRoot == "" {
		domainRoot = DefaultDomainRoot
	}
	prom := Promotion{
		Env:            in.Env,
		Project:        in.Project,
		PhaseHash:      phaseHash,
		EmittedAppHash: appHash,
		StackName:      stackName(in.Env, in.Project, phaseHash),
		DomainRoot:     domainRoot,
		LiveURL:        LiveURL(in.Env, phaseHash, domainRoot),
	}
	id, err := prom.contentAddress()
	if err != nil {
		br := outOfScopeBlock(fmt.Errorf("cannot content-address the promotion: %w", err))
		return Promotion{}, &br
	}
	prom.ID = id
	return prom, nil
}

func (p Promotion) contentAddress() (string, error) {
	body := map[string]any{
		"env":              string(p.Env),
		"project":          p.Project,
		"phase_hash":       p.PhaseHash,
		"emitted_app_hash": p.EmittedAppHash,
		"stack_name":       p.StackName,
		"domain_root":      p.DomainRoot,
		"live_url":         p.LiveURL,
	}
	canon, err := records.Canonicalize(mustJSON(body))
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// ─── ROLLBACK ─────────────────────────────────────────────────────────────────────────────

// RollbackInput is a rollback request: the environment to roll back, the CURRENTLY-SERVED phase
// (N, e.g. the one that incidented), the TARGET earlier phase (N-1), the DAG lineage of the
// served phase (its ancestor phase hashes, S24 — most-recent-first or any order), the project,
// and the OPTIONAL datastore reconciliation change (S95 — the inverse expand-contract migration;
// empty when the rollback carries no schema change). PURE input.
type RollbackInput struct {
	// Env is the environment being rolled back (typically prod).
	Env Environment `json:"env"`
	// Project is the app being rolled back (per-app rollback).
	Project string `json:"project"`
	// Current is the phase the env currently serves (N) — the one that incidented.
	Current PhaseInput `json:"current"`
	// Target is the EARLIER phase to roll back TO (N-1) — must be distinct, earlier, and stable.
	Target PhaseInput `json:"target"`
	// Lineage is the set of ANCESTOR phase hashes of Current in the DAG (S24). The target phase
	// hash must appear here (it precedes Current) — the ancestry check is a pure set membership.
	Lineage []string `json:"lineage"`
	// Reconcile is the OPTIONAL datastore reconciliation change (S95). The zero ChangeKind means
	// "no schema change to reconcile" (the data is already compatible) — the plan is then empty.
	Reconcile datamigrate.Change `json:"reconcile"`
	// Actor is the human/role recording the decision (provenance §9). Defaults to "human".
	Actor string `json:"actor"`
	// Reason is the human reason for the rollback (provenance §9 — "who wanted what, why").
	Reason string `json:"reason"`
}

// RollbackDecision is the DETERMINISTIC, content-addressed, APPEND-ONLY record of a rollback
// (CLAUDE.md §9 — a rollback is a recorded DECISION, never an in-place edit). Same input →
// byte-identical decision (same ID). It carries the re-projection of the TARGET phase (its
// EmittedAppHash), the datastore reconciliation plan, the env stack the rollback re-deploys, and
// the provenance body. It is produced ONLY when the target is a distinct, earlier, stable phase;
// otherwise Rollback refuses with ROLLBACK_NOT_EARLIER (or ENV_PROMOTE_NOT_STABLE if the target
// itself is red).
type RollbackDecision struct {
	// ID is the content address of the whole decision (the idempotency key). Same input → same ID.
	ID string `json:"id"`
	// Env + Project echo the keying (per-app, per-env rollback).
	Env     Environment `json:"env"`
	Project string      `json:"project"`
	// FromPhaseHash is the phase the env was serving (N). ToPhaseHash is the target (N-1).
	FromPhaseHash string `json:"from_phase_hash"`
	ToPhaseHash   string `json:"to_phase_hash"`
	// ReProjectedAppHash is the re-projection of the TARGET phase (preview.EmittedAppHash, S94) —
	// the app the env serves AFTER rollback. It MUST equal a fresh re-emit of N-1 (the re-projection
	// property), NEVER a stale sandbox artifact (DP28).
	ReProjectedAppHash string `json:"re_projected_app_hash"`
	// StackName is the per-env Pulumi stack the rollback re-deploys (DP28, ADR 0043).
	StackName string `json:"stack_name"`
	// Reconciliation is the datastore reconciliation plan (S95 datamigrate.Plan — the inverse
	// expand-contract migration, forward-only/non-destructive). Empty when no schema change.
	Reconciliation datamigrate.Plan `json:"reconciliation"`
	// HasReconciliation is true iff the rollback reconciles the datastore (a schema change).
	HasReconciliation bool `json:"has_reconciliation"`
	// Boot is the deterministic command sequence that re-deploys the TARGET phase's re-emitted app
	// (deploy = re-emit, DP28). Teardown is the inverse.
	Boot     []string `json:"boot"`
	Teardown []string `json:"teardown"`
	// Provenance is the recorded decision (§9 — who/what/why). It rides INSIDE the content address
	// so two rollbacks with different reasons/actors are distinct decisions.
	Provenance Provenance `json:"provenance"`
}

// Provenance is the recorded "who wanted what, when, why" of a rollback (CLAUDE.md §9 / the
// `provenance` schema). It is the AUDIT body the /deploy screen renders and proposes as a
// ChangeSet. No clock rides in (the input carries no clock) — determinism-first; the timestamp is
// stamped by the writer role at ChangeSet-apply time, not here.
type Provenance struct {
	// Actor is the human/role that decided the rollback (defaults to "human").
	Actor string `json:"actor"`
	// Reason is the human reason ("incident in prod", …) — never invented (empty stays empty).
	Reason string `json:"reason"`
	// FromPhaseHash / ToPhaseHash duplicate the decision's phases so the provenance body is
	// self-contained (an audit row reads without joining the decision).
	FromPhaseHash string `json:"from_phase_hash"`
	ToPhaseHash   string `json:"to_phase_hash"`
}

// Typed rollback causes (honesty: never invent a phase/order).
var (
	ErrRollbackSamePhase   = errors.New("rollback target is the currently-served phase (a no-op, not a rollback)")
	ErrRollbackNotAncestor = errors.New("rollback target does not precede the served phase in the DAG (S24 lineage)")
	ErrRollbackTargetRed   = errors.New("rollback target phase is not stable (you never roll back to a red phase)")
)

// notEarlierBlock is the ROLLBACK_NOT_EARLIER refusal. It REUSES the canonical registry entry and
// appends the offending cause so the refusal NAMES why the target is not a valid rollback target.
func notEarlierBlock(cause error) blockreason.BlockReason {
	br := blockreason.For(blockreason.CodeRollbackNotEarlier)
	br.Explanation += " Cause : " + cause.Error() + "."
	return br
}

// Rollback rolls an environment back to an EARLIER stable phase. PURE:
//
//  1. validate project + env.
//  2. content-address both phases; the target must be DISTINCT from the served phase, PRECEDE it
//     in the DAG lineage (S24), and itself be STABLE (deploy.IsDeployable) — else
//     ROLLBACK_NOT_EARLIER (or ENV_PROMOTE_NOT_STABLE if red). The served phase need NOT be stable
//     (it incidented — that is WHY we roll back).
//  3. RE-PROJECT the app from the TARGET phase (preview.EmittedAppHash, S94) — the env serves a
//     FRESH re-emit of N-1, never a restored sandbox artifact (DP28 / CLAUDE.md §9).
//  4. RECONCILE the datastore (datamigrate.Build, S95 — the inverse expand-contract migration)
//     when the rollback carries a schema change; a breaking-no-backfill change is itself refused.
//  5. RECORD the decision (provenance §9), content-address it. Same input → byte-identical
//     RollbackDecision. Writes nothing (the wall): the /deploy screen proposes it as a ChangeSet.
func Rollback(in RollbackInput) (RollbackDecision, *blockreason.BlockReason) {
	if in.Project == "" {
		br := outOfScopeBlock(ErrNoProject)
		return RollbackDecision{}, &br
	}
	if !isKnownEnv(in.Env) {
		br := outOfScopeBlock(ErrUnknownEnv)
		return RollbackDecision{}, &br
	}

	fromHash, err := in.Current.Phase.Version()
	if err != nil {
		br := outOfScopeBlock(fmt.Errorf("cannot content-address the served phase: %w", err))
		return RollbackDecision{}, &br
	}
	toHash, err := in.Target.Phase.Version()
	if err != nil {
		br := outOfScopeBlock(fmt.Errorf("cannot content-address the target phase: %w", err))
		return RollbackDecision{}, &br
	}

	// (a) the target must DIFFER from the served phase (rolling back to the same phase is a no-op).
	if toHash == fromHash {
		br := notEarlierBlock(ErrRollbackSamePhase)
		return RollbackDecision{}, &br
	}
	// (b) the target must PRECEDE the served phase in the DAG (a pure set membership over lineage).
	if !contains(in.Lineage, toHash) {
		br := notEarlierBlock(ErrRollbackNotAncestor)
		return RollbackDecision{}, &br
	}
	// (c) the target must itself be STABLE (you never roll back to a red phase).
	stable, reasons := deploy.IsDeployable(in.Target.Phase, in.Target.Gate)
	if !stable {
		// Distinguish "target red" (ENV_PROMOTE_NOT_STABLE names the red mirrors) so the screen
		// shows WHICH mirror is red, while still being a rollback refusal.
		br := promoteNotStableBlock(reasons)
		return RollbackDecision{}, &br
	}

	// 3. RE-PROJECT from the TARGET phase — the env serves a fresh re-emit of N-1.
	appHash, err := in.Target.reProjectedHash()
	if err != nil {
		br := outOfScopeBlock(fmt.Errorf("cannot re-emit the target phase's app: %w", err))
		return RollbackDecision{}, &br
	}

	// 4. RECONCILE the datastore (only when a schema change is carried).
	var recon datamigrate.Plan
	hasRecon := false
	if in.Reconcile.Kind != "" {
		rp, rbr := datamigrate.Build(in.Reconcile)
		if rbr != nil {
			// A breaking-no-backfill reconciliation refuses the rollback — delegated to S95.
			return RollbackDecision{}, rbr
		}
		recon = rp
		hasRecon = true
	}

	actor := strings.TrimSpace(in.Actor)
	if actor == "" {
		actor = "human"
	}
	prov := Provenance{
		Actor:         actor,
		Reason:        in.Reason,
		FromPhaseHash: fromHash,
		ToPhaseHash:   toHash,
	}

	stack := stackName(in.Env, in.Project, toHash)
	dec := RollbackDecision{
		Env:                in.Env,
		Project:            in.Project,
		FromPhaseHash:      fromHash,
		ToPhaseHash:        toHash,
		ReProjectedAppHash: appHash,
		StackName:          stack,
		Reconciliation:     recon,
		HasReconciliation:  hasRecon,
		Boot: []string{
			"pulumi", "stack", "select", "--create", stack,
			"&&",
			"pulumi", "up", "--yes",
		},
		Teardown: []string{
			"pulumi", "destroy", "--yes",
		},
		Provenance: prov,
	}
	id, err := dec.contentAddress()
	if err != nil {
		br := outOfScopeBlock(fmt.Errorf("cannot content-address the rollback decision: %w", err))
		return RollbackDecision{}, &br
	}
	dec.ID = id
	return dec, nil
}

func (d RollbackDecision) contentAddress() (string, error) {
	body := map[string]any{
		"env":                   string(d.Env),
		"project":               d.Project,
		"from_phase_hash":       d.FromPhaseHash,
		"to_phase_hash":         d.ToPhaseHash,
		"re_projected_app_hash": d.ReProjectedAppHash,
		"stack_name":            d.StackName,
		"reconciliation_id":     d.Reconciliation.ID,
		"has_reconciliation":    d.HasReconciliation,
		"boot":                  d.Boot,
		"teardown":              d.Teardown,
		"provenance": map[string]any{
			"actor":           d.Provenance.Actor,
			"reason":          d.Provenance.Reason,
			"from_phase_hash": d.Provenance.FromPhaseHash,
			"to_phase_hash":   d.Provenance.ToPhaseHash,
		},
	}
	canon, err := records.Canonicalize(mustJSON(body))
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// RollbackProducesReProjection is the S98 / DP28 RE-PROJECTION property, made deterministic: the
// app the env serves AFTER the rollback (servedAppHash) MUST equal a FRESH re-emit of the target
// phase (target.reProjectedHash) — never a stale sandbox artifact. A pure comparison — CODE judges
// the equality, never an agent. Returns (true, nil) on match, (false, BlockReason) on mismatch (a
// stale/wrong artifact would have been restored). It is the mechanical guarantee that « l'artefact
// post-rollback = ré-projection de N-1 (hash égal), jamais un artefact sandbox ».
func RollbackProducesReProjection(dec RollbackDecision, target PhaseInput, servedAppHash string) (bool, *blockreason.BlockReason) {
	fresh, err := target.reProjectedHash()
	if err != nil {
		br := outOfScopeBlock(fmt.Errorf("cannot re-emit the target phase to verify the re-projection: %w", err))
		return false, &br
	}
	// The served app must equal BOTH the decision's recorded re-projection AND a fresh re-emit.
	if servedAppHash == dec.ReProjectedAppHash && servedAppHash == fresh {
		return true, nil
	}
	br := blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: fmt.Sprintf(
			"après rollback, l'env sert l'app %q mais la ré-projection de la phase cible est %q (décision: %q) — l'artefact servi n'est PAS la ré-émission de la phase antérieure (un artefact sandbox périmé)",
			servedAppHash, fresh, dec.ReProjectedAppHash),
		HowToFix: []string{
			"Ré-émettez la surface de la phase cible et reconstruisez la décision de rollback (rollback = ré-émission, DP28 / ADR 0043).",
			"Ne restaurez JAMAIS un artefact sandbox tel quel — le truth-store/phase est autoritatif, le code est régénérable (CLAUDE.md §9).",
		},
	}
	return false, &br
}

// contains is a pure set-membership over the lineage (no map order leak, total).
func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

// subdomainOf mints the per-phase short label: the first 12 lower-case hex chars of the phase
// hash, "d-"-prefixed (DNS-safe, starts with a letter). Deterministic — same phase → same label.
// Identical to the deploy (S96) scheme so a rollback re-deploys at the SAME stack the deploy used.
func subdomainOf(phaseHash string) string {
	h := strings.ToLower(phaseHash)
	var b strings.Builder
	for _, r := range h {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
		if b.Len() >= 12 {
			break
		}
	}
	short := b.String()
	if short == "" {
		short = "000000000000"
	}
	return "d-" + short
}

// sortedEnvs returns the closed ladder sorted by declared rank (preview, staging, prod) — used by
// projections that render the ladder; never derived from map iteration.
func sortedEnvs() []Environment {
	es := Environments()
	sort.Slice(es, func(i, j int) bool { return envRank[es[i]] < envRank[es[j]] })
	return es
}

// LadderInOrder is the public, deterministic accessor for the env ladder in promotion order.
func LadderInOrder() []Environment { return sortedEnvs() }
