package telemetrysink

import (
	"compress/gzip"
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
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
		// OTLP/HTTP producers (the otelcol otlphttp exporter) GZIP the payload by default —
		// decompress when announced, else the JSON parse trips on the gzip magic (\x1f).
		var src io.Reader = r.Body
		if strings.EqualFold(r.Header.Get("Content-Encoding"), "gzip") {
			gz, err := gzip.NewReader(r.Body)
			if err != nil {
				http.Error(w, "bad gzip", http.StatusBadRequest)
				return
			}
			defer gz.Close()
			src = gz
		}
		body, err := io.ReadAll(io.LimitReader(src, 64<<20)) // 64 MiB decompressed ceiling
		if err != nil {
			http.Error(w, "read body", http.StatusBadRequest)
			return
		}
		if os.Getenv("AIDOS_TELEMETRY_SINK_DEBUG") == "1" {
			snip := body
			if len(snip) > 600 {
				snip = snip[:600]
			}
			log.Printf("telemetrysink: RX %d bytes: %s", len(body), snip)
		}
		rows, err := Decode(body)
		if errors.Is(err, ErrNoSpans) {
			w.WriteHeader(http.StatusOK) // a benign empty export
			return
		}
		if err != nil {
			// Log the reason + a body snippet so a producer-encoding mismatch is diagnosable
			// (the fail-closed 400 is correct; silent rejection would hide it).
			snippet := body
			if len(snippet) > 400 {
				snippet = snippet[:400]
			}
			log.Printf("telemetrysink: decode 400: %v | body: %s", err, snippet)
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
