package projectevolve

import (
	"testing"

	"pgregory.net/rapid"
)

// Property mirror for S108 (the reproducibility + invariant mirror, CLAUDE.md §6/§8).
// It pins, over arbitrary variant sets:
//   - determinism: same (mirror, variants) ⇒ same niches/run (replayable, no rng/clock);
//   - the keystone: no élite ever breaks the fixed mirror (a red variant is never kept);
//   - the wall: every emitted write is under a can_write zone (the loop never governs);
//   - the project frontier: a foreign-project variant is never an élite of this project;
//   - one élite per niche (MAP-Elites), all with a green mirror.

func genVariant(projectID string) *rapid.Generator[Variant] {
	return rapid.Custom(func(t *rapid.T) Variant {
		mirror := MirrorGreen
		if rapid.Bool().Draw(t, "red") {
			mirror = MirrorRed
		}
		oos := OutOfSampleGreen
		if rapid.Bool().Draw(t, "oosRed") {
			oos = OutOfSampleRed
		}
		pid := projectID
		if rapid.Bool().Draw(t, "foreign") {
			pid = "other-" + projectID
		}
		return Variant{
			ProjectID:   pid,
			ID:          rapid.StringMatching(`v[0-9]{1,4}`).Draw(t, "id"),
			Niche:       rapid.SampledFrom([]string{"a", "b", "createOrder/fast", "createOrder/cheap"}).Draw(t, "niche"),
			Mirror:      mirror,
			OutOfSample: oos,
			Fitness:     rapid.Float64Range(0, 1).Draw(t, "fitness"),
		}
	})
}

func TestProp_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := fixedMirror()
		vs := rapid.SliceOfN(genVariant(m.ProjectID), 0, 12).Draw(t, "variants")

		a := Niches(m, vs)
		b := Niches(m, vs)
		if len(a) != len(b) {
			t.Fatalf("non-deterministic niche count: %d vs %d", len(a), len(b))
		}
		for k, va := range a {
			vb, ok := b[k]
			if !ok || va.ID != vb.ID {
				t.Fatalf("non-deterministic élite for niche %q", k)
			}
		}
	})
}

func TestProp_NoEliteBreaksMirror(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := fixedMirror()
		vs := rapid.SliceOfN(genVariant(m.ProjectID), 0, 12).Draw(t, "variants")
		for key, e := range Niches(m, vs) {
			if e.Mirror != MirrorGreen {
				t.Fatalf("élite of niche %q breaks the mirror (red)", key)
			}
			if e.ProjectID != m.ProjectID {
				t.Fatalf("élite of niche %q is from a foreign project", key)
			}
		}
	})
}

func TestProp_EmittedWritesNeverGovern(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := fixedMirror()
		vs := rapid.SliceOfN(genVariant(m.ProjectID), 0, 12).Draw(t, "variants")
		run := RunMediumLoop(m, vs)
		for _, w := range run.Emitted {
			if !confineEmitted(w.Path) {
				t.Fatalf("emitted write governs a truth (escapes the sandbox): %q", w.Path)
			}
		}
	})
}

func TestProp_OneElitePerNiche(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := fixedMirror()
		vs := rapid.SliceOfN(genVariant(m.ProjectID), 0, 12).Draw(t, "variants")
		niches := Niches(m, vs)
		// The map already enforces one value per key; assert each key is a project-prefixed
		// niche of a real survivor with the MAX fitness among same-key green survivors.
		survivors := Cull(m, vs).Survivors
		for key, e := range niches {
			var best float64 = -1
			for _, s := range survivors {
				if NicheKey(s) == key && s.Fitness > best {
					best = s.Fitness
				}
			}
			if e.Fitness != best {
				t.Fatalf("élite of %q is not the max-fitness survivor (%v vs %v)", key, e.Fitness, best)
			}
		}
	})
}
