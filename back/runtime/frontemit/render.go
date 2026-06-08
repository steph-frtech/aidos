package frontemit

import (
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
)

// scalarInput maps the closed scalar set to the HTML <input type> used in the emitted form.
// Closed and declared (never derived from map iteration); reused so the input type never
// drifts. A blob is NOT here (it is type=file); a relation is NOT here (it is a <select>).
var scalarInput = map[entities.ScalarType]string{
	entities.TypeString:      "text",
	entities.TypeInt:         "number",
	entities.TypeDecimal:     "text",
	entities.TypeBool:        "checkbox",
	entities.TypeTimestamptz: "datetime-local",
}

// tsName turns an entity name into an exported TS component name (order → Order). Mirrors the
// S74 relemit tsName — no inflection invented.
func tsName(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// routeOf maps an entity name to its create POST route — /<lowercased name> (mirrors the S87
// honoemit routeOf, so the form posts to the SAME route the server emits). Coins no route.
func routeOf(name string) string {
	return "/" + strings.ToLower(name)
}

// emitIndex renders the navigation index page: a heading + a link to every entity's form, in
// canonical name order. The ccup theme (ADR 0010) is carried as a class hook the emitted app
// inherits; i18n labels (ADR 0011) ride the entity names verbatim (the kernel owns the text).
func emitIndex(s FrontSpec, sourceHash string) Artifact {
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// S93 emitted app FRONT index (Hono JSX/SSR). Navigation over the project's entities.\n")
	b.WriteString("/** @jsxImportSource hono/jsx */\n\n")
	b.WriteString("export const IndexPage = () => (\n")
	b.WriteString("\t<main class=\"aidos-app bg-background text-foreground\">\n")
	fmt.Fprintf(&b, "\t\t<h1 class=\"text-2xl font-semibold\">%s</h1>\n", esc(s.Project))
	b.WriteString("\t\t<nav class=\"aidos-nav\">\n")
	for _, e := range canonicalEntities(s) {
		name := e.Entity.Name
		fmt.Fprintf(&b, "\t\t\t<a class=\"text-blue-600\" href=%s data-aidos-entity=%s>%s</a>\n",
			jsxAttr(routeOf(name)+"/new"), jsxAttr(name), esc(tsName(name)))
	}
	b.WriteString("\t\t</nav>\n")
	b.WriteString("\t</main>\n")
	b.WriteString(");\n")
	out := []byte(strings.TrimRight(b.String(), "\n") + "\n")
	return artifact("gen/"+s.Project+"/web/index.tsx", TargetIndex, out, sourceHash)
}

// emitEntityForm renders the create-form page for ONE entity (Hono JSX/SSR): a <form
// method=post> posting to the emitted API route, with one field per scalar attribute, one
// <input type=file> per blob attribute (the upload — multipart/form-data) and one <select>
// per relation (the FK). A required field carries `required`. The form is plain HTML so
// Playwright drives it; submission hits the emitted API (S90), no client framework needed.
func emitEntityForm(project string, e EntityModel, sourceHash string) Artifact {
	name := e.Entity.Name
	hasBlob := len(e.Blobs) > 0
	enctype := "application/x-www-form-urlencoded"
	if hasBlob {
		enctype = "multipart/form-data"
	}

	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	fmt.Fprintf(&b, "// S93 emitted app FRONT form for entity %s (Hono JSX/SSR). Posts to the emitted API route.\n", name)
	b.WriteString("/** @jsxImportSource hono/jsx */\n\n")
	fmt.Fprintf(&b, "export const %sForm = () => (\n", tsName(name))
	fmt.Fprintf(&b, "\t<form class=\"aidos-form\" method=\"post\" action=%s enctype=%s data-aidos-entity=%s>\n",
		jsxAttr(routeOf(name)), jsxAttr(enctype), jsxAttr(name))
	fmt.Fprintf(&b, "\t\t<h2 class=\"text-xl font-medium\">%s</h2>\n", esc(tsName(name)))

	// One field per scalar attribute (source order — the entity AST owns it).
	for _, a := range e.Entity.Attributes {
		if a.Identifier {
			// The identifier is server-assigned; never a create-form input.
			continue
		}
		inputType := scalarInput[a.Type]
		req := ""
		if a.Required {
			req = " required"
		}
		fmt.Fprintf(&b, "\t\t<label class=\"aidos-field\" data-aidos-field=%s>%s\n", jsxAttr(a.Name), esc(a.Name))
		fmt.Fprintf(&b, "\t\t\t<input class=\"aidos-input\" name=%s type=%s%s />\n", jsxAttr(a.Name), jsxAttr(inputType), req)
		b.WriteString("\t\t</label>\n")
	}

	// One <input type=file> per blob attribute (the upload — accept = the allow-list).
	for _, bl := range e.Blobs {
		accept := strings.Join(bl.AllowedMIME, ",")
		req := ""
		if bl.Required {
			req = " required"
		}
		fmt.Fprintf(&b, "\t\t<label class=\"aidos-field aidos-blob\" data-aidos-field=%s data-aidos-blob=\"true\" data-aidos-max-bytes=%s>%s\n",
			jsxAttr(bl.Name), jsxAttr(fmt.Sprintf("%d", bl.MaxBytes)), esc(bl.Name))
		fmt.Fprintf(&b, "\t\t\t<input class=\"aidos-input\" name=%s type=\"file\" accept=%s%s />\n", jsxAttr(bl.Name), jsxAttr(accept), req)
		b.WriteString("\t\t</label>\n")
	}

	// One <select> per relation (the FK). N-N renders a multiple select; 1-1/1-N a single.
	for _, r := range e.Refs {
		multiple := ""
		if r.Cardinality == ref.ManyToMany {
			multiple = " multiple"
		}
		req := ""
		if r.Required {
			req = " required"
		}
		fmt.Fprintf(&b, "\t\t<label class=\"aidos-field\" data-aidos-field=%s data-aidos-relation=%s data-aidos-target=%s>%s\n",
			jsxAttr(r.Name), jsxAttr(string(r.Cardinality)), jsxAttr(r.Target), esc(r.Name))
		fmt.Fprintf(&b, "\t\t\t<select class=\"aidos-input\" name=%s%s%s></select>\n", jsxAttr(r.Name+"_id"), multiple, req)
		b.WriteString("\t\t</label>\n")
	}

	fmt.Fprintf(&b, "\t\t<button class=\"aidos-submit bg-blue-600 text-white\" type=\"submit\" data-aidos-submit=%s>Submit</button>\n", jsxAttr(name))
	b.WriteString("\t</form>\n")
	b.WriteString(");\n")
	out := []byte(strings.TrimRight(b.String(), "\n") + "\n")
	return artifact("gen/"+project+"/web/"+strings.ToLower(name)+".form.tsx", TargetEntityForm, out, sourceHash)
}

// emitControls renders the control+action verticale to REAL buttons (Hono JSX/SSR), in
// canonical name order. Each button:
//   - binds its operation via data-aidos-invoke (the action's triggers/invoke, S11);
//   - embeds its control-spec fixture as data-aidos-control (a JSON sensor: name, op, and the
//     {given,visible,enabled} rows) so a Playwright assertion proves the rendered button obeys
//     its control-spec (the done-criterion "chaque bouton portant sa fixture control-spec comme
//     senseur"). The button executes the operation against the emitted API on click — it is
//     action-capable, not read-only (ui-completeness, CLAUDE.md §6 step 7).
func emitControls(s FrontSpec, sourceHash string) Artifact {
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// S93 emitted app FRONT controls (Hono JSX/SSR). The control+action verticale rendered to real buttons,\n")
	b.WriteString("// each carrying its control-spec fixture as a data-aidos-control sensor.\n")
	b.WriteString("/** @jsxImportSource hono/jsx */\n\n")
	b.WriteString("export const ControlsPanel = () => (\n")
	b.WriteString("\t<section class=\"aidos-controls\">\n")
	for _, c := range canonicalControls(s) {
		fixtureJSON := controlSensorJSON(c)
		fmt.Fprintf(&b, "\t\t<button class=\"aidos-control bg-blue-600 text-white\"\n")
		fmt.Fprintf(&b, "\t\t\tdata-aidos-control=%s\n", jsxAttr(c.Name))
		fmt.Fprintf(&b, "\t\t\tdata-aidos-view=%s\n", jsxAttr(c.View))
		fmt.Fprintf(&b, "\t\t\tdata-aidos-invoke=%s\n", jsxAttr(c.Operation))
		fmt.Fprintf(&b, "\t\t\tdata-aidos-fixture=%s\n", jsxAttr(fixtureJSON))
		fmt.Fprintf(&b, "\t\t\ttype=\"button\">%s</button>\n", esc(c.Label))
	}
	b.WriteString("\t</section>\n")
	b.WriteString(");\n")
	out := []byte(strings.TrimRight(b.String(), "\n") + "\n")
	return artifact("gen/"+s.Project+"/web/controls.tsx", TargetControls, out, sourceHash)
}

// controlSensorJSON renders the control's fixture as a compact, key-sorted JSON sensor string:
// {"name","op","rows":[{"given","visible","enabled"}...]}. Deterministic (fixture rows kept in
// source order; the source-body hash pins them). A Playwright assertion parses this to prove
// the button obeys its control-spec.
func controlSensorJSON(c ControlModel) string {
	var b strings.Builder
	b.WriteString("{")
	b.WriteString("\"name\":" + compactStr(c.Name))
	b.WriteString(",\"op\":" + compactStr(c.Operation))
	b.WriteString(",\"rows\":[")
	for i, f := range c.Fixtures {
		if i > 0 {
			b.WriteString(",")
		}
		fmt.Fprintf(&b, "{\"given\":%s,\"visible\":%t,\"enabled\":%t}", compactStr(f.Given), f.Visible, f.Enabled)
	}
	b.WriteString("]}")
	return b.String()
}

// compactStr renders a string as a JSON literal (no surrounding whitespace) for the sensor
// payload — distinct from jsStr (which targets a TS source literal). Deterministic escaping.
func compactStr(s string) string {
	return jsStr(s)
}

// esc renders text as JSX-safe inner text (escapes the five XML metacharacters). Deterministic;
// the emitter never emits raw, unescaped kernel text into markup.
func esc(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&#39;")
	return r.Replace(s)
}

// jsxAttr renders a string as a JSX double-quoted attribute value (JSON-escaped, so a quote or
// brace in the value never breaks the markup). Reused so attribute quoting never drifts.
func jsxAttr(s string) string {
	return jsStr(s)
}
