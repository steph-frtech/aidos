package besoin

// metadata_property_test.go — the EL04 BDD mirror, written RED first (red → green → refactor):
//   1. a fixture TABLE, one red case per MISSING metadata (truth_kind / verifiability / scope /
//      authority), each going GREEN exactly when the matching metadata is present/certifiable;
//   2. the /spike routing case (verifiability == unverifiable ⇒ allowed_mode != kernel ⇒ routed
//      /spike), proving the routing is the SAME truthtyping verdict (no fork);
//   3. the truth_kind-coherence property (a SINGLE enum source: truthtyping and authority agree on
//      every kind, never two registries);
//   4. the reproducibility property (determinism-first, CLAUDE.md §6/§8): same node → same verdict.
//
// All deterministic, pure, no DB/clock/rng/IO/LLM. REUSES the three kernel packages verbatim.

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
)

// resolvedNode is a minimal resolved LevelNode (active for the scope rule) used by the fixtures.
func resolvedNode(l Level) LevelNode {
	return LevelNode{Level: l, Status: NodeResolved, Provenance: Provenance{Source: "human", Detail: "je veux …"}}
}

// completeMeta is the baseline COMPLETE metadata for a deterministic, kernel-admissible node: a
// behavioral+deterministic kind (admitted to kernel), an explicitly-global scope, no authority needed.
func completeMeta() Metadata {
	return Metadata{
		TruthKind:     truthtyping.KindBehavioral,
		Verifiability: truthtyping.LevelDeterministic,
		Scope:         scope.TruthScope{Region: scope.RegionGlobal},
	}
}

// TestCertifyMetadata_FixtureTable is the red-per-missing-metadata table. Each row mutates ONE
// metadata off the complete baseline and asserts the matching gap code (or, for the baseline, none).
func TestCertifyMetadata_FixtureTable(t *testing.T) {
	node := resolvedNode(LevelProduct)

	cases := []struct {
		name       string
		meta       Metadata
		wantComplt bool
		wantCode   MetaCode // "" when complete
	}{
		{
			name:       "baseline complete (behavioral+deterministic+global)",
			meta:       completeMeta(),
			wantComplt: true,
		},
		{
			name:     "missing truth_kind",
			meta:     func() Metadata { m := completeMeta(); m.TruthKind = ""; return m }(),
			wantCode: CodeMissingTruthKind,
		},
		{
			name:     "unknown truth_kind",
			meta:     func() Metadata { m := completeMeta(); m.TruthKind = "derived"; return m }(),
			wantCode: CodeUnknownTruthKind,
		},
		{
			name:     "missing verifiability",
			meta:     func() Metadata { m := completeMeta(); m.Verifiability = ""; return m }(),
			wantCode: CodeMissingVerifiability,
		},
		{
			name:     "unknown verifiability",
			meta:     func() Metadata { m := completeMeta(); m.Verifiability = "magic"; return m }(),
			wantCode: CodeUnknownVerifiability,
		},
		{
			name:     "active node without scope (not global)",
			meta:     func() Metadata { m := completeMeta(); m.Scope = scope.TruthScope{}; return m }(),
			wantCode: CodeMissingScope,
		},
		{
			name:     "malformed scope (unknown region)",
			meta:     func() Metadata { m := completeMeta(); m.Scope = scope.TruthScope{Region: "MARS"}; return m }(),
			wantCode: CodeMalformedScope,
		},
		{
			name: "regulatory without legal authority (done case)",
			meta: func() Metadata {
				m := completeMeta()
				m.TruthKind = truthtyping.KindRegulatory
				m.Authority = nil
				return m
			}(),
			wantCode: CodeMissingAuthorityApproval,
		},
		{
			name: "regulatory with authority but no approval granted (blocked)",
			meta: func() Metadata {
				m := completeMeta()
				m.TruthKind = truthtyping.KindRegulatory
				m.Authority = &authority.AuthorityGraph{
					Domain:    "gdpr",
					TruthKind: authority.TruthKind(truthtyping.KindRegulatory),
					Approvers: []authority.Role{"legal"},
				}
				m.Granted = nil // no one granted ⇒ MISSING_AUTHORITY_APPROVAL
				return m
			}(),
			wantCode: CodeMissingAuthorityApproval,
		},
		{
			name: "regulatory with legal approval granted (complete)",
			meta: func() Metadata {
				m := completeMeta()
				m.TruthKind = truthtyping.KindRegulatory
				m.Authority = &authority.AuthorityGraph{
					Domain:    "gdpr",
					TruthKind: authority.TruthKind(truthtyping.KindRegulatory),
					Approvers: []authority.Role{"legal"},
				}
				m.Granted = []authority.Role{"legal"}
				return m
			}(),
			wantComplt: true,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			v := CertifyMetadata(node, c.meta)
			if v.Complete != c.wantComplt {
				t.Fatalf("Complete = %v, want %v (gaps=%v)", v.Complete, c.wantComplt, v.Gaps)
			}
			if c.wantCode == "" {
				if len(v.Gaps) != 0 {
					t.Fatalf("want no gaps, got %v", v.Gaps)
				}
				return
			}
			found := false
			for _, g := range v.Gaps {
				if g.Code == c.wantCode {
					found = true
					if len(g.HowToFix) == 0 {
						t.Fatalf("gap %q has no how_to_fix (a wall must name the door)", g.Code)
					}
				}
			}
			if !found {
				t.Fatalf("want gap code %q, got gaps %v", c.wantCode, v.Gaps)
			}
		})
	}
}

// TestCertifyMetadata_UnverifiableRoutesToSpike pins done-criterion (3): an unverifiable node is
// routed /spike (allowed_mode != kernel), via the SAME truthtyping.Classify verdict — never a fork.
func TestCertifyMetadata_UnverifiableRoutesToSpike(t *testing.T) {
	node := resolvedNode(LevelProduct)
	m := completeMeta()
	m.TruthKind = truthtyping.KindExploratory
	m.Verifiability = truthtyping.LevelUnverifiable

	v := CertifyMetadata(node, m)
	if !v.RouteToSpike {
		t.Fatalf("unverifiable node must route to /spike, got routing=%q route_to_spike=%v", v.Routing, v.RouteToSpike)
	}
	if v.Routing != truthtyping.ZoneSpike {
		t.Fatalf("routing = %q, want %q", v.Routing, truthtyping.ZoneSpike)
	}
	// And the routing must equal the bare truthtyping verdict — one source, no fork.
	want, _ := truthtyping.Classify(truthtyping.Truth{TruthKind: m.TruthKind, VerifiabilityLevel: m.Verifiability})
	if v.Routing != want.Zone {
		t.Fatalf("routing %q != truthtyping.Classify zone %q (fork!)", v.Routing, want.Zone)
	}
	// A deterministic-verifiable node, by contrast, routes to the kernel zone (may freeze via /goal).
	vk := CertifyMetadata(node, completeMeta())
	if vk.RouteToSpike || vk.Routing != truthtyping.ZoneKernel {
		t.Fatalf("deterministic node must route to kernel zone, got %q route_to_spike=%v", vk.Routing, vk.RouteToSpike)
	}
}

// TestTruthKind_SingleEnumSource pins done-criterion (2): truth_kind is coherent — truthtyping (the
// canonical owner) and authority (the wrapper) agree on EVERY string. There is no second registry.
func TestTruthKind_SingleEnumSource(t *testing.T) {
	rapid.Check(t, func(r *rapid.T) {
		// Draw from the known kinds AND a handful of out-of-enum strings.
		pool := make([]string, 0)
		for _, k := range truthtyping.Kinds() {
			pool = append(pool, string(k))
		}
		pool = append(pool, "", "derived", "made-up", "behavioral ", "REGULATORY")
		s := rapid.SampledFrom(pool).Draw(r, "kind")
		k := truthtyping.TruthKind(s)
		if !TruthKindIsCoherent(k) {
			r.Fatalf("truth_kind %q: truthtyping and authority disagree (two enum sources!)", s)
		}
		// Belt and braces: the known set is exactly the authority-known set.
		if truthtyping.IsKnownKind(k) != authority.IsKnownTruthKind(authority.TruthKind(k)) {
			r.Fatalf("membership mismatch for %q", s)
		}
	})
}

// TestCertifyMetadata_Reproducible pins determinism-first: same node + same metadata → byte-identical
// verdict (Complete, gap codes, routing), no clock/rng/IO. The reproducibility mirror.
func TestCertifyMetadata_Reproducible(t *testing.T) {
	rapid.Check(t, func(r *rapid.T) {
		level := rapid.SampledFrom(AllLevels()).Draw(r, "level")
		status := rapid.SampledFrom(NodeStatuses()).Draw(r, "status")
		kindPool := append([]string{""}, kindsAsStrings()...)
		kindPool = append(kindPool, "bogus")
		levelPool := append([]string{""}, levelsAsStrings()...)
		levelPool = append(levelPool, "bogus")
		regionPool := []string{"", "FR", "EU", "US", "*", "MARS"}

		m := Metadata{
			TruthKind:     truthtyping.TruthKind(rapid.SampledFrom(kindPool).Draw(r, "kind")),
			Verifiability: truthtyping.VerifiabilityLevel(rapid.SampledFrom(levelPool).Draw(r, "verif")),
			Scope:         scope.TruthScope{Region: scope.Region(rapid.SampledFrom(regionPool).Draw(r, "region"))},
		}
		node := LevelNode{Level: level, Status: status, Provenance: Provenance{Source: "human", Detail: "x"}}

		a := CertifyMetadata(node, m)
		b := CertifyMetadata(node, m)
		if a.Complete != b.Complete || a.Routing != b.Routing || a.RouteToSpike != b.RouteToSpike {
			r.Fatalf("non-deterministic verdict: %+v vs %+v", a, b)
		}
		if len(a.Gaps) != len(b.Gaps) {
			r.Fatalf("non-deterministic gap count: %d vs %d", len(a.Gaps), len(b.Gaps))
		}
		for i := range a.Gaps {
			if a.Gaps[i].Code != b.Gaps[i].Code {
				r.Fatalf("non-deterministic gap order at %d: %q vs %q", i, a.Gaps[i].Code, b.Gaps[i].Code)
			}
		}
		// A complete verdict has zero gaps and vice versa (the two are equivalent).
		if a.Complete != (len(a.Gaps) == 0) {
			r.Fatalf("Complete=%v but gaps=%v (inconsistent)", a.Complete, a.Gaps)
		}
	})
}

func kindsAsStrings() []string {
	out := make([]string, 0, len(truthtyping.Kinds()))
	for _, k := range truthtyping.Kinds() {
		out = append(out, string(k))
	}
	return out
}

func levelsAsStrings() []string {
	out := make([]string, 0, len(truthtyping.Levels()))
	for _, l := range truthtyping.Levels() {
		out = append(out, string(l))
	}
	return out
}
