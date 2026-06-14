package interpretsvc

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// THE HTTP CONTRACT MIRROR. The sidecar's wire shape is what the emitted Hono server's
// `deps.interpret(op, input)` calls. This proves POST /interpret runs createOrder end to end
// (through the real interpreter + the in-memory seams) and returns the §93 events + the created
// order, and that GET /healthz reports the operation inventory — over real HTTP (httptest).

func newTestServer(t *testing.T) (*httptest.Server, *MemStore) {
	t.Helper()
	reg, err := NewRegistry([]operation.Operation{operation.CreateOrder()})
	if err != nil {
		t.Fatalf("registry: %v", err)
	}
	store := seededCartStore()
	srv := httptest.NewServer(NewServer(reg, NewMemDeps(store)))
	t.Cleanup(srv.Close)
	return srv, store
}

func TestHTTP_Healthz(t *testing.T) {
	srv, _ := newTestServer(t)
	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var body struct {
		Status     string   `json:"status"`
		Operations []string `json:"operations"`
	}
	mustDecode(t, resp.Body, &body)
	if body.Status != "ok" {
		t.Errorf("expected status ok, got %q", body.Status)
	}
	if len(body.Operations) != 1 || body.Operations[0] != "createOrder" {
		t.Errorf("expected [createOrder] in the inventory, got %v", body.Operations)
	}
}

func TestHTTP_InterpretCreateOrder(t *testing.T) {
	srv, store := newTestServer(t)

	reqBody := `{"operation":"createOrder","input":{"cartId":"cart-1"},"auth":{"user":{"id":"u-1"}}}`
	resp, err := http.Post(srv.URL+"/interpret", "application/json", strings.NewReader(reqBody))
	if err != nil {
		t.Fatalf("POST /interpret: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, b)
	}

	var out Outcome
	mustDecode(t, resp.Body, &out)
	if out.Operation != "createOrder" {
		t.Errorf("expected operation createOrder, got %q", out.Operation)
	}
	wantEvents := []string{"OrderCreated", "CartCleared"}
	if len(out.Events) != 2 || out.Events[0] != wantEvents[0] || out.Events[1] != wantEvents[1] {
		t.Errorf("expected events %v, got %v", wantEvents, out.Events)
	}
	if out.Result == nil || out.Result["status"] != "pending" {
		t.Errorf("expected result.status pending, got %v", out.Result)
	}
	// The effect landed in the store: one Order created, cart cleared.
	if orders := store.Rows("Order"); len(orders) != 1 {
		t.Errorf("expected 1 Order in the store, got %d", len(orders))
	}
}

func TestHTTP_UnknownOperationIs404(t *testing.T) {
	srv, _ := newTestServer(t)
	resp, err := http.Post(srv.URL+"/interpret", "application/json",
		strings.NewReader(`{"operation":"nope","input":{}}`))
	if err != nil {
		t.Fatalf("POST: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for an unknown op, got %d", resp.StatusCode)
	}
}

func TestHTTP_DeniedAuthorizeIs403(t *testing.T) {
	reg, _ := NewRegistry([]operation.Operation{operation.CreateOrder()})
	store := seededCartStore()
	deps := NewMemDeps(store)
	deps.Allow = false
	srv := httptest.NewServer(NewServer(reg, deps))
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/interpret", "application/json",
		strings.NewReader(`{"operation":"createOrder","input":{"cartId":"cart-1"},"auth":{"user":{"id":"u-1"}}}`))
	if err != nil {
		t.Fatalf("POST: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for a denied authorize, got %d", resp.StatusCode)
	}
	if orders := store.Rows("Order"); len(orders) != 0 {
		t.Errorf("a denied authorize must create no order, got %d", len(orders))
	}
}

func TestHTTP_MalformedBodyIs400(t *testing.T) {
	srv, _ := newTestServer(t)
	resp, err := http.Post(srv.URL+"/interpret", "application/json", bytes.NewReader([]byte("not json")))
	if err != nil {
		t.Fatalf("POST: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for a malformed body, got %d", resp.StatusCode)
	}
}

func TestHTTP_WrongMethodIs405(t *testing.T) {
	srv, _ := newTestServer(t)
	resp, err := http.Get(srv.URL + "/interpret")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 for GET /interpret, got %d", resp.StatusCode)
	}
}

func mustDecode(t *testing.T, r io.Reader, v any) {
	t.Helper()
	if err := json.NewDecoder(r).Decode(v); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}
