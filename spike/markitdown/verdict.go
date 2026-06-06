// verdict.go — THROWAWAY (MK01 spike). The COMPUTED go/no-go decision (CLAUDE.md §8: done is
// computed, never declared). GO iff conversion is FAITHFUL (every declared carrier survives) AND
// IDEMPOTENT (deterministic byte-for-byte AND stable on re-ingestion) AND maps cleanly to an
// idea-draft that respects the wall (status=draft, provenance kept, no kernel write). Otherwise
// NO-GO and — per the roadmap spike-gate "si nécessaire" — the MARKITDOWN subject stops.
package markitdown

import _ "embed"

//go:embed testdata/checkout-spec.html
var fixtureHTML []byte

// Verdict is the spike's decision plus the measurements that drove it.
type Verdict struct {
	Go bool

	Fidelity      Fidelity
	Idempotence   Idempotence
	Draft         IdeaDraft
	FidelityFloor float64
	Reproducible  bool // same source bytes -> same markdown hash + same draft hashes, every run
	WallRespected bool // the produced draft is a candidate (status=draft), never a frozen truth
	Rationale     string
}

// Decide runs the full spike on the REAL fixture and computes the verdict.
func Decide() Verdict {
	md, idem := MeasureIdempotence(fixtureHTML)
	fid := MeasureFidelity(md)
	draft := ToIdeaDraft(fixtureHTML, "checkout-spec.html")

	v := Verdict{
		Fidelity:      fid,
		Idempotence:   idem,
		Draft:         draft,
		FidelityFloor: FidelityFloor,
	}

	// Reproducibility (determinism-first): recompute and compare the driver hashes.
	md2, idem2 := MeasureIdempotence(fixtureHTML)
	draft2 := ToIdeaDraft(fixtureHTML, "checkout-spec.html")
	v.Reproducible = md == md2 &&
		idem.Hash == idem2.Hash &&
		draft.MarkdownHash == draft2.MarkdownHash &&
		draft.SourceHash == draft2.SourceHash

	// The wall: ingestion produces an IDEA (candidate-truth, status=draft) with provenance — never
	// a mirror, never the kernel. Here we assert the SHAPE honours that.
	v.WallRespected = draft.Status == "draft" && draft.Provenance != "" && draft.SourceHash != ""

	faithful := fid.Frac >= v.FidelityFloor
	idempotent := idem.Deterministic && idem.ReingestStable

	v.Go = faithful && idempotent && v.Reproducible && v.WallRespected

	switch {
	case v.Go:
		v.Rationale = "GO: on a REAL document (a checkout functional spec, testdata/checkout-spec.html) the deterministic frontier converts HTML->markdown preserving ALL " + itoa(fid.Total) +
			" declared carrier facts (fidelity=" + pct(fid.Frac) + ", clearing the " + pct(v.FidelityFloor) + " floor) — headings, invariants, the workflow steps, the emitted events, the pricing table data, the code spans, and the PaymentGateway cross-reference WITH its link target. The conversion is IDEMPOTENT in both senses: byte-for-byte deterministic (same source -> same markdown, hash " + idem.Hash +
			") and STABLE on re-ingestion (a second pass keeps " + pct(idem.ReingestFidelity.Frac) + " of carriers — no progressive erosion). The result maps to a clean IDEA-DRAFT (status=draft, provenance='" + draft.Provenance + "', source+markdown content-hashed) honouring the wall: ingestion yields a candidate-truth, never a kernel write. Proceed to MK02 (skill + DocConverter port + idempotence property-mirror; ADR « ingestion frontier replaceable »)."
	case !v.Reproducible:
		v.Rationale = "NO-GO: the conversion is not reproducible — a determinism gap (CLAUDE.md §8). The MARKITDOWN subject stops (roadmap spike-gate)."
	case !idem.Deterministic:
		v.Rationale = "NO-GO: ToMarkdown is not byte-deterministic on the same input — ingestion would be non-idempotent, breaking the MK02 property-mirror before it exists. The MARKITDOWN subject stops."
	case !idem.ReingestStable:
		v.Rationale = "NO-GO: re-ingestion erodes carriers (re-pass fidelity=" + pct(idem.ReingestFidelity.Frac) + " < floor) — the frontier loses substance on a second pass. The MARKITDOWN subject stops."
	case !faithful:
		v.Rationale = "NO-GO: conversion drops carrier facts (fidelity=" + pct(fid.Frac) + " < the " + pct(v.FidelityFloor) + " floor); missing=" + join(fid.Missing) + ". Silent data loss on ingestion. The MARKITDOWN subject stops."
	default:
		v.Rationale = "NO-GO: the produced draft does not honour the wall (status/provenance/hash missing) — ingestion must yield a candidate-truth, never a frozen one. The MARKITDOWN subject stops."
	}
	return v
}

func pct(f float64) string {
	whole := int(f*1000 + 0.5)
	d := whole / 10
	r := whole % 10
	return itoa(d) + "." + itoa(r) + "%"
}

func join(ss []string) string {
	if len(ss) == 0 {
		return "(none)"
	}
	out := ""
	for i, s := range ss {
		if i > 0 {
			out += ", "
		}
		out += s
	}
	return out
}
