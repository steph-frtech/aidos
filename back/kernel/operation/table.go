package operation

import "fmt"

// stepResult is what one step evaluator returns: the ordered events it emitted (if
// any) and a `done` flag set by the return verb to stop the walk. A step that binds
// a slot mutates the shared State in place; a step that emits returns its events to
// be appended in step order.
type stepResult struct {
	events []string
	done   bool
}

// evaluator is the type of a step verb's evaluator: it runs one Step against the
// State through the Deps seams. This is the value in the dispatch table — verbs are
// DATA, not a switch scattered across files (ADR 0007 table-driven).
type evaluator func(step Step, state *State, deps Deps) (stepResult, error)

// stepTable maps each verb to its evaluator. It is the AST step table: a single,
// explicit dispatch surface. Interpret looks a step's Kind() up here; an unknown
// kind (no entry) is a typed ErrUnknownStepKind, never a silent skip — the explicit
// `default` of the table (enforced by dispatch below).
//
// It is populated in init() rather than as a literal because evalBranch walks
// sub-steps through dispatch → stepTable (a self-reference Go's initializer would
// otherwise reject as an initialization cycle).
var stepTable map[StepKind]evaluator

func init() {
	stepTable = map[StepKind]evaluator{
		KindValidate:  evalValidate,
		KindAuthorize: evalAuthorize,
		KindRead:      evalRead,
		KindMutate:    evalMutate,
		KindBranch:    evalBranch,
		KindReturn:    evalReturn,
	}
}

// dispatch looks up a step's evaluator in the table. A kind with no entry returns
// ErrUnknownStepKind — the explicit default that makes an unrecognised verb a typed
// failure (S10 done-criterion: "an unrecognised verb is a typed failure, never a
// silent skip").
func dispatch(s Step) (evaluator, error) {
	ev, ok := stepTable[s.Kind()]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrUnknownStepKind, s.Kind())
	}
	return ev, nil
}

// evalValidate runs the validate verb through the Validator seam: shape-check the
// resolved $.input against the named schema. A validation error fails the step.
func evalValidate(step Step, state *State, deps Deps) (stepResult, error) {
	v, ok := step.(ValidateStep)
	if !ok {
		return stepResult{}, fmt.Errorf("operation: validate step has wrong type %T", step)
	}
	input, _ := state.Resolve("$.input")
	if err := deps.Validate(v.Schema, input); err != nil {
		return stepResult{}, fmt.Errorf("operation: validate %q: %w", v.Schema, err)
	}
	return stepResult{}, nil
}

// evalAuthorize runs the authorize verb through the Authorizer seam: delegate to
// the named Policy. A DENY (ErrAuthorizationDenied) short-circuits the pipeline —
// the error propagates up and Interpret stops, emitting nothing further.
func evalAuthorize(step Step, state *State, deps Deps) (stepResult, error) {
	a, ok := step.(AuthorizeStep)
	if !ok {
		return stepResult{}, fmt.Errorf("operation: authorize step has wrong type %T", step)
	}
	if err := deps.Authorize(a.Policy, state); err != nil {
		return stepResult{}, err
	}
	return stepResult{}, nil
}

// evalRead runs the read verb through the Reader seam: resolve the where selectors,
// load the entity, bind the result into the named slot ($.cart).
func evalRead(step Step, state *State, deps Deps) (stepResult, error) {
	r, ok := step.(ReadStep)
	if !ok {
		return stepResult{}, fmt.Errorf("operation: read step has wrong type %T", step)
	}
	where, err := state.resolveMap(r.Where)
	if err != nil {
		return stepResult{}, fmt.Errorf("operation: read %q where: %w", r.Entity, err)
	}
	val, err := deps.Read(r.Entity, where, state)
	if err != nil {
		return stepResult{}, fmt.Errorf("operation: read %q: %w", r.Entity, err)
	}
	if r.As != "" {
		if err := state.Bind(r.As, val); err != nil {
			return stepResult{}, err
		}
	}
	return stepResult{}, nil
}

// evalMutate runs the mutate verb through the Mutator seam: resolve the data/where
// selectors (the AST's `{ total: $.cart.items… , status: "pending" }` becomes the
// concrete row), call the Mutator, bind any result slot, and return the emitted
// events in step order.
func evalMutate(step Step, state *State, deps Deps) (stepResult, error) {
	m, ok := step.(MutateStep)
	if !ok {
		return stepResult{}, fmt.Errorf("operation: mutate step has wrong type %T", step)
	}
	data, err := state.resolveMap(m.Data)
	if err != nil {
		return stepResult{}, fmt.Errorf("operation: mutate %q data: %w", m.Entity, err)
	}
	result, events, err := deps.Mutate(m.Entity, string(m.Op), data, state)
	if err != nil {
		return stepResult{}, fmt.Errorf("operation: mutate %q %s: %w", m.Entity, m.Op, err)
	}
	if m.As != "" && result != nil {
		if err := state.Bind(m.As, result); err != nil {
			return stepResult{}, err
		}
	}
	return stepResult{events: events}, nil
}

// evalBranch runs the branch verb. The createOrder fixture does not exercise it, so
// its semantics are intentionally minimal and honest (S10: invent no branch
// behaviour the human has not specified). It resolves Cond to a bool and, when a
// sub-pipeline is present, would walk it — but with empty Then/Else it is a no-op.
// A future fixture that needs branch grows this evaluator together with the proof.
func evalBranch(step Step, state *State, deps Deps) (stepResult, error) {
	b, ok := step.(BranchStep)
	if !ok {
		return stepResult{}, fmt.Errorf("operation: branch step has wrong type %T", step)
	}
	var chosen []Step
	if b.Cond != "" {
		v, err := state.Resolve(b.Cond)
		if err == nil {
			if truthy, isBool := v.(bool); isBool && truthy {
				chosen = b.Then
			} else {
				chosen = b.Else
			}
		} else {
			chosen = b.Else
		}
	}
	var events []string
	for _, sub := range chosen {
		ev, err := dispatch(sub)
		if err != nil {
			return stepResult{}, err
		}
		res, err := ev(sub, state, deps)
		if err != nil {
			return stepResult{}, err
		}
		events = append(events, res.events...)
		if res.done {
			return stepResult{events: events, done: true}, nil
		}
	}
	return stepResult{events: events}, nil
}

// evalReturn runs the return verb: resolve the named ref slot into the Result and
// signal the walk is done. The resolved ref is stored on the state under a reserved
// key so Interpret can read it after the walk (keeping evaluators uniform).
func evalReturn(step Step, state *State, deps Deps) (stepResult, error) {
	r, ok := step.(ReturnStep)
	if !ok {
		return stepResult{}, fmt.Errorf("operation: return step has wrong type %T", step)
	}
	val, err := state.Resolve(r.Ref)
	if err != nil {
		// A return on an unbound slot is a typed failure (the operation declared a
		// ref it never produced) — never a silent empty result.
		return stepResult{}, fmt.Errorf("operation: return %q: %w", r.Ref, err)
	}
	ref, _ := val.(map[string]any)
	state.root[returnSlotKey] = returnCapture{name: r.Ref, ref: ref}
	return stepResult{done: true}, nil
}

// returnSlotKey is a reserved state key the return verb stashes its captured ref
// under; Interpret reads it after the walk. Prefixed so it cannot collide with a
// user slot name ($.input/$.auth/$.cart/$.order).
const returnSlotKey = "__return__"

type returnCapture struct {
	name string
	ref  map[string]any
}
