package deploycockpit_test

// DP29 — DEPLOY & ENVIRONMENTS COCKPIT (fixture, the workflow proof). N2.
// reflects=runtime.deploycockpit · test_kind=fixture · liveness=live.
//
// The cockpit's done-criteria, exercised as a deterministic projection over a fixed DAG state
// (the Go twin of the Playwright e2e — the screen's read model):
//
//   - a project's phases are projected with their liveness (vert / rouge / inconnu) ;
//   - a stable (vert) phase IS deployable ; a non-stable (rouge) phase is NOT, named with reasons
//     (the PHASE_NOT_STABLE source — « une action sur phase non-stable refusée ») ;
//   - an environment serving a phase carries its live HTTPS URL + the served phase's liveness ;
//   - a custom domain (DP27) surfaces with TLS ;
//   - the DP28 human gate gates the preview → staging promotion ;
//   - the closed DP11 profile set is offered ;
//   - the whole projection is content-addressed (same DAG → same Hash).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/deploy"
	"github.com/steph-frtech/aidos/back/runtime/deploycockpit"
	"github.com/steph-frtech/aidos/back/runtime/domainbind"
)

func gate() deploy.Gate {
	return deploy.Gate{MutationScore: 0.95, MutationThreshold: 0.8, MonsterCount: 0}
}

func vertPhase() phases.StablePhase {
	return phases.IsStable(
		phases.Cut{"checkout": "v1"},
		nil, nil,
		[]phases.SensorStatus{{ID: "createOrder.fixture", Pass: true}},
	)
}

func rougePhase() phases.StablePhase {
	return phases.IsStable(
		phases.Cut{"checkout": "v1"},
		nil, nil,
		[]phases.SensorStatus{{ID: "createOrder.fixture", Pass: false}},
	)
}

// fullCockpitInput — a project with a vert head phase + a rouge phase, a full ladder serving the
// vert phase in prod, a custom domain on prod, and a validated preview rung.
func fullCockpitInput() deploycockpit.Input {
	return deploycockpit.Input{
		Project: "shop",
		Phases: []deploycockpit.PhaseInput{
			{NodeID: "node-head", Label: "main", Head: true, Phase: vertPhase(), Gate: gate()},
			{NodeID: "node-broken", Label: "wip", Head: false, Phase: rougePhase(), Gate: gate()},
		},
		Environments: []deploycockpit.EnvironmentInput{
			{Env: deploycockpit.EnvPreview, ServedPhaseID: "node-head", HumanValidated: true},
			{Env: scope.EnvStaging},
			{Env: scope.EnvProd, ServedPhaseID: "node-head", DomainRoot: "shop.example.com"},
			{Env: scope.EnvFutureCloud},
		},
		Domains: []domainbind.EnvDomainBinding{
			{Environment: scope.EnvProd, Domain: "shop.example.com", Project: "shop", URL: "https://shop.example.com", TLS: true},
		},
	}
}

// (1) PHASES — liveness (vert / rouge / inconnu) is projected, never estimated.
func TestPhasesShowLiveness(t *testing.T) {
	proj := deploycockpit.Project("shop", fullCockpitInput())
	if len(proj.Phases) != 2 {
		t.Fatalf("want 2 phase cards, got %d", len(proj.Phases))
	}
	if proj.Phases[0].Liveness != deploycockpit.LivenessVert {
		t.Fatalf("head phase liveness = %q, want vert", proj.Phases[0].Liveness)
	}
	if proj.Phases[1].Liveness != deploycockpit.LivenessRouge {
		t.Fatalf("broken phase liveness = %q, want rouge", proj.Phases[1].Liveness)
	}
	// A vacuously-stable phase (no evidence) is INCONNU, never estimated green.
	inconnu := deploycockpit.Project("shop", deploycockpit.Input{
		Project: "shop",
		Phases:  []deploycockpit.PhaseInput{{NodeID: "node-empty", Phase: phases.IsStable(nil, nil, nil, nil), Gate: gate()}},
	})
	if inconnu.Phases[0].Liveness != deploycockpit.LivenessInconnu {
		t.Fatalf("empty phase liveness = %q, want inconnu (never estimated green)", inconnu.Phases[0].Liveness)
	}
}

// (2) DEPLOYABILITY — a vert phase IS deployable ; a rouge phase is NOT, named with reasons.
func TestVertPhaseDeployableRougeRefused(t *testing.T) {
	proj := deploycockpit.Project("shop", fullCockpitInput())
	head := proj.Phases[0]
	broken := proj.Phases[1]
	if !head.Deployable {
		t.Fatalf("vert head phase must be deployable")
	}
	if len(head.Reasons) != 0 {
		t.Fatalf("a deployable phase has no reasons, got %v", head.Reasons)
	}
	if broken.Deployable {
		t.Fatalf("rouge phase must NOT be deployable (the PHASE_NOT_STABLE refusal)")
	}
	if len(broken.Reasons) == 0 {
		t.Fatalf("a non-deployable phase must name its reasons (PHASE_NOT_STABLE source)")
	}
	// The reason set is exactly the DP26 Stop-gate's — the red sensor id.
	found := false
	for _, r := range broken.Reasons {
		if r == "createOrder.fixture" {
			found = true
		}
	}
	if !found {
		t.Fatalf("the rouge reason set must name the red mirror, got %v", broken.Reasons)
	}
}

// (3) ENVIRONMENTS — an env serving a phase carries its live HTTPS URL + the served liveness.
func TestEnvironmentServesPhaseWithLiveURL(t *testing.T) {
	proj := deploycockpit.Project("shop", fullCockpitInput())
	if len(proj.Environments) != 4 {
		t.Fatalf("want 4 env cards, got %d", len(proj.Environments))
	}
	var prod deploycockpit.EnvironmentCard
	for _, e := range proj.Environments {
		if e.Env == scope.EnvProd {
			prod = e
		}
	}
	if prod.ServedPhaseID != "node-head" {
		t.Fatalf("prod must serve node-head, got %q", prod.ServedPhaseID)
	}
	if prod.ServedLiveness != deploycockpit.LivenessVert {
		t.Fatalf("prod served liveness = %q, want vert", prod.ServedLiveness)
	}
	if !strings.HasPrefix(prod.LiveURL, "https://") {
		t.Fatalf("prod live URL must be HTTPS, got %q", prod.LiveURL)
	}
	if prod.Domain != "shop.example.com" || !prod.TLS {
		t.Fatalf("prod must surface its custom domain with TLS, got domain=%q tls=%v", prod.Domain, prod.TLS)
	}
	// The staging rung serves nothing (no phase deployed there) — empty, not estimated.
	var staging deploycockpit.EnvironmentCard
	for _, e := range proj.Environments {
		if e.Env == scope.EnvStaging {
			staging = e
		}
	}
	if staging.ServedPhaseID != "" || staging.LiveURL != "" {
		t.Fatalf("staging must be empty (nothing deployed), got served=%q url=%q", staging.ServedPhaseID, staging.LiveURL)
	}
}

// (4) HUMAN GATE — the preview → staging promotion is permitted only when the preview rung is
// human-validated (DP28, fail-closed).
func TestHumanGateGatesStaging(t *testing.T) {
	// Validated preview rung ⇒ staging promotable.
	proj := deploycockpit.Project("shop", fullCockpitInput())
	preview := proj.Environments[0]
	if preview.Env != deploycockpit.EnvPreview {
		t.Fatalf("first rung must be preview, got %q", preview.Env)
	}
	if !preview.HumanValidated || !preview.StagingPromotable {
		t.Fatalf("a validated preview rung must be staging-promotable, got validated=%v promotable=%v", preview.HumanValidated, preview.StagingPromotable)
	}

	// NOT validated ⇒ staging NOT promotable (fail-closed).
	in := fullCockpitInput()
	in.Environments[0].HumanValidated = false
	refused := deploycockpit.Project("shop", in)
	if refused.Environments[0].StagingPromotable {
		t.Fatalf("an unvalidated preview rung must NOT be staging-promotable (DEV_NOT_HUMAN_VALIDATED)")
	}
}

// (5) PROFILES — the closed DP11 set is offered, core first.
func TestProfilesOffered(t *testing.T) {
	proj := deploycockpit.Project("shop", fullCockpitInput())
	if len(proj.Profiles) == 0 {
		t.Fatalf("the closed DP11 profile set must be offered")
	}
	if proj.Profiles[0] != "core" {
		t.Fatalf("core must be the first profile, got %q", proj.Profiles[0])
	}
}

// (6) CONTENT ADDRESS — same DAG → same Hash ; a changed phase → a different Hash (no estimation).
func TestProjectionContentAddressed(t *testing.T) {
	a := deploycockpit.Project("shop", fullCockpitInput())
	b := deploycockpit.Project("shop", fullCockpitInput())
	if a.Hash != b.Hash {
		t.Fatalf("same DAG must yield the same Hash: %q != %q", a.Hash, b.Hash)
	}
	// Flip the head phase to rouge → the projection MUST differ (the address is sensitive).
	changed := fullCockpitInput()
	changed.Phases[0].Phase = rougePhase()
	c := deploycockpit.Project("shop", changed)
	if a.Hash == c.Hash {
		t.Fatalf("a changed phase must change the Hash (content-address sensitivity)")
	}
}

// (7) PROJECT ID — the positional projectID wins; falls back to Input.Project when empty.
func TestProjectIDResolution(t *testing.T) {
	in := deploycockpit.Input{Project: "from-input"}
	if got := deploycockpit.Project("from-arg", in).Project; got != "from-arg" {
		t.Fatalf("positional projectID must win, got %q", got)
	}
	if got := deploycockpit.Project("", in).Project; got != "from-input" {
		t.Fatalf("empty projectID must fall back to Input.Project, got %q", got)
	}
}

// (8) TOTALITY — an empty input never panics and yields a well-formed, empty-but-typed projection.
func TestEmptyInputIsTotal(t *testing.T) {
	proj := deploycockpit.Project("", deploycockpit.Input{})
	if proj.Hash == "" {
		t.Fatalf("even an empty projection must be content-addressed")
	}
	if proj.Phases == nil || proj.Domains == nil {
		t.Fatalf("an empty projection must carry typed empty slices, not nil")
	}
	if len(proj.Environments) != 4 {
		t.Fatalf("an empty projection must still carry the closed default ladder, got %d", len(proj.Environments))
	}
}
