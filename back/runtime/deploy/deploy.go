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
package deploy

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
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
	"github.com/steph-frtech/aidos/back/runtime/preview"
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
	id, err := plan.contentAddress()
	if err != nil {
		br := surfaceBlock(fmt.Errorf("deploy: cannot content-address the plan: %w", err))
		return DeployPlan{}, &br
	}
	plan.ID = id
	return plan, nil
}

// contentAddress hashes the canonical plan body (every field except ID) into the plan's ID —
// the idempotency key. S02 reused (Canonicalize+Hash), never a forked scheme. The migration's
// own content address (datamigrate.Plan.ID) rides in, so a different migration → a different
// deploy ID.
func (p DeployPlan) contentAddress() (string, error) {
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
