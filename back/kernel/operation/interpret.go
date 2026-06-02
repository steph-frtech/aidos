package operation

// Interpret walks an operation's steps in order against the State, through the Deps
// seams, returning the ORDERED event list and the return Result. It is the N2
// Workflow executor: `state → command → events`.
//
// THE WALK. For each step, in declaration order: look its evaluator up in the step
// table (dispatch), run it, append any emitted events (in step order), and stop on
// the return verb (done). The walk is deterministic — the emitted events are a
// subsequence of the steps' emits in the steps' own order, so the same (op, state,
// deps) always yields the same (events, result).
//
// SHORT-CIRCUIT. Any step error stops the walk and propagates: an authorize DENY
// returns ErrAuthorizationDenied with the events emitted so far (none, since
// authorize precedes every mutate in createOrder) — proving the pipeline order is
// real (a denied authorize never reaches a mutate).
//
// PURITY (CLAUDE.md §6). Interpret holds no clock, no RNG, no I/O: side effects
// reach the world only through deps. A fresh events slice and a fresh return
// capture per call keep it free of shared state.
func Interpret(op Operation, state *State, deps Deps) ([]string, Result, error) {
	events := make([]string, 0, len(op.Emits))

	for _, step := range op.Steps {
		ev, err := dispatch(step)
		if err != nil {
			return events, Result{}, err
		}
		res, err := ev(step, state, deps)
		if err != nil {
			// Short-circuit: return the events emitted so far (the denied-authorize
			// guard relies on this being empty before any mutate).
			return events, Result{}, err
		}
		events = append(events, res.events...)
		if res.done {
			break
		}
	}

	return events, capturedReturn(state), nil
}

// capturedReturn reads the return verb's stashed ref off the state (set by
// evalReturn). An operation with no return verb yields an empty Result.
func capturedReturn(state *State) Result {
	raw, ok := state.root[returnSlotKey]
	if !ok {
		return Result{}
	}
	cap, ok := raw.(returnCapture)
	if !ok {
		return Result{}
	}
	return Result{RefName: cap.name, Ref: cap.ref}
}
