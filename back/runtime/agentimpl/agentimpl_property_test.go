package agentimpl_test

// Property mirror (∀) for the AgentImplementation PROJECTION TYPE (BA02).
// reflects=runtime.agent_impl · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below. An AgentImplementation is a PROJECTION below the waterline — it
// carries NO truth, it is regenerable, and it is UNREPRESENTABLE as a CoucheAgent
// (mirroring the agentrun "a run is irrepresentable as a layer" discipline).
//
// The invariants pinned here (the RED set BA02 must turn green):
//  1. An AgentImplementation is UNREPRESENTABLE as a layer: the struct carries NO
//     "Version" field and NO "Mirror" field — version-as-truth and a mirror reference
//     are the two structural marks of a SOURCE/truth, and a projection must lack both
//     (a STRUCTURAL invariant of the type, asserted by reflection). It DOES carry a
//     LayerRef (a string POINTER back to the CoucheAgent@version it projects) — a
//     reference is not a version-as-truth; the negative test below proves LayerRef is a
//     plain string ref, never a re-embedded CoucheAgent.
//  2. An AgentImplementation embeds NO CoucheAgent / AgentSpec value: it cannot be a
//     CoucheAgent in disguise. Every field type is a primitive/slice/declared
//     value-type — never agentlayer.CoucheAgent or agentlayer.AgentSpec (reflection).
//  3. Validate is PURE + TOTAL + DETERMINISTIC: same input ⇒ same verdict (no DB, no
//     clock, no rng). It is fail-closed — the empty network/exec allow-lists are the
//     valid MAX-confinement default; an out-of-range knob is rejected.
//  4. The wall holds in the projection: ForbiddenPaths is non-empty and every
//     ForbiddenPath resolves ABOVE the waterline (the projection can never grant a
//     write above the line); AllowedPaths never overlaps ForbiddenPaths.

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"pgregory.net/rapid"
)

func drawImpl(rt *rapid.T) agentimpl.AgentImplementation {
	providers := agentlayer.Providers()
	return agentimpl.AgentImplementation{
		LayerRef:       "layer-" + rapid.StringMatching(`[a-f0-9]{8}`).Draw(rt, "layerref"),
		Provider:       providers[rapid.IntRange(0, len(providers)-1).Draw(rt, "provider")],
		Model:          "model-" + rapid.StringMatching(`[a-z0-9-]{1,12}`).Draw(rt, "model"),
		Temperature:    rapid.Float64Range(0, 2).Draw(rt, "temp"),
		MaxTurns:       rapid.IntRange(0, 200).Draw(rt, "turns"),
		Seed:           rapid.StringN(0, 16, 16).Draw(rt, "seed"),
		MaxConcurrency: rapid.IntRange(0, 32).Draw(rt, "conc"),
		AllowedPaths:   []string{"front/web", "back/gen"},
		ForbiddenPaths: agentimpl.WallForbiddenPaths(),
	}
}

// (1) UNREPRESENTABLE as a layer: NO Version field, NO Mirror field. Structural.
// This is THE BA02 done-criterion mirror (the agentrun discipline, applied to the
// projection): an AgentImplementation can never be reconstructed into a CoucheAgent.
func TestProp_AgentImpl_NotALayer(t *testing.T) {
	ty := reflect.TypeOf(agentimpl.AgentImplementation{})
	for i := 0; i < ty.NumField(); i++ {
		name := ty.Field(i).Name
		if name == "Version" || name == "Mirror" {
			t.Fatalf("AgentImplementation must NOT carry a %q field — a projection is not a layer/truth", name)
		}
	}
}

// (2) Embeds NO CoucheAgent / AgentSpec value: not a layer in disguise. A LayerRef is
// a plain string POINTER, never a re-embedded truth.
func TestProp_AgentImpl_EmbedsNoLayer(t *testing.T) {
	forbidden := []reflect.Type{
		reflect.TypeOf(agentlayer.CoucheAgent{}),
		reflect.TypeOf(agentlayer.AgentSpec{}),
	}
	ty := reflect.TypeOf(agentimpl.AgentImplementation{})
	for i := 0; i < ty.NumField(); i++ {
		f := ty.Field(i)
		// peel slices/pointers to their element type
		ft := f.Type
		for ft.Kind() == reflect.Slice || ft.Kind() == reflect.Ptr || ft.Kind() == reflect.Array {
			ft = ft.Elem()
		}
		for _, bad := range forbidden {
			if ft == bad {
				t.Fatalf("AgentImplementation field %q embeds %s — a projection must never re-embed the SOURCE/truth", f.Name, bad)
			}
		}
	}
	// LayerRef is a plain string ref (a pointer back, not a version-as-truth).
	lr, ok := ty.FieldByName("LayerRef")
	if !ok || lr.Type.Kind() != reflect.String {
		t.Fatalf("AgentImplementation.LayerRef must be a plain string ref to CoucheAgent@version")
	}
}

// (3) Validate is deterministic + total, fail-closed.
func TestProp_Validate_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := drawImpl(rt)
		e1 := agentimpl.Validate(impl)
		e2 := agentimpl.Validate(impl)
		if (e1 == nil) != (e2 == nil) {
			rt.Fatalf("Validate must be deterministic: %v vs %v", e1, e2)
		}
		if e1 != nil {
			rt.Fatalf("a well-formed drawn impl must validate: %v", e1)
		}
	})
}

// (3b) Fail-closed: an out-of-range temperature is rejected.
func TestProp_Validate_FailClosed_Temperature(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := drawImpl(rt)
		impl.Temperature = rapid.Float64Range(2.0001, 100).Draw(rt, "badtemp")
		if agentimpl.Validate(impl) == nil {
			rt.Fatalf("out-of-range temperature %v must be rejected (fail-closed)", impl.Temperature)
		}
	})
}

// (3c) Empty network/exec allow-lists are the valid MAX-confinement default.
func TestProp_Validate_EmptyConfinementDefault(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := drawImpl(rt)
		impl.AllowedNetworkHosts = nil
		impl.AllowedExec = nil
		if err := agentimpl.Validate(impl); err != nil {
			rt.Fatalf("empty allow-lists (max confinement) must be valid: %v", err)
		}
	})
}

// (4) The wall holds: every ForbiddenPath is above the waterline; AllowedPaths never
// overlaps ForbiddenPaths.
func TestProp_Wall_ForbiddenAboveWaterline(t *testing.T) {
	fps := agentimpl.WallForbiddenPaths()
	if len(fps) == 0 {
		t.Fatal("WallForbiddenPaths must be non-empty — the projection always carries the wall")
	}
	for _, fp := range fps {
		if !agentimpl.IsAboveWaterline(fp) {
			t.Fatalf("ForbiddenPath %q must resolve above the waterline", fp)
		}
	}
	rapid.Check(t, func(rt *rapid.T) {
		impl := drawImpl(rt)
		for _, ap := range impl.AllowedPaths {
			if agentimpl.IsAboveWaterline(ap) {
				rt.Fatalf("AllowedPath %q must not be above the waterline", ap)
			}
		}
	})
}
