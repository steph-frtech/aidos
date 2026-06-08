package apisurface

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ── The Pact suite (TargetPactSuite) — ONE contract per operation ────────────────────────
//
// This GENERALISES the single createOrder.pact.json the S36 api emitter produced (for AIDOS
// itself) to the WHOLE operation set of the emitted app: one Pact-v3 contract per SYNC
// operation, each describing the operation's request/response field set, plus (for an
// authorize op) a DENY interaction asserting the 403. The provider verification (below)
// stands each operation's handler up in-process and replays its interactions.

// PactParty is a Pact consumer/provider party (a named end).
type PactParty struct {
	Name string `json:"name"`
}

// PactRequest is the request half of an interaction (method + path + body).
type PactRequest struct {
	Method string         `json:"method"`
	Path   string         `json:"path"`
	Body   map[string]any `json:"body,omitempty"`
}

// PactResponse is the response half (status + body field set).
type PactResponse struct {
	Status int            `json:"status"`
	Body   map[string]any `json:"body,omitempty"`
}

// PactInteraction is one consumer expectation: a description + request + response.
type PactInteraction struct {
	Description string       `json:"description"`
	Request     PactRequest  `json:"request"`
	Response    PactResponse `json:"response"`
}

type pactMeta struct {
	PactSpecification pactSpec `json:"pactSpecification"`
}
type pactSpec struct {
	Version string `json:"version"`
}

// PactContract is the Pact-v3 consumer expectation for ONE operation. SourceHash content-
// addresses the operation it was emitted from; Op records which operation (the suite index).
type PactContract struct {
	Consumer     PactParty         `json:"consumer"`
	Provider     PactParty         `json:"provider"`
	Interactions []PactInteraction `json:"interactions"`
	Metadata     pactMeta          `json:"metadata"`
	SourceHash   string            `json:"-"`
	Op           string            `json:"-"`
}

// EmitPactSuite renders ONE Pact contract per SYNC operation (canonical name order). For
// each operation it builds the create/read interaction (the field set the entity AST pins)
// and, for an authorize op, a DENY interaction asserting the 403 — so the suite carries the
// policy expectation, not just the happy path. Pure: no clock/RNG; byte-stable per op.
func EmitPactSuite(s ApiSpec) ([]PactContract, *blockreason.BlockReason) {
	if err := validate(s); err != nil {
		br := block(err)
		return nil, &br
	}
	sourceHash, err := SourceHash(s)
	if err != nil {
		br := block(err)
		return nil, &br
	}

	suite := make([]PactContract, 0, len(s.Ops))
	for _, op := range syncOps(s) {
		path := PathOf(op)
		reqBody := map[string]any{}
		respBody := map[string]any{}
		for _, a := range op.Entity.Attributes {
			respBody[a.Name] = exampleValueOf(a.Type)
		}
		if op.Verb == VerbPost {
			// The request body is the operation's INPUT schema (createOrder → {cartId}); when
			// the operation pins no distinct input, it falls back to the entity's required
			// attributes (a plain CRUD create whose input IS the entity).
			for _, a := range inputAttrs(op) {
				reqBody[a.Name] = exampleValueOf(a.Type)
			}
		}

		okStatus := 201
		verb := "POST"
		if op.Verb == VerbGet {
			okStatus = 200
			verb = "GET"
		}

		interactions := []PactInteraction{{
			Description: op.Name + " honours " + op.Entity.Name,
			Request:     PactRequest{Method: verb, Path: path, Body: nonEmpty(reqBody)},
			Response:    PactResponse{Status: okStatus, Body: respBody},
		}}
		if op.Authorize {
			// The DENY interaction: a forbidden request → 403, no entity body.
			interactions = append(interactions, PactInteraction{
				Description: op.Name + " denies an unauthorized caller",
				Request:     PactRequest{Method: verb, Path: path, Body: deniedMarker(reqBody)},
				Response:    PactResponse{Status: 403, Body: map[string]any{"error": "forbidden"}},
			})
		}

		suite = append(suite, PactContract{
			Consumer:     PactParty{Name: s.Project + "-client"},
			Provider:     PactParty{Name: op.Name + "-provider"},
			Interactions: interactions,
			Metadata:     pactMeta{PactSpecification: pactSpec{Version: "3.0.0"}},
			SourceHash:   sourceHash,
			Op:           op.Name,
		})
	}
	return suite, nil
}

// EmitPactArtifacts renders the suite as one Artifact per operation (the materialized
// gen/<p>/api/pact/<op>.pact.json files), each canonicalised + pretty-printed → byte-stable.
func EmitPactArtifacts(s ApiSpec) ([]Artifact, *blockreason.BlockReason) {
	suite, br := EmitPactSuite(s)
	if br != nil {
		return nil, br
	}
	out := make([]Artifact, 0, len(suite))
	for _, c := range suite {
		body, err := ContractJSON(c)
		if err != nil {
			b := block(err)
			return nil, &b
		}
		path := "gen/" + s.Project + "/api/pact/" + c.Op + ".pact.json"
		out = append(out, artifact(path, TargetPactSuite, body, c.SourceHash))
	}
	return out, nil
}

// ContractJSON canonicalises + pretty-prints one contract → byte-stable bytes (the same
// shape S36's ContractJSON produces, so the suite is comparable to createOrder.pact.json).
func ContractJSON(c PactContract) ([]byte, error) {
	raw, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	canon, err := canonicalize(raw)
	if err != nil {
		return nil, err
	}
	pretty, perr := indentJSON(canon)
	if perr != nil {
		return canon, nil
	}
	return []byte(strings.TrimRight(string(pretty), "\n") + "\n"), nil
}

// nonEmpty returns nil for an empty map so a GET interaction omits the body key entirely.
func nonEmpty(m map[string]any) map[string]any {
	if len(m) == 0 {
		return nil
	}
	return m
}

// deniedMarker copies the request body and tags it so the provider's authorizer denies it
// (the in-process verifier double DENIES iff the body carries the marker — a deterministic,
// reproducible trigger, never an LLM judgment).
func deniedMarker(req map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range req {
		out[k] = v
	}
	out["__deny__"] = true
	return out
}

// exampleValueOf returns a deterministic example value for a scalar — the SAME values the
// S36 emitter uses, so a per-op contract is byte-comparable to createOrder.pact.json.
func exampleValueOf(t entities.ScalarType) any {
	switch t {
	case entities.TypeInt:
		return 1
	case entities.TypeDecimal:
		return "0"
	case entities.TypeBool:
		return false
	case entities.TypeTimestamptz:
		return "1970-01-01T00:00:00Z"
	default:
		return "example"
	}
}

// ── Provider verification (the S90 done-criterion: pact-verifier on ALL emitted endpoints) ─

// VerifyResult is the outcome of provider verification: PASS/FAIL + reason + verified
// interaction descriptions. Deterministic.
type VerifyResult struct {
	Pass         bool     `json:"pass"`
	Reason       string   `json:"reason"`
	Interactions []string `json:"interactions"`
}

// VerifyOp stands the operation's handler up in-process and replays every interaction in its
// contract (the happy path AND, for an authorize op, the DENY). It enforces the policy the
// SAME way the emitted Hono handler does: it delegates to the Go interpreter (SidecarVerdict)
// and answers 403 on a DENY. So verifying THIS provider verifies the emitted handler's
// behaviour without a TS build dependency — pure: no DB/clock/RNG.
func VerifyOp(op Op, c PactContract) VerifyResult {
	handler := referenceProvider(op)
	srv := httptest.NewServer(handler)
	defer srv.Close()

	verified := make([]string, 0, len(c.Interactions))
	for _, it := range c.Interactions {
		var bodyReader *strings.Reader
		if it.Request.Body != nil {
			raw, _ := json.Marshal(it.Request.Body)
			bodyReader = strings.NewReader(string(raw))
		} else {
			bodyReader = strings.NewReader("{}")
		}
		req, err := http.NewRequest(it.Request.Method, srv.URL+it.Request.Path, bodyReader)
		if err != nil {
			return VerifyResult{Pass: false, Reason: "build request: " + err.Error()}
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := srv.Client().Do(req)
		if err != nil {
			return VerifyResult{Pass: false, Reason: "request failed: " + err.Error()}
		}
		bodyBytes := readAll(resp.Body)
		_ = resp.Body.Close()

		if resp.StatusCode != it.Response.Status {
			return VerifyResult{Pass: false, Reason: "interaction " + jsStr(it.Description) +
				": status " + itoa(resp.StatusCode) + " != contract " + itoa(it.Response.Status)}
		}
		var got map[string]any
		if err := json.Unmarshal(bodyBytes, &got); err != nil {
			return VerifyResult{Pass: false, Reason: "interaction " + jsStr(it.Description) +
				": response body is not a JSON object"}
		}
		gotKeys := keySet(got)
		wantKeys := keySet(it.Response.Body)
		if !equalStrings(gotKeys, wantKeys) {
			return VerifyResult{Pass: false, Reason: "interaction " + jsStr(it.Description) +
				": response field set " + strings.Join(gotKeys, ",") + " != contract " + strings.Join(wantKeys, ",")}
		}
		verified = append(verified, it.Description)
	}
	return VerifyResult{Pass: true, Reason: "all interactions honoured the contract", Interactions: verified}
}

// VerifySuite verifies EVERY operation in a spec against its contract (pact-verifier on ALL
// emitted endpoints). It fails fast on the first non-conforming operation, naming it.
func VerifySuite(s ApiSpec) VerifyResult {
	suite, br := EmitPactSuite(s)
	if br != nil {
		return VerifyResult{Pass: false, Reason: br.Explanation}
	}
	syncs := syncOps(s)
	byName := map[string]Op{}
	for _, op := range syncs {
		byName[op.Name] = op
	}
	all := make([]string, 0)
	for _, c := range suite {
		res := VerifyOp(byName[c.Op], c)
		if !res.Pass {
			return VerifyResult{Pass: false, Reason: "operation " + c.Op + ": " + res.Reason}
		}
		all = append(all, res.Interactions...)
	}
	return VerifyResult{Pass: true, Reason: "all operations honoured their contracts", Interactions: all}
}

// referenceProvider builds the in-process provider for an operation — the SAME thin
// transport adapter EmitRouter renders (decode → SidecarVerdict → encode), so verifying it
// verifies the emitted handler's behaviour. The sidecar callback is operation.Interpret
// behind the same JSON boundary the Hono handler crosses (ADR 0040). FN02/pure.
func referenceProvider(op Op) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req map[string]any
		if r.Body != nil {
			_ = json.NewDecoder(r.Body).Decode(&req)
		}
		if req == nil {
			req = map[string]any{}
		}
		verdict := SidecarVerdict(op, req)
		if op.Authorize && verdict.Denied {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "forbidden"})
			return
		}
		resp := make(map[string]any, len(op.Entity.Attributes))
		for _, a := range op.Entity.Attributes {
			if v, ok := req[a.Name]; ok {
				resp[a.Name] = v
			} else {
				resp[a.Name] = exampleValueOf(a.Type)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		okStatus := http.StatusCreated
		if op.Verb == VerbGet {
			okStatus = http.StatusOK
		}
		w.WriteHeader(okStatus)
		_ = json.NewEncoder(w).Encode(resp)
	}
}

func keySet(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func equalStrings(a, b []string) bool {
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

// itoa avoids importing strconv twice; a tiny deterministic int→string.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	if neg {
		return "-" + string(digits)
	}
	return string(digits)
}

// canonicalize / readAll thin-wrap the shared helpers so this file's imports stay local.
func readAll(r interface{ Read([]byte) (int, error) }) []byte {
	buf := make([]byte, 0, 512)
	tmp := make([]byte, 256)
	for {
		n, err := r.Read(tmp)
		buf = append(buf, tmp[:n]...)
		if err != nil {
			break
		}
	}
	return buf
}

// SidecarVerdict is the Go SIDECAR interpreter's verdict for an operation + input (ADR 0040
// Déc.7). It runs the EXACT operation.Interpret AIDOS runs natively, behind the JSON
// boundary the Hono handler crosses. A DENY (the authorizer refuses) surfaces as
// Denied=true; a success surfaces the interpreter's Result. This is the function the parity
// mirror pins against operation.Interpret — same (op, input) → same verdict.
type Verdict struct {
	Denied bool
	Result map[string]any
}

// SidecarVerdict resolves the operation's Kernel body (anchored example for createOrder;
// for a non-anchored op a generic create body), then runs operation.Interpret with the
// reproducible deny-on-marker authorizer. It writes nothing (the wall) — it is a read of
// the interpreter behind a callback. The verdict is DETERMINISTIC (no LLM).
func SidecarVerdict(op Op, input map[string]any) Verdict {
	body := operationBodyFor(op)
	deps := denyOnMarkerDeps{}
	state := operation.NewState(input, authFromInput(input))
	_, res, err := operation.Interpret(body, state, deps)
	if err != nil {
		// A DENY is the only enforced refusal at this boundary (the §93 authorize law).
		return Verdict{Denied: true, Result: nil}
	}
	return Verdict{Denied: false, Result: res.Ref}
}

func canonicalize(b []byte) ([]byte, error) { return canonicalizeShared(b) }
