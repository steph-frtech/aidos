// Package phases is the Archive's stable-phase primitive (KRD §43, §44): the pure
// COHERENT-CUT decision of the version DAG. A stable phase is a CUT — one version selected
// per constraint — that is coherent: EVERY link in the cut resolves (S17 green, no
// stale/absent) AND EVERY sensor over the cut is green, at once. It is the kernel's
// LOCKFILE (KRD §43): "is this a stable phase?" = "all links resolved + all green?".
//
// THE LAW (KRD §43): "stable" is COMPUTED, never declared. The EMPTY cut (no constraints,
// no links, no sensors) is VACUOUSLY STABLE — the base case (nothing pends, nothing is red).
// ANY single red mirror — a sensor whose result is red, OR a link that resolves stale|absent
// — flips the cut to UNSTABLE and is named in `reasons`. There is no third verdict: a cut is
// stable or it is not. This package lands LOCAL/cell stability only; the recursive aggregate
// / federation (§43 fractal) is a later step.
//
// REUSE, DON'T REINVENT (CLAUDE.md §6; the wall):
//   - the staleness of each link is decided ONLY by S17's links.Resolve — this package never
//     re-implements or forks it (a link is red iff Resolve reports stale|absent);
//   - a sensor's green/red is the S07 sensor-result shape (CheckResult.Pass) — reused, not
//     redefined; a SensorStatus mirrors {id, pass};
//   - the phase content address is S02's records.Canonicalize + records.Hash — NOT forked: the
//     phase rides as a records.KindPhase body, so version == id == Hash(Canonicalize(body)).
//
// PURE (CLAUDE.md §6/§8 determinism-first): IsStable is a TOTAL, deterministic function of
// (cut, heads, links, sensors) — no DB, no clock, no rng, no I/O. The cut/heads/links/sensors
// are READ from the arguments handed in, never fetched, so the same input yields the same
// (stable, reasons) and a byte-identical content address. It NEVER PANICS on a malformed cut
// (Resolve is total; a missing head is absent, not a crash). The rapid property mirror pins
// determinism, empty⇒stable, any-red⇒unstable, stable⇒all-green-both-ways, reasons⇔stable,
// and totality.
//
// READ-ONLY against truth (the wall, CLAUDE.md §2): this package writes nothing. IsStable
// returns the StablePhase VALUE; recording a phase node into dag.stable_phase (a truth schema
// above the line) is done ONLY through the privileged `aidos` writer role inside an approved
// ChangeSet — never the agent role, never in passing.
package phases

import (
	"encoding/json"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// SensorStatus is one sensor's certification result over the cut — the S07 sensor-result
// shape (CheckResult), reduced to what the cut decision needs: an id and whether it is green
// (Pass). A non-green sensor is a RED mirror that breaks the cut (§43). It is the snapshot
// row stored inside the phase body.
type SensorStatus struct {
	// ID is the sensor/mirror id (e.g. "createOrder.fixture") — named in reasons when red.
	ID string `json:"id"`
	// Pass is the S07 green flag: true = green, false = red. A red sensor makes the cut unstable.
	Pass bool `json:"pass"`
}

// Cut is the selection of a stable phase: one concrete version per constraint id
// (constraintId → version). It is the cut in the version DAG (KRD §43). The empty cut (no
// constraints) is the base case (vacuously stable). It rides INSIDE the phase body (a set of
// version-pinned refs, not foreign keys) so a recorded phase stays inspectable after the head
// moves.
type Cut map[string]string

// StablePhase is the KRD §43 coherent-cut artifact: the cut (selection), the sensor snapshot
// over that cut, the DERIVED stable verdict, and the ordered reasons (the offending link/
// sensor ids when unstable, empty when stable). It is content-addressed by the hash of its
// canonical cut body (Version == ID). It is the value IsStable returns — the kernel's lockfile.
type StablePhase struct {
	// Cut is the selection: constraintId → version (one version per constraint).
	Cut Cut `json:"cut"`
	// SensorStatus is the snapshot of each sensor's green/red over the cut (S07 shape).
	SensorStatus []SensorStatus `json:"sensor_status"`
	// Stable is the DERIVED verdict: true iff every link resolves green AND every sensor is green.
	Stable bool `json:"stable"`
	// Reasons names every offending link/sensor id, sorted. Empty iff Stable (reasons ⇔ ¬stable).
	Reasons []string `json:"reasons"`
}

// reasonForLink renders the canonical reason string for a non-green link: "from->to (status)"
// — e.g. "checkout-submit@v1->createOrder@v2 (stale)" — so the offending link is named in a
// human-readable, deterministic form (KRD §42 "a link pends").
func reasonForLink(l links.Link, status links.LinkStatus) string {
	return l.From.String() + "->" + l.To.String() + " (" + string(status) + ")"
}

// IsStable is the PURE coherent-cut decision (KRD §43). It is a total, deterministic function
// of (cut, heads, links, sensors):
//
//   - it REUSES S17's links.Resolve to test EVERY link in the cut resolves GREEN (no stale,
//     no absent — no dangling link); a non-green link is a red mirror and is named in reasons
//     ("from->to (stale|absent)");
//   - it tests EVERY sensor in the snapshot is green (S07 Pass); a red sensor is named in
//     reasons by its id;
//   - stable == true IFF both hold. The EMPTY cut (no links, no sensors) is VACUOUSLY STABLE
//     (reasons empty) — the done base case. ANY single red mirror flips stable to false.
//
// reasons is built in a canonical order (sensors first by id, then links by their rendered
// form) so the verdict is byte-stable. reasons is empty IFF stable (both directions hold).
//
// PURE: no DB, no clock, no rng, no I/O. NEVER PANICS (Resolve is total; a nil cut/sensors/
// links yields a verdict, not a crash).
func IsStable(cut Cut, heads links.Heads, ls []links.Link, sensors []SensorStatus) StablePhase {
	var reasons []string

	// Every sensor must be green (S07 Pass). A red sensor is named by its id.
	for _, s := range sensors {
		if !s.Pass {
			reasons = append(reasons, s.ID)
		}
	}

	// Every link must resolve GREEN (S17 Resolve, reused). A stale/absent link is named by its
	// rendered form. Resolve is the single source of staleness truth — never re-implemented here.
	for _, l := range ls {
		if status := links.Resolve(l, heads); status != links.StatusGreen {
			reasons = append(reasons, reasonForLink(l, status))
		}
	}

	// Canonical order so the verdict is deterministic / byte-stable.
	sort.Strings(reasons)

	return StablePhase{
		Cut:          cut,
		SensorStatus: sensors,
		Stable:       len(reasons) == 0,
		Reasons:      reasons,
	}
}

// canonicalBody renders the phase as a records.KindPhase body so it rides INSIDE the
// content-addressed substrate (S02). The body carries the cut, the sensor snapshot, the
// derived stable verdict and the reasons — the FULL recorded fact, so a recorded phase stays
// inspectable (the cut is a set of version-pinned refs, not foreign keys). The "kind":"phase"
// discriminator matches records.KindPhase (records.Validate).
func (p StablePhase) canonicalBody() ([]byte, error) {
	// A nil cut/reasons must serialize as the empty object/array (not JSON null) so the empty
	// phase has a stable, well-formed canonical body.
	cut := p.Cut
	if cut == nil {
		cut = Cut{}
	}
	sensors := p.SensorStatus
	if sensors == nil {
		sensors = []SensorStatus{}
	}
	reasons := p.Reasons
	if reasons == nil {
		reasons = []string{}
	}
	body := map[string]any{
		"kind":          string(records.KindPhase),
		"cut":           cut,
		"sensor_status": sensors,
		"stable":        p.Stable,
		"reasons":       reasons,
	}
	return json.Marshal(body)
}

// Record builds the content-addressed records.Record for this phase, REUSING S02's
// records.NewRecord (Canonicalize + Hash) — never a forked hash scheme. The returned record's
// id == version == Hash(Canonicalize(body)), so a stable phase is content-addressed: the same
// cut+verdict always lands under the same address, and changing any field yields a new address
// (a new DAG node, never an in-place mutation — KRD §12). It writes NOTHING (the wall): the
// caller hands the record body to the `aidos` writer role inside a ChangeSet to record the node.
func (p StablePhase) Record() (records.Record, error) {
	body, err := p.canonicalBody()
	if err != nil {
		return records.Record{}, err
	}
	return records.NewRecord(records.KindPhase, body)
}

// Version returns the phase's content address (Hash(Canonicalize(canonicalBody))) — the same
// value as Record().Version == Record().ID. It is the phase's id in dag.stable_phase: a stable
// phase is the kernel's lockfile, addressed by the hash of its cut body.
func (p StablePhase) Version() (string, error) {
	r, err := p.Record()
	if err != nil {
		return "", err
	}
	return r.Version, nil
}
