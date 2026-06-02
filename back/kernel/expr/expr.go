// Package expr is the AIDOS Expr DSL (KRD §24.5): a typed JSON AST —
// lit / ref / call / obj / arr — with a CLOSED function catalogue and $-rooted
// refs, plus a pure evaluator. It exists so a button's condition (visible_when,
// enabled_when) is an executable, versionable KERNEL ARTIFACT — never free code.
// "Comportement = artefact contraint, jamais code libre" (KRD §24, §1718): the
// catalogue is a closed allow-list, so there is no escape hatch to arbitrary code.
//
// THE WALL (CLAUDE.md §2). This package is PURE — no DB calls, no I/O, no clock,
// no RNG. The kernel.expr truth table is SELECT-only to the agent role; an Expr
// AST is written only by the aidos CLI role through an approved ChangeSet. Eval
// resolves now/uuid/randomToken through INJECTED Env providers, so evaluation is
// deterministic and testable (CLAUDE.md §6 determinism-first): same (ast, env) ⇒
// same Value, with no real clock/RNG inside Eval.
//
// REUSE, DON'T REINVENT (ADR 0007). The kernel stores behaviour as ASTs; eval
// usually reuses a mature lib (CEL / expr-lang). Here we DELIBERATELY hand-roll a
// tiny interpreter over a CLOSED catalogue rather than embed a general expression
// engine: a general engine is a free-code escape (its own function space, member
// access, etc.) which is exactly what §24.5 forbids. The closed catalogue + the
// content-hash reuse (records.Canonicalize/Hash) is simpler AND safer than a
// general engine here. No new ADR: this freezes a new artifact (the AST + the
// catalogue), it shifts no prior contract.
package expr

// Kind is a node's discriminator. Exactly five kinds exist (KRD §24.5); Parse
// rejects any other.
type Kind string

const (
	KindLit  Kind = "lit"  // a literal value (string / number / bool / null)
	KindRef  Kind = "ref"  // a $-rooted path into the Env ($.cart.items.length)
	KindCall Kind = "call" // a function from the CLOSED catalogue applied to args
	KindObj  Kind = "obj"  // a structural object composer {k: expr, …}
	KindArr  Kind = "arr"  // a structural array composer [expr, …]
)

// nodeKinds is the closed set of node kinds, in canonical order. Parse rejects
// any kind outside it; IsNodeKind exposes it for the property mirror.
var nodeKinds = []Kind{KindLit, KindRef, KindCall, KindObj, KindArr}

// IsNodeKind reports whether k is one of the five Expr node kinds.
func IsNodeKind(k string) bool {
	for _, kk := range nodeKinds {
		if string(kk) == k {
			return true
		}
	}
	return false
}

// Expr is one node of the typed AST. It is a sealed interface: only the five
// concrete node types in this package implement it (the closed grammar).
type Expr interface {
	// Kind returns the node's discriminator.
	Kind() Kind
	// isExpr seals the interface to this package.
	isExpr()
}

// LitNode is a literal value (lit). Value is one of: string, float64/int (a JSON
// number), bool, or nil. The constructor Lit normalizes Go ints to keep the
// canonical encoding stable.
type LitNode struct{ Value any }

func (LitNode) Kind() Kind { return KindLit }
func (LitNode) isExpr()    {}

// RefNode is a $-rooted reference (ref): a dotted path into the Env, e.g.
// "$.cart.items.length". The path always starts at the "$" root (KRD §24.5).
type RefNode struct{ Path string }

func (RefNode) Kind() Kind { return KindRef }
func (RefNode) isExpr()    {}

// CallNode is a function application (call): Fn is a name from the CLOSED
// catalogue, Args are the argument expressions in order.
type CallNode struct {
	Fn   string
	Args []Expr
}

func (CallNode) Kind() Kind { return KindCall }
func (CallNode) isExpr()    {}

// ObjNode is a structural object composer (obj): keys map to sub-expressions.
type ObjNode struct{ Fields map[string]Expr }

func (ObjNode) Kind() Kind { return KindObj }
func (ObjNode) isExpr()    {}

// ArrNode is a structural array composer (arr): an ordered list of sub-exprs.
type ArrNode struct{ Items []Expr }

func (ArrNode) Kind() Kind { return KindArr }
func (ArrNode) isExpr()    {}

// ── Constructors (used by tests and callers building an AST in Go) ───────────

// Lit builds a literal node, normalizing Go int → float64 so the canonical JSON
// encoding matches a decoded number (json.Number-free internal form).
func Lit(v any) Expr {
	switch n := v.(type) {
	case int:
		return LitNode{Value: float64(n)}
	case int64:
		return LitNode{Value: float64(n)}
	default:
		return LitNode{Value: v}
	}
}

// Ref builds a $-rooted reference node.
func Ref(path string) Expr { return RefNode{Path: path} }

// Call builds a function-application node from a catalogue name and args.
func Call(fn string, args ...Expr) Expr { return CallNode{Fn: fn, Args: args} }

// Obj builds a structural object composer.
func Obj(fields map[string]Expr) Expr { return ObjNode{Fields: fields} }

// Arr builds a structural array composer.
func Arr(items ...Expr) Expr { return ArrNode{Items: items} }
