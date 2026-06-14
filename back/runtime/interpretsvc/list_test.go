package interpretsvc

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// THE LIST MIRROR (RED → GREEN). The sidecar gains a READ-ONLY list verb: every row of an entity's
// emitted table, in a DETERMINISTIC order, so the served view's GET /entities/<e> fetch resolves to
// the REAL rows instead of an honest-but-empty []. It is a DISTINCT door from /interpret — a read,
// not a command, so it never enters operation.Interpret (CLAUDE.md §8 honesty). These prove:
//   - List returns the inserted rows (2 seeded → 2 returned), in a stable order;
//   - an unknown entity is REFUSED (ErrUnknownEntity), never a silent empty list;
//   - GET /list?entity=<e> returns { rows: [...] } over real HTTP;
//   - the HTTP error shape is honest (missing ?entity → 400, unknown entity → 404).

// seededListStore plants two Order rows (out of id order on purpose) so List proves the stable sort.
func seededListStore() *MemStore {
	store := NewMemStore()
	store.Seed("Order", map[string]any{"id": "order-2", "status": "shipped", "total": 5.0})
	store.Seed("Order", map[string]any{"id": "order-1", "status": "pending", "total": 15.0})
	return store
}

func TestMemDepsList_ReturnsSeededRowsInDeterministicOrder(t *testing.T) {
	deps := NewMemDeps(seededListStore())

	rows, err := deps.List("Order")
	if err != nil {
		t.Fatalf("List(Order): unexpected error: %v", err)
	}
	// The fixture seeded 2 rows → List returns exactly 2 (no phantom, no dropped row).
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d (%v)", len(rows), rows)
	}
	// Deterministic order: sorted by the `id` pk (order-1 before order-2), NOT insertion order.
	if rows[0]["id"] != "order-1" || rows[1]["id"] != "order-2" {
		t.Fatalf("expected rows ordered by id [order-1, order-2], got [%v, %v]", rows[0]["id"], rows[1]["id"])
	}
	// The rows carry their real columns (the read decodes nothing here — scalars pass through).
	if rows[0]["status"] != "pending" {
		t.Errorf("expected order-1 status pending, got %v", rows[0]["status"])
	}
}

func TestMemDepsList_UnknownEntityRefused(t *testing.T) {
	deps := NewMemDeps(seededListStore())
	_, err := deps.List("Nope")
	if !errors.Is(err, ErrUnknownEntity) {
		t.Fatalf("expected ErrUnknownEntity for an unseen entity, got %v", err)
	}
}

// Determinism: two List calls over the same store yield byte-identical row order (the sort is pure).
func TestMemDepsList_Deterministic(t *testing.T) {
	deps := NewMemDeps(seededListStore())
	a, errA := deps.List("Order")
	b, errB := deps.List("Order")
	if errA != nil || errB != nil {
		t.Fatalf("List errors: %v / %v", errA, errB)
	}
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	if string(ja) != string(jb) {
		t.Fatalf("List is not deterministic:\n%s\nvs\n%s", ja, jb)
	}
}

// ── The HTTP /list door ───────────────────────────────────────────────────────────────────────

func newListServer(t *testing.T) *httptest.Server {
	t.Helper()
	reg, err := NewRegistry([]operation.Operation{operation.CreateOrder()})
	if err != nil {
		t.Fatalf("registry: %v", err)
	}
	srv := httptest.NewServer(NewServer(reg, NewMemDeps(seededListStore())))
	t.Cleanup(srv.Close)
	return srv
}

func TestHTTP_List_ReturnsRows(t *testing.T) {
	srv := newListServer(t)
	resp, err := http.Get(srv.URL + "/list?entity=Order")
	if err != nil {
		t.Fatalf("GET /list: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, b)
	}
	var body struct {
		Rows []map[string]any `json:"rows"`
	}
	mustDecode(t, resp.Body, &body)
	if len(body.Rows) != 2 {
		t.Fatalf("expected 2 rows in the envelope, got %d (%v)", len(body.Rows), body.Rows)
	}
	if body.Rows[0]["id"] != "order-1" || body.Rows[1]["id"] != "order-2" {
		t.Fatalf("expected rows ordered by id, got [%v, %v]", body.Rows[0]["id"], body.Rows[1]["id"])
	}
}

func TestHTTP_List_MissingEntityIs400(t *testing.T) {
	srv := newListServer(t)
	resp, err := http.Get(srv.URL + "/list")
	if err != nil {
		t.Fatalf("GET /list: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for a missing ?entity, got %d", resp.StatusCode)
	}
}

func TestHTTP_List_UnknownEntityIs404(t *testing.T) {
	srv := newListServer(t)
	resp, err := http.Get(srv.URL + "/list?entity=Nope")
	if err != nil {
		t.Fatalf("GET /list: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for an unknown entity, got %d", resp.StatusCode)
	}
}

func TestHTTP_List_WrongMethodIs405(t *testing.T) {
	srv := newListServer(t)
	resp, err := http.Post(srv.URL+"/list?entity=Order", "application/json", nil)
	if err != nil {
		t.Fatalf("POST /list: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 for POST /list, got %d", resp.StatusCode)
	}
}
