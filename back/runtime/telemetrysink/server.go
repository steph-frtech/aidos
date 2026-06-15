package telemetrysink

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
)

// SpanSink is what the HTTP handler needs to persist a decoded export. The pgx Writer
// implements it; tests fake it (the handler stays testable without a DB).
type SpanSink interface {
	Write(ctx context.Context, rows []SpanRow) (int, error)
}

// TracesHandler is the OTLP/HTTP traces endpoint (POST /v1/traces): read the body, DECODE
// it (pure, fail-closed), and persist the spans. It honours the OTLP/HTTP contract enough
// for the collector's otlphttp(json) exporter: 200 on success (even for a zero-span no-op),
// 400 on a malformed export (fail-closed — the collector will retry/drop, never a silent
// half-write), 500 on a sink (DB) error.
func TracesHandler(sink SpanSink) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 16<<20)) // 16 MiB ceiling
		if err != nil {
			http.Error(w, "read body", http.StatusBadRequest)
			return
		}
		rows, err := Decode(body)
		if errors.Is(err, ErrNoSpans) {
			w.WriteHeader(http.StatusOK) // a benign empty export
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if _, err := sink.Write(r.Context(), rows); err != nil {
			log.Printf("telemetrysink: write: %v", err)
			http.Error(w, "sink write failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}

// NewMux builds the sink's HTTP mux: /v1/traces (OTLP) + /healthz (liveness).
func NewMux(sink SpanSink) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/traces", TracesHandler(sink))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "ok")
	})
	return mux
}
