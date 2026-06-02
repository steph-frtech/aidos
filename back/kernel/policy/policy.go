// Package policy is the AIDOS Policy DSL (KRD §24.4, §93): a content-addressed
// AST for a recursive ALLOW/DENY rule tree, plus a PURE evaluator. A policy is a
// SOURCE layer above the waterline (KRD §21, back/kernel/CONTEXT.md) — human
// truth, out of AI reach — that answers one question: "is this authorized?".
//
// THE SHAPE (KRD §24.4). A Policy is {name, scope, rule, effect}:
//   - scope ∈ {RESOURCE, OPERATION, ENTITY, FIELD} with a target name — WHERE the
//     policy applies (the §93 anchor scopes OPERATION "createOrder");
//   - rule  — a recursive tree: combinators all / any / not over comparison leaves
//     (eq / gt / lt / …) and predicates exists / matches on a $-rooted selector;
//   - effect ∈ {ALLOW, DENY} — how the rule's truth maps to a Decision.
//
// THE COMBINATION LAW (KRD §93: "tout ALLOW passe ; n'importe quel DENY bloque").
// For a SINGLE policy, the effect is the gate: an ALLOW policy authorizes iff its
// rule HOLDS (else DENY); a DENY policy blocks iff its rule HOLDS (else ALLOW —
// it abstains). Across a POLICY SET (a later tooth, not wired here), every ALLOW
// must hold and any DENY that holds blocks — the §93 law at the set level.
//
// THE WALL (CLAUDE.md §2). This package is PURE — no DB calls, no I/O, no clock,
// no RNG. The kernel.policy truth table is SELECT-only to the agent role; a
// Policy AST is written only by the aidos CLI role through an approved ChangeSet.
// Eval is a deterministic function of (policy, ctx): same inputs ⇒ same Decision
// (CLAUDE.md §6 determinism-first).
//
// REUSE, DON'T REINVENT (ADR 0007). The selector (exists / matches / a leaf's
// operands) reuses the SAME $-rooted dotted-path semantics proved in
// back/kernel/expr (resolveRef: ".length" yields a collection's length); we do
// NOT embed a general JSON-path engine — that would be a free-code escape, the
// very thing §24 forbids. Hashing reuses records.Hash/Canonicalize (one address
// space across stores). No new ADR: this freezes a new artifact (the Policy AST
// + the ALLOW/DENY law); it shifts no prior contract.
package policy

// Scope places a policy: WHERE it applies (KRD §24.4). The closed set is
// {RESOURCE, OPERATION, ENTITY, FIELD}; New rejects any other value at
// construction so a scope is never invented.
type Scope string

const (
	ScopeResource  Scope = "RESOURCE"
	ScopeOperation Scope = "OPERATION"
	ScopeEntity    Scope = "ENTITY"
	ScopeField     Scope = "FIELD"
)

// scopes is the closed set of scope values, in canonical order.
var scopes = []Scope{ScopeResource, ScopeOperation, ScopeEntity, ScopeField}

// IsScope reports whether s is one of the four Policy scopes. Exposed so the
// Workbench panel and the property mirror never invent a scope.
func IsScope(s string) bool {
	for _, sc := range scopes {
		if string(sc) == s {
			return true
		}
	}
	return false
}

// Scopes returns the four scope values in canonical order.
func Scopes() []Scope { return append([]Scope(nil), scopes...) }

// Effect maps a rule's truth to a Decision (KRD §24.4): ALLOW gates, DENY blocks.
type Effect string

const (
	EffectAllow Effect = "ALLOW"
	EffectDeny  Effect = "DENY"
)

// Decision is the total result of evaluating a policy: ALLOW or DENY. There is no
// third value — Eval is total (the §93 "every ALLOW passes; any DENY blocks" law
// always yields a verdict).
type Decision string

const (
	ALLOW Decision = "ALLOW"
	DENY  Decision = "DENY"
)

// Policy is one content-addressed authorization rule tree (KRD §24.4, §93).
// {Name, Scope, Target, Rule, Effect}. Target is the scoped name (the §93 anchor:
// scope OPERATION, target "createOrder").
type Policy struct {
	Name   string
	Scope  Scope
	Target string
	Rule   Rule
	Effect Effect
}

// New constructs a Policy. It is a plain constructor (no validation panic): an
// out-of-set scope or effect is simply held as-is and surfaced by Canonicalize /
// the validator later. Callers building the §93 anchor use CanPlaceOrder().
func New(name string, scope Scope, target string, rule Rule, effect Effect) Policy {
	return Policy{Name: name, Scope: scope, Target: target, Rule: rule, Effect: effect}
}

// ── The rule tree (a sealed sum type) ────────────────────────────────────────

// RuleKind discriminates a Rule node. The closed set is the combinators (all /
// any / not), the comparison leaves (eq / gt / lt), and the selector predicates
// (exists / matches). Nothing is added beyond what KRD §24.4 / §93 names.
type RuleKind string

const (
	KindAll     RuleKind = "all"     // combinator: every child holds
	KindAny     RuleKind = "any"     // combinator: some child holds
	KindNot     RuleKind = "not"     // combinator: negation
	KindEq      RuleKind = "eq"      // leaf: left == right
	KindGt      RuleKind = "gt"      // leaf: left > right (numbers)
	KindLt      RuleKind = "lt"      // leaf: left < right (numbers)
	KindExists  RuleKind = "exists"  // predicate: a selector resolves to a value
	KindMatches RuleKind = "matches" // predicate: a selector's string matches a pattern
)

var ruleKinds = []RuleKind{KindAll, KindAny, KindNot, KindEq, KindGt, KindLt, KindExists, KindMatches}

// IsRuleKind reports whether k is one of the eight rule-node kinds.
func IsRuleKind(k string) bool {
	for _, rk := range ruleKinds {
		if string(rk) == k {
			return true
		}
	}
	return false
}

// RuleKinds returns the eight rule kinds in canonical order.
func RuleKinds() []RuleKind { return append([]RuleKind(nil), ruleKinds...) }

// Rule is one node of the rule tree. Sealed interface: only the concrete node
// types in this package implement it (the closed grammar — no free-code escape).
type Rule interface {
	Kind() RuleKind
	isRule()
}

// AllNode holds iff every child holds (the ∧ combinator). Empty all([]) holds
// (vacuous truth), matching boolean conjunction over the empty set.
type AllNode struct{ Children []Rule }

func (AllNode) Kind() RuleKind { return KindAll }
func (AllNode) isRule()        {}

// AnyNode holds iff some child holds (the ∨ combinator). Empty any([]) fails.
type AnyNode struct{ Children []Rule }

func (AnyNode) Kind() RuleKind { return KindAny }
func (AnyNode) isRule()        {}

// NotNode holds iff its child does not (negation; an involution).
type NotNode struct{ Child Rule }

func (NotNode) Kind() RuleKind { return KindNot }
func (NotNode) isRule()        {}

// CompareNode is a comparison leaf: Left <op> Right, where op ∈ {eq, gt, lt}.
// Operands are Operands (a selector or a literal).
type CompareNode struct {
	Op    RuleKind // KindEq / KindGt / KindLt
	Left  Operand
	Right Operand
}

func (n CompareNode) Kind() RuleKind { return n.Op }
func (CompareNode) isRule()          {}

// ExistsNode holds iff its selector resolves to a non-null value in the ctx.
type ExistsNode struct{ Sel string }

func (ExistsNode) Kind() RuleKind { return KindExists }
func (ExistsNode) isRule()        {}

// MatchesNode holds iff the selector resolves to a string matching Pattern (a
// Go regexp). Compilation failure ⇒ the predicate fails (never a panic).
type MatchesNode struct {
	Sel     string
	Pattern string
}

func (MatchesNode) Kind() RuleKind { return KindMatches }
func (MatchesNode) isRule()        {}

// ── Operands (a comparison leaf's left/right) ────────────────────────────────

// OperandKind discriminates an operand: a $-rooted selector or a literal value.
type OperandKind string

const (
	OperandSelector OperandKind = "sel"
	OperandLiteral  OperandKind = "lit"
)

// Operand is one side of a comparison leaf. Sealed to this package.
type Operand interface {
	operandKind() OperandKind
	isOperand()
}

// SelectorOperand is a $-rooted dotted path resolved against the ctx (the same
// semantics as expr: ".length" yields a collection's length).
type SelectorOperand struct{ Path string }

func (SelectorOperand) operandKind() OperandKind { return OperandSelector }
func (SelectorOperand) isOperand()               {}

// LiteralOperand is a constant value: string, float64 (a JSON number), bool, nil.
type LiteralOperand struct{ Value any }

func (LiteralOperand) operandKind() OperandKind { return OperandLiteral }
func (LiteralOperand) isOperand()               {}

// ── Constructors (used by callers / mirrors building a rule tree in Go) ───────

// All builds an all-combinator (every child holds).
func All(children ...Rule) Rule { return AllNode{Children: children} }

// Any builds an any-combinator (some child holds).
func Any(children ...Rule) Rule { return AnyNode{Children: children} }

// Not builds a negation.
func Not(child Rule) Rule { return NotNode{Child: child} }

// Eq builds an equality leaf (left == right).
func Eq(left, right Operand) Rule { return CompareNode{Op: KindEq, Left: left, Right: right} }

// Gt builds a greater-than leaf (left > right, numbers).
func Gt(left, right Operand) Rule { return CompareNode{Op: KindGt, Left: left, Right: right} }

// Lt builds a less-than leaf (left < right, numbers).
func Lt(left, right Operand) Rule { return CompareNode{Op: KindLt, Left: left, Right: right} }

// Exists builds an exists predicate over a selector.
func Exists(sel string) Rule { return ExistsNode{Sel: sel} }

// Matches builds a matches predicate (selector string ~ pattern).
func Matches(sel, pattern string) Rule { return MatchesNode{Sel: sel, Pattern: pattern} }

// Selector builds a selector operand ($-rooted path).
func Selector(path string) Operand { return SelectorOperand{Path: path} }

// LitV builds a literal operand, normalizing Go int → float64 so the canonical
// encoding matches a decoded JSON number (one number type, like expr.Lit).
func LitV(v any) Operand {
	switch n := v.(type) {
	case int:
		return LiteralOperand{Value: float64(n)}
	case int64:
		return LiteralOperand{Value: float64(n)}
	default:
		return LiteralOperand{Value: v}
	}
}
