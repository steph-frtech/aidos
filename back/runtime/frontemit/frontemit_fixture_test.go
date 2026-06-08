// frontemit_fixture_test.go — the S93 WORKFLOW/acceptance mirror (a concrete state→emit
// fixture). It pins, on a hand-written app cut (an "order" entity with a scalar, a blob and a
// relation, plus a "create-order" control bound to an operation), that the emitted front:
//   - renders a form with a text input, a file input (the blob upload) and a <select> (the FK);
//   - renders the control button binding the operation + carrying its fixture sensor;
//   - posts to the SAME route the S87 server emits (/order);
//   - that the control sensor's {visible,enabled} rows MATCH control.EvalState (the verticale —
//     the sensor never drifts from the kernel control semantics).
package frontemit

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/blob"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/kernel/expr"
)

func orderSpec() FrontSpec {
	return FrontSpec{
		Project: "shop",
		Entities: []EntityModel{
			{
				Entity: entities.Entity{
					Name: "order",
					Attributes: []entities.Attribute{
						{Name: "id", Type: entities.TypeInt, Identifier: true},
						{Name: "total", Type: entities.TypeDecimal, Required: true},
						{Name: "paid", Type: entities.TypeBool},
					},
				},
				Blobs: []blob.BlobAttribute{
					{Name: "receipt", AllowedMIME: []string{"image/png", "application/pdf"}, MaxBytes: 5_000_000, Required: false},
				},
				Refs: []ref.Relation{
					{Name: "customer", Target: "Customer", Cardinality: ref.OneToMany, Semantic: ref.FK, Required: true},
				},
			},
		},
		Controls: []ControlModel{
			{
				Name:      "create-order",
				View:      "order",
				Label:     "order.create",
				Operation: "CreateOrder",
				Fixtures: []FixtureRow{
					{Given: "cart-non-empty", Visible: true, Enabled: true},
					{Given: "cart-empty", Visible: true, Enabled: false},
				},
			},
		},
	}
}

func TestFixture_OrderForm(t *testing.T) {
	arts, br := EmitFront(orderSpec())
	if br != nil {
		t.Fatalf("EmitFront refused the order cut: %s", br.Explanation)
	}
	var form string
	for _, a := range arts {
		if a.Path == "gen/shop/web/order.form.tsx" {
			form = string(a.Bytes)
		}
	}
	if form == "" {
		t.Fatalf("no order form emitted")
	}
	// The identifier is NOT a create-form input.
	if strings.Contains(form, `name="id"`) {
		t.Fatalf("identifier rendered as an input")
	}
	// The required decimal scalar → a text input, required.
	if !strings.Contains(form, `name="total" type="text" required`) {
		t.Fatalf("total scalar not rendered required:\n%s", form)
	}
	// The bool scalar → a checkbox.
	if !strings.Contains(form, `name="paid" type="checkbox"`) {
		t.Fatalf("paid scalar not rendered as checkbox")
	}
	// The blob → a file input with the allow-list as accept, and multipart enctype.
	if !strings.Contains(form, `enctype="multipart/form-data"`) {
		t.Fatalf("blob form not multipart")
	}
	if !strings.Contains(form, `name="receipt" type="file" accept="image/png,application/pdf"`) {
		t.Fatalf("blob not rendered as file input with accept:\n%s", form)
	}
	// The relation → a <select> on <name>_id.
	if !strings.Contains(form, `<select class="aidos-input" name="customer_id"`) {
		t.Fatalf("relation not rendered as select:\n%s", form)
	}
	// The form posts to the same route the S87 server emits.
	if !strings.Contains(form, `action="/order"`) {
		t.Fatalf("form does not post to /order")
	}
}

func TestFixture_ControlSensorMatchesEvalState(t *testing.T) {
	arts, br := EmitFront(orderSpec())
	if br != nil {
		t.Fatalf("EmitFront refused: %s", br.Explanation)
	}
	var controls string
	for _, a := range arts {
		if a.Target == TargetControls {
			controls = string(a.Bytes)
		}
	}
	// The button binds the operation and is action-capable (data-aidos-invoke).
	if !strings.Contains(controls, `data-aidos-invoke="CreateOrder"`) {
		t.Fatalf("control button does not bind CreateOrder")
	}

	// Extract the data-aidos-fixture sensor JSON and parse it.
	sensor := extractSensor(t, controls)
	var parsed struct {
		Name string `json:"name"`
		Op   string `json:"op"`
		Rows []struct {
			Given   string `json:"given"`
			Visible bool   `json:"visible"`
			Enabled bool   `json:"enabled"`
		} `json:"rows"`
	}
	if err := json.Unmarshal([]byte(sensor), &parsed); err != nil {
		t.Fatalf("sensor is not valid JSON: %v\n%q", err, sensor)
	}
	if parsed.Op != "CreateOrder" || parsed.Name != "create-order" {
		t.Fatalf("sensor identity wrong: %+v", parsed)
	}

	// Build the SAME control as a kernel control-spec and prove the sensor rows equal
	// control.EvalState on the matching given — the sensor never drifts from the verticale.
	// The button is always VISIBLE on the order screen; it is ENABLED only when the cart is
	// non-empty. visible_when = true ; enabled_when = $.cartItems > 0.
	c := control.Control{
		Name:        "create-order",
		View:        "order",
		Label:       "order.create",
		VisibleWhen: lit(true),
		EnabledWhen: gt(refPath("cartItems"), lit(float64(0))),
		Triggers:    "CreateOrder",
	}
	givens := map[string]map[string]any{
		"cart-non-empty": {"cartItems": float64(2)},
		"cart-empty":     {"cartItems": float64(0)},
	}
	for _, row := range parsed.Rows {
		given, ok := givens[row.Given]
		if !ok {
			t.Fatalf("sensor row %q has no matching kernel given", row.Given)
		}
		st, err := control.EvalState(c, given)
		if err != nil {
			t.Fatalf("EvalState errored for %q: %v", row.Given, err)
		}
		if st.Visible != row.Visible || st.Enabled != row.Enabled {
			t.Fatalf("sensor row %q {%t,%t} != EvalState {%t,%t}", row.Given, row.Visible, row.Enabled, st.Visible, st.Enabled)
		}
	}
}

// extractSensor pulls the data-aidos-fixture attribute value out of the emitted controls. The
// value is a JSON-source literal (jsStr-escaped); we json.Unmarshal the literal to recover the
// inner JSON string the browser would see.
func extractSensor(t *testing.T, controls string) string {
	const marker = `data-aidos-fixture=`
	i := strings.Index(controls, marker)
	if i < 0 {
		t.Fatalf("no data-aidos-fixture in controls")
	}
	rest := controls[i+len(marker):]
	// The value starts at the next quote and is a JSON string literal.
	start := strings.IndexByte(rest, '"')
	if start < 0 {
		t.Fatalf("malformed sensor attribute")
	}
	// Find the matching close quote of the JSON string literal (honoring escapes).
	j := start + 1
	for j < len(rest) {
		if rest[j] == '\\' {
			j += 2
			continue
		}
		if rest[j] == '"' {
			break
		}
		j++
	}
	literal := rest[start : j+1]
	var inner string
	if err := json.Unmarshal([]byte(literal), &inner); err != nil {
		t.Fatalf("sensor literal not a JSON string: %v\n%q", err, literal)
	}
	return inner
}

// ── tiny Expr builders (reuse the kernel expr DSL — never re-implement) ──────────────────

func gt(a, b expr.Expr) expr.Expr { return expr.Call(">", a, b) }
func lit(v any) expr.Expr         { return expr.Lit(v) }
func refPath(p string) expr.Expr  { return expr.Ref("$." + p) }
