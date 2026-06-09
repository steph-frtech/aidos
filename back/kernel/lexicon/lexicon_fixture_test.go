package lexicon

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// FK14 fixture mirror — the worked FKE-21 example (ReturnRequest named across the 16 layers), the
// inter-layer linter, and the storage fork (content-addressed kernel.link round-trip). The judge is
// a deterministic set-membership check (string equality over a closed layer set), never a prompt.

// returnRequest is the FKE-21 worked example: the concept ReturnRequest named across the layers.
func returnRequest() LexiconKernel {
	return LexiconKernel{
		Concept: "ReturnRequest",
		Symbols: map[Layer]string{
			LayerHuman:  "demande de retour",
			LayerBDD:    "create_return_request",
			LayerCode:   "createReturnRequest",
			LayerTest:   "create_return_request_should_create_pending_return",
			LayerDB:     "return_requests",
			LayerAPI:    "POST /return-requests",
			LayerEvent:  "ReturnRequestCreated",
			LayerMetric: "return_request_created_total",
			LayerMCP:    "returns.create_return_request",
			LayerSkill:  "analyze_return_request",
			LayerAgent:  "return_request_agent",
			LayerCI:     "test_return_request_kernel",
			LayerPolicy: "return_request_access_policy",
		},
	}
}

// 1. A concept fully in lexicon — every observation matches the pinned symbol → no drift (green).
func TestLint_AllInLexicon_NoDrift(t *testing.T) {
	k := returnRequest()
	obs := []Observation{
		{Layer: LayerDB, Symbol: "return_requests"},
		{Layer: LayerCode, Symbol: "createReturnRequest"},
		{Layer: LayerEvent, Symbol: "ReturnRequestCreated"},
		{Layer: LayerMetric, Symbol: "return_request_created_total"},
	}
	if d := Lint(k, obs); len(d) != 0 {
		t.Fatalf("expected no drift for in-lexicon observations, got %+v", d)
	}
	if !Clean(k, obs) {
		t.Fatal("Clean should be true when all observations are in lexicon")
	}
}

// 2. THE FK14 FAULT-INJECTION: rename a DB table out of lexicon → exactly one RENAMED drift (red).
func TestLint_RenameTableOutOfLexicon_IsRed(t *testing.T) {
	k := returnRequest()
	obs := []Observation{
		{Layer: LayerDB, Symbol: "orders_returns"}, // renamed away from return_requests
	}
	d := Lint(k, obs)
	if len(d) != 1 {
		t.Fatalf("expected exactly 1 drift for a renamed table, got %d: %+v", len(d), d)
	}
	if d[0].Kind != DriftRenamed {
		t.Fatalf("expected DriftRenamed, got %s", d[0].Kind)
	}
	if d[0].Layer != LayerDB || d[0].Symbol != "orders_returns" || d[0].Expected != "return_requests" {
		t.Fatalf("drift mis-shaped: %+v", d[0])
	}
	if Clean(k, obs) {
		t.Fatal("Clean must be false on a renamed table (the fault-injection is red)")
	}
}

// 3. A symbol observed in an UNKNOWN layer is itself a drift (UNKNOWN_LAYER).
func TestLint_UnknownLayer_IsDrift(t *testing.T) {
	k := returnRequest()
	obs := []Observation{{Layer: "frobnicate", Symbol: "whatever"}}
	d := Lint(k, obs)
	if len(d) != 1 || d[0].Kind != DriftUnknownLayer {
		t.Fatalf("expected one UNKNOWN_LAYER drift, got %+v", d)
	}
}

// 4. The lexicon pins NO symbol for the concept in a (known) layer → UNKNOWN_SYMBOL (not a free pass).
func TestLint_LayerNotNamedInLexicon_IsUnknownSymbol(t *testing.T) {
	k := returnRequest() // does not pin LayerLog or LayerDoc
	obs := []Observation{{Layer: LayerLog, Symbol: "return_request.created"}}
	d := Lint(k, obs)
	if len(d) != 1 || d[0].Kind != DriftUnknownSymbol {
		t.Fatalf("expected one UNKNOWN_SYMBOL drift, got %+v", d)
	}
	if d[0].Expected != "" {
		t.Fatalf("UNKNOWN_SYMBOL must carry no expected symbol, got %q", d[0].Expected)
	}
}

// 5. Multiple drifts come back in a STABLE order (layer canonical index, then symbol).
func TestLint_DriftOrder_IsStable(t *testing.T) {
	k := returnRequest()
	obs := []Observation{
		{Layer: LayerMetric, Symbol: "z_metric"}, // metric is index 8
		{Layer: LayerCode, Symbol: "doStuff"},    // code is index 2
		{Layer: LayerCode, Symbol: "aaa"},        // code, earlier symbol
	}
	d := Lint(k, obs)
	if len(d) != 3 {
		t.Fatalf("expected 3 drifts, got %d", len(d))
	}
	if d[0].Layer != LayerCode || d[0].Symbol != "aaa" {
		t.Fatalf("drift[0] should be code/aaa, got %+v", d[0])
	}
	if d[1].Layer != LayerCode || d[1].Symbol != "doStuff" {
		t.Fatalf("drift[1] should be code/doStuff, got %+v", d[1])
	}
	if d[2].Layer != LayerMetric {
		t.Fatalf("drift[2] should be metric, got %+v", d[2])
	}
}

// 6. There are exactly 16 closed layers (FKE-21).
func TestLayers_AreSixteenClosed(t *testing.T) {
	ls := Layers()
	if len(ls) != 16 {
		t.Fatalf("expected 16 layers (FKE-21), got %d", len(ls))
	}
	seen := map[Layer]bool{}
	for _, l := range ls {
		if seen[l] {
			t.Fatalf("layer %q duplicated", l)
		}
		seen[l] = true
		if !IsKnownLayer(l) {
			t.Fatalf("Layers() yielded %q but IsKnownLayer rejects it", l)
		}
	}
	if IsKnownLayer("not-a-layer") {
		t.Fatal("IsKnownLayer must reject an out-of-set layer")
	}
}

// 7. Validate refuses a nameless lexicon, an unknown layer, and an empty symbol.
func TestValidate_Refusals(t *testing.T) {
	if err := Validate(LexiconKernel{Symbols: map[Layer]string{LayerCode: "x"}}); err == nil {
		t.Fatal("a nameless lexicon must be refused (NO_CONCEPT)")
	}
	if err := Validate(LexiconKernel{Concept: "C", Symbols: map[Layer]string{"bogus": "x"}}); err == nil {
		t.Fatal("a symbol under an unknown layer must be refused (UNKNOWN_LAYER)")
	}
	if err := Validate(LexiconKernel{Concept: "C", Symbols: map[Layer]string{LayerCode: ""}}); err == nil {
		t.Fatal("an empty symbol must be refused (EMPTY_SYMBOL)")
	}
	if err := Validate(returnRequest()); err != nil {
		t.Fatalf("the FKE-21 example must validate, got %v", err)
	}
}

// 8. THE STORAGE FORK (tranché ici): a lexicon is content-addressed inside a kernel.link body —
// round-trip and the record passes records.Validate; a renamed symbol yields a DIFFERENT version.
func TestRecord_ContentAddressedRoundTrip(t *testing.T) {
	k := returnRequest()
	rec, err := Record(k)
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	if rec.Kind != records.KindLink {
		t.Fatalf("lexicon must ride inside a kernel.link (the storage fork), got kind %q", rec.Kind)
	}
	if err := records.Validate(rec); err != nil {
		t.Fatalf("record must pass records.Validate (content-addressed), got %v", err)
	}
	back, err := ParseBody(rec.Body)
	if err != nil {
		t.Fatalf("ParseBody: %v", err)
	}
	if back.Concept != k.Concept || len(back.Symbols) != len(k.Symbols) {
		t.Fatalf("round-trip lost data: %+v vs %+v", back, k)
	}
	for l, sym := range k.Symbols {
		if back.Symbols[l] != sym {
			t.Fatalf("round-trip drift on layer %q: %q vs %q", l, back.Symbols[l], sym)
		}
	}

	// A renamed symbol ⇒ a NEW version (never an in-place mutation, KRD §12).
	k2 := returnRequest()
	k2.Symbols[LayerDB] = "orders_returns"
	rec2, err := Record(k2)
	if err != nil {
		t.Fatalf("Record(renamed): %v", err)
	}
	if rec2.Version == rec.Version {
		t.Fatal("a renamed symbol must yield a different content-address (a new lexicon)")
	}
}

// 9. The serialized address is independent of map iteration order (same lexicon ⇒ same address).
func TestSerializeBody_MapOrderIndependent(t *testing.T) {
	a := LexiconKernel{Concept: "C", Symbols: map[Layer]string{LayerCode: "f", LayerDB: "t", LayerAPI: "r"}}
	b := LexiconKernel{Concept: "C", Symbols: map[Layer]string{LayerAPI: "r", LayerDB: "t", LayerCode: "f"}}
	ra, err := Record(a)
	if err != nil {
		t.Fatal(err)
	}
	rb, err := Record(b)
	if err != nil {
		t.Fatal(err)
	}
	if ra.Version != rb.Version {
		t.Fatal("two lexicons with the same bindings (different map order) must share a content-address")
	}
}
