package agentrun_test

// BA26 — the REPLAY-extension property + migration-roundtrip mirror (∀) for AgentRun.
// reflects=runtime.agent_run@v2 · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below. A run is a RUNTIME EVENT, never a layer/truth.
//
// BA26 extends the AgentRun content-address schema so a run can be REPLAYED (gap A2): a
// new run gains Impl (the content-hash of its AgentImplementation), Seed (declared, or
// derived Hash(impl‖pack‖item)), and a ProviderTranscript ref. This is an ANNOUNCED
// supersede-via-version (anti-overwrite §9): a NEW @version of the canonical body,
// append-only — the existing hash is NEVER mutated in place.
//
// The invariants this mirror pins:
//  1. ROUNDTRIP: Marshal→Unmarshal of an AgentRun (legacy OR replay-bearing) is identity
//     on every field — the JSON shape the migration persists round-trips losslessly.
//  2. LEGACY READABLE: a run recorded WITHOUT the replay fields (Impl/Seed/ProviderTranscript
//     all empty) still Records and still reads back — the schema extension is additive, not
//     a breaking re-shape. Its id is STABLE versus the pre-BA26 body (the legacy hash is not
//     mutated in passing).
//  3. NEW RUN CARRIES A SEED: DeriveSeed(impl, pack, item) is deterministic, total, non-empty
//     for non-empty inputs, and SeedFor returns a declared seed verbatim, else the derived one.
//  4. REPLAY FIELDS PARTICIPATE IN THE CONTENT ADDRESS: two runs that differ ONLY in a replay
//     field (Impl, Seed, or ProviderTranscript) get DIFFERENT ids — the extension genuinely
//     widened the address, it is not a dead field.
//  5. STILL NOT A LAYER: even with the replay fields, AgentRun carries NO Version, NO Mirror
//     field — a run remains unrepresentable as a layer.

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"pgregory.net/rapid"
)

func drawReplayRun(rt *rapid.T) agentrun.AgentRun {
	results := agentrun.Results()
	return agentrun.AgentRun{
		Agent:              rapid.StringN(1, 12, 12).Draw(rt, "agent"),
		Goal:               rapid.StringN(0, 12, 12).Draw(rt, "goal"),
		RedWorkItem:        rapid.StringN(0, 12, 12).Draw(rt, "rwi"),
		ContextPack:        rapid.StringN(0, 12, 12).Draw(rt, "cp"),
		Result:             results[rapid.IntRange(0, len(results)-1).Draw(rt, "result")],
		StartedAt:          "2026-06-04T18:00:00Z",
		EndedAt:            "2026-06-04T18:05:00Z",
		Impl:               rapid.StringN(0, 16, 16).Draw(rt, "impl"),
		Seed:               rapid.StringN(0, 16, 16).Draw(rt, "seed"),
		ProviderTranscript: rapid.StringN(0, 16, 16).Draw(rt, "transcript"),
	}
}

// (1) Roundtrip: Marshal→Unmarshal is identity on every field.
func TestProp_AgentRun_Roundtrip(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		r := drawReplayRun(rt)
		recorded, err := agentrun.Record(r)
		if err != nil {
			rt.Fatalf("Record must be total for a known result: %v", err)
		}
		raw, err := json.Marshal(recorded)
		if err != nil {
			rt.Fatalf("marshal: %v", err)
		}
		var back agentrun.AgentRun
		if err := json.Unmarshal(raw, &back); err != nil {
			rt.Fatalf("unmarshal: %v", err)
		}
		if !reflect.DeepEqual(recorded, back) {
			rt.Fatalf("roundtrip must be identity:\n got  %+v\n want %+v", back, recorded)
		}
	})
}

// (2) Legacy readable: a seedless run records and reads back; its id is STABLE vs the
// pre-BA26 body (the legacy hash is NOT mutated by the extension).
func TestProp_AgentRun_LegacySeedlessReadable(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		legacy := drawReplayRun(rt)
		legacy.Impl = ""
		legacy.Seed = ""
		legacy.ProviderTranscript = ""

		recorded, err := agentrun.Record(legacy)
		if err != nil {
			rt.Fatalf("legacy seedless run must still Record: %v", err)
		}
		// The legacy id must equal the id computed under the PRE-BA26 body (the fields the
		// pre-extension recorder hashed). LegacyID reconstructs exactly that body.
		if recorded.ID != agentrun.LegacyID(legacy) {
			rt.Fatalf("legacy run id must be stable vs pre-BA26 body: %q != %q",
				recorded.ID, agentrun.LegacyID(legacy))
		}
		raw, _ := json.Marshal(recorded)
		var back agentrun.AgentRun
		if err := json.Unmarshal(raw, &back); err != nil {
			rt.Fatalf("legacy run must read back: %v", err)
		}
		if back.Seed != "" || back.Impl != "" || back.ProviderTranscript != "" {
			rt.Fatalf("legacy run must read back with empty replay fields, got %+v", back)
		}
	})
}

// (3) DeriveSeed deterministic+total+non-empty; SeedFor prefers a declared seed.
func TestProp_DeriveSeed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := rapid.StringN(1, 16, 16).Draw(rt, "impl")
		pack := rapid.StringN(0, 16, 16).Draw(rt, "pack")
		item := rapid.StringN(0, 16, 16).Draw(rt, "item")

		a := agentrun.DeriveSeed(impl, pack, item)
		b := agentrun.DeriveSeed(impl, pack, item)
		if a != b {
			rt.Fatalf("DeriveSeed must be deterministic: %q != %q", a, b)
		}
		if a == "" {
			rt.Fatal("DeriveSeed must be non-empty for non-empty impl")
		}
		// A declared seed wins verbatim; an empty declared seed falls back to the derived one.
		declared := rapid.StringN(0, 8, 8).Draw(rt, "declared")
		got := agentrun.SeedFor(declared, impl, pack, item)
		if declared != "" {
			if got != declared {
				rt.Fatalf("SeedFor must return the declared seed verbatim: %q != %q", got, declared)
			}
		} else if got != a {
			rt.Fatalf("SeedFor must fall back to DeriveSeed: %q != %q", got, a)
		}
		// Different inputs ⇒ different derived seed (the seed addresses the trio).
		if agentrun.DeriveSeed(impl+"x", pack, item) == a {
			rt.Fatal("a different impl must derive a different seed")
		}
	})
}

// (4) Each replay field participates in the content address.
func TestProp_AgentRun_ReplayFieldsAddressed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		base := drawReplayRun(rt)
		base.Impl = "impl-a"
		base.Seed = "seed-a"
		base.ProviderTranscript = "tr-a"
		a, _ := agentrun.Record(base)

		variants := []agentrun.AgentRun{
			func() agentrun.AgentRun { v := base; v.Impl = "impl-b"; return v }(),
			func() agentrun.AgentRun { v := base; v.Seed = "seed-b"; return v }(),
			func() agentrun.AgentRun { v := base; v.ProviderTranscript = "tr-b"; return v }(),
		}
		for _, v := range variants {
			b, _ := agentrun.Record(v)
			if a.ID == b.ID {
				rt.Fatalf("a run differing in a replay field must get a different id (dead field): %+v", v)
			}
		}
	})
}

// (5) Even replay-bearing, AgentRun is not a layer: no Version, no Mirror field.
func TestProp_AgentRun_ReplayStillNotALayer(t *testing.T) {
	ty := reflect.TypeOf(agentrun.AgentRun{})
	for i := 0; i < ty.NumField(); i++ {
		name := ty.Field(i).Name
		if name == "Version" || name == "Mirror" {
			t.Fatalf("AgentRun must NOT carry a %q field — a run is not a layer/truth", name)
		}
	}
}
