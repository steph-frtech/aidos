package interpretsvc

import (
	"encoding/json"
	"errors"
	"net/http"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// THE HTTP CONTRACT (the sidecar's wire shape — what Hono's `deps.interpret` calls):
//
//	GET  /healthz            → 200 { "status": "ok", "operations": [ …names… ] }
//	POST /interpret          → body { "operation": "<name>", "input": { … }, "auth": { … } }
//	                           200 { "operation", "result": { … }, "events": [ … ] }
//	GET  /list?entity=<e>     → 200 { "rows": [ { … }, … ] }
//
// The emitted honoemit server can call /interpret directly (its `interpret(op, input)` port → a
// POST /interpret with {operation, input}). The auth field is optional ($.auth; defaults to {}).
//
// GET /list is the READ-ONLY list door (the LIST verb): it returns EVERY row of an entity's emitted
// table in a stable order, so the served view's GET /entities/<e> fetch resolves to the real rows. It
// is DISTINCT from /interpret — a read, not a command — so it never enters operation.Interpret; it
// delegates to the injected Deps when it also implements Lister (the pgx DBDeps / the in-memory MemDeps).
//
// ERROR SHAPE (honest, never a panic, never a partial silent success):
//   - unknown operation              → 404 { "error": … }
//   - unknown entity (GET /list)     → 404 { "error": … }
//   - authorize DENY                 → 403 { "error": … }
//   - missing ?entity / list unsupported → 400 / 422 { "error": … }
//   - any other interpreter/seam err → 422 { "error": … }
//   - malformed body / wrong method  → 400 / 405 { "error": … }
//
// THE WALL (§2). The handler runs an operation (a below-the-line runtime effect) through the
// injected Deps; it writes no truth. DETERMINISM: the handler adds no clock/RNG — the response is
// a pure function of (registry, body, deps state).

// Server is the sidecar's HTTP handler: a Registry (the operation cut) + the Deps seams (the
// pgx-backed DBDeps in production, the in-memory MemDeps in the mirror). It is an http.Handler.
type Server struct {
	reg  *Registry
	deps operation.Deps
}

// NewServer builds the sidecar handler over a cut and its seams.
func NewServer(reg *Registry, deps operation.Deps) *Server {
	return &Server{reg: reg, deps: deps}
}

// interpretRequest is the POST /interpret body: the operation name, its input ($.input) and the
// optional caller auth ($.auth). The sidecar threads these straight into the State — it invents no
// field. auth defaults to an empty object when absent.
type interpretRequest struct {
	Operation string         `json:"operation"`
	Input     map[string]any `json:"input"`
	Auth      map[string]any `json:"auth"`
}

// errorBody is the honest error envelope.
type errorBody struct {
	Error string `json:"error"`
}

// ServeHTTP routes the three endpoints. An unknown path is 404; a wrong method is 405.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/healthz":
		s.handleHealthz(w, r)
	case "/interpret":
		s.handleInterpret(w, r)
	case "/list":
		s.handleList(w, r)
	default:
		writeJSON(w, http.StatusNotFound, errorBody{Error: "interpretsvc: no such endpoint: " + r.URL.Path})
	}
}

// handleHealthz answers GET /healthz with the liveness + the operation inventory (so an operator /
// the Hono server can confirm WHICH operations the sidecar serves).
func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody{Error: "interpretsvc: /healthz is GET-only"})
		return
	}
	names := s.reg.Names()
	sort.Strings(names) // deterministic inventory
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "operations": names})
}

// handleInterpret answers POST /interpret: decode the body, run the operation through Interpret,
// map the outcome (or the typed error) to the wire shape. It is the door honoemit's interpret port
// hits for every operation.
func (s *Server) handleInterpret(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody{Error: "interpretsvc: /interpret is POST-only"})
		return
	}
	var req interpretRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{Error: "interpretsvc: malformed body: " + err.Error()})
		return
	}
	if req.Operation == "" {
		writeJSON(w, http.StatusBadRequest, errorBody{Error: "interpretsvc: body pins no operation"})
		return
	}
	if req.Input == nil {
		req.Input = map[string]any{}
	}
	if req.Auth == nil {
		req.Auth = map[string]any{}
	}

	out, err := Interpret(s.reg, req.Operation, req.Input, req.Auth, s.deps)
	if err != nil {
		writeJSON(w, statusForError(err), errorBody{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// listBody is the GET /list response envelope: the entity's rows in a stable order. rows is always
// a JSON array (never null) — an empty table is { "rows": [] }, distinct from a 404 unknown entity.
type listBody struct {
	Rows []map[string]any `json:"rows"`
}

// handleList answers GET /list?entity=<e>: it reads EVERY row of the entity's emitted table through
// the injected Lister seam and returns { rows: [...] }. It is the READ-ONLY door the served view's
// GET /entities/<e> fetch resolves against — a read, never an operation, so it does not touch
// operation.Interpret. A missing ?entity is 400; a Deps that is not a Lister is 422 (the feature is
// unwired, honest); an unknown entity is 404 (fail-closed via ErrUnknownEntity); any other seam error
// is 422. It writes no truth and runs no effect (the wall §2).
func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody{Error: "interpretsvc: /list is GET-only"})
		return
	}
	entity := r.URL.Query().Get("entity")
	if entity == "" {
		writeJSON(w, http.StatusBadRequest, errorBody{Error: "interpretsvc: /list pins no entity (?entity=<name>)"})
		return
	}
	lister, ok := s.deps.(Lister)
	if !ok {
		writeJSON(w, http.StatusUnprocessableEntity, errorBody{Error: "interpretsvc: this deps does not support the list verb"})
		return
	}
	rows, err := lister.List(entity)
	if err != nil {
		writeJSON(w, statusForError(err), errorBody{Error: err.Error()})
		return
	}
	if rows == nil {
		rows = []map[string]any{} // never serialise null — an empty table is [], not null.
	}
	writeJSON(w, http.StatusOK, listBody{Rows: rows})
}

// statusForError maps an interpreter/seam error to an HTTP status — honest, typed, never a 500 for
// a known refusal: an unknown op/entity is 404, a DENY is 403, any other operation/seam failure is
// 422 (the command was well-formed but could not complete). A truly unexpected error would still be
// 422 (the sidecar never crashes the process on a bad request).
func statusForError(err error) int {
	switch {
	case errors.Is(err, ErrUnknownOperation), errors.Is(err, ErrUnknownEntity):
		return http.StatusNotFound
	case errors.Is(err, operation.ErrAuthorizationDenied):
		return http.StatusForbidden
	default:
		return http.StatusUnprocessableEntity
	}
}

// writeJSON writes a JSON response with the status, setting the content-type. A marshal failure
// (impossible for the shapes here) degrades to a 500 with a plain message — never a panic.
func writeJSON(w http.ResponseWriter, status int, body any) {
	b, err := json.Marshal(body)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"interpretsvc: response marshal failed"}`))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(b)
}
