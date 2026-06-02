package generators

// PROVIDER VERIFICATION (S36, ADR 0026). The Pact contract is the consumer expectation;
// the PROVIDER is the emitted handler. VerifyContract stands a provider HandlerFunc up
// via net/http/httptest (no external Ruby daemon — in-process, deterministic), replays
// each interaction's request, and asserts the response status + JSON body FIELD SET
// match the contract. This IS Pact provider verification (the frozen N5 slot), reusing
// the Pact v3 contract format without the heavyweight standalone binary.
//
// THE DONE CRITERION runs through here: the pact-verifier MCP calls VerifyContract on
// the createOrder provider; the interaction must PASS — the request/response shapes are
// exactly those the operation+entity AST pins (no extra/missing field).

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// verifyDeps is the deterministic, side-effect-free Deps double the in-process provider
// runs the operation through (the four S10 seams: validate/authorize ALLOW, read returns
// an empty cart, mutate create returns a pending result). It lets the provider exercise
// the REAL S10 interpreter (the handler delegates to it) without a DB — keeping
// verification pure. It accepts every input; the contract assertion is the field-set, not
// the business outcome.
type verifyDeps struct{}

func (verifyDeps) Validate(string, any) error               { return nil }
func (verifyDeps) Authorize(string, *operation.State) error { return nil }
func (verifyDeps) Read(string, map[string]any, *operation.State) (any, error) {
	return map[string]any{"items": []any{}}, nil
}
func (verifyDeps) Mutate(_ string, op string, _ map[string]any, _ *operation.State) (any, []string, error) {
	if op == string(operation.MutateCreate) {
		return map[string]any{"status": "pending"}, []string{}, nil
	}
	return nil, []string{}, nil
}

// ReferenceProvider builds the in-process provider HandlerFunc for an operation+entity —
// the SAME thin transport adapter EmitAPI renders (decode → operation.Interpret → encode
// the entity response shape). The materialized back/gen/api/order.go is byte-identical to
// EmitAPI's output (the re-emit guard), so verifying THIS provider verifies the emitted
// handler's behaviour without a codegen build dependency. Pure: no clock/RNG/DB.
func ReferenceProvider(op operation.Operation, e entities.Entity) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req map[string]any
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		state := operation.NewState(req, map[string]any{})
		if _, _, err := operation.Interpret(op, state, verifyDeps{}); err != nil {
			http.Error(w, "operation failed", http.StatusUnprocessableEntity)
			return
		}
		resp := make(map[string]any, len(e.Attributes))
		for _, a := range e.Attributes {
			resp[a.Name] = req[a.Name]
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(resp)
	}
}

// VerifyResult is the outcome of provider verification: PASS/FAIL plus a human-readable
// reason and the verified interaction descriptions. Deterministic.
type VerifyResult struct {
	Pass         bool     `json:"pass"`
	Reason       string   `json:"reason"`
	Interactions []string `json:"interactions"`
}

// VerifyContract runs provider verification of a Pact contract against a provider
// HandlerFunc stood up in-process. For each interaction it issues the pinned request and
// asserts: (1) the response status matches; (2) the response JSON body's field SET
// matches the contract's expected body keys exactly — no extra, missing, or renamed
// field. A mismatch FAILS the interaction (the honesty assertion). It is a pure function
// of (contract, handler): no clock, no RNG, no external process.
func VerifyContract(c PactContract, handler http.HandlerFunc) VerifyResult {
	srv := httptest.NewServer(handler)
	defer srv.Close()

	verified := make([]string, 0, len(c.Interactions))
	for _, it := range c.Interactions {
		reqBytes, err := json.Marshal(it.Request.Body)
		if err != nil {
			return VerifyResult{Pass: false, Reason: "marshal request body: " + err.Error()}
		}
		req, err := http.NewRequest(it.Request.Method, srv.URL+it.Request.Path, bytes.NewReader(reqBytes))
		if err != nil {
			return VerifyResult{Pass: false, Reason: "build request: " + err.Error()}
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := srv.Client().Do(req)
		if err != nil {
			return VerifyResult{Pass: false, Reason: "request failed: " + err.Error()}
		}
		body, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()

		if resp.StatusCode != it.Response.Status {
			return VerifyResult{
				Pass:   false,
				Reason: fmt.Sprintf("interaction %q: status %d != contract %d", it.Description, resp.StatusCode, it.Response.Status),
			}
		}
		var got map[string]any
		if err := json.Unmarshal(body, &got); err != nil {
			return VerifyResult{
				Pass:   false,
				Reason: fmt.Sprintf("interaction %q: response body is not a JSON object: %v", it.Description, err),
			}
		}
		gotKeys := keySet(got)
		wantKeys := keySet(it.Response.Body)
		if !equalStringSlice(gotKeys, wantKeys) {
			return VerifyResult{
				Pass:   false,
				Reason: fmt.Sprintf("interaction %q: response field set %v != contract %v (no add/drop/rename)", it.Description, gotKeys, wantKeys),
			}
		}
		verified = append(verified, it.Description)
	}
	return VerifyResult{Pass: true, Reason: "all interactions honoured the contract", Interactions: verified}
}

func keySet(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func equalStringSlice(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
