package telemetrysink

import (
	"encoding/json"
	"errors"
	"testing"
	"time"
)

// A representative OTLP/HTTP-JSON trace export (the shape the emitted Hono app's
// instrumentation.ts → collector → otlphttp(json) exporter actually emits): one resource
// (service.name=nouveau) with two spans, one OK one ERROR, with span attributes.
const fixtureExport = `{
  "resourceSpans": [{
    "resource": { "attributes": [
      { "key": "service.name", "value": { "stringValue": "nouveau" } }
    ]},
    "scopeSpans": [{
      "spans": [
        {
          "traceId": "5b8aa5a2d2c872e8321cf37308d69df2",
          "spanId": "051581bf3cb55c13",
          "name": "GET /",
          "startTimeUnixNano": "1718000000000000000",
          "endTimeUnixNano": "1718000000005000000",
          "status": { "code": "STATUS_CODE_OK" },
          "attributes": [ { "key": "http.method", "value": { "stringValue": "GET" } } ]
        },
        {
          "traceId": "5b8aa5a2d2c872e8321cf37308d69df2",
          "spanId": "051581bf3cb55c14",
          "name": "GET /entities/page",
          "startTimeUnixNano": "1718000000010000000",
          "endTimeUnixNano": "1718000000020000000",
          "status": { "code": "STATUS_CODE_ERROR" },
          "attributes": [ { "key": "http.status_code", "value": { "intValue": "500" } } ]
        }
      ]
    }]
  }]
}`

func TestDecode_FixtureExport(t *testing.T) {
	rows, err := Decode([]byte(fixtureExport))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("want 2 rows, got %d", len(rows))
	}
	r0 := rows[0]
	if r0.TraceID != "5b8aa5a2d2c872e8321cf37308d69df2" || r0.SpanID != "051581bf3cb55c13" {
		t.Errorf("row0 ids wrong: %+v", r0)
	}
	if r0.Name != "GET /" || r0.Status != "ok" {
		t.Errorf("row0 name/status wrong: %q / %q", r0.Name, r0.Status)
	}
	// resource attr (service.name) merged in + span attr present.
	if r0.Attributes["service.name"] != "nouveau" || r0.Attributes["http.method"] != "GET" {
		t.Errorf("row0 attrs wrong: %v", r0.Attributes)
	}
	if !r0.StartedAt.Equal(time.Unix(0, 1718000000000000000).UTC()) {
		t.Errorf("row0 started_at wrong: %v", r0.StartedAt)
	}
	if rows[1].Status != "error" || rows[1].Attributes["http.status_code"] != "500" {
		t.Errorf("row1 wrong: %+v", rows[1])
	}
}

func TestDecode_Deterministic(t *testing.T) {
	a, err1 := Decode([]byte(fixtureExport))
	b, err2 := Decode([]byte(fixtureExport))
	if err1 != nil || err2 != nil {
		t.Fatalf("decode errs: %v %v", err1, err2)
	}
	if len(a) != len(b) {
		t.Fatalf("len mismatch")
	}
	for i := range a {
		if a[i].TraceID != b[i].TraceID || a[i].SpanID != b[i].SpanID || a[i].Name != b[i].Name ||
			a[i].Status != b[i].Status || !a[i].StartedAt.Equal(b[i].StartedAt) {
			t.Fatalf("non-deterministic at %d: %+v vs %+v", i, a[i], b[i])
		}
	}
}

func TestDecode_FailClosed(t *testing.T) {
	cases := map[string]string{
		"missing traceId": `{"resourceSpans":[{"scopeSpans":[{"spans":[{"spanId":"a","name":"x","startTimeUnixNano":"1","endTimeUnixNano":"2"}]}]}]}`,
		"missing name":    `{"resourceSpans":[{"scopeSpans":[{"spans":[{"traceId":"t","spanId":"a","startTimeUnixNano":"1","endTimeUnixNano":"2"}]}]}]}`,
		"bad timestamp":   `{"resourceSpans":[{"scopeSpans":[{"spans":[{"traceId":"t","spanId":"a","name":"x","startTimeUnixNano":"NaN","endTimeUnixNano":"2"}]}]}]}`,
		"malformed json":  `{not json`,
	}
	for label, body := range cases {
		if _, err := Decode([]byte(body)); err == nil {
			t.Errorf("%s: expected fail-closed error, got nil", label)
		}
	}
}

func TestDecode_EmptyIsNoSpans(t *testing.T) {
	if _, err := Decode([]byte(`{"resourceSpans":[]}`)); !errors.Is(err, ErrNoSpans) {
		t.Errorf("empty export: want ErrNoSpans, got %v", err)
	}
}

func TestStatusOf(t *testing.T) {
	// Accept the enum as a NAME string, a quoted/unquoted NUMBER (otelcol emits 1/2), or absent.
	for code, want := range map[string]string{
		`"STATUS_CODE_OK"`: "ok", `"STATUS_CODE_ERROR"`: "error", ``: "unset",
		`"STATUS_CODE_UNSET"`: "unset", `1`: "ok", `2`: "error", `0`: "unset",
	} {
		if got := statusOf(json.RawMessage(code)); got != want {
			t.Errorf("statusOf(%q) = %q, want %q", code, got, want)
		}
	}
}
