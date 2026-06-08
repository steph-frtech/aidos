package dsleditor

// parse_operation.go — the TYPED OPERATION editor parser (S77, reusing the S10/S73
// Operation contract). The editor's operation body is a STRUCTURED FORM: an ordered
// list of typed steps (validate/authorize/read/mutate/branch/return) plus an optional
// async block (cron/queue/webhook_out/notification + effects). It is NOT a code string
// — each step is a typed wire node whose `kind` is one of the SIX closed verbs (and the
// async block's trigger is one of the FOUR closed kinds). An unknown verb/kind is a
// TYPED error, never a guess.
//
// We parse here (not in the operation package) so we do not edit another step's code
// (S10 owns operation.Operation; this consumes it). The result is the SAME
// operation.Operation / operation.Async the frozen interpreter (S10/S73) walks — never
// a fork. PURE + TOTAL.

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// operationWire is the typed wire shape of an operation editor doc.
type operationWire struct {
	Name  string     `json:"name"`
	Input string     `json:"input"`
	Steps []stepWire `json:"steps"`
	Emits []string   `json:"emits"`
	Async *asyncWire `json:"async,omitempty"`
}

// stepWire is one typed step node. Only the fields the verb uses are read.
type stepWire struct {
	Kind   string         `json:"kind"`
	Schema string         `json:"schema,omitempty"` // validate
	Policy string         `json:"policy,omitempty"` // authorize
	Entity string         `json:"entity,omitempty"` // read / mutate
	Where  map[string]any `json:"where,omitempty"`  // read / mutate(clear)
	As     string         `json:"as,omitempty"`     // read / mutate(create)
	Op     string         `json:"op,omitempty"`     // mutate: create | clear
	Data   map[string]any `json:"data,omitempty"`   // mutate(create)
	Cond   string         `json:"cond,omitempty"`   // branch
	Ref    string         `json:"ref,omitempty"`    // return
}

type asyncWire struct {
	Trigger struct {
		Kind string `json:"kind"`
		At   string `json:"at,omitempty"`
	} `json:"trigger"`
	Effects []struct {
		Kind    string         `json:"kind"`
		Target  string         `json:"target"`
		Payload map[string]any `json:"payload,omitempty"`
	} `json:"effects,omitempty"`
}

// parseOperationDoc decodes a typed operation editor body into an operation.Operation
// (+ optional async) AST. It rejects an unknown verb, an unknown mutate op, and an
// unknown async trigger/effect kind — wrapping ErrBadBody. PURE + TOTAL.
func parseOperationDoc(d DslDoc) (Parsed, error) {
	var w operationWire
	dec := json.NewDecoder(bytes.NewReader(d.Body))
	dec.UseNumber()
	if err := dec.Decode(&w); err != nil {
		return Parsed{}, fmt.Errorf("%w: %v", ErrBadBody, err)
	}
	steps := make([]operation.Step, 0, len(w.Steps))
	for i, sw := range w.Steps {
		st, err := parseStep(sw)
		if err != nil {
			return Parsed{}, fmt.Errorf("%w: step %d: %v", ErrBadBody, i, err)
		}
		steps = append(steps, st)
	}
	op := operation.Operation{
		Name:  d.Name,
		Input: w.Input,
		Steps: steps,
		Emits: w.Emits,
	}
	var async *operation.Async
	if w.Async != nil {
		a, err := parseAsync(*w.Async)
		if err != nil {
			return Parsed{}, fmt.Errorf("%w: async: %v", ErrBadBody, err)
		}
		if verr := operation.ValidateAsync(a); verr != nil {
			return Parsed{}, fmt.Errorf("%w: async: %v", ErrBadBody, verr)
		}
		async = &a
	}
	canon, err := canonicalise(w)
	if err != nil {
		return Parsed{}, fmt.Errorf("%w: canonicalise: %v", ErrBadBody, err)
	}
	return Parsed{Kind: KindOperation, Name: d.Name, Canonical: canon, Operation: &op, Async: async}, nil
}

// parseStep turns one typed step wire into its operation.Step node. An unknown verb is
// a typed error (the closed grammar — no invented verb). PURE.
func parseStep(sw stepWire) (operation.Step, error) {
	if !operation.IsStepKind(sw.Kind) {
		return nil, fmt.Errorf("unknown step verb %q (closed grammar)", sw.Kind)
	}
	switch operation.StepKind(sw.Kind) {
	case operation.KindValidate:
		return operation.ValidateStep{Schema: sw.Schema}, nil
	case operation.KindAuthorize:
		return operation.AuthorizeStep{Policy: sw.Policy}, nil
	case operation.KindRead:
		return operation.ReadStep{Entity: sw.Entity, Where: sw.Where, As: sw.As}, nil
	case operation.KindMutate:
		op := operation.MutateOp(sw.Op)
		if op != operation.MutateCreate && op != operation.MutateClear {
			return nil, fmt.Errorf("unknown mutate op %q (create|clear)", sw.Op)
		}
		return operation.MutateStep{Entity: sw.Entity, Op: op, Data: sw.Data, Where: sw.Where, As: sw.As}, nil
	case operation.KindBranch:
		return operation.BranchStep{Cond: sw.Cond}, nil
	case operation.KindReturn:
		return operation.ReturnStep{Ref: sw.Ref}, nil
	default:
		return nil, fmt.Errorf("unknown step verb %q", sw.Kind)
	}
}

// parseAsync turns the typed async wire into an operation.Async block. PURE.
func parseAsync(aw asyncWire) (operation.Async, error) {
	a := operation.Async{
		Trigger: operation.AsyncTrigger{
			Kind: operation.TriggerKind(aw.Trigger.Kind),
			At:   aw.Trigger.At,
		},
	}
	for _, ew := range aw.Effects {
		a.Effects = append(a.Effects, operation.Effect{
			Kind:    operation.TriggerKind(ew.Kind),
			Target:  ew.Target,
			Payload: ew.Payload,
		})
	}
	return a, nil
}
