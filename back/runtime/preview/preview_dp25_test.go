package preview_test

// DP25 — preview PROFILE + BOOTSTRAP extension mirror (property + fixture).
// reflects=dp25-preview-profile-bootstrap · test_kind=property+fixture · liveness=live.
//
// DP25 EXTENDS S94: the preview RE-EMITS from the phase then AMORCES via the DP12 bootstrap
// sequence, with a DP11-SELECTABLE profile. THE CAPITAL INVARIANT: the profile changes the
// bootstrapped SERVICES but NEVER the EmittedAppHash of the phase. These mirrors pin:
//
//	(1) HASH-INVARIANT — ∀ profiles, the plan's EmittedAppHash equals the phase's emitted
//	    app hash (ServedMatchesEmitted holds); the profile never moves the app-hash.
//	(2) REPRODUCIBILITY — same phase+profile → byte-identical PreviewPlan (same ID, same
//	    bootstrap sequence hash, same teardown).
//	(3) CORE vs FULL — distinct profiles → distinct bootstrapped services + distinct
//	    bootstrap sequence hash, but IDENTICAL EmittedAppHash.
//	(4) DETERMINISTIC TEARDOWN — TeardownOf is a pure function of the plan; the services
//	    unwind in reverse boot order; full demounts a superset of core.
//
// The bootstrap is a PURE plan-as-data — no real docker (the mirror proves the PLAN + the
// hash; the web-preview server serves the app, ADR 0040).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/bootstrap"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
	"github.com/steph-frtech/aidos/back/runtime/preview"
	"pgregory.net/rapid"
)

// mustProgram builds the emitted Pulumi program for a project WITHOUT a *testing.T (reused
// in rapid checks). It panics on a refusal — the honoemit manifest is valid by construction,
// so a refusal is a programming fault, never a runtime input.
func mustProgram(project string) honoemit.Artifact {
	m := honoemit.StackManifest{
		App: project,
		Services: []honoemit.Service{
			{Name: project + "-server", Role: honoemit.RoleServer, Image: "node:22", InternalPort: 3000},
			{Name: project + "-db", Role: honoemit.RoleDatastore, Image: "postgres:16", InternalPort: 5432},
		},
		Network: honoemit.Network{Name: "traefik_default", External: true},
	}
	art, br := honoemit.EmitPulumiProgram(m)
	if br != nil {
		panic("mustProgram: " + br.Explanation)
	}
	return art
}

// dp25Manifest is a DP02 manifest with a CORE server+datastore PLUS one NON-core service
// (an observability sidecar, profile=observability) — so `core` and `full` actually differ
// (core boots 2 services, full boots 3). Deterministic, valid (one role=server, unique
// ports/names, roles+profiles in their closed sets).
func dp25Manifest(project string) stackmanifest.StackManifest {
	return stackmanifest.StackManifest{
		AppName: project,
		Services: []stackmanifest.Service{
			{Name: "app", Role: stackmanifest.RoleServer, Image: "node:22", InternalPort: 3000, Profile: stackmanifest.ProfileCore},
			{Name: "postgres", Role: stackmanifest.RoleDatastore, Image: "postgres:17", InternalPort: 5432, Profile: stackmanifest.ProfileCore},
			{Name: "otel", Role: stackmanifest.RoleObservability, Image: "otel/collector", InternalPort: 4317, Profile: stackmanifest.ProfileObservability},
		},
		Volumes:         []stackmanifest.Volume{{Name: "app_data", DeviceVar: "APP_DATA_PATH"}},
		Network:         stackmanifest.Network{Name: "traefik_default", External: true},
		ConnectorScopes: []string{"postgres:read-only"},
	}
}

// dp25Secrets is the present-secret set covering the manifest's declared connector scopes
// (so the bootstrap never fails closed on a missing secret in the happy-path mirrors).
func dp25Secrets(m stackmanifest.StackManifest) bootstrap.SecretsState {
	return bootstrap.SecretsState{Present: bootstrap.RequiredSecrets(m)}
}

func dp25Input(project string, profile stackmanifest.Profile) preview.Input {
	m := dp25Manifest(project)
	return preview.Input{
		Phase:    preview.PhaseRef{PhaseHash: "phase-dp25" + project},
		Surface:  fixtureSurface(project),
		Program:  mustProgram(project),
		Profile:  profile,
		Manifest: m,
		Secrets:  dp25Secrets(m),
		Env:      scope.EnvDev,
	}
}

// Property 1: HASH-INVARIANT — ∀ profiles, the plan's EmittedAppHash equals the phase's
// emitted app hash, and ServedMatchesEmitted holds. The profile NEVER moves the app-hash.
func TestDP25HashInvariantAcrossProfiles(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		project := rapid.SampledFrom([]string{"shop", "blog", "crm"}).Draw(t, "project")
		profile := rapid.SampledFrom([]stackmanifest.Profile{
			stackmanifest.ProfileCore,
			stackmanifest.ProfileFull,
			stackmanifest.ProfileObservability,
		}).Draw(t, "profile")

		// The S94 baseline app-hash: NO manifest, NO profile (the phase ⊕ surface only).
		baseIn := preview.Input{
			Phase:   preview.PhaseRef{PhaseHash: "phase-dp25" + project},
			Surface: fixtureSurface(project),
			Program: mustProgram(project),
		}
		base, bb := preview.BuildPlan(baseIn)
		if bb != nil {
			t.Fatalf("baseline refused: %v", bb)
		}

		plan, br := preview.BuildPlan(dp25Input(project, profile))
		if br != nil {
			t.Fatalf("profile %q refused: %v", profile, br)
		}
		// The capital invariant: the profile changes nothing about the app-hash.
		if plan.EmittedAppHash != base.EmittedAppHash {
			t.Fatalf("profile %q moved the EmittedAppHash: %q vs baseline %q",
				profile, plan.EmittedAppHash, base.EmittedAppHash)
		}
		// The done-criterion still holds: the honest served hash matches.
		ok, sb := preview.ServedMatchesEmitted(plan, plan.EmittedAppHash)
		if !ok || sb != nil {
			t.Fatalf("profile %q: served hash != emitted hash", profile)
		}
		// The URL/subdomain/stack are profile-independent too (keyed on the phase only).
		if plan.URL != base.URL || plan.Subdomain != base.Subdomain || plan.StackName != base.StackName {
			t.Fatalf("profile %q moved the URL/subdomain/stack", profile)
		}
	})
}

// Property 2: REPRODUCIBILITY — same phase+profile → byte-identical PreviewPlan (same ID,
// same bootstrap sequence hash, same teardown).
func TestDP25Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		project := rapid.SampledFrom([]string{"shop", "blog", "crm"}).Draw(t, "project")
		profile := rapid.SampledFrom([]stackmanifest.Profile{
			stackmanifest.ProfileCore, stackmanifest.ProfileFull, stackmanifest.ProfileObservability,
		}).Draw(t, "profile")
		in := dp25Input(project, profile)

		a, ba := preview.BuildPlan(in)
		b, bb := preview.BuildPlan(in)
		if ba != nil || bb != nil {
			t.Fatalf("refused: %v / %v", ba, bb)
		}
		if a.ID != b.ID {
			t.Fatalf("plan id not reproducible: %q vs %q", a.ID, b.ID)
		}
		if a.Bootstrap == nil || b.Bootstrap == nil {
			t.Fatalf("bootstrap missing for a profiled input")
		}
		if a.Bootstrap.SequenceHash != b.Bootstrap.SequenceHash {
			t.Fatalf("bootstrap sequence hash not reproducible")
		}
		ta, tb := preview.TeardownOf(a), preview.TeardownOf(b)
		if strings.Join(ta.Commands, " ") != strings.Join(tb.Commands, " ") {
			t.Fatalf("teardown commands not reproducible")
		}
		if strings.Join(ta.Services, ",") != strings.Join(tb.Services, ",") {
			t.Fatalf("teardown services not reproducible")
		}
	})
}

// Property 3: A LEAN PROFILE vs FULL — a profile that excludes the optional (non-core)
// services boots FEWER services than full + a distinct bootstrap sequence hash, but the
// EmittedAppHash is IDENTICAL (and so are URL/subdomain/stack — the capital invariant).
//
// DP11 SEMANTICS NOTE. A `core` SELECTION keeps every service whose profile set contains
// core — and ServiceProfiles adds core to EVERY service — so `core` ≡ `full` in service
// count (core is the always-on baseline, never a restriction). The LEAN profile that
// genuinely narrows is a specific profile no optional service declares (here `git`): it
// keeps only the always-on core services, excluding the observability sidecar.
func TestDP25LeanVsFull(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		project := rapid.SampledFrom([]string{"shop", "blog", "crm"}).Draw(t, "project")

		lean, lbr := preview.BuildPlan(dp25Input(project, stackmanifest.ProfileGit))
		full, fbr := preview.BuildPlan(dp25Input(project, stackmanifest.ProfileFull))
		if lbr != nil || fbr != nil {
			t.Fatalf("refused: lean=%v full=%v", lbr, fbr)
		}
		if lean.Bootstrap == nil || full.Bootstrap == nil {
			t.Fatalf("missing bootstrap")
		}
		// the lean profile boots fewer services than full (the observability sidecar is excluded).
		if len(lean.Bootstrap.Services) >= len(full.Bootstrap.Services) {
			t.Fatalf("lean (%d svc) should boot fewer than full (%d svc)",
				len(lean.Bootstrap.Services), len(full.Bootstrap.Services))
		}
		// full is a SUPERSET of lean (every always-on core service is bootstrapped by full).
		fullSet := map[string]bool{}
		for _, s := range full.Bootstrap.Services {
			fullSet[s] = true
		}
		for _, s := range lean.Bootstrap.Services {
			if !fullSet[s] {
				t.Fatalf("full does not contain lean service %q", s)
			}
		}
		// the observability sidecar is in full but NOT the lean profile.
		if !fullSet["otel"] {
			t.Fatalf("full did not boot the observability sidecar")
		}
		leanSet := map[string]bool{}
		for _, s := range lean.Bootstrap.Services {
			leanSet[s] = true
		}
		if leanSet["otel"] {
			t.Fatalf("lean profile wrongly booted the non-core observability sidecar")
		}
		// distinct services → distinct bootstrap sequence hash.
		if lean.Bootstrap.SequenceHash == full.Bootstrap.SequenceHash {
			t.Fatalf("lean and full share a bootstrap sequence hash despite different services")
		}
		// distinct services → distinct plan id (the bootstrap folds into the address).
		if lean.ID == full.ID {
			t.Fatalf("lean and full share a plan id despite different bootstrap")
		}
		// BUT the EmittedAppHash is identical (the capital invariant), and so is the URL/stack.
		if lean.EmittedAppHash != full.EmittedAppHash {
			t.Fatalf("lean and full disagree on EmittedAppHash: %q vs %q",
				lean.EmittedAppHash, full.EmittedAppHash)
		}
		if lean.URL != full.URL || lean.StackName != full.StackName {
			t.Fatalf("lean and full disagree on URL/stack")
		}
	})
}

// Property 3b: CORE is the always-on baseline — selecting `core` keeps EVERY service (the
// DP11 docker-compose semantic: every service's profile set contains core), so the core
// preview ≡ the full preview in bootstrapped services AND app-hash. This pins that `core`
// (the default) is a complete-enough baseline, never an accidental restriction.
func TestDP25CoreIsBaselineEqualsFull(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		project := rapid.SampledFrom([]string{"shop", "blog", "crm"}).Draw(t, "project")
		core, cbr := preview.BuildPlan(dp25Input(project, stackmanifest.ProfileCore))
		full, fbr := preview.BuildPlan(dp25Input(project, stackmanifest.ProfileFull))
		if cbr != nil || fbr != nil {
			t.Fatalf("refused: core=%v full=%v", cbr, fbr)
		}
		// core keeps every service (the baseline) — same set, same sequence hash as full.
		if strings.Join(core.Bootstrap.Services, ",") != strings.Join(full.Bootstrap.Services, ",") {
			t.Fatalf("core baseline differs from full: %v vs %v",
				core.Bootstrap.Services, full.Bootstrap.Services)
		}
		// the EmittedAppHash is identical across the two (the capital invariant).
		if core.EmittedAppHash != full.EmittedAppHash {
			t.Fatalf("core and full disagree on EmittedAppHash")
		}
	})
}

// Property 4: DETERMINISTIC TEARDOWN — TeardownOf is pure; services unwind in reverse boot
// order; full demounts a superset of core; the commands are the plan's deterministic destroy.
func TestDP25TeardownDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		project := rapid.SampledFrom([]string{"shop", "blog", "crm"}).Draw(t, "project")
		profile := rapid.SampledFrom([]stackmanifest.Profile{
			stackmanifest.ProfileCore, stackmanifest.ProfileFull,
		}).Draw(t, "profile")
		plan, br := preview.BuildPlan(dp25Input(project, profile))
		if br != nil {
			t.Fatalf("refused: %v", br)
		}
		td := preview.TeardownOf(plan)
		// pure: re-deriving yields the identical teardown.
		td2 := preview.TeardownOf(plan)
		if strings.Join(td.Services, ",") != strings.Join(td2.Services, ",") ||
			strings.Join(td.Commands, " ") != strings.Join(td2.Commands, " ") {
			t.Fatalf("teardown not pure")
		}
		// the demounting is the EXACT REVERSE of the bootstrapped services.
		boot := plan.Bootstrap.Services
		if len(td.Services) != len(boot) {
			t.Fatalf("teardown services count != boot count")
		}
		for i := range boot {
			if td.Services[i] != boot[len(boot)-1-i] {
				t.Fatalf("teardown not reverse boot order: %v vs boot %v", td.Services, boot)
			}
		}
		// the commands are the plan's deterministic destroy + stack-rm.
		joined := strings.Join(td.Commands, " ")
		if !strings.Contains(joined, "pulumi destroy") || !strings.Contains(joined, "stack rm") {
			t.Fatalf("teardown is not a deterministic destroy+rm: %v", td.Commands)
		}
		if td.StackName != plan.StackName {
			t.Fatalf("teardown stack %q != plan stack %q", td.StackName, plan.StackName)
		}
	})
}

// Fixture: the DP25 lifecycle BUILD(profile) → boot the filtered services → PROBE the
// invariant hash → TEARDOWN reverse — plus the refusals (unknown profile, missing secret,
// cross-app manifest, doltgres in prod).
func TestDP25LifecycleFixture(t *testing.T) {
	project := "shop"

	// BUILD with profile=full → the bootstrap amorces all three services, the app-hash is
	// the phase's emitted hash.
	full, br := preview.BuildPlan(dp25Input(project, stackmanifest.ProfileFull))
	if br != nil {
		t.Fatalf("BUILD full refused: %v", br)
	}
	if full.Profile != stackmanifest.ProfileFull {
		t.Fatalf("plan profile = %q, want full", full.Profile)
	}
	if full.Bootstrap == nil || len(full.Bootstrap.Services) != 3 {
		t.Fatalf("full should boot 3 services, got %+v", full.Bootstrap)
	}
	// the bootstrap sequence is the DP12 closed ordered set.
	if len(full.Bootstrap.Sequence.Events) != len(bootstrap.OrderedKinds()) {
		t.Fatalf("bootstrap sequence is not the closed DP12 set")
	}

	// PROBE the capital invariant: the served hash equals the emitted hash.
	ok, sb := preview.ServedMatchesEmitted(full, full.EmittedAppHash)
	if !ok || sb != nil {
		t.Fatalf("PROBE: served hash != emitted hash: %v", sb)
	}

	// TEARDOWN: the three services unwind in reverse boot order.
	td := preview.TeardownOf(full)
	if len(td.Services) != 3 {
		t.Fatalf("teardown should unwind 3 services, got %v", td.Services)
	}

	// REFUSAL — unknown profile (DP11 set-membership, never coerced).
	_, ubr := preview.BuildPlan(dp25Input(project, stackmanifest.Profile("made-up")))
	if ubr == nil {
		t.Fatal("unknown profile not refused")
	}
	if ubr.Code != stackmanifest.CodeUnknownProfile && string(ubr.Code) != "UNKNOWN_PROFILE" {
		t.Fatalf("unknown profile refusal code = %q, want UNKNOWN_PROFILE", ubr.Code)
	}

	// REFUSAL — a required secret missing at boot (DP12 fail-closed).
	noSecret := dp25Input(project, stackmanifest.ProfileFull)
	noSecret.Secrets = bootstrap.SecretsState{} // none present
	_, mbr := preview.BuildPlan(noSecret)
	if mbr == nil {
		t.Fatal("missing-secret bootstrap not refused")
	}

	// REFUSAL — cross-app manifest (manifest app ≠ surface project).
	crossApp := dp25Input(project, stackmanifest.ProfileFull)
	crossApp.Manifest = dp25Manifest("other-app")
	_, cbr := preview.BuildPlan(crossApp)
	if cbr == nil {
		t.Fatal("cross-app manifest not refused")
	}

	// REFUSAL — the non-prod profile against a prod env (delegated DP06 Doltgres gate).
	prodNonProd := dp25Input(project, stackmanifest.ProfileNonProd)
	prodNonProd.Env = scope.EnvProd
	_, pbr := preview.BuildPlan(prodNonProd)
	if pbr == nil {
		t.Fatal("non-prod profile against prod env not refused")
	}
}

// Fixture: BACKWARD-COMPAT — an Input WITHOUT a Manifest yields exactly the S94 plan (no
// Profile, no Bootstrap), and its content address is unchanged by the DP25 extension.
func TestDP25BackwardCompatNoManifest(t *testing.T) {
	project := "blog"
	in := preview.Input{
		Phase:   preview.PhaseRef{PhaseHash: "phase-fedcba9876543210"},
		Surface: fixtureSurface(project),
		Program: mustProgram(project),
	}
	plan, br := preview.BuildPlan(in)
	if br != nil {
		t.Fatalf("S94-shape build refused: %v", br)
	}
	if plan.Bootstrap != nil {
		t.Fatalf("S94-shape plan should carry no bootstrap, got %+v", plan.Bootstrap)
	}
	if plan.Profile != "" {
		t.Fatalf("S94-shape plan should carry no profile, got %q", plan.Profile)
	}
	// the teardown of an S94 plan unwinds no services (no bootstrap).
	td := preview.TeardownOf(plan)
	if len(td.Services) != 0 {
		t.Fatalf("S94-shape teardown should unwind no services, got %v", td.Services)
	}
	if !strings.Contains(strings.Join(td.Commands, " "), "pulumi destroy") {
		t.Fatalf("S94-shape teardown missing destroy command")
	}
}
