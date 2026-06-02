package operation

// Deps are the four side-effecting seams an operation reaches the world through.
// The interpreter never touches a DB, an HTTP client, a clock or a Policy/Expr AST
// directly — it calls these interfaces, so the fixture mirror passes MOCKS and the
// package stays pure (CLAUDE.md §6 determinism-first; the wall, §2). Each seam is
// mocked at S10; the real implementations (a real Validator over the entity schema,
// a real Authorizer over the Policy ∀ evaluator, a real Reader/Mutator over sqlc)
// are later teeth that satisfy these same interfaces — never an edit to this seam.
//
// Deps is the union the interpreter requires; a caller passes one value that
// implements all four methods (the fixture's mockDeps), or composes four adapters.
type Deps interface {
	Validator
	Authorizer
	Reader
	Mutator
}

// Validator shape-checks an operation's input against a named schema (the validate
// verb). A nil error means valid; a non-nil error fails the step. The real
// validator runs the entity-schema contract; the mock accepts.
type Validator interface {
	Validate(schema string, input any) error
}

// Authorizer answers an authorize verb by delegating to a named Policy (the §93
// "is this authorized?" question). It returns nil for ALLOW and
// ErrAuthorizationDenied for DENY — a DENY short-circuits the pipeline. The real
// authorizer runs policy.Eval over the live ctx; the mock returns a fixed verdict.
type Authorizer interface {
	Authorize(policy string, state *State) error
}

// Reader loads an entity matching where into a value (the read verb). The
// interpreter binds the result into the step's named slot ($.cart). The real reader
// runs a sqlc query; the mock returns a seeded value.
type Reader interface {
	Read(entity string, where map[string]any, state *State) (any, error)
}

// Mutator creates or clears an entity (the mutate verb), returning the result value
// (for a create, bound into the step's slot) and the ordered events the mutate
// emits (OrderCreated / CartCleared). The real mutator runs a sqlc write inside a
// transaction; the mock records the call and returns seeded events. The events the
// Mutator returns are the operation's emitted events, in step order — deterministic.
type Mutator interface {
	Mutate(entity string, op string, data map[string]any, state *State) (result any, events []string, err error)
}
