// Package records gives the Mirror a typed record and makes the completeness law
// mechanical (AIDOS step S06, AIDOS Mirror plane).
//
// THE BICEPHALOUS BODY (KRD LIVRE VI, §29, §33, §34): one body (a truth) has two
// heads — the intention in the Kernel (a `kernel.layer`) and the proof in the
// Mirror (a `mirrors.mirror`), joined by the `mirrors` link. A Mirror record
// carries the five typed fields of KRD §34:
//
//	reflects       → the kernel layer it proves, at a version (the `mirrors` link)
//	test_kind      → acceptance | e2e | property | fixture | contract | schema | unit | snapshot | meter
//	cert_language  → gherkin | xstate | fast-check | rapid | zod | pact | type-check | k6 | …
//	authority      → above (human = test-as-goal) | below (AI = test-as-means)
//	liveness       → alive | dead   (a non-executable / orphan mirror is dead = red)
//
// THE COMPLETENESS LAW (KRD §29, §33, §90, §91) made checkable. The reflet is
// one-to-many (§33): a layer may have several mirrors. The law is therefore:
//
//	no_truth_without_mirror — every kernel layer has at least one LIVING mirror of
//	  EACH test_kind its `kind` requires (the required test_kind is READ from the
//	  recorded layer profile, KRD §90 registry — never invented). A mirror whose
//	  cert_language is not executable as a deterministic sensor does NOT count
//	  (KRD §91 source_requires.mirror.lang = executable_deterministic; KRD §805).
//	no_orphan_mirror — every mirror's `reflects` target still exists at that
//	  @version; an orphan mirror is dead = a monster.
//
// A layer without a living mirror, or a mirror reflecting nothing, is a MONSTER
// (KRD LIVRE XXII) — and a monster is red.
//
// THE WALL (CLAUDE.md §2): this package is PURE — no DB calls, no I/O. It READS a
// projection of `mirrors ⋈ kernel` (passed in) and computes the monster set; it
// writes NOTHING. The agent role has no write grant to kernel/mirrors/fitness;
// only the `aidos` CLI writes truth through an approved ChangeSet. The predicates
// return the monster set, never a boolean they then satisfy (anti-Goodhart).
//
// DETERMINISM-FIRST (CLAUDE.md §6): completeness is a deterministic set-difference
// over declared inputs — same input → same output, monster set sorted. It MUST be
// code, never an agent. The reproducibility property mirror pins it.
package records

import "sort"

// TestKind is the nature of the proof a mirror runs (KRD §34, §90). The closed
// set per the migration CHECK constraint and KRD §34.
type TestKind string

const (
	TestKindAcceptance TestKind = "acceptance"
	TestKindE2E        TestKind = "e2e"
	TestKindProperty   TestKind = "property"
	TestKindFixture    TestKind = "fixture"
	TestKindContract   TestKind = "contract"
	TestKindSchema     TestKind = "schema"
	TestKindUnit       TestKind = "unit"
	TestKindSnapshot   TestKind = "snapshot"
	TestKindMeter      TestKind = "meter"
)

// CertLanguage is the certification language a mirror is written in (KRD §34).
// Whether a cert_language is EXECUTABLE as a deterministic sensor decides whether
// the mirror counts toward completeness (KRD §91, §805) — see executableCertLang.
type CertLanguage string

const (
	CertGherkin   CertLanguage = "gherkin"
	CertXState    CertLanguage = "xstate"
	CertFastCheck CertLanguage = "fast-check"
	CertRapid     CertLanguage = "rapid"
	CertZod       CertLanguage = "zod"
	CertPact      CertLanguage = "pact"
	CertTypeCheck CertLanguage = "type-check"
	CertK6        CertLanguage = "k6"
	CertFixture   CertLanguage = "fixture"
	CertSnapshot  CertLanguage = "snapshot"
	CertUnit      CertLanguage = "unit"
	// CertProse is NON-executable: prose / an LLM-judge alone is not a
	// deterministic sensor, so it does NOT count toward completeness (KRD §805).
	CertProse CertLanguage = "prose"
)

// executableCertLang declares which cert_languages are executable as a
// DETERMINISTIC sensor (KRD §91 source_requires.mirror.lang =
// executable_deterministic; KRD §805 closes the loop). DECLARED, never learned.
// Prose / LLM-judge-only languages are absent → not executable → do not count.
var executableCertLang = map[CertLanguage]bool{
	CertGherkin:   true,
	CertXState:    true,
	CertFastCheck: true,
	CertRapid:     true,
	CertZod:       true,
	CertPact:      true,
	CertTypeCheck: true,
	CertK6:        true,
	CertFixture:   true,
	CertSnapshot:  true,
	CertUnit:      true,
	// CertProse intentionally NOT here.
}

// IsExecutable reports whether a cert_language runs as a deterministic sensor.
// A mirror whose cert_language is not executable does not count toward
// completeness, regardless of its declared liveness (KRD §805).
func (c CertLanguage) IsExecutable() bool { return executableCertLang[c] }

// Authority places a mirror relative to the waterline (KRD §34, §15). A truth's
// mirror is above (human-anchored, test-as-goal); a projection's mirror is below
// (AI self-certifies, test-as-means).
type Authority string

const (
	AuthorityAbove Authority = "above"
	AuthorityBelow Authority = "below"
)

// Liveness is whether a mirror is a living proof or a dead monster (KRD §34).
type Liveness string

const (
	// LivenessAlive — a living mirror: it reflects a real layer @version and runs
	// as a deterministic sensor.
	LivenessAlive Liveness = "alive"
	// LivenessDead — a dead mirror: orphan (reflects nothing) or non-executable.
	LivenessDead Liveness = "dead"
)

// LayerRef is a content-addressed reference to a kernel layer at a version — the
// target of a mirror's `reflects` link (the `mirrors` link, KRD §41, §34).
type LayerRef struct {
	LayerID string `json:"layer_id"`
	Version string `json:"version"`
}

// Layer is the minimal read-model of a kernel.layer this package needs: its id,
// its version, and its `kind` (which decides the REQUIRED test_kinds via the
// recorded profile). The full Layer AST lives in the kernel schema; this is the
// projection the completeness join reads (the wall: read-only).
type Layer struct {
	LayerID string `json:"layer_id"`
	Version string `json:"version"`
	Kind    string `json:"kind"`
}

// Ref returns the LayerRef a mirror would point at to reflect this layer.
func (l Layer) Ref() LayerRef { return LayerRef{LayerID: l.LayerID, Version: l.Version} }

// Mirror is the typed Mirror record (KRD §34) — the five typed fields plus its
// content address. It mirrors the row shape of the mirrors.mirror_record table.
// Reflects is the layer @version this mirror proves (the `mirrors` link).
type Mirror struct {
	MirrorID     string       `json:"mirror_id"`
	Reflects     LayerRef     `json:"reflects"`
	TestKind     TestKind     `json:"test_kind"`
	CertLanguage CertLanguage `json:"cert_language"`
	Authority    Authority    `json:"authority"`
	Liveness     Liveness     `json:"liveness"`
	ContentHash  string       `json:"content_hash"`
}

// IsLiving reports whether a mirror counts toward completeness: it must be
// declared alive AND its cert_language must be executable as a deterministic
// sensor (KRD §805 — a non-executable mirror does not count, even if alive).
func (m Mirror) IsLiving() bool {
	return m.Liveness == LivenessAlive && m.CertLanguage.IsExecutable()
}

// requiredTestKinds is the RECORDED layer profile (KRD §90 the layer registry):
// each kernel `kind` declares the mirror test_kind(s) it requires. This is READ
// verbatim from the Tome, NEVER invented (anti-Goodhart, honesty rule). A `kind`
// absent here requires no specific test_kind (its presence of any living mirror
// suffices); a `kind` present here requires a living mirror of EACH listed
// test_kind (the one-to-many reflet, KRD §33).
var requiredTestKinds = map[string][]TestKind{
	"entity":    {TestKindSchema},
	"policy":    {TestKindProperty},
	"operation": {TestKindFixture}, // KRD §90 mirror.kind: state, run as a fixture (Operation DSL)
	"view":      {TestKindE2E},
	"control":   {TestKindFixture},
	"action":    {TestKindFixture},
	"api":       {TestKindContract},
	"db":        {TestKindSnapshot},
	"types":     {TestKindSchema},
	"ui-web":    {TestKindUnit},
	"ui-mobile": {TestKindUnit},
}

// RequiredTestKinds returns the test_kinds a kernel `kind` requires per the
// recorded profile (KRD §90). The result is a copy; callers may not mutate the
// profile (it is declared truth, read-only).
func RequiredTestKinds(kind string) []TestKind {
	req := requiredTestKinds[kind]
	out := make([]TestKind, len(req))
	copy(out, req)
	return out
}

// MonsterReason names why a (layer, mirror) is a monster (KRD LIVRE XXII).
type MonsterReason string

const (
	// ReasonNoTruthWithoutMirror — a kernel layer with no living mirror of a
	// required test_kind. The intention head has no proof head.
	ReasonNoTruthWithoutMirror MonsterReason = "no_truth_without_mirror"
	// ReasonNoOrphanMirror — a mirror whose `reflects` target does not exist at
	// that @version. The proof head has no body.
	ReasonNoOrphanMirror MonsterReason = "no_orphan_mirror"
)

// Monster is one violation of the completeness law: either a layer missing a
// living mirror, or an orphan mirror. Exactly one of LayerRef / MirrorID is the
// subject, disambiguated by Reason. MissingTestKind names the required test_kind
// the layer lacks (for no_truth_without_mirror).
type Monster struct {
	Reason          MonsterReason `json:"reason"`
	LayerID         string        `json:"layer_id,omitempty"`
	Version         string        `json:"version,omitempty"`
	Kind            string        `json:"kind,omitempty"`
	MissingTestKind TestKind      `json:"missing_test_kind,omitempty"`
	MirrorID        string        `json:"mirror_id,omitempty"`
}

// Verdict is the completeness verdict for a cut (KRD §29).
type Verdict string

const (
	// VerdictComplete — no monster: every layer has its living mirror(s) and no
	// mirror is an orphan. The bicephalous law holds.
	VerdictComplete Verdict = "COMPLETE"
	// VerdictRedMonster — at least one monster: a truth without a mirror or an
	// orphan mirror. The law is red.
	VerdictRedMonster Verdict = "RED_MONSTER"
)

// Completeness is the computed result of the law over a cut of mirrors ⋈ kernel.
// Monsters is the full monster set (sorted, deterministic); Verdict is COMPLETE
// iff the monster set is empty.
type Completeness struct {
	Verdict  Verdict   `json:"verdict"`
	Monsters []Monster `json:"monsters"`
}

// NoOrphanMirror computes the no_orphan_mirror monster set: every mirror whose
// `reflects` target does not exist among the live kernel layers at that @version.
// Pure and total. An orphan mirror's liveness is dead by definition (KRD §34) —
// a caller projecting the mirror set should set liveness=dead for these, and the
// migration's read model marks them so; here we only REPORT them as monsters
// (the predicate returns the set, it does not mutate the truth — the wall).
func NoOrphanMirror(mirrors []Mirror, layers []Layer) []Monster {
	live := make(map[LayerRef]bool, len(layers))
	for _, l := range layers {
		live[l.Ref()] = true
	}
	var out []Monster
	for _, m := range mirrors {
		if !live[m.Reflects] {
			out = append(out, Monster{
				Reason:   ReasonNoOrphanMirror,
				MirrorID: m.MirrorID,
				LayerID:  m.Reflects.LayerID,
				Version:  m.Reflects.Version,
			})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MirrorID < out[j].MirrorID })
	return out
}

// NoTruthWithoutMirror computes the no_truth_without_mirror monster set: every
// kernel layer that lacks a LIVING mirror of a required test_kind (KRD §90
// recorded profile + §33 one-to-many). A mirror counts only if it reflects this
// exact layer @version AND IsLiving() (alive ∧ executable cert_language — KRD
// §805). Pure and total. Sorted by (layer_id, missing_test_kind).
func NoTruthWithoutMirror(mirrors []Mirror, layers []Layer) []Monster {
	// Index the LIVING mirrors per (layer @version) → set of test_kinds present.
	living := make(map[LayerRef]map[TestKind]bool)
	for _, m := range mirrors {
		if !m.IsLiving() {
			continue // non-executable or dead → does not count (KRD §805).
		}
		set, ok := living[m.Reflects]
		if !ok {
			set = make(map[TestKind]bool)
			living[m.Reflects] = set
		}
		set[m.TestKind] = true
	}

	var out []Monster
	for _, l := range layers {
		present := living[l.Ref()]
		required := requiredTestKinds[l.Kind]
		if len(required) == 0 {
			// No specific test_kind required: any single living mirror suffices.
			if len(present) == 0 {
				out = append(out, Monster{
					Reason:  ReasonNoTruthWithoutMirror,
					LayerID: l.LayerID,
					Version: l.Version,
					Kind:    l.Kind,
				})
			}
			continue
		}
		// A required test_kind: a living mirror of EACH required kind must exist.
		for _, tk := range required {
			if !present[tk] {
				out = append(out, Monster{
					Reason:          ReasonNoTruthWithoutMirror,
					LayerID:         l.LayerID,
					Version:         l.Version,
					Kind:            l.Kind,
					MissingTestKind: tk,
				})
			}
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].LayerID != out[j].LayerID {
			return out[i].LayerID < out[j].LayerID
		}
		return out[i].MissingTestKind < out[j].MissingTestKind
	})
	return out
}

// ComputeCompleteness is the whole completeness law in one pure call: mirrors ⋈
// kernel in, the monster set + verdict out (KRD §29). The verdict is COMPLETE iff
// BOTH predicates report no monster. Returns the monster set, never a boolean it
// then satisfies (anti-Goodhart, CLAUDE.md §8). Deterministic: the monster set is
// no_truth_without_mirror first (by layer), then no_orphan_mirror (by mirror).
func ComputeCompleteness(mirrors []Mirror, layers []Layer) Completeness {
	monsters := NoTruthWithoutMirror(mirrors, layers)
	monsters = append(monsters, NoOrphanMirror(mirrors, layers)...)
	verdict := VerdictComplete
	if len(monsters) > 0 {
		verdict = VerdictRedMonster
	}
	return Completeness{Verdict: verdict, Monsters: monsters}
}
