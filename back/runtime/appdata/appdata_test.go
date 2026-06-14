package appdata

// appdata_test.go — le MIROIR de l'émission de données PAR PROJET (déterminisme-first, le mur).
//
// EmitProjectData(project, entities) est une FONCTION PURE, byte-stable : mêmes entités → même
// schema/entities.json ; des entités DIFFÉRENTES → des schémas DIFFÉRENTS (la sensibilité aux
// entités — sinon le projet X recevrait le seed d'un autre). C'est exactement la généralisation de
// la preuve en or : aidosappemit n'émet QUE les données que Pulumi monte.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/generators"
)

// twoEntities is a small, distinct catalogue used across the mirror.
func twoEntities() []generators.EntitySource {
	return []generators.EntitySource{
		{ID: "e_Widget", Kind: generators.KindEntity, Name: "Widget", Fields: []generators.Field{
			{Name: "sku", Type: "text"}, {Name: "qty", Type: "int"},
		}},
		{ID: "e_Order", Kind: generators.KindEntity, Name: "Order", Fields: []generators.Field{
			{Name: "id", Type: "text"}, {Name: "total", Type: "numeric"},
		}},
	}
}

// TestEmitProjectData_ByteStable — same (project, entities) → byte-identical schema + entities.json,
// twice (the reproducibility mirror). No clock, no RNG.
func TestEmitProjectData_ByteStable(t *testing.T) {
	s1, e1, err := EmitProjectData("shop", twoEntities())
	if err != nil {
		t.Fatalf("EmitProjectData refused a valid catalogue: %v", err)
	}
	s2, e2, err := EmitProjectData("shop", twoEntities())
	if err != nil {
		t.Fatalf("second EmitProjectData refused: %v", err)
	}
	if string(s1) != string(s2) {
		t.Fatalf("schema.sql not byte-identical across runs")
	}
	if string(e1) != string(e2) {
		t.Fatalf("entities.json not byte-identical across runs")
	}
}

// TestEmitProjectData_EntitySensitive — DIFFERENT entities → DIFFERENT schemas. The projet X must
// receive ITS OWN tables, never another project's seed. A constant schema would be the bug this pins.
func TestEmitProjectData_EntitySensitive(t *testing.T) {
	a, _, err := EmitProjectData("shop", twoEntities())
	if err != nil {
		t.Fatalf("EmitProjectData(twoEntities) refused: %v", err)
	}
	other := []generators.EntitySource{
		{ID: "e_Invoice", Kind: generators.KindEntity, Name: "Invoice", Fields: []generators.Field{
			{Name: "number", Type: "text"}, {Name: "amount", Type: "numeric"},
		}},
	}
	b, _, err := EmitProjectData("shop", other)
	if err != nil {
		t.Fatalf("EmitProjectData(other) refused: %v", err)
	}
	if string(a) == string(b) {
		t.Fatalf("different entities produced the SAME schema (entity-insensitive — the Alpha-Shop-hardwire bug)")
	}
	if !strings.Contains(string(b), "invoice") {
		t.Fatalf("the Invoice entity's table is missing from its own schema:\n%s", string(b))
	}
	if strings.Contains(string(b), "widget") {
		t.Fatalf("a foreign entity (widget) leaked into the Invoice project schema")
	}
}

// TestEmitProjectData_ProjectInHeader — the schema header names the PROJECT, so two projects sharing
// an entity set still differ (the schema is content-addressed to the project, not just the entities).
func TestEmitProjectData_ProjectInHeader(t *testing.T) {
	a, _, err := EmitProjectData("alpha", twoEntities())
	if err != nil {
		t.Fatalf("EmitProjectData(alpha) refused: %v", err)
	}
	b, _, err := EmitProjectData("beta", twoEntities())
	if err != nil {
		t.Fatalf("EmitProjectData(beta) refused: %v", err)
	}
	if !strings.Contains(string(a), `"alpha"`) {
		t.Fatalf("schema header does not name the project alpha:\n%s", string(a))
	}
	if string(a) == string(b) {
		t.Fatalf("two projects with the same entities produced byte-identical schemas (project not in the address)")
	}
}

// TestEmitProjectData_EntitiesJSON — entities.json carries one record per entity with the lowercase
// table name (what the generic admin server reads to serve a CRUD UI per entity).
func TestEmitProjectData_EntitiesJSON(t *testing.T) {
	_, ej, err := EmitProjectData("shop", twoEntities())
	if err != nil {
		t.Fatalf("EmitProjectData refused: %v", err)
	}
	for _, want := range []string{`"name": "Widget"`, `"table": "widget"`, `"name": "Order"`, `"table": "order"`} {
		if !strings.Contains(string(ej), want) {
			t.Fatalf("entities.json missing %q:\n%s", want, string(ej))
		}
	}
}

// TestEmitProjectData_Refusals — the honesty rule: an empty project or no entities is a typed error,
// never a partial render.
func TestEmitProjectData_Refusals(t *testing.T) {
	if _, _, err := EmitProjectData("", twoEntities()); err == nil {
		t.Fatalf("empty project was NOT refused")
	}
	if _, _, err := EmitProjectData("shop", nil); err == nil {
		t.Fatalf("no entities was NOT refused")
	}
}

// TestDecodeEntities_DefaultsKind — a hand-authored catalogue may omit the kind; the decoder defaults
// it to entity so EmitProjectData accepts it.
func TestDecodeEntities_DefaultsKind(t *testing.T) {
	ents, err := DecodeEntities([]byte(`[{"id":"e_Foo","name":"Foo","fields":[{"name":"x","type":"text"}]}]`))
	if err != nil {
		t.Fatalf("DecodeEntities refused a valid file: %v", err)
	}
	if len(ents) != 1 || ents[0].Kind != generators.KindEntity {
		t.Fatalf("DecodeEntities did not default the kind to entity: %+v", ents)
	}
	if _, _, err := EmitProjectData("foo", ents); err != nil {
		t.Fatalf("EmitProjectData refused a decoded kind-less entity: %v", err)
	}
}

// TestTableName — the lowercase table mapping mirrors the gen/db emitter.
func TestTableName(t *testing.T) {
	for in, want := range map[string]string{"Product": "product", "OrderLine": "orderline", "x": "x"} {
		if got := TableName(in); got != want {
			t.Fatalf("TableName(%q) = %q, want %q", in, got, want)
		}
	}
}
