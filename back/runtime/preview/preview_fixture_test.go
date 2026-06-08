package preview_test

// S94 — ephemeral preview WORKFLOW mirror (fixture, state → command → events).
// reflects=s94-preview-ephemeral-per-app · test_kind=fixture · liveness=live.
//
// The fixture plays the preview LIFECYCLE as a deterministic sequence of commands and the
// events each emits: BUILD the plan (keyed on the phase), BOOT (`pulumi up`), PROBE (the
// served hash == the emitted hash — the done-criterion), TEARDOWN (`pulumi destroy`). It
// also pins the REFUSAL workflows (no phase, cross-app program, stale served hash) and the
// PARITY: the served-hash probe and the plan's EmittedAppHash agree, so "the preview serves
// THIS phase" is a content-address equality, never a guess.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/honoemit"
	"github.com/steph-frtech/aidos/back/runtime/preview"
)

func fixtureProgram(t *testing.T, project string) honoemit.Artifact {
	t.Helper()
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
		t.Fatalf("emit pulumi: %v", br)
	}
	return art
}

func fixtureSurface(project string) preview.EmittedSurface {
	return preview.EmittedSurface{
		Project:          project,
		ServerBundleHash: "srv-" + project,
		FrontBundleHash:  "frt-" + project,
		InfraHash:        "inf-" + project,
		DatastoreHash:    "dst-" + project,
	}
}

// Fixture 1: the full lifecycle BUILD → BOOT → PROBE → TEARDOWN.
func TestPreviewLifecycleFixture(t *testing.T) {
	project := "shop"
	phase := preview.PhaseRef{PhaseHash: "phase-0123456789abcdef"}
	in := preview.Input{Phase: phase, Surface: fixtureSurface(project), Program: fixtureProgram(t, project)}

	// command BUILD → events: a plan keyed on the phase, a per-phase URL, boot+teardown.
	plan, br := preview.BuildPlan(in)
	if br != nil {
		t.Fatalf("BUILD refused: %v", br)
	}
	if plan.PhaseHash != phase.PhaseHash {
		t.Fatalf("plan not keyed on phase: %q", plan.PhaseHash)
	}
	if plan.Project != project {
		t.Fatalf("plan project = %q, want %q", plan.Project, project)
	}
	if !strings.HasPrefix(plan.Subdomain, "p-") || !strings.Contains(plan.URL, plan.Subdomain) {
		t.Fatalf("URL not a per-phase subdomain: %q / %q", plan.URL, plan.Subdomain)
	}

	// command BOOT → event: the boot runs `pulumi up` in the program's directory.
	boot := strings.Join(plan.Boot, " ")
	if !strings.Contains(boot, "pulumi up") {
		t.Fatalf("BOOT does not `pulumi up`: %v", plan.Boot)
	}
	if !strings.Contains(boot, "gen/"+project+"/infra") {
		t.Fatalf("BOOT does not target the emitted program dir: %v", plan.Boot)
	}

	// command PROBE → event: the served hash (baked from emitted bytes) equals the emitted.
	served := plan.EmittedAppHash // the /__aidos_hash probe returns exactly this
	ok, hb := preview.ServedMatchesEmitted(plan, served)
	if !ok || hb != nil {
		t.Fatalf("PROBE: served hash != emitted hash: %v", hb)
	}

	// command TEARDOWN → event: deterministic `pulumi destroy` + stack removal.
	teardown := strings.Join(plan.Teardown, " ")
	if !strings.Contains(teardown, "pulumi destroy") || !strings.Contains(teardown, "stack rm") {
		t.Fatalf("TEARDOWN not deterministic destroy+rm: %v", plan.Teardown)
	}
}

// Fixture 2: PARITY — the EmittedAppHash equals the surface's own content address, so the
// probe and the plan agree (the served-hash sensor ↔ the emitted-hash truth).
func TestPreviewHashParityFixture(t *testing.T) {
	project := "blog"
	phase := preview.PhaseRef{PhaseHash: "phase-fedcba9876543210"}
	surf := fixtureSurface(project)

	standalone, err := preview.EmittedAppHash(phase, surf)
	if err != nil {
		t.Fatalf("EmittedAppHash: %v", err)
	}
	plan, br := preview.BuildPlan(preview.Input{Phase: phase, Surface: surf, Program: fixtureProgram(t, project)})
	if br != nil {
		t.Fatalf("BUILD refused: %v", br)
	}
	if plan.EmittedAppHash != standalone {
		t.Fatalf("PARITY broken: plan %q vs standalone %q", plan.EmittedAppHash, standalone)
	}
}

// Fixture 3: refusal workflows — no phase, cross-app program, stale served hash.
func TestPreviewRefusalsFixture(t *testing.T) {
	good := fixtureProgram(t, "shop")

	// no phase → refused, how_to_fix names the phase.
	_, br := preview.BuildPlan(preview.Input{Surface: fixtureSurface("shop"), Program: good})
	if br == nil {
		t.Fatal("no-phase preview not refused")
	}
	if !strings.Contains(strings.ToLower(strings.Join(br.HowToFix, " ")), "phase") {
		t.Fatalf("how_to_fix does not name the phase: %v", br.HowToFix)
	}

	// cross-app program (program belongs to "other", surface to "shop") → refused.
	other := fixtureProgram(t, "other")
	_, br2 := preview.BuildPlan(preview.Input{
		Phase:   preview.PhaseRef{PhaseHash: "phase-aaa"},
		Surface: fixtureSurface("shop"),
		Program: other,
	})
	if br2 == nil {
		t.Fatal("cross-app preview not refused")
	}

	// stale served hash → refused.
	plan, _ := preview.BuildPlan(preview.Input{
		Phase: preview.PhaseRef{PhaseHash: "phase-aaa"}, Surface: fixtureSurface("shop"), Program: good,
	})
	ok, br3 := preview.ServedMatchesEmitted(plan, "stale")
	if ok || br3 == nil {
		t.Fatal("stale served hash not refused")
	}
}
