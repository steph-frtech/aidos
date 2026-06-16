package appdata

// projectserver_test.go — le MIROIR (rouge→vert) du câblage du PROJECTEUR D'OPÉRATIONS dans le chemin
// d'émission par projet (déterminisme-first §6/§8, le mur §2). Écrit ROUGE avant projectserver.go.
//
// L'intention : aujourd'hui le déploiement par projet (EmitProjectData) n'émet QUE les entités (le CRUD
// générique aidos-app) — il n'émet AUCUNE opération (le trou : honoemit.EmitServer n'est pas branché).
// EmitProjectServer COMBLE le trou DE FAÇON ADDITIVE en RÉUTILISANT honoemit.EmitServer (jamais un
// second projecteur) :
//   - sans op → sortie IDENTIQUE à EmitProjectData (le CRUD générique, zéro régression) ;
//   - avec op → émet AUSSI le serveur d'opérations (+ worker si async).
//
// Les trois lois prouvées : (1) la route de l'op apparaît dans la source du serveur (réutilise les
// assertions de honoemit_fixture_test) ; (2) sans op, schema+entities.json sont byte-identiques à
// EmitProjectData (l'additivité) ; (3) re-émission ×2 → bytes identiques (reproductibilité).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// orderEntity is the small fixture catalogue (one entity), shared across the mirror.
func orderEntity() []generators.EntitySource {
	return []generators.EntitySource{
		{ID: "e_Order", Kind: generators.KindEntity, Name: "Order", Fields: []generators.Field{
			{Name: "id", Type: "text"}, {Name: "total", Type: "numeric"},
		}},
	}
}

// TestEmitProjectServer_OpsEmitTheOperationRoute — GIVEN a project {Order, ops:[createOrder]}, WHEN we
// emit the project server, THEN the server SOURCE carries the createOrder route (POST /createorder),
// reusing the honoemit fixture's structural assertion. The operation projector is WIRED into the
// per-project emission path (the gap, closed).
func TestEmitProjectServer_OpsEmitTheOperationRoute(t *testing.T) {
	ps, err := EmitProjectServer("shop", orderEntity(), []honoemit.Op{{Name: "createOrder"}})
	if err != nil {
		t.Fatalf("EmitProjectServer refused a valid project+ops cut: %v", err)
	}
	// The entity layer is still emitted (additive, never replaced).
	if len(ps.Schema) == 0 || len(ps.EntitiesJSON) == 0 {
		t.Fatalf("EmitProjectServer dropped the entity data layer (schema/entities.json empty)")
	}
	// The operation server is now ALSO emitted — its source carries the createOrder route.
	if ps.Server == nil {
		t.Fatalf("ops present but no server artifact emitted (the operation projector is not wired)")
	}
	src := string(ps.Server.Bytes)
	if !strings.Contains(src, `app.post("/createorder"`) {
		t.Fatalf("emitted server missing the createOrder route:\n%s", src)
	}
}

// TestEmitProjectServer_NoOps_IdenticalToEmitProjectData — GIVEN a project {Order, ops:[]}, the output's
// data layer is BYTE-IDENTICAL to a direct EmitProjectData call AND no server/worker is emitted. This
// PROVES the additivity: an entities-only project (demoshop/techstore) is untouched — zero regression.
func TestEmitProjectServer_NoOps_IdenticalToEmitProjectData(t *testing.T) {
	wantSchema, wantEntities, err := EmitProjectData("shop", orderEntity())
	if err != nil {
		t.Fatalf("EmitProjectData refused: %v", err)
	}
	ps, err := EmitProjectServer("shop", orderEntity(), nil)
	if err != nil {
		t.Fatalf("EmitProjectServer refused the entities-only cut: %v", err)
	}
	if string(ps.Schema) != string(wantSchema) {
		t.Fatalf("entities-only schema diverged from EmitProjectData (additivity broken)")
	}
	if string(ps.EntitiesJSON) != string(wantEntities) {
		t.Fatalf("entities-only entities.json diverged from EmitProjectData (additivity broken)")
	}
	if ps.Server != nil || ps.Worker != nil {
		t.Fatalf("no ops, yet a server/worker was emitted (the CRUD-only path must stay headless of ops)")
	}
}

// TestEmitProjectServer_AsyncOp_EmitsWorker — GIVEN an async op (sendReceipt), the worker is ALSO emitted
// and carries the async dispatcher; the async op is NOT an HTTP route (it lives in the worker). Mirrors
// the honoemit fixture's sync/async split through the per-project path.
func TestEmitProjectServer_AsyncOp_EmitsWorker(t *testing.T) {
	ops := []honoemit.Op{
		{Name: "createOrder"},
		{Name: "sendReceipt", Async: true, Trigger: operation.AsyncTrigger{Kind: operation.TriggerNotification}},
	}
	ps, err := EmitProjectServer("shop", orderEntity(), ops)
	if err != nil {
		t.Fatalf("EmitProjectServer refused a valid sync+async cut: %v", err)
	}
	if ps.Server == nil || ps.Worker == nil {
		t.Fatalf("async op present but server/worker not both emitted")
	}
	srv := string(ps.Server.Bytes)
	if strings.Contains(srv, "/sendreceipt") {
		t.Fatalf("async op must NOT be an HTTP route (it is a worker dispatcher):\n%s", srv)
	}
	if !strings.Contains(string(ps.Worker.Bytes), "dispatchSendReceipt") {
		t.Fatalf("worker missing the async dispatcher:\n%s", ps.Worker.Bytes)
	}
}

// TestEmitProjectServer_ByteStable — re-emitting the same cut twice yields byte-identical artifacts
// across the WHOLE bundle (schema, entities.json, server, worker). The reproducibility mirror.
func TestEmitProjectServer_ByteStable(t *testing.T) {
	ops := []honoemit.Op{
		{Name: "createOrder"},
		{Name: "sendReceipt", Async: true, Trigger: operation.AsyncTrigger{Kind: operation.TriggerNotification}},
	}
	a, err := EmitProjectServer("shop", orderEntity(), ops)
	if err != nil {
		t.Fatalf("first EmitProjectServer refused: %v", err)
	}
	b, err := EmitProjectServer("shop", orderEntity(), ops)
	if err != nil {
		t.Fatalf("second EmitProjectServer refused: %v", err)
	}
	if string(a.Schema) != string(b.Schema) || string(a.EntitiesJSON) != string(b.EntitiesJSON) {
		t.Fatalf("data layer not byte-identical across runs")
	}
	if string(a.Server.Bytes) != string(b.Server.Bytes) {
		t.Fatalf("server.ts not byte-identical across runs")
	}
	if string(a.Worker.Bytes) != string(b.Worker.Bytes) {
		t.Fatalf("worker.ts not byte-identical across runs")
	}
}

// TestEmitProjectServer_Refusals — the honesty rule, surfaced from BOTH layers: an empty project / no
// entities is refused (the data layer's rule); a malformed op (unnamed) is refused as the honoemit
// BlockReason folded into an error (never a partial render, never a panic).
func TestEmitProjectServer_Refusals(t *testing.T) {
	if _, err := EmitProjectServer("", orderEntity(), nil); err == nil {
		t.Fatalf("empty project was NOT refused")
	}
	if _, err := EmitProjectServer("shop", nil, nil); err == nil {
		t.Fatalf("no entities was NOT refused")
	}
	if _, err := EmitProjectServer("shop", orderEntity(), []honoemit.Op{{Name: ""}}); err == nil {
		t.Fatalf("a malformed op (unnamed) was NOT refused")
	}
}
