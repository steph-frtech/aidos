package operation

// ── The step union (a sealed sum type) ───────────────────────────────────────
//
// Each verb is a concrete node implementing the sealed Step interface — only the
// types in this package implement it (the closed grammar, no free-code escape, the
// same shape as policy.Rule). Kind() is the dispatch key into the step table
// (table.go); isStep() seals the interface.

// StepKind discriminates a Step node. The closed set is the six Operation verbs.
type StepKind string

const (
	KindValidate  StepKind = "validate"  // shape-check the input against a schema
	KindAuthorize StepKind = "authorize" // delegate to a Policy (DENY short-circuits)
	KindRead      StepKind = "read"      // load an entity into a named state slot
	KindMutate    StepKind = "mutate"    // create/clear an entity, emitting an event
	KindBranch    StepKind = "branch"    // conditional (supported, unexercised here)
	KindReturn    StepKind = "return"    // name the result ref
)

// stepKinds is the closed set of step verbs, in canonical (pipeline) order.
var stepKinds = []StepKind{KindValidate, KindAuthorize, KindRead, KindMutate, KindBranch, KindReturn}

// IsStepKind reports whether k is one of the six Operation verbs. Exposed so the
// Workbench panel and any decoder never invent a verb.
func IsStepKind(k string) bool {
	for _, sk := range stepKinds {
		if string(sk) == k {
			return true
		}
	}
	return false
}

// StepKinds returns the six verbs in canonical order.
func StepKinds() []StepKind { return append([]StepKind(nil), stepKinds...) }

// Step is one node of an operation body. Sealed interface: only the concrete verb
// types below implement it.
type Step interface {
	Kind() StepKind
	isStep()
}

// ValidateStep shape-checks the input against a named schema (the Validator seam).
type ValidateStep struct {
	Schema string
}

func (ValidateStep) Kind() StepKind { return KindValidate }
func (ValidateStep) isStep()        {}

// AuthorizeStep delegates to a named Policy (the Authorizer seam). A DENY returns
// ErrAuthorizationDenied and short-circuits the pipeline.
type AuthorizeStep struct {
	Policy string
}

func (AuthorizeStep) Kind() StepKind { return KindAuthorize }
func (AuthorizeStep) isStep()        {}

// ReadStep loads an Entity matching Where into the named state slot As (the Reader
// seam). Where values may be selectors (e.g. $.input.cartId) resolved against the
// state before the read.
type ReadStep struct {
	Entity string
	Where  map[string]any
	As     string // the $-rooted slot to bind the result into (e.g. "$.cart")
}

func (ReadStep) Kind() StepKind { return KindRead }
func (ReadStep) isStep()        {}

// MutateStep creates or clears an Entity (the Mutator seam). For a create, Data is
// the resolved row to write and As is the slot to bind the result into; for a
// clear, Where targets the entity. The mutate emits an event (OrderCreated /
// CartCleared) returned by the Mutator.
type MutateStep struct {
	Entity string
	Op     MutateOp
	Data   map[string]any // for create: the row to write (values may be selectors / exprs)
	Where  map[string]any // for clear: the target
	As     string         // optional: the slot to bind the created result into
}

func (MutateStep) Kind() StepKind { return KindMutate }
func (MutateStep) isStep()        {}

// BranchStep is a conditional (KRD §24.3). It is part of the closed grammar and
// the step table, but the createOrder fixture does not exercise it, so its
// semantics are intentionally left minimal — the agent invents no branch behaviour
// the human has not specified (S10 honesty rule). When a fixture needs it, this
// node and its evaluator grow together with a fixture proving the chosen semantics.
type BranchStep struct {
	// Cond is a $-rooted selector / expr ref the evaluator would resolve to a bool.
	Cond string
	// Then/Else are the sub-pipelines. Empty here (unexercised).
	Then []Step
	Else []Step
}

func (BranchStep) Kind() StepKind { return KindBranch }
func (BranchStep) isStep()        {}

// ReturnStep names the result ref — the state slot whose value Interpret surfaces
// as the Result (e.g. Ref "$.order").
type ReturnStep struct {
	Ref string
}

func (ReturnStep) Kind() StepKind { return KindReturn }
func (ReturnStep) isStep()        {}
