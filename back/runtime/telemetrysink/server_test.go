package telemetrysink

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fakeSink records what it was asked to write — the handler is testable with no DB.
type fakeSink struct {
	rows []SpanRow
	err  error
}

func (f *fakeSink) Write(_ context.Context, rows []SpanRow) (int, error) {
	if f.err != nil {
		return 0, f.err
	}
	f.rows = append(f.rows, rows...)
	return len(rows), nil
}

func post(h http.Handler, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/v1/traces", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestTracesHandler_ValidPersists(t *testing.T) {
	sink := &fakeSink{}
	rr := post(NewMux(sink), fixtureExport)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	if len(sink.rows) != 2 {
		t.Fatalf("want 2 persisted spans, got %d", len(sink.rows))
	}
}

func TestTracesHandler_MalformedIs400(t *testing.T) {
	sink := &fakeSink{}
	rr := post(NewMux(sink), `{not json`)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400 on malformed, got %d", rr.Code)
	}
	if len(sink.rows) != 0 {
		t.Errorf("malformed must NOT persist anything, got %d", len(sink.rows))
	}
}

func TestTracesHandler_EmptyIs200NoWrite(t *testing.T) {
	sink := &fakeSink{}
	rr := post(NewMux(sink), `{"resourceSpans":[]}`)
	if rr.Code != http.StatusOK || len(sink.rows) != 0 {
		t.Errorf("empty export: want 200 + 0 rows, got %d / %d", rr.Code, len(sink.rows))
	}
}

func TestHealthz(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rr := httptest.NewRecorder()
	NewMux(&fakeSink{}).ServeHTTP(rr, req)
	if rr.Code != http.StatusOK || rr.Body.String() != "ok" {
		t.Errorf("healthz: got %d / %q", rr.Code, rr.Body.String())
	}
}
