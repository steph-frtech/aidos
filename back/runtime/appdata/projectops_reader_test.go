package appdata

// projectops_reader_test.go — le MIROIR (rouge→vert) du LECTEUR d'opérations par projet + son MAPPING
// PUR vers honoemit.Op (déterminisme-first §6/§8, le mur §2). Écrit ROUGE avant projectops_reader.go.
//
// L'intention : projectOps (materialise_hono.go) renvoie aujourd'hui l'ancre statique createOrder. On
// rebranche la LECTURE sur kernel.operation. Le lecteur SELECT-only décode le body JSONB (AST Operation
// + bloc Async optionnel) et le MAPPE PUREMENT vers honoemit.Op (Name + Async + Trigger). Le mirror
// prouve le mapping et la projection sans toucher la prod : il injecte un OpSource MOCK, JAMAIS la vraie
// DB (le mapping est PUR, l'I/O est isolée derrière la seam).
//
// Les lois prouvées : (1) un AST sync {name:createOrder, emits:[OrderCreated]} → Op{Name:createOrder}
// (Async false) ; (2) un AST async {async:{trigger:cron,…}} → Op{Async:true, Trigger:cron} ; (3) la
// projection via une source fixture (mock) rend l'ordre de la source ; (4) re-mapping ×2 → identique
// (reproductibilité) ; (5) une source vide → 0 op (le cut CRUD-only en aval).

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// mockOpSource is the in-memory OpSource the mirror injects — NEVER the real DB. It returns the fixture
// rows verbatim (or a forced error), so the pure mapping + the projection orchestration are proven
// without Postgres (determinism-first: the mapping is pure, the I/O is isolated behind the seam).
type mockOpSource struct {
	rows []OpRow
	err  error
}

func (m mockOpSource) ProjectOps(_ context.Context, _ string) ([]OpRow, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.rows, nil
}

// syncBody is the decoded body of the §93 sync anchor createOrder (no async block).
func syncBody() operationBody {
	return operationBody{Name: "createOrder", Input: "CreateOrderInput", Emits: []string{"OrderCreated", "CartCleared"}}
}

// asyncBody is the decoded body of the S73 async anchor sendReminder (a cron trigger).
func asyncBody() operationBody {
	return operationBody{
		Name:  "sendReminder",
		Input: "SendReminderInput",
		Emits: []string{"ReminderSent"},
		Async: &operation.Async{
			Trigger: operation.AsyncTrigger{Kind: operation.TriggerCron, At: "2026-06-08T09:00:00Z"},
			Effects: []operation.Effect{{Kind: operation.TriggerNotification, Target: "user@example.com"}},
		},
	}
}

// TestMapOperationToOp_Sync — a SYNC operation body maps to Op{Name, Async:false} with a zero trigger.
// The mapping derives the route key from the name and never marks a no-async-block op async.
func TestMapOperationToOp_Sync(t *testing.T) {
	op := mapOperationToOp(syncBody())
	if op.Name != "createOrder" {
		t.Fatalf("sync op name = %q, want createOrder", op.Name)
	}
	if op.Async {
		t.Fatalf("a body with no async block mapped to an ASYNC op — must be sync")
	}
	if op.Trigger != (operation.AsyncTrigger{}) {
		t.Fatalf("a sync op carried a non-zero trigger %+v — must be the zero AsyncTrigger", op.Trigger)
	}
}

// TestMapOperationToOp_Async — an ASYNC operation body maps to Op{Async:true, Trigger:<the block's>}.
// The async flag drives the worker dispatcher (S73) and the trigger is carried through verbatim.
func TestMapOperationToOp_Async(t *testing.T) {
	op := mapOperationToOp(asyncBody())
	if op.Name != "sendReminder" {
		t.Fatalf("async op name = %q, want sendReminder", op.Name)
	}
	if !op.Async {
		t.Fatalf("a body WITH an async block mapped to a SYNC op — must be async")
	}
	if op.Trigger.Kind != operation.TriggerCron || op.Trigger.At != "2026-06-08T09:00:00Z" {
		t.Fatalf("async op trigger = %+v, want {cron, 2026-06-08T09:00:00Z}", op.Trigger)
	}
}

// TestProjectOpsFromSource_MapsSourceRows — GIVEN a MOCK source with [createOrder(sync), sendReminder(
// async)], WHEN we project, THEN we get the two Ops in source order with the right async flags. Proves
// the orchestration over the injected seam (no DB) — the function the prod reader reuses.
func TestProjectOpsFromSource_MapsSourceRows(t *testing.T) {
	src := mockOpSource{rows: []OpRow{{Body: syncBody()}, {Body: asyncBody()}}}
	got, err := ProjectOpsFromSource(context.Background(), src, "shop")
	if err != nil {
		t.Fatalf("ProjectOpsFromSource refused a valid mock source: %v", err)
	}
	want := []honoemit.Op{
		{Name: "createOrder"},
		{Name: "sendReminder", Async: true, Trigger: operation.AsyncTrigger{Kind: operation.TriggerCron, At: "2026-06-08T09:00:00Z"}},
	}
	if len(got) != len(want) {
		t.Fatalf("projected %d ops, want %d: %+v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("op[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}
}

// TestProjectOpsFromSource_Deterministic — re-projecting the SAME source twice yields byte-identical Ops
// (reproducibility — the mapping is a pure function of its input, no clock/RNG/LLM).
func TestProjectOpsFromSource_Deterministic(t *testing.T) {
	src := mockOpSource{rows: []OpRow{{Body: syncBody()}, {Body: asyncBody()}}}
	a, err := ProjectOpsFromSource(context.Background(), src, "shop")
	if err != nil {
		t.Fatalf("first projection: %v", err)
	}
	b, err := ProjectOpsFromSource(context.Background(), src, "shop")
	if err != nil {
		t.Fatalf("second projection: %v", err)
	}
	if len(a) != len(b) {
		t.Fatalf("non-deterministic length: %d vs %d", len(a), len(b))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("op[%d] differs across runs: %+v vs %+v", i, a[i], b[i])
		}
	}
}

// TestProjectOpsFromSource_EmptySourceZeroOps — a project with NO operations projects to ZERO Ops. In
// the materialiser this routes to the CRUD-only path (EmitProjectData byte-identical) — the additivity.
func TestProjectOpsFromSource_EmptySourceZeroOps(t *testing.T) {
	got, err := ProjectOpsFromSource(context.Background(), mockOpSource{}, "empty-project")
	if err != nil {
		t.Fatalf("ProjectOpsFromSource refused an empty source: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("an empty source projected %d ops, want 0: %+v", len(got), got)
	}
}

// TestProjectOpsFromSource_SourceErrorSurfaces — a source error is surfaced verbatim (never a partial /
// invented cut). The reader honesty (the wall: it never fabricates an operation the truth-store lacks).
func TestProjectOpsFromSource_SourceErrorSurfaces(t *testing.T) {
	boom := errors.New("kernel.operation does not exist yet (S17/S31 forward-dep)")
	_, err := ProjectOpsFromSource(context.Background(), mockOpSource{err: boom}, "shop")
	if err == nil {
		t.Fatalf("a source error was swallowed — the reader must surface it, never fabricate a cut")
	}
	if !errors.Is(err, boom) {
		t.Fatalf("the source error was not wrapped: %v", err)
	}
}

// TestEmitProjectServer_FromReaderOps — the END-TO-END seam: the Ops a project source yields, fed to
// EmitProjectServer, emit that op's route. Proves the reader's cut drives the real per-project emission
// (1 op → the server route; the additivity of 0 ops is covered by projectserver_test.go).
func TestEmitProjectServer_FromReaderOps(t *testing.T) {
	ops, err := ProjectOpsFromSource(context.Background(), mockOpSource{rows: []OpRow{{Body: syncBody()}}}, "shop")
	if err != nil {
		t.Fatalf("project ops: %v", err)
	}
	ps, err := EmitProjectServer("shop", orderEntity(), ops)
	if err != nil {
		t.Fatalf("EmitProjectServer refused the reader's ops cut: %v", err)
	}
	if ps.Server == nil {
		t.Fatalf("the reader's op did not reach the emitted server (Server nil)")
	}
	// The op's ROUTE must actually appear in the emitted server SOURCE — not just a non-nil
	// artifact. createOrder → routeOf → /createorder (honoemit.go). This makes permanent the
	// proof that the reader's AST cut drives a REAL emitted route (anti-Goodhart: a non-nil
	// Server could be empty; the route literal cannot be faked).
	if want := `app.post("/createorder"`; !strings.Contains(string(ps.Server.Bytes), want) {
		t.Fatalf("emitted server must carry the reader op's route %q; bytes lacked it", want)
	}
}
