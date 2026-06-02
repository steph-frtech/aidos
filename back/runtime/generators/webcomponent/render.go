package webcomponent

import (
	"fmt"
	"path"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/expr"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// artifactPath returns the RELATIVE projection path (no absolute paths — determinism:
// the same source yields the same path on every machine). The web projection lands under
// front/web/app/web-preview/_generated/<control-id>.tsx.
func artifactPath(c control.Control) string {
	return path.Join("front/web/app/web-preview/_generated", componentBase(c)+".tsx")
}

// componentBase is the file base (and React component name stem) for a control. The
// control name is a stable token from the AST (e.g. "checkout-button"); the file uses it
// verbatim (lower) and the component name pascal-cases it. No inflection is invented.
func componentBase(c control.Control) string { return strings.ToLower(c.Name) }

// componentName pascal-cases a control name into a React component identifier
// ("checkout-button" → "CheckoutButton"). Deterministic, no invented inflection.
func componentName(name string) string {
	parts := strings.FieldsFunc(name, func(r rune) bool { return r == '-' || r == '_' || r == ' ' })
	var b strings.Builder
	for _, p := range parts {
		if p == "" {
			continue
		}
		b.WriteString(strings.ToUpper(p[:1]))
		b.WriteString(p[1:])
	}
	out := b.String()
	if out == "" {
		return "Control"
	}
	return out
}

// render produces the .tsx bytes for a control bound to its action. It is a pure
// function of the two ASTs + the source hash — no clock, no RNG, no map-order, no
// absolute paths; normalized "\n" newlines — so it is byte-for-byte reproducible.
//
// The component embeds the control's two Expr ASTs (visible_when/enabled_when) as
// canonical JSON and evaluates them with the shared TS twin of the FROZEN expr catalogue
// (the lib/aidos-expr evaluator) — the SAME semantics as back/kernel/expr.EvalState,
// never re-invented. The click sets data-aidos-invoke = the bound operation ref
// (Plan(action, click).invoke) — a testable signal, NOT an executed call.
func render(c control.Control, a action.Action, sourceHash string) ([]byte, *blockreason.BlockReason) {
	vw, err := expr.Canonicalize(c.VisibleWhen)
	if err != nil {
		br := blockMalformed(fmt.Errorf("visible_when: %w", err))
		return nil, &br
	}
	ew, err := expr.Canonicalize(c.EnabledWhen)
	if err != nil {
		br := blockMalformed(fmt.Errorf("enabled_when: %w", err))
		return nil, &br
	}

	name := componentName(c.Name)
	var b strings.Builder
	// Protected header (the SAME marker as S34, reused verbatim) carrying the source hash.
	fmt.Fprintf(&b, "// %s. source: %s\n", ProtectedMarker, sourceHash)
	fmt.Fprintf(&b, "// Web projection (S38): the control-spec %q bound to action %q.\n", c.Name, a.Name)
	b.WriteString("// One source → N projections, never double-typed (KRD LIVRE V). The button is a\n")
	b.WriteString("// PROJECTION of the control-spec (S11): visible/enabled are EvalState(control, given)\n")
	b.WriteString("// embedded as the control's Expr ASTs; the click DECLARES the bound operation\n")
	b.WriteString("// (Plan(action, click).invoke) via data-aidos-invoke — it does NOT execute it.\n")
	b.WriteString(`"use client";` + "\n\n")
	b.WriteString(`import { type ExprNode, evalState } from "@/lib/aidos-expr";` + "\n\n")

	// The two condition ASTs, embedded verbatim as canonical JSON (the kernel head form),
	// typed as ExprNode so the projection typechecks (the literal union is not inferred).
	fmt.Fprintf(&b, "// visible_when / enabled_when — the control's Expr DSL ASTs (back/kernel/expr), embedded verbatim.\n")
	fmt.Fprintf(&b, "const VISIBLE_WHEN: ExprNode = %s;\n", string(vw))
	fmt.Fprintf(&b, "const ENABLED_WHEN: ExprNode = %s;\n", string(ew))
	// The bound operation ref the click declares — Plan(action, click).invoke (S11),
	// taken VERBATIM from the action AST, never invented.
	fmt.Fprintf(&b, "const INVOKE = %q;\n", a.Invoke)
	// The i18n label key (a projection concern; the raw key is rendered, never translated here).
	fmt.Fprintf(&b, "const LABEL = %q;\n\n", c.Label)

	// The props: the runtime `given` ($-rooted state) and an optional onInvoke callback.
	fmt.Fprintf(&b, "export interface %sProps {\n", name)
	b.WriteString("\t/** The $-rooted situation state — the fixture `given` (S11). */\n")
	b.WriteString("\tgiven: Record<string, unknown>;\n")
	b.WriteString("\t/** Called with the bound operation ref when the enabled button is clicked. */\n")
	b.WriteString("\tonInvoke?: (invoke: string) => void;\n")
	b.WriteString("}\n\n")

	// The component: visible/enabled are computed from the embedded ASTs over `given`
	// (the faithful EvalState mirror); a hidden button renders nothing; the click
	// declares INVOKE via the data attribute + the optional callback.
	fmt.Fprintf(&b, "/** %s — the emitted web projection of control %q. */\n", name, c.Name)
	fmt.Fprintf(&b, "export function %s({ given, onInvoke }: %sProps) {\n", name, name)
	b.WriteString("\tconst { visible, enabled } = evalState(VISIBLE_WHEN, ENABLED_WHEN, given);\n")
	b.WriteString("\tif (!visible) return null;\n")
	b.WriteString("\treturn (\n")
	b.WriteString("\t\t<button\n")
	fmt.Fprintf(&b, "\t\t\tdata-testid=%q\n", "aidos-control-"+componentBase(c))
	b.WriteString("\t\t\ttype=\"button\"\n")
	b.WriteString("\t\t\tdisabled={!enabled}\n")
	b.WriteString("\t\t\tdata-aidos-visible={visible ? \"true\" : \"false\"}\n")
	b.WriteString("\t\t\tdata-aidos-enabled={enabled ? \"true\" : \"false\"}\n")
	b.WriteString("\t\t\tdata-aidos-invoke={INVOKE}\n")
	b.WriteString("\t\t\tonClick={() => {\n")
	b.WriteString("\t\t\t\tif (enabled) onInvoke?.(INVOKE);\n")
	b.WriteString("\t\t\t}}\n")
	b.WriteString("\t\t\tclassName=\"inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50\"\n")
	b.WriteString("\t\t>\n")
	b.WriteString("\t\t\t{LABEL}\n")
	b.WriteString("\t\t</button>\n")
	b.WriteString("\t);\n")
	b.WriteString("}\n")

	return []byte(b.String()), nil
}
