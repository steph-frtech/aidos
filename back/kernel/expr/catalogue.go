package expr

// The CLOSED function catalogue (KRD §24.5). A call name MUST be one of these,
// else Parse rejects it — there is no free-code escape. The catalogue carries the
// §24.5-named functions (lowercase, concat, now, uuid, randomToken) plus exactly
// the comparison / logical / length operators the visible_when / enabled_when
// examples need (>, &&, !, .length). NOTHING is added beyond what KRD names or an
// example requires (the honesty rule: never invent a function). Extending the
// catalogue is a contract change → ChangeSet + SemanticDiff, never an edit here.
//
// arity == -1 means variadic (concat). Each entry pins the function's arity so
// Parse rejects a mis-arity call before Eval is ever reached.

type catalogueEntry struct {
	name  string
	arity int // exact arg count; -1 = variadic (>= 1)
}

// catalogue is the closed allow-list, in canonical (stable) order.
var catalogue = []catalogueEntry{
	// §24.5-named functions.
	{"lowercase", 1},
	{"concat", -1},
	{"now", 0},
	{"uuid", 0},
	{"randomToken", 0},
	// Comparison / logical / length ops the button examples need.
	{">", 2},      // $.cart.items.length > 0
	{"&&", 2},     // $.form.valid && !$.submitting
	{"!", 1},      // !$.submitting
	{"length", 1}, // .length — the length of an array/string ($.cart.items.length)
}

var catalogueByName = func() map[string]catalogueEntry {
	m := make(map[string]catalogueEntry, len(catalogue))
	for _, e := range catalogue {
		m[e.name] = e
	}
	return m
}()

// IsCatalogueFunc reports whether fn is in the closed catalogue. Exposed for the
// property mirror (it skips the rare collision where a random name equals a real
// catalogue name).
func IsCatalogueFunc(fn string) bool {
	_, ok := catalogueByName[fn]
	return ok
}

// CatalogueNames returns the catalogue function names in canonical order. The
// Workbench /expr panel lists them so the closed allow-list is visible, never
// invented.
func CatalogueNames() []string {
	out := make([]string, len(catalogue))
	for i, e := range catalogue {
		out[i] = e.name
	}
	return out
}

// arityOK reports whether n args is valid for fn (fn assumed in the catalogue).
func arityOK(fn string, n int) bool {
	e := catalogueByName[fn]
	if e.arity == -1 {
		return n >= 1
	}
	return n == e.arity
}
