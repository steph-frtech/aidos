// Package realityingest implements the AIDOS S106 EXTERNAL-LOOP INGESTION
// (ROADMAP-app-builder §S106, EPIC 12 / E12, KRD §53/§67/§117/§1099) — the door by
// which a DEPLOYED emitted app's production OpenTelemetry, read by the telemetry-reader
// (S43/E12), becomes a candidate-truth:
//
//	prod OTel  →  DetectDivergence  →  RealityMirror (project-scoped, provenance=incident)
//	          →  RenderIdeaText (template)  →  ideas.Idea(DRAFT)  →  [human] grill → /goal
//
// THE LOAD-BEARING S106 CONTRACT (over the S43 reality engine it REUSES):
//
//  1. PROJECT-SCOPED. A deployed app is one project (multi-tenant, S55). Every record
//     this package produces carries the ProjectID; the content address INCLUDES it, so
//     two projects' identical divergences never collapse to one incident.
//
//  2. DIVERGENCE DETECTION IS A DETERMINISTIC COMPARISON (CLAUDE.md §6 determinism-first;
//     ROADMAP §S106 "détection de divergence = code"). DetectDivergence compares a
//     telemetry-reader report against a MirrorExpectation (the mirror's promise about the
//     operation — max error-rate / max p99). It is a pure numeric comparison, NEVER an
//     LLM "decide if prod looks wrong" agent. Same report + expectation ⇒ same verdict.
//
//  3. THE IDEA TEXT IS A DETERMINISTIC TEMPLATE PROJECTION (ROADMAP §S106 "la rédaction
//     du texte de l'Idea est une projection déterministe (template), jamais un résumé
//     LLM"). RenderIdeaText fills a FIXED template over the divergence record — same
//     record ⇒ byte-identical text. No summarisation, no generation, no judgment. The
//     human grilling later (S107/S65) is the only judgment; the rédaction is pure code.
//
//  4. REALITY NEVER WRITES TRUTH (CLAUDE.md §2, KRD §1099). This package writes NOTHING:
//     every function returns VALUES. The draft idea rides the S27 ideas.* capture grant;
//     the reality.ToKernel gate (REUSED) ALWAYS refuses the direct edge Incident→Kernel
//     (REALITY_CANNOT_DECLARE_TRUTH). Promotion stays idea → mirror → /goal → approval.
//
// REUSE, DON'T REINVENT (ADR 0007): the content address reuses S01/S02 records.Hash/
// Canonicalize; the incident SHAPE + the always-refused kernel edge reuse S43
// runtime/reality; the idea target is S27 ideas.Idea; the taint vocabulary is S30
// firewall.Taint. S106 ADDS only the project scope, the divergence-detection comparison,
// and the template projection — it does not fork the loop.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function is PURE and TOTAL — no DB, no
// clock, no rng, no I/O, never panics. The reproducibility mirror
// realityingest_property_test.go pins same-input ⇒ same-output for BOTH the detection
// and the rédaction.
package realityingest

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/reality"
)

// TelemetryReport is the read-only shape the telemetry-reader (S43) lands from the
// emitted app's OpenTelemetry exporter, reduced to the per-operation aggregates the
// divergence comparison needs. It is a faithful record of what production DID — never a
// hypothesis. Calls is the total invocations of the operation in the window; Errors the
// count that failed (the error-rate numerator); P99Ms the observed p99 latency.
type TelemetryReport struct {
	// Operation is the prod operation/journey the report aggregates (e.g. "createOrder").
	Operation string `json:"operation"`
	// Calls is the total invocations observed in the window (the error-rate denominator).
	Calls int `json:"calls"`
	// Errors is the count of failed invocations (the error-rate numerator).
	Errors int `json:"errors"`
	// P99Ms is the observed p99 latency in milliseconds (0 when unmeasured).
	P99Ms int `json:"p99_ms"`
}

// ErrorRate returns the observed error rate in [0,1]. Zero calls ⇒ 0 (no traffic, no
// divergence). Pure.
func (r TelemetryReport) ErrorRate() float64 {
	if r.Calls <= 0 {
		return 0
	}
	return float64(r.Errors) / float64(r.Calls)
}

// MirrorExpectation is the mirror's PROMISE about the operation in production — the
// fixed bar the divergence comparison checks the telemetry against. It is the mirror's
// truth (above the wall), not invented here: this package only READS it to compare. A
// zero MaxP99Ms means "p99 is not part of this mirror's promise" (latency not checked).
type MirrorExpectation struct {
	// MirrorRef is the mirror this expectation reflects (e.g. "createOrder-succeeds"),
	// carried VERBATIM into the divergence record and the idea provenance reasoning.
	MirrorRef string `json:"mirror_ref"`
	// Operation is the operation the mirror promises about (must match the report).
	Operation string `json:"operation"`
	// MaxErrorRate is the highest error rate the mirror tolerates, in [0,1]. The mirror
	// "createOrder succeeds" promises 0; a tolerant mirror may promise e.g. 0.01.
	MaxErrorRate float64 `json:"max_error_rate"`
	// MaxP99Ms is the highest p99 latency the mirror tolerates, in ms. Zero ⇒ unchecked.
	MaxP99Ms int `json:"max_p99_ms"`
}

// DivergenceKind names which promise the prod telemetry broke. It is a closed enum — the
// template projection switches over it; an unknown kind is never produced.
type DivergenceKind string

const (
	// DivergenceErrorRate — the observed error rate exceeded the mirror's MaxErrorRate.
	DivergenceErrorRate DivergenceKind = "error_rate"
	// DivergenceLatency — the observed p99 exceeded the mirror's MaxP99Ms.
	DivergenceLatency DivergenceKind = "latency"
)

// Divergence is the project-scoped RECORD of one way production disagreed with a mirror
// (S106). It is REALITY (KRD §67) — a faithful record of the gap, never an asserted
// truth and never a falsifiable assertion. It carries the project scope, the operation,
// the kind, the OBSERVED value and the EXPECTED bar (both verbatim), and the mirror it
// reflects. The id is the content hash of the canonical body (S01/S02, project-scoped).
type Divergence struct {
	// ID is the SHA-256 hex content hash of the canonical body (project-scoped, S01/S02).
	ID string `json:"id"`
	// ProjectID scopes the divergence to one deployed app (multi-tenant, S55). It is part
	// of the content address — two projects' identical divergences never collapse.
	ProjectID string `json:"project_id"`
	// Operation is the prod operation that diverged.
	Operation string `json:"operation"`
	// Kind is which promise broke (error_rate | latency).
	Kind DivergenceKind `json:"kind"`
	// MirrorRef is the mirror whose promise prod broke (carried verbatim).
	MirrorRef string `json:"mirror_ref"`
	// Observed is the value production exhibited (an error rate in [0,1] for error_rate, a
	// p99 in ms for latency). Verbatim — never rounded into a paraphrase.
	Observed float64 `json:"observed"`
	// Expected is the mirror's bar (MaxErrorRate for error_rate, MaxP99Ms for latency).
	Expected float64 `json:"expected"`
	// Calls is the traffic the divergence was observed over (the evidence weight).
	Calls int `json:"calls"`
}

// canonicalDivergence is the content-addressed JSONB shape of a divergence. There is — by
// construction — NO "version" key and NO "mirror" key (a divergence PROPOSES a mirror; it
// is not one). The ID is excluded (the id IS the address). ProjectID is INCLUDED.
type canonicalDivergence struct {
	Kind      string         `json:"kind"` // "divergence" — namespaces the hash
	ProjectID string         `json:"project_id"`
	Operation string         `json:"operation"`
	DivKind   DivergenceKind `json:"div_kind"`
	MirrorRef string         `json:"mirror_ref"`
	Observed  float64        `json:"observed"`
	Expected  float64        `json:"expected"`
	Calls     int            `json:"calls"`
}

// CanonicalBody returns the canonical JSON bytes whose hash is the divergence id. It
// REUSES records.Canonicalize (key-sorted, deterministic) — never a forked hashing path.
func (d Divergence) CanonicalBody() ([]byte, error) {
	raw, err := json.Marshal(canonicalDivergence{
		Kind:      "divergence",
		ProjectID: d.ProjectID,
		Operation: d.Operation,
		DivKind:   d.Kind,
		MirrorRef: d.MirrorRef,
		Observed:  d.Observed,
		Expected:  d.Expected,
		Calls:     d.Calls,
	})
	if err != nil {
		return nil, fmt.Errorf("realityingest: marshal canonical body: %w", err)
	}
	return records.Canonicalize(raw)
}

// DetectDivergence is the DETERMINISTIC divergence detector (ROADMAP §S106 "détection de
// divergence = code"). It compares a telemetry-reader report for a project against a
// mirror's expectation and returns the divergence RECORD when prod broke a promise, or
// nil when prod is within bounds. It is a pure numeric comparison — NEVER an LLM.
//
// The comparison order is fixed (error-rate first, then latency) so the result is
// byte-stable; the FIRST broken promise is reported (a single divergence per call — a
// further promise breach is a further report). A report whose Operation does not match
// the expectation yields nil (the expectation does not govern that operation). Pure.
func DetectDivergence(projectID string, report TelemetryReport, exp MirrorExpectation) (*Divergence, error) {
	if report.Operation == "" || report.Operation != exp.Operation {
		return nil, nil // the mirror's promise does not govern this report
	}
	// Promise 1 — error rate. Strictly EXCEEDING the bar is a divergence (== is within).
	if rate := report.ErrorRate(); rate > exp.MaxErrorRate {
		return finalize(Divergence{
			ProjectID: projectID,
			Operation: report.Operation,
			Kind:      DivergenceErrorRate,
			MirrorRef: exp.MirrorRef,
			Observed:  rate,
			Expected:  exp.MaxErrorRate,
			Calls:     report.Calls,
		})
	}
	// Promise 2 — p99 latency (only when the mirror promises it, MaxP99Ms > 0).
	if exp.MaxP99Ms > 0 && report.P99Ms > exp.MaxP99Ms {
		return finalize(Divergence{
			ProjectID: projectID,
			Operation: report.Operation,
			Kind:      DivergenceLatency,
			MirrorRef: exp.MirrorRef,
			Observed:  float64(report.P99Ms),
			Expected:  float64(exp.MaxP99Ms),
			Calls:     report.Calls,
		})
	}
	return nil, nil // prod is within the mirror's promise — no divergence
}

// finalize content-addresses a divergence (sets ID from the canonical body). Pure.
func finalize(d Divergence) (*Divergence, error) {
	canon, err := d.CanonicalBody()
	if err != nil {
		return nil, err
	}
	d.ID = records.Hash(canon)
	return &d, nil
}

// RealityMirrorRecord is the project-scoped RealityMirror (S106) the loop persists below
// the wall: the divergence reflected as a reality record with provenance=incident and the
// incident_derived taint. It REUSES the S43 reality.Incident shape (so the two loops never
// diverge) and ADDS the project scope + the divergence it was built from. It carries NO
// version and NO mirror — it is reality, not truth.
type RealityMirrorRecord struct {
	// ProjectID scopes the record to one deployed app (multi-tenant, S55).
	ProjectID string `json:"project_id"`
	// Divergence is the deterministic divergence this record reflects.
	Divergence Divergence `json:"divergence"`
	// Incident is the S43 reality.Incident shape the divergence was OBSERVED as (content-
	// addressed, taint incident_derived, no version/mirror). Its Ref is the divergence id.
	Incident reality.Incident `json:"incident"`
}

// ToRealityMirror reflects a divergence as a project-scoped RealityMirror record via the
// S43 reality.Observe (REUSED — the incident SHAPE, taint and content-addressing are not
// re-implemented). The incident's Ref is the divergence id (the human-traceable reference);
// its Signal carries the operation + the rendered observed/expected as the verbatim error;
// its CauseSketch is the template-rendered text (a HYPOTHESIS, never a truth). provenance is
// incident (S106 done-criterion). Pure: same divergence ⇒ same record (same incident id).
func ToRealityMirror(div Divergence) (RealityMirrorRecord, error) {
	inc, err := reality.Observe(reality.ObserveInput{
		Ref: div.ID,
		Signal: reality.Signal{
			Operation:  div.Operation,
			Error:      renderObservedVsExpected(div),
			Recurrence: div.Calls,
		},
		CauseSketch:    RenderIdeaText(div),
		Taint:          []firewall.Taint{firewall.TaintIncidentDerived},
		LinkedBranches: []string{},
	})
	if err != nil {
		return RealityMirrorRecord{}, fmt.Errorf("realityingest: to reality mirror: %w", err)
	}
	return RealityMirrorRecord{
		ProjectID:  div.ProjectID,
		Divergence: div,
		Incident:   inc,
	}, nil
}

// RenderIdeaText is THE deterministic TEMPLATE projection (ROADMAP §S106: "la rédaction du
// texte de l'Idea est une projection déterministe (template), jamais un résumé LLM"). It
// fills a FIXED template over the divergence record — same record ⇒ byte-identical text.
// There is no summarisation, no generation and no judgment: it is a pure string projection,
// the reproducibility mirror pins it. The text NAMES the gap (mirror, operation, observed
// vs expected, traffic) so the human grilling it later (S107/S65) has the facts verbatim.
func RenderIdeaText(div Divergence) string {
	switch div.Kind {
	case DivergenceErrorRate:
		return fmt.Sprintf(
			"Production diverged from mirror %q in project %q: operation %q observed an error rate of %s over %d calls, "+
				"but the mirror promises at most %s. The kernel is incomplete by omission — a case prod hit that no fixture covered. "+
				"Propose a mirror that covers this failure mode (human grills, then /goal decides).",
			div.MirrorRef, div.ProjectID, div.Operation,
			formatRate(div.Observed), div.Calls, formatRate(div.Expected))
	case DivergenceLatency:
		return fmt.Sprintf(
			"Production diverged from mirror %q in project %q: operation %q observed a p99 latency of %s over %d calls, "+
				"but the mirror promises at most %s. The kernel is incomplete by omission — a case prod hit that no fixture covered. "+
				"Propose a mirror that covers this failure mode (human grills, then /goal decides).",
			div.MirrorRef, div.ProjectID, div.Operation,
			formatMs(div.Observed), div.Calls, formatMs(div.Expected))
	default:
		// Unreachable for a divergence produced by DetectDivergence (closed enum). Kept total.
		return fmt.Sprintf(
			"Production diverged from mirror %q in project %q on operation %q (observed %v vs expected %v over %d calls).",
			div.MirrorRef, div.ProjectID, div.Operation, div.Observed, div.Expected, div.Calls)
	}
}

// renderObservedVsExpected is the short verbatim "observed vs expected" the incident Signal
// carries (e.g. "error rate 30.0% > 0.0%"). Deterministic. Pure.
func renderObservedVsExpected(div Divergence) string {
	switch div.Kind {
	case DivergenceErrorRate:
		return fmt.Sprintf("error rate %s > %s", formatRate(div.Observed), formatRate(div.Expected))
	case DivergenceLatency:
		return fmt.Sprintf("p99 %s > %s", formatMs(div.Observed), formatMs(div.Expected))
	default:
		return fmt.Sprintf("%v > %v", div.Observed, div.Expected)
	}
}

// formatRate renders a rate in [0,1] as a fixed one-decimal percentage ("30.0%"). The
// fixed precision keeps the text byte-stable across runs. Pure.
func formatRate(r float64) string { return fmt.Sprintf("%.1f%%", r*100) }

// formatMs renders a millisecond value as a fixed integer-ms string ("1800ms"). Pure.
func formatMs(ms float64) string { return fmt.Sprintf("%.0fms", ms) }

// ToDraftIdea is the OUTWARD edge of S106: it projects a RealityMirror record into the
// SHAPE of an S27 DRAFT idea — provenance=incident (Detail = the divergence id verbatim),
// intent = the TEMPLATE-rendered text (RenderIdeaText, never an LLM summary), proposes
// inferred ONLY when the signal pins it (REUSING reality.InferProposes; else left UNSET
// with an OpenQuestion, never guessed, §8). The idea is content-addressed (S27 scheme). It
// carries no version and no mirror — it must STILL acquire its mirror via /goal. NO kernel
// write occurs (WroteKernel == false). Pure: same record ⇒ same draft (same idea id).
func ToDraftIdea(rec RealityMirrorRecord) (DraftFromDivergence, error) {
	proposes, pinned := reality.InferProposes(rec.Incident.Signal)
	draft := ideas.Idea{
		Proposes: proposes, // unset ("") when unpinned — never guessed
		Intent:   RenderIdeaText(rec.Divergence),
		Provenance: ideas.Provenance{
			Source: ideas.ProvenanceIncident,
			Detail: rec.Divergence.ID, // the divergence reference, verbatim
		},
		Status: ideas.StatusDraft,
	}
	hashed, err := ideas.Hashed(draft)
	if err != nil {
		return DraftFromDivergence{}, fmt.Errorf("realityingest: to draft idea: %w", err)
	}
	out := DraftFromDivergence{
		ProjectID:      rec.ProjectID,
		Divergence:     rec.Divergence,
		Idea:           hashed,
		ProposesPinned: pinned,
		WroteKernel:    false,
		// Re-assert the wall: the direct edge Reality→Kernel is ALWAYS refused (REUSED gate).
		ToKernelRefusal: reality.ToKernel(rec.Incident),
	}
	if !pinned {
		out.OpenQuestion = fmt.Sprintf(
			"OQ: the divergence for operation %q in project %q does not pin a `proposes` kind — left unset (not guessed). "+
				"The human decides the targeted layer when writing the mirror at /goal.",
			rec.Divergence.Operation, rec.ProjectID)
	}
	return out, nil
}

// DraftFromDivergence is the typed result of the S106 ingestion: the project-scoped DRAFT
// idea a production divergence sketched, plus the divergence it reflects and the explicit
// no-kernel-write / always-refused-direct-edge proofs. It is a VALUE — ToDraftIdea writes
// nothing.
type DraftFromDivergence struct {
	// ProjectID scopes the draft to the deployed app it came from.
	ProjectID string `json:"project_id"`
	// Divergence is the deterministic divergence record the draft reflects.
	Divergence Divergence `json:"divergence"`
	// Idea is the DRAFT candidate-truth (Status=draft); its Intent is the template-rendered
	// text. It carries no version and no mirror; it must STILL acquire its mirror via /goal.
	Idea ideas.Idea `json:"idea"`
	// ProposesPinned / OpenQuestion mirror reality.Learn's honesty: when the signal does not
	// pin a `proposes` kind, ProposesPinned is false and OpenQuestion carries the uncertainty.
	ProposesPinned bool   `json:"proposes_pinned"`
	OpenQuestion   string `json:"open_question,omitempty"`
	// WroteKernel is ALWAYS false — the ingestion performs no kernel write.
	WroteKernel bool `json:"wrote_kernel"`
	// ToKernelRefusal is the reality.ToKernel refusal re-asserted: REALITY_CANNOT_DECLARE_TRUTH
	// — the direct edge Reality→Kernel is ALWAYS refused. Non-nil.
	ToKernelRefusal *blockreason.BlockReason `json:"to_kernel_refusal,omitempty"`
}

// Ingest is the S106 PIPELINE end-to-end: detect the divergence (deterministic comparison),
// reflect it as a project-scoped RealityMirror, and project it into a DRAFT idea whose text
// is the template rendering. It returns (nil, nil) when prod is within the mirror's promise
// (no divergence ⇒ no idea invented). PURE, TOTAL: same project + report + expectation ⇒
// same draft; no clock, no rng, no I/O, no LLM, no kernel write.
func Ingest(projectID string, report TelemetryReport, exp MirrorExpectation) (*DraftFromDivergence, error) {
	div, err := DetectDivergence(projectID, report, exp)
	if err != nil {
		return nil, err
	}
	if div == nil {
		return nil, nil // prod within bounds — nothing to learn
	}
	rec, err := ToRealityMirror(*div)
	if err != nil {
		return nil, err
	}
	draft, err := ToDraftIdea(rec)
	if err != nil {
		return nil, err
	}
	return &draft, nil
}

// IngestBatch detects divergences across many reports against their expectations (one
// expectation per report, same index) and returns the draft ideas, SORTED by idea id for a
// byte-stable, deterministic batch. Reports within bounds contribute nothing. Pure.
func IngestBatch(projectID string, reports []TelemetryReport, exps []MirrorExpectation) ([]DraftFromDivergence, error) {
	if len(reports) != len(exps) {
		return nil, fmt.Errorf("realityingest: ingest batch: %d reports vs %d expectations", len(reports), len(exps))
	}
	var out []DraftFromDivergence
	for i := range reports {
		draft, err := Ingest(projectID, reports[i], exps[i])
		if err != nil {
			return nil, err
		}
		if draft != nil {
			out = append(out, *draft)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Idea.ID < out[j].Idea.ID })
	return out, nil
}
