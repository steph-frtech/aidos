// Package contracte is FK16 — the CONTRACT half of the E0-E7 migration (KRD FKE-16,
// "Décision actée grill 2026-06-07: migration COMPLÈTE vers E0-E7, par expand-contract").
// FK05 was the EXPAND half: it declared the N0-N5 → E0-E7 mapping ALONGSIDE the legacy
// N-levels, modifying no schema, no existing mirror. FK16 is the *contract* (the dry
// schema switch): the `mirrors`/`cert_language` corpus, the `/proof-levels` panels and
// the docs flip to E0-E7, and the legacy N-label is DEPRECATED via lifecycle — never
// deleted (append-only, anti-overwrite CLAUDE.md §9). It is the LAST step of the FK track
// (it touches the frozen-proven), gated by DataTruthScope (the migration is expand-contract).
//
// ZÉRO PERTE — every N-mirror carries its E (FK16 done-criterion). A mirror is re-labelled
// by DERIVING its evidence level from the proof it ACTUALLY runs (its test_kind ×
// cert_language), NOT by an LLM guess. The derivation is the authoritative deterministic
// CertToE / KindToE / MirrorE pure functions; same mirror ⇒ same E (the reproducibility
// mirror pins it). A re-labelled mirror keeps its N verbatim (the double-label survives the
// switch); the deprecation is a LIFECYCLE flag, not a column drop.
//
// THE LIFECYCLE OF N (FK16: "N déprécié via lifecycle, jamais supprimé"). NLifecycle marks an
// N-label's stage in the bascule:
//
//	NActive      — the build-in-progress state (FK05 expand): N is the source, E is derived
//	               alongside. (the world before FK16.)
//	NDeprecated  — the post-FK16 state: E is now authoritative on the corpus; the N-label is
//	               PRESERVED on the record (read-only, for provenance) but is no longer the
//	               proof-typing source. It is never deleted — a deprecated N still round-trips.
//
// The transition Active→Deprecated is MONOTONE (never reverses) and append-only: deprecating
// an N appends a new record state; it mutates no prior row, drops no column, loses no N.
//
// THE BASCULE (Relabel). Relabel takes the existing N-typed corpus and produces the E-typed
// corpus WITHOUT LOSS: each output mirror carries (a) its preserved N, (b) its derived E, (c) the
// N lifecycle now Deprecated. Relabel is PURE and TOTAL — an unknown test_kind/cert maps to E0
// (the floor), never a panic; the corpus order is preserved; same corpus ⇒ byte-identical output.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). CertToE, KindToE, MirrorE, Relabel and Deprecate are PURE,
// TOTAL functions: no DB, no clock, no rng, no I/O, no LLM. The E a mirror attains is COMPUTED
// from the deterministic proof it runs, never judged. The reproducibility property mirror
// (contracte_property_test.go) pins same input → same output.
//
// THE WALL (CLAUDE.md §2). This package writes NOTHING above the waterline. It READS the existing
// mirror corpus (test_kind, cert_language, the N-label set by S06 at the legal door) and DERIVES
// the E-typed re-labelling. The actual schema switch (adding the evidence_level column, marking N
// deprecated) is an EXPAND-CONTRACT Postgres migration applied by the privileged `aidos` writer
// role through an approved ChangeSet — gated by DataTruthScope. The agent has no write grant.
package contracte

import (
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/mirror/prooftype"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// NLifecycle is the lifecycle stage of a mirror's legacy N-label across the FK16 bascule. The
// N-label is NEVER deleted (append-only); its lifecycle records whether it is still the proof-
// typing source (Active, pre-FK16) or preserved-for-provenance only (Deprecated, post-FK16).
type NLifecycle string

const (
	// NActive — the FK05-expand state: N is the source, E is derived alongside it. The world
	// before FK16 throws the switch.
	NActive NLifecycle = "active"
	// NDeprecated — the post-FK16 state: E is authoritative; the N-label is PRESERVED on the
	// record (read-only, for provenance) but is no longer the proof-typing source. Never deleted.
	NDeprecated NLifecycle = "deprecated"
)

// IsReal reports whether s is one of the two real lifecycle stages.
func (s NLifecycle) IsReal() bool { return s == NActive || s == NDeprecated }

// certToE is the CLOSED, DECLARED cert_language → attained E-level table (FK16). It says, for the
// certification language a mirror is WRITTEN in, the maximum evidence rung that language ATTAINS:
//
//	gherkin    → E3 (acceptance/integration journey)
//	xstate     → E3 (statechart workflow — integration)
//	fast-check → E5 (property/fuzz)
//	rapid      → E5 (property/fuzz)
//	zod        → E1 (schema typecheck)
//	pact       → E3 (contract)
//	type-check → E1 (typecheck/lint)
//	k6         → E5 (load/benchmark — fuzz/benchmark class)
//	fixture    → E3 (state→cmd→events integration)
//	snapshot   → E2 (a recorded-output unit assertion)
//	unit       → E2 (unit test)
//	prose      → E0 (NON-executable — no evidence; KRD §805)
//
// DECLARED, never learned (§8). A cert absent here attains E0 (the floor). This is the
// authoritative deterministic function — no LLM ever decides a mirror's evidence rung.
var certToE = map[records.CertLanguage]prooftype.ELevel{
	records.CertGherkin:   prooftype.E3,
	records.CertXState:    prooftype.E3,
	records.CertFastCheck: prooftype.E5,
	records.CertRapid:     prooftype.E5,
	records.CertZod:       prooftype.E1,
	records.CertPact:      prooftype.E3,
	records.CertTypeCheck: prooftype.E1,
	records.CertK6:        prooftype.E5,
	records.CertFixture:   prooftype.E3,
	records.CertSnapshot:  prooftype.E2,
	records.CertUnit:      prooftype.E2,
	records.CertProse:     prooftype.E0,
}

// CertToE is the PURE, TOTAL cert_language → attained E-level mapping (FK16). TOTAL: an unknown
// cert maps to E0 (the floor — no evidence claimed), never a panic. DETERMINISTIC: same cert ⇒
// same E. This is the reproducibility-mirror'd function.
func CertToE(c records.CertLanguage) prooftype.ELevel {
	if e, ok := certToE[c]; ok {
		return e
	}
	return prooftype.E0
}

// kindToE is the CLOSED, DECLARED test_kind → attained E-level table (FK16), a SECOND, independent
// lens on a mirror's evidence rung (the NATURE of the proof, vs the language it is written in):
//
//	acceptance → E3   e2e → E3   property → E5   fixture → E3   contract → E3
//	schema → E1       unit → E2  snapshot → E2   meter → E6 (runtime observation)
//
// DECLARED, never learned (§8). A kind absent here attains E0.
var kindToE = map[records.TestKind]prooftype.ELevel{
	records.TestKindAcceptance: prooftype.E3,
	records.TestKindE2E:        prooftype.E3,
	records.TestKindProperty:   prooftype.E5,
	records.TestKindFixture:    prooftype.E3,
	records.TestKindContract:   prooftype.E3,
	records.TestKindSchema:     prooftype.E1,
	records.TestKindUnit:       prooftype.E2,
	records.TestKindSnapshot:   prooftype.E2,
	records.TestKindMeter:      prooftype.E6,
}

// KindToE is the PURE, TOTAL test_kind → attained E-level mapping (FK16). TOTAL: an unknown kind
// maps to E0. DETERMINISTIC.
func KindToE(k records.TestKind) prooftype.ELevel {
	if e, ok := kindToE[k]; ok {
		return e
	}
	return prooftype.E0
}

// MirrorE is the PURE, TOTAL evidence-level a mirror ATTAINS (FK16 core). A mirror runs a proof of
// a given NATURE (test_kind) WRITTEN in a given LANGUAGE (cert_language). The E it attains is the
// MAX of the two lenses — the strongest evidence rung the proof genuinely reaches — EXCEPT that a
// NON-executable mirror (prose / a dead non-executable cert) attains E0 regardless of its declared
// kind: a proof that does not run as a deterministic sensor is no evidence (KRD §805). TOTAL +
// DETERMINISTIC: same (kind, cert) ⇒ same E.
func MirrorE(k records.TestKind, c records.CertLanguage) prooftype.ELevel {
	if !c.IsExecutable() {
		// A non-executable cert (prose / LLM-judge-only) is no evidence — E0, the floor.
		return prooftype.E0
	}
	ce := CertToE(c)
	ke := KindToE(k)
	if ce >= ke {
		return ce
	}
	return ke
}

// MirrorTag is the FK16 OUTPUT re-labelling of one mirror: its content address, the PRESERVED
// legacy N-label, that N's lifecycle (now Deprecated post-bascule), and the DERIVED E it attains.
// It is the contract-side double-label — N preserved, E now authoritative.
type MirrorTag struct {
	// MirrorID — the content address of the mirror being re-labelled (preserved).
	MirrorID string `json:"mirror_id"`
	// N — the legacy N-label, PRESERVED verbatim (never deleted; zero loss).
	N prooftype.NLevel `json:"n"`
	// NLifecycle — the stage of the N-label after the bascule (Deprecated: kept for provenance,
	// no longer the source).
	NLifecycle NLifecycle `json:"n_lifecycle"`
	// E — the DERIVED evidence level the mirror attains (now authoritative).
	E prooftype.ELevel `json:"e"`
	// EName — the canonical name of E (for the panel / docs).
	EName string `json:"e_name"`
}

// MirrorIn is the FK16 INPUT read-model of one existing mirror: enough to derive its E and carry
// its preserved N. READ from the corpus (S06 set the N at the legal door); this package never
// writes it.
type MirrorIn struct {
	MirrorID     string               `json:"mirror_id"`
	TestKind     records.TestKind     `json:"test_kind"`
	CertLanguage records.CertLanguage `json:"cert_language"`
	N            prooftype.NLevel     `json:"n"`
}

// Deprecate is the PURE monotone lifecycle transition (FK16: "N déprécié via lifecycle"). It marks
// an N-label Deprecated. The transition is MONOTONE — once Deprecated it stays Deprecated; an
// already-Deprecated stage is returned unchanged (idempotent). It NEVER reverses to Active and
// NEVER returns the empty stage: deprecation only ever moves forward, never deletes the N.
func Deprecate(_ NLifecycle) NLifecycle { return NDeprecated }

// RelabelOne is the PURE, TOTAL re-labelling of one mirror (FK16 bascule, per-record). It derives
// the mirror's E from the deterministic proof it runs, PRESERVES its N verbatim, and marks the N
// lifecycle Deprecated. TOTAL: an unknown kind/cert yields E0, never a panic — zero loss (the N is
// always preserved). DETERMINISTIC: same mirror ⇒ byte-identical tag.
func RelabelOne(m MirrorIn) MirrorTag {
	e := MirrorE(m.TestKind, m.CertLanguage)
	return MirrorTag{
		MirrorID:   m.MirrorID,
		N:          m.N,
		NLifecycle: NDeprecated,
		E:          e,
		EName:      e.Name(),
	}
}

// Relabel is the PURE, TOTAL corpus bascule (FK16 core; "zéro perte"). It re-labels the whole
// N-typed corpus to E WITHOUT LOSS: every output tag carries its preserved N AND its derived E AND
// the N lifecycle now Deprecated. The output order MIRRORS the input order (stable); same corpus ⇒
// byte-identical output. This is the deterministic switch — no mirror is dropped, no N erased.
func Relabel(corpus []MirrorIn) []MirrorTag {
	out := make([]MirrorTag, 0, len(corpus))
	for _, m := range corpus {
		out = append(out, RelabelOne(m))
	}
	return out
}

// NoLoss reports whether a re-labelling lost nothing: it is true iff the output has one tag per
// input mirror (same count, same ids, in order) and EVERY tag still carries its N (never empty)
// with the N lifecycle Deprecated. This is the FK16 "zéro perte" predicate, computed (never
// declared) — the bascule is only legal when NoLoss holds.
func NoLoss(corpus []MirrorIn, tags []MirrorTag) bool {
	if len(corpus) != len(tags) {
		return false
	}
	for i := range corpus {
		t := tags[i]
		if t.MirrorID != corpus[i].MirrorID {
			return false
		}
		if t.N != corpus[i].N {
			return false
		}
		if t.NLifecycle != NDeprecated {
			return false
		}
	}
	return true
}

// EHistogram counts, over a re-labelled corpus, how many mirrors attain each E-level. The result is
// a fresh map keyed by every real E-level (E0…E7), zero-filled — so the panel renders every rung,
// present or not. PURE + DETERMINISTIC. (A read-model for the /proof-levels E panel.)
func EHistogram(tags []MirrorTag) map[prooftype.ELevel]int {
	h := map[prooftype.ELevel]int{}
	for _, e := range []prooftype.ELevel{
		prooftype.E0, prooftype.E1, prooftype.E2, prooftype.E3,
		prooftype.E4, prooftype.E5, prooftype.E6, prooftype.E7,
	} {
		h[e] = 0
	}
	for _, t := range tags {
		h[t.E]++
	}
	return h
}

// ELevels returns the eight E-levels in canonical E0→E7 ascending order (for the panel / docs). The
// rung set is declared, never invented.
func ELevels() []prooftype.ELevel {
	out := []prooftype.ELevel{
		prooftype.E0, prooftype.E1, prooftype.E2, prooftype.E3,
		prooftype.E4, prooftype.E5, prooftype.E6, prooftype.E7,
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}
