package backtestersrv

import (
	"context"
	"testing"
)

// MCP behaviour mirror: the backtester evaluates OUT-OF-SAMPLE only (§87) and returns
// the green/red reading the promotion gate consumes. It never defines the fitness.

func TestBacktest_OutOfSampleGreenAboveBar(t *testing.T) {
	s := newServer()
	_, out, _ := s.backtestOutOfSample(context.Background(), nil, backtestInput{VariantID: "var-7", InSample: false, Score: 0.7})
	if out.Verdict != "green" {
		t.Fatalf("score 0.7 (bar %.2f) = %q, want green", out.Bar, out.Verdict)
	}
}

func TestBacktest_OutOfSampleRedBelowBar(t *testing.T) {
	s := newServer()
	_, out, _ := s.backtestOutOfSample(context.Background(), nil, backtestInput{VariantID: "var-3", InSample: false, Score: 0.2})
	if out.Verdict != "red" {
		t.Fatalf("score 0.2 = %q, want red", out.Verdict)
	}
}

// In-sample is refused — out-of-sample is the only honest signal (§87).
func TestBacktest_InSampleRefused(t *testing.T) {
	s := newServer()
	_, out, _ := s.backtestOutOfSample(context.Background(), nil, backtestInput{VariantID: "var-x", InSample: true, Score: 0.99})
	if out.Verdict != "red" {
		t.Fatalf("in-sample = %q, want red (refused)", out.Verdict)
	}
	if out.Reason == "" {
		t.Fatal("in-sample refusal carried no reason")
	}
}

func TestBacktest_Get(t *testing.T) {
	s := newServer()
	s.backtestOutOfSample(context.Background(), nil, backtestInput{VariantID: "var-7", Score: 0.7})
	_, out, _ := s.backtestGet(context.Background(), nil, getInput{VariantID: "var-7"})
	if out.Verdict != "green" {
		t.Fatalf("get var-7 = %q, want green", out.Verdict)
	}
}

func TestBacktesterRegistersTools(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("nil MCP server")
	}
}
