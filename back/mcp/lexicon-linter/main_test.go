package main

import (
	"context"
	"testing"
)

// The MCP server is the capability door over FK14 — it must build and each tool must faithfully
// relay the pure linter verdict / refusal (the wall: it adds no judgment; the judge is the
// set-membership check in back/kernel/lexicon).

func returnRequestIn() lexiconIn {
	return lexiconIn{
		Concept: "ReturnRequest",
		Symbols: []symbolIn{
			{Layer: "human", Symbol: "demande de retour"},
			{Layer: "code", Symbol: "createReturnRequest"},
			{Layer: "db", Symbol: "return_requests"},
			{Layer: "event", Symbol: "ReturnRequestCreated"},
			{Layer: "metric", Symbol: "return_request_created_total"},
		},
	}
}

func TestServerBuilds(t *testing.T) {
	if srv := newMCPServer(); srv == nil {
		t.Fatal("newMCPServer returned nil")
	}
}

func TestLint_InLexicon_Clean(t *testing.T) {
	_, out, err := lint(context.Background(), nil, lintIn{
		Lexicon:      returnRequestIn(),
		Observations: []observationIn{{Layer: "db", Symbol: "return_requests"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !out.OK || !out.Clean || len(out.Drifts) != 0 {
		t.Fatalf("expected clean, got %+v", out)
	}
}

// THE FK14 FAULT-INJECTION through the MCP: rename a table out of lexicon → RENAMED drift.
func TestLint_RenamedTable_IsRed(t *testing.T) {
	_, out, err := lint(context.Background(), nil, lintIn{
		Lexicon:      returnRequestIn(),
		Observations: []observationIn{{Layer: "db", Symbol: "orders_returns"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.Clean || len(out.Drifts) != 1 || out.Drifts[0].Kind != "RENAMED" {
		t.Fatalf("expected one RENAMED drift, got %+v", out)
	}
	if out.Drifts[0].Expected != "return_requests" {
		t.Fatalf("expected the lexicon symbol, got %q", out.Drifts[0].Expected)
	}
}

func TestLint_UnknownLayer(t *testing.T) {
	_, out, _ := lint(context.Background(), nil, lintIn{
		Lexicon:      returnRequestIn(),
		Observations: []observationIn{{Layer: "frobnicate", Symbol: "x"}},
	})
	if len(out.Drifts) != 1 || out.Drifts[0].Kind != "UNKNOWN_LAYER" {
		t.Fatalf("expected UNKNOWN_LAYER, got %+v", out)
	}
}

func TestValidate_Refusals(t *testing.T) {
	_, out, _ := validate(context.Background(), nil, lexiconIn{Symbols: []symbolIn{{Layer: "code", Symbol: "x"}}})
	if out.Valid || out.Error != "NO_CONCEPT" {
		t.Fatalf("expected NO_CONCEPT, got %+v", out)
	}
	_, out2, _ := validate(context.Background(), nil, lexiconIn{Concept: "C", Symbols: []symbolIn{{Layer: "bogus", Symbol: "x"}}})
	if out2.Valid || out2.Error != "UNKNOWN_LAYER" {
		t.Fatalf("expected UNKNOWN_LAYER, got %+v", out2)
	}
	_, out3, _ := validate(context.Background(), nil, lexiconIn{Concept: "C", Symbols: []symbolIn{{Layer: "code", Symbol: ""}}})
	if out3.Valid || out3.Error != "EMPTY_SYMBOL" {
		t.Fatalf("expected EMPTY_SYMBOL, got %+v", out3)
	}
	_, out4, _ := validate(context.Background(), nil, returnRequestIn())
	if !out4.Valid {
		t.Fatalf("the FKE-21 example must validate, got %+v", out4)
	}
}

// THE STORAGE FORK through the MCP: a lexicon serialises to a content-addressed kernel.link body;
// a renamed symbol yields a different version.
func TestSerialize_ContentAddressed(t *testing.T) {
	_, a, _ := serialize(context.Background(), nil, returnRequestIn())
	if !a.OK || a.ID == "" || a.ID != a.Version {
		t.Fatalf("expected a content-addressed body (id==version), got %+v", a)
	}
	renamed := returnRequestIn()
	renamed.Symbols[2].Symbol = "orders_returns" // db
	_, b, _ := serialize(context.Background(), nil, renamed)
	if b.Version == a.Version {
		t.Fatal("a renamed symbol must yield a different version")
	}
}

func TestLayers_AreSixteen(t *testing.T) {
	_, out, _ := layers(context.Background(), nil, struct{}{})
	if !out.OK || out.LinkKind != "lexicon" || len(out.Layers) != 16 {
		t.Fatalf("expected 16 layers + lexicon link-kind, got %+v", out)
	}
}
