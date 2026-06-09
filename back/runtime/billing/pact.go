package billing

// ── The Pact contract with the billing provider (ADR 0049) ───────────────────────────────
//
// S114 done-criterion: a Pact contract with the named billing provider (Stripe, ADR 0049),
// provider-verified. The CONSUMER is the provider's webhook sender ("stripe-webhook"); the
// PROVIDER (the party we verify) is the AIDOS billing webhook endpoint ("aidos-billing"). The
// contract pins, per inbound webhook kind, the request the provider POSTs and the 200 ack the
// endpoint returns. Provider verification stands the webhook endpoint up in-process and
// replays every interaction — so verifying THIS provider verifies the inbound handler's
// behaviour without a network dependency.
//
// The verification is DETERMINISTIC (no clock/RNG/LLM): the endpoint ingests the event through
// the SAME IngestWebhook gesture the runtime uses, idempotently, and acks 200; a malformed
// event (the DENY interaction) is refused 400. Same contract ⇒ same verification.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// PactParty is a named consumer/provider end.
type PactParty struct {
	Name string `json:"name"`
}

// PactRequest is the request half of an interaction (method + path + headers + body).
type PactRequest struct {
	Method  string         `json:"method"`
	Path    string         `json:"path"`
	Headers map[string]any `json:"headers,omitempty"`
	Body    map[string]any `json:"body,omitempty"`
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

// PactContract is the Pact-v3 consumer expectation for the billing webhook. SourceHash content-
// addresses the contract for provenance.
type PactContract struct {
	Consumer     PactParty         `json:"consumer"`
	Provider     PactParty         `json:"provider"`
	Interactions []PactInteraction `json:"interactions"`
	Metadata     pactMeta          `json:"metadata"`
	SourceHash   string            `json:"-"`
}

// ProviderName is the named billing provider (ADR 0049). Carried so the Workbench panel and
// the Pact parties never hardcode a fabricated provider.
const ProviderName = "stripe"

// WebhookPath is the inbound endpoint path the provider POSTs to.
const WebhookPath = "/billing/webhooks/" + ProviderName

// exampleEvent returns a deterministic example WebhookEvent for a kind — the same values the
// contract and the verifier use, so the suite is byte-stable.
func exampleEvent(k WebhookKind) WebhookEvent {
	e := WebhookEvent{Kind: k, ProviderID: "evt_" + string(k), Account: "acct_example"}
	if k == WebhookCheckoutCompleted || k == WebhookSubscriptionUpdated {
		e.Plan = PlanPro
	}
	return e
}

// requestBody renders the JSON body the provider POSTs for an event (the field set the
// endpoint reads). Deterministic.
func requestBody(e WebhookEvent) map[string]any {
	b := map[string]any{
		"kind":        string(e.Kind),
		"provider_id": e.ProviderID,
		"account":     e.Account,
	}
	if e.Plan != "" {
		b["plan"] = string(e.Plan)
	}
	return b
}

// EmitContract renders the Pact contract: one ACK interaction per inbound webhook kind, plus a
// single DENY interaction asserting a malformed event → 400. Pure: no clock/RNG; byte-stable.
func EmitContract() (PactContract, error) {
	interactions := make([]PactInteraction, 0, len(webhookKinds)+1)
	for _, k := range webhookKinds {
		e := exampleEvent(k)
		interactions = append(interactions, PactInteraction{
			Description: string(k) + " is acknowledged",
			Request: PactRequest{
				Method:  "POST",
				Path:    WebhookPath,
				Headers: map[string]any{"content-type": "application/json"},
				Body:    requestBody(e),
			},
			Response: PactResponse{Status: 200, Body: map[string]any{"ok": true, "event_id": "example"}},
		})
	}
	// The DENY interaction: a malformed event (unknown kind) → 400.
	interactions = append(interactions, PactInteraction{
		Description: "a malformed event is refused",
		Request: PactRequest{
			Method:  "POST",
			Path:    WebhookPath,
			Headers: map[string]any{"content-type": "application/json"},
			Body:    map[string]any{"kind": "not.a.kind", "provider_id": "evt_bad", "account": "acct_example"},
		},
		Response: PactResponse{Status: 400, Body: map[string]any{"error": "invalid_webhook"}},
	})

	c := PactContract{
		Consumer:     PactParty{Name: ProviderName + "-webhook"},
		Provider:     PactParty{Name: "aidos-billing"},
		Interactions: interactions,
		Metadata:     pactMeta{PactSpecification: pactSpec{Version: "3.0.0"}},
	}
	hash, err := contractHash(c)
	if err != nil {
		return PactContract{}, err
	}
	c.SourceHash = hash
	return c, nil
}

func contractHash(c PactContract) (string, error) {
	raw, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// ContractJSON canonicalises + pretty-prints the contract → byte-stable bytes.
func ContractJSON(c PactContract) ([]byte, error) {
	raw, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return nil, err
	}
	var pretty strings.Builder
	if err := indentInto(&pretty, canon); err != nil {
		return canon, nil
	}
	return []byte(strings.TrimRight(pretty.String(), "\n") + "\n"), nil
}

func indentInto(b *strings.Builder, canon []byte) error {
	var v any
	if err := json.Unmarshal(canon, &v); err != nil {
		return err
	}
	enc := json.NewEncoder(b)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

// ── Provider verification (the S114 done-criterion: pact-verifier on the webhook) ─────────

// VerifyResult is the outcome of provider verification: PASS/FAIL + reason + verified
// interaction descriptions. Deterministic.
type VerifyResult struct {
	Pass         bool     `json:"pass"`
	Reason       string   `json:"reason"`
	Interactions []string `json:"interactions"`
}

// referenceEndpoint builds the in-process AIDOS billing webhook endpoint — the SAME ingest the
// runtime performs: decode → IngestWebhook → 200 ack, refusing a malformed event with 400. It
// holds the ingest log in a closure (the seam), so a replay is suppressed idempotently. Pure
// (no DB/clock/RNG); the verifier replays interactions against it.
func referenceEndpoint() http.HandlerFunc {
	var log []IngestEvent
	return func(w http.ResponseWriter, r *http.Request) {
		var req map[string]any
		if r.Body != nil {
			_ = json.NewDecoder(r.Body).Decode(&req)
		}
		e := decodeEvent(req)
		next, rec, err := IngestWebhook(log, e)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "invalid_webhook"})
			return
		}
		log = next
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "event_id": rec.ID})
	}
}

// decodeEvent maps the provider's JSON body onto a WebhookEvent.
func decodeEvent(req map[string]any) WebhookEvent {
	str := func(k string) string {
		if v, ok := req[k].(string); ok {
			return v
		}
		return ""
	}
	return WebhookEvent{
		Kind:       WebhookKind(str("kind")),
		ProviderID: str("provider_id"),
		Account:    str("account"),
		Plan:       Plan(str("plan")),
	}
}

// VerifyContract stands the webhook endpoint up in-process and replays every interaction in the
// contract (the ACKs AND the DENY). It enforces the SAME ingest the runtime does. So verifying
// THIS provider verifies the inbound handler's behaviour without a network dependency — pure:
// no DB/clock/RNG/LLM.
func VerifyContract(c PactContract) VerifyResult {
	handler := referenceEndpoint()
	srv := httptest.NewServer(handler)
	defer srv.Close()

	verified := make([]string, 0, len(c.Interactions))
	for _, it := range c.Interactions {
		bodyBytes := []byte("{}")
		if it.Request.Body != nil {
			bodyBytes, _ = json.Marshal(it.Request.Body)
		}
		req, err := http.NewRequest(it.Request.Method, srv.URL+it.Request.Path, strings.NewReader(string(bodyBytes)))
		if err != nil {
			return VerifyResult{Pass: false, Reason: "build request: " + err.Error()}
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := srv.Client().Do(req)
		if err != nil {
			return VerifyResult{Pass: false, Reason: "request failed: " + err.Error()}
		}
		gotStatus := resp.StatusCode
		var got map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&got)
		_ = resp.Body.Close()

		if gotStatus != it.Response.Status {
			return VerifyResult{Pass: false, Reason: "interaction " + jsStr(it.Description) +
				": status " + itoa(gotStatus) + " != contract " + itoa(it.Response.Status)}
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

func jsStr(s string) string { return `"` + s + `"` }

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
