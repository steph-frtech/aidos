// Package agentrun records the RUNTIME events of an agent execution. A run is NOT a
// layer (the CoucheAgent in back/kernel/agentlayer is the layer); it is what happened
// when the layer ran ONCE. These events are append-only telemetry BELOW the
// waterline — not truth, not versioned, not frozen. By construction the AgentRun type
// carries NO version and NO mirror field: a run is unrepresentable as a layer.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Record and ApplyWall are pure, total functions
// — no clock (timestamps are SUPPLIED, never read), no rng, no I/O. Record computes a
// content-addressed id via the S01/S02 scheme (records.Canonicalize + records.Hash,
// REUSED not forked); same input run ⇒ same id. ApplyWall stamps the wall verdict via
// the S04 waterline predicate (reused through agentlayer.MayWrite). The reproducibility
// mirror (agentrun_property_test.go) pins both.
package agentrun

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Result is the closed outcome of a run. A run ends in exactly one of these.
type Result string

const (
	ResultGreen     Result = "green"
	ResultStillRed  Result = "still_red"
	ResultBlocked   Result = "blocked"
	ResultAbandoned Result = "abandoned"
)

var resultOrder = []Result{ResultGreen, ResultStillRed, ResultBlocked, ResultAbandoned}

// Results returns the four closed run results in canonical order.
func Results() []Result {
	out := make([]Result, len(resultOrder))
	copy(out, resultOrder)
	return out
}

// IsKnownResult reports whether r is one of the four closed results.
func IsKnownResult(r Result) bool {
	for _, rr := range resultOrder {
		if rr == r {
			return true
		}
	}
	return false
}

// ActionType is the closed kind of an attempted action inside a run.
type ActionType string

const (
	ActionRead      ActionType = "read"
	ActionWrite     ActionType = "write"
	ActionPropose   ActionType = "propose"
	ActionRunMirror ActionType = "run_mirror"
)

// AgentAction is one attempted action inside a run. Autorisee is the wall verdict;
// RaisonBlocage carries the S13 BlockReason when refused.
type AgentAction struct {
	Type          ActionType               `json:"type"`                     // read | write | propose | run_mirror
	Cible         string                   `json:"cible"`                    // the target (schema/path/op)
	Avant         json.RawMessage          `json:"avant,omitempty"`          // state before (below-line writes only)
	Apres         json.RawMessage          `json:"apres,omitempty"`          // state after
	Autorisee     bool                     `json:"autorisee"`                // allowed by the wall?
	RaisonBlocage *blockreason.BlockReason `json:"raison_blocage,omitempty"` // why refused (S13)
}

// AgentRun is one execution of a CoucheAgent against a red work item. BELOW the line.
// It carries NO Version field and NO Mirror field — a run is NOT a layer/truth and the
// type makes that unrepresentable (the property mirror pins it).
type AgentRun struct {
	ID          string        `json:"id"`            // content-hash of the run body (S01/S02 scheme)
	Agent       string        `json:"agent"`         // the CoucheAgent @version that ran
	Goal        string        `json:"goal"`          // the /goal it served (S29)
	RedWorkItem string        `json:"red_work_item"` // the red set item it worked
	ContextPack string        `json:"context_pack"`  // the ContextPack it was given (S30/firewall-gated)
	Actions     []AgentAction `json:"actions"`
	Result      Result        `json:"result"`     // green | still_red | blocked | abandoned
	StartedAt   string        `json:"started_at"` // RFC3339, SUPPLIED (no arg-less clock)
	EndedAt     string        `json:"ended_at"`   // RFC3339, SUPPLIED

	// ── BA26 — the REPLAY extension (gap A2; supersede-via-version, anti-overwrite §9) ──
	// These three fields widen the content-address into a NEW @version of the run body.
	// They are append-only additive: a run recorded WITHOUT them (a legacy run) hashes
	// EXACTLY as before (canonicalBody omits an empty replay field), so the legacy hash is
	// never mutated in passing — LegacyID reconstructs that pre-BA26 body byte-for-byte.
	// `omitempty` is load-bearing: it keeps the legacy JSON shape and the legacy hash stable.
	Impl               string `json:"impl,omitempty"`                // content-hash of the AgentImplementation (agentimpl.Hash)
	Seed               string `json:"seed,omitempty"`                // declared (BA01) or derived Hash(impl‖pack‖item) — what replay re-injects
	ProviderTranscript string `json:"provider_transcript,omitempty"` // ref to the (redacted, BA28) provider transcript replay re-feeds
}

// AgentAssignment leases a red work item to an agent for a bounded window. BELOW the
// line; not a layer.
type AgentAssignment struct {
	Agent       string `json:"agent"` // the CoucheAgent @version
	RedWorkItem string `json:"red_work_item"`
	LeaseJusqua string `json:"lease_jusqua"` // RFC3339, SUPPLIED
	Statut      string `json:"statut"`       // leased | running | released | expired
}

// AssignmentStatus closed enum.
const (
	AssignmentLeased   = "leased"
	AssignmentRunning  = "running"
	AssignmentReleased = "released"
	AssignmentExpired  = "expired"
)

// ApplyWall stamps an attempted action with the wall verdict, REUSING the S04
// waterline predicate via agentlayer.MayWrite. A write action whose Cible resolves
// above the waterline lands Autorisee=false with the S13 BlockReason
// AGENT_WRITE_ABOVE_WATERLINE — for EVERY role. Non-write actions (read / propose /
// run_mirror) and below-the-line writes are authorised. Pure, total, deterministic;
// no clock, no I/O.
func ApplyWall(action AgentAction, spec agentlayer.AgentSpec) AgentAction {
	if action.Type != ActionWrite {
		action.Autorisee = true
		action.RaisonBlocage = nil
		return action
	}
	dec := agentlayer.MayWrite(spec, action.Cible)
	action.Autorisee = dec.Allowed
	action.RaisonBlocage = dec.BlockReason
	return action
}

// canonicalBody is the deterministic JSON shape Record hashes over. It deliberately
// EXCLUDES any id (the id is the hash) and carries no version/mirror (a run is not a
// layer). Field order is irrelevant — records.Canonicalize sorts keys.
func canonicalBody(r AgentRun) ([]byte, error) {
	body := map[string]any{
		"agent":         r.Agent,
		"goal":          r.Goal,
		"red_work_item": r.RedWorkItem,
		"context_pack":  r.ContextPack,
		"actions":       r.Actions,
		"result":        string(r.Result),
		"started_at":    r.StartedAt,
		"ended_at":      r.EndedAt,
	}
	// BA26 — the replay fields enter the address ONLY when present. A legacy (seedless)
	// run omits all three, so its canonical body is byte-identical to the pre-BA26 shape
	// and its content-hash is UNCHANGED (anti-overwrite §9: the legacy hash is never
	// mutated by the extension). A replay-bearing run adds exactly the non-empty keys —
	// each one genuinely widens the content-address (the property mirror pins it).
	if r.Impl != "" {
		body["impl"] = r.Impl
	}
	if r.Seed != "" {
		body["seed"] = r.Seed
	}
	if r.ProviderTranscript != "" {
		body["provider_transcript"] = r.ProviderTranscript
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// ErrUnknownResult — Record was handed a run whose Result is out of the closed enum.
var ErrUnknownResult = fmt.Errorf("agentrun: unknown result (want green|still_red|blocked|abandoned)")

// Record is the PURE recorder of a run: it stamps the content-addressed id =
// Hash(Canonicalize(body)) over the S01/S02 scheme — DETERMINISTIC and TOTAL, with NO
// clock (StartedAt/EndedAt are supplied by the caller). The returned run carries NO
// version and NO mirror — a run is below the line, never a layer. Same input ⇒ same
// id (the property mirror pins it). Returns ErrUnknownResult on an out-of-enum result.
func Record(r AgentRun) (AgentRun, error) {
	if !IsKnownResult(r.Result) {
		return AgentRun{}, fmt.Errorf("%w: %q", ErrUnknownResult, r.Result)
	}
	canon, err := canonicalBody(r)
	if err != nil {
		return AgentRun{}, err
	}
	r.ID = records.Hash(canon)
	return r, nil
}

// ── BA26 — replay-extension helpers (deterministic, total, pure) ────────────────────

// LegacyID reconstructs the content-address a run would have had under the PRE-BA26 body
// (the eight fields the pre-extension recorder hashed), independent of any replay field on
// r. It is the proof that the extension is supersede-via-version, not a silent hash
// mutation (anti-overwrite §9): for a seedless run, Record(r).ID == LegacyID(r). Pure,
// total, no clock, no I/O.
func LegacyID(r AgentRun) string {
	body := map[string]any{
		"agent":         r.Agent,
		"goal":          r.Goal,
		"red_work_item": r.RedWorkItem,
		"context_pack":  r.ContextPack,
		"actions":       r.Actions,
		"result":        string(r.Result),
		"started_at":    r.StartedAt,
		"ended_at":      r.EndedAt,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return ""
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return ""
	}
	return records.Hash(canon)
}

// DeriveSeed derives a deterministic seed for a run from the trio (impl, pack, item) —
// the content-hash Hash(Canonicalize({impl, pack, item})) over the S01/S02 scheme, REUSED
// not forked. It is the seed a NEW run carries when the layer declared none (BA01). Pure,
// total, deterministic: same trio ⇒ same seed; a different impl/pack/item ⇒ a different
// seed (the property mirror pins it). Non-empty for any non-empty input.
func DeriveSeed(impl, pack, item string) string {
	body := map[string]any{
		"impl": impl,
		"pack": pack,
		"item": item,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return ""
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return ""
	}
	return records.Hash(canon)
}

// SeedFor returns the seed a new run carries: the DECLARED seed verbatim when the layer
// declared one (BA01), else the DERIVED seed DeriveSeed(impl, pack, item). This is the
// single source of "what seed does this run get?" — declared-wins, derive-as-fallback.
// Pure, total, deterministic.
func SeedFor(declared, impl, pack, item string) string {
	if declared != "" {
		return declared
	}
	return DeriveSeed(impl, pack, item)
}
