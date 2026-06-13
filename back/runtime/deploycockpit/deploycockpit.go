// Package deploycockpit is the AIDOS Workbench DP29 PER-PROJECT DEPLOY & ENVIRONMENTS COCKPIT
// projection (EPIC F, clôture ; ÉTEND S99). It ASSEMBLES — in ONE PURE, deterministic projection —
// everything the /deploy screen renders for a project: the project's PHASES with their LIVENESS
// (vert / rouge / inconnu), the ENVIRONMENTS (preview / staging / prod / future_cloud) with the
// phase each one serves, the custom DOMAINS (+ TLS), the closed PROFILES set, and — for each phase
// — whether it is DEPLOYABLE (« done is computed », DP26). It is the read-side companion of the
// already-built DP25–28 action twins; the SCREEN is the step, this is its read model.
//
// THE DONE-CRITERIA (DP29 / ROADMAP l.449-461). The cockpit shows, per project:
//   - the PHASES with their liveness (vert / rouge / inconnu) — a PURE projection of the DAG cuts
//     (S23 phases.StablePhase / S86), NEVER a re-computation, NEVER an estimation ;
//   - the ENVIRONMENTS (preview / staging / prod / future_cloud) and the phase each serves
//     (DP28 envrollback promotions) ;
//   - the DOMAINS (+ TLS) cabled per environment (DP27 domainbind) ;
//   - the closed PROFILES (DP11 stackmanifest) the preview/deploy may pick ;
//   - per phase, whether it is DEPLOYABLE (DP26 deploy.IsDeployable) — a non-stable phase is
//     marked NON-deployable with the PHASE_NOT_STABLE reason set, never silently hidden ;
//   - the HUMAN-VALIDATION gate reflected (DP28): the dev/preview → staging hop is permitted
//     ONLY when the dev phase carries a validated validation_humaine — surfaced as a per-env flag.
//
// REUSE, NEVER FORK (CLAUDE.md §6, the spec « NE duplique pas »). The projection COMPOSES the
// existing pure twins, it re-implements nothing:
//   - the phase liveness verdict rides phases.StablePhase (S23) — its Stable/Reasons ARE the
//     liveness, read, never re-derived ;
//   - the deployability per phase is deploy.IsDeployable (DP26) — the SAME « done is computed »
//     Stop-gate the deploy/promote inherits, never a forked check ;
//   - the served phase per environment + the live URL ride envrollback (DP28
//     envrollback.LiveURL) ;
//   - the env-domain bindings ride domainbind (DP27) ;
//   - the profiles ride stackmanifest.Profiles (DP11) ;
//   - the content address rides records.Canonicalize+Hash (S02) — the projection is
//     content-addressed so « même DAG ⇒ même projection » is one comparison.
//
// PURE / DETERMINISM-FIRST (CLAUDE.md §6/§8 ; the spec « projection PURE du DAG »). Project is a
// TOTAL, deterministic function of its input — no DB, no clock, no rng, no map-order leak, no I/O,
// no LLM. The same project + phases + environments + domains yields a BYTE-IDENTICAL projection
// (same Hash). The liveness/deployability are PURE comparisons (the code judges, never an agent,
// never an estimation). The reproducibility mirror (deploycockpit_property_test.go) pins it.
//
// THE WALL (CLAUDE.md §2). The cockpit READS already-projected facts (the phase cuts, the
// promotions, the bindings — all below the line) and ASSEMBLES the read model. It writes NOTHING
// to the kernel/mirrors/fitness. A deploy/rollback action from the screen is a ChangeSet proposal
// (infra truth) OR a below-the-line trigger (preview/staging) — never a direct truth-write, never
// from this projection (it only READS). A malformed input yields a well-formed, empty-but-typed
// projection, never a panic.
package deploycockpit

import (
	"encoding/json"

	"github.com/steph-frtech/aidos/back/archive/envrollback"
	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/deploy"
	"github.com/steph-frtech/aidos/back/runtime/domainbind"
)

// Liveness is the CLOSED trichotomy the cockpit colours each phase with (DP29 done-criteria:
// « liveness vert/rouge/inconnu »). It is a PURE projection of the phase's coherent-cut verdict
// (S23), NEVER an estimation:
//   - VERT   — the phase cut is STABLE (every link resolved, every sensor green) ;
//   - ROUGE  — the phase cut is UNSTABLE (≥1 red mirror — a red sensor or a stale/absent link) ;
//   - INCONNU — the phase carries no cut evidence yet (no sensors, no cut) so its liveness is not
//     yet computable; the cockpit shows « inconnu », it NEVER guesses green or red.
type Liveness string

const (
	// LivenessVert — the phase cut is stable (« done is computed » over its links/sensors).
	LivenessVert Liveness = "vert"
	// LivenessRouge — the phase cut is unstable (at least one red mirror over the cut).
	LivenessRouge Liveness = "rouge"
	// LivenessInconnu — the phase has no cut evidence (no sensor snapshot, no cut) — not computable.
	LivenessInconnu Liveness = "inconnu"
)

// LivenessOf is the PURE projection of a phase's coherent-cut verdict (S23) into the cockpit's
// trichotomy. It NEVER re-computes the cut (it READS phases.StablePhase, which IsStable already
// decided) and NEVER estimates: an UNSTABLE phase is rouge ; a STABLE phase with NO evidence (an
// empty cut AND no sensor snapshot) is INCONNU (the liveness is not yet computable — the cockpit
// will not paint it green on no evidence) ; a STABLE phase WITH evidence is vert. Total; no panic.
func LivenessOf(p phases.StablePhase) Liveness {
	if !p.Stable {
		return LivenessRouge
	}
	// A stable verdict over NO evidence (vacuously stable: empty cut + no sensors) is not a
	// computed liveness — the cockpit shows « inconnu », never a green on nothing.
	if len(p.Cut) == 0 && len(p.SensorStatus) == 0 {
		return LivenessInconnu
	}
	return LivenessVert
}

// PhaseInput is ONE project phase the cockpit projects: its content-addressed id (the DAG node id,
// S24), the human label of its DAG line, whether it is a current head (S24), its coherent-cut
// verdict (S23 — the SOURCE of both the liveness and the deployability), and the DP26 Stop-gate
// inputs (mutation/monster, §8). PURE input — no clock, no host path. The phases are supplied in
// the project's frontier order (projectdag, S56); the projection preserves that order.
type PhaseInput struct {
	// NodeID is the DAG node's content address (S24 dag.Node.ID) — the phase id the cockpit keys on.
	NodeID string `json:"node_id"`
	// Label is the human name of the DAG line this phase belongs to (S24 dag.Node.Label).
	Label string `json:"label,omitempty"`
	// Head reports whether this phase is a current head of its line (S24 dag.Node.Head).
	Head bool `json:"head"`
	// Phase is the coherent-cut verdict (S23 phases.StablePhase) — READ, never re-computed. Its
	// Stable/Reasons ARE the liveness; crossed with Gate it is the deployability (DP26).
	Phase phases.StablePhase `json:"phase"`
	// Gate is the DP26 declared/computed « done is computed » inputs (mutation threshold, monster
	// count). Crossed with the cut in deploy.IsDeployable, it decides whether the phase may deploy.
	Gate deploy.Gate `json:"gate"`
}

// EnvironmentInput is ONE environment of the project's ladder the cockpit projects (DP28 + DP06):
// which content-addressed phase it currently SERVES (empty when nothing is deployed there yet), and
// — for the dev/preview rung — whether a validated validation_humaine covers that phase (DP28: the
// preview → staging hop is permitted only then). PURE input — no clock. The served phase is a fact
// (a recorded promotion), not a re-computation.
type EnvironmentInput struct {
	// Env is the environment (preview | staging | prod | future_cloud — the closed DP06 set).
	Env scope.Environment `json:"env"`
	// ServedPhaseID is the DAG node id of the phase this environment currently serves (the recorded
	// DP28 promotion target). Empty ⇒ nothing deployed there yet (« — » in the cockpit).
	ServedPhaseID string `json:"served_phase_id,omitempty"`
	// DomainRoot is the custom domain root linked to this env (DP27). Empty ⇒ the default deploy root.
	DomainRoot string `json:"domain_root,omitempty"`
	// HumanValidated reflects the DP28 gate: whether a validated validation_humaine covers the served
	// phase. Read from the recorded validation, never inferred. Only meaningful on the preview rung.
	HumanValidated bool `json:"human_validated,omitempty"`
}

// Input is the WHOLE cockpit request for ONE project: the project id, its phases (in frontier
// order), its environments (in ladder order), and its custom-domain bindings (DP27). PURE input —
// no clock, no host path, no I/O. Every field is a fact already projected below the line; the
// cockpit only ASSEMBLES them into the read model the screen renders.
type Input struct {
	// Project is the app the cockpit is for (per-project, S55/S56). Empty is tolerated (an empty,
	// well-formed projection results — never a panic).
	Project string `json:"project"`
	// Phases are the project's phases in frontier order (projectdag, S56). The projection preserves
	// the order (it does not re-sort the DAG — the order is the caller's DAG topology).
	Phases []PhaseInput `json:"phases"`
	// Environments are the project's environments in ladder order (DP06 / DP28). Defaults to the
	// closed four-rung ladder (preview/staging/prod/future_cloud) when none are supplied.
	Environments []EnvironmentInput `json:"environments,omitempty"`
	// Domains are the project's custom-domain bindings already resolved per environment (DP27
	// domainbind.EnvDomainBinding). The cockpit projects them as-is (TLS/URL/labels read, not redone).
	Domains []domainbind.EnvDomainBinding `json:"domains,omitempty"`
}

// PhaseCard is ONE phase as the cockpit shows it: its id/label/head, its liveness (vert/rouge/
// inconnu), whether it is DEPLOYABLE (DP26), and the reasons it is not (the red mirrors / a
// below-threshold mutation score / a present monster — the SOURCE of the PHASE_NOT_STABLE refusal).
// PURE data the screen renders as a phase row with its deploy button enabled iff Deployable.
type PhaseCard struct {
	// NodeID + Label + Head echo the DAG node (S24).
	NodeID string `json:"node_id"`
	Label  string `json:"label,omitempty"`
	Head   bool   `json:"head"`
	// Liveness is the projected trichotomy (vert/rouge/inconnu) — a PURE projection of the cut.
	Liveness Liveness `json:"liveness"`
	// Deployable is the DP26 « done is computed » verdict (deploy.IsDeployable): the cut is stable
	// AND mutation ≥ threshold AND no monster. The « Déployer cette phase » button is enabled iff true.
	Deployable bool `json:"deployable"`
	// Reasons names every offending fact when NOT deployable (the red mirror ids, a below-threshold
	// mutation score, a present monster), sorted — the reason set behind the PHASE_NOT_STABLE refusal.
	// Empty iff Deployable.
	Reasons []string `json:"reasons"`
}

// EnvironmentCard is ONE environment as the cockpit shows it (DP28 + DP27): the env, the phase it
// serves (+ its liveness, projected from the served phase), the live HTTPS URL (DP28 LiveURL —
// always https, TLS inherited), the custom domain (DP27), and — for the preview rung — whether the
// served phase is human-validated (the DP28 gate). PURE data the screen renders as an env row with
// its deploy/promote/rollback controls.
type EnvironmentCard struct {
	// Env is the environment (preview | staging | prod | future_cloud).
	Env scope.Environment `json:"env"`
	// ServedPhaseID is the phase this env serves (empty ⇒ nothing deployed there yet).
	ServedPhaseID string `json:"served_phase_id,omitempty"`
	// ServedLiveness is the liveness of the served phase (vert/rouge/inconnu) — projected from the
	// phase card. Empty when nothing is served (no phase to colour).
	ServedLiveness Liveness `json:"served_liveness,omitempty"`
	// LiveURL is the live HTTPS URL this env serves the app at (DP28 envrollback.LiveURL — always
	// https). Empty when nothing is deployed there yet.
	LiveURL string `json:"live_url,omitempty"`
	// Domain is the custom domain cabled into this env (DP27). Empty ⇒ the default deploy root.
	Domain string `json:"domain,omitempty"`
	// TLS reports whether the env terminates TLS for its custom domain (DP27 — always true for an
	// accepted HTTPS custom domain; the cockpit surfaces it as a padlock).
	TLS bool `json:"tls,omitempty"`
	// HumanValidated reflects the DP28 gate (only meaningful on the preview rung): whether the served
	// phase carries a validated validation_humaine. The « Promouvoir → staging » button is enabled
	// iff this is true (fail-closed). Read, never inferred.
	HumanValidated bool `json:"human_validated,omitempty"`
	// StagingPromotable is the DP28 gate verdict for the preview rung: a validated preview deployment
	// unlocks the staging promotion. False on every other rung (the gate is preview→staging only).
	StagingPromotable bool `json:"staging_promotable,omitempty"`
}

// Projection is the DP29 per-project cockpit read model: the project's phase cards, environment
// cards, custom-domain bindings, the closed profile set the preview/deploy may pick, and the
// content address of the whole projection (so « même DAG ⇒ même projection » is one comparison).
// It is the PURE assembly the /deploy screen renders. Same Input → byte-identical Projection
// (same Hash).
type Projection struct {
	// Project echoes the project the cockpit is for (per-project, S55/S56).
	Project string `json:"project"`
	// Phases are the project's phase cards in frontier order (liveness + deployability per phase).
	Phases []PhaseCard `json:"phases"`
	// Environments are the project's environment cards in ladder order (served phase + URL + domain).
	Environments []EnvironmentCard `json:"environments"`
	// Domains are the project's custom-domain bindings (DP27 — TLS/URL/labels, read as-is).
	Domains []domainbind.EnvDomainBinding `json:"domains"`
	// Profiles is the CLOSED DP11 profile set (stackmanifest.Profiles) the preview/deploy may pick.
	Profiles []stackmanifest.Profile `json:"profiles"`
	// Hash is the content address of the whole projection (records.Hash over the canonical body, S02
	// reused). Same Input → same Hash (the reproducibility oracle — « projection PURE du DAG »).
	Hash string `json:"hash"`
}

// EnvPreview is the DP28 ephemeral preview environment as the cockpit's env type (the lowest rung
// of the DP29 ladder). It is NOT a kernel-scope truth-holder (scope.Environment is prod/staging/dev/
// local/future_cloud — §13.7+DP06) — preview is a RUNTIME deploy environment (envrollback.EnvPreview).
// The cockpit's ladder mixes the runtime preview rung with the scope deploy rungs, so this const
// carries the string value verbatim; envrollback.LiveURL consumes it via envrollback.Environment.
const EnvPreview scope.Environment = "preview"

// defaultLadder is the CLOSED DP29 environment ladder the cockpit projects when the caller supplies
// none — preview / staging / prod / future_cloud. Declared once; copied out (never derived from map
// iteration — determinism). future_cloud is the portability target (ADR 0065); local is NOT a
// deploy rung (it terminates no TLS — DP27).
var defaultLadder = []scope.Environment{
	EnvPreview,
	scope.EnvStaging,
	scope.EnvProd,
	scope.EnvFutureCloud,
}

// DefaultLadder returns the closed four-rung deploy ladder in its declared order (a copy — never
// mutable). The cockpit and the screen's env switcher read this single source.
func DefaultLadder() []scope.Environment {
	out := make([]scope.Environment, len(defaultLadder))
	copy(out, defaultLadder)
	return out
}

// Project is the PURE DP29 cockpit projection (the spec's « DeployCockpitProjection »). It
// ASSEMBLES — in one deterministic projection — the project's phase cards (liveness + deployability,
// reusing S23 + DP26), environment cards (served phase + live URL + domain, reusing DP28 + DP27),
// custom-domain bindings (DP27), and the closed DP11 profile set, then content-addresses the whole
// read model (S02). It re-computes NOTHING — every verdict is READ from the pure twins:
//
//   - liveness   = LivenessOf(phase.Phase) — a pure projection of the S23 cut verdict ;
//   - deployable = deploy.IsDeployable(phase.Phase, phase.Gate) — the SAME DP26 Stop-gate ;
//   - live URL   = envrollback.LiveURL(env, servedPhase, domainRoot) — the DP28 address ;
//   - profiles   = stackmanifest.Profiles() — the closed DP11 set.
//
// PURE / TOTAL: no DB, no clock, no rng, no map-order leak, no I/O, no LLM. Same Input →
// byte-identical Projection (same Hash). NEVER panics on a malformed/empty input (an empty project
// yields an empty-but-typed projection with a stable hash). The cockpit WRITES NOTHING (the wall).
//
// projectID is the spec's first positional argument (« DeployCockpitProjection(projectID, …) »);
// when empty it falls back to in.Project, so the caller may pass the project id either positionally
// or inside the Input (the projection's Project echoes whichever is non-empty, projectID winning).
func Project(projectID string, in Input) Projection {
	project := projectID
	if project == "" {
		project = in.Project
	}

	// ── PHASES — liveness + deployability, a pure projection of the cut (S23 + DP26). ──
	// A by-node-id index of each phase's liveness, so an environment can colour its served phase
	// from the SAME projection (one source — the env never re-derives the liveness).
	livenessByPhase := make(map[string]Liveness, len(in.Phases))
	phaseCards := make([]PhaseCard, 0, len(in.Phases))
	for _, p := range in.Phases {
		live := LivenessOf(p.Phase)
		livenessByPhase[p.NodeID] = live
		// deploy.IsDeployable IS the DP26 « done is computed » Stop-gate — reused, never forked. A
		// non-stable phase is marked NON-deployable with the reason set (the PHASE_NOT_STABLE source).
		deployable, reasons := deploy.IsDeployable(p.Phase, p.Gate)
		if reasons == nil {
			reasons = []string{}
		}
		phaseCards = append(phaseCards, PhaseCard{
			NodeID:     p.NodeID,
			Label:      p.Label,
			Head:       p.Head,
			Liveness:   live,
			Deployable: deployable,
			Reasons:    reasons,
		})
	}

	// ── DOMAINS — index the resolved DP27 bindings by environment (read as-is, never re-resolved). ──
	domainByEnv := make(map[scope.Environment]domainbind.EnvDomainBinding, len(in.Domains))
	for _, d := range in.Domains {
		domainByEnv[d.Environment] = d
	}

	// ── ENVIRONMENTS — served phase + live URL + domain + the DP28 gate (a pure assembly). ──
	envs := in.Environments
	if len(envs) == 0 {
		// No environments supplied ⇒ the closed default ladder (every rung empty — nothing deployed).
		envs = make([]EnvironmentInput, 0, len(defaultLadder))
		for _, e := range defaultLadder {
			envs = append(envs, EnvironmentInput{Env: e})
		}
	}
	envCards := make([]EnvironmentCard, 0, len(envs))
	for _, e := range envs {
		card := EnvironmentCard{
			Env:           e.Env,
			ServedPhaseID: e.ServedPhaseID,
		}
		// The DP28 gate: the preview rung unlocks the staging promotion ONLY when its served phase
		// carries a validated validation_humaine. Fail-closed (read, never inferred).
		if e.Env == EnvPreview {
			card.HumanValidated = e.HumanValidated
			card.StagingPromotable = e.HumanValidated && e.ServedPhaseID != ""
		}
		if e.ServedPhaseID != "" {
			// Colour the served phase from the SAME phase index (one source — never re-derived).
			card.ServedLiveness = livenessByPhase[e.ServedPhaseID]
			// The live HTTPS URL is the DP28 address (always https — TLS inherited). REUSED, not minted.
			card.LiveURL = envrollback.LiveURL(envrollback.Environment(e.Env), e.ServedPhaseID, e.DomainRoot)
		}
		// The custom domain (DP27) cabled into this env — read as-is (TLS/URL already resolved).
		if d, ok := domainByEnv[e.Env]; ok {
			card.Domain = d.Domain
			card.TLS = d.TLS
		}
		envCards = append(envCards, card)
	}

	// ── DOMAINS (read-as-is) + PROFILES (closed DP11 set) ──
	domains := in.Domains
	if domains == nil {
		domains = []domainbind.EnvDomainBinding{}
	}

	proj := Projection{
		Project:      project,
		Phases:       phaseCards,
		Environments: envCards,
		Domains:      domains,
		Profiles:     stackmanifest.Profiles(),
	}
	proj.Hash = proj.contentAddress()
	return proj
}

// contentAddress is the content address of the whole projection (records.Canonicalize+Hash, S02
// reused — NEVER a forked hash scheme). It hashes the canonical projection body MINUS the hash
// field itself (a field cannot address itself), so « même DAG ⇒ même projection » is one byte
// comparison. PURE, TOTAL — a marshal/canonicalise failure (a programming fault: the shapes are
// plain structs) folds into the canonicalisation of "{}", so the hash differs, never silently
// equal. The reproducibility mirror pins determinism + order-stability.
func (p Projection) contentAddress() string {
	// Render the canonical body deterministically: the projection without its own hash. The
	// phase/env/domain slices are already in a deterministic order (frontier / ladder order; the
	// reason sets are sorted by IsDeployable). The profile set is canonical (stackmanifest order).
	body := canonicalProjectionBody(p)
	canon, err := records.Canonicalize(body)
	if err != nil {
		// Plain structs always marshal; a failure is a programming fault — fold to a distinct hash.
		canon = []byte("{}")
	}
	return records.Hash(canon)
}

// canonicalProjectionBody marshals the projection to a stable JSON body for content-addressing,
// EXCLUDING the Hash field (self-reference). It builds a plain map (sorted keys via Canonicalize)
// so the body is deterministic and total. Reason/phase/env order is the caller's frontier order
// (the DAG topology), which the projection preserves verbatim — the address is stable for the same
// DAG. PURE, TOTAL.
func canonicalProjectionBody(p Projection) []byte {
	// Render via the typed slices (they JSON-marshal deterministically — every slice is in a fixed
	// order and every field is a scalar/sorted slice). We strip the hash by re-marshalling a copy
	// with Hash cleared, so the body never references its own address.
	clone := Projection{
		Project:      p.Project,
		Phases:       p.Phases,
		Environments: p.Environments,
		Domains:      p.Domains,
		Profiles:     p.Profiles,
		// Hash deliberately left empty — a field cannot address itself.
	}
	b, err := json.Marshal(clone)
	if err != nil {
		return []byte("{}")
	}
	return b
}
