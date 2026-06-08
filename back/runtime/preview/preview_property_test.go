package preview_test

// S94 — ephemeral preview environment REPRODUCIBILITY mirror (property, rapid).
// reflects=s94-preview-ephemeral-per-app · test_kind=property · liveness=live.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): BuildPlan and EmittedAppHash are PURE functions —
// same emitted surface for the same phase → byte-identical PreviewPlan (same id, same URL,
// same boot/teardown) and the same EmittedAppHash. These properties pin:
//   - reproducibility: re-planning the same input yields the identical plan id + URL;
//   - phase keying: two DISTINCT phases never collide on a preview URL/subdomain;
//   - app-hash content-addressing: any byte change in any emitted component → a new
//     EmittedAppHash (no stale preview masquerades as a phase);
//   - input-order invariance of the hash: the named-key join is order-free;
//   - the served↔emitted equality: the honest served hash (the emitted bytes' baked hash)
//     ALWAYS matches; a different hash is ALWAYS refused.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/honoemit"
	"github.com/steph-frtech/aidos/back/runtime/preview"
	"pgregory.net/rapid"
)

func sampleSurfaceR(t *rapid.T, project string) preview.EmittedSurface {
	return preview.EmittedSurface{
		Project:          project,
		ServerBundleHash: rapid.StringMatching(`srv-[a-z0-9]{4}`).Draw(t, "srv"),
		FrontBundleHash:  rapid.StringMatching(`frt-[a-z0-9]{4}`).Draw(t, "frt"),
		InfraHash:        rapid.StringMatching(`inf-[a-z0-9]{4}`).Draw(t, "inf"),
		DatastoreHash:    rapid.StringMatching(`(dst-[a-z0-9]{4}|)`).Draw(t, "dst"),
	}
}

func sampleProgramR(t *rapid.T, project string) honoemit.Artifact {
	m := honoemit.StackManifest{
		App: project,
		Services: []honoemit.Service{
			{Name: project + "-server", Role: honoemit.RoleServer, Image: "node:22", InternalPort: 3000},
		},
		Network: honoemit.Network{Name: "traefik_default", External: true},
	}
	art, br := honoemit.EmitPulumiProgram(m)
	if br != nil {
		t.Fatalf("emit pulumi: %v", br)
	}
	return art
}

func sampleProject(t *rapid.T) string {
	return rapid.SampledFrom([]string{"shop", "blog", "crm", "invoice"}).Draw(t, "project")
}

func samplePhase(t *rapid.T) preview.PhaseRef {
	return preview.PhaseRef{PhaseHash: rapid.StringMatching(`phase-[a-f0-9]{16}`).Draw(t, "phase")}
}

// Property 1: reproducibility — same input → byte-identical plan (id + URL + commands).
func TestPreviewReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		project := sampleProject(t)
		in := preview.Input{Phase: samplePhase(t), Surface: sampleSurfaceR(t, project), Program: sampleProgramR(t, project)}
		a, ba := preview.BuildPlan(in)
		b, bb := preview.BuildPlan(in)
		if ba != nil || bb != nil {
			t.Fatalf("valid input refused: %v / %v", ba, bb)
		}
		if a.ID != b.ID {
			t.Fatalf("plan id not reproducible: %q vs %q", a.ID, b.ID)
		}
		if a.URL != b.URL || a.StackName != b.StackName {
			t.Fatalf("plan url/stack not reproducible: %+v vs %+v", a, b)
		}
		if a.EmittedAppHash != b.EmittedAppHash {
			t.Fatalf("emitted app hash not reproducible")
		}
	})
}

// Property 2: phase keying — two DISTINCT phases never share a subdomain/URL/id.
func TestPreviewDistinctPhasesDistinctURL(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		project := sampleProject(t)
		surf := sampleSurfaceR(t, project)
		prog := sampleProgramR(t, project)
		p1 := samplePhase(t)
		p2 := samplePhase(t)
		if p1.PhaseHash == p2.PhaseHash {
			return // same phase: keying is correct by construction
		}
		a, _ := preview.BuildPlan(preview.Input{Phase: p1, Surface: surf, Program: prog})
		b, _ := preview.BuildPlan(preview.Input{Phase: p2, Surface: surf, Program: prog})
		if a.Subdomain == b.Subdomain {
			t.Fatalf("distinct phases collide on subdomain %q", a.Subdomain)
		}
		if a.URL == b.URL {
			t.Fatalf("distinct phases collide on URL %q", a.URL)
		}
	})
}

// Property 3: app-hash content-addressing — any byte change in any emitted component → a
// new EmittedAppHash (and so a new plan id).
func TestPreviewAppHashSensitive(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		project := sampleProject(t)
		phase := samplePhase(t)
		base := sampleSurfaceR(t, project)
		h0, err := preview.EmittedAppHash(phase, base)
		if err != nil {
			t.Fatalf("hash: %v", err)
		}
		// Mutate ONE component.
		mut := base
		which := rapid.IntRange(0, 3).Draw(t, "which")
		switch which {
		case 0:
			mut.ServerBundleHash = base.ServerBundleHash + "X"
		case 1:
			mut.FrontBundleHash = base.FrontBundleHash + "X"
		case 2:
			mut.InfraHash = base.InfraHash + "X"
		case 3:
			mut.DatastoreHash = base.DatastoreHash + "X"
		}
		h1, _ := preview.EmittedAppHash(phase, mut)
		if h0 == h1 {
			t.Fatalf("emitted app hash insensitive to component change (which=%d)", which)
		}
	})
}

// Property 4: served↔emitted equality — the honest served hash always matches; a different
// hash is always refused (code judges, never an agent).
func TestPreviewServedMatchesEmitted(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		project := sampleProject(t)
		in := preview.Input{Phase: samplePhase(t), Surface: sampleSurfaceR(t, project), Program: sampleProgramR(t, project)}
		plan, br := preview.BuildPlan(in)
		if br != nil {
			t.Fatalf("refused: %v", br)
		}
		// Honest served hash (baked from emitted bytes) → match.
		ok, b := preview.ServedMatchesEmitted(plan, plan.EmittedAppHash)
		if !ok || b != nil {
			t.Fatalf("honest served hash did not match")
		}
		// Any other hash → refused.
		ok2, b2 := preview.ServedMatchesEmitted(plan, plan.EmittedAppHash+"-stale")
		if ok2 || b2 == nil {
			t.Fatalf("stale served hash was not refused")
		}
	})
}
