// Package derivedoc implements FK06 (ROADMAP-fke, FKE-1.3 décision (a)): the pure
// emitter DeriveDoc(kernel) → s9 — the doc DERIVED from the code, the LOWER HALF of
// the doc-mirror, structured so FK07 can run a STRUCTURAL set-comparison against s2
// (the human-authored upper half).
//
// THE DOC-MIRROR (FKE-1.3). KRD's 1-for-1 anatomy pairs a human-authored doc (s2) with
// a code-derived doc (s9). FK07 compares them STRUCTURALLY (concepts present/absent,
// behaviours enumerated, errors covered) — a structural divergence blocks, prose
// divergence is advisory. THIS step (FK06) builds s9: it reads the kernel ASTs
// (operations, controls, actions — their entities, events, policies, routes, error
// surfaces) and projects them into three ENUMERABLE, SORTED sections:
//
//   - Concepts  — the lexicon terms named across the layers (operation/control/action
//     names, entities, events, policies). The SET FK07 diffs against s2's concepts.
//   - Behaviors — one per operation, one per control→action→operation binding, one per
//     emitted event. The behaviours FK07 checks are documented.
//   - Errors    — the error surface (operation typed errors, the control orphan-trigger
//     guard, authorization-denied). The errors FK07 checks are covered.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8, the load-bearing done-criterion « même kernel →
// s9 byte-identique »). DeriveDoc is a PURE, TOTAL function: no clock, no rng, no map
// iteration leaking into output, no LLM. Every section is built into a sorted, deduped
// set; the bytes are records.Canonicalize'd JSON; the hash is records.Hash of those
// bytes (content-addressed, parity with the truth-store). Same kernel ⇒ identical bytes
// AND invariant under input ordering (the emitter canonicalizes, it does not echo). The
// reproducibility mirror is derivedoc_property_test.go.
//
// THE WALL (CLAUDE.md §2). DeriveDoc READS kernel ASTs and writes NOTHING — s9 is a
// projection (below the waterline), regenerable, never a truth. It is materialized by
// the aidos CLI / the FK07 doc-mirror runner, never hand-edited. This package adds a
// new artifact (the s9 emitter); it shifts no prior contract (anti-overwrite §9).
//
// REUSE, DON'T REINVENT (ADR 0007). The canonical JSON + hash reuse kernel/records; the
// ASTs are read verbatim from kernel/{operation,control,action}. Only the N→s9
// projection (the lexicon/behaviour/error extraction) is ours.
package derivedoc

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Kernel is the input bundle DeriveDoc reads — the slice of ASTs that make up one
// content-addressed kernel cell. It is a READ-ONLY value (the emitter never mutates it).
// The fields are the AST sources the s9 lower-half is derived from (FKE-1.3 décision (a):
// operations, controls, routes/bindings, test names, errors). Routes/bindings are read
// from the control→action→operation links; test names are derived as behaviour IDs.
type Kernel struct {
	// KernelID identifies the cell the doc is derived for (carried through to s9 so the
	// doc-mirror can pair s9 with the right s2).
	KernelID string
	// Operations are the N2 workflow ASTs (their entities, events, policies, errors).
	Operations []operation.Operation
	// Controls are the button-as-source ASTs (their triggers — the control→action link).
	Controls []control.Control
	// Actions are the action ASTs (their on-control, invoked operation, effects).
	Actions []action.Action
}

// Behavior is one enumerable behaviour in s9: an ID FK07 matches against s2's documented
// behaviours, plus a human-facing Description (prose — advisory in FK07, never the judge).
type Behavior struct {
	// ID is the stable, comparable key (e.g. "operation:createOrder",
	// "binding:checkout-button->checkout-submit->createOrder", "emit:createOrder:OrderCreated").
	ID string `json:"id"`
	// Description is the prose rendering — FK07 treats prose as advisory.
	Description string `json:"description"`
}

// S9 is the derived doc (the lower half of the doc-mirror), structured for FK07's
// structural set-comparison. All three sections are SORTED + DEDUPED sets.
type S9 struct {
	// KernelID pairs this s9 with its kernel/s2.
	KernelID string `json:"kernel_id"`
	// Concepts is the sorted lexicon set (kind-prefixed terms: operation:/control:/
	// action:/entity:/event:/policy:).
	Concepts []string `json:"concepts"`
	// Behaviors is the sorted behaviour list (by ID).
	Behaviors []Behavior `json:"behaviors"`
	// Errors is the sorted error-surface set.
	Errors []string `json:"errors"`
}

// Derived is the emitter result: the structured S9, its canonical bytes (the byte-identity
// surface of the done-criterion), and its content hash (parity with records.Hash).
type Derived struct {
	S9    S9
	Bytes []byte
	Hash  string
}

// DeriveDoc projects a Kernel into its s9 (FK06). PURE + TOTAL + deterministic: same
// kernel ⇒ byte-identical Bytes (and invariant under input ordering). Never errors —
// a malformed AST simply contributes nothing it cannot name.
func DeriveDoc(k Kernel) Derived {
	concepts := newSet()
	errs := newSet()
	// descByID collects, per behaviour ID, the deterministic description. A bundle MAY
	// carry two ASTs that collide on name with differing bodies (the kernel dedupes by
	// content-hash, a derived bundle need not). Rather than "first/last write wins"
	// (which would leak the caller's slice order into s9, breaking the byte-identity
	// property), a collision keeps the lexicographically SMALLEST description — a total,
	// order-independent rule. The behaviour list is rebuilt sorted-by-ID at the end.
	descByID := map[string]string{}

	addBehavior := func(id, desc string) {
		if prev, ok := descByID[id]; !ok || desc < prev {
			descByID[id] = desc
		}
	}

	for _, op := range k.Operations {
		if op.Name == "" {
			continue
		}
		concepts.add("operation:" + op.Name)
		addBehavior("operation:"+op.Name,
			fmt.Sprintf("L'opération %q transforme %q.", op.Name, op.Input))

		// Errors: every operation that authorizes can deny (the §93 boundary law).
		// Every operation may surface the unknown-step-kind guard, but only authorize
		// is a behaviour-visible error; we derive the error surface from its steps.
		for _, st := range op.Steps {
			switch s := st.(type) {
			case operation.AuthorizeStep:
				errs.add("operation:" + op.Name + ":ErrAuthorizationDenied")
				if s.Policy != "" {
					concepts.add("policy:" + s.Policy)
				}
			case operation.ReadStep:
				if s.Entity != "" {
					concepts.add("entity:" + s.Entity)
				}
			case operation.MutateStep:
				if s.Entity != "" {
					concepts.add("entity:" + s.Entity)
				}
			}
		}

		// Behaviors + concepts: the declared emitted events.
		for _, ev := range op.Emits {
			if ev == "" {
				continue
			}
			concepts.add("event:" + ev)
			addBehavior("emit:"+op.Name+":"+ev,
				fmt.Sprintf("L'opération %q émet l'événement %q.", op.Name, ev))
		}
	}

	// Index actions by name so a control's trigger resolves to its invoked operation
	// (the route/binding the doc must enumerate). A bundle MAY carry two actions under
	// the same name (the kernel dedupes by content-hash, but a derived bundle need not):
	// we resolve the collision DETERMINISTICALLY — the index keeps the action with the
	// lexicographically smallest (Invoke, On.Control) so DeriveDoc is invariant under
	// input ordering (the byte-identity property), not "last write wins" (order-leaking).
	actByName := map[string]action.Action{}
	for _, a := range k.Actions {
		if a.Name == "" {
			continue
		}
		concepts.add("action:" + a.Name)
		if a.Invoke != "" {
			concepts.add("operation:" + a.Invoke)
		}
		if prev, ok := actByName[a.Name]; !ok || actLess(a, prev) {
			actByName[a.Name] = a
		}
	}

	for _, c := range k.Controls {
		if c.Name == "" {
			continue
		}
		concepts.add("control:" + c.Name)
		// A control's trigger that does not resolve is the orphan-trigger guard — the
		// error surface the control layer enforces (control.ErrOrphanTrigger).
		errs.add("control:" + c.Name + ":ErrOrphanTrigger")

		if c.Triggers == "" {
			continue
		}
		act, ok := actByName[c.Triggers]
		if !ok {
			// Trigger names an action absent from the bundle — still enumerate the
			// partial binding so FK07 can flag the missing link structurally.
			addBehavior("binding:"+c.Name+"->"+c.Triggers,
				fmt.Sprintf("Le contrôle %q déclenche l'action %q.", c.Name, c.Triggers))
			continue
		}
		id := "binding:" + c.Name + "->" + act.Name
		desc := fmt.Sprintf("Le contrôle %q déclenche l'action %q", c.Name, act.Name)
		if act.Invoke != "" {
			id += "->" + act.Invoke
			desc += fmt.Sprintf(" qui invoque l'opération %q", act.Invoke)
		}
		addBehavior(id, desc+".")
	}

	doc := S9{
		KernelID:  k.KernelID,
		Concepts:  concepts.sorted(),
		Behaviors: behaviorsFrom(descByID),
		Errors:    errs.sorted(),
	}

	// json.Marshal then records.Canonicalize: the canonical, key-sorted byte form FK07
	// compares and the truth-store addresses by. Marshal of S9 never errors (no funcs,
	// no channels); Canonicalize never errors on valid JSON.
	raw, err := json.Marshal(doc)
	if err != nil { // unreachable for S9; total-function guard.
		panic(fmt.Sprintf("derivedoc: marshal s9: %v", err))
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		panic(fmt.Sprintf("derivedoc: canonicalize s9: %v", err))
	}
	return Derived{S9: doc, Bytes: canon, Hash: records.Hash(canon)}
}

// actLess is the deterministic tie-break for two actions sharing a name: compare by
// Invoke then by the on-control, so the index is independent of input slice order.
func actLess(a, b action.Action) bool {
	if a.Invoke != b.Invoke {
		return a.Invoke < b.Invoke
	}
	return a.On.Control < b.On.Control
}

// behaviorsFrom rebuilds the behaviour list from the per-ID description map, sorted by
// ID — the order-independent, comparable form FK07 diffs on.
func behaviorsFrom(descByID map[string]string) []Behavior {
	ids := make([]string, 0, len(descByID))
	for id := range descByID {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	out := make([]Behavior, len(ids))
	for i, id := range ids {
		out[i] = Behavior{ID: id, Description: descByID[id]}
	}
	return out
}

// set is a small string set with a sorted accessor — the canonicalizing primitive that
// makes every s9 section order-invariant (the byte-identity property).
type set map[string]struct{}

func newSet() set { return set{} }

func (s set) add(v string) { s[v] = struct{}{} }

func (s set) sorted() []string {
	out := make([]string, 0, len(s))
	for v := range s {
		out = append(out, v)
	}
	sort.Strings(out)
	return out
}
