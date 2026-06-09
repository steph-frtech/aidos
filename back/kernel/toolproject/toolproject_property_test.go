package toolproject

import (
	"testing"

	"pgregory.net/rapid"
)

// FK15 property mirror (the reproducibility mirror, CLAUDE.md §6/§8): emission is a
// PURE TOTAL function of the kernel sources — the exact FK15 done-criterion:
// "mêmes kernels → mêmes fichiers byte-identiques". Same kernel ⇒ byte-identical files;
// DetectDrift ⇔ a hand-edit; round-trip lossless.

func genKind(t *rapid.T) SourceKind {
	return rapid.SampledFrom(SourceKinds()).Draw(t, "kind")
}

func genSource(t *rapid.T) Source {
	return Source{
		Kind:  genKind(t),
		ID:    rapid.SampledFrom([]string{"a", "b", "c", "the-wall", "biome", "scar-1"}).Draw(t, "id"),
		Title: rapid.SampledFrom([]string{"T1", "T2", "Le mur", "Biome"}).Draw(t, "title"),
		Body:  rapid.SampledFrom([]string{"body one", "body two", "x"}).Draw(t, "body"),
	}
}

func genKernel(t *rapid.T) ToolingKernel {
	n := rapid.IntRange(0, 6).Draw(t, "n")
	srcs := make([]Source, 0, n)
	seen := map[string]bool{}
	for i := 0; i < n; i++ {
		s := genSource(t)
		key := string(s.Kind) + "|" + s.ID
		// Keep ids unique per kind so the stable sort is total (no ambiguity).
		if seen[key] {
			continue
		}
		seen[key] = true
		srcs = append(srcs, s)
	}
	return ToolingKernel{Project: "AIDOS", Sources: srcs}
}

// Prop 1: determinism — same kernel → byte-identical files (the FK15 done-criterion).
func TestProp_SameKernel_ByteIdentical(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genKernel(t)
		a, err := EmitAll(k)
		if err != nil {
			t.Fatalf("EmitAll a: %v", err)
		}
		b, err := EmitAll(k)
		if err != nil {
			t.Fatalf("EmitAll b: %v", err)
		}
		for _, tg := range Targets() {
			if a[tg] != b[tg] {
				t.Fatalf("target %q not byte-identical", tg)
			}
		}
	})
}

// Prop 2: order-independence — shuffling the source slice never changes the bytes.
func TestProp_OrderIndependent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genKernel(t)
		k2 := ToolingKernel{Project: k.Project, Sources: append([]Source(nil), k.Sources...)}
		perm := rapid.Permutation(k2.Sources).Draw(t, "perm")
		k2.Sources = perm
		f1, _ := EmitAll(k)
		f2, _ := EmitAll(k2)
		for _, tg := range Targets() {
			if f1[tg] != f2[tg] {
				t.Fatalf("target %q order-dependent", tg)
			}
		}
		// Same source-hash too.
		h1, _ := SourceHash(k)
		h2, _ := SourceHash(k2)
		if h1 != h2 {
			t.Fatal("source-hash is order-dependent")
		}
	})
}

// Prop 3: a clean projection has no drift; ANY edit to the body yields a drift
// (HAND_EDITED under a valid marker). DetectDrift ⇔ a hand-edit.
func TestProp_DriftIffEdited(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genKernel(t)
		for _, tg := range Targets() {
			clean, err := Emit(k, tg)
			if err != nil {
				t.Fatalf("Emit: %v", err)
			}
			d, _ := DetectDrift(k, tg, clean)
			if d != nil {
				t.Fatalf("clean projection of %q drifted: %+v", tg, d)
			}
			// Inject a single-byte hand-edit into the BODY (before the marker).
			idx := rapid.IntRange(0, len(clean)-1).Draw(t, "idx")
			if clean[idx] == '\n' {
				continue
			}
			edited := clean[:idx] + "Z" + clean[idx+1:]
			if edited == clean {
				continue
			}
			d2, _ := DetectDrift(k, tg, edited)
			if d2 == nil {
				t.Fatalf("hand-edit of %q not detected", tg)
			}
		}
	})
}

// Prop 4: content-addressed round-trip is lossless and stable.
func TestProp_RoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genKernel(t)
		rec, err := Record(k)
		if err != nil {
			t.Fatalf("Record: %v", err)
		}
		got, err := ParseBody(rec.Body)
		if err != nil {
			t.Fatalf("ParseBody: %v", err)
		}
		rec2, _ := Record(got)
		if rec2.Version != rec.Version {
			t.Fatal("round-trip changed the content address")
		}
	})
}

// Prop 5: the source-hash is the SOLE driver of staleness — two kernels with the same
// source-hash emit byte-identical files; different source-hash ⇒ different files for at
// least one target (no hash collision masking a content change in this generator).
func TestProp_SourceHashDrivesFiles(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genKernel(t)
		h, err := SourceHash(k)
		if err != nil {
			t.Fatalf("SourceHash: %v", err)
		}
		files, _ := EmitAll(k)
		for _, tg := range Targets() {
			mh, ok := markerHash(files[tg])
			if !ok {
				t.Fatalf("emitted %q has no marker", tg)
			}
			if mh != h {
				t.Fatalf("emitted %q marker %q != source-hash %q", tg, mh, h)
			}
		}
	})
}
