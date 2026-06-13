// Package deploy is the AIDOS Runtime PHASE-KEYED DEPLOY pipeline (S96; app-builder EPIC 10,
// DP26 / ADR 0043).
//
// THE CAPABILITY (S96 done-criteria). The action « Déployer cette phase » is permitted ONLY
// from a STABLE phase — a phase where « done is computed » holds over its cut: red→vert ∧
// vert antérieur intact ∧ mutation ≥ seuil ∧ AUCUN MONSTRE (KRD §43/§44, CLAUDE.md §8). Given
// a stable phase, deploy is a RE-PROJECTION, never a procedural script (DP26, ADR 0043):
//
//   - it INHERITS the Stop-gate — it re-uses phases.IsStable (S23, the coherent-cut verdict)
//     crossed with the declared mutation threshold and the monster count; a non-stable phase
//     is REFUSED with PHASE_NOT_STABLE (the S13 BlockReason shape), naming the offending
//     reasons (the red sensor/link ids, a below-threshold mutation score, a present monster);
//   - it RE-EMITS the app FROM THE PHASE (S78 deterministic re-projection): the deployed
//     artifact's content address (EmittedAppHash) is recomputed from the phase's emitted
//     surface, so the deployed app is ALWAYS the phase's app — never a stale sandbox artifact;
//   - it provisions the datastore + runs the per-app data migration FORWARD-ONLY (S95,
//     datamigrate: EXPAND → BACKFILL → CONTRACT, DataTruthScope-gated) — a breaking change
//     with no backfill is itself refused (BREAKING_MIGRATION_NO_BACKFILL, inherited from S95);
//   - it runs `pulumi up` of the EMITTED Pulumi program (ADR 0043) and provisions a per-phase
//     deploy URL — the same phase always deploys at the same URL (idempotent boot).
//
// THE DONE-CRITERIA (S96). A fixture refusing the deploy of a NON-STABLE phase
// (PHASE_NOT_STABLE) ; the migration runs FORWARD-ONLY (the staged steps are expand → backfill
// → contract, never a destructive single DROP) ; and a property: the deployed artifact is
// RE-PROJECTED from the phase, never a stale sandbox artifact (DeployedMatchesPhase — a pure
// hash equality, code judges, never an agent).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). BuildPlan is a PURE, TOTAL function of its
// canonicalised input — no clock, no RNG, no map-order leak, no absolute path. Same stable
// phase + surface + change → byte-identical DeployPlan (same id, same URL, same migration
// steps, same boot/teardown). The reproducibility mirror (deploy_property_test.go) pins it.
// The stability decision and the hash equality are PURE comparisons — code judges, never an
// agent. REUSES, never reinvents: phases.IsStable (S23) for the cut verdict, preview's
// EmittedAppHash (S94) for the re-projection address, datamigrate.Build (S95) for the
// forward-only migration, records.Canonicalize+Hash (S02) for the content address.
//
// THE WALL (CLAUDE.md §2). deploy READS the stable-phase verdict + the emitted surface +
// the entity change (already-projected facts, below the line) and PLANS the deploy — it
// writes NOTHING to the kernel/mirrors/fitness. A non-stable phase, a malformed surface, a
// breaking migration with no backfill — each is a typed BlockReason (the S13 shape), never a
// panic, never an invented URL/phase, never a silent deploy of a red mirror or a stale
// artifact.
//
// DP26 — THE COMPLETE DEPLOY ORDER (EPIC F, extends S96, never duplicates). DP26 CABLES the
// full deploy ORDER onto the S96 plan: a deployable phase RE-EMITS the stack from the phase
// (DP05 stackemit.EmitStack), then orders the deterministic sequence
//
//	network → volumes → datastore-provision (DP15 datafragments) → migration (S95
//	datamigrate, forward-only, DataTruthScope-gated) → bootstrap (DP12, ordered) →
//	healthcheck → URL.
//
// The ORDER is a PURE sequence DERIVED from the phase — a closed, declared kind set
// (OrderedDeployStages), content-addressed via records.Hash, reproducible (same phase →
// byte-identical Order). DP26 REUSES S96/S78/S95/S86, NEVER duplicates: the Stop-gate stays
// IsDeployable (no new deploy-approval gate); the re-projection stays DeployedMatchesPhase
// (hash artefact = hash phase); the migration stays datamigrate (forward-only,
// DataTruthScope-gated); the datastore fragments stay datafragments (the DP06 prod×doltgres
// gate DELEGATED); the bootstrap stays bootstrap.EmitBootstrapSequence (the DP12 ordered
// amorçage). The re-emission is the DP05 EmitStack composition (compose ⊕ env ⊕ traefik).
//
// ADDITIVE (CLAUDE.md §9 anti-overwrite). The DP26 order section is OPT-IN: an Input with no
// Manifest is EXACTLY the S96 plan (no Order) — every S96 test stays byte-identical green.
// Supplying a Manifest + Env opts into the DP15 datastore provision + the DP12 bootstrap
// ordering, NEVER altering the EmittedAppHash/URL/StackName (they never read the manifest —
// the deployed artifact is the phase's app, the order is HOW it boots). The deploy is NOT a
// truth-write — it RE-PROJECTS an existing phase (the phase is the unit of deployment).
package deploy

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/bootstrap"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
	"github.com/steph-frtech/aidos/back/runtime/preview"
	"github.com/steph-frtech/aidos/back/runtime/stackemit"
)

// mustJSON marshals a value to JSON for the canonical content-address body. The shapes passed
// in are always JSON-marshalable (plain maps/slices/strings), so an error is a programming
// fault, not a runtime input — it surfaces as "{}" (the hash then differs, never silently
// equal).
func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return b
}

// DefaultDomainRoot is the deploy wildcard root used when Input.DomainRoot is empty. Distinct
// from the preview root (S94): a deploy is a LASTING environment, a preview is ephemeral.
const DefaultDomainRoot = "deploy.aidos.app"

// DefaultDeployEnv is the environment a deploy targets when Input.Env is empty (a deploy is a
// LASTING prod environment by default — distinct from the preview default, which is dev).
const DefaultDeployEnv = scope.EnvProd

// DeployStageKind is one rung of the CLOSED, ORDERED DP26 deploy sequence. The set is CLOSED
// (DP26): an unknown stage does not exist — BuildPlan orders EXACTLY these, in this order, or
// it never reaches the order (the Stop-gate refuses first). The order is the spec's
// done-criteria sequence: network → volumes → datastore-provision → migration → bootstrap →
// healthcheck → URL.
type DeployStageKind string

const (
	// StageNetwork — the shared reverse-proxy network is created (the external traefik network
	// the appliance joins). The first rung — nothing runs before the network exists.
	StageNetwork DeployStageKind = "network"
	// StageVolumes — the named bind volumes are created (${VAR} device references — the data
	// substrate's persistence lands before the datastore boots).
	StageVolumes DeployStageKind = "volumes"
	// StageDatastoreProvision — the data-substrate services are provisioned (DP15 datafragments:
	// postgres + valkey + pgbouncer, doltgres non-prod-only — the DP06 gate delegated).
	StageDatastoreProvision DeployStageKind = "datastore-provision"
	// StageMigration — the per-app data migration runs FORWARD-ONLY (S95 datamigrate: expand →
	// backfill → contract, DataTruthScope-gated). Empty (no step) when the deploy carries no
	// schema change, but the stage stays in the canonical order (the order is phase-derived).
	StageMigration DeployStageKind = "migration"
	// StageBootstrap — the DP12 ordered amorçage runs over the re-emitted stack (the closed
	// network→volumes→…→urls-printed bootstrap sequence, MISSING_SECRET_AT_BOOT-gated).
	StageBootstrap DeployStageKind = "bootstrap"
	// StageHealthcheck — every service must pass its healthcheck (the blocking gate before the
	// URL is announced — a deploy is not live until it is healthy).
	StageHealthcheck DeployStageKind = "healthcheck"
	// StageURL — the per-phase deploy URL is provisioned and announced (the last rung — the
	// app is reachable at its content-addressed subdomain).
	StageURL DeployStageKind = "url"
)

// orderedStages is the CLOSED DP26 deploy sequence in its DECLARED order. Declared once;
// OrderedDeployStages copies it out (never derived from map iteration — determinism).
var orderedStages = []DeployStageKind{
	StageNetwork,
	StageVolumes,
	StageDatastoreProvision,
	StageMigration,
	StageBootstrap,
	StageHealthcheck,
	StageURL,
}

// OrderedDeployStages returns the closed DP26 deploy sequence in its declared order (a copy —
// never mutable). The Workbench legend and the order mirror read this single source.
func OrderedDeployStages() []DeployStageKind {
	out := make([]DeployStageKind, len(orderedStages))
	copy(out, orderedStages)
	return out
}

// DeployStage is one rung of the ordered deploy sequence: its 1-based position, its closed
// kind, and a deterministic detail (a NAME or a ${VAR} reference / a service list — never a
// secret value, never a hardcoded endpoint). Pure data the Workbench renders as the timeline.
type DeployStage struct {
	Seq    int             `json:"seq"`
	Kind   DeployStageKind `json:"kind"`
	Detail string          `json:"detail"`
}

// DeployOrder is the DP26 COMPLETE deploy order: the ordered stages + the content address of
// the sequence (so "same phase → same order" is one comparison) + the re-emitted stack's
// bundle hash (DP05 EmitStack — the deployed artifact is RE-PROJECTED from the phase, never a
// stale sandbox artifact). PURE: same phase → byte-identical DeployOrder.
type DeployOrder struct {
	// Stages are the ordered deploy rungs (network → volumes → datastore → migration →
	// bootstrap → healthcheck → URL) — the spec's done-criteria sequence, deterministic.
	Stages []DeployStage `json:"stages"`
	// StackBundleHash is the content address of the RE-EMITTED stack (DP05 stackemit.EmitStack
	// BundleHash) — the deploy re-emits from the phase (DP05), never an existing artifact.
	StackBundleHash string `json:"stack_bundle_hash"`
	// BootstrapHash is the content address of the DP12 ordered bootstrap sequence (the
	// profile-independent amorçage of the re-emitted stack).
	BootstrapHash string `json:"bootstrap_hash"`
	// Hash is the content address of the whole order (records.Hash over the canonical
	// rendering — S02 reused). Same phase → same Hash (the reproducibility oracle).
	Hash string `json:"hash"`
}

// Gate is the « done is computed » Stop-gate inputs that, crossed with the phase's coherent-cut
// verdict (phases.StablePhase), decide whether a phase may deploy (KRD §43/§44, CLAUDE.md §8).
// It is the DECLARED side of the gate (the mutation threshold is declared, never learned, §8);
// the phase's cut verdict (sensors green, links resolved) is the COMPUTED side. A phase
// deploys IFF its cut is stable AND mutation ≥ threshold AND no monster.
type Gate struct {
	// MutationScore is the achieved mutation-test score over the cut (S40), in [0,1].
	MutationScore float64 `json:"mutation_score"`
	// MutationThreshold is the DECLARED minimum mutation score the cut must reach (§8 — declared,
	// never learned). A score below it makes the phase non-deployable (mutation < seuil).
	MutationThreshold float64 `json:"mutation_threshold"`
	// MonsterCount is the number of monsters over the cut (orphan mirror / mirror-less truth,
	// the completeness law, CLAUDE.md §1). Any monster (> 0) makes the phase non-deployable.
	MonsterCount int `json:"monster_count"`
}

// Stable reports whether the gate's COMPUTED side holds: mutation ≥ threshold AND no monster.
// Crossed with the phase's coherent-cut verdict in IsDeployable, it is the full « done is
// computed » decision. A below-threshold mutation score or any monster makes it false.
func (g Gate) Stable() bool {
	return g.MutationScore >= g.MutationThreshold && g.MonsterCount == 0
}

// gateReasons names the gate's offending facts (a below-threshold mutation score, a present
// monster), in canonical order, so a non-deployable gate is named in the BlockReason exactly
// as a red cut names its red mirrors. Empty iff the gate is stable.
func (g Gate) gateReasons() []string {
	var rs []string
	if g.MutationScore < g.MutationThreshold {
		rs = append(rs, fmt.Sprintf("mutation_below_threshold(%.4f<%.4f)", g.MutationScore, g.MutationThreshold))
	}
	if g.MonsterCount > 0 {
		rs = append(rs, fmt.Sprintf("monster_present(%d)", g.MonsterCount))
	}
	sort.Strings(rs)
	return rs
}

// IsDeployable is the « done is computed » decision over a phase (KRD §43/§44, CLAUDE.md §8):
// the phase's coherent-cut verdict (phases.StablePhase, S23 — every sensor green, every link
// resolved) crossed with the gate (mutation ≥ threshold, no monster). It is PURE and TOTAL.
// Returns (true, nil) when deployable; (false, ordered reasons) otherwise — the union of the
// phase's red-mirror reasons and the gate's offending facts, in canonical order. The reasons
// are the SOURCE of the PHASE_NOT_STABLE refusal; deploy never invents a reason.
func IsDeployable(phase phases.StablePhase, gate Gate) (bool, []string) {
	reasons := append([]string(nil), phase.Reasons...)
	reasons = append(reasons, gate.gateReasons()...)
	sort.Strings(reasons)
	return phase.Stable && gate.Stable(), reasons
}

// Input is the whole deploy request: the stable phase (its cut verdict, S23), the gate inputs
// (mutation/monster, §8), the phase's emitted surface (S87/S93/S89 — what gets RE-EMITTED),
// the emitted Pulumi program (the boot/teardown unit, ADR 0043), the per-app DATA change
// (S95 — the forward-only migration, optional when the schema is unchanged), and the deploy
// domain root. PURE input — no clock, no host path.
type Input struct {
	// Phase is the coherent-cut verdict (phases.StablePhase, S23). Its Stable + Reasons feed the
	// Stop-gate; its Version() (content address) keys the deploy URL.
	Phase phases.StablePhase `json:"phase"`
	// Gate is the declared/computed « done is computed » inputs (mutation threshold, monster count).
	Gate Gate `json:"gate"`
	// Surface is the WHOLE emitted app of the phase (S94 EmittedSurface) — what deploy RE-EMITS.
	Surface preview.EmittedSurface `json:"surface"`
	// Program is the emitted Pulumi/TS program (ADR 0043) the boot/teardown commands run.
	Program honoemit.Artifact `json:"program"`
	// Change is the per-app DATA-MIGRATION change (S95). The zero ChangeKind means "no schema
	// change this deploy" — the migration plan is then empty (a deploy need not migrate data).
	Change datamigrate.Change `json:"change"`
	// DomainRoot is the deploy wildcard root (e.g. "deploy.aidos.app"). The per-phase subdomain
	// is minted under it deterministically from the phase hash. Defaults to DefaultDomainRoot.
	DomainRoot string `json:"domain_root"`

	// --- DP26: the optional COMPLETE-ORDER section (network→…→URL). ----------------------
	// Manifest is the DP02 StackManifest the phase pinned — what DP05 RE-EMITS and what the
	// DP15 datastore provision + DP12 bootstrap order over. ABSENT (empty AppName) ⇒ the S96
	// plan (no Order); SUPPLIED ⇒ the DP26-ordered deploy. The manifest MUST be pinned in the
	// phase cut (EmitStack refuses an unpinned one — the phase is authoritative, DP05).
	Manifest stackmanifest.StackManifest `json:"manifest,omitempty"`
	// Env is the deployment environment the datastore is provisioned for (DP15). It gates
	// doltgres-in-prod (the DP06 rule, delegated). Defaults to DefaultDeployEnv (prod) when a
	// Manifest is supplied with an empty Env (a deploy targets prod by default).
	Env scope.Environment `json:"env,omitempty"`
	// Host is the OBSERVED host snapshot AS DATA the DP12 bootstrap resolves the port from
	// (ss ∪ docker ps). Optional: the empty snapshot resolves the first free port ≥ base.
	Host bootstrap.HostState `json:"host,omitempty"`
	// Secrets is the set of secret env-var NAMES present in the appliance at boot (DP12). A
	// missing required secret fails the bootstrap closed (MISSING_SECRET_AT_BOOT), inherited.
	Secrets bootstrap.SecretsState `json:"secrets,omitempty"`
}

// DeployPlan is the DETERMINISTIC, content-addressed plan that deploys a stable phase's
// RE-EMITTED app and (when the schema changed) migrates its data forward-only. Same Input →
// byte-identical Plan (same ID). It is produced ONLY when the phase is deployable; otherwise
// BuildPlan refuses with PHASE_NOT_STABLE and produces no plan.
type DeployPlan struct {
	// ID is the content address of the whole plan (Hash(Canonicalize(canonical body))) — the
	// idempotency key. Same Input → same ID, so re-deploying a phase is a no-op.
	ID string `json:"id"`
	// Project + PhaseHash echo the keying (the deploy is per-app, per-phase).
	Project   string `json:"project"`
	PhaseHash string `json:"phase_hash"`
	// EmittedAppHash is the single content address of the WHOLE app RE-EMITTED from the phase
	// (preview.EmittedAppHash, S94). The deployed-app hash MUST equal this (the re-projection
	// property: the deployed artifact is the phase's app, never a stale sandbox artifact).
	EmittedAppHash string `json:"emitted_app_hash"`
	// URL is the deploy URL the app is served at — a per-phase subdomain under DomainRoot,
	// deterministically derived from the phase hash (same phase → same URL).
	URL string `json:"url"`
	// Subdomain is the per-phase deploy subdomain label (the URL's host first label).
	Subdomain string `json:"subdomain"`
	// StackName is the Pulumi stack the deploy runs as (per-app, per-phase, deterministic).
	StackName string `json:"stack_name"`
	// ProgramPath is the path of the emitted Pulumi program the boot/teardown commands run.
	ProgramPath string `json:"program_path"`
	// Migration is the FORWARD-ONLY data migration of the deployed app (S95 datamigrate.Plan):
	// EXPAND → BACKFILL → CONTRACT. Empty (no steps) when the deploy carries no schema change.
	Migration datamigrate.Plan `json:"migration"`
	// HasMigration is true iff the deploy migrates data (Change carries a known ChangeKind).
	HasMigration bool `json:"has_migration"`
	// Boot is the deterministic command sequence that deploys the phase: provision/select the
	// stack, then `pulumi up` of the EMITTED program (deploy = re-emit, DP26).
	Boot []string `json:"boot"`
	// Teardown is the deterministic command sequence that tears the deploy down (`pulumi destroy`).
	Teardown []string `json:"teardown"`

	// --- DP26: the optional COMPLETE-ORDER section (nil for an S96 plan) ------------------
	// Order is the DP26 complete deploy order (network → volumes → datastore-provision →
	// migration → bootstrap → healthcheck → URL), the re-emitted stack hash and the bootstrap
	// hash. nil when no Manifest is supplied (the S96 plan is preserved byte-identically);
	// computed when a Manifest + Env opts into the DP26 ordering. The order NEVER alters the
	// EmittedAppHash/URL/StackName above — it is HOW the phase's app boots, not WHICH app.
	Order *DeployOrder `json:"order,omitempty"`
}

// Typed causes — every refusal that is NOT a delegated S95/S94 block is one of these (honesty
// rule: never invent a URL/phase). PHASE_NOT_STABLE is constructed via notStableBlock (it
// carries the offending reasons); the surface/program causes reuse preview's validation shape.
var (
	ErrNoProject  = errors.New("deploy: surface has no project")
	ErrNoServer   = errors.New("deploy: surface has no server bundle (the app must boot a server)")
	ErrNoFront    = errors.New("deploy: surface has no front bundle (the app must serve a UI)")
	ErrNoInfra    = errors.New("deploy: surface has no infra program (nothing to `pulumi up`)")
	ErrNoProgram  = errors.New("deploy: no emitted Pulumi program to boot")
	ErrProjectMix = errors.New("deploy: program project does not match the surface project")
	// ErrManifestProjectMix — the DP26 manifest belongs to another app than the surface (a
	// cross-app deploy order). The deploy is per-app (S96).
	ErrManifestProjectMix = errors.New("deploy: manifest app does not match the surface project")
)

// surfaceBlock wraps a surface/program cause into a typed BlockReason (the S13 shape). deploy
// reuses the kernel's OUT_OF_SCOPE code for a malformed/cross-app surface, exactly as preview
// (S94) does — a malformed surface is an out-of-scope source.
func surfaceBlock(cause error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:        blockreason.CodeOutOfScope,
		Severity:    blockreason.SeverityBlocking,
		Explanation: "Deploy refused: " + cause.Error(),
		HowToFix: []string{
			"Provide a complete emitted surface (server S87, front S93, infra/Pulumi ADR 0043) for the phase",
			"Re-emit the phase's app (deploy = re-emit, DP26) — never deploy a stale sandbox artifact",
			"Ensure every emitted component belongs to the same project",
		},
	}
}

// notStableBlock is the PHASE_NOT_STABLE refusal (the S96 Stop-gate). It REUSES the canonical
// registry entry (blockreason.For, the closed FR registry) and appends the offending reasons to
// the explanation so the refusal NAMES exactly why the phase is not deployable (the red mirror,
// the below-threshold mutation score, the present monster) — never a vague "not stable".
func notStableBlock(reasons []string) blockreason.BlockReason {
	br := blockreason.For(blockreason.CodePhaseNotStable)
	if len(reasons) > 0 {
		br.Explanation += " Raisons : " + strings.Join(reasons, ", ") + "."
	}
	return br
}

// validateSurface checks the emitted surface + program is deployable: a project, a
// server+front+infra surface, an emitted program for the SAME project. It invents nothing.
// (It does NOT re-check the migration backfill — datamigrate.Build owns that gate, reused.)
func validateSurface(in Input) error {
	if in.Surface.Project == "" {
		return ErrNoProject
	}
	if in.Surface.ServerBundleHash == "" {
		return ErrNoServer
	}
	if in.Surface.FrontBundleHash == "" {
		return ErrNoFront
	}
	if in.Surface.InfraHash == "" {
		return ErrNoInfra
	}
	if len(in.Program.Bytes) == 0 || in.Program.Path == "" {
		return ErrNoProgram
	}
	if !strings.Contains(in.Program.Path, "gen/"+in.Surface.Project+"/") {
		return ErrProjectMix
	}
	return nil
}

// subdomainOf mints the per-phase deploy subdomain label: "d-" + the first 12 hex chars of the
// phase hash (lower-case, DNS-safe). Deterministic — same phase → same subdomain. The "d-"
// prefix guarantees the label starts with a letter (DNS labels may not start a digit) and
// distinguishes a deploy host from a preview host ("p-", S94).
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

// BuildPlan computes the deterministic, content-addressed DeployPlan for the input. PURE:
//
//  1. STOP-GATE FIRST — the phase must be DEPLOYABLE (« done is computed »: stable cut ∧
//     mutation ≥ threshold ∧ no monster). A non-deployable phase is REFUSED with
//     PHASE_NOT_STABLE before anything is emitted (fail-closed) — never deploy a red mirror.
//  2. validate the emitted surface + program (a complete, same-project surface).
//  3. RE-EMIT the app FROM THE PHASE — recompute EmittedAppHash from the phase's surface (S94),
//     so the deployed artifact is the phase's app, never a stale sandbox artifact (DP26).
//  4. PLAN the FORWARD-ONLY data migration (S95 datamigrate.Build) when the deploy carries a
//     schema change — EXPAND → BACKFILL → CONTRACT, DataTruthScope-gated; a breaking-no-backfill
//     change is itself refused (BREAKING_MIGRATION_NO_BACKFILL, delegated to S95).
//  5. mint the per-phase URL/stack and the `pulumi up`/`destroy` commands, then content-address
//     the whole plan. Same Input → byte-identical Plan (same ID). Writes nothing (the wall).
func BuildPlan(in Input) (DeployPlan, *blockreason.BlockReason) {
	// 1. STOP-GATE FIRST — a non-stable phase never reaches re-emission (fail-closed).
	deployable, reasons := IsDeployable(in.Phase, in.Gate)
	if !deployable {
		br := notStableBlock(reasons)
		return DeployPlan{}, &br
	}

	// 2. validate the emitted surface + program.
	if err := validateSurface(in); err != nil {
		br := surfaceBlock(err)
		return DeployPlan{}, &br
	}

	// The phase content address keys the deploy URL.
	phaseHash, err := in.Phase.Version()
	if err != nil {
		br := surfaceBlock(fmt.Errorf("deploy: cannot content-address the phase: %w", err))
		return DeployPlan{}, &br
	}

	// 3. RE-EMIT FROM THE PHASE — the deployed-app hash IS the phase's emitted-app hash (S94),
	// never a stale sandbox artifact (the re-projection property).
	appHash, err := preview.EmittedAppHash(preview.PhaseRef{PhaseHash: phaseHash}, in.Surface)
	if err != nil {
		br := surfaceBlock(fmt.Errorf("deploy: cannot re-emit the phase's app: %w", err))
		return DeployPlan{}, &br
	}

	// 4. PLAN the forward-only data migration (only when a schema change is carried).
	var migration datamigrate.Plan
	hasMigration := false
	if in.Change.Kind != "" {
		mp, mbr := datamigrate.Build(in.Change)
		if mbr != nil {
			// A breaking-no-backfill (or malformed) migration refuses the deploy — delegated to S95.
			return DeployPlan{}, mbr
		}
		migration = mp
		hasMigration = true
	}

	root := in.DomainRoot
	if root == "" {
		root = DefaultDomainRoot
	}
	sub := subdomainOf(phaseHash)
	url := "https://" + sub + "." + root
	stack := "deploy-" + in.Surface.Project + "-" + sub

	boot := []string{
		"pulumi", "stack", "select", "--create", stack,
		"&&",
		"pulumi", "up", "--yes", "--cwd", dir(in.Program.Path),
	}
	teardown := []string{
		"pulumi", "destroy", "--yes", "--cwd", dir(in.Program.Path),
		"&&",
		"pulumi", "stack", "rm", "--yes", stack,
	}

	plan := DeployPlan{
		Project:        in.Surface.Project,
		PhaseHash:      phaseHash,
		EmittedAppHash: appHash,
		URL:            url,
		Subdomain:      sub,
		StackName:      stack,
		ProgramPath:    in.Program.Path,
		Migration:      migration,
		HasMigration:   hasMigration,
		Boot:           boot,
		Teardown:       teardown,
	}

	// 6. DP26 — the OPTIONAL complete-order section. Only when a DP02 manifest is supplied
	// (else the S96 shape is preserved byte-identically, §9). The EmittedAppHash/URL/StackName
	// above are already computed and NEVER read here: the order changes HOW the phase boots,
	// never WHICH app (the re-projection property is preserved — DeployedMatchesPhase still
	// asserts hash artefact = hash phase). The order REUSES the same forward-only migration plan.
	if in.Manifest.AppName != "" {
		order, obr := buildOrder(in, url, migration)
		if obr != nil {
			return DeployPlan{}, obr
		}
		plan.Order = order
	}

	id, err := plan.contentAddress()
	if err != nil {
		br := surfaceBlock(fmt.Errorf("deploy: cannot content-address the plan: %w", err))
		return DeployPlan{}, &br
	}
	plan.ID = id
	return plan, nil
}

// buildOrder computes the DP26 COMPLETE deploy order, REUSING DP05 + DP15 + S95 + DP12
// verbatim (never forking the rules):
//
//  1. the manifest must belong to the SAME app as the surface (per-app deploy, S96);
//  2. DP05 stackemit.EmitStack RE-EMITS the stack from the phase (the deployed artifact is
//     the phase's app — the re-projection; an unpinned manifest / unstable phase / hand-edit
//     surfaces the DP05 BlockReason verbatim);
//  3. DP15 datafragments provisions the data substrate (the DP06 prod×doltgres gate delegated
//     — DOLTGRES_NOT_ALLOWED_IN_PROD / UNKNOWN_ENVIRONMENT surface verbatim);
//  4. DP12 bootstrap.EmitBootstrapSequence renders the ordered amorçage over the manifest
//     (MISSING_SECRET_AT_BOOT / invalid-manifest surface verbatim);
//  5. the seven stages are ordered (network → volumes → datastore → migration → bootstrap →
//     healthcheck → URL) and content-addressed.
//
// PURE: same (phase, manifest, env, migration, host, secrets) → byte-identical DeployOrder.
// It runs NO real docker — the order is a deterministic plan-as-data the gated executor and
// the Workbench consume. The order NEVER reads/alters the EmittedAppHash/URL/StackName.
func buildOrder(in Input, url string, migration datamigrate.Plan) (*DeployOrder, *blockreason.BlockReason) {
	// (1) per-app: the manifest's app must match the surface's project.
	if in.Manifest.AppName != in.Surface.Project {
		br := surfaceBlock(ErrManifestProjectMix)
		return nil, &br
	}

	// (2) DP05 — RE-EMIT the stack FROM THE PHASE (deploy = re-emit, DP26). EmitStack owns the
	// stable-phase + manifest-pinned + hand-edit gates; its refusal surfaces verbatim. The
	// deploy plans no hand-edit drift over a fresh re-emission (empty ledger/disk).
	bundle, sbr := stackemit.EmitStack(in.Phase, in.Manifest, nil, nil)
	if sbr != nil {
		return nil, sbr
	}

	// (3) DP15 — provision the data substrate for the env (the DP06 gate delegated). The CORE
	// path omits the env-forbidden fragments cleanly (prod omits doltgres) — never an error.
	env := in.Env
	if env == "" {
		env = DefaultDeployEnv
	}
	fragments, ferr := datafragments.SubstrateCoreFragments(in.Surface.Project, env)
	if ferr != nil {
		br := surfaceBlock(fmt.Errorf("deploy: cannot provision the datastore: %w", ferr))
		return nil, &br
	}

	// (4) DP12 — render the deterministic ordered bootstrap over the manifest.
	seq, bbr := bootstrap.EmitBootstrapSequence(in.Manifest, in.Host, in.Secrets)
	if bbr != nil {
		return nil, bbr
	}

	// (5) order the seven stages — every detail is a NAME / ${VAR} ref / a service list, never
	// a secret value, never a hardcoded endpoint (the bootstrap-honesty rule, reused).
	details := map[DeployStageKind]string{
		StageNetwork:            in.Manifest.Network.Name,
		StageVolumes:            volumeRefs(in.Manifest),
		StageDatastoreProvision: fragmentNames(fragments),
		StageMigration:          migrationDetail(migration),
		StageBootstrap:          "amorçage ordonné DP12 (" + bootstrapDetail(seq) + ")",
		StageHealthcheck:        healthcheckDetail(in.Manifest),
		StageURL:                url,
	}
	stages := make([]DeployStage, 0, len(orderedStages))
	for i, kind := range orderedStages {
		stages = append(stages, DeployStage{Seq: i + 1, Kind: kind, Detail: details[kind]})
	}

	order := &DeployOrder{
		Stages:          stages,
		StackBundleHash: bundle.BundleHash,
		BootstrapHash:   seq.Hash(),
	}
	order.Hash = order.contentAddress()
	return order, nil
}

// contentAddress folds the DeployOrder's identity into ONE content address (records.Hash over
// the canonical "stack\nbootstrap\nseq:kind:detail\n…" summary — S02 reused, never forked).
// Same phase → same stages → same Hash: the «même phase → même ordre» proof is one comparison.
func (o DeployOrder) contentAddress() string {
	var b strings.Builder
	b.WriteString("stack=")
	b.WriteString(o.StackBundleHash)
	b.WriteString("\nbootstrap=")
	b.WriteString(o.BootstrapHash)
	b.WriteString("\n")
	for _, s := range o.Stages {
		b.WriteString(fmt.Sprintf("s=%d:%s:%s\n", s.Seq, s.Kind, s.Detail))
	}
	return records.Hash([]byte(b.String()))
}

// --- DP26 deterministic stage-detail helpers (NAMES + ${VAR} refs only, no secret/host) ----

// volumeRefs renders the manifest's bind-volume device references (${VAR}) in sorted order —
// never a hardcoded path (the same discipline bootstrap uses, the SPEC-stack-2026 law).
func volumeRefs(m stackmanifest.StackManifest) string {
	refs := make([]string, 0, len(m.Volumes))
	for _, v := range m.Volumes {
		refs = append(refs, "${"+v.DeviceVar+"}")
	}
	sort.Strings(refs)
	if len(refs) == 0 {
		return "(aucun volume nommé)"
	}
	return strings.Join(refs, ", ")
}

// fragmentNames lists the DP15 provisioned data-substrate service keys in sorted order — the
// deterministic breakdown the Workbench surfaces (prod omits doltgres via the DP06 gate).
func fragmentNames(fragments []datafragments.ServiceFragment) string {
	names := make([]string, 0, len(fragments))
	for _, f := range fragments {
		names = append(names, f.Key)
	}
	sort.Strings(names)
	if len(names) == 0 {
		return "(aucun datastore)"
	}
	return strings.Join(names, ", ")
}

// migrationDetail names the S95 forward-only migration: the staged step count or "(aucune
// migration de schéma)" when the deploy carries no schema change (the stage stays in order).
func migrationDetail(p datamigrate.Plan) string {
	if len(p.Steps) == 0 {
		return "(aucune migration de schéma)"
	}
	stages := make([]string, 0, len(p.Steps))
	for _, s := range p.Steps {
		stages = append(stages, s.Stage)
	}
	return "S95 forward-only: " + strings.Join(stages, " → ")
}

// bootstrapDetail names the DP12 bootstrap rungs in order (the closed event kinds) — NAMES
// only, never a resolved port/secret.
func bootstrapDetail(seq bootstrap.Sequence) string {
	kinds := make([]string, 0, len(seq.Events))
	for _, e := range seq.Events {
		kinds = append(kinds, string(e.Kind))
	}
	return strings.Join(kinds, " → ")
}

// healthcheckDetail lists the manifest's service container names whose healthcheck must pass —
// in sorted order (NAMES only, the bootstrap convention reused).
func healthcheckDetail(m stackmanifest.StackManifest) string {
	svcs := make([]stackmanifest.Service, len(m.Services))
	copy(svcs, m.Services)
	sort.Slice(svcs, func(i, j int) bool { return svcs[i].Name < svcs[j].Name })
	names := make([]string, 0, len(svcs))
	for i := range svcs {
		if svcs[i].Role == stackmanifest.RoleServer {
			names = append(names, "${APP_NAME}")
			continue
		}
		names = append(names, "${APP_NAME}-"+svcs[i].Name)
	}
	if len(names) == 0 {
		return "(aucun service)"
	}
	return strings.Join(names, ", ")
}

// contentAddress hashes the canonical plan body (every field except ID) into the plan's ID —
// the idempotency key. S02 reused (Canonicalize+Hash), never a forked scheme. The migration's
// own content address (datamigrate.Plan.ID) rides in, so a different migration → a different
// deploy ID. The DP26 order's content address (when present) also rides in, so a different
// deploy order → a different deploy ID (an S96 plan with no order folds an empty order hash).
func (p DeployPlan) contentAddress() (string, error) {
	orderHash := ""
	if p.Order != nil {
		orderHash = p.Order.Hash
	}
	body := map[string]any{
		"project":          p.Project,
		"phase_hash":       p.PhaseHash,
		"emitted_app_hash": p.EmittedAppHash,
		"url":              p.URL,
		"subdomain":        p.Subdomain,
		"stack_name":       p.StackName,
		"program_path":     p.ProgramPath,
		"migration_id":     p.Migration.ID,
		"has_migration":    p.HasMigration,
		"boot":             p.Boot,
		"teardown":         p.Teardown,
		"order_hash":       orderHash,
	}
	canon, err := records.Canonicalize(mustJSON(body))
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// DeployedMatchesPhase is the S96 RE-PROJECTION property check, made deterministic: the running
// deploy reports its SERVED-app hash (the /__aidos_hash probe the emitted server exposes, which
// equals the EmittedAppHash baked into the emitted bytes); deploy asserts it EQUALS the plan's
// EmittedAppHash. A pure comparison — CODE judges the equality, never an agent. Returns
// (true, nil) on match, (false, BlockReason) on mismatch (a stale/wrong artifact deployed). This
// is the mechanical guarantee that the deployed artifact is RE-PROJECTED from the phase, never a
// stale sandbox artifact (DP26 / ADR 0043).
func DeployedMatchesPhase(plan DeployPlan, servedAppHash string) (bool, *blockreason.BlockReason) {
	if servedAppHash == plan.EmittedAppHash {
		return true, nil
	}
	br := blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: fmt.Sprintf(
			"the deploy serves app hash %q but the phase re-emits %q — the deployed artifact is not the phase's app (a stale sandbox artifact)",
			servedAppHash, plan.EmittedAppHash),
		HowToFix: []string{
			"Re-emit the phase's surface and rebuild the deploy plan (deploy = re-emit, DP26 / ADR 0043)",
			"Tear the stale deploy down (`pulumi destroy`) and `pulumi up` the current emitted program",
			"Never restore a sandbox artifact as-is — the truth-store/phase is authoritative, the code is regenerable",
		},
	}
	return false, &br
}

// MigrationIsForwardOnly reports whether a migration plan is FORWARD-ONLY: its stages appear in
// the canonical EXPAND → BACKFILL → CONTRACT order with no backward step (a CONTRACT never
// precedes a BACKFILL, no stage other than the closed three). PURE — code judges the ordering,
// never an agent. The empty plan (no schema change) is vacuously forward-only.
func MigrationIsForwardOnly(p datamigrate.Plan) bool {
	rank := map[string]int{"expand": 0, "backfill": 1, "contract": 2}
	last := -1
	for _, s := range p.Steps {
		r, ok := rank[s.Stage]
		if !ok {
			return false // an unknown stage is never forward-only.
		}
		if r < last {
			return false // a stage ran out of forward order (a backward step).
		}
		last = r
	}
	return true
}

// dir returns the directory of a forward-slash relative path (the Pulumi --cwd). Pure: no
// filepath (which would leak the host separator) — deploy paths are always "/"-joined.
func dir(p string) string {
	i := strings.LastIndex(p, "/")
	if i < 0 {
		return "."
	}
	return p[:i]
}
