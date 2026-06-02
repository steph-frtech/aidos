// Package ideas defines the Idea record and its lifecycle — the ONLY door into
// the Kernel (AIDOS step S27).
//
// An Idea is a CANDIDATE-truth staged ABOVE product but BELOW the freeze (KRD
// §115/§118): it has the form of a truth — a sketched body (`proposes` + `intent`
// + `provenance`) — but it carries NEITHER a version-freeze NOR a mirror. That
// double absence is EXACTLY what makes it an idea and not a truth (KRD §118: "PAS
// de version-gel, PAS de mirror — c'est ce qui la distingue d'une vérité"). The
// Idea type makes both unrepresentable: there is no Version and no Mirror field on
// the struct — by construction an idea cannot carry the thing that would make it a
// truth.
//
// The lifecycle is wired on the §75 gestures (KRD §118):
//
//	          ┌──────────────────── reject (traced) ──────────────────┐
//	          ▼                                                        │
//	draft ──grill──▶ grilled ──spike──▶ spiking ──harvest──▶ harvested ─┴─▶ promote
//	                    └────────────── harvest ──────────────▶ harvested
//
// "Promote" is NOT a status — it is the ACT of writing the idea's mirror, which
// IS the /goal, which IS the freeze into /kernel (KRD §116: "promouvoir une idée
// = écrire son miroir + la geler"). Promote of a harvested idea WITHOUT a mirror
// returns the actionable NO_MIRROR_NO_KERNEL BlockReason (KRD §44.5): an idea with
// no mirror can NEVER enter the kernel. This package proves the GATE and the
// LIFECYCLE; the downstream kernel write is the aidos CLI role via the /goal flow,
// not the agent (the wall, CLAUDE.md §2).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every function here is PURE and TOTAL — no
// clock (timestamps are passed in by the caller / DB), no rng, no I/O, never
// panics. The same input always yields the same output; the reproducibility mirror
// ideas_property_test.go pins that. The id is the content hash of the canonical
// body, REUSING the S01/S02 content-hash scheme (records.Hash/Canonicalize) — never
// a forked hashing path.
package ideas

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Status is the lifecycle state of an Idea. The set is CLOSED and small (KRD §118)
// — there is no sixth status, and "promote" is deliberately NOT a status (it is the
// act of writing the mirror = /goal = freeze, modelled by Promote()).
type Status string

const (
	// StatusDraft — just captured from a human utterance or an incident; not yet
	// grilled. The entry state.
	StatusDraft Status = "draft"
	// StatusGrilled — challenged against the domain model (/grill); the intention
	// is sharpened but still not falsifiable.
	StatusGrilled Status = "grilled"
	// StatusSpiking — the "floue ?" branch: exploration with the ratchet OFF
	// (/spike). A spiking idea is being probed, not graduated.
	StatusSpiking Status = "spiking"
	// StatusHarvested — the discovered truth has been extracted (/harvest); the
	// idea is now ready to be promoted — but only by acquiring a mirror.
	StatusHarvested Status = "harvested"
	// StatusRejected — a bad idea, traced and kept (append-only); never deleted.
	StatusRejected Status = "rejected"
)

// Statuses returns the five lifecycle statuses in canonical order. Used by the
// validator and the Workbench projection so the set of lanes is never invented.
func Statuses() []Status {
	return []Status{StatusDraft, StatusGrilled, StatusSpiking, StatusHarvested, StatusRejected}
}

// Proposes is the targeted layer/kind an idea WOULD become if promoted (KRD §118).
// The set is the closed set of kernel source kinds plus "product"; an idea names
// what it proposes, it does not yet freeze it.
type Proposes string

const (
	ProposesControl   Proposes = "control"
	ProposesPolicy    Proposes = "policy"
	ProposesOperation Proposes = "operation"
	ProposesAction    Proposes = "action"
	ProposesEntity    Proposes = "entity"
	ProposesProduct   Proposes = "product"
)

// ProposesKinds returns the closed set of layer/kinds an idea may propose, in
// canonical order. The Workbench renders exactly these; none is invented.
func ProposesKinds() []Proposes {
	return []Proposes{
		ProposesControl, ProposesPolicy, ProposesOperation,
		ProposesAction, ProposesEntity, ProposesProduct,
	}
}

// ProvenanceSource is who/what engendered an idea (KRD §117): a human utterance or
// a reality/incident signal. The set is closed — the two legal on-ramps.
type ProvenanceSource string

const (
	// ProvenanceHuman — "finalement je veux que…": a human intention (KRD §117).
	ProvenanceHuman ProvenanceSource = "human"
	// ProvenanceIncident — reality diverged: an incident #NNNN (KRD §117).
	ProvenanceIncident ProvenanceSource = "incident"
)

// Provenance records who wanted what, when, why (KRD §119): the source and the
// verbatim detail (the human utterance, or the incident reference `#NNNN`). Every
// frozen truth later points back to the idea — and through it to this provenance.
type Provenance struct {
	Source ProvenanceSource `json:"source"`
	// Detail is the human utterance ("finalement je veux une remise") or the
	// incident reference ("#1234"). Verbatim, never paraphrased.
	Detail string `json:"detail"`
}

// Idea is a candidate-truth (KRD §118). It carries a sketched body — Proposes +
// Intent + Provenance — and a lifecycle Status. It carries NO Version (no freeze)
// and NO Mirror: those two absences are what distinguish an idea from a truth, and
// the type makes them UNREPRESENTABLE (there is simply no field for them). The ID
// is the content hash of the canonical body (content-addressing), reusing the
// S01/S02 scheme — so the same sketched body always lands at the same address.
//
// The body that the ID hashes over is {proposes, intent, provenance} — the durable
// identity of the candidate. Status is lifecycle metadata that ADVANCES (it is not
// part of the content address): grilling or harvesting the same sketch does not
// change its identity. RejectReason is set only when Status == rejected (traced).
type Idea struct {
	ID         string     `json:"id"`
	Proposes   Proposes   `json:"proposes"`
	Intent     string     `json:"intent"`
	Provenance Provenance `json:"provenance"`
	Status     Status     `json:"status"`
	// RejectReason is the traced reason an idea was rejected (KRD §118: reject is
	// append-only/traced, never a deletion). Empty unless Status == rejected.
	RejectReason string `json:"reject_reason,omitempty"`
}

// body is the content-addressed JSONB shape: the durable sketch {proposes, intent,
// provenance}. Status and reject_reason are deliberately EXCLUDED from the address
// (lifecycle metadata, not identity) — and there is no `version` and no `mirror`
// key, by construction.
type body struct {
	Proposes   Proposes   `json:"proposes"`
	Intent     string     `json:"intent"`
	Provenance Provenance `json:"provenance"`
}

// ErrParse is returned when an idea body JSONB cannot be decoded into an Idea.
var ErrParse = fmt.Errorf("ideas: malformed idea body")

// Canonicalize returns the deterministic JSONB body an idea is hashed over: the
// sketch {proposes, intent, provenance} with object keys sorted lexicographically.
// It REUSES records.Canonicalize (the S01/S02 content-hash scheme) — never a
// forked hashing path. So records.Hash(Canonicalize(i)) is the idea id.
func Canonicalize(i Idea) ([]byte, error) {
	raw, err := json.Marshal(body{
		Proposes:   i.Proposes,
		Intent:     i.Intent,
		Provenance: i.Provenance,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrParse, err)
	}
	return records.Canonicalize(raw)
}

// Hashed returns i with its ID set to the content hash of its canonical body,
// reusing records.Hash (the same address space as the content store and every
// record kind — never a re-invented hashing path). It is a pure function: the
// same sketch always yields the same id, regardless of input key order.
func Hashed(i Idea) (Idea, error) {
	b, err := Canonicalize(i)
	if err != nil {
		return Idea{}, err
	}
	i.ID = records.Hash(b)
	return i, nil
}
